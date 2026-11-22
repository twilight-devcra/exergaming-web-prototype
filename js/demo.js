// 스테이션 흐름: 운영 버전(app/index.html)이 쓴다. 처음엔 시연 행사용으로 만들었다 (배경은 docs/DEMO_BRIEF.md).
// 흐름: 대기 화면 → (회원 로그인 → 세션 설정, app/members.js) → 속도 측정 → 라운드 → 결과 → 길게 눌러 초기화 → 대기 화면
// 라운드 자체는 main.js 의 App 흐름을 그대로 쓰고, 여기서는 그 앞뒤 화면과 무인 운영 장치만 맡는다.
// 설정은 js/config.js 의 DEMO_CONFIG 이고, 운영 메뉴의 '라운드 설정'에서 DEMO_SETTINGS 항목만 태블릿마다 바꿀 수 있다.
// 운영 메뉴(PIN · 라운드 설정 · 업로드 · 기록 내려받기)는 app/operator-menu.js 에 있다.
import { BASE_LEVEL, SESSION_LENGTHS, SESSION_DIFFICULTIES, SESSION_TRACKS, SESSION_DEFAULT, Config, $, Util } from './config.js';
import { Exercise } from './exercise.js';
import { Effects } from './fx.js';
import { GAME_TYPES } from './games/index.js';
import { SessionStore } from './session-log.js';
import { SessionUpload } from './session-upload.js';
import { RoundStats } from './round-stats.js';
import { RoundReport } from './round-report.js';
import { Abilities } from './abilities.js';
import { AttractVisual } from '../app/attract-visual.js';
import { CalibVisual } from '../app/calib-visual.js';
import { MemberUI } from '../app/members.js';
import { OperatorMenu } from '../app/operator-menu.js';

