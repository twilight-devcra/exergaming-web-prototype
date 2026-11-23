// 앱 본체 (테스트 화면 · 운영 버전 공통): 라운드 흐름(속도 측정 → 카운트다운 → 인지 게임 · 속도 전환 → 마무리),
// 페달 · 키 입력, 게임 시계, 메인 루프. 판마다 다른 일은 js/edition.js, 화면 위쪽 점수판은 js/score-hud.js
import { EASY_TIME, MUSIC_STYLES, PHONE_LANDSCAPE, Config, EDITION, DEMO, $, Util } from './config.js';
import { Pedal } from './pedal.js';
import { NUS, PedalLink } from './pedal-link.js';
import { LzCadence } from './cadence-est.js';
import { BeatAudio } from './audio.js';
import { Band } from './band.js';
import { ExerciseMeter } from './exercise.js';
import { Effects } from './fx.js';
import { Theme } from './themes.js';
import { Diagram } from './diagram.js';
import { GAME_TYPES } from './games/index.js';
import { planPass } from './game-order.js';
import { Difficulty } from './difficulty.js';
import { RoundStats } from './round-stats.js';
import { ScoreHud } from './score-hud.js';
import { SessionLog } from './session-log.js';
import { StationEdition } from './demo.js';
import { TestEdition } from './edition.js';
import { Sfx } from './sfx.js';

// 이 페이지의 판: 운영 버전(app/)은 스테이션 흐름, 테스트 화면은 메뉴 흐름 (js/edition.js)
const PAGE_EDITION = DEMO ? StationEdition : TestEdition;
const SLOPE_PATTERN = [0, 1, 0, -1]; // 평지 → 오르막(빠르게) → 평지 → 내리막(천천히)
const SLOPE_MESSAGES = { 1: '오르막! 조금 더 빠르게', '-1': '내리막! 조금 더 천천히', 0: '평지! 원래 속도로' };
const SHIFT_LEAD_SEC = 0.8;  // 화면이 넓어지고 안내를 읽을 시간. 그 뒤에 목표 속도가 움직이기 시작한다
const SHIFT_OUT_MS = 650;    // 화면이 다시 줄어드는 시간. 그 뒤에 다음 인지 게임이 나온다

