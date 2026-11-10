// 회원 (실험, 운영 버전만). 서버 없이 QR 코드로 같은 사람을 알아본다.
//  - 회원 번호: 8자리 숫자 (앞 7자리 무작위 + 끝 1자리 검사 숫자, Luhn). 이름 같은 개인 정보는 받지 않는다
//  - QR 코드: 회원 카드 주소 (app/card.html#번호). 휴대폰으로 찍으면 카드 화면이 열리고, 태블릿은 주소에서 번호만 읽는다
//  - 기록: 이 태블릿의 localStorage (exergame.members). 다른 태블릿에서 만든 번호로 들어와도 되지만 기록은 태블릿마다 따로다.
//    세션 로그에는 meta.user 로 번호가 붙어 업로드되므로, 바깥 DB 에서 모으면 태블릿을 넘어 이어 볼 수 있다
// 흐름: 대기 화면 → 로그인(카메라로 QR · 번호 입력 · 손님) → 회원이면 기록(달력) → 세션 설정 → … → 결과
//       손님은 결과 화면에서 새 회원 번호와 QR 코드를 받는다 (오늘 기록이 그 번호로 저장된다)
import { SESSION_DIFFICULTIES } from '../js/config.js';
import { SessionStore } from '../js/session-log.js';
import { SessionUpload } from '../js/session-upload.js';

const Members = {
  KEY: 'exergame.members',

  // ---------------- 번호 ----------------
  luhn(body) {
    let sum = 0;
    for (let i = 0; i < body.length; i++) {
      let d = +body[body.length - 1 - i];
      if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    return String((10 - (sum % 10)) % 10);
  },

  newId() {
    const r = new Uint32Array(1);
    let id;
    do {
      crypto.getRandomValues(r);
      const body = String(1000000 + (r[0] % 9000000)); // 7자리, 0 으로 시작하지 않게
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
    for (const m of String(text).matchAll(/(\d{4})[\s-]?(\d{4})/g)) {
      const id = m[1] + m[2];
      if (this.valid(id)) return id;
    }
    return null;
  },

  cardUrl(id) {
    return new URL(`card.html#${id}`, location.href).href;
  },

  // ---------------- 기록 (이 태블릿) ----------------
  all() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch (e) { return {}; }
  },

  save(all) {
    try { localStorage.setItem(this.KEY, JSON.stringify(all)); } catch (e) { }
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
    const m = all[id] || (all[id] = { created: new Date().toISOString(), history: [] });
    m.history.push(entry);
    m.history = m.history.slice(-500);
    this.save(all);
  },

  history(id) {
    return (this.all()[id] || { history: [] }).history;
  },

  // ---------------- 서버의 회원 기록 (SESSION_UPLOAD.historyUrl) ----------------
  // GET <historyUrl>?user=<번호> → { sessions: [...] } 또는 배열. 항목은 이 태블릿 기록과 같은 모양
  // ({ at, min, difficulty, score, distM, kcal, level, device, sid, look }). 형식은 docs/SERVER.md
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
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.TIMEOUT_MS);
    try {
      const u = new URL(historyUrl, location.href);
      u.searchParams.set('user', id);
      const res = await fetch(u, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: ctrl.signal });
      if (!res.ok) throw new Error(`서버 응답 ${res.status}`);
      const body = await res.json();
      const list = (Array.isArray(body) ? body : body.sessions || []).filter((x) => x && x.at && !isNaN(new Date(x.at)));
      this.remote[id] = list;
      return list;
    } finally {
      clearTimeout(t);
    }
  },

  // 세션 로그 하나 → 회원 기록 항목 하나. 서버도 업로드된 세션에서 이렇게 뽑는다 (docs/SERVER.md '회원 기록')
  summarize(log) {
    const m = log.meta || {};
    const sum = m.summary || {};
    const ex = sum.exercise || {};
    const levels = Object.values(sum.stats || {}).map((s) => s.level || 0);
    return {
      at: m.startedAt, min: m.session ? m.session.min : null, difficulty: m.session ? m.session.difficulty : null,
      score: sum.score, device: m.device || null, sid: m.id,
      level: levels.length ? Math.max(...levels) : 0, distM: ex.distM, kcal: ex.kcal,
      look: m.landmark || null,
    };
  },

  // 시험용 회원 기록 서버 (SESSION_UPLOAD.localHistory): 바깥 서버 대신 이 태블릿의 세션 로그(IndexedDB)에서
  // 서버와 같은 규칙으로 고른다. 그 회원 번호이고 결과 화면까지 간 세션 (중단 abandoned·그만하기 user 는 뺀다). 세션 로그를 모두 읽으므로 시험용으로만 쓴다
  async localServer(id) {
    const out = [];
    await SessionStore.scan((log) => {
      const m = log.meta || {};
      if (m.user === id && m.ended && m.ended !== 'abandoned' && m.ended !== 'user') out.push(this.summarize(log));
    });
    return out.filter((x) => x.at && !isNaN(new Date(x.at)));
  },

  // 이 태블릿 기록 + 서버 기록. 같은 세션(태블릿 번호 + 세션 번호)은 한 번만, 시간순
  merged(id) {
    const out = new Map();
    const keyOf = (x) => (x.sid ? `${x.device || ''}:${x.sid}` : `at:${x.at}`);
    for (const x of this.remote[id] || []) out.set(keyOf(x), x);
    for (const x of this.history(id)) out.set(keyOf(x), x);
    return [...out.values()].sort((a, b) => new Date(a.at) - new Date(b.at));
  },

  // ---------------- QR 그리기 (app/vendor/qrcode.js) ----------------
  qrSvg(text) {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  },
};

