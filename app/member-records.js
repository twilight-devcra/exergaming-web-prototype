// 회원 번호 · 아이디와 기록 (운영 버전만). 화면은 app/members.js, QR 은 app/qr.js.
//  - 회원을 가리키는 값(id)은 두 가지. 세션 로그의 meta.user, 기록의 열쇠, 회원 기록 ?user= 모두 이 값을 그대로 쓴다
//    - 회원 번호: 8자리 숫자 (앞 7자리 무작위 + 끝 1자리 검사 숫자, Luhn). QR 회원 카드에 담긴다
//    - 아이디: '<접두어>_<아이디>' (js/member-id.js). 담당자가 '새 아이디 만들기'로 적고, 운영 메뉴의 '아이디 접두어'가 붙는다
//    이름 같은 개인 정보는 받지 않는다 (아이디는 별명이면 된다)
//  - 기록: 이 태블릿의 localStorage (exergame.members). 다른 태블릿에서 만든 번호로 들어와도 되지만 기록은 태블릿마다 따로다.
//    세션 로그에는 meta.user 로 붙어 업로드되므로, 서버에서 모으면 태블릿을 넘어 이어 볼 수 있다
//  - 서버 기록: SESSION_UPLOAD.historyUrl 에서 받아 이 태블릿 기록과 합친다 (merged)
//  - 서버의 아이디 목록: historyUrl 의 끝 '/history' 를 '/users' 로 바꾼 주소 (docs/SERVER.md '아이디')
import { Stars } from '../js/stars.js';
import { SessionStore } from '../js/session-log.js';
import { SessionUpload } from '../js/session-upload.js';
import { summarize, cleanEntry } from '../js/history-entry.js';
import { MemberId } from '../js/member-id.js';

