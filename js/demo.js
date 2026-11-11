// 스테이션 흐름: 운영 버전(app/index.html)이 쓴다. 처음엔 시연 행사용으로 만들었다 (배경은 docs/DEMO_BRIEF.md).
// 흐름: 대기 화면 → (회원 로그인 → 세션 설정, app/members.js) → 속도 측정 → 라운드 → 결과 → 길게 눌러 초기화 → 대기 화면
// 라운드 자체는 main.js 의 App 흐름을 그대로 쓰고, 여기서는 그 앞뒤 화면과 무인 운영 장치만 맡는다.
// 설정은 js/config.js 의 DEMO_CONFIG 이고, 운영 메뉴의 '라운드 설정'에서 DEMO_SETTINGS 항목만 태블릿마다 바꿀 수 있다.
import { BASE_LEVEL, PRESET_KEYS, ROUND_PRESETS, SESSION_LENGTHS, SESSION_DIFFICULTIES, SESSION_TRACKS, SESSION_DEFAULT, DEMO_SETTINGS, APP_OPERATOR_PIN, Config, $, U } from './config.js';
import { Exercise } from './exercise.js';
import { Fx } from './fx.js';
import { ABILITIES } from './abilities.js';
import { GAME_TYPES } from './games/index.js';
import { SessionStore } from './session-log.js';
import { SessionUpload } from './session-upload.js';
import { AttractVisual } from '../app/attract-visual.js';
import { CalibVisual } from '../app/calib-visual.js';
import { MemberUI } from '../app/members.js';

