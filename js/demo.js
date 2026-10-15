// 시연 행사 스테이션 모드 (index.html?demo). 배경은 docs/DEMO_BRIEF.md.
// 흐름: 운영 메뉴(처음 한 번) → 대기 화면 → 속도 측정 → 라운드 → 결과 → 진행 요원이 길게 눌러 초기화 → 대기 화면
// 라운드 자체는 main.js 의 App 흐름을 그대로 쓰고, 여기서는 그 앞뒤 화면과 무인 운영 장치만 맡는다.
// 설정은 js/config.js 의 DEMO_CONFIG 로 고정되고 화면에서 바꿀 수 없다.
const Demo = {
  IDLE_SEC: 40,          // 라운드 중 페달도 터치도 없이 이만큼 지나면 '아직 하고 계신가요?'
  IDLE_GRACE_SEC: 15,    // 그 안내 뒤 이만큼 더 지나면 라운드를 끝내고 결과를 보여준다
  CALIB_IDLE_SEC: 60,    // 측정 화면에서 페달을 밟지 않고 이만큼 지나면 대기 화면으로 돌아간다
  PEDAL_START_SEC: 2.5,  // 대기 화면에서 이만큼 계속 밟으면 시작
  ATTRACT_LOCK_SEC: 4,   // 대기 화면이 뜬 직후에는 페달로 시작하지 않는다 (앞 참가자가 아직 밟고 있을 수 있다)
  RPM_ACTIVE: 10,        // 이보다 빠르면 '밟고 있다'로 본다
  CORNER_HOLD_MS: 2000,  // 운영 메뉴: 왼쪽 위 모서리를 이만큼 누르고 있으면 PIN 입력
  NEXT_HOLD_MS: 500,    // 결과 화면의 '다음 참가자'를 이만큼 누르고 있어야 넘어간다 (참가자가 실수로 지우지 않게)
  PIN_TIMEOUT_MS: 20000,
  LOG_MAX: 1000,

  app: null,
  station: '',
  allowKbd: false,  // 페달 없이 A/D 키로 시작할 수 있게 한다 (점검용). ?demo&kbd 또는 운영 메뉴에서 켠다. 저장하지 않으므로 새로고침하면 꺼진다
  simResult: false, // 시작하면 라운드 없이 가상 성적으로 바로 결과 화면을 연다 (흐름 점검용). 저장하지 않는다
  kiosk: false,     // 운영 메뉴를 한 번 닫은 뒤부터 전체 화면·화면 꺼짐 방지를 유지한다
  opOpen: false,
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
    this.deco = { v: [60, 60, 60, 60, 60], to: [60, 60, 60, 60, 60], t: 0 };
    Radar.render($('#att-radar'), this.deco.v, null);
    this.bindOp();
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
    const c = app.cfg;
    $('#att-calib').textContent = `${c.calibrationSec}초`;
    $('#att-dur').textContent = c.durationSec % 60 ? U.fmtTime(c.durationSec) : `${c.durationSec / 60}분`;
    app.show('attract');
    this.renderStation();
    this.updateAttract();
    // 처음에는 운영 메뉴부터. 페달 연결(기기 선택)과 전체 화면은 사람이 화면을 눌러야만 요청할 수 있다.
    this.openOp();
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
  canStart() {
    return this.app.link.state === 'ready' || this.allowKbd || this.simResult;
  },

  updateAttract() {
    const ok = this.canStart();
    $('#att-start').disabled = !ok;
    // 테스트용 스위치가 켜져 있으면 그렇다고 보여준다 (행사 때 켜 둔 채로 두지 않게)
    const kbdOnly = ok && this.app.link.state !== 'ready';
    $('#att-hint').textContent = this.simResult
      ? '가상 결과 모드 · 누르면 게임 없이 결과 화면으로 갑니다'
      : kbdOnly ? '키보드 테스트 모드 · A/D 키를 번갈아 눌러 페달링합니다'
      : ok ? '화면을 누르거나 페달을 밟으면 시작합니다'
      : '페달 연결을 기다리는 중입니다 · 진행 요원에게 알려주세요';
    $('#att-hint').classList.toggle('warn', !ok || kbdOnly || this.simResult);
  },

  // via: tap(화면을 눌러서) | pedal(페달을 밟아서)
  start(via = 'tap') {
    const a = this.app;
    if (a.state !== 'attract' || this.opOpen || this.pinOpen || !this.canStart()) return;
    this.enterKiosk();
    if (this.simResult) return this.simulateRound();
    a.startRound();
    a.log.meta.station = this.station;
    a.log.ev('start', { via });
    this.activeAt = a.clock;
  },

  // 라운드를 돌리지 않고 그럴듯한 성적을 채워 결과 화면을 연다. 참가 번호를 쓰지 않고 기록에도 남기지 않는다.
  simulateRound() {
    const a = this.app;
    const cfg = a.cfg;
    const R = U.randInt;
    const exMax = Math.floor(cfg.durationSec / cfg.tickSec) * cfg.tickMaxPoints;
    a.stats = {};
    let cog = 0;
    for (const T of GAME_TYPES) {
      const total = T.id === 'path' ? R(8, 14) : 3 * R(1, 2);
      const correct = R(Math.floor(total * 0.3), total);
      const points = Math.round(correct * R(25, 45));
      cog += points;
      a.stats[T.id] = { plays: total > 6 && T.id !== 'path' ? 2 : 1, cleared: 0, correct, total, points, level: R(1, 2), ms: total * R(4000, 12000) };
    }
    a.exScore = Math.round(exMax * R(55, 95) / 100);
    a.cogScore = cog;
    a.score = a.exScore + a.cogScore;
    const rpm = R(45, 75);
    const m = a.meter;
    m.reset();
    m.activeSec = cfg.durationSec - R(0, 20);
    m.revs = (rpm / 60) * m.activeSec;
    m.joules = Exercise.watts(rpm) * m.activeSec;
    a.state = 'result';
    this.showResult({ sim: true });
  },

  // 장식용 그래프가 천천히 모양을 바꾼다
  animateDeco(dt) {
    const d = this.deco;
    d.t -= dt;
    if (d.t <= 0) {
      d.t = 2.6;
      d.to = d.v.map(() => U.randInt(38, 96));
    }
    const k = 1 - Math.exp(-dt / 0.6);
    d.v = d.v.map((v, i) => U.lerp(v, d.to[i], k));
    Radar.update($('#att-radar'), d.v);
  },

  // ---------------- 매 프레임 (일시정지 중에는 불리지 않는다) ----------------
  tick(dt, rpm) {
    const a = this.app;
    if (rpm > this.RPM_ACTIVE) this.activeAt = a.clock;
    const entered = a.state !== this.prevState;
    this.prevState = a.state;

    if (a.state === 'attract') {
      if (entered) {
        this.attractAt = a.clock;
        this.pedalHold = 0;
      }
      this.animateDeco(dt);
      const ready = (a.clock - this.attractAt) / 1000 > this.ATTRACT_LOCK_SEC && !this.opOpen && this.canStart();
      this.pedalHold = ready && rpm > this.RPM_ACTIVE ? this.pedalHold + dt : Math.max(0, this.pedalHold - dt);
      if (this.pedalHold >= this.PEDAL_START_SEC) this.start('pedal');
    } else if (a.state === 'calib') {
      // 시작만 눌러 놓고 자리를 떠난 경우
      if (!a.calib.started && (a.clock - this.activeAt) / 1000 > this.CALIB_IDLE_SEC) a.quit();
    } else if (a.state === 'play') {
      this.checkIdle();
    }
    if (a.state !== 'play') this.hideAlert('idle');
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
    this.syncPause();
  },

  // 스테이션 모드의 일시정지는 두 가지뿐이다: 운영 메뉴(PIN 포함)가 열려 있을 때, 센서로 하던 라운드에서 페달이 끊겼을 때.
  // 끊김은 다시 연결되면 저절로 풀린다. 참가자가 직접 멈추거나 메뉴로 나갈 방법은 없다.
  syncPause() {
    const a = this.app;
    const lost = a.inRound && a.roundSensor && a.link.state !== 'ready';
    const want = a.inRound && (this.opOpen || this.pinOpen || lost);
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
    const abil = Abilities.compute(a.stats);
    const best = Abilities.best(abil);
    const exMax = Math.floor(cfg.durationSec / cfg.tickSec) * cfg.tickMaxPoints;
    const keep = Math.round((a.exScore / exMax) * 100);
    const kcal = m.kcal;

    $('#dr-id').textContent = sim ? '가상 결과 · 기록 안 됨' : `참가 번호 ${this.label(no)}`;
    $('#dr-id').classList.toggle('sim', sim);
    $('#dr-total').textContent = a.score.toLocaleString('ko-KR');
    $('#dr-break').textContent = `운동 ${a.exScore.toLocaleString('ko-KR')} + 두뇌 게임 ${a.cogScore.toLocaleString('ko-KR')}`;
    Radar.render($('#dr-radar'), abil.map((x) => x.value), abil);
    $('#dr-best').innerHTML = best ? `가장 돋보인 능력 <b>${best.name}</b>` : '';
    $('#dr-kcal').textContent = kcal < 10 ? kcal.toFixed(1) : String(Math.round(kcal));
    $('#dr-food').textContent = m.revs > 0 ? Exercise.compare(kcal) : '';
    $('#dr-revs').textContent = `${Math.round(m.revs).toLocaleString('ko-KR')}바퀴`;
    $('#dr-time').textContent = U.fmtTime(m.activeSec);
    $('#dr-rpm').textContent = `${Math.round(m.avgRpm)} RPM`;
    $('#dr-keep').textContent = `${keep}%`;
    Fx.confetti(1.2);
    if (sim) return a.show('demo-result');

    // 세션 로그에 참가 번호와 능력 점수를 붙여 저장한다
    if (a.log) {
      a.log.meta.station = this.station;
      a.log.meta.participant = this.label(no);
      a.log.meta.summary.abilities = Object.fromEntries(abil.map((x) => [x.id, x.hasData ? x.value : null]));
      this.storeLog(a.log);
    }

    const log = this.load('log', []);
    log.push({
      station: this.station, no, at: new Date().toISOString(),
      score: a.score, ex: a.exScore, cog: a.cogScore,
      kcal: Math.round(kcal * 10) / 10, revs: Math.round(m.revs),
      abilities: Object.fromEntries(abil.map((x) => [x.id, x.hasData ? x.value : null])),
    });
    this.save('log', log.slice(-this.LOG_MAX));
    a.show('demo-result');
  },

  // ---------------- 세션 로그 (js/session-log.js) ----------------
  storeLog(log) {
    SessionStore.put(log).catch((e) => (this.storeError = e.message || String(e)));
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
    // 쿼리(?demo)만 떼고 같은 페이지로. 상대 경로 './'는 file:// 로 열면 폴더 목록으로 간다
    $('#op-exit').onclick = (e) => {
      e.preventDefault();
      this.leaving = true;
      location.href = location.pathname;
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
    };
    $('#op-station').addEventListener('input', () => $('#op-station').classList.remove('invalid'));
    const c = this.app.cfg;
    $('#op-cfg').innerHTML = `고정 설정: 라운드 ${U.fmtTime(c.durationSec)} · 측정 ${c.calibrationSec}초 · 게임 ${this.app.enabledTypes().length}종<br>` +
      '운영 메뉴는 왼쪽 위 모서리를 2초 누른 뒤 PIN 을 입력하면 열립니다.';
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

  openOp() {
    const a = this.app;
    this.opOpen = true;
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
    $('#op-close').textContent = a.inRound ? '이어서 진행' : a.state === 'result' ? '결과 화면으로 돌아가기' : '대기 화면 열기';
    this.renderLog();
    this.renderSessions();
    if (a.inRound) a.log.ev('operator', { open: true });
    $('#op').classList.add('active');
    this.syncPause();
  },

  hideOp() {
    if (this.app.inRound && this.opOpen) this.app.log.ev('operator', { open: false });
    this.opOpen = false;
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
      return `<li><b>${r.station || '?'}-${String(r.no).padStart(3, '0')}</b><span>${hm}</span><span class="sc">${r.score.toLocaleString('ko-KR')}점</span></li>`;
    }).join('');
  },

  downloadCsv() {
    const log = this.load('log', []);
    const head = ['station', 'no', 'time', 'score', 'exercise', 'cognitive', 'kcal', 'revs', ...ABILITIES.map((x) => x.id)];
    const rows = log.map((r) => [r.station, r.no, r.at, r.score, r.ex, r.cog, r.kcal, r.revs, ...ABILITIES.map((x) => r.abilities?.[x.id] ?? '')]);
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
      else if (this.pinBuf.length < DEMO_OPERATOR_PIN.length) this.pinBuf += b.textContent;
      this.renderPin();
      if (this.pinBuf.length < DEMO_OPERATOR_PIN.length) return;
      if (this.pinBuf === DEMO_OPERATOR_PIN) {
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

  openPin() {
    if (this.opOpen || this.pinOpen) return;
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
