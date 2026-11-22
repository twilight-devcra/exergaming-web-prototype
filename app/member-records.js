// 회원 번호와 기록 (운영 버전만). 화면은 app/members.js, QR 은 app/qr.js.
//  - 회원 번호: 8자리 숫자 (앞 7자리 무작위 + 끝 1자리 검사 숫자, Luhn). 이름 같은 개인 정보는 받지 않는다
//  - 기록: 이 태블릿의 localStorage (exergame.members). 다른 태블릿에서 만든 번호로 들어와도 되지만 기록은 태블릿마다 따로다.
//    세션 로그에는 meta.user 로 번호가 붙어 업로드되므로, 바깥 DB 에서 모으면 태블릿을 넘어 이어 볼 수 있다
//  - 서버 기록: SESSION_UPLOAD.historyUrl 에서 받아 이 태블릿 기록과 합친다 (merged)
import { Stars } from '../js/stars.js';
import { SessionStore } from '../js/session-log.js';
import { SessionUpload } from '../js/session-upload.js';
import { summarize, cleanEntry } from '../js/history-entry.js';

export const Members = {
  KEY: 'exergame.members',

  // ---------------- 번호 ----------------
  luhn(body) {
    let sum = 0;
    for (let i = 0; i < body.length; i++) {
      let digit = +body[body.length - 1 - i];
      if (i % 2 === 0) { digit *= 2; if (digit > 9) digit -= 9; }
      sum += digit;
    }
    return String((10 - (sum % 10)) % 10);
  },

  newId() {
    const random = new Uint32Array(1);
    let id;
    do {
      crypto.getRandomValues(random);
      const body = String(1000000 + (random[0] % 9000000)); // 7자리, 0 으로 시작하지 않게
      id = body + this.luhn(body);
    } while (this.all()[id]);
    return id;
  },

  valid(id) {
    return /^[1-9]\d{7}$/.test(id) && this.luhn(id.slice(0, 7)) === id[7];
  },

  format(id) {
    return `${id.slice(0, 4)} ${id.slice(4)}`;
  },

  // QR 내용이나 입력에서 회원 번호를 찾는다 (카드 주소 #번호, 띄어 쓴 번호 모두)
  parse(text) {
    for (const match of String(text).matchAll(/(\d{4})[\s-]?(\d{4})/g)) {
      const id = match[1] + match[2];
      if (this.valid(id)) return id;
    }
    return null;
  },

  cardUrl(id) {
    return new URL(`card.html#${id}`, location.href).href;
  },

  // ---------------- 기록 (이 태블릿) ----------------
  all() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch { return {}; }
  },

  save(all) {
    try { localStorage.setItem(this.KEY, JSON.stringify(all)); } catch { }
  },

  ensure(id) {
    const all = this.all();
    if (!all[id]) {
      all[id] = { created: new Date().toISOString(), history: [] };
      this.save(all);
    }
    return all[id];
  },

  record(id, entry) {
    const all = this.all();
    const member = all[id] || (all[id] = { created: new Date().toISOString(), history: [] });
    member.history.push(entry);
    member.history = member.history.slice(-500);
    this.save(all);
  },

  history(id) {
    return (this.all()[id] || { history: [] }).history;
  },

  // ---------------- 서버의 회원 기록 (SESSION_UPLOAD.historyUrl) ----------------
  // GET <historyUrl>?user=<번호> → { sessions: [...] } 또는 배열. 항목의 필드와 형은 js/history-entry.js (docs/SERVER.md).
  // 받은 항목은 cleanEntry 로 형을 맞춘다: 서버 기록은 누구나 올린 세션에서 나오므로 그대로 화면에 그리지 않는다
  remote: {},      // 회원 번호 → 서버에서 받은 목록 (이 화면을 여는 동안만)
  TIMEOUT_MS: 6000,

  // 서버 기록을 받아 올 곳이 있는가 (회원 기록 주소, 또는 시험용 로컬 서버)
  hasRemote() {
    const { historyUrl, localHistory } = SessionUpload.settings();
    return !!(localHistory || historyUrl);
  },

  async fetchRemote(id) {
    const { historyUrl, key, localHistory } = SessionUpload.settings();
    if (localHistory) return (this.remote[id] = await this.localServer(id));
    if (!historyUrl) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
    try {
      const url = new URL(historyUrl, location.href);
      url.searchParams.set('user', id);
      const response = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: controller.signal });
      if (!response.ok) throw new Error(`서버 응답 ${response.status}`);
      const body = await response.json();
      const raw = Array.isArray(body) ? body : (body && body.sessions) || [];
      const list = (Array.isArray(raw) ? raw : []).map(cleanEntry).filter(Boolean);
      this.remote[id] = list;
      return list;
    } finally {
      clearTimeout(timeout);
    }
  },

  // 다음 세션 설정에 미리 골라 둘 것: 지난번과 같은 시간·운동 방식, 난이도는 지난번 결과 화면이 권한 대로 (js/stars.js —
  // 게임 정확도가 높았으면 한 단계 위, 낮았으면 한 단계 아래). shift = 'up' · 'down' · 'keep'
  nextSetup(last) {
    if (!last) return null;
    const recommendation = Stars.nextSession(last.difficulty, last.gameAcc);
    return { min: last.min, difficulty: recommendation.target ? recommendation.target.id : last.difficulty, track: last.track || 'dual', shift: recommendation.kind };
  },

  // 시험용 회원 기록 서버 (SESSION_UPLOAD.localHistory): 바깥 서버 대신 이 태블릿의 세션 로그(IndexedDB)에서
  // 서버와 같은 규칙으로 고른다. 그 회원 번호이고 결과 화면까지 간 세션 (중단 abandoned·그만하기 user 는 뺀다). 세션 로그를 모두 읽으므로 시험용으로만 쓴다
  async localServer(id) {
    const summaries = [];
    await SessionStore.scan((log) => {
      const meta = log.meta || {};
      if (meta.user === id && meta.ended && meta.ended !== 'abandoned' && meta.ended !== 'user') summaries.push(summarize(log));
    });
    return summaries.filter(Boolean);
  },

  // 이 태블릿 기록 + 서버 기록. 같은 세션(태블릿 번호 + 세션 번호)은 한 번만, 시간순.
  // 화면은 모두 이 목록으로 그리므로 여기서 한 번 더 형을 맞춘다 (예전 태블릿 기록 · 시험용 로컬 서버도)
  merged(id) {
    const bySession = new Map();
    const keyOf = (entry) => (entry.sid ? `${entry.device || ''}:${entry.sid}` : `at:${entry.at}`);
    for (const entry of [...(this.remote[id] || []), ...this.history(id)].map(cleanEntry)) if (entry) bySession.set(keyOf(entry), entry);
    return [...bySession.values()].sort((a, b) => new Date(a.at) - new Date(b.at));
  },
};