export const Demo = {
  IDLE_SEC: 40,          // 라운드 중 페달도 터치도 없이 이만큼 지나면 '아직 하고 계신가요?'
  IDLE_GRACE_SEC: 15,    // 그 안내 뒤 이만큼 더 지나면 라운드를 끝내고 결과를 보여준다
  CALIB_IDLE_SEC: 60,    // 측정 화면에서 페달을 밟지 않고 이만큼 지나면 대기 화면으로 돌아간다
  SETUP_IDLE_SEC: 60,    // 세션 설정 화면(운영 버전)에서 누르지도 밟지도 않고 이만큼 지나면 대기 화면으로 돌아간다
  PEDAL_START_SEC: 2.5,  // 대기 화면에서 이만큼 계속 밟으면 시작
  ATTRACT_LOCK_SEC: 4,   // 대기 화면이 뜬 직후에는 페달로 시작하지 않는다 (앞 참가자가 아직 밟고 있을 수 있다)
  RPM_ACTIVE: 10,        // 이보다 빠르면 '밟고 있다'로 본다
  CORNER_HOLD_MS: 2000,  // 운영 메뉴: 왼쪽 위 모서리를 이만큼 누르고 있으면 PIN 입력
  NEXT_HOLD_MS: 500,    // 결과 화면의 '다음 참가자'를 이만큼 누르고 있어야 넘어간다 (참가자가 실수로 지우지 않게)
  PIN_TIMEOUT_MS: 20000,
  END_ASK_SEC: 30,       // '그만하기' 확인 창에 이만큼 답이 없으면 그대로 마친다 (누르고 자리를 떠난 경우)
  LOG_MAX: 1000,

  app: null,
  station: '',
  allowKbd: false,  // 페달 없이 A/D 키로 시작할 수 있게 한다 (점검용). app/?kbd 또는 운영 메뉴에서 켠다. 저장하지 않으므로 새로고침하면 꺼진다
  simResult: false, // 시작하면 라운드 없이 가상 성적으로 바로 결과 화면을 연다 (흐름 점검용). 저장하지 않는다
  kiosk: false,     // 운영 메뉴를 한 번 닫은 뒤부터 전체 화면·화면 꺼짐 방지를 유지한다
  opOpen: false,
  endOpen: false,   // '그만하기' 확인 창이 열려 있다 (게임은 멈춤)
  pinOpen: false,
  leaving: false,
  activeAt: 0,      // 마지막으로 페달을 밟거나 화면을 누른 게임 시계 시각 (ms)
  attractAt: 0,
  prevState: null,
  pedalHold: 0,
  alertKind: null,

  init(app) {
    this.app = app;
    document.body.classList.add('demo');
    this.allowKbd = new URLSearchParams(location.search).has('kbd');
    this.station = this.load('station', '');
    // 대기 화면 오른쪽 그림: 바퀴 안의 두뇌 (app/attract-visual.js)
    this.preview = AttractVisual.init(app);
    // 운영 버전: 속도 측정 화면의 둥근 길과 자전거 (app/calib-visual.js)
    this.calibVisual = CalibVisual.init();
    // 운영 버전: QR 회원 (app/members.js). 대기 화면 → 로그인 → 기록 → 세션 설정
    this.members = MemberUI.init(this, app);
    this.bindOp();
    this.bindEnd();
    this.bindSetup();
    this.bindUpload();
    this.bindPin();
    this.bindHolds();
    this.bindGuards();
    // 대기 화면에서 시작된 터치만 시작으로 친다. 결과 화면의 '다음 참가자'를 길게 누르고 손을 떼면
    // 터치는 그 자리(이제 대기 화면)에 click 을 만들어서, 그대로 두면 바로 다음 판이 시작돼 버린다.
    let pressed = false;
    $('#attract').addEventListener('pointerdown', () => (pressed = true));
    $('#attract').addEventListener('click', () => {
      if (pressed) this.start();
      pressed = false;
    });
    this.renderCfg();
    app.show('attract');
    this.renderStation();
    this.updateAttract();
    // 바로 대기 화면. 페달은 대기 화면의 '페달 연결' 버튼으로, 전체 화면은 시작을 누를 때 요청한다
    // (페달 연결(기기 선택)과 전체 화면은 사람이 화면을 눌러야만 요청할 수 있다)
    if (!this.station) this.station = '1'; // 운영 메뉴에서 바꿀 수 있다 (저장은 그때)
    this.renderStation();
  },

  // ---------------- 저장 (태블릿마다 따로) ----------------
  load(key, def) {
    try {
      const v = localStorage.getItem(`exergame.demo.${key}`);
      return v == null ? def : JSON.parse(v);
    } catch (e) { return def; }
  },

  save(key, v) {
    try { localStorage.setItem(`exergame.demo.${key}`, JSON.stringify(v)); } catch (e) {}
  },

  // 결과마다 붙는 번호. 종이 기록이 섞이지 않도록 스테이션 번호를 앞에 붙여(3-017) 크게 보여준다. 새로고침해도 이어진다.
  nextSeq() {
    const n = this.load('seq', 0) + 1;
    this.save('seq', n);
    return n;
  },

  label(no) {
    return `${this.station || '?'}-${String(no).padStart(3, '0')}`;
  },

  renderStation() {
    document.querySelectorAll('.st-name').forEach((e) => (e.textContent = this.station ? `스테이션 ${this.station}` : ''));
  },

  // ---------------- 대기 화면 ----------------
  // 페달을 쓸 수 있는가 (연결됨, 또는 점검용 키보드). 없으면 세션 설정에서 '두뇌 게임만'만 고를 수 있다
  pedalReady() {
    return this.app.link.state === 'ready' || this.allowKbd;
  },

  // 세션 설정이 있는 운영 버전은 페달이 없어도 두뇌 게임만으로 시작할 수 있다
  canStart() {
    return this.pedalReady() || this.simResult || !!$('#setup');
  },

  updateAttract() {
    const ok = this.canStart();
    const pedal = this.pedalReady();
    $('#att-start').disabled = !ok;
    // 테스트용 스위치가 켜져 있으면 그렇다고 보여준다 (행사 때 켜 둔 채로 두지 않게)
    const kbdOnly = pedal && this.app.link.state !== 'ready';
    $('#att-hint').textContent = this.simResult
      ? '가상 결과 모드 · 누르면 게임 없이 결과 화면으로 갑니다'
      : kbdOnly ? '키보드 테스트 모드 · A/D 키를 번갈아 눌러 페달링합니다'
      : pedal ? '화면을 누르거나 페달을 밟으면 시작합니다'
      : ok ? '페달이 연결되지 않았어요 · 지금은 두뇌 게임만 할 수 있어요'
      : '페달 연결을 기다리는 중입니다 · 진행 요원에게 알려주세요';
    $('#att-hint').classList.toggle('warn', !pedal || kbdOnly || this.simResult);
    // 운영 버전: 페달이 연결돼 있지 않으면 대기 화면에서 바로 연결한다 (운영 메뉴를 열지 않고)
    const pb = $('#att-pedal');
    if (pb) pb.hidden = this.app.link.state === 'ready';
  },

  // via: tap(화면을 눌러서) | pedal(페달을 밟아서)
  // 운영 버전은 먼저 세션 설정 화면에서 시간과 난이도를 고른다
  start(via = 'tap') {
    const a = this.app;
    if (a.state !== 'attract' || this.opOpen || this.pinOpen || !this.canStart()) return;
    this.enterKiosk();
    if (this.simResult) return this.simulateRound();
    if (this.members) return this.members.openLogin(via);
    if ($('#setup')) return this.openSetup(via);
    this.beginRound(via);
  },

  beginRound(via, session = null) {
    const a = this.app;
    if (session) Object.assign(a.cfg, Config.session(session.min, session.difficulty));
    // 운동 방식은 판마다 고른다 (세션 로그를 만들기 전에 넣어야 meta.track 에 남는다)
    a.cfg.brainOnly = !!session && session.track === 'brain';
    a.startRound();
    // 회원이면 지난 세션들이 기념물로 길가에 선다 (손님·프로토타입은 없음)
    a.band.setLandmarks(this.members ? this.members.landmarks() : []);
    a.log.meta.station = this.station;
    if (session) a.log.meta.session = { ...session };
    if (this.members) this.members.tagLog(a.log);
    a.log.ev('start', { via, ...(session ? { session } : {}) });
    this.activeAt = a.clock;
    this.renderCfg();
  },

  // 라운드 끝에 세울 기념물 { n, difficulty, min } (js/band.js plant). 운영 버전(회원·손님)만, 아니면 null
  plantInfo() {
    if (!this.members) return null;
    const s = (this.app.log && this.app.log.meta.session) || {};
    return { n: this.members.nextCount(), difficulty: s.difficulty, min: s.min };
  },

  // ---------------- 세션 설정 (운영 버전) ----------------
  bindSetup() {
    if (!$('#setup')) return;
    const tile = (attrs, title, desc, extra = '') =>
      `<button class="su-opt" ${attrs}>${extra}<b>${title}</b><small>${desc}</small></button>`;
    // 운동 방식 두 칸: 페달 + 두뇌 게임(자전거) / 두뇌 게임만(두뇌, 로고와 같은 모양)
    const icons = {
      dual: '<svg viewBox="0 0 48 32" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="22" r="8"/><circle cx="38" cy="22" r="8"/><path d="M10 22l8-13h13l7 13M18 9l6 13 7-13M15 5h7M31 9l-2-5h5"/></svg>',
      brain: '<svg viewBox="-1 -0.85 2 1.7"><path fill="currentColor" d="M-0.95 0.05 C-1 -0.45 -0.6 -0.8 -0.1 -0.8 C0.45 -0.82 0.95 -0.5 0.95 -0.05 C0.97 0.25 0.85 0.42 0.62 0.45 C0.7 0.62 0.5 0.75 0.3 0.66 C0.22 0.62 0.18 0.56 0.15 0.52 L0.13 0.8 L0.01 0.8 L0.02 0.5 C-0.2 0.55 -0.45 0.5 -0.55 0.38 C-0.8 0.42 -0.92 0.28 -0.95 0.05 Z"/></svg>',
    };
    $('#su-track').innerHTML = SESSION_TRACKS.map((t) =>
      tile(`data-track="${t.id}"`, t.label, t.desc, `<i class="su-ico" aria-hidden="true">${icons[t.id]}</i>`)).join('');
    $('#su-len').innerHTML = SESSION_LENGTHS.map((l) => tile(`data-min="${l.min}"`, l.label, l.desc)).join('');
    $('#su-diff').innerHTML = SESSION_DIFFICULTIES.map((d, i) =>
      tile(`data-diff="${d.id}"`, d.label, d.desc, `<i class="su-bars" data-n="${i + 1}"><span></span><span></span><span></span></i>`)).join('');
    $('#setup').addEventListener('pointerdown', () => {
      this.activeAt = this.app.clock;
      this.app.audio.ensure(); // 페달로 들어와 소리가 막혀 있었으면 누를 때 풀린다
    });
    $('#su-len').addEventListener('click', (e) => {
      const b = e.target.closest('[data-min]');
      if (b) this.pickSetup({ min: +b.dataset.min });
    });
    $('#su-track').addEventListener('click', (e) => {
      const b = e.target.closest('[data-track]');
      if (b && !b.disabled) this.pickSetup({ track: b.dataset.track });
    });
    $('#su-diff').addEventListener('click', (e) => {
      const b = e.target.closest('[data-diff]');
      if (b) this.pickSetup({ difficulty: b.dataset.diff });
    });
    $('#su-back').onclick = () => this.app.show('attract');
    $('#su-go').onclick = () => {
      if (this.app.state !== 'setup' || this.opOpen || this.pinOpen) return;
      this.beginRound(this.setupVia, this.setup);
    };
  },

  // preset: 미리 골라 둘 { min, difficulty, track } (회원이면 지난번 것)
  openSetup(via, preset = null) {
    const a = this.app;
    this.setupVia = via;
    this.setup = { ...SESSION_DEFAULT, ...(preset || {}) };
    if (!SESSION_TRACKS.some((t) => t.id === this.setup.track)) this.setup.track = SESSION_DEFAULT.track;
    this.pickSetup({});
    a.show('setup');
    a.state = 'setup';
    this.activeAt = a.clock;
    // 고르는 동안 잔잔한 음악 (화면을 떠나면 tick 이 끈다)
    if (a.cfg.sound) a.audio.ambient(true);
  },

  pickSetup(change) {
    if (!this.setup) return;
    Object.assign(this.setup, change);
    // 페달이 없으면 두뇌 게임만 (페달 칸은 막고 까닭을 적는다)
    const pedal = this.pedalReady();
    if (!pedal) this.setup.track = 'brain';
    const { min, difficulty, track } = this.setup;
    document.querySelectorAll('#su-track [data-track]').forEach((b) => {
      const t = SESSION_TRACKS.find((x) => x.id === b.dataset.track);
      const off = t.id === 'dual' && !pedal;
      b.classList.toggle('on', t.id === track);
      b.disabled = off;
      b.querySelector('small').textContent = off ? '페달 연결 필요' : t.desc;
    });
    document.querySelectorAll('#su-len [data-min]').forEach((b) => b.classList.toggle('on', +b.dataset.min === min));
    document.querySelectorAll('#su-diff [data-diff]').forEach((b) => b.classList.toggle('on', b.dataset.diff === difficulty));
    const d = SESSION_DIFFICULTIES.find((x) => x.id === difficulty);
    $('#su-sum').textContent = `${min}분 · ${d ? d.label : ''} · ` +
      (track === 'brain' ? '두뇌 게임만, 바로 시작합니다' : '페달 속도를 잰 뒤 시작합니다');
  },

  // ---------------- 자동 업로드 (js/session-upload.js) ----------------
  bindUpload() {
    SessionUpload.onChange = (state, set) => {
      const el = $('#op-up-state');
      if (el) el.textContent = SessionUpload.describe(state, set);
    };
    SessionUpload.init();
    if (!$('#op-up-url')) return;
    const hist = $('#op-up-hist');
    const local = $('#op-up-local');
    const save = () => {
      SessionUpload.setSettings({
        url: $('#op-up-url').value, key: $('#op-up-key').value, historyUrl: hist ? hist.value : '',
        ...(local ? { localHistory: local.checked } : {}),
      });
      if (hist && local) hist.disabled = local.checked;
    };
    $('#op-up-url').addEventListener('change', save);
    $('#op-up-key').addEventListener('change', save);
    if (hist) hist.addEventListener('change', save);
    if (local) local.addEventListener('change', save);
    $('#op-up-now').onclick = () => {
      save();
      SessionUpload.kick();
    };
  },

  renderUpload() {
    if (!$('#op-up-url')) return;
    const { url, key, historyUrl, localHistory } = SessionUpload.settings();
    $('#op-up-url').value = url;
    $('#op-up-key').value = key;
    if ($('#op-up-hist')) $('#op-up-hist').value = historyUrl;
    if ($('#op-up-local')) {
      $('#op-up-local').checked = localHistory;
      if ($('#op-up-hist')) $('#op-up-hist').disabled = localHistory;
    }
    SessionUpload.refresh();
  },

  // 라운드를 돌리지 않고 그럴듯한 성적을 채워 결과 화면을 연다. 참가 번호를 쓰지 않고 기록에도 남기지 않는다.
  simulateRound() {
    const a = this.app;
    const cfg = a.cfg;
    const R = U.randInt;
    const exMax = Math.floor(cfg.durationSec / cfg.tickSec) * cfg.tickMaxPoints;
    a.stats = {};
    a.brainOnly = false;
    let cog = 0;
    for (const T of GAME_TYPES) {
      const total = T.id === 'path' ? R(8, 14) : 3 * R(1, 2);
      const correct = R(Math.floor(total * 0.3), total);
      const points = Math.round(correct * R(25, 45));
      cog += points;
      const level = R(BASE_LEVEL, BASE_LEVEL + 3);
      const runs = level > BASE_LEVEL ? [[level - 1, Math.ceil(correct / 2), Math.ceil(total / 2)], [level, Math.floor(correct / 2), Math.floor(total / 2)]] : [[level, correct, total]];
      a.stats[T.id] = { plays: runs.length, cleared: 0, correct, total, points, level, runs, ms: total * R(4000, 12000) };
    }
    a.exScore = Math.round(exMax * R(55, 95) / 100);
    a.cogScore = cog;
    a.score = a.exScore + a.cogScore;
    const rpm = R(45, 75);
    const m = a.meter;
    m.reset();
    m.activeSec = cfg.durationSec - R(0, 20);
    m.revs = (rpm / 60) * m.activeSec;
    m.kcal = Exercise.kcalPerSec(rpm) * m.activeSec;
    a.state = 'result';
    this.showResult({ sim: true });
  },

  // ---------------- 매 프레임 (일시정지 중에는 불리지 않는다) ----------------
  tick(dt, rpm) {
    const a = this.app;
    if (rpm > this.RPM_ACTIVE) this.activeAt = a.clock;
    if (!['login', 'history', 'setup'].includes(a.state)) a.audio.ambient(false);
    const entered = a.state !== this.prevState;
    if (this.members) this.members.tick(a, entered);
    this.prevState = a.state;

    if (a.state === 'attract') {
      if (entered) {
        this.attractAt = a.clock;
        this.pedalHold = 0;
      }
      if (this.preview) this.preview.tick(dt, rpm);
      const ready = (a.clock - this.attractAt) / 1000 > this.ATTRACT_LOCK_SEC && !this.opOpen && this.canStart();
      this.pedalHold = ready && rpm > this.RPM_ACTIVE ? this.pedalHold + dt : Math.max(0, this.pedalHold - dt);
      if (this.pedalHold >= this.PEDAL_START_SEC) this.start('pedal');
    } else if (a.state === 'setup') {
      if ((a.clock - this.activeAt) / 1000 > this.SETUP_IDLE_SEC) a.show('attract');
    } else if (a.state === 'calib') {
      if (this.calibVisual) {
        if (entered) this.calibVisual.reset();
        this.calibVisual.tick(dt, a.calib.started ? rpm : 0, a.calib, a.cfg.calibrationSec);
      }
      // 시작만 눌러 놓고 자리를 떠난 경우
      if (!a.calib.started && (a.clock - this.activeAt) / 1000 > this.CALIB_IDLE_SEC) a.quit();
    } else if (a.state === 'play') {
      this.checkIdle();
    }
    if (a.state !== 'play') this.hideAlert('idle');
    const canEnd = a.inRound && !this.endOpen;
    document.querySelectorAll('.end-btn').forEach((b) => (b.hidden = !canEnd));
    if (this.endOpen && !a.inRound) this.closeEnd(false);
  },

  // ---------------- 그만하기 (참가자가 세션을 도중에 마침) ----------------
  // 속도 측정·라운드 중 구석의 작은 버튼 → 확인 창(게임 멈춤) → 마치면 하던 데까지 세션 로그에 남기고 대기 화면으로 (App.endEarly)
  bindEnd() {
    document.querySelectorAll('.end-btn').forEach((b) => (b.onclick = () => this.openEnd()));
    $('#end-no').onclick = () => this.closeEnd(false);
    $('#end-yes').onclick = () => this.closeEnd(true);
  },

  openEnd() {
    const a = this.app;
    if (!a.inRound || this.endOpen || this.opOpen) return;
    this.endOpen = true;
    a.log.ev('end_ask');
    $('#end-ask').classList.add('active');
    this.syncPause();
    clearTimeout(this.endTimer);
    this.endTimer = setTimeout(() => this.closeEnd(true), this.END_ASK_SEC * 1000);
  },

  closeEnd(end) {
    if (!this.endOpen) return;
    clearTimeout(this.endTimer);
    this.endOpen = false;
    $('#end-ask').classList.remove('active');
    const a = this.app;
    if (end && a.inRound) {
      a.setPaused(false);
      a.endEarly();
    } else if (a.inRound) {
      a.log.ev('end_cancel');
    }
    this.syncPause();
  },

  // 라운드 도중 참가자가 자리를 떠났을 때: 안내 → 그래도 없으면 결과 화면으로 (점수는 남겨 둔다)
  checkIdle() {
    const a = this.app;
    const idle = (a.clock - this.activeAt) / 1000;
    if (idle < this.IDLE_SEC) {
      if (this.alertKind === 'idle') a.log.ev('idle_resumed');
      return this.hideAlert('idle');
    }
    const left = this.IDLE_SEC + this.IDLE_GRACE_SEC - idle;
    if (left <= 0) {
      this.hideAlert('idle');
      a.endRound('idle');
      return;
    }
    if (this.alertKind !== 'idle') a.log.ev('idle_prompt');
    this.showAlert('idle', '아직 하고 계신가요?', `페달을 밟거나 화면을 누르면 계속합니다<br><b>${Math.ceil(left)}</b>초 뒤에 게임을 마칩니다`);
  },

  // ---------------- 안내 (페달 끊김 / 자리 비움) ----------------
  // 페달 끊김이 자리 비움보다 우선한다
  showAlert(kind, title, text) {
    if (kind === 'idle' && this.alertKind === 'link') return;
    this.alertKind = kind;
    $('#alert-title').textContent = title;
    $('#alert-text').innerHTML = text;
    $('#alert').dataset.kind = kind;
    $('#alert').classList.add('active');
  },

  hideAlert(kind) {
    if (this.alertKind !== kind) return;
    this.alertKind = null;
    $('#alert').classList.remove('active');
  },

  // ---------------- 페달 연결 / 일시정지 ----------------
  onLink() {
    if (!this.app) return; // App.init 이 처음 상태를 알릴 때는 아직 init 전이다
    this.updateAttract();
    // 세션 설정 화면에서 페달이 붙거나 끊기면 운동 방식 칸을 다시 맞춘다
    if (this.app.state === 'setup') this.pickSetup({});
    this.syncPause();
  },

  // 스테이션 모드의 일시정지: 운영 메뉴(PIN 포함)가 열려 있을 때, '그만하기' 확인 창이 열려 있을 때, 센서로 하던 라운드에서 페달이 끊겼을 때,
  // 휴대폰을 가로로 눕혔을 때 (App.onRotate). 끊김과 눕힘은 다시 연결하거나 세우면 저절로 풀린다.
  syncPause() {
    const a = this.app;
    const lost = a.inRound && a.roundSensor && a.link.state !== 'ready';
    const want = a.inRound && (this.opOpen || this.pinOpen || this.endOpen || lost || a.rotated.matches);
    if (want !== a.paused) a.setPaused(want);
    if (lost && !this.opOpen) {
      const retrying = a.link.state === 'reconnecting' || a.link.state === 'connecting';
      this.showAlert('link', '페달 연결이 끊겼어요',
        retrying ? '다시 연결하는 중입니다. 잠시만 기다려 주세요.<br>게임 시간은 멈춰 있습니다.' : '진행 요원을 불러 주세요.<br>게임 시간은 멈춰 있습니다.');
    } else {
      this.hideAlert('link');
    }
    // 멈춰 있던 동안은 자리 비움으로 치지 않는다
    if (a.paused) this.activeAt = a.clock;
  },

  // ---------------- 결과 ----------------
  showResult({ sim = false } = {}) {
    const a = this.app;
    const cfg = a.cfg;
    const m = a.meter;
    const no = sim ? 0 : this.nextSeq();
    const { abil, kcal } = a.fillReport($('#demo-result'));

    $('#dr-id').textContent = sim ? '가상 결과 · 기록 안 됨' : `참가 번호 ${this.label(no)}`;
    $('#dr-id').classList.toggle('sim', sim);
    $('#dr-total').textContent = a.score.toLocaleString('ko-KR');
    $('#dr-break').textContent = a.brainOnly
      ? `두뇌 게임 ${a.cogScore.toLocaleString('ko-KR')} · 페달 없이`
      : `운동 ${a.exScore.toLocaleString('ko-KR')} + 두뇌 게임 ${a.cogScore.toLocaleString('ko-KR')}`;
    // 운영 버전: 회원 기록에 더하고, 손님이면 새 회원 번호와 QR 카드를 보여 준다 (세션 로그에 meta.user 를 붙이므로 저장보다 먼저)
    if (this.members) this.members.onResult(a, sim);
    Fx.confetti(1.2);
    if (sim) return a.show('demo-result');

    // 세션 로그에 참가 번호와 능력 점수를 붙여 저장한다
    if (a.log) {
      a.log.meta.station = this.station;
      a.log.meta.participant = this.label(no);
      a.log.meta.summary.abilities = Object.fromEntries(abil.map((x) => [x.id, x.hasData ? x.stars : null]));
      a.log.meta.summary.abilitiesRaw = Object.fromEntries(abil.map((x) => [x.id, x.raw]));
      this.storeLog(a.log);
    }

    const log = this.load('log', []);
    log.push({
      station: this.station, no, at: new Date().toISOString(),
      score: a.score, ex: a.exScore, cog: a.cogScore, track: a.brainOnly ? 'brain' : 'dual',
      kcal: Math.round(kcal * 10) / 10, distM: Math.round(m.distM), revs: Math.round(m.revs), cfg: Config.demoCode(cfg),
      abilities: Object.fromEntries(abil.map((x) => [x.id, x.hasData ? x.stars : null])),
    });
    this.save('log', log.slice(-this.LOG_MAX));
    a.show('demo-result');
  },

  // ---------------- 세션 로그 (js/session-log.js) ----------------
  storeLog(log) {
    SessionStore.put(log)
      .then(() => SessionUpload.kick())
      .catch((e) => (this.storeError = e.message || String(e)));
  },

  async renderSessions() {
    const el = $('#op-sess-count');
    try {
      const n = await SessionStore.count();
      let size = '';
      if (navigator.storage && navigator.storage.estimate) {
        const { usage } = await navigator.storage.estimate();
        size = ` · 저장 공간 약 ${(usage / 1048576).toFixed(1)} MB`;
      }
      el.textContent = `${n}건${size}${this.storeError ? ` · 마지막 저장 실패: ${this.storeError}` : ''}`;
    } catch (e) {
      el.textContent = `읽을 수 없음: ${e.message || e}`;
    }
  },

  // ---------------- 운영 메뉴 ----------------
  bindOp() {
    $('#op-close').onclick = () => this.closeOp();
    $('#op-end').onclick = () => {
      this.hideOp();
      if (this.app.state === 'play') this.app.endRound('operator');
    };
    $('#op-abandon').onclick = () => {
      this.hideOp();
      this.app.quit();
      this.syncPause();
    };
    $('#op-csv').onclick = () => this.downloadCsv();
    $('#op-sess-export').onclick = async () => {
      this.leaving = true; // 내려받기가 beforeunload 를 부를 수 있다
      try {
        const n = await SessionStore.exportAll(`exergame-sessions-station${this.station || ''}-${new Date().toISOString().slice(0, 10)}.jsonl`);
        if (!n) $('#op-sess-count').textContent = '저장된 로그가 없습니다';
      } catch (e) {
        $('#op-sess-count').textContent = `내보내기 실패: ${e.message || e}`;
      }
      setTimeout(() => (this.leaving = false), 1000);
    };
    $('#op-sim').onchange = () => {
      this.simResult = $('#op-sim').checked;
      this.updateAttract();
    };
    $('#op-kbd').onchange = () => {
      this.allowKbd = $('#op-kbd').checked;
      this.updateAttract();
      if (this.app.state === 'setup') this.pickSetup({});
    };
    $('#op-station').addEventListener('input', () => $('#op-station').classList.remove('invalid'));
    this.bindSettings();
    // 운영 버전: 대기 화면 오른쪽 아래의 '운영' 버튼 → PIN. 대기 화면을 눌러 시작하는 것과 겹치지 않게 막는다
    const pb = $('#att-pedal');
    if (pb) pb.addEventListener('pointerdown', (e) => e.stopPropagation());
    if (pb) pb.addEventListener('click', (e) => e.stopPropagation());
    const ob = $('#op-open');
    if (ob) {
      ob.addEventListener('pointerdown', (e) => e.stopPropagation());
      ob.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openPin();
      });
    }
    // 모서리 길게 누르기 → PIN
    const corner = $('#op-corner');
    let timer = null;
    const cancel = () => { clearTimeout(timer); timer = null; };
    corner.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      cancel();
      timer = setTimeout(() => { timer = null; this.openPin(); }, this.CORNER_HOLD_MS);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => corner.addEventListener(t, cancel));
  },

  // 대기 화면 안내와 운영 메뉴의 설정 요약
  renderCfg() {
    const c = this.app.cfg;
    $('#att-calib').textContent = `${c.calibrationSec}초`;
    // 운영 버전은 참가자가 시간을 고른다
    $('#att-dur').textContent = $('#setup')
      ? `${SESSION_LENGTHS[0].min}~${SESSION_LENGTHS[SESSION_LENGTHS.length - 1].min}분`
      : c.durationSec % 60 ? U.fmtTime(c.durationSec) : `${c.durationSec / 60}분`;
    const changed = Object.keys(Config.demoSaved()).length;
    const preset = Config.preset(Config.presetOf(c));
    $('#op-cfg').innerHTML = `설정 코드 <b>${Config.demoCode(c)}</b>${changed ? ` (기본값에서 ${changed}개 바꿈)` : ' (기본값)'} · ` +
      ($('#setup')
        ? `라운드 길이·난이도는 참가자가 고름 · `
        : `라운드 난이도 ${preset ? preset.label : '직접 설정'} · 라운드 ${U.fmtTime(c.durationSec)} · `) +
      `측정 ${c.calibrationSec}초 · 게임 ${this.app.enabledTypes().length}종<br>` +
      (this.pin ? '운영 메뉴는 왼쪽 위 모서리를 2초 누른 뒤 PIN 을 입력하면 열립니다.' : '운영 메뉴는 대기 화면의 ⚙ 운영 버튼이나 왼쪽 위 모서리 2초 누르기로 열립니다 (PIN 없음).');
  },

  // ---------------- 라운드 설정 (DEMO_SETTINGS) ----------------
  // 맨 위의 '라운드 난이도'는 저장하는 항목이 아니다. 고르면 프리셋에 든 칸(PRESET_KEYS)을 채우고, 칸을 고치면 맞는 프리셋을 다시 찾아 보여 준다.
  bindSettings() {
    const box = $('#op-set-fields');
    const presets = ROUND_PRESETS.map((p) => `<option value="${p.id}">${p.label}</option>`).join('');
    box.append(U.el('label', 'setting', `라운드 난이도<select id="op-set-preset">${presets}<option value="custom" disabled>직접 설정</option></select>`));
    const note = U.el('p', 'setting-note');
    note.id = 'op-set-preset-note';
    box.append(note);
    $('#op-set-preset').addEventListener('change', (e) => {
      const p = Config.preset(e.target.value);
      if (p) this.fillSettings({ ...this.readSettings(), ...p.values });
    });
    // 두 열로 나눠 놓는다. DEMO_SETTINGS 순서는 설정 코드(Config.demoCode)에 쓰이므로 바꾸지 않고 여기서만 가른다
    const cols = [U.el('div', 'op-set-col', '<h3>시간·점수·페달</h3>'), U.el('div', 'op-set-col', '<h3>미니게임 난이도</h3>')];
    box.append(...cols);
    const right = ['difficulty', 'startLevel', 'maxLevel', 'diffUp', 'diffDown', 'questionTimeScale', 'multiplierTop'];
    for (const s of DEMO_SETTINGS) {
      const input = s.options
        ? `<select data-key="${s.key}">${s.options.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`
        : `<input type="number" data-key="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" inputmode="decimal">`;
      cols[right.includes(s.key) ? 1 : 0].append(U.el('label', 'setting', `${s.label}${input}`));
    }
    // 프리셋 선택은 위에서 따로 다룬다 (input 이 change 보다 먼저 와서, 여기서 다시 맞추면 고른 값이 되돌아간다)
    const mark = (e) => e.target.id !== 'op-set-preset' && this.markSettings();
    box.addEventListener('input', mark);
    box.addEventListener('change', mark);
    $('#op-set-open').onclick = () => this.openSettings();
    $('#op-set-cancel').onclick = () => $('#op-set').classList.remove('active');
    $('#op-set-reset').onclick = () => this.fillSettings(Config.demoDefaults());
    $('#op-set-save').onclick = () => this.saveSettings();
  },

  openSettings() {
    if (this.app.inRound) return;
    this.fillSettings(this.app.cfg);
    $('#op-set').classList.add('active');
    // 설명이 프리셋마다 길이가 달라 아래 칸들이 오르내리지 않게 가장 긴 설명만큼 자리를 잡아 둔다 (보이는 동안에만 잴 수 있다)
    U.reserveHeight($('#op-set-preset-note'), Config.presetNotes());
  },

  fillSettings(cfg) {
    for (const s of DEMO_SETTINGS) {
      const el = $(`#op-set-fields [data-key="${s.key}"]`);
      const v = cfg[s.key];
      el.value = s.options ? v : Math.round(v * (s.scale || 1) * 1000) / 1000;
    }
    this.markSettings();
  },

  readSettings() {
    const out = {};
    for (const s of DEMO_SETTINGS) {
      const el = $(`#op-set-fields [data-key="${s.key}"]`);
      if (s.options) {
        out[s.key] = el.value;
        continue;
      }
      const v = parseFloat(el.value);
      const def = Config.demoDefaults()[s.key];
      // 소수 단계(0.05 등)는 부동소수 찌꺼기 없이 저장한다
      out[s.key] = Number.isFinite(v) ? Math.round((U.clamp(v, s.min, s.max) / (s.scale || 1)) * 10000) / 10000 : def;
    }
    return out;
  },

  // 기본값과 다른 항목을 표시하고, 저장하면 될 설정 코드를 미리 보여 준다
  markSettings() {
    const v = this.readSettings();
    const def = Config.demoDefaults();
    for (const s of DEMO_SETTINGS) {
      $(`#op-set-fields [data-key="${s.key}"]`).parentElement.classList.toggle('changed', v[s.key] !== def[s.key]);
    }
    $('#op-set-code').textContent = `설정 코드 ${Config.demoCode(v)}`;
    const id = Config.presetOf(v);
    $('#op-set-preset').value = id;
    $('#op-set-preset-note').textContent = Config.presetNote(id);
    PRESET_KEYS.forEach((k) => $(`#op-set-fields [data-key="${k}"]`).parentElement.classList.toggle('preset', id !== 'custom'));
  },

  saveSettings() {
    const v = this.readSettings();
    Config.demoSave(v);
    Object.assign(this.app.cfg, v);
    this.renderCfg();
    $('#op-set').classList.remove('active');
  },

  openOp() {
    const a = this.app;
    this.opOpen = true;
    $('#op-set-open').disabled = a.inRound;
    $('#op-set-open').textContent = a.inRound ? '라운드 설정 (라운드 중에는 못 바꿈)' : '라운드 설정';
    $('#op-station').value = this.station;
    $('#op-kbd').checked = this.allowKbd;
    $('#op-sim').checked = this.simResult;
    $('#op-station').classList.remove('invalid');
    $('#op-round').style.display = a.inRound ? '' : 'none';
    $('#op-end').style.display = a.state === 'play' ? '' : 'none';
    if (a.inRound) {
      const left = a.state === 'play' ? a.cfg.durationSec - a.elapsed : a.cfg.durationSec;
      $('#op-round-note').textContent = `라운드 진행 중 · 멈춰 있음 (남은 시간 ${U.fmtTime(left)})`;
    }
    $('#op-close').textContent = a.inRound ? '이어서 진행' : a.state === 'result' || a.state === 'ending' ? '결과 화면으로 돌아가기' : '대기 화면 열기';
    this.renderLog();
    this.renderSessions();
    this.renderUpload();
    this.app.renderMusicTry();
    if (a.inRound) a.log.ev('operator', { open: true });
    $('#op').classList.add('active');
    this.syncPause();
  },

  hideOp() {
    this.app.audio.endPreview();
    this.app.renderMusicTry();
    if (this.app.inRound && this.opOpen) this.app.log.ev('operator', { open: false });
    this.opOpen = false;
    $('#op-set').classList.remove('active');
    $('#op').classList.remove('active');
    this.syncPause();
  },

  closeOp() {
    const v = parseInt($('#op-station').value, 10);
    if (!(v >= 1 && v <= 99)) {
      $('#op-station').classList.add('invalid');
      $('#op-station').focus();
      return;
    }
    this.station = String(v);
    this.save('station', this.station);
    this.renderStation();
    this.enterKiosk();
    this.hideOp();
  },

  renderLog() {
    const log = this.load('log', []);
    $('#op-log-count').textContent = log.length ? `${log.length}건` : '';
    const el = $('#op-log');
    if (!log.length) {
      el.innerHTML = '<li class="board-empty">아직 기록이 없습니다</li>';
      return;
    }
    el.innerHTML = log.slice(-40).reverse().map((r) => {
      const t = new Date(r.at);
      const hm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
      return `<li><b>${r.station || '?'}-${String(r.no).padStart(3, '0')}</b><span>${hm}${r.track === 'brain' ? ' · 두뇌만' : ''}</span><span class="sc">${r.score.toLocaleString('ko-KR')}점</span></li>`;
    }).join('');
  },

  downloadCsv() {
    const log = this.load('log', []);
    // track: dual(페달 + 두뇌 게임) · brain(두뇌 게임만). 이 열을 더하기 전 기록은 dual
    const head = ['station', 'no', 'time', 'settings', 'track', 'score', 'exercise', 'cognitive', 'kcal', 'dist_m', 'revs', ...ABILITIES.map((x) => x.id)];
    const rows = log.map((r) => [r.station, r.no, r.at, r.cfg ?? '', r.track || 'dual', r.score, r.ex, r.cog, r.kcal, r.distM ?? '', r.revs, ...ABILITIES.map((x) => r.abilities?.[x.id] ?? '')]);
    const csv = '﻿' + [head, ...rows].map((row) => row.join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `exergame-station${this.station || ''}-${new Date().toISOString().slice(0, 10)}.csv`;
    this.leaving = true; // 다운로드도 beforeunload 를 부를 수 있다
    a.click();
    setTimeout(() => { this.leaving = false; URL.revokeObjectURL(a.href); }, 1000);
  },

  // ---------------- PIN ----------------
  bindPin() {
    $('#pin-pad').addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      e.preventDefault();
      this.armPinTimeout();
      const k = b.dataset.k;
      if (k === 'cancel') return this.closePin();
      if (k === 'del') this.pinBuf = this.pinBuf.slice(0, -1);
      else if (this.pinBuf.length < this.pin.length) this.pinBuf += b.textContent;
      this.renderPin();
      if (this.pinBuf.length < this.pin.length) return;
      if (this.pinBuf === this.pin) {
        this.closePin(true);
        this.openOp();
      } else {
        const dots = $('#pin-dots');
        dots.classList.remove('shake');
        void dots.offsetWidth;
        dots.classList.add('shake');
        this.pinBuf = '';
        setTimeout(() => this.renderPin(), 350);
      }
    });
  },

  // 운영 메뉴 PIN (비어 있으면 PIN 없이 연다)
  get pin() {
    return APP_OPERATOR_PIN;
  },

  openPin() {
    if (this.opOpen || this.pinOpen) return;
    if (!this.pin) return this.openOp();
    this.pinOpen = true;
    this.pinBuf = '';
    this.renderPin();
    $('#pin').classList.add('active');
    this.armPinTimeout();
    this.syncPause();
  },

  closePin(keepPaused = false) {
    clearTimeout(this.pinTimer);
    this.pinOpen = false;
    $('#pin').classList.remove('active');
    if (!keepPaused) this.syncPause();
  },

  armPinTimeout() {
    clearTimeout(this.pinTimer);
    this.pinTimer = setTimeout(() => this.closePin(), this.PIN_TIMEOUT_MS);
  },

  renderPin() {
    $('#pin-dots').querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i < this.pinBuf.length));
  },

  // ---------------- 결과 화면: 길게 눌러 다음 참가자 ----------------
  bindHolds() {
    const btn = $('#dr-next');
    let timer = null;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
      btn.classList.remove('holding');
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      cancel();
      btn.classList.add('holding');
      btn.style.setProperty('--hold', `${this.NEXT_HOLD_MS}ms`);
      timer = setTimeout(() => {
        cancel();
        this.app.show('attract');
      }, this.NEXT_HOLD_MS);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => btn.addEventListener(t, cancel));
  },

  // ---------------- 무인 운영 장치 ----------------
  bindGuards() {
    // 새로고침·뒤로 가기로 진행 중인 게임이나 결과가 날아가지 않게
    window.addEventListener('beforeunload', (e) => {
      if (this.leaving) return;
      e.preventDefault();
      e.returnValue = '';
    });
    history.pushState(null, '', location.href);
    window.addEventListener('popstate', () => history.pushState(null, '', location.href));
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    // 두 손가락 확대 막기 (게임 화면이 어긋난다)
    const vp = document.querySelector('meta[name="viewport"]');
    vp.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
    window.addEventListener('pointerdown', () => {
      this.activeAt = this.app.clock;
      // 전체 화면이 풀렸으면 다음 터치 때 다시 들어간다 (전체 화면은 터치 같은 사용자 동작 안에서만 요청할 수 있다)
      if (this.kiosk) this.requestFullscreen();
    }, true);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.kiosk) this.requestWakeLock();
    });
  },

  enterKiosk() {
    this.kiosk = true;
    this.requestFullscreen();
    this.requestWakeLock();
  },

  requestFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  },

  async requestWakeLock() {
    if (!('wakeLock' in navigator) || (this.wakeLock && !this.wakeLock.released)) return;
    try { this.wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
  },
};