export const Members = {
  KEY: 'exergame.members',
  PREFIX_KEY: 'exergame.idPrefix', // 운영 메뉴의 '아이디 접두어' (이 태블릿에만)

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

  // 화면에 보일 꼴: 회원 번호는 '1234 5678', 아이디는 접두어를 뺀 아이디
  format(id) {
    return MemberId.isNamed(id) ? MemberId.nameOf(id) : `${id.slice(0, 4)} ${id.slice(4)}`;
  },

  // '회원 번호 1234 5678' · '아이디 철수'
  label(id) {
    return `${MemberId.isNamed(id) ? '아이디' : '회원 번호'} ${this.format(id)}`;
  },

  // ---------------- 아이디 접두어 (운영 메뉴) ----------------
  // 여러 시설이 한 서버를 쓸 때 아이디가 겹치지 않게 앞에 붙인다. 비어 있으면 아이디를 만들거나 고를 수 없다
  prefix() {
    try { return MemberId.cleanPrefix(localStorage.getItem(this.PREFIX_KEY) || ''); } catch { return ''; }
  },

  setPrefix(prefix) {
    try {
      if (prefix) localStorage.setItem(this.PREFIX_KEY, prefix);
      else localStorage.removeItem(this.PREFIX_KEY);
    } catch { /* 저장 못 하면 다음에 다시 적는다 */ }
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

  // 손님이 결과 화면에서 받은 회원 번호 대신 아이디를 만들었을 때: 그 번호의 기록을 아이디로 옮기고 번호는 지운다
  move(fromId, toId) {
    const all = this.all();
    const from = all[fromId];
    if (!from) return;
    const target = all[toId] || (all[toId] = { created: from.created, history: [] });
    target.history = [...target.history, ...from.history].slice(-500);
    delete all[fromId];
    this.save(all);
  },

  // ---------------- 아이디 목록 · 새 아이디 (서버: docs/SERVER.md '아이디') ----------------
  // 아이디 목록을 받을 서버 주소. 회원 기록 주소가 .../history 로 끝날 때만 (그 끝을 /users 로). 없으면 null → 이 태블릿만 본다
  usersUrl() {
    const { historyUrl, localHistory } = SessionUpload.settings();
    if (localHistory || !historyUrl) return null;
    try {
      const url = new URL(historyUrl, location.href);
      if (!/\/history\/?$/.test(url.pathname)) return null;
      url.pathname = url.pathname.replace(/history\/?$/, 'users');
      return url;
    } catch {
      return null;
    }
  },

  // 서버 요청 하나 (인증 키 · TIMEOUT_MS). 응답을 그대로 돌려준다
  async fetchServer(url, options = {}) {
    const { key } = SessionUpload.settings();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
    try {
      return await fetch(url, { ...options, headers: { ...(options.headers || {}), ...(key ? { Authorization: `Bearer ${key}` } : {}) }, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  },

  // 지금 접두어의 아이디 목록 → { users: [{ id, name, last }], server: 'none' | 'ok' | 'failed' }
  // 이 태블릿에 있는 아이디와 서버의 아이디를 합친다 (영문 대소문자만 다른 것은 하나로). last 는 마지막 운동(없으면 만든 때)
  async namedList() {
    const prefix = this.prefix();
    if (!MemberId.validPrefix(prefix)) return { users: [], server: 'none' };
    const byKey = new Map();
    const add = (id, last) => {
      if (!MemberId.isNamed(id) || MemberId.prefixOf(id) !== prefix) return;
      const key = MemberId.keyOf(id);
      const known = byKey.get(key);
      if (!known) byKey.set(key, { id, name: MemberId.nameOf(id), last: last || null });
      else if (last && (!known.last || new Date(last) > new Date(known.last))) known.last = last;
    };
    for (const [id, member] of Object.entries(this.all())) {
      const history = (member && member.history) || [];
      add(id, history.length ? history[history.length - 1].at : member && member.created);
    }
    const url = this.usersUrl();
    if (!url) return { users: [...byKey.values()], server: 'none' };
    try {
      url.searchParams.set('prefix', prefix);
      const response = await this.fetchServer(url);
      if (!response.ok) throw new Error(`서버 응답 ${response.status}`);
      const body = await response.json();
      for (const user of (body && Array.isArray(body.users) ? body.users : [])) {
        if (user && typeof user.id === 'string') add(user.id, typeof user.last === 'string' && !isNaN(Date.parse(user.last)) ? user.last : null);
      }
      return { users: [...byKey.values()], server: 'ok' };
    } catch {
      return { users: [...byKey.values()], server: 'failed' };
    }
  },

  // 새 아이디를 만든다 → { id } 또는 { error, message }. error: prefix(접두어 없음) · invalid(꼴이 틀림) · exists(이미 있음) · offline(서버 연결 실패)
  // 서버가 있으면 서버가 겹침을 가린다 (두 태블릿이 같은 아이디를 함께 만들어도 하나만 된다). 서버에 닿지 않으면 만들지 않는다:
  // 이 태블릿만 보고 만들면 다른 태블릿의 같은 아이디와 기록이 섞일 수 있다
  async createNamed(text) {
    const prefix = this.prefix();
    if (!MemberId.validPrefix(prefix)) return { error: 'prefix', message: '운영 메뉴에서 아이디 접두어를 먼저 정해 주세요' };
    const name = MemberId.cleanName(text);
    const problem = MemberId.nameProblem(name);
    if (problem) return { error: 'invalid', message: problem };
    const id = MemberId.make(prefix, name);
    const exists = { error: 'exists', message: `'${name}' 아이디는 이미 있어요. 다른 아이디를 적어 주세요` };
    if (Object.keys(this.all()).some((known) => MemberId.keyOf(known) === MemberId.keyOf(id))) return exists;
    const url = this.usersUrl();
    if (url) {
      let response = null;
      try {
        response = await this.fetchServer(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      } catch { /* 아래에서 offline */ }
      if (response && response.status === 409) return exists;
      if (!response || !response.ok) return { error: 'offline', message: '서버에 연결하지 못해 아이디를 만들지 못했어요. 잠시 뒤 다시 해 주세요' };
    }
    this.ensure(id);
    return { id };
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
    const { historyUrl, localHistory } = SessionUpload.settings();
    if (localHistory) return (this.remote[id] = await this.localServer(id));
    if (!historyUrl) return null;
    const url = new URL(historyUrl, location.href);
    url.searchParams.set('user', id);
    const response = await this.fetchServer(url);
    if (!response.ok) throw new Error(`서버 응답 ${response.status}`);
    const body = await response.json();
    const raw = Array.isArray(body) ? body : (body && body.sessions) || [];
    const list = (Array.isArray(raw) ? raw : []).map(cleanEntry).filter(Boolean);
    this.remote[id] = list;
    return list;
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
