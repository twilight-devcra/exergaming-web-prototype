const $ = (s) => document.querySelector(s);
const GAME_TYPES = [PathGame, SymbolGame, ArithGame, CountGame, FitGame];
const SLOPE_PATTERN = [0, 1, 0, -1]; // 평지 → 오르막(빠르게) → 평지 → 내리막(천천히)
const SLOPE_MSG = { 1: '오르막! 조금 더 빠르게', '-1': '내리막! 조금 더 천천히', 0: '평지! 원래 속도로' };

const App = {
  cfg: Config.load(),
  pedal: new Pedal(),
  link: new PedalLink(),
  audio: new BeatAudio(),
  state: 'menu', // menu | calib | countdown | play | result
  paused: false,
  linkPaused: false, // 페달 연결이 끊겨서 걸린 일시정지. 다시 연결되면 자동으로 풀린다
  clock: 0,      // 일시정지 중에는 멈추는 게임 시계 (ms)
  timers: [],
  gen: 0,        // 인지 게임 세대. 바뀌면 이전 게임의 예약 콜백/점수 지급은 무시된다

  init() {
    this.band = new Band($('#band-canvas'), this.cfg);
    this.renderGameToggles();
    this.bindMenu();
    this.bindKeys();
    this.bindLink();
    this.pedal.onStroke = (key) => this.onStroke(key);
    $('#btn-start').onclick = () => this.startRound();
    $('#btn-again').onclick = () => this.startRound();
    $('#btn-menu').onclick = () => this.show('menu');
    $('#btn-resume').onclick = () => this.setPaused(false);
    $('#btn-quit').onclick = () => this.quit();
    $('#btn-save').onclick = () => this.saveScore();
    $('#res-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.saveScore(); });
    window.addEventListener('resize', () => this.band.resize());
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
    $('#cfg-change').checked = c.rpmChange;
    $('#cfg-ramp').value = c.rpmRampSec;
    $('#cfg-sound').checked = c.sound;
    document.querySelectorAll('#cfg-games input').forEach((b) => {
      b.checked = !c.games || c.games.includes(b.dataset.game);
    });
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
    c.rpmChange = $('#cfg-change').checked;
    c.rpmRampSec = num('#cfg-ramp', 0, 30, 12);
    c.sound = $('#cfg-sound').checked;
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
  },

  // ---------------- 입력 ----------------
  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (['calib', 'countdown', 'play'].includes(this.state)) this.setPaused(!this.paused);
        return;
      }
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Backquote') {
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
    const btn = $('#btn-pedal');
    btn.onclick = () => (this.link.wantLink ? this.link.disconnect() : this.link.connect());
    this.link.onState = (state, detail) => this.onLinkState(state, detail);
    this.link.onWorkout = (w) => this.pedal.sensorFrame(w.rpm);
    if (this.link.supported) {
      this.onLinkState('idle', '키보드로 입력 중');
    } else {
      btn.disabled = true;
      this.onLinkState('idle', '이 브라우저에서는 페달을 연결할 수 없습니다 (Chrome·Edge 필요)');
    }
  },

  onLinkState(state, detail) {
    const ready = state === 'ready';
    this.pedal.setSensor(ready);
    document.body.classList.toggle('sensor', ready);
    const s = $('#pedal-status');
    s.dataset.state = state;
    s.textContent = detail;
    $('#btn-pedal').textContent = this.link.wantLink ? '연결 해제' : '페달 연결';

    // 센서로 하던 라운드 도중 연결이 끊기면 '멈춤'으로 채점하지 않고 시계를 세운다
    const inRound = ['calib', 'countdown', 'play'].includes(this.state);
    if (ready) {
      if (this.linkPaused) this.setPaused(false);
    } else if (this.roundSensor && inRound && !this.paused) {
      this.setPaused(true);
      this.linkPaused = true;
    }
    $('#pause-note').textContent = this.linkPaused ? `${detail} — 계속하기를 누르면 키보드로 이어갑니다.` : '';
  },

  setPaused(p) {
    this.paused = p;
    if (!p) {
      this.linkPaused = false;
      $('#pause-note').textContent = '';
    }
    $('#pause').classList.toggle('active', p);
    if (p) this.audio.pause();
    else this.audio.resume();
  },

  quit() {
    this.setPaused(false);
    this.audio.stop();
    this.gen++;
    this.timers = [];
    $('#cog').innerHTML = '';
    this.show('menu');
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
    this.readMenu();
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
  },

  updateCalib(dt, rpm) {
    const c = this.calib;
    const total = this.cfg.calibrationSec;
    if (!c.started && rpm > 0) c.started = true;
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
    if (base < this.cfg.minRpm) base = this.cfg.fallbackRpm;
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
    this.slopeDir = 0;
    this.slopeLevel = 0;
    this.ramp = null;
    this.gameIndex = 0;
    this.current = null;
    this.streak = 0;
    this.bestStreak = 0;
    this.renderStreak();
    this.types = this.enabledTypes();   // 이번 라운드에 돌릴 게임 (중간에 바뀌지 않게 여기서 고정)
    this.stats = {};
    GAME_TYPES.forEach((T) => (this.stats[T.id] = { plays: 0, cleared: 0, correct: 0, total: 0, points: 0 }));
    this.band.cfg = this.cfg;
    this.band.setSlope(0);
    this.band.theta = 0;
    this.band.floaters = [];
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
      this.audio.sfx('go');
      this.state = 'play';
    }, gen);
    this.after(3600, () => this.nextGame(), gen);
  },

  nextGame() {
    const T = this.types[this.gameIndex % this.types.length];
    const cycle = Math.floor(this.gameIndex / this.types.length);
    const level = Math.min(cycle + this.cfg.startLevel, T.maxLevel);
    const mult = 1 + this.cfg.multiplierStep * (level - 1);
    const firstTime = cycle === 0;
    this.gameIndex++;
    this.current = null;

    const gen = ++this.gen;
    const cog = $('#cog');
    cog.innerHTML = '';
    const intro = U.el('div', 'intro');
    intro.innerHTML = `
      <div class="tag">${firstTime ? '새 게임' : '레벨 업'}${mult > 1 ? ` · x${mult.toFixed(1)}` : ''}</div>
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
    return {
      stage,
      level,
      mult,
      base: this.cfg.cogBasePoints,
      after: (ms, fn) => this.after(ms, fn, gen),
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
        this.addScore(pts);
        this.floatAt(anchor, `${prefix}+${pts}`);
      },
      done: (res) => {
        if (gen !== this.gen || this.state !== 'play') return;
        this.record(T, res);
        // 한 게임을 다 맞혔으면 따로 축하한다. 게임마다 넣지 않고 여기서 한 번에 처리한다.
        if (!res.cleared) return this.nextGame();
        this.audio.sfx('clear');
        const b = U.el('div', 'perfect', '완벽!');
        stage.append(b);
        this.after(950, () => this.nextGame(), gen);
      },
    };
  },

  // ---------------- 정답 보상 ----------------
  // 연속 정답은 점수에 손대지 않는다. 운동 점수와 인지 점수의 균형을 흔들지 않으면서
  // '지키고 싶은 것'만 하나 만들어 주는 게 목적이다.
  hit(ok) {
    if (ok) {
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      this.audio.reward(this.streak);
      this.band.celebrate();
      this.flashGlow(this.streak);
    } else {
      this.audio.sfx(this.streak >= 3 ? 'drop' : 'bad');
      this.streak = 0;
    }
    this.renderStreak();
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
    el.style.background = `radial-gradient(ellipse at 50% 55%, rgba(31,157,85,${a}) 0%, rgba(31,157,85,0) 62%)`;
    $('#cog').append(el);
    setTimeout(() => el.remove(), 440);
  },

  record(T, res) {
    const s = this.stats[T.id];
    s.plays++;
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

    // 목표 RPM 변화 → 지면 각도
    const seg = Math.floor(this.elapsed / cfg.rpmChangeSegmentSec);
    const dir = cfg.rpmChange ? SLOPE_PATTERN[seg % SLOPE_PATTERN.length] : 0;
    if (dir !== this.slopeDir) {
      this.slopeDir = dir;
      this.ramp = { from: this.slopeLevel, to: dir, t0: this.elapsed };
      this.flashBandMsg(SLOPE_MSG[dir]);
    }
    // 목표 RPM과 지면 각도를 rpmRampSec에 걸쳐 부드럽게 전환 (smoothstep)
    if (this.ramp) {
      const t = U.clamp((this.elapsed - this.ramp.t0) / Math.max(cfg.rpmRampSec, 0.001), 0, 1);
      const e = t * t * (3 - 2 * t);
      this.slopeLevel = U.lerp(this.ramp.from, this.ramp.to, e);
      if (t >= 1) this.ramp = null;
    }
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
      const color = pts >= cfg.tickMaxPoints ? '#1f9d55' : pts > 0 ? '#e08a00' : '#e5484d';
      this.band.addFloater(`+${pts}`, color);
    }

    if (this.elapsed >= cfg.durationSec) this.endRound();
  },

  flashBandMsg(text) {
    let m = $('#band-msg');
    if (!m) {
      m = U.el('div');
      m.id = 'band-msg';
      $('#band').append(m);
    }
    m.textContent = text;
    m.classList.remove('show');
    void m.offsetWidth;
    m.classList.add('show');
  },

  endRound() {
    this.state = 'result';
    if (this.current) {
      // 중단된 게임: 부분 점수는 abort 안에서 지급될 수 있도록 상태를 잠깐 play로 둔다
      this.state = 'play';
      const res = this.current.game.abort();
      this.state = 'result';
      if (res.total > 0) this.record(this.current.T, res);
    }
    this.gen++;
    this.timers = [];
    this.audio.stop();
    this.audio.sfx('end');
    $('#cog').innerHTML = '';
    this.showResult();
  },

  showResult() {
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
    $('#res-name').value = '';
    this.savedId = null;
    this.renderBoard($('#res-board'));
    this.show('result');
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

      if (this.state === 'countdown' || this.state === 'play') {
        if (this.state === 'play') this.updatePlay(dt, rpm);
        if (this.state === 'countdown' || this.state === 'play') {
          this.band.update(dt, rpm, (rpm - this.target) / this.target);
          this.band.draw();
          this.updateHud();
        }
      }
      this.runTimers();
      this.updateDebug(rpm);
    }
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
      `input    ${this.pedal.sensorOn ? `sensor ${this.pedal.sensorRpm}rpm fw ${this.link.firmware || '?'}` : `keyboard (link ${this.link.state})`}`,
      `rpm      ${rpm.toFixed(1)}`,
      `target   ${this.target ? this.target.toFixed(1) : '-'}`,
      `baseline ${this.baseline ? this.baseline.toFixed(1) : '-'}`,
      `dev      ${this.target ? (((rpm - this.target) / this.target) * 100).toFixed(1) + '%' : '-'}`,
      `ex/cog   ${this.exScore ?? 0} / ${this.cogScore ?? 0}`,
    ].join('\n');
  },
};

App.init();