// ---------------- 카메라로 QR 읽기 ----------------
// 브라우저가 BarcodeDetector 를 지원하면(안드로이드 Chrome 등) 그것으로, 아니면 app/vendor/jsQR.js 를 불러와 읽는다
const QrScanner = {
  stream: null,
  timer: null,
  on: false,

  async start(video, onText, onState) {
    this.stop();
    this.on = true;
    onState('starting');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) {
      this.on = false;
      onState('denied', e);
      return;
    }
    if (!this.on) return this.stop(); // 그 사이 화면을 떠났다
    video.srcObject = this.stream;
    try { await video.play(); } catch (e) { }
    let detect = null;
    if ('BarcodeDetector' in window) {
      try {
        const formats = await BarcodeDetector.getSupportedFormats();
        if (formats.includes('qr_code')) {
          const d = new BarcodeDetector({ formats: ['qr_code'] });
          detect = async () => (await d.detect(video)).map((c) => c.rawValue);
        }
      } catch (e) { }
    }
    if (!detect) {
      await this.loadJsQR();
      const cv = document.createElement('canvas');
      const g = cv.getContext('2d', { willReadFrequently: true });
      detect = async () => {
        const w = 640;
        const h = Math.round((video.videoHeight / (video.videoWidth || 1)) * w) || 360;
        cv.width = w;
        cv.height = h;
        g.drawImage(video, 0, 0, w, h);
        const r = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
        return r ? [r.data] : [];
      };
    }
    onState('ready');
    const loop = async () => {
      if (!this.on) return;
      try {
        if (video.readyState >= 2) for (const t of await detect()) onText(t);
      } catch (e) { }
      if (this.on) this.timer = setTimeout(loop, 200);
    };
    loop();
  },

  loadJsQR() {
    if (window.jsQR) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/jsQR.js';
      s.onload = res;
      s.onerror = rej;
      document.head.append(s);
    });
  },

  stop() {
    this.on = false;
    clearTimeout(this.timer);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
  },
};

