// 끝난 세션을 서버로 자동 업로드한다 (시연·운영 버전). 형식은 docs/SESSION_LOG.md '업로드'.
// 세션은 지금처럼 먼저 태블릿(IndexedDB, SessionStore)에 저장하고, 여기서 아직 안 보낸 것을 오래된 것부터 하나씩 보낸다.
// 서버가 2xx 로 답한 것만 '보냄'으로 적는다. 실패하면 멈췄다가 30초 → 1분 → 2분 … (최대 10분) 뒤 다시 시도하고,
// 인터넷이 다시 연결될 때와 5분마다도 다시 본다. 그래서 와이파이가 끊겨도 세션을 잃지 않는다.
// 응답이 오기 전에 연결이 끊기면 같은 세션을 한 번 더 보낼 수 있으므로, 서버는 meta.device + meta.id 로 덮어써야 한다.
const SessionUpload = {
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

  // 운영 메뉴에 적은 값이 있으면 그것, 없으면 js/config.js 의 SESSION_UPLOAD
  settings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch (e) { }
    return { url: (saved.url ?? SESSION_UPLOAD.url ?? '').trim(), key: saved.key ?? SESSION_UPLOAD.key ?? '' };
  },

  setSettings({ url, key }) {
    try { localStorage.setItem(this.KEY, JSON.stringify({ url: url.trim(), key })); } catch (e) { }
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
    return all.filter((k) => !sent.has(k)).sort();
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
        const rec = await SessionStore.get(id);
        if (!rec) continue;
        await this.send(url, key, rec);
        await SessionStore.markUploaded(id);
        this.failures = 0;
        this.state.sent++;
        this.state.lastOk = new Date();
        this.state.lastError = null;
        this.refresh();
      }
    } catch (e) {
      this.failures++;
      this.state.lastError = e.message || String(e);
      const sec = Math.min(this.RETRY_MAX_SEC, this.RETRY_MIN_SEC * 2 ** (this.failures - 1));
      this.state.retryAt = new Date(Date.now() + sec * 1000);
      this.timer = setTimeout(() => this.kick(), sec * 1000);
    } finally {
      this.busy = false;
      await this.refresh();
      if (this.again) {
        this.again = false;
        this.kick();
      }
    }
  },

  async send(url, key, rec) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.TIMEOUT_MS);
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(rec), signal: ctrl.signal });
      if (!res.ok) throw new Error(`서버 응답 ${res.status}`);
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('시간 초과');
      // 주소가 틀렸거나, 인터넷이 없거나, 서버가 이 사이트(CORS)를 허락하지 않은 경우 브라우저는 이유를 알려 주지 않는다
      if (e instanceof TypeError) throw new Error('연결 실패 (인터넷·주소·CORS 확인)');
      throw e;
    } finally {
      clearTimeout(t);
    }
  },

  async refresh() {
    try {
      this.state.pending = (await this.pending()).length;
    } catch (e) {
      this.state.pending = null;
    }
    if (this.onChange) this.onChange(this.state, this.settings());
  },

  // 운영 메뉴에 보일 한 줄
  describe(state = this.state, { url } = this.settings()) {
    if (!url) return '꺼짐';
    const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const parts = [this.busy ? '보내는 중' : state.pending == null ? '' : state.pending ? `남은 세션 ${state.pending}건` : '모두 보냄'];
    if (state.lastOk) parts.push(`마지막 성공 ${hm(state.lastOk)}`);
    if (state.lastError) parts.push(`실패: ${state.lastError}${state.retryAt ? ` · ${hm(state.retryAt)}에 다시 시도` : ''}`);
    return parts.filter(Boolean).join(' · ');
  },
};