export const Demo = {
  IDLE_SEC: 40,          // 라운드 중 페달도 터치도 없이 이만큼 지나면 '아직 하고 계신가요?'
  IDLE_GRACE_SEC: 15,    // 그 안내 뒤 이만큼 더 지나면 라운드를 끝내고 결과를 보여준다
  CALIB_IDLE_SEC: 60,    // 측정 화면에서 페달을 밟지 않고 이만큼 지나면 대기 화면으로 돌아간다
  SETUP_IDLE_SEC: 60,    // 세션 설정 화면(운영 버전)에서 누르지도 밟지도 않고 이만큼 지나면 대기 화면으로 돌아간다
  PEDAL_START_SEC: 2.5,  // 대기 화면에서 이만큼 계속 밟으면 시작
  ATTRACT_LOCK_SEC: 4,   // 대기 화면이 뜬 직후에는 페달로 시작하지 않는다 (앞 참가자가 아직 밟고 있을 수 있다)
  RPM_ACTIVE: 10,        // 이보다 빠르면 '밟고 있다'로 본다
  NEXT_HOLD_MS: 500,    // 결과 화면의 '다음 참가자'를 이만큼 누르고 있어야 넘어간다 (참가자가 실수로 지우지 않게)
  END_ASK_SEC: 30,       // '그만하기' 확인 창에 이만큼 답이 없으면 그대로 마친다 (누르고 자리를 떠난 경우)
  LOG_MAX: 1000,

  app: null,
  station: '',
  allowKeyboard: false,  // 페달 없이 A/D 키로 시작할 수 있게 한다 (점검용). app/?kbd 또는 운영 메뉴에서 켠다. 저장하지 않으므로 새로고침하면 꺼진다
  simResult: false, // 시작하면 라운드 없이 가상 성적으로 바로 결과 화면을 연다 (흐름 점검용). 저장하지 않는다
  kiosk: false,     // 운영 메뉴를 한 번 닫은 뒤부터 전체 화면·화면 꺼짐 방지를 유지한다
  menu: null,       // 운영 메뉴 (app/operator-menu.js). menu.isOpen · menu.pinOpen 이면 게임을 멈춘다
  endOpen: false,   // '그만하기' 확인 창이 열려 있다 (게임은 멈춤)
  leaving: false,   // 파일을 내려받는 중이라 beforeunload 경고를 띄우지 않는다
  storeError: '',   // 세션 로그를 마지막으로 저장하지 못한 까닭 (운영 메뉴에 보인다)
  activeAt: 0,      // 마지막으로 페달을 밟거나 화면을 누른 게임 시계 시각 (ms)
  attractAt: 0,
  previousState: null,
  pedalHold: 0,
  alertKind: null,

  init(app) {
    this.app = app;
    document.body.classList.add('demo');
    this.allowKeyboard = new URLSearchParams(location.search).has('kbd');
    this.station = this.load('station', '');
    // 대기 화면 오른쪽 그림: 바퀴 안의 두뇌 (app/attract-visual.js)
    this.preview = AttractVisual.init(app);
    // 운영 버전: 속도 측정 화면의 둥근 길과 자전거 (app/calib-visual.js)
    this.calibVisual = CalibVisual.init();
    // 운영 버전: QR 회원 (app/members.js). 대기 화면 → 로그인 → 기록 → 세션 설정
    this.members = MemberUI.init(this, app);
    // 운영 메뉴: ⚙ 버튼·모서리 길게 누르기 → PIN → 메뉴 (app/operator-menu.js)
    this.menu = OperatorMenu.init(this, app);
    this.bindEnd();
    this.bindSetup();
    this.bindHolds();
    this.bindGuards();
    // 대기 화면에서 시작된 터치만 시작으로 친다. 결과 화면의 '다음 참가자'를 길게 누르고 손을 떼면
    // 터치는 그 자리(이제 대기 화면)에 click 을 만들어서, 그대로 두면 바로 다음 판이 시작돼 버린다.
    let pressed = false;
    // 대기 화면의 '페달 연결' 버튼을 누른 것은 시작으로 치지 않는다
    const pedalButton = $('#att-pedal');
    if (pedalButton) {
      pedalButton.addEventListener('pointerdown', (event) => event.stopPropagation());
      pedalButton.addEventListener('click', (event) => event.stopPropagation());
    }
    $('#attract').addEventListener('pointerdown', () => (pressed = true));
    $('#attract').addEventListener('click', () => {
      if (pressed) this.start();
      pressed = false;
    });
    this.renderConfig();
    app.show('attract');
    this.renderStation();
    this.updateAttract();
    // 바로 대기 화면. 페달은 대기 화면의 '페달 연결' 버튼으로, 전체 화면은 시작을 누를 때 요청한다
    // (페달 연결(기기 선택)과 전체 화면은 사람이 화면을 눌러야만 요청할 수 있다)
    if (!this.station) this.station = '1'; // 운영 메뉴에서 바꿀 수 있다 (저장은 그때)
    this.renderStation();
  },

  // ---------------- 저장 (태블릿마다 따로) ----------------
  load(key, fallback) {
    try {
      const stored = localStorage.getItem(`exergame.demo.${key}`);
      return stored == null ? fallback : JSON.parse(stored);
    } catch { return fallback; }
  },

  save(key, value) {
    try { localStorage.setItem(`exergame.demo.${key}`, JSON.stringify(value)); } catch { /* 저장 못 해도 넘어간다 */ }
  },

  // 결과마다 붙는 번호. 종이 기록이 섞이지 않도록 스테이션 번호를 앞에 붙여(3-017) 크게 보여준다. 새로고침해도 이어진다.
  nextSeq() {
    const next = this.load('seq', 0) + 1;
    this.save('seq', next);
    return next;
  },

  label(participantNumber) {
    return `${this.station || '?'}-${String(participantNumber).padStart(3, '0')}`;
  },

  renderStation() {
    document.querySelectorAll('.st-name').forEach((nameTag) => (nameTag.textContent = this.station ? `스테이션 ${this.station}` : ''));
  },

  // ---------------- 대기 화면 ----------------
  // 페달을 쓸 수 있는가 (연결됨, 또는 점검용 키보드). 없으면 세션 설정에서 '두뇌 게임만'만 고를 수 있다
  pedalReady() {
    return this.app.link.state === 'ready' || this.allowKeyboard;
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
    const pedalButton = $('#att-pedal');
    if (pedalButton) pedalButton.hidden = this.app.link.state === 'ready';
  },

  // via: tap(화면을 눌러서) | pedal(페달을 밟아서)
  // 운영 버전은 먼저 세션 설정 화면에서 시간과 난이도를 고른다
  start(via = 'tap') {
    const app = this.app;
    if (app.state !== 'attract' || this.menu.isOpen || this.menu.pinOpen || !this.canStart()) return;
    this.enterKiosk();
    if (this.simResult) return this.simulateRound();
    if (this.members) return this.members.openLogin(via);
    if ($('#setup')) return this.openSetup(via);
    this.beginRound(via);
  },

  beginRound(via, session = null) {
    const app = this.app;
    if (session) Object.assign(app.config, Config.session(session.min, session.difficulty));
    // 운동 방식은 판마다 고른다 (세션 로그를 만들기 전에 넣어야 meta.track 에 남는다)
    app.config.brainOnly = !!session && session.track === 'brain';
    app.startRound();
    // 회원이면 지난 세션들이 기념물로 길가에 선다 (손님·프로토타입은 없음)
    app.band.setLandmarks(this.members ? this.members.landmarks() : []);
    app.log.meta.station = this.station;
    if (session) app.log.meta.session = { ...session };
    if (this.members) this.members.tagLog(app.log);
    app.log.event('start', { via, ...(session ? { session } : {}) });
    this.activeAt = app.clock;
    this.renderConfig();
  },

  // 라운드 끝에 세울 기념물 { recordNumber, difficulty, min } (js/band.js plant). 운영 버전(회원·손님)만, 아니면 null
  plantInfo() {
    if (!this.members) return null;
    const session = (this.app.log && this.app.log.meta.session) || {};
    return { recordNumber: this.members.nextCount(), difficulty: session.difficulty, min: session.min };
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
    $('#su-track').innerHTML = SESSION_TRACKS.map((track) =>
      tile(`data-track="${track.id}"`, track.label, track.desc, `<i class="su-ico" aria-hidden="true">${icons[track.id]}</i>`)).join('');
    $('#su-len').innerHTML = SESSION_LENGTHS.map((length) => tile(`data-min="${length.min}"`, length.label, length.desc)).join('');
    $('#su-diff').innerHTML = SESSION_DIFFICULTIES.map((difficulty, i) =>
      tile(`data-diff="${difficulty.id}"`, difficulty.label, difficulty.desc, `<i class="su-bars" data-n="${i + 1}"><span></span><span></span><span></span></i>`)).join('');
    $('#setup').addEventListener('pointerdown', () => {
      this.activeAt = this.app.clock;
      this.app.audio.ensure(); // 페달로 들어와 소리가 막혀 있었으면 누를 때 풀린다
    });
    $('#su-len').addEventListener('click', (event) => {
      const button = event.target.closest('[data-min]');
      if (button) this.pickSetup({ min: +button.dataset.min });
    });
    $('#su-track').addEventListener('click', (event) => {
      const button = event.target.closest('[data-track]');
      if (button && !button.disabled) this.pickSetup({ track: button.dataset.track });
    });
    $('#su-diff').addEventListener('click', (event) => {
      const button = event.target.closest('[data-diff]');
      if (button) this.pickSetup({ difficulty: button.dataset.diff });
    });
    $('#su-back').onclick = () => this.app.show('attract');
    $('#su-go').onclick = () => {
      if (this.app.state !== 'setup' || this.menu.isOpen || this.menu.pinOpen) return;
      this.beginRound(this.setupVia, this.setup);
    };
  },

  // preset: 미리 골라 둘 { min, difficulty, track } (회원이면 지난번 것)
  openSetup(via, preset = null) {
    const app = this.app;
    this.setupVia = via;
    this.setup = { ...SESSION_DEFAULT, ...(preset || {}) };
    if (!SESSION_TRACKS.some((track) => track.id === this.setup.track)) this.setup.track = SESSION_DEFAULT.track;
    this.pickSetup({});
    app.show('setup');
    app.state = 'setup';
    this.activeAt = app.clock;
    // 고르는 동안 잔잔한 음악 (화면을 떠나면 tick 이 끈다)
    if (app.config.sound) app.audio.ambient(true);
  },

  pickSetup(change) {
    if (!this.setup) return;
    Object.assign(this.setup, change);
    // 페달이 없으면 두뇌 게임만 (페달 칸은 막고 까닭을 적는다)
    const pedal = this.pedalReady();
    if (!pedal) this.setup.track = 'brain';
    const { min, difficulty, track } = this.setup;
    document.querySelectorAll('#su-track [data-track]').forEach((button) => {
      const option = SESSION_TRACKS.find((candidate) => candidate.id === button.dataset.track);
      const off = option.id === 'dual' && !pedal;
      button.classList.toggle('on', option.id === track);
      button.disabled = off;
      button.querySelector('small').textContent = off ? '페달 연결 필요' : option.desc;
    });
    document.querySelectorAll('#su-len [data-min]').forEach((button) => button.classList.toggle('on', +button.dataset.min === min));
    document.querySelectorAll('#su-diff [data-diff]').forEach((button) => button.classList.toggle('on', button.dataset.diff === difficulty));
    const chosen = SESSION_DIFFICULTIES.find((candidate) => candidate.id === difficulty);
    $('#su-sum').textContent = `${min}분 · ${chosen ? chosen.label : ''} · ` +
      (track === 'brain' ? '두뇌 게임만, 바로 시작합니다' : '페달 속도를 잰 뒤 시작합니다');
  },

  // 라운드를 돌리지 않고 그럴듯한 성적을 채워 결과 화면을 연다. 참가 번호를 쓰지 않고 기록에도 남기지 않는다.
  simulateRound() {
    const app = this.app;
    const config = app.config;
    const randomInt = Util.randomInt;
    const exerciseMax = Math.floor(config.durationSec / config.tickSec) * config.tickMaxPoints;
    app.roundStats = new RoundStats(GAME_TYPES); // 게임별 성적을 아래에서 가상 값으로 바꿔 넣는다
    app.brainOnly = false;
    let cog = 0;
    for (const gameType of GAME_TYPES) {
      const total = gameType.id === 'path' ? randomInt(8, 14) : 3 * randomInt(1, 2);
      const correct = randomInt(Math.floor(total * 0.3), total);
      const points = Math.round(correct * randomInt(25, 45));
      cog += points;
      const level = randomInt(BASE_LEVEL, BASE_LEVEL + 3);
      const runs = level > BASE_LEVEL ? [[level - 1, Math.ceil(correct / 2), Math.ceil(total / 2)], [level, Math.floor(correct / 2), Math.floor(total / 2)]] : [[level, correct, total]];
      // 답하는 속도: 문제마다 제한 시간의 30~70% 를 남긴 것처럼
      const limitMs = total * randomInt(8000, 14000);
      // eslint-disable-next-line id-length -- 세션 로그 형식 (js/round-stats.js)
      const think = { n: total, ms: 0, first: 0, out: 0, outMs: 0, limitMs, spareMs: Math.round(limitMs * randomInt(30, 70) / 100) };
      // eslint-disable-next-line id-length -- 세션 로그 형식 (js/round-stats.js)
      app.roundStats.games[gameType.id] = { plays: runs.length, cleared: 0, correct, total, points, level, runs, ms: total * randomInt(4000, 12000), think };
    }
    app.exScore = Math.round(exerciseMax * randomInt(55, 95) / 100);
    app.cogScore = cog;
    app.score = app.exScore + app.cogScore;
    const rpm = randomInt(45, 75);
    const meter = app.meter;
    meter.reset();
    meter.activeSec = config.durationSec - randomInt(0, 20);
    meter.revs = (rpm / 60) * meter.activeSec;
    meter.kcal = Exercise.kcalPerSec(rpm) * meter.activeSec;
    app.state = 'result';
    this.showResult({ sim: true });
  },

  // ---------------- 매 프레임 (일시정지 중에는 불리지 않는다) ----------------
  tick(deltaSec, rpm) {
    const app = this.app;
    if (rpm > this.RPM_ACTIVE) this.activeAt = app.clock;
    if (!['login', 'history', 'setup'].includes(app.state)) app.audio.ambient(false);
    const entered = app.state !== this.previousState;
    if (this.members) this.members.tick(app, entered);
    this.previousState = app.state;

    if (app.state === 'attract') {
      if (entered) {
        this.attractAt = app.clock;
        this.pedalHold = 0;
      }
      if (this.preview) this.preview.tick(deltaSec, rpm);
      const ready = (app.clock - this.attractAt) / 1000 > this.ATTRACT_LOCK_SEC && !this.menu.isOpen && this.canStart();
      this.pedalHold = ready && rpm > this.RPM_ACTIVE ? this.pedalHold + deltaSec : Math.max(0, this.pedalHold - deltaSec);
      if (this.pedalHold >= this.PEDAL_START_SEC) this.start('pedal');
    } else if (app.state === 'setup') {
      if ((app.clock - this.activeAt) / 1000 > this.SETUP_IDLE_SEC) app.show('attract');
    } else if (app.state === 'calib') {
      if (this.calibVisual) {
        if (entered) this.calibVisual.reset();
        this.calibVisual.tick(deltaSec, app.calib.started ? rpm : 0, app.calib, app.config.calibrationSec);
      }
      // 시작만 눌러 놓고 자리를 떠난 경우
      if (!app.calib.started && (app.clock - this.activeAt) / 1000 > this.CALIB_IDLE_SEC) app.quit();
    } else if (app.state === 'play') {
      this.checkIdle();
    }
    if (app.state !== 'play') this.hideAlert('idle');
    const canEnd = app.inRound && !this.endOpen;
    document.querySelectorAll('.end-btn').forEach((button) => (button.hidden = !canEnd));
    if (this.endOpen && !app.inRound) this.closeEnd(false);
  },

  // ---------------- 그만하기 (참가자가 세션을 도중에 마침) ----------------
  // 속도 측정·라운드 중 구석의 작은 버튼 → 확인 창(게임 멈춤) → 마치면 하던 데까지 세션 로그에 남기고 대기 화면으로 (App.endEarly)
  bindEnd() {
    document.querySelectorAll('.end-btn').forEach((button) => (button.onclick = () => this.openEnd()));
    $('#end-no').onclick = () => this.closeEnd(false);
    $('#end-yes').onclick = () => this.closeEnd(true);
  },

  openEnd() {
    const app = this.app;
    if (!app.inRound || this.endOpen || this.menu.isOpen) return;
    this.endOpen = true;
    app.log.event('end_ask');
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
    const app = this.app;
    if (end && app.inRound) {
      app.setPaused(false);
      app.endEarly();
    } else if (app.inRound) {
      app.log.event('end_cancel');
    }
    this.syncPause();
  },

  // 라운드 도중 참가자가 자리를 떠났을 때: 안내 → 그래도 없으면 결과 화면으로 (점수는 남겨 둔다)
  checkIdle() {
    const app = this.app;
    const idle = (app.clock - this.activeAt) / 1000;
    if (idle < this.IDLE_SEC) {
      if (this.alertKind === 'idle') app.log.event('idle_resumed');
      return this.hideAlert('idle');
    }
    const left = this.IDLE_SEC + this.IDLE_GRACE_SEC - idle;
    if (left <= 0) {
      this.hideAlert('idle');
      app.endRound('idle');
      return;
    }
    if (this.alertKind !== 'idle') app.log.event('idle_prompt');
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
    const app = this.app;
    const lost = app.inRound && app.roundSensor && app.link.state !== 'ready';
    const want = app.inRound && (this.menu.isOpen || this.menu.pinOpen || this.endOpen || lost || app.rotated.matches);
    if (want !== app.paused) app.setPaused(want);
    if (lost && !this.menu.isOpen) {
      const retrying = app.link.state === 'reconnecting' || app.link.state === 'connecting';
      this.showAlert('link', '페달 연결이 끊겼어요',
        retrying ? '다시 연결하는 중입니다. 잠시만 기다려 주세요.<br>게임 시간은 멈춰 있습니다.' : '진행 요원을 불러 주세요.<br>게임 시간은 멈춰 있습니다.');
    } else {
      this.hideAlert('link');
    }
    // 멈춰 있던 동안은 자리 비움으로 치지 않는다
    if (app.paused) this.activeAt = app.clock;
  },

  // ---------------- 결과 ----------------
  showResult({ sim = false } = {}) {
    const app = this.app;
    const config = app.config;
    const meter = app.meter;
    const participantNumber = sim ? 0 : this.nextSeq();
    const { abilityAxes, kcal, keep, gameAccuracy, recommendation } = RoundReport.fill(app, $('#demo-result'));

    $('#dr-id').textContent = sim ? '가상 결과 · 기록 안 됨' : `참가 번호 ${this.label(participantNumber)}`;
    $('#dr-id').classList.toggle('sim', sim);
    $('#dr-total').textContent = app.score.toLocaleString('ko-KR');
    $('#dr-break').textContent = app.brainOnly
      ? `두뇌 게임 ${app.cogScore.toLocaleString('ko-KR')} · 페달 없이`
      : `운동 ${app.exScore.toLocaleString('ko-KR')} + 두뇌 게임 ${app.cogScore.toLocaleString('ko-KR')}`;
    // 운영 버전: 회원 기록에 더하고, 손님이면 새 회원 번호와 QR 카드를 보여 준다 (세션 로그에 meta.user 를 붙이므로 저장보다 먼저)
    if (this.members) this.members.onResult(app, sim);
    Effects.confetti(1.2);
    if (sim) return app.show('demo-result');

    // 세션 로그에 참가 번호와 능력 점수를 붙여 저장한다
    if (app.log) {
      app.log.meta.station = this.station;
      app.log.meta.participant = this.label(participantNumber);
      // 두뇌 그래프의 축마다 0~1 (인지 영역 정답률 · 답하는 속도 · 운동, js/abilities.js). 2026-11-20 전 로그는 abilities(별)·abilitiesRaw 였다
      app.log.meta.summary.domains = Abilities.record(abilityAxes);
      // 결과 화면의 별점 (js/stars.js): 운동 정확도(속도 유지율, 두뇌 게임만이면 null)·게임 정확도와 권한 다음 난이도
      app.log.meta.summary.accuracy = {
        exercise: app.brainOnly ? null : keep / 100,
        game: gameAccuracy == null ? null : Math.round(gameAccuracy * 1000) / 1000,
        recommend: recommendation.kind, recommendTo: recommendation.target ? recommendation.target.id : null, // up · keep · down 과 권한 난이도
      };
      this.storeLog(app.log);
    }

    const log = this.load('log', []);
    /* eslint-disable id-length -- 저장된 기록 형식 (exergame.demo.log, 운영 메뉴가 내려받는다) */
    log.push({
      station: this.station, no: participantNumber, at: new Date().toISOString(),
      score: app.score, ex: app.exScore, cog: app.cogScore, track: app.brainOnly ? 'brain' : 'dual',
      kcal: Math.round(kcal * 10) / 10, distM: Math.round(meter.distM), revs: Math.round(meter.revs), cfg: Config.demoCode(config),
      domains: Abilities.record(abilityAxes),
    });
    /* eslint-enable id-length */
    this.save('log', log.slice(-this.LOG_MAX));
    app.show('demo-result');
  },

  // ---------------- 세션 로그 (js/session-log.js) ----------------
  storeLog(log) {
    SessionStore.put(log)
      .then(() => SessionUpload.kick())
      .catch((error) => (this.storeError = error.message || String(error)));
  },


  // 대기 화면 안내와 운영 메뉴의 설정 요약
  renderConfig() {
    const config = this.app.config;
    $('#att-calib').textContent = `${config.calibrationSec}초`;
    // 운영 버전은 참가자가 시간을 고른다
    $('#att-dur').textContent = $('#setup')
      ? `${SESSION_LENGTHS[0].min}~${SESSION_LENGTHS[SESSION_LENGTHS.length - 1].min}분`
      : config.durationSec % 60 ? Util.formatTime(config.durationSec) : `${config.durationSec / 60}분`;
    this.menu.renderSummary();
  },

  // ---------------- 결과 화면: 길게 눌러 다음 참가자 ----------------
  bindHolds() {
    const button = $('#dr-next');
    let timer = null;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
      button.classList.remove('holding');
    };
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      cancel();
      button.classList.add('holding');
      button.style.setProperty('--hold', `${this.NEXT_HOLD_MS}ms`);
      timer = setTimeout(() => {
        cancel();
        this.app.show('attract');
      }, this.NEXT_HOLD_MS);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => button.addEventListener(type, cancel));
  },

  // ---------------- 무인 운영 장치 ----------------
  bindGuards() {
    // 새로고침·뒤로 가기로 진행 중인 게임이나 결과가 날아가지 않게
    window.addEventListener('beforeunload', (event) => {
      if (this.leaving) return;
      event.preventDefault();
      event.returnValue = '';
    });
    history.pushState(null, '', location.href);
    window.addEventListener('popstate', () => history.pushState(null, '', location.href));
    document.addEventListener('contextmenu', (event) => event.preventDefault());
    // 두 손가락 확대 막기 (게임 화면이 어긋난다)
    const viewport = document.querySelector('meta[name="viewport"]');
    viewport.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
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
    const root = document.documentElement;
    if (document.fullscreenElement || !root.requestFullscreen) return;
    root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  },

  async requestWakeLock() {
    if (!('wakeLock' in navigator) || (this.wakeLock && !this.wakeLock.released)) return;
    try { this.wakeLock = await navigator.wakeLock.request('screen'); } catch { /* 화면 꺼짐 방지를 못 해도 넘어간다 */ }
  },
};