// ---------------- 화면: 로그인 · 기록 · 결과의 회원 카드 ----------------
// js/demo.js 가 부른다: openLogin(대기 화면에서 시작), tick(매 프레임), onResult(결과 화면을 열 때)
export const MemberUI = {
  IDLE_SEC: 60, // 로그인·기록 화면에서 아무 입력이 없으면 대기 화면으로
  user: null,   // 로그인한 회원 번호 (손님이면 null)
  guest: false,

  init(demo, app) {
    if (!document.getElementById('login')) return null;
    this.demo = demo;
    this.app = app;
    const $ = (s) => document.querySelector(s);
    for (const id of ['#login', '#history']) {
      $(id).addEventListener('pointerdown', () => {
        demo.activeAt = app.clock;
        app.audio.ensure();
      });
    }
    $('#lg-back').onclick = () => app.show('attract');
    $('#hs-back').onclick = () => app.show('attract');
    $('#lg-guest').onclick = () => this.asGuest();
    $('#lg-code').onclick = () => this.showPad(true);
    $('#lg-pad-cancel').onclick = () => this.showPad(false);
    $('#lg-keys').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.k === 'del') this.code = this.code.slice(0, -1);
      else if (b.dataset.k === 'ok') return this.submitCode();
      else if (this.code.length < 8) this.code += b.textContent;
      this.renderPad();
    });
    $('#hs-prev').onclick = () => this.moveMonth(-1);
    $('#hs-next').onclick = () => this.moveMonth(1);
    $('#hs-go').onclick = () => {
      if (app.state !== 'history') return;
      const last = Members.merged(this.user).slice(-1)[0];
      demo.openSetup(this.via, last ? { min: last.min, difficulty: last.difficulty } : null);
    };
    return this;
  },

  // ---------------- 로그인 ----------------
  openLogin(via) {
    const a = this.app;
    this.via = via;
    this.user = null;
    this.guest = false;
    this.showPad(false);
    a.show('login');
    a.state = 'login';
    this.demo.activeAt = a.clock;
    if (a.cfg.sound) a.audio.ambient(true);
    this.startCamera();
  },

  startCamera() {
    const msg = document.getElementById('lg-cam-msg');
    const box = document.querySelector('.lg-cam');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      box.classList.add('off');
      msg.textContent = '이 기기에서는 카메라를 쓸 수 없어요. 번호로 들어가 주세요';
      return;
    }
    QrScanner.start(document.getElementById('lg-video'), (text) => {
      const id = Members.parse(text);
      if (id && this.app.state === 'login') this.login(id);
    }, (st) => {
      box.classList.toggle('off', st === 'denied');
      msg.textContent = st === 'denied'
        ? '카메라를 켜지 못했어요. 번호로 들어가 주세요'
        : st === 'starting' ? '카메라를 켜는 중…' : '휴대폰에 찍어 둔 QR 코드를 화면 위쪽 카메라에 비춰 주세요';
    });
  },

  asGuest() {
    if (this.app.state !== 'login') return;
    QrScanner.stop();
    this.user = null;
    this.guest = true;
    this.demo.openSetup(this.via);
  },

  login(id) {
    QrScanner.stop();
    Members.ensure(id);
    this.user = id;
    this.guest = false;
    this.app.audio.sfx('clear');
    this.openHistory();
    this.loadRemote(id);
  },

  // 서버에서 이 회원의 다른 태블릿 기록까지 받아 와 달력을 다시 그린다. 그동안은 이 태블릿 기록만 보인다
  async loadRemote(id) {
    const src = document.getElementById('hs-src');
    delete Members.remote[id];
    if (!Members.hasRemote()) { src.textContent = ''; return; }
    const local = SessionUpload.settings().localHistory;
    src.textContent = '다른 태블릿의 기록도 불러오는 중…';
    try {
      const list = await Members.fetchRemote(id);
      if (this.user !== id) return;
      // 시험용 로컬 서버는 언제나 알린다. 실제 서버로 착각하지 않게
      src.textContent = local ? `시험용: 이 태블릿의 세션 로그를 서버 대신 썼어요 (${list.length}건)`
        : list && list.length ? '다른 태블릿의 기록까지 모두 보여 드려요' : '';
    } catch (e) {
      if (this.user !== id) return;
      src.textContent = '지금은 서버에 연결하지 못해 이 태블릿의 기록만 보여 드려요';
    }
    if (this.app.state === 'history') this.renderHistory();
  },

  showPad(on) {
    this.code = '';
    document.getElementById('lg-pad').hidden = !on;
    document.getElementById('lg-choices').hidden = on;
    document.getElementById('lg-pad-msg').textContent = 'QR 코드 아래에 적힌 8자리 번호';
    this.renderPad();
  },

  renderPad() {
    const d = (this.code + '________').slice(0, 8);
    document.getElementById('lg-digits').innerHTML = [...d].map((c, i) => `${i === 4 ? '<em></em>' : ''}<i class="${c === '_' ? '' : 'on'}">${c === '_' ? '' : c}</i>`).join('');
  },

  submitCode() {
    const id = this.code;
    const msg = document.getElementById('lg-pad-msg');
    if (id.length < 8) { msg.textContent = '8자리를 모두 눌러 주세요'; return; }
    if (!Members.valid(id)) {
      msg.textContent = '번호가 맞지 않아요. 다시 확인해 주세요';
      const el = document.getElementById('lg-digits');
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
      this.code = '';
      this.renderPad();
      return;
    }
    this.login(id);
  },

  // ---------------- 기록 (달력) ----------------
  openHistory() {
    const a = this.app;
    const now = new Date();
    this.month = new Date(now.getFullYear(), now.getMonth(), 1);
    this.renderHistory();
    a.show('history');
    a.state = 'history';
    this.demo.activeAt = a.clock;
  },

  moveMonth(step) {
    const m = new Date(this.month.getFullYear(), this.month.getMonth() + step, 1);
    const now = new Date();
    if (m > new Date(now.getFullYear(), now.getMonth(), 1)) return;
    if (m < new Date(now.getFullYear() - 2, now.getMonth(), 1)) return;
    this.month = m;
    this.renderHistory();
  },

  renderHistory() {
    const id = this.user;
    const hist = Members.merged(id);
    const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const byDay = {};
    for (const h of hist) {
      const k = dayKey(new Date(h.at));
      byDay[k] = (byDay[k] || 0) + 1;
    }
    const now = new Date();
    const m = this.month;
    document.getElementById('hs-title').textContent = hist.length ? '다시 오셨네요, 반가워요!' : '첫 트레이닝을 시작해 볼까요?';
    document.getElementById('hs-id').textContent = `회원 번호 ${Members.format(id)}`;
    document.getElementById('hs-month').textContent = `${m.getFullYear()}년 ${m.getMonth() + 1}월`;
    const isThisMonth = m.getFullYear() === now.getFullYear() && m.getMonth() === now.getMonth();
    document.getElementById('hs-next').disabled = isThisMonth;
    // 달력: 일요일부터
    const first = new Date(m.getFullYear(), m.getMonth(), 1).getDay();
    const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    let h = ['일', '월', '화', '수', '목', '금', '토'].map((w, i) => `<b class="${i === 0 ? 'sun' : ''}">${w}</b>`).join('');
    for (let i = 0; i < first; i++) h += '<span></span>';
    let monthCount = 0;
    for (let d = 1; d <= days; d++) {
      const date = new Date(m.getFullYear(), m.getMonth(), d);
      const n = byDay[dayKey(date)] || 0;
      monthCount += n;
      const cls = [n ? 'done' : '', isThisMonth && d === now.getDate() ? 'today' : '', date > now ? 'future' : ''].filter(Boolean).join(' ');
      h += `<span class="${cls}">${d}${n > 1 ? `<small>${n}</small>` : ''}</span>`;
    }
    document.getElementById('hs-cal').innerHTML = h;
    // 숫자 요약과 최근 기록
    const thisMonth = hist.filter((x) => { const d = new Date(x.at); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }).length;
    const last = hist[hist.length - 1];
    const ago = last ? Math.round((new Date(now.toDateString()) - new Date(new Date(last.at).toDateString())) / 86400000) : null;
    document.getElementById('hs-stats').innerHTML = [
      ['이번 달', `${thisMonth}<small>번</small>`],
      ['모두', `${hist.length}<small>번</small>`],
      ['지난번', last ? (ago === 0 ? '오늘' : ago === 1 ? '어제' : `${ago}<small>일 전</small>`) : '–'],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    const diffLabel = (id) => (SESSION_DIFFICULTIES.find((d) => d.id === id) || {}).label || '';
    const wd = ['일', '월', '화', '수', '목', '금', '토'];
    document.getElementById('hs-recent').innerHTML = hist.length
      ? hist.slice(-4).reverse().map((x) => {
        const d = new Date(x.at);
        return `<li><span>${d.getMonth() + 1}월 ${d.getDate()}일 (${wd[d.getDay()]})</span><span>${x.min}분 · ${diffLabel(x.difficulty)}</span><b>${(x.score || 0).toLocaleString('ko-KR')}점</b></li>`;
      }).join('')
      : `<li class="empty">${Members.hasRemote() ? '아직 기록이 없어요' : '이 태블릿에는 아직 기록이 없어요'}. 오늘 트레이닝부터 쌓여요</li>`;
    // 받침이 있으면(ㄹ 받침 빼고) '으로', 없으면 '로'
    const ro = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c < 11172 && c % 28 && c % 28 !== 8 ? '으로' : '로'; };
    const dl = last ? diffLabel(last.difficulty) : '';
    const sum = last ? `지난번처럼 ${last.min}분 · ${dl}${ro(dl)} 골라 둘게요` : '다음 화면에서 시간과 난이도를 골라요';
    document.getElementById('hs-sum').textContent = sum;
    void monthCount;
  },

  // ---------------- 매 프레임 ----------------
  tick(a, entered) {
    if (a.state !== 'login') QrScanner.stop();
    if (a.state === 'attract' && entered) {
      this.user = null;
      this.guest = false;
    }
    if ((a.state === 'login' || a.state === 'history') && (a.clock - this.demo.activeAt) / 1000 > this.IDLE_SEC) a.show('attract');
  },

  // 풍경에 세울 지난 세션들 (js/band.js setLandmarks). 기념물 종류는 난이도, 크기는 시간으로 정한다. 손님은 없다
  landmarks() {
    if (!this.user) return [];
    return Members.merged(this.user).map((x) => ({
      score: x.score || 0, at: x.at, difficulty: x.difficulty, min: x.min, look: x.look || null,
      key: x.sid ? `${x.device || ''}:${x.sid}` : x.at,
    }));
  },

  // 이번 라운드가 이 회원의 몇 번째 기록인가 (라운드 끝 기념물의 이름표). 손님은 결과 화면에서 회원 번호를 받으므로 첫 기록이다
  nextCount() {
    return (this.user ? Members.merged(this.user).length : 0) + 1;
  },

  // 라운드를 시작할 때 세션 로그에 회원 번호를 붙인다
  tagLog(log) {
    log.meta.user = this.user;
    log.meta.guest = this.guest || !this.user;
  },

  // ---------------- 결과 화면 ----------------
  // 손님이면 새 번호를 만들어 오늘 기록을 그 번호로 저장하고 QR 카드를 보여 준다. 회원이면 기록에 더한다
  onResult(a, sim) {
    const box = document.getElementById('dr-member');
    if (!box) return;
    // 새 회원 카드를 보여 줄 때만 결과 화면의 첫 칸을 넓힌다 (app/app.css .with-card)
    const screen = document.getElementById('demo-result');
    screen.classList.remove('with-card');
    if (sim) {
      box.innerHTML = '<p class="dm-note">가상 결과라 기록하지 않아요</p>';
      return;
    }
    const fresh = !this.user;
    if (fresh) this.user = Members.newId();
    const id = this.user;
    if (a.log) {
      a.log.meta.user = id;
      a.log.meta.userNew = fresh;
    }
    const lv = Math.max(0, ...Object.values(a.stats || {}).map((s) => s.level || 0));
    const s = a.log && a.log.meta.session;
    Members.record(id, {
      at: new Date().toISOString(), min: s ? s.min : Math.round(a.cfg.durationSec / 60), difficulty: s ? s.difficulty : 'normal',
      score: a.score, distM: Math.round(a.meter.distM), kcal: Math.round(a.meter.kcal * 10) / 10, level: lv,
      ended: a.log ? a.log.meta.ended : null,
      // 서버 기록과 겹치는지 가리는 열쇠 (세션 로그의 meta.device + meta.id)
      device: a.log ? a.log.meta.device : null, sid: a.log ? a.log.meta.id : null,
      // 풍경에 세운 기념물의 생김새 (js/band.js Band.lookOf). 다음 라운드부터 이대로 그린다
      look: (a.log && a.log.meta.landmark) || null,
    });
    document.getElementById('dr-id').textContent = `회원 ${Members.format(id)}`;
    if (fresh) {
      screen.classList.add('with-card');
      // 사진으로 찍어 두면 QR 이 작아 태블릿이 잘 못 읽는다. 휴대폰 카메라로 비춰 링크를 열고, 회원 카드 화면(app/card.html)에서
      // '갤러리에 저장' 한 큰 QR 그림을 쓰도록 안내한다. 결과 화면에서 눈에 잘 띄도록 따로 강조한 칸에 둔다
      box.innerHTML = `
        <div class="dm-new">
          <h4><em>새 회원</em>회원 카드를 휴대폰에 담아 가세요</h4>
          <div class="dm-card">
            <div class="dm-qr">${Members.qrSvg(Members.cardUrl(id))}</div>
            <ol class="dm-steps">
              <li>휴대폰 <b>카메라를 켜고</b> 이 QR 코드에 <b>비춰</b> 주세요 <small>(사진은 찍지 않아도 돼요)</small></li>
              <li>화면에 뜨는 <b>링크를 누르면</b> 회원 카드가 열려요</li>
              <li>회원 카드의 <b>'갤러리에 저장'</b>을 누르세요</li>
            </ol>
          </div>
          <p class="dm-id">다음에 오시면 저장한 사진을 태블릿 카메라에 보여 주세요. 안 되면 회원 번호 <b>${Members.format(id)}</b> 를 눌러도 돼요</p>
        </div>`;
    } else {
      const n = Members.merged(id).length;
      box.innerHTML = `<p class="dm-saved"><b>${n}번째 트레이닝</b>을 기록했어요<br><span>회원 ${Members.format(id)}</span></p>`;
    }
  },
};