const App = {
  edition: PAGE_EDITION,
  config: PAGE_EDITION.loadConfig(),
  pedal: new Pedal(),
  link: new PedalLink(),
  lzCadence: new LzCadence(),
  capAt: 0,      // 마지막으로 CAP 을 건 시각 (performance.now). 0 = 걸려 있지 않음
  audio: new BeatAudio(),
  state: 'menu', // menu | attract | calib | countdown | play | result
  meter: new ExerciseMeter(),
  paused: false,
  linkPaused: false, // 페달 연결이 끊겨서 걸린 일시정지. 다시 연결되면 자동으로 풀린다
  rotatePaused: false, // 휴대폰을 가로로 눕혀서 걸린 일시정지 (테스트 화면). 세로로 돌리면 풀린다
  rotated: matchMedia(PHONE_LANDSCAPE), // 지금 휴대폰이 가로로 누워 있는가 (.matches)
  clock: 0,      // 일시정지 중에는 멈추는 게임 시계 (ms)
  timers: [],
  generation: 0, // 인지 게임 세대. 바뀌면 이전 게임의 예약 콜백/점수 지급은 무시된다

  init() {
    this.band = new Band($('#band-canvas'), this.config);
    // 큰 깃발을 지날 때만 소리를 낸다. 작은 깃발까지 울리면 박자 소리와 섞여 시끄럽다.
    this.band.onMilestone = (milestone) => {
      if (milestone % Band.MARK_BIG !== 0) return;
      this.audio.sfx(Sfx.START);
      Effects.confetti(0.35);
    };
    // 회원의 지난 기념물을 지날 때 (운영 버전). 가장 높은 기록을 넘는 순간만 알린다
    this.band.onLandmark = (landmark) => {
      if (!landmark.best || this.state !== 'play') return;
      this.band.addFloater('최고 기록 넘었어요!', 'good');
      this.audio.sfx(Sfx.START);
      Effects.confetti(0.35);
    };
    // 라운드 끝 짓기 연출 (운영 버전, Band.plant): 한 단계(층·지붕) 올릴 때마다 통통, 다 지으면 축하
    this.band.onBuildStep = (i, stepCount) => this.audio.sfx(i === stepCount - 1 ? Sfx.BUILD_TOP : Sfx.BUILD);
    this.band.onBuilt = () => {
      this.audio.sfx(Sfx.CLEAR);
      Effects.confetti(0.6);
    };
    Effects.init();
    Theme.init(this.band);
    this.bindMusic();
    this.renderGameToggles();
    this.edition.bindScreens(this);
    this.bindKeys();
    this.bindLink();
    this.rotated.addEventListener('change', () => this.onRotate());
    this.pedal.onStroke = (key) => this.onStroke(key);
    this.edition.start(this);
    $('#btn-start').onclick = () => this.startRound();
    $('#btn-resume').onclick = () => this.setPaused(false);
    $('#btn-quit').onclick = () => this.quit();
    this.lastFrameAt = performance.now();
    requestAnimationFrame((now) => this.loop(now));
  },

  // ---------------- 메뉴 / 설정 ----------------
  // 게임 목록은 GAME_TYPES에서 만든다 — 게임을 추가하면 설정에도 저절로 나타난다
  renderGameToggles() {
    const box = $('#cfg-games');
    GAME_TYPES.forEach((gameType) => {
      box.append(Util.element('label', 'setting', `${gameType.title}<input type="checkbox" data-game="${gameType.id}">`));
    });
    box.addEventListener('change', (event) => {
      // 운영 버전에는 게임 수 표시·시작 버튼 막기가 없으니 예전처럼 마지막 하나는 꺼지지 않게 되돌린다
      if (!$('#cfg-games-count') && ![...box.querySelectorAll('input')].some((checkbox) => checkbox.checked)) event.target.checked = true;
      this.renderGamesCount();
    });
    // 모두 해제한 뒤 하나만 고르기 쉽게, 게임을 전부 끌 수도 있다 (그동안은 시작 버튼을 막는다)
    const setAll = (checked) => {
      box.querySelectorAll('input').forEach((checkbox) => (checkbox.checked = checked));
      this.renderGamesCount();
    };
    // 운영 버전(app/index.html)도 이 파일을 쓰지만 이 버튼들은 테스트 화면에만 있다
    if (!$('#cfg-games-all')) return;
    $('#cfg-games-all').onclick = () => setAll(true);
    $('#cfg-games-none').onclick = () => setAll(false);
  },

  // 게임 탭 이름 옆에 켜 둔 게임 수 (다른 탭을 보고 있어도 몇 개 꺼 두었는지 보이게).
  // 하나도 안 골랐으면 시작 버튼을 막고 이유를 버튼에 적는다
  renderGamesCount() {
    if (!$('#cfg-games-count')) return; // 운영 버전에는 없다
    const boxes = [...document.querySelectorAll('#cfg-games input')];
    const checkedCount = boxes.filter((checkbox) => checkbox.checked).length;
    $('#cfg-games-count').textContent = `${checkedCount}/${boxes.length}`;
    $('#cfg-games-count').classList.toggle('none', !checkedCount);
    $('#cfg-games-all').disabled = checkedCount === boxes.length;
    $('#cfg-games-none').disabled = !checkedCount;
    const start = $('#btn-start');
    start.disabled = !checkedCount;
    start.textContent = checkedCount ? '시작하기' : '게임을 하나 이상 고르세요';
  },

  // 설정에서 켜 둔 게임만, GAME_TYPES에 적힌 순서대로
  enabledTypes() {
    const ids = this.config.games;
    if (!ids) return GAME_TYPES;
    const list = GAME_TYPES.filter((gameType) => ids.includes(gameType.id));
    return list.length ? list : GAME_TYPES;
  },

  // 측정 방식은 고르는 즉시 적용한다 (라운드 시작을 기다리지 않고 페달 연결 상태에도 바로 반영)
  applySource() {
    const source = this.config.rpmSource;
    this.pedal.lzOn = source !== 'pedal';
    $('#cfg-source-note').textContent = {
      // eslint-disable-next-line id-length -- 저장된 설정값 (config.rpmSource)
      zc: '페달 원시 파형에서 반 바퀴마다 갱신. 느리게 밟아도 놓치지 않고 지연이 짧습니다 (약 1.4초).',
      comb: '영교차에 빠른 파형 모양 추정을 섞음. 조금 빠르지만 느릴 때 흔들립니다.',
      teo: '가장 빠르지만(약 1.1초) 느리게 밟을 때 공이 떨립니다.',
      pedal: '페달이 1초마다 보내는 값 (지연 약 3.9초). 느리게 밟으면 0으로 떨어질 수 있습니다.',
    }[source] + (source !== 'pedal' ? ' 파형이 끊기면 avg_rpm 으로 돌아갑니다.' : '');
  },

  show(id) {
    document.querySelectorAll('.screen').forEach((screen) => screen.classList.toggle('active', screen.id === id));
    if (id === 'menu') this.state = 'menu';
    if (id === 'attract') this.state = 'attract';
    this.edition.onScreen(this, id);
  },

  get inRound() {
    return ['calib', 'countdown', 'play'].includes(this.state);
  },

  // ---------------- 입력 ----------------
  bindKeys() {
    window.addEventListener('keydown', (event) => {
      if (this.log && !event.repeat) this.log.key(event.code);
      // 스테이션 모드에는 일시정지 메뉴와 디버그 표시가 없다 (운영 메뉴로만 멈춘다)
      if (event.code === 'Escape') {
        if (this.edition.pauseMenu && this.inRound) this.setPaused(!this.paused);
        return;
      }
      if (event.target.tagName === 'INPUT') return;
      if (event.code === 'KeyT' && this.edition.devKeys && !event.repeat) {
        Theme.next();
        return;
      }
      if (event.code === 'Backquote') {
        if (!this.edition.devKeys) return;
        $('#debug').classList.toggle('active');
        return;
      }
      if (event.repeat || this.paused) return;
      if (event.code === 'KeyA' || event.code === 'KeyD') this.pedal.press(event.code);
    });
  },

  onStroke(key) {
    const keyHint = document.querySelector(`#keyhint kbd[data-k="${key}"]`);
    if (keyHint) {
      keyHint.classList.add('hit');
      setTimeout(() => keyHint.classList.remove('hit'), 90);
    }
  },

  // ---------------- 페달 센서 ----------------
  // 음악 스타일 고르기와 미리 듣기 (테스트 화면 '화면·소리' 탭, 운영 메뉴). 고른 것은 이 태블릿에 저장되고 다음 판부터 쓴다
  bindMusic() {
    const pickers = document.querySelectorAll('select[data-music-picker]');
    pickers.forEach((picker) => {
      picker.innerHTML = MUSIC_STYLES.map((style) => `<option value="${style.id}">${style.label}</option>`).join('');
      picker.value = Config.music();
      picker.onchange = () => {
        Config.setMusic(picker.value);
        pickers.forEach((other) => (other.value = picker.value));
        // 듣는 중이었으면 새 스타일로 이어 듣는다
        if (this.audio.previewing) this.audio.preview(picker.value, 12);
        this.renderMusicTry();
      };
    });
    document.querySelectorAll('[data-music-try]').forEach((button) => (button.onclick = () => {
      if (this.audio.previewing) this.audio.endPreview();
      else if (!this.inRound) this.audio.preview(Config.music(), 12);
      this.renderMusicTry();
    }));
  },

  renderMusicTry() {
    const previewing = !!this.audio.previewing;
    document.querySelectorAll('[data-music-try]').forEach((button) => {
      button.textContent = previewing ? '그만 듣기' : '미리 듣기';
      button.disabled = this.inRound;
    });
    clearTimeout(this.musicTryTimer);
    if (previewing) this.musicTryTimer = setTimeout(() => this.renderMusicTry(), 500);
  },

  bindLink() {
    // 연결 버튼과 상태 표시는 메뉴·운영 메뉴·대기 화면에 여러 개 있다
    const buttons = document.querySelectorAll('[data-pedal-btn]');
    buttons.forEach((button) => (button.onclick = () => (this.link.wantLink ? this.link.disconnect() : this.link.connect())));
    this.link.onState = (state, detail) => this.onLinkState(state, detail);
    this.link.onWorkout = (workout) => {
      this.pedal.sensorFrame(workout.rpm);
      if (this.log) this.log.workoutFrame(workout);
    };
    this.link.onFrame = (raw, frame) => this.onPedalFrame(frame);
    $('#cfg-source').onchange = () => {
      this.config.rpmSource = $('#cfg-source').value;
      Config.save(this.config);
      this.applySource();
    };
    if (this.link.supported) {
      this.onLinkState('idle', '키보드로 입력 중');
    } else {
      buttons.forEach((button) => (button.disabled = true));
      this.onLinkState('idle', '이 브라우저에서는 페달을 연결할 수 없습니다 (Chrome·Edge 필요)');
    }
  },

  // 원시 파형(CAPD) → 케이던스. 고른 방식의 값을 페달에 넣는다
  onPedalFrame(frame) {
    if (!frame || frame.name !== 'CAPD' || frame.values.length !== 21) return;
    const values = frame.values.map(Number);
    if (values.some((value) => !Number.isFinite(value))) return;
    if (this.log) this.log.capdFrame(values);
    const estimates = this.lzCadence.capd(values);
    const source = this.config.rpmSource;
    // 추정이 아직 준비되지 않은 0(연결 직후·긴 유실 뒤 첫 바퀴)은 넣지 않는다. 진짜 정지(진폭이 정지 수준)만 0 으로 넣는다.
    // 넣지 않는 동안은 직전 값이 유지되다가 1초가 지나면 avg_rpm 으로 돌아간다.
    if (source !== 'pedal' && (estimates.stopped || estimates[source] > 0)) this.pedal.lzFrame(estimates.stopped ? 0 : estimates[source]);
  },

  // 파형을 쓰는 동안 CAP 을 켜 둔다. 펌웨어가 300초 뒤 스스로 멈추므로 그 전에 다시 건다.
  // (페달 저장소 docs/02-system-sequence.md §5 — 읽기 전용, 연결이 끊기면 펌웨어가 바로 멈춘다)
  capTick(now) {
    const want = this.link.state === 'ready' && this.config.rpmSource !== 'pedal';
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
    this.lzCadence.reset();
    document.body.classList.toggle('sensor', ready);
    document.querySelectorAll('.pedal-status').forEach((statusLabel) => {
      statusLabel.dataset.state = state;
      statusLabel.textContent = detail;
    });
    document.querySelectorAll('[data-pedal-btn]').forEach((button) => (button.textContent = this.link.wantLink ? '연결 해제' : '페달 연결'));
    if (this.log) this.log.event('link', { state, detail });
    if (this.edition.onLink(this, state, detail)) return;

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

  // 휴대폰을 가로로 눕히면 화면이 '세로로 돌려 주세요'로 덮이므로 라운드를 멈추고, 다시 세우면 이어 간다.
  // 운영 버전은 Demo.syncPause 가 다른 멈춤(운영 메뉴·페달 끊김)과 함께 다룬다 (StationEdition.onRotate)
  onRotate() {
    if (this.log) this.log.event('rotate', { landscape: this.rotated.matches });
    if (this.edition.onRotate(this)) return;
    if (this.rotated.matches && this.inRound && !this.paused) {
      this.setPaused(true);
      this.rotatePaused = true;
      $('#pause-note').textContent = '휴대폰을 세로로 돌리면 이어집니다.';
    } else if (!this.rotated.matches && this.rotatePaused) {
      this.setPaused(false);
    }
  },

  setPaused(paused) {
    if (this.log && paused !== this.paused) this.log.event(paused ? 'pause' : 'resume');
    this.paused = paused;
    if (!paused) {
      this.linkPaused = false;
      this.rotatePaused = false;
      $('#pause-note').textContent = '';
    }
    if (this.edition.pauseMenu) $('#pause').classList.toggle('active', paused);
    if (paused) this.audio.pause();
    else this.audio.resume();
  },

  // 라운드를 버리고 나간다 (결과 없음). 기록은 'abandoned' 로 닫는다
  quit() {
    this.closeLog('abandoned');
    this.setPaused(false);
    this.audio.stop();
    this.generation++;
    this.timers = [];
    // 하던 게임도 멈춘다 (애니메이션·ResizeObserver). 안 멈추면 따라가기의 공 움직임이 다음 판 시계로 계속 돌다 멈춘다.
    // generation 을 올린 뒤라 abort 가 점수나 기록을 남기지 않는다
    if (this.current) {
      this.current.game.abort();
      this.current = null;
    }
    this.clearShift();
    $('#cog').innerHTML = '';
    this.show(this.edition.homeScreen);
  },

  // 참가자가 '그만하기'로 끝냄 (운영 버전, js/demo.js bindEnd). 하던 데까지를 세션 로그에 ended 'user' 로 남기고(업로드됨)
  // 결과 화면 없이 대기 화면으로 간다. 결과 화면을 거치지 않으므로 회원 기록·달력·기념물·이 태블릿의 기록에는 들어가지 않는다
  endEarly() {
    if (!this.inRound) return;
    if (this.current && this.state === 'play') {
      const result = this.current.game.abort();
      const { host } = this.current;
      if (result.total > 0) this.roundStats.record(this.current.type.id, result, host.level, this.clock - host.startClock);
      this.log.event('game_abort', { game: this.current.type.id, ...result });
      this.current = null;
    }
    this.closeLog('user');
    this.quit();
  },

  // ---------------- 게임 시계 기반 예약 ----------------
  after(delayMs, callback, generation = this.generation) {
    this.timers.push({ dueAt: this.clock + delayMs, callback, generation });
  },

  runTimers() {
    const due = this.timers.filter((timer) => timer.dueAt <= this.clock);
    if (!due.length) return;
    this.timers = this.timers.filter((timer) => timer.dueAt > this.clock);
    due.sort((a, b) => a.dueAt - b.dueAt);
    for (const timer of due) if (timer.generation === this.generation) timer.callback();
  },

  // ---------------- 라운드 흐름 ----------------
  startRound() {
    this.edition.beforeRound(this);
    this.meter.reset();
    this.audio.ensure();
    this.audio.setMuted(!this.config.sound);
    this.audio.setStyle(Config.music());
    this.pedal.reset();
    // 두뇌 게임만 하는 판: 페달을 쓰지 않으므로 페달이 끊겨도 멈추지 않는다
    this.brainOnly = !!this.config.brainOnly;
    this.roundSensor = this.pedal.sensorOn && !this.brainOnly;
    this.generation++;
    this.timers = [];
    this.clock = 0;
    // follow = 측정 중 비트 템포가 따라가는 속도 (RPM). 비트가 속도를 끌고 가면 '편안한 속도'가 비트 쪽으로 쏠리므로,
    // 측정 중에는 밟는 속도를 천천히 따라가기만 한다. 비트는 밟기 시작할 때 그 속도로 시작한다 (updateCalib)
    this.calib = { elapsed: 0, started: false, samples: [], angle: 0, follow: this.config.fallbackRpm };
    document.querySelectorAll('.round-end').forEach((leftover) => leftover.remove()); // 마무리 화면 중에 운영 메뉴로 버린 판의 것
    this.log = new SessionLog(this);
    if (this.brainOnly) {
      // 속도 측정 없이 바로 카운트다운. 음악은 정해 둔 박자로 서서히 들어온다 (기준·목표 속도는 없다)
      this.log.event('calib_skip', { track: 'brain' });
      this.baseline = null;
      this.target = null;
      this.audio.start(() => this.config.fallbackRpm * 2, { fadeIn: 2.5 });
      this.beginCountdown();
      return;
    }
    this.show('calib');
    this.state = 'calib';
    this.log.event('calib_start');
  },

  // 세션 기록을 닫는다. 판에 따라 바로 저장하기도 한다 (StationEdition.logClosed)
  closeLog(ended) {
    const log = this.log;
    if (!log || log.done) return;
    log.finish(ended, this.summary());
    this.edition.logClosed(this, log, ended);
  },

  summary() {
    const meter = this.meter;
    return {
      score: this.score ?? 0, exScore: this.exScore ?? 0, cogScore: this.cogScore ?? 0,
      baseline: this.baseline ?? null, bestStreak: this.roundStats?.bestStreak ?? 0, elapsedSec: Math.round((this.elapsed ?? 0) * 10) / 10,
      stats: this.roundStats?.games || null,
      exercise: { kcal: Math.round(meter.kcal * 100) / 100, distM: Math.round(meter.distM), revs: Math.round(meter.revs * 10) / 10, avgRpm: Math.round(meter.avgRpm * 10) / 10, activeSec: Math.round(meter.activeSec) },
    };
  },

  updateCalib(deltaSec, rpm) {
    const calib = this.calib;
    const total = this.config.calibrationSec;
    if (!calib.started && rpm > 0) {
      calib.started = true;
      this.log.event('calib_pedaling');
      // 비트는 밟기 시작한 뒤에 그 속도로 서서히 들어온다
      calib.follow = rpm;
      this.audio.start(() => Util.clamp(this.calib.follow, 30, 110) * 2, { fadeIn: 2.5 });
    }
    if (calib.started) {
      calib.elapsed += deltaSec;
      if (calib.elapsed > Math.min(this.config.calibrationIgnoreSec, total * 0.3) && rpm > 0) {
        // 정렬된 채로 넣는다 (중앙값을 매 프레임 읽는다)
        const samples = calib.samples;
        let low = 0, high = samples.length;
        while (low < high) { const middle = (low + high) >> 1; if (samples[middle] < rpm) low = middle + 1; else high = middle; }
        samples.splice(low, 0, rpm);
      }
    }
    // 비트 템포가 따라가는 값. 기준 속도는 표본의 중앙값이라, 표본이 쌓이기 시작하면 비트도 지금 속도가 아니라 그 중앙값을 따라간다.
    // 지금 속도를 따라가면 측정 끝 무렵에 빨라진 만큼 비트가 기준보다 빨라져 있다가 카운트다운에서 갑자기 느려지고,
    // 그 빠른 박자를 이어 밟아 공이 오른쪽에 머문다 (2026-10-23 세션: 끝에서 77 BPM → 기준 72 BPM)
    const aim = calib.samples.length ? calib.samples[calib.samples.length >> 1] : rpm;
    // 비트 템포가 따라가는 빠르기 (시간 상수, 초). 밟기 시작한 직후에는 첫 걸음의 느린 속도에서 금방 올라오도록 빠르게,
    // 그 뒤에는 한 걸음씩의 흔들림을 걸러 낼 만큼만 늦춘다 (예전 1.5초는 굼떠 보였다). 멈추면 마지막 템포를 그대로 둔다
    const tau = calib.elapsed < 3 ? 0.25 : 0.6;
    if (rpm > 0) calib.follow += (aim - calib.follow) * (1 - Math.exp(-deltaSec / tau));
    calib.angle += (rpm / 60) * 360 * deltaSec;
    $('#calib-crank').setAttribute('transform', `rotate(${calib.angle} 110 110)`);
    const progress = Util.clamp(calib.elapsed / total, 0, 1);
    $('#calib-arc').setAttribute('stroke-dashoffset', String(603.2 * (1 - progress)));
    $('#calib-num').textContent = calib.started ? Math.ceil(total - calib.elapsed) : '';
    $('#calib-state').textContent = !calib.started
      ? '페달을 밟으면 측정이 시작됩니다'
      : rpm > 0 ? '좋아요, 이 속도를 유지하세요' : '계속 밟아주세요';
    if (calib.elapsed >= total) this.finishCalib();
  },

  finishCalib() {
    const sorted = this.calib.samples.slice().sort((a, b) => a - b);
    let base = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    const measured = base;
    if (base < this.config.minRpm) base = this.config.fallbackRpm;
    this.log.event('calib_end', { baseline: Math.round(base * 10) / 10, measured: Math.round(measured * 10) / 10, samples: sorted.length, fallback: base !== measured });
    this.baseline = base;
    this.target = base;
    this.beginCountdown();
  },

  beginCountdown() {
    this.state = 'countdown';
    this.score = 0;
    ScoreHud.reset();
    this.exScore = 0;
    this.cogScore = 0;
    this.elapsed = 0;
    this.tickAcc = 0;
    this.tickTime = 0;
    this.tickOut = false;
    this.slopeStep = 0;                 // SLOPE_PATTERN에서 지금 몇 번째인가
    this.slopeLevel = 0;                // 현재 지면 기울기 -1 ~ 1 (목표 RPM 배율과 지면 각도를 함께 정한다)
    this.nextShiftAt = this.shiftGap();
    this.clearShift();
    this.gameIndex = 0;
    this.pass = [];                     // 이번 바퀴에 남은 게임 (planPass)
    this.inIntro = false;               // 게임 소개 중이면 라운드 시계·운동 점수가 멈춘다 (updatePlay)
    this.previousType = null;
    this.lastLevel = {};                // 게임별 지난번 레벨 (처음 나오는 게임은 소개를 길게 보여 준다)
    this.current = null;
    this.types = this.enabledTypes();   // 이번 라운드에 돌릴 게임 (중간에 바뀌지 않게 여기서 고정)
    this.difficulty = new Difficulty(this.config, this.types.length); // 다음 게임의 레벨 (js/difficulty.js)
    this.roundStats = new RoundStats(GAME_TYPES);                   // 게임별 성적 · 연속 정답 (js/round-stats.js)
    ScoreHud.renderStreak(this.roundStats.streak);
    this.band.config = this.config;
    this.band.brainOnly = this.brainOnly;
    $('#game').classList.toggle('brain-only', this.brainOnly);
    this.band.setSlope(0);
    this.band.theta = 0;
    this.band.restart();
    $('#game').classList.remove('build'); // 지난 판의 짓기 연출이 남아 있지 않게
    this.show('game');
    this.band.resize();
    this.updateHud();
    // 측정 때부터 이어지는 비트를 끊지 않고 목표 속도로 넘긴다. 템포가 남아 있던 차이는 카운트다운 3초에 걸쳐 들리게 옮긴다
    // (오디오 시계 기준이라 일시정지 동안은 멈춘다)
    const audioContext = this.audio.audioContext;
    const startTempo = Util.clamp(this.calib.follow, 30, 110), startedAt = audioContext ? audioContext.currentTime : 0;
    if (!this.brainOnly) this.audio.setTempo(() => {
      const progress = audioContext ? Util.clamp((audioContext.currentTime - startedAt) / 3, 0, 1) : 1;
      return Util.lerp(startTempo, this.target, progress * progress * (3 - 2 * progress)) * 2;
    });

    const cog = $('#cog');
    const generation = this.generation;
    const intro = Util.element('div', 'intro');
    intro.innerHTML = this.brainOnly ? `
      <div class="tag">준비 · 두뇌 게임만</div>
      <div class="hint">이번에는 페달을 밟지 않아도 돼요.<br>
      음악을 들으며 아래에 나오는 게임을 풀면 됩니다.</div>
      <div class="big-count">3</div>` : `
      <div class="tag">준비</div>
      <div class="hint">비트에 맞춰 ${this.pedal.sensorOn ? '<b>페달</b>을' : '<b>A · D</b>를'} 밟아 ${EDITION === 'app' ? '자전거를 <b style="color:var(--good)">초록 구간</b>' : '공을 <b style="color:var(--good)">초록 구역</b>'} 안에 두세요.<br>
      그러면서 아래에 나오는 게임을 풀면 됩니다.</div>
      <div class="big-count">3</div>`;
    cog.innerHTML = '';
    cog.append(intro);
    const countLabel = intro.querySelector('.big-count');
    this.audio.sfx(Sfx.COUNT);
    this.after(1000, () => { countLabel.textContent = '2'; this.audio.sfx(Sfx.COUNT); }, generation);
    this.after(2000, () => { countLabel.textContent = '1'; this.audio.sfx(Sfx.COUNT); }, generation);
    this.after(3000, () => {
      countLabel.textContent = 'GO!';
      countLabel.classList.add('go');
      this.audio.sfx(Sfx.START);
      Effects.cleared(countLabel);
      this.state = 'play';
      this.log.event('play_start');
    }, generation);
    this.after(3600, () => this.nextGame(), generation);
  },

  nextGame() {
    if (this.shiftDue()) return this.beginShift();
    if (!this.pass.length) this.pass = planPass(this.types, this.previousType, this.gameIndex === 0);
    const GameType = this.pass.shift();
    this.previousType = GameType;
    const level = this.difficulty.levelFor(GameType, this.gameIndex);
    // Lv1 x1.0 → Lv8 x multiplierTop (config.js 의 Config.levelMultiplier)
    const multiplier = Config.levelMultiplier(this.config, level);
    const previousLevel = this.lastLevel[GameType.id];
    const firstTime = previousLevel == null;
    this.lastLevel[GameType.id] = level;
    this.gameIndex++;
    this.current = null;
    this.log.event('game_start', { game: GameType.id, level, mult: Math.round(multiplier * 100) / 100, diff: Math.round(this.difficulty.value * 100) / 100 });

    const generation = ++this.generation;
    const cog = $('#cog');
    cog.innerHTML = '';
    const intro = Util.element('div', 'intro');
    intro.innerHTML = `
      <div class="title"><div class="name">${GameType.title}</div><span class="level">Lv.${level}</span></div>
      ${Diagram.render(GameType, level)}
      <div class="hint">${typeof GameType.hint === 'function' ? GameType.hint(level) : GameType.hint}</div>
      <div class="skip">화면을 누르면 바로 시작합니다</div>`;
    cog.append(intro);
    this.inIntro = true;
    // 소개는 처음 나올 때 길게, 다시 나올 때 짧게. 문제 제한 시간 배율(라운드 난이도)만큼 늘리고, 누르면 바로 넘어간다
    const { first, again } = this.config.introMs;
    const introMs = (firstTime ? first : again) * (this.config.questionTimeScale || 1);
    let begun = false;
    const introStartClock = this.clock;
    const begin = (skipped) => {
      if (begun || generation !== this.generation) return;
      begun = true;
      this.inIntro = false;
      this.log.event('intro_end', { game: GameType.id, ms: Math.round(this.clock - introStartClock), skipped: !!skipped }); // eslint-disable-line id-length -- 세션 로그 형식
      cog.innerHTML = '';
      const stage = Util.element('div', 'stage');
      cog.append(stage);
      const host = this.makeHost(GameType, stage, level, multiplier, generation);
      this.current = { type: GameType, game: new GameType(host), host };
      this.current.game.start();
    };
    this.after(introMs, () => begin(false), generation);
    this.after(600, () => intro.addEventListener('pointerdown', () => begin(true)), generation);
  },

  makeHost(GameType, stage, level, multiplier, generation) {
    const startClock = this.clock;
    return {
      stage,
      level,
      multiplier,
      startClock,
      base: this.config.cogBasePoints,
      after: (delayMs, callback) => this.after(delayMs, callback, generation),
      // 게임 시계 (ms). 일시정지·운영 메뉴·소개 중에는 멈춘다 — 움직임을 그리는 게임은 벽시계 대신 이것으로 위치를 정한다
      now: () => this.clock,
      // 문제 하나의 제한 시간. load = 그 문제의 일의 양 (config.questionTime 참고). 다 되면 onOut 을 부른다
      timer: (load, onOut) => this.startQuestionTimer(GameType, stage, level, load, onOut, generation),
      stopTimer: () => this.stopQuestionTimer(),
      // 세션 기록 (js/session-log.js). question = 입력을 받기 시작한 문제의 내용, input = 답 도중의 입력, answer = 최종 답.
      // 문제를 보여 준 뒤 한참 있다가 입력이 열리는 게임은 question(data, false) 로 띄우고 열리는 순간 open() 을 부른다
      question: (data, open = true) => generation === this.generation && this.log.question(GameType.id, level, data, open),
      open: () => generation === this.generation && this.log.open(GameType.id),
      input: (data) => generation === this.generation && this.log.input(GameType.id, data),
      answer: (data) => {
        if (generation !== this.generation) return;
        const { thinkMs, first } = this.log.answer(GameType.id, data);
        if (this.state === 'play') this.roundStats.think(GameType.id, thinkMs, first, !!data.timedOut, this.questionLimitMs);
        this.questionLimitMs = null;
      },
      // 게임들은 정답에 Sfx.GOOD, 오답에 Sfx.BAD 를 울린다. 그 둘만 가로채 연속 정답을 세고 보상을 키운다.
      // (게임 쪽 코드를 건드리지 않고 한 곳에서 보상을 다룰 수 있다)
      sfx: (name) => {
        if (name === Sfx.GOOD) return this.hit(true);
        if (name === Sfx.BAD) return this.hit(false);
        this.audio.sfx(name);
      },
      award: (points, anchor, prefix = '') => {
        if (generation !== this.generation || this.state !== 'play') return;
        points = Math.round(points);
        if (points <= 0) return;
        this.cogScore += points;
        this.roundStats.addPoints(GameType.id, points);
        this.log.event('points', { game: GameType.id, pts: points });
        this.addScore(points, anchor, `${prefix}+${points}`);
      },
      done: (result) => {
        if (generation !== this.generation || this.state !== 'play') return;
        this.roundStats.record(GameType.id, result, level, this.clock - startClock);
        this.log.event('game_end', { game: GameType.id, ...result });
        // 한 게임을 다 맞혔으면 따로 축하한다. 게임마다 넣지 않고 여기서 한 번에 처리한다.
        if (!result.cleared) return this.nextGame();
        this.audio.sfx(Sfx.CLEAR);
        const badge = Util.element('div', 'perfect', '완벽!');
        stage.append(badge);
        Effects.cleared(stage);
        this.after(950, () => this.nextGame(), generation);
      },
    };
  },

  // ---------------- 문제 제한 시간 ----------------
  // 게임 시계로 재므로 일시정지·운영 메뉴 중에는 멈춘다. 막대는 게임 영역 맨 위에 붙는다.
  // 쉬운 단계(Lv1·Lv2)는 EASY_TIME 배로 늘리고, 모든 문제에 라운드 난이도의 questionTimeScale 을 곱한다
  startQuestionTimer(GameType, stage, level, load, onOut, generation) {
    this.questionCountdown = null;
    this.questionLimitMs = null;
    if (generation !== this.generation) return;
    const spec = this.config.questionTime[GameType.id];
    if (!spec) return;
    const scale = (EASY_TIME[level - 1] || 1) * (this.config.questionTimeScale || 1);
    const limitMs = (spec.base + spec.per * load) * scale * 1000;
    // 이 문제의 제한 시간: 답하는 속도(js/abilities.js)가 쓴다. 제한 시간 막대를 끈 판에도 잰다
    this.questionLimitMs = limitMs;
    if (!this.config.questionTimer) return;
    // 막대는 게임의 안내 문구 안에 붙여 문구 알약의 바탕으로 줄어들게 한다 (눈이 가 있는 곳 · 문구를 바꿔도 남는다 — Util.say).
    // 문구가 없는 게임은 게임 영역 맨 위
    let bar = stage.querySelector('.qtimer');
    if (!bar) {
      bar = Util.element('div', 'qtimer', '<i></i>');
      const message = stage.querySelector('.stage-msg');
      if (message) message.append(bar);
      else stage.append(bar);
    }
    bar.className = 'qtimer on';
    bar.firstChild.style.transform = 'scaleX(1)';
    this.questionCountdown = { startClock: this.clock, limitMs, onOut, generation, bar, ticksLeft: 3 };
    this.log.event('timer_start', { game: GameType.id, load, limitMs });
  },

  // 답을 고르면 멈춘다. 막대는 남은 만큼 멈춘 채로 둔다 (얼마나 빨랐는지 보인다)
  stopQuestionTimer() {
    if (!this.questionCountdown) return;
    this.questionCountdown.bar.classList.add('stopped');
    this.questionCountdown = null;
  },

  updateQuestionTimer() {
    const countdown = this.questionCountdown;
    if (!countdown) return;
    if (countdown.generation !== this.generation || this.state !== 'play') {
      this.questionCountdown = null;
      return;
    }
    const left = countdown.limitMs - (this.clock - countdown.startClock);
    const remaining = Util.clamp(left / countdown.limitMs, 0, 1);
    countdown.bar.firstChild.style.transform = `scaleX(${remaining})`;
    countdown.bar.classList.toggle('warn', remaining < 0.4);
    countdown.bar.classList.toggle('low', remaining < 0.18);
    // 마지막 3초는 초마다 작게 똑딱인다
    if (left <= countdown.ticksLeft * 1000 && countdown.ticksLeft > 0) {
      this.audio.sfx(Sfx.TICK);
      countdown.ticksLeft--;
    }
    if (left > 0) return;
    this.questionCountdown = null;
    countdown.bar.classList.add('out');
    this.log.event('timeout');
    countdown.onOut();
  },

  // ---------------- 속도 전환 구간 ----------------
  // 목표 속도는 인지 게임 도중에는 바뀌지 않는다. 게임과 게임 사이에 따로 구간을 두고,
  // 그 동안은 위쪽 띠를 화면 전체로 넓혀 새 속도에 맞추는 것에만 집중하게 한다.
  shiftDue() {
    const { config } = this;
    if (!config.rpmChange || this.brainOnly || this.elapsed < this.nextShiftAt) return false;
    // 라운드가 곧 끝나면 새 속도에 맞추기만 하다 끝나므로 건너뛴다
    return config.durationSec - this.elapsed >= config.shiftSec + 5;
  },

  beginShift() {
    const generation = ++this.generation;
    this.current = null;
    $('#cog').innerHTML = '';
    const toLevel = SLOPE_PATTERN[++this.slopeStep % SLOPE_PATTERN.length];
    this.shift = { fromLevel: this.slopeLevel, toLevel, startedAt: this.elapsed };
    this.log.event('shift_start', { from: this.slopeLevel, to: toLevel }); // eslint-disable-line id-length -- 세션 로그 형식
    $('#shift-name').textContent = SLOPE_MESSAGES[toLevel];
    $('#game').classList.add('shift');
    this.audio.sfx(Sfx.START);
    this.audio.setRest(true);
    this.after(this.config.shiftSec * 1000, () => this.endShift(), generation);
  },

  endShift() {
    this.log.event('shift_end', { slope: this.shift.toLevel });
    this.slopeLevel = this.shift.toLevel;
    this.clearShift();
    this.nextShiftAt = this.elapsed + this.shiftGap();
    this.audio.setRest(false);
    this.after(SHIFT_OUT_MS, () => this.nextGame());
  },

  // 다음 속도 전환까지의 시간 (config.rpmChangeSegmentSec ~ rpmChangeSegmentMaxSec 사이 무작위)
  shiftGap() {
    const { rpmChangeSegmentSec: minSec, rpmChangeSegmentMaxSec: maxSec } = this.config;
    return maxSec > minSec ? Util.lerp(minSec, maxSec, Math.random()) : minSec;
  },

  clearShift() {
    this.audio.setRest(false, false);
    this.shift = null;
    $('#game').classList.remove('shift');
  },

  // 구간 안에서 목표 RPM과 지면 각도를 shiftRampSec에 걸쳐 부드럽게 옮긴다 (smoothstep)
  updateShift() {
    const { config, shift } = this;
    const since = this.elapsed - shift.startedAt;
    const ramp = Math.min(config.shiftRampSec, config.shiftSec - SHIFT_LEAD_SEC - 1);
    const progress = Util.clamp((since - SHIFT_LEAD_SEC) / ramp, 0, 1);
    this.slopeLevel = Util.lerp(shift.fromLevel, shift.toLevel, progress * progress * (3 - 2 * progress));
    $('#shift-bar').style.transform = `scaleX(${Util.clamp(1 - since / config.shiftSec, 0, 1)})`;
  },

  // ---------------- 정답 보상 ----------------
  // 연속 정답은 점수에 손대지 않는다. 운동 점수와 인지 점수의 균형을 흔들지 않으면서
  // '지키고 싶은 것'만 하나 만들어 주는 게 목적이다.
  hit(ok) {
    this.adjustDifficulty(ok);
    const streakBefore = this.roundStats.answered(ok);
    if (ok) {
      const { streak } = this.roundStats;
      this.audio.reward(streak);
      this.band.celebrate();
      ScoreHud.flashGlow(streak);
      Effects.hit(streak);
    } else {
      // 길게 이어 온 연속이 끊기면 그냥 틀렸을 때보다 아깝게 들리게
      this.audio.sfx(streakBefore >= 3 ? Sfx.DROP : Sfx.BAD);
      Effects.miss($('#cog'));
    }
    ScoreHud.renderStreak(this.roundStats.streak);
  },

  // adaptive 난이도 계기판을 옮기고 세션 로그에 적는다 (js/difficulty.js)
  adjustDifficulty(ok) {
    const scale = this.difficulty.answered(ok);
    if (scale == null) return;
    // eslint-disable-next-line id-length -- 세션 로그 형식
    this.log.event('difficulty', { ok, diff: Math.round(this.difficulty.value * 100) / 100, k: Math.round(scale * 1000) / 1000 });
  },

  // 점수는 바로 더하고, 화면의 점수판은 점수가 도착했을 때 올린다 (js/score-hud.js).
  // anchor 가 있으면(인지 게임 정답) 그 자리에서 점수 배지가 튀어나와 점수판으로 날아간다
  addScore(points, anchor, text) {
    this.score += points;
    ScoreHud.addPoints(points, anchor, text, this.roundStats.streak);
  },

  updateHud(deltaSec = 0) {
    const playing = this.state === 'play';
    const left = playing ? this.config.durationSec - this.elapsed : this.config.durationSec;
    const done = Util.clamp(1 - left / this.config.durationSec, 0, 1);
    this.band.dayT = done; // 풍경 라이딩: 라운드가 흐르는 동안 아침에서 해 질 녘으로
    ScoreHud.render(deltaSec, { left, done, playing, held: this.inIntro, distM: this.meter.distM });
  },

  // 목표 RPM 대비 편차로 이번 프레임의 운동 점수(0~max)를 계산
  frameScore(deviation) {
    const { tolerance, maxDeviation, tickMaxPoints } = this.config;
    const offBy = Math.abs(deviation);
    if (offBy <= tolerance) return tickMaxPoints;
    // 편차는 설정에서 허용 구역보다 작게도 넣을 수 있어 0 으로 나누지 않게 막는다
    return tickMaxPoints * Math.max(0, 1 - (offBy - tolerance) / Math.max(0.01, maxDeviation - tolerance));
  },

  // 게임 소개(설명 화면) 중에는 라운드 시계와 운동 점수를 멈춘다 (inIntro). 공·목표 속도·비트는 그대로 움직이고,
  // 거리·칼로리(meter)는 loop 에서 따로 세므로 계속 쌓인다. 운동 점수 만점(durationSec 기준)은 그대로다.
  updatePlay(deltaSec, rpm) {
    const { config } = this;
    const held = this.inIntro;
    if (!held) this.elapsed += deltaSec;

    // 목표 RPM 변화 → 지면 각도. 속도 전환 구간에서만 움직인다.
    if (this.shift) this.updateShift();
    this.band.setSlope(this.slopeLevel);
    if (!this.brainOnly) this.target = this.baseline * (1 + this.slopeLevel * config.rpmChangeAmount);

    if (held) return;

    // 두뇌 게임만 하는 판은 운동 점수가 없다 (운동 점수 0 인 판과 같다)
    if (!this.brainOnly) this.tickExercise(deltaSec);
    if (this.elapsed >= config.durationSec) this.endRound();
  },

  tickExercise(deltaSec) {
    const { config } = this;
    // 짧은 간격으로 운동 점수 지급. 화면의 공 위치(band)를 기준으로 채점해서 보이는 것과 점수가 어긋나지 않게 한다.
    this.tickAcc += this.frameScore(this.band.deviation) * deltaSec;
    this.tickTime += deltaSec;
    if (!this.band.inZone) this.tickOut = true;
    if (this.tickTime >= config.tickSec) {
      let points = Math.round(this.tickAcc / this.tickTime);
      // 공이 한 번이라도 구역을 벗어난(빨간) 틱은 만점을 주지 않는다
      if (this.tickOut) points = Math.min(points, config.tickMaxPoints - 1);
      this.tickOut = false;
      this.tickAcc = 0;
      this.tickTime -= config.tickSec;
      this.exScore += points;
      if (points > 0) this.addScore(points);
      const color = points >= config.tickMaxPoints ? 'good' : points > 0 ? 'warn' : 'bad';
      this.band.addFloater(`+${points}`, color);
    }
  },

  // ended: complete(시간 다 됨) | operator(운영 메뉴에서 끝냄) | idle(자리 비움)
  // 점수와 기록은 여기서 바로 마무리하고, 마무리 화면(state 'ending')을 잠깐 보여 준 뒤 결과 화면으로 넘어간다
  endRound(ended = 'complete') {
    this.state = 'result';
    this.inIntro = false;
    if (this.current) {
      // 중단된 게임: 부분 점수는 abort 안에서 지급될 수 있도록 상태를 잠깐 play로 둔다
      this.state = 'play';
      const result = this.current.game.abort();
      this.state = 'result';
      const { host } = this.current;
      if (result.total > 0) this.roundStats.record(this.current.type.id, result, host.level, this.clock - host.startClock);
      this.log.event('game_abort', { game: this.current.type.id, ...result });
    }
    this.closeLog(ended);
    this.generation++;
    this.timers = [];
    this.clearShift();
    this.audio.stop();
    this.audio.sfx(Sfx.END);
    $('#cog').innerHTML = '';
    this.showEnding(ended);
  },

  // ---------------- 마무리 화면 ----------------
  // 게임 화면 위에 '수고하셨어요'와 총점(세어 올라간다)을 띄운다. ENDING_SKIP_MS 가 지나면 눌러서 바로 넘길 수 있다
  ENDING_MS: 3200,
  ENDING_SKIP_MS: 1200,
  showEnding(ended) {
    this.state = 'ending';
    const generation = this.generation;
    const card = Util.element('div', 'round-end');
    card.innerHTML = `
      <div class="tag">${ended === 'idle' ? '자리를 비워 게임을 마쳤어요' : '라운드 종료'}</div>
      <div class="name">수고하셨어요!</div>
      <div class="score"><b>0</b>점</div>
      <div class="hint">화면을 누르면 바로 결과를 봅니다</div>`;
    // 운영 버전의 회원 라운드: 먼저 풍경 카드를 화면 가득 키우고 이번 점수 자리에 건물을 한 층씩 짓는다 (Band.plant).
    // 오늘 운동이 건물이 되는 것을 알아볼 수 있게, 다 지은 뒤 BUILD_HOLD_MS 동안 보여 주고 나서야
    // 풍경을 줄이고 마무리 카드를 아래 게임 카드 안에 띄운다. 짓는 동안은 눌러도 넘어가지 않는다
    const plant = this.edition.plantInfo(this);
    let cardAt = 0;
    if (plant) {
      // 생김새를 세션 로그에 남긴다 (회원 기록에도 들어가 다음 라운드부터 같은 모양으로 선다)
      const look = this.band.plant(this.score, plant);
      if (this.log) this.log.meta.landmark = look;
      $('#game').classList.add('build');
      cardAt = this.band.planting.doneAt * 1000 + this.BUILD_HOLD_MS;
    }

    const finish = () => {
      if (generation !== this.generation || this.state !== 'ending') return;
      card.remove();
      $('#game').classList.remove('build');
      this.state = 'result';
      this.showResult();
    };
    const showCard = () => {
      if (generation !== this.generation || this.state !== 'ending') return;
      $('#game').classList.remove('build');
      (plant ? $('#cog') : $('#game')).append(card);
      Effects.confetti(0.5);
      const scoreLabel = card.querySelector('.score b');
      const countStartAt = performance.now();
      const count = (now) => {
        const progress = Util.clamp((now - countStartAt) / 1300, 0, 1);
        scoreLabel.textContent = Math.round(this.score * (1 - Math.pow(1 - progress, 3))).toLocaleString('ko-KR');
        if (progress < 1 && card.isConnected) requestAnimationFrame(count);
      };
      requestAnimationFrame(count);
      this.after(this.ENDING_SKIP_MS, () => {
        card.classList.add('skippable');
        card.addEventListener('pointerdown', finish);
      }, generation);
    };
    if (cardAt) this.after(cardAt, showCard, generation);
    else showCard();
    this.after(cardAt + this.ENDING_MS, finish, generation);
  },
  BUILD_HOLD_MS: 1500, // 건물을 다 지은 뒤 풍경을 그대로 보여 주는 시간

  // 결과 화면은 판마다 다르다 (테스트: js/test-results.js, 스테이션: Demo.showResult)
  showResult() {
    this.edition.showResult(this);
  },

  // ---------------- 메인 루프 ----------------
  loop(now) {
    const deltaSec = Math.min(0.1, (now - this.lastFrameAt) / 1000);
    this.lastFrameAt = now;
    if (!this.paused) {
      this.clock += deltaSec * 1000;
      // 두뇌 게임만 하는 판에서는 페달을 밟아도 라운드에 들어가지 않는다 (운동량·띠·기록 모두 0). 대기 화면 등에서는 그대로 쓴다
      const raw = this.pedal.update(deltaSec);
      const rpm = this.brainOnly && ['countdown', 'play', 'ending'].includes(this.state) ? 0 : raw;

      if (this.state === 'calib') this.updateCalib(deltaSec, rpm);
      // 운동량은 측정이 시작된 뒤부터 라운드가 끝날 때까지 밟은 것을 모두 센다
      if ((this.state === 'calib' && this.calib.started) || this.state === 'countdown' || this.state === 'play') {
        this.meter.add(deltaSec, rpm);
      }
      this.edition.tick(this, deltaSec, rpm);
      if (this.log && (this.state === 'calib' || this.state === 'countdown' || this.state === 'play')) this.log.sample(deltaSec, rpm);

      if (this.state === 'countdown' || this.state === 'play') {
        if (this.state === 'play') this.updatePlay(deltaSec, rpm);
        if (this.state === 'countdown' || this.state === 'play') {
          // 틱 사이에도 지면이 끊기지 않도록 진행 중인 틱에서 쌓인 몫까지 넘긴다
          const deviation = this.brainOnly ? 0 : (rpm - this.target) / this.target;
          this.band.update(deltaSec, rpm, deviation, this.score + this.tickAcc / this.config.tickSec);
          this.band.draw();
          this.updateHud(deltaSec);
        }
      }
      // 마무리 화면: 자전거가 멈추며 기념물을 세운다 (세우지 않으면 마무리 카드가 풍경을 덮고 있다)
      if (this.state === 'ending' && this.band.planting) {
        this.band.update(deltaSec, this.band.rpm * Math.exp(-deltaSec / 0.6), 0, this.score);
        this.band.draw();
      }
      this.runTimers();
      if (this.state === 'play') this.updateQuestionTimer();
      this.updateDebug(rpm);
    }
    this.capTick(now);
    // 비트에 맞춰 화면 가장자리 깜빡임 (짝수 = A쪽 왼편, 홀수 = D쪽 오른편)
    for (const beat of this.audio.pollBeats()) {
      if ((this.state !== 'countdown' && this.state !== 'play') || this.brainOnly) continue;
      const edge = document.querySelector(beat.beatIndex % 2 === 0 ? '.edge.left' : '.edge.right');
      edge.classList.remove('flash');
      void edge.offsetWidth;
      edge.classList.add('flash');
    }
    requestAnimationFrame((frameAt) => this.loop(frameAt));
  },

  updateDebug(rpm) {
    const panel = $('#debug');
    if (!panel.classList.contains('active')) return;
    panel.textContent = [
      `state    ${this.state}`,
      `track    ${this.brainOnly ? 'brain (페달 없이)' : 'dual'}`,
      `input    ${this.pedal.sensorOn ? `sensor ${this.pedal.lzLive ? `lz ${this.config.rpmSource} ${this.pedal.lzRpm.toFixed(1)}` : 'avg_rpm'} / avg ${this.pedal.sensorRpm}rpm fw ${this.link.firmware || '?'}` : `keyboard (link ${this.link.state})`}`,
      `rpm      ${rpm.toFixed(1)}`,
      `target   ${this.target ? this.target.toFixed(1) : '-'}${this.shift ? ' (shift)' : ''}`,
      `baseline ${this.baseline ? this.baseline.toFixed(1) : '-'}`,
      `dev      ${this.target ? (((rpm - this.target) / this.target) * 100).toFixed(1) + '%' : '-'}`,
      `ex/cog   ${this.exScore ?? 0} / ${this.cogScore ?? 0}`,
    ].join('\n');
  },
};

window.App = App; // 콘솔과 docs/build/capture.js 에서 쓴다
App.init();
