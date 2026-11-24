// 끝난 세션을 서버로 자동 업로드한다 (운영 버전). 형식은 docs/SERVER.md.
// 세션은 지금처럼 먼저 태블릿(IndexedDB, SessionStore)에 저장하고, 여기서 아직 안 보낸 것을 오래된 것부터 하나씩 보낸다.
// 서버가 2xx 로 답한 것만 '보냄'으로 적는다. 실패하면 멈췄다가 30초 → 1분 → 2분 … (최대 10분) 뒤 다시 시도하고,
// 인터넷이 다시 연결될 때와 5분마다도 다시 본다. 그래서 와이파이가 끊겨도 세션을 잃지 않는다.
// 응답이 오기 전에 연결이 끊기면 같은 세션을 한 번 더 보낼 수 있으므로, 서버는 meta.device + meta.id 로 덮어써야 한다.
import { SESSION_UPLOAD } from './config.js';
import { SessionStore } from './session-log.js';

export const SessionUpload = {
  KEY: 'exergame.upload',
  RETRY_MIN_SEC: 30,
  RETRY_MAX_SEC: 600,
  CHECK_SEC: 300,
  TIMEOUT_MS: 60000,

  busy: false,
  again: false,
  failures: 0,
  timer: null,
  started: false,
  state: { pending: null, sent: 0, lastOk: null, lastError: null, retryAt: null },
  onChange: null, // (state) 운영 메뉴 표시용
  changed: new Set(), // 보내는 동안 고쳐진 세션 (resend). 다 보낸 뒤 한 번 더 보낸다

  // 이미 저장(SessionStore.put)한 세션을 고쳐 다시 저장했을 때 부른다. 서버는 device + id 로 덮어쓴다.
  // 그 세션을 지금 보내는 중이면 고치기 전 것이 갔을 수 있으므로, 끝난 뒤 '보냄' 표시를 다시 지운다 (kick)
  async resend(id) {
    this.changed.add(id);
    await SessionStore.unmarkUploaded(id);
    this.kick();
  },

  // 칸마다: 운영 메뉴에 적은 값이 있으면 그것, 비어 있으면 js/config.js 의 SESSION_UPLOAD
  settings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch { /* 저장된 값이 없으면 기본값 */ }
    return {
      url: (saved.url || SESSION_UPLOAD.url || '').trim(),
      key: saved.key || SESSION_UPLOAD.key || '',
      historyUrl: (saved.historyUrl || SESSION_UPLOAD.historyUrl || '').trim(),
      localHistory: 'localHistory' in saved ? !!saved.localHistory : !!SESSION_UPLOAD.localHistory,
    };
  },

  // 기본값(SESSION_UPLOAD)과 다른 칸만 태블릿에 저장한다. 그래야 기본값을 고쳐 배포하면 따로 바꾸지 않은 태블릿이 새 값을 따른다
  setSettings({ url, key, historyUrl = '', localHistory = !!SESSION_UPLOAD.localHistory }) {
    const own = {};
    if (url.trim() && url.trim() !== SESSION_UPLOAD.url) own.url = url.trim();
    if (key && key !== SESSION_UPLOAD.key) own.key = key;
    if (historyUrl.trim() && historyUrl.trim() !== (SESSION_UPLOAD.historyUrl || '')) own.historyUrl = historyUrl.trim();
    if (!!localHistory !== !!SESSION_UPLOAD.localHistory) own.localHistory = !!localHistory;
    try {
      if (Object.keys(own).length) localStorage.setItem(this.KEY, JSON.stringify(own));
      else localStorage.removeItem(this.KEY);
    } catch { /* 저장 못 해도 이번 실행에는 쓴다 */ }
    this.failures = 0;
    this.kick();
  },

  init() {
    if (this.started) return;
    this.started = true;
    window.addEventListener('online', () => this.kick());
    setInterval(() => this.kick(), this.CHECK_SEC * 1000);
    this.kick();
  },

  async pending() {
    const [all, done] = await Promise.all([SessionStore.keys(), SessionStore.uploadedKeys()]);
    const sent = new Set(done);
    return all.filter((sessionId) => !sent.has(sessionId)).sort();
  },

  // 아직 안 보낸 세션을 보낸다. 보내는 중에 불리면 끝난 뒤 한 번 더 돈다
  async kick() {
    if (this.busy) {
      this.again = true;
      return;
    }
    clearTimeout(this.timer);
    this.state.retryAt = null;
    const { url, key } = this.settings();
    if (!url) return this.refresh();
    this.busy = true;
    try {
      for (const id of await this.pending()) {
        this.changed.delete(id); // 읽기 전에 지운다: 읽은 뒤에 고쳐지면 아래에서 다시 보낸다
        const log = await SessionStore.get(id);
        if (!log) continue;
        await this.send(url, key, log);
        await SessionStore.markUploaded(id);
        if (this.changed.has(id)) {
          await SessionStore.unmarkUploaded(id);
          this.again = true;
        }
        this.failures = 0;
        this.state.sent++;
        this.state.lastOk = new Date();
        this.state.lastError = null;
        this.refresh();
      }
    } catch (error) {
      this.failures++;
      this.state.lastError = error.message || String(error);
      const retrySec = Math.min(this.RETRY_MAX_SEC, this.RETRY_MIN_SEC * 2 ** (this.failures - 1));
      this.state.retryAt = new Date(Date.now() + retrySec * 1000);
      this.timer = setTimeout(() => this.kick(), retrySec * 1000);
    } finally {
      this.busy = false;
      await this.refresh();
      if (this.again) {
        this.again = false;
        this.kick();
      }
    }
  },

  async send(url, key, log) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;
    try {
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(log), signal: controller.signal });
      if (!response.ok) throw new Error(`서버 응답 ${response.status}`);
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('시간 초과');
      // 주소가 틀렸거나, 인터넷이 없거나, 서버가 이 사이트(CORS)를 허락하지 않은 경우 브라우저는 이유를 알려 주지 않는다
      if (error instanceof TypeError) throw new Error('연결 실패 (인터넷·주소·CORS 확인)');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  },

  async refresh() {
    try {
      this.state.pending = (await this.pending()).length;
    } catch {
      this.state.pending = null;
    }
    if (this.onChange) this.onChange(this.state, this.settings());
  },

  // 운영 메뉴에 보일 한 줄
  describe(state = this.state, { url } = this.settings()) {
    if (!url) return '꺼짐';
    const clockTime = (date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    const parts = [this.busy ? '보내는 중' : state.pending == null ? '' : state.pending ? `남은 세션 ${state.pending}건` : '모두 보냄'];
    if (state.lastOk) parts.push(`마지막 성공 ${clockTime(state.lastOk)}`);
    if (state.lastError) parts.push(`실패: ${state.lastError}${state.retryAt ? ` · ${clockTime(state.retryAt)}에 다시 시도` : ''}`);
    return parts.filter(Boolean).join(' · ');
  },
};
