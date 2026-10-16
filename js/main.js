const $ = (s) => document.querySelector(s);
const GAME_TYPES = [PathGame, SymbolGame, ArithGame, CountGame, FitGame, SeekGame];
const SLOPE_PATTERN = [0, 1, 0, -1]; // 평지 → 오르막(빠르게) → 평지 → 내리막(천천히)
const SLOPE_MSG = { 1: '오르막! 조금 더 빠르게', '-1': '내리막! 조금 더 천천히', 0: '평지! 원래 속도로' };
const SHIFT_LEAD_SEC = 0.8;  // 화면이 넓어지고 안내를 읽을 시간. 그 뒤에 목표 속도가 움직이기 시작한다
const SHIFT_OUT_MS = 650;    // 화면이 다시 줄어드는 시간. 그 뒤에 다음 인지 게임이 나온다

// index.html?demo — 시연 행사용 스테이션 모드 (js/demo.js). 같은 라운드 흐름에 대기·결과·운영 화면만 바꿔 끼운다.
const DEMO = new URLSearchParams(location.search).has('demo');

const App = {
  demo: DEMO,
  cfg: DEMO ? Config.demo() : Config.load(),
  pedal: new Pedal(),
  link: new PedalLink(),
  lz: new LzCadence(),
  capAt: 0,      // 마지막으로 CAP 을 건 시각 (performance.now). 0 = 걸려 있지 않음
  audio: new BeatAudio(),
  state: 'menu', // menu | attract | calib | countdown | play | result
  meter: new ExerciseMeter(),
  paused: false,
  linkPaused: false, // 페달 연결이 끊겨서 걸린 일시정지. 다시 연결되면 자동으로 풀린다
  clock: 0,      // 일시정지 중에는 멈추는 게임 시계 (ms)
  timers: [],
  gen: 0,        // 인지 게임 세대. 바뀌면 이전 게임의 예약 콜백/점수 지급은 무시된다

  init() {
    this.band = new Band($('#band-canvas'), this.cfg);
    // 큰 깃발을 지날 때만 소리를 낸다. 작은 깃발까지 울리면 박자 소리와 섞여 시끄럽다.
    this.band.onMilestone = (m) => {
      if (m % Band.MARK_BIG !== 0) return;
      this.audio.sfx('go');
      Fx.confetti(0.35);
    };
    Fx.init();
    Theme.init();
    this.renderGameToggles();
    if (!this.demo) this.bindMenu();
    else this.applySource(); // 메뉴를 거치지 않으므로 속도 측정 방식(lz 파형 사용 여부)만 따로 적용한다
    this.bindKeys();
    this.bindLink();
    this.pedal.onStroke = (key) => this.onStroke(key);
    if (this.demo) Demo.init(this);
    $('#btn-start').onclick = () => this.startRound();
    $('#btn-again').onclick = () => this.startRound();
    $('#btn-menu').onclick = () => this.show('menu');
    $('#btn-resume').onclick = () => this.setPaused(false);
    $('#btn-quit').onclick = () => this.quit();
    $('#btn-save').onclick = () => this.saveScore();
    $('#btn-log').onclick = () => {
      if (!this.log) return;
      this.log.download();
      $('#btn-log').textContent = '저장됨 · 다시 저장';
    };
    $('#res-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.saveScore(); });
    this.renderBoard($('#menu-board'));
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  },

  // ---------------- 메뉴 / 설정 ----------------
  // 게임 목록은 GAME_TYPES에서 만든다 — 게임을 추가하면 설정에도 저절로 나타난다
  renderGameToggles() {
    const box = $('#cfg-games');
    GAME_TYPES.forEach((T) => {
      box.append(U.el('label', 'setting', `${T.title}<input type="checkbox" data-game="${T.id}">`));
    });
    box.addEventListener('change', (e) => {
      // 전부 끄면 넣을 게임이 없다. 마지막 하나는 꺼지지 않게 되돌린다.
      const on = [...box.querySelectorAll('input')].some((b) => b.checked);
      if (!on) e.target.checked = true;
    });
  },

  // 가장 단계가 많은 게임에 맞춘다 — 그보다 높게 시작하면 모든 게임이 최고 난이도로 고정된다
  maxStartLevel() {
    return Math.max(...GAME_TYPES.map((T) => T.maxLevel));
  },

  // 설정에서 켜 둔 게임만, GAME_TYPES에 적힌 순서대로
  enabledTypes() {
    const ids = this.cfg.games;
    if (!ids) return GAME_TYPES;
    const list = GAME_TYPES.filter((T) => ids.includes(T.id));
    return list.length ? list : GAME_TYPES;
  },

  bindMenu() {
    const c = this.cfg;
    $('#cfg-duration').value = c.durationSec;
    $('#cfg-calib').value = c.calibrationSec;
    $('#cfg-tol').value = Math.round(c.tolerance * 100);
    $('#cfg-start-level').max = this.maxStartLevel();
    $('#cfg-start-level').value = c.startLevel;
    $('#cfg-mult').value = c.multiplierStep;
    $('#cfg-difficulty').value = c.difficulty;
    $('#cfg-change').checked = c.rpmChange;
    $('#cfg-shift').value = c.shiftSec;
    $('#cfg-sound').checked = c.sound;
    $('#cfg-qtimer').checked = c.questionTimer;
    $('#cfg-source').value = c.rpmSource;
    this.applySource();
    document.querySelectorAll('#cfg-games input').forEach((b) => {
      b.checked = !c.games || c.games.includes(b.dataset.game);
    });
  },

  // 측정 방식은 고르는 즉시 적용한다 (라운드 시작을 기다리지 않고 페달 연결 상태에도 바로 반영)
  applySource() {
    const src = this.cfg.rpmSource;
    this.pedal.lzOn = src !== 'pedal';
    $('#cfg-source-note').textContent = {
      zc: '페달 원시 파형에서 반 바퀴마다 갱신. 느리게 밟아도 놓치지 않고 지연이 짧습니다 (약 1.4초).',
      comb: '영교차에 빠른 파형 모양 추정을 섞음. 조금 빠르지만 느릴 때 흔들립니다.',
      teo: '가장 빠르지만(약 1.1초) 느리게 밟을 때 공이 떨립니다.',
      pedal: '페달이 1초마다 보내는 값 (지연 약 3.9초). 느리게 밟으면 0으로 떨어질 수 있습니다.',
    }[src] + (src !== 'pedal' ? ' 파형이 끊기면 avg_rpm 으로 돌아갑니다.' : '');
  },

  readMenu() {
    const num = (id, lo, hi, def) => {
      const v = parseFloat($(id).value);
      return Number.isFinite(v) ? U.clamp(v, lo, hi) : def;
    };
    const c = this.cfg;
    c.durationSec = num('#cfg-duration', 30, 900, 180);
    c.calibrationSec = num('#cfg-calib', 5, 60, 15);
    c.tolerance = num('#cfg-tol', 3, 40, 12) / 100;
    c.startLevel = Math.round(num('#cfg-start-level', 1, this.maxStartLevel(), 1));
    c.multiplierStep = num('#cfg-mult', 0, 1, 0.2);
    c.difficulty = $('#cfg-difficulty').value;
    c.rpmChange = $('#cfg-change').checked;
    c.shiftSec = num('#cfg-shift', 4, 30, 8);
    c.sound = $('#cfg-sound').checked;
    c.questionTimer = $('#cfg-qtimer').checked;
    c.rpmSource = $('#cfg-source').value;
    c.games = [...document.querySelectorAll('#cfg-games input')].filter((b) => b.checked).map((b) => b.dataset.game);
    Config.save(c);
    this.bindMenu();
  },

  show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
    if (id === 'menu') {
      this.state = 'menu';
      this.renderBoard($('#menu-board'));
    }
    if (id === 'attract') this.state = 'attract';
  },

  get inRound() {
    return ['calib', 'countdown', 'play'].includes(this.state);
  },

  // ---------------- 입력 ----------------
  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (this.log && !e.repeat) this.log.key(e.code);
      // 스테이션 모드에는 일시정지 메뉴와 디버그 표시가 없다 (운영 메뉴로만 멈춘다)
      if (e.code === 'Escape') {
        if (!this.demo && this.inRound) this.setPaused(!this.paused);
        return;
      }
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'KeyT' && !this.demo && !e.repeat) {
        Theme.next();
        return;
      }
      if (e.code === 'Backquote') {
        if (this.demo) return;
        $('#debug').classList.toggle('active');
        return;
      }
      if (e.repeat || this.paused) return;
      if (e.code === 'KeyA' || e.code === 'KeyD') this.pedal.press(e.code);
    });
  },

  onStroke(key) {
    const k = document.querySelector(`#keyhint kbd[data-k="${key}"]`);
    if (k) {
      k.classList.add('hit');
      setTimeout(() => k.classList.remove('hit'), 90);
    }
  },

  // ---------------- 페달 센서 ----------------
  bindLink() {
    // 연결 버튼과 상태 표시는 메뉴·운영 메뉴·대기 화면에 여러 개 있다
    const btns = document.querySelectorAll('[data-pedal-btn]');
    btns.forEach((b) => (b.onclick = () => (this.link.wantLink ? this.link.disconnect() : this.link.connect())));
    this.link.onState = (state, detail) => this.onLinkState(state, detail);
    this.link.onWorkout = (w) => {
      this.pedal.sensorFrame(w.rpm);
      if (this.log) this.log.workoutFrame(w);
    };
    this.link.onFrame = (raw, f) => this.onPedalFrame(f);
    $('#cfg-source').onchange = () => {
      this.cfg.rpmSource = $('#cfg-source').value;
      Config.save(this.cfg);
      this.applySource();
    };
    if (this.link.supported) {
      this.onLinkState('idle', '키보드로 입력 중');
    } else {
      btns.forEach((b) => (b.disabled = true));
      this.onLinkState('idle', '이 브라우저에서는 페달을 연결할 수 없습니다 (Chrome·Edge 필요)');
    }
  },

  // 원시 파형(CAPD) → 케이던스. 고른 방식의 값을 페달에 넣는다
  onPedalFrame(f) {
    if (!f || f.name !== 'CAPD' || f.values.length !== 21) return;
    const v = f.values.map(Number);
    if (v.some((x) => !Number.isFinite(x))) return;
    if (this.log) this.log.capdFrame(v);
    const r = this.lz.capd(v);
    const src = this.cfg.rpmSource;
    // 추정이 아직 준비되지 않은 0(연결 직후·긴 유실 뒤 첫 바퀴)은 넣지 않는다. 진짜 정지(진폭이 정지 수준)만 0 으로 넣는다.
    // 넣지 않는 동안은 직전 값이 유지되다가 1초가 지나면 avg_rpm 으로 돌아간다.
    if (src !== 'pedal' && (r.stopped || r[src] > 0)) this.pedal.lzFrame(r.stopped ? 0 : r[src]);
  },

  // 파형을 쓰는 동안 CAP 을 켜 둔다. 펌웨어가 300초 뒤 스스로 멈추므로 그 전에 다시 건다.
  // (페달 저장소 docs/02-system-sequence.md §5 — 읽기 전용, 연결이 끊기면 펌웨어가 바로 멈춘다)
  capTick(now) {
    const want = this.link.state === 'ready' && this.cfg.rpmSource !== 'pedal';
    if (want && (!this.capAt || now - this.capAt > 280000)) {
      this.capAt = now;
      this.link.send(NUS.command('CAP', [300])).catch(() => (this.capAt = 0));
    } else if (!want && this.capAt) {
      this.capAt = 0;
      if (this.link.state === 'ready') this.link.send(NUS.command('CAP', [0])).catch(() => {});
    }
  },

  onLinkState(state, detail) {
    const ready = state === 'ready';
    this.pedal.setSensor(ready);
    this.capAt = 0;
    this.lz.reset();
    document.body.classList.toggle('sensor', ready);
    document.querySelectorAll('.pedal-status').forEach((s) => {
      s.dataset.state = state;
      s.textContent = detail;
    });
    document.querySelectorAll('[data-pedal-btn]').forEach((b) => (b.textContent = this.link.wantLink ? '연결 해제' : '페달 연결'));
    if (this.log) this.log.ev('link', { state, detail });
    if (this.demo) return Demo.onLink(state, detail);

    // 센서로 하던 라운드 도중 연결이 끊기면 '멈춤'으로 채점하지 않고 시계를 세운다
    const inRound = this.inRound;
    if (ready) {
      if (this.linkPaused) this.setPaused(false);
    } else if (this.roundSensor && inRound && !this.paused) {
      this.setPaused(true);
      this.linkPaused = true;
    }
    $('#pause-note').textContent = this.linkPaused ? `${detail} — 계속하기를 누르면 키보드로 이어갑니다.` : '';
  },

  setPaused(p) {
    if (this.log && p !== this.paused) this.log.ev(p ? 'pause' : 'resume');
    this.paused = p;
    if (!p) {
      this.linkPaused = false;
      $('#pause-note').textContent = '';
    }
    if (!this.demo) $('#pause').classList.toggle('active', p);
    if (p) this.audio.pause();
    else this.audio.resume();
  },

  // 라운드를 버리고 나간다 (결과 없음). 기록은 'abandoned' 로 닫는다
  quit() {
    this.closeLog('abandoned');
    this.setPaused(false);
    this.audio.stop();
    this.gen++;
    this.timers = [];
    this.clearShift();
    $('#cog').innerHTML = '';
    this.show(this.demo ? 'attract' : 'menu');
  },

  // ---------------- 게임 시계 기반 예약 ----------------
  after(ms, fn, gen = this.gen) {
    this.timers.push({ t: this.clock + ms, fn, gen });
  },

  runTimers() {
    const due = this.timers.filter((x) => x.t <= this.clock);
    if (!due.length) return;
    this.timers = this.timers.filter((x) => x.t > this.clock);
    due.sort((a, b) => a.t - b.t);
    for (const x of due) if (x.gen === this.gen) x.fn();
  },

  // ---------------- 라운드 흐름 ----------------
  startRound() {
    if (!this.demo) this.readMenu();
    this.meter.reset();
    this.audio.ensure();
    this.audio.setMuted(!this.cfg.sound);
    this.pedal.reset();
    this.roundSensor = this.pedal.sensorOn;
    this.gen++;
    this.timers = [];
    this.clock = 0;
    this.calib = { elapsed: 0, started: false, samples: [], angle: 0 };
    this.show('calib');
    this.state = 'calib';
    this.log = new SessionLog(this);
    this.log.ev('calib_start');
  },

  // 세션 기록을 닫는다. 시연 모드에서 결과 없이 끝난 판은 여기서 바로 저장한다 (결과가 있으면 Demo.showResult 가 저장)
  closeLog(ended) {
    const log = this.log;
    if (!log || log.done) return;
    log.finish(ended, this.summary());
    if (this.demo && ended === 'abandoned') Demo.storeLog(log);
  },

  summary() {
    const m = this.meter;
    return {
      score: this.score ?? 0, exScore: this.exScore ?? 0, cogScore: this.cogScore ?? 0,
      baseline: this.baseline ?? null, bestStreak: this.bestStreak ?? 0, elapsedSec: Math.round((this.elapsed ?? 0) * 10) / 10,
      stats: this.stats || null,
      exercise: { kcal: Math.round(m.kcal * 100) / 100, distM: Math.round(m.distM), revs: Math.round(m.revs * 10) / 10, avgRpm: Math.round(m.avgRpm * 10) / 10, activeSec: Math.round(m.activeSec) },
    };
  },

  updateCalib(dt, rpm) {
    const c = this.calib;
    const total = this.cfg.calibrationSec;
    if (!c.started && rpm > 0) {
      c.started = true;
      this.log.ev('calib_pedaling');
    }
    if (c.started) {
      c.elapsed += dt;
      if (c.elapsed > Math.min(this.cfg.calibrationIgnoreSec, total * 0.3) && rpm > 0) c.samples.push(rpm);
    }
    c.angle += (rpm / 60) * 360 * dt;
    $('#calib-crank').setAttribute('transform', `rotate(${c.angle} 110 110)`);
    const frac = U.clamp(c.elapsed / total, 0, 1);
    $('#calib-arc').setAttribute('stroke-dashoffset', String(603.2 * (1 - frac)));
    $('#calib-num').textContent = c.started ? Math.ceil(total - c.elapsed) : '';
    $('#calib-state').textContent = !c.started
      ? '페달을 밟으면 측정이 시작됩니다'
      : rpm > 0 ? '좋아요, 이 속도를 유지하세요' : '계속 밟아주세요';
    if (c.elapsed >= total) this.finishCalib();
  },

  finishCalib() {
    const s = this.calib.samples.slice().sort((a, b) => a - b);
    let base = s.length ? s[Math.floor(s.length / 2)] : 0;
    const measured = base;
    if (base < this.cfg.minRpm) base = this.cfg.fallbackRpm;
    this.log.ev('calib_end', { baseline: Math.round(base * 10) / 10, measured: Math.round(measured * 10) / 10, samples: s.length, fallback: base !== measured });
    this.baseline = base;
    this.target = base;
    this.beginCountdown();
  },

  beginCountdown() {
    this.state = 'countdown';
    this.score = 0;
    this.exScore = 0;
    this.cogScore = 0;
    this.elapsed = 0;
    this.tickAcc = 0;
    this.tickTime = 0;
    this.tickOut = false;
    this.slopeStep = 0;                 // SLOPE_PATTERN에서 지금 몇 번째인가
    this.slopeLevel = 0;                // 현재 지면 기울기 -1 ~ 1 (목표 RPM 배율과 지면 각도를 함께 정한다)
    this.nextShiftAt = this.cfg.rpmChangeSegmentSec;
    this.clearShift();
    this.gameIndex = 0;
    this.diff = this.cfg.startLevel;    // adaptive 난이도 계기판 (cfg.difficulty 참고)
    this.lastLevel = {};                // 게임별 지난번 레벨 (소개 문구용)
    this.current = null;
    this.streak = 0;
    this.bestStreak = 0;
    this.renderStreak();
    this.types = this.enabledTypes();   // 이번 라운드에 돌릴 게임 (중간에 바뀌지 않게 여기서 고정)
    this.stats = {};
    // level = 도달한 최고 난이도, runs = 판마다 [레벨, 맞힌 수, 문제 수], ms = 게임을 푸는 데 쓴 시간 (runs·ms 는 능력 그래프에 쓴다)
    GAME_TYPES.forEach((T) => (this.stats[T.id] = { plays: 0, cleared: 0, correct: 0, total: 0, points: 0, level: 0, runs: [], ms: 0 }));
    this.band.cfg = this.cfg;
    this.band.setSlope(0);
    this.band.theta = 0;
    this.band.restart();
    this.show('game');
    this.band.resize();
    this.updateHud();
    this.audio.start(() => this.target * 2);

    const cog = $('#cog');
    const gen = this.gen;
    const intro = U.el('div', 'intro');
    intro.innerHTML = `
      <div class="tag">준비</div>
      <div class="hint">비트에 맞춰 ${this.pedal.sensorOn ? '<b>페달</b>을' : '<b>A · D</b>를'} 밟아 공을 <b style="color:var(--good)">초록 구역</b> 안에 두세요.<br>
      그러면서 아래에 나오는 게임을 풀면 됩니다.</div>
      <div class="big-count">3</div>`;
    cog.innerHTML = '';
    cog.append(intro);
    const num = intro.querySelector('.big-count');
    this.audio.sfx('count');
    this.after(1000, () => { num.textContent = '2'; this.audio.sfx('count'); }, gen);
    this.after(2000, () => { num.textContent = '1'; this.audio.sfx('count'); }, gen);
    this.after(3000, () => {
      num.textContent = 'GO!';
      num.classList.add('go');
      this.audio.sfx('go');
      Fx.cleared(num);
      this.state = 'play';
      this.log.ev('play_start');
    }, gen);
    this.after(3600, () => this.nextGame(), gen);
  },

  nextGame() {
    if (this.shiftDue()) return this.beginShift();
    const T = this.types[this.gameIndex % this.types.length];
    const cycle = Math.floor(this.gameIndex / this.types.length);
    const level = this.cfg.difficulty === 'adaptive'
      ? U.clamp(Math.floor(this.diff), 1, T.maxLevel)
      : Math.min(cycle + this.cfg.startLevel, T.maxLevel);
    const mult = 1 + this.cfg.multiplierStep * (level - 1);
    const prev = this.lastLevel[T.id];
    const firstTime = prev == null;
    const tag = firstTime ? '새 게임' : level > prev ? '레벨 업' : level < prev ? '숨 고르기' : '한 번 더';
    this.lastLevel[T.id] = level;
    this.gameIndex++;
    this.current = null;
    this.log.ev('game_start', { game: T.id, level, mult: Math.round(mult * 100) / 100, diff: Math.round(this.diff * 100) / 100 });

    const gen = ++this.gen;
    const cog = $('#cog');
    cog.innerHTML = '';
    const intro = U.el('div', 'intro');
    intro.innerHTML = `
      <div class="tag">${tag}${mult > 1 ? ` · x${mult.toFixed(1)}` : ''}</div>
      <div class="name">${T.title}</div>
      <div class="hint">${T.hint}</div>`;
    cog.append(intro);
    this.after(firstTime ? 2600 : 1500, () => {
      cog.innerHTML = '';
      const stage = U.el('div', 'stage');
      cog.append(stage);
      const host = this.makeHost(T, stage, level, mult, gen);
      this.current = { T, game: new T(host), host };
      this.current.game.start();
    }, gen);
  },

  makeHost(T, stage, level, mult, gen) {
    const t0 = this.clock;
    return {
      stage,
      level,
      mult,
      t0,
      base: this.cfg.cogBasePoints,
      after: (ms, fn) => this.after(ms, fn, gen),
      // 문제 하나의 제한 시간. load = 그 문제의 일의 양 (config.questionTime 참고). 다 되면 onOut 을 부른다
      timer: (load, onOut) => this.startQTimer(T, stage, load, onOut, gen),
      stopTimer: () => this.stopQTimer(),
      // 세션 기록 (js/session-log.js). question = 입력을 받기 시작한 문제의 내용, input = 답 도중의 입력, answer = 최종 답
      question: (data) => gen === this.gen && this.log.question(T.id, level, data),
      input: (data) => gen === this.gen && this.log.input(T.id, data),
      answer: (data) => gen === this.gen && this.log.answer(T.id, data),
      // 게임들은 정답에 'good', 오답에 'bad'를 울린다. 그 둘만 가로채 연속 정답을 세고 보상을 키운다.
      // (게임 쪽 코드를 건드리지 않고 한 곳에서 보상을 다룰 수 있다)
      sfx: (n) => {
        if (n === 'good') return this.hit(true);
        if (n === 'bad') return this.hit(false);
        this.audio.sfx(n);
      },
      award: (pts, anchor, prefix = '') => {
        if (gen !== this.gen || this.state !== 'play') return;
        pts = Math.round(pts);
        if (pts <= 0) return;
        this.cogScore += pts;
        this.stats[T.id].points += pts;
        this.log.ev('points', { game: T.id, pts });
        this.addScore(pts);
        this.floatAt(anchor, `${prefix}+${pts}`);
      },
      done: (res) => {
        if (gen !== this.gen || this.state !== 'play') return;
        this.record(T, res, level, this.clock - t0);
        this.log.ev('game_end', { game: T.id, ...res });
        // 한 게임을 다 맞혔으면 따로 축하한다. 게임마다 넣지 않고 여기서 한 번에 처리한다.
        if (!res.cleared) return this.nextGame();
        this.audio.sfx('clear');
        const b = U.el('div', 'perfect', '완벽!');
        stage.append(b);
        Fx.cleared(stage);
        this.after(950, () => this.nextGame(), gen);
      },
    };
  },

  // ---------------- 문제 제한 시간 ----------------
  // 게임 시계로 재므로 일시정지·운영 메뉴 중에는 멈춘다. 막대는 게임 영역 맨 위에 붙는다.
  startQTimer(T, stage, load, onOut, gen) {
    this.qt = null;
    if (!this.cfg.questionTimer || gen !== this.gen) return;
    const spec = this.cfg.questionTime[T.id];
    if (!spec) return;
    let el = stage.querySelector('.qtimer');
    if (!el) {
      el = U.el('div', 'qtimer', '<i></i>');
      stage.append(el);
    }
    el.className = 'qtimer on';
    el.firstChild.style.transform = 'scaleX(1)';
    this.qt = { t0: this.clock, ms: (spec.base + spec.per * load) * 1000, onOut, gen, el, tick: 3 };
    this.log.ev('timer_start', { game: T.id, load, limitMs: this.qt.ms });
  },

  // 답을 고르면 멈춘다. 막대는 남은 만큼 멈춘 채로 둔다 (얼마나 빨랐는지 보인다)
  stopQTimer() {
    if (!this.qt) return;
    this.qt.el.classList.add('stopped');
    this.qt = null;
  },

  updateQTimer() {
    const q = this.qt;
    if (!q) return;
    if (q.gen !== this.gen || this.state !== 'play') {
      this.qt = null;
      return;
    }
    const left = q.ms - (this.clock - q.t0);
    const frac = U.clamp(left / q.ms, 0, 1);
    q.el.firstChild.style.transform = `scaleX(${frac})`;
    q.el.classList.toggle('warn', frac < 0.4);
    q.el.classList.toggle('low', frac < 0.18);
    // 마지막 3초는 초마다 작게 똑딱인다
    if (left <= q.tick * 1000 && q.tick > 0) {
      this.audio.sfx('tick');
      q.tick--;
    }
    if (left > 0) return;
    this.qt = null;
    q.el.classList.add('out');
    this.log.ev('timeout');
    q.onOut();
  },

  // ---------------- 속도 전환 구간 ----------------
  // 목표 속도는 인지 게임 도중에는 바뀌지 않는다. 게임과 게임 사이에 따로 구간을 두고,
  // 그 동안은 위쪽 띠를 화면 전체로 넓혀 새 속도에 맞추는 것에만 집중하게 한다.
  shiftDue() {
    const { cfg } = this;
    if (!cfg.rpmChange || this.elapsed < this.nextShiftAt) return false;
    // 라운드가 곧 끝나면 새 속도에 맞추기만 하다 끝나므로 건너뛴다
    return cfg.durationSec - this.elapsed >= cfg.shiftSec + 5;
  },

  beginShift() {
    const gen = ++this.gen;
    this.current = null;
    $('#cog').innerHTML = '';
    const to = SLOPE_PATTERN[++this.slopeStep % SLOPE_PATTERN.length];
    this.shift = { from: this.slopeLevel, to, t0: this.elapsed };
    this.log.ev('shift_start', { from: this.slopeLevel, to });
    $('#shift-name').textContent = SLOPE_MSG[to];
    $('#game').classList.add('shift');
    this.audio.sfx('go');
    this.after(this.cfg.shiftSec * 1000, () => this.endShift(), gen);
  },

  endShift() {
    this.log.ev('shift_end', { slope: this.shift.to });
    this.slopeLevel = this.shift.to;
    this.clearShift();
    this.nextShiftAt = this.elapsed + this.cfg.rpmChangeSegmentSec;
    this.after(SHIFT_OUT_MS, () => this.nextGame());
  },

  clearShift() {
    this.shift = null;
    $('#game').classList.remove('shift');
  },

  // 구간 안에서 목표 RPM과 지면 각도를 shiftRampSec에 걸쳐 부드럽게 옮긴다 (smoothstep)
  updateShift() {
    const { cfg, shift } = this;
    const since = this.elapsed - shift.t0;
    const ramp = Math.min(cfg.shiftRampSec, cfg.shiftSec - SHIFT_LEAD_SEC - 1);
    const t = U.clamp((since - SHIFT_LEAD_SEC) / ramp, 0, 1);
    this.slopeLevel = U.lerp(shift.from, shift.to, t * t * (3 - 2 * t));
    $('#shift-bar').style.transform = `scaleX(${U.clamp(1 - since / cfg.shiftSec, 0, 1)})`;
  },

  // ---------------- 정답 보상 ----------------
  // 연속 정답은 점수에 손대지 않는다. 운동 점수와 인지 점수의 균형을 흔들지 않으면서
  // '지키고 싶은 것'만 하나 만들어 주는 게 목적이다.
  hit(ok) {
    this.adjustDifficulty(ok);
    if (ok) {
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      this.audio.reward(this.streak);
      this.band.celebrate();
      this.flashGlow(this.streak);
      Fx.hit(this.streak);
    } else {
      this.audio.sfx(this.streak >= 3 ? 'drop' : 'bad');
      Fx.miss($('#cog'));
      this.streak = 0;
    }
    this.renderStreak();
  },

  // adaptive 난이도 계기판. 위는 가장 단계가 많은 게임의 최고 레벨 바로 아래까지 — 최고 레벨에서 한 번 틀려도 바로 내려가지 않는다
  adjustDifficulty(ok) {
    const c = this.cfg;
    if (c.difficulty !== 'adaptive') return;
    this.diff = U.clamp(this.diff + (ok ? c.diffUp : -c.diffDown), 1, this.maxStartLevel() + 0.99);
    this.log.ev('difficulty', { ok, diff: Math.round(this.diff * 100) / 100 });
  },

  renderStreak() {
    const el = $('#streak');
    el.classList.toggle('on', this.streak >= 2);
    if (this.streak < 2) return;
    el.textContent = `${this.streak} 연속`;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  },

  // 맞힌 순간 게임 영역 전체가 한 번 밝아진다. 연속이 쌓일수록 세진다.
  flashGlow(streak) {
    const a = Math.min(0.1 + streak * 0.045, 0.34);
    const el = U.el('div', 'glow');
    el.style.background = `radial-gradient(ellipse at 50% 55%, color-mix(in srgb, var(--good) ${Math.round(a * 100)}%, transparent) 0%, transparent 62%)`;
    $('#cog').append(el);
    setTimeout(() => el.remove(), 440);
  },

  record(T, res, level, ms) {
    const s = this.stats[T.id];
    s.plays++;
    s.level = Math.max(s.level, level);
    s.runs.push([level, res.correct, res.total]);
    s.ms += ms;
    if (res.cleared) s.cleared++;
    s.correct += res.correct;
    s.total += res.total;
  },

  floatAt(anchor, text) {
    const cog = $('#cog');
    const cr = cog.getBoundingClientRect();
    const r = anchor.getBoundingClientRect();
    const f = U.el('div', 'floater', text);
    f.style.left = `${r.left + r.width / 2 - cr.left}px`;
    f.style.top = `${r.top + r.height / 2 - cr.top}px`;
    cog.append(f);
    setTimeout(() => f.remove(), 950);
  },

  addScore(pts) {
    this.score += pts;
    const v = $('#hud-score .value');
    v.textContent = this.score;
    v.classList.remove('bump');
    void v.offsetWidth;
    v.classList.add('bump');
  },

  updateHud() {
    const left = this.state === 'play' ? this.cfg.durationSec - this.elapsed : this.cfg.durationSec;
    $('#hud-time .value').textContent = U.fmtTime(left);
    $('#hud-time').classList.toggle('warn', this.state === 'play' && left <= 10);
    $('#hud-score .value').textContent = this.score;
  },

  // 목표 RPM 대비 편차로 이번 프레임의 운동 점수(0~max)를 계산
  frameScore(dev) {
    const { tolerance, maxDeviation, tickMaxPoints } = this.cfg;
    const d = Math.abs(dev);
    if (d <= tolerance) return tickMaxPoints;
    return tickMaxPoints * Math.max(0, 1 - (d - tolerance) / (maxDeviation - tolerance));
  },

  updatePlay(dt, rpm) {
    const { cfg } = this;
    this.elapsed += dt;

    // 목표 RPM 변화 → 지면 각도. 속도 전환 구간에서만 움직인다.
    if (this.shift) this.updateShift();
    this.band.setSlope(this.slopeLevel);
    this.target = this.baseline * (1 + this.slopeLevel * cfg.rpmChangeAmount);

    // 짧은 간격으로 운동 점수 지급. 화면의 공 위치(band)를 기준으로 채점해서 보이는 것과 점수가 어긋나지 않게 한다.
    this.tickAcc += this.frameScore(this.band.deviation) * dt;
    this.tickTime += dt;
    if (!this.band.inZone) this.tickOut = true;
    if (this.tickTime >= cfg.tickSec) {
      let pts = Math.round(this.tickAcc / this.tickTime);
      // 공이 한 번이라도 구역을 벗어난(빨간) 틱은 만점을 주지 않는다
      if (this.tickOut) pts = Math.min(pts, cfg.tickMaxPoints - 1);
      this.tickOut = false;
      this.tickAcc = 0;
      this.tickTime -= cfg.tickSec;
      this.exScore += pts;
      if (pts > 0) this.addScore(pts);
      const color = pts >= cfg.tickMaxPoints ? 'good' : pts > 0 ? 'warn' : 'bad';
      this.band.addFloater(`+${pts}`, color);
    }

    if (this.elapsed >= cfg.durationSec) this.endRound();
  },

  // ended: complete(시간 다 됨) | operator(운영 메뉴에서 끝냄) | idle(자리 비움)
  endRound(ended = 'complete') {
    this.state = 'result';
    if (this.current) {
      // 중단된 게임: 부분 점수는 abort 안에서 지급될 수 있도록 상태를 잠깐 play로 둔다
      this.state = 'play';
      const res = this.current.game.abort();
      this.state = 'result';
      const { host } = this.current;
      if (res.total > 0) this.record(this.current.T, res, host.level, this.clock - host.t0);
      this.log.ev('game_abort', { game: this.current.T.id, ...res });
    }
    this.closeLog(ended);
    this.gen++;
    this.timers = [];
    this.clearShift();
    this.audio.stop();
    this.audio.sfx('end');
    $('#cog').innerHTML = '';
    this.showResult();
  },

  showResult() {
    if (this.demo) return Demo.showResult();
    const cfg = this.cfg;
    const exMax = Math.floor(cfg.durationSec / cfg.tickSec) * cfg.tickMaxPoints;
    $('#res-total').textContent = this.score;
    $('#res-ex').textContent = `${this.exScore} / ${exMax}`;
    $('#res-ex-sub').textContent = `일정 속도 유지율 ${Math.round((this.exScore / exMax) * 100)}%`;
    $('#res-cog').textContent = this.cogScore;
    // 이번 라운드에 실제로 나온 게임만 적는다
    const lines = GAME_TYPES.filter((T) => this.stats[T.id].plays).map((T) => {
      const s = this.stats[T.id];
      return `${T.title}: ${s.plays}회 · 정답 ${s.correct}/${s.total} · ${s.points}점`;
    });
    if (this.bestStreak >= 2) lines.push(`<b>최고 연속 정답 ${this.bestStreak}회</b>`);
    $('#res-cog-sub').innerHTML = lines.join('<br>');
    $('#save-row').style.display = '';
    $('#btn-log').disabled = false;
    $('#btn-log').textContent = '세션 로그 저장';
    $('#res-name').value = '';
    this.savedId = null;
    this.renderBoard($('#res-board'));
    this.show('result');
    Fx.confetti(1);
    setTimeout(() => $('#res-name').focus(), 50);
  },

  // ---------------- 순위 ----------------
  loadBoard() {
    try { return JSON.parse(localStorage.getItem('exergame.board') || '[]'); } catch (e) { return []; }
  },

  saveScore() {
    if (this.savedId) return;
    const name = $('#res-name').value.trim() || '이름없음';
    const board = this.loadBoard();
    this.savedId = Date.now();
    board.push({ id: this.savedId, name, score: this.score, ex: this.exScore, cog: this.cogScore, dur: this.cfg.durationSec });
    board.sort((a, b) => b.score - a.score);
    try { localStorage.setItem('exergame.board', JSON.stringify(board.slice(0, 50))); } catch (e) {}
    $('#save-row').style.display = 'none';
    this.renderBoard($('#res-board'));
  },

  renderBoard(el) {
    const board = this.loadBoard().slice(0, 8);
    if (!board.length) {
      el.innerHTML = '<li class="board-empty">아직 기록이 없습니다</li>';
      return;
    }
    el.innerHTML = board.map((b, i) => `
      <li class="${b.id === this.savedId ? 'me' : ''}">
        <span class="rank">${i + 1}</span>
        <span class="name">${b.name.replace(/[<>&]/g, '')}</span>
        <span>${b.score}점 <small style="color:var(--ink-soft)">(${U.fmtTime(b.dur)})</small></span>
      </li>`).join('');
  },

  // ---------------- 메인 루프 ----------------
  loop(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) {
      this.clock += dt * 1000;
      const rpm = this.pedal.update(dt);

      if (this.state === 'calib') this.updateCalib(dt, rpm);
      // 운동량은 측정이 시작된 뒤부터 라운드가 끝날 때까지 밟은 것을 모두 센다
      if ((this.state === 'calib' && this.calib.started) || this.state === 'countdown' || this.state === 'play') {
        this.meter.add(dt, rpm);
      }
      if (this.demo) Demo.tick(dt, rpm);
      if (this.log && (this.state === 'calib' || this.state === 'countdown' || this.state === 'play')) this.log.sample(dt, rpm);

      if (this.state === 'countdown' || this.state === 'play') {
        if (this.state === 'play') this.updatePlay(dt, rpm);
        if (this.state === 'countdown' || this.state === 'play') {
          // 틱 사이에도 지면이 끊기지 않도록 진행 중인 틱에서 쌓인 몫까지 넘긴다
          this.band.update(dt, rpm, (rpm - this.target) / this.target, this.score + this.tickAcc / this.cfg.tickSec);
          this.band.draw();
          this.updateHud();
        }
      }
      this.runTimers();
      if (this.state === 'play') this.updateQTimer();
      this.updateDebug(rpm);
    }
    this.capTick(now);
    // 비트에 맞춰 화면 가장자리 깜빡임 (짝수 = A쪽 왼편, 홀수 = D쪽 오른편)
    for (const b of this.audio.pollBeats()) {
      if (this.state !== 'countdown' && this.state !== 'play') continue;
      const e = document.querySelector(b.i % 2 === 0 ? '.edge.left' : '.edge.right');
      e.classList.remove('flash');
      void e.offsetWidth;
      e.classList.add('flash');
    }
    requestAnimationFrame((t) => this.loop(t));
  },

  updateDebug(rpm) {
    const d = $('#debug');
    if (!d.classList.contains('active')) return;
    d.textContent = [
      `state    ${this.state}`,
      `input    ${this.pedal.sensorOn ? `sensor ${this.pedal.lzLive ? `lz ${this.cfg.rpmSource} ${this.pedal.lzRpm.toFixed(1)}` : 'avg_rpm'} / avg ${this.pedal.sensorRpm}rpm fw ${this.link.firmware || '?'}` : `keyboard (link ${this.link.state})`}`,
      `rpm      ${rpm.toFixed(1)}`,
      `target   ${this.target ? this.target.toFixed(1) : '-'}${this.shift ? ' (shift)' : ''}`,
      `baseline ${this.baseline ? this.baseline.toFixed(1) : '-'}`,
      `dev      ${this.target ? (((rpm - this.target) / this.target) * 100).toFixed(1) + '%' : '-'}`,
      `ex/cog   ${this.exScore ?? 0} / ${this.cogScore ?? 0}`,
    ].join('\n');
  },
};

App.init();
