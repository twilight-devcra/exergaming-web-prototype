// 세션 기록: 한 판(속도 측정 ~ 결과) 동안 일어난 일과 입력 장치의 원시 입력을 모은다.
// 형식은 docs/SESSION_LOG.md. 형식을 바꾸면 그 문서와 VERSION 을 함께 고친다.
//  - events  : 판 흐름(측정·카운트다운·게임 시작/끝·속도 전환·일시정지·페달 연결 등)과
//              문제마다 무엇이 나왔는지(question), 누른 것(input), 답과 걸린 시간(answer)
//  - keys    : 키보드 입력 시각 (A/D 페달링 포함 모든 키)
//  - capd    : 페달 원시 파형 프레임 그대로 (RPM 추정의 입력. js/cadence-est.js)
//  - workout : 페달이 1초마다 보내는 avg_rpm·watt·rev_count
//  - samples : 게임이 쓴 RPM·목표·공 위치·점수 (초당 10번)
// 시각 t 는 기록 시작부터의 ms (실제 시간), clock 은 게임 시계 ms (일시정지 동안 멈춘다).
// 테스트 화면은 결과 화면의 버튼으로 내려받고, 시연 모드는 판이 끝날 때마다 태블릿(IndexedDB)에 저장한다.
class SessionLog {
  static VERSION = 1;
  static SAMPLE_SEC = 0.1;

  constructor(app) {
    this.app = app;
    this.t0 = performance.now();
    const d = new Date();
    this.id = `${d.getTime()}`;
    this.meta = {
      version: SessionLog.VERSION,
      id: this.id,
      mode: app.demo ? 'demo' : 'test',
      startedAt: d.toISOString(),
      theme: Theme.current.id,
      input: app.pedal.sensorOn ? 'pedal' : 'keyboard',
      firmware: app.link.firmware || null,
      rpmSource: app.cfg.rpmSource,
      userAgent: navigator.userAgent,
      screen: [window.innerWidth, window.innerHeight],
      config: JSON.parse(JSON.stringify(app.cfg)),
      preset: Config.presetOf(app.cfg), // 라운드 난이도 프리셋 (값을 하나라도 고쳤으면 custom)
      formats: {
        t: 'ms since session start (wall clock)',
        clock: 'game clock ms (stops while paused)',
        keys: ['t', 'code'],
        capd: ['t', 'seq', '(lz, ly, gx, gz) x 5 samples at 100Hz; lz in 0.1 mg'],
        workout: ['t', 'rpm', 'watt', 'revCount'],
        samples: ['t', 'clock', 'rpm', 'target', 'deviation', 'inZone', 'score'],
      },
    };
    this.events = [];
    this.keys = [];
    this.capd = [];
    this.workout = [];
    this.samples = [];
    this.q = null;          // 지금 답을 기다리는 문제
    this.qn = 0;
    this.sampleAcc = 0;
    this.done = false;
  }

  now() {
    return Math.round((performance.now() - this.t0) * 10) / 10;
  }

  ev(type, data = {}) {
    if (this.done) return;
    this.events.push({ t: this.now(), clock: Math.round(this.app.clock), type, ...data });
  }

  // 문제가 입력을 받기 시작한 순간. 걸린 시간은 여기서부터 잰다
  question(game, level, data) {
    if (this.done) return;
    this.q = { game, n: ++this.qn, clock: this.app.clock, t: this.now() };
    this.ev('question', { game, level, q: this.q.n, ...data });
  }

  // 답이 끝까지 정해진 순간 (시간 초과 포함). ms = 게임 시계 기준 걸린 시간
  answer(game, data) {
    const q = this.q;
    this.ev('answer', { game, q: q ? q.n : null, ms: q ? Math.round(this.app.clock - q.clock) : null, ...data });
    this.q = null;
  }

  // 답 도중의 입력 하나 (길 따라 그리기의 칸 하나, 사칙연산의 숫자 넣기/빼기)
  input(game, data) {
    const q = this.q;
    this.ev('input', { game, q: q ? q.n : null, ms: q ? Math.round(this.app.clock - q.clock) : null, ...data });
  }

  key(code) {
    if (!this.done) this.keys.push([this.now(), code]);
  }

  capdFrame(values) {
    if (!this.done) this.capd.push([this.now(), ...values]);
  }

  workoutFrame(w) {
    if (!this.done) this.workout.push([this.now(), w.rpm, w.watt, w.revCount]);
  }

  sample(dt, rpm) {
    if (this.done) return;
    this.sampleAcc += dt;
    if (this.sampleAcc < SessionLog.SAMPLE_SEC) return;
    this.sampleAcc = 0;
    const a = this.app;
    const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
    // 목표·공 위치·점수는 카운트다운부터 의미가 있다 (측정 중에는 앞 판의 값이 남아 있다)
    const live = a.state === 'countdown' || a.state === 'play';
    this.samples.push([this.now(), Math.round(a.clock), r1(rpm), live ? r1(a.target) : null,
      live ? Math.round(a.band.deviation * 1000) / 1000 : null, live ? (a.band.inZone ? 1 : 0) : null, live ? a.score : 0]);
  }

  // ended: complete | operator | idle | abandoned
  finish(ended, summary = {}) {
    if (this.done) return;
    this.ev('session_end', { ended });
    this.done = true;
    this.meta.endedAt = new Date().toISOString();
    this.meta.ended = ended;
    this.meta.durationMs = this.now();
    this.meta.summary = summary;
  }

  toJSON() {
    return { meta: this.meta, events: this.events, keys: this.keys, capd: this.capd, workout: this.workout, samples: this.samples };
  }

  fileName() {
    const d = new Date(this.meta.startedAt);
    const p = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const who = this.meta.participant ? `-${this.meta.participant}` : '';
    return `exergame-session${who}-${stamp}.json`;
  }

  download() {
    downloadBlob(this.fileName(), [JSON.stringify(this)], 'application/json');
  }
}

function downloadBlob(name, parts, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(parts, { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// 시연 모드: 끝난 세션을 태블릿에 쌓아 두고 운영 메뉴에서 한꺼번에 내보낸다
const SessionStore = {
  db: null,

  open() {
    if (!this.db) {
      this.db = new Promise((res, rej) => {
        const r = indexedDB.open('exergame-sessions', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('sessions', { keyPath: 'meta.id' });
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      // 저장 공간이 모자랄 때 브라우저가 지우지 않도록 요청한다 (허락하지 않아도 저장은 된다)
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    }
    return this.db;
  },

  async run(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('sessions', mode);
      const req = fn(tx.objectStore('sessions'));
      tx.oncomplete = () => res(req && req.result);
      tx.onerror = () => rej(tx.error);
    });
  },

  put(log) {
    return this.run('readwrite', (s) => s.put(JSON.parse(JSON.stringify(log))));
  },

  count() {
    return this.run('readonly', (s) => s.count());
  },

  // 한 줄에 세션 하나 (JSON Lines). 큰 문자열 하나로 합치지 않고 조각째 Blob 으로 넘긴다
  async exportAll(name) {
    const parts = [];
    await this.run('readonly', (s) => {
      const req = s.openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        parts.push(JSON.stringify(c.value), '\n');
        c.continue();
      };
      return null;
    });
    if (parts.length) downloadBlob(name, parts, 'application/x-ndjson');
    return parts.length / 2;
  },
};