// 운영 버전(스테이션)의 판 갈고리 (js/edition.js 의 Edition). 일은 Demo 가 한다
/** @type {import('./edition.js').Edition} */
export const StationEdition = {
  mode: 'demo',
  homeScreen: 'attract',
  pauseMenu: false, // 운영 메뉴 · 페달 끊김 · 눕힘으로만 멈춘다 (Demo.syncPause)
  devKeys: false,
  loadConfig: () => Config.demo(),
  bindScreens(app) {
    // 세션 성과·운동량 카드를 스테이션 결과 화면의 최종 점수 카드 뒤에 붙인다
    $('#demo-result .dr-grid').append(RoundReport.card());
    app.applySource(); // 메뉴를 거치지 않으므로 속도 측정 방식(lz 파형 사용 여부)만 따로 적용한다
  },
  start: (app) => Demo.init(app),
  beforeRound() {},
  onScreen() {},
  tick: (app, deltaSec, rpm) => Demo.tick(deltaSec, rpm),
  // App.init 이 처음 상태를 알릴 때(Demo.init 전)에도 App 의 기본 처리는 하지 않는다
  onLink(app, state, detail) {
    Demo.onLink(state, detail);
    return true;
  },
  onRotate() {
    Demo.syncPause();
    return true;
  },
  logClosed(app, log, ended) {
    // 결과 화면까지 가지 않은 판은 여기서 저장한다 (결과 화면까지 간 판은 Demo.showResult 가 저장)
    if (ended === 'abandoned' || ended === 'user') Demo.storeLog(log);
  },
  plantInfo: () => Demo.plantInfo(),
  roundPreset: () => null, // 세션 설정 화면에서 고른 세션 난이도로 권한다
  remembersSetup: () => !!Demo.members,
  showResult() {
    Demo.showResult();
    return true;
  },
};
