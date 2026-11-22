// 세션 기록: 한 판(속도 측정 ~ 결과) 동안 일어난 일과 입력 장치의 원시 입력을 모은다.
// 형식은 docs/SESSION_LOG.md. 형식을 바꾸면 그 문서와 VERSION 을 함께 고친다.
//  - events  : 판 흐름(측정·카운트다운·게임 시작/끝·속도 전환·일시정지·페달 연결 등)과
//              문제마다 무엇이 나왔는지(question), 누른 것(input), 답과 걸린 시간(answer)
//  - keys    : 키보드 입력 시각 (A/D 페달링 포함 모든 키)
//  - capd    : 페달 원시 파형 프레임 그대로 (RPM 추정의 입력. js/cadence-est.js)
//  - workout : 페달이 1초마다 보내는 avg_rpm·watt·rev_count
//  - samples : 게임이 쓴 RPM·목표·공 위치·점수 (초당 10번)
// 시각 t 는 기록 시작부터의 ms (실제 시간), clock 은 게임 시계 ms (일시정지 동안 멈춘다).
// 테스트 화면은 결과 화면의 버튼으로 내려받고, 운영 버전(스테이션 흐름)은 판이 끝날 때마다 태블릿(IndexedDB)에 저장한다.
import { Config, EDITION } from './config.js';
import { Theme } from './themes.js';

export class SessionLog {
  static VERSION = 6;
  static SAMPLE_SEC = 0.1;

  constructor(app) {
    this.app = app;
    this.startedAtMs = performance.now();
    const startedAt = new Date();
    this.id = `${startedAt.getTime()}`;
    this.meta = {
      version: SessionLog.VERSION,
      id: this.id,
      mode: app.edition.mode,
      // 운동 방식: dual = 페달 + 두뇌 게임 · brain = 두뇌 게임만 (페달 없이, 속도 측정·운동 점수 없음)
      track: app.config.brainOnly ? 'brain' : 'dual',
      startedAt: startedAt.toISOString(),
      theme: Theme.current.id,
      music: Config.music(), // 음악 스타일 (js/audio.js STYLES)
      input: app.pedal.sensorOn ? 'pedal' : 'keyboard',
      firmware: app.link.firmware || null,
      rpmSource: app.config.rpmSource,
      userAgent: navigator.userAgent,
      screen: [window.innerWidth, window.innerHeight],
      edition: EDITION, // prototype | app
      device: SessionLog.deviceId(), // 태블릿마다 하나. id 는 태블릿 안에서만 겹치지 않으므로 서버에서는 device + id 로 구분한다
      config: JSON.parse(JSON.stringify(app.config)),
      preset: Config.presetOf(app.config), // 라운드 난이도 프리셋 (값을 하나라도 고쳤으면 custom)
      formats: {
        t: 'ms since session start (wall clock)', // eslint-disable-line id-length -- 세션 로그 형식
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
    this.pendingQuestion = null; // 지금 답을 기다리는 문제
    this.questionCount = 0;
    this.sampleAcc = 0;
    this.done = false;
  }

  // 이 태블릿(브라우저)의 고유 번호. 처음 한 번 만들어 저장한다
  static deviceId() {
    const KEY = 'exergame.device';
    try {
      let id = localStorage.getItem(KEY);
      if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
        localStorage.setItem(KEY, id);
      }
      return id;
    } catch {
      return null;
    }
  }

  now() {
    return Math.round((performance.now() - this.startedAtMs) * 10) / 10;
  }

  event(type, data = {}) {
    if (this.done) return;
    // eslint-disable-next-line id-length -- 세션 로그 형식
    this.events.push({ t: this.now(), clock: Math.round(this.app.clock), type, ...data });
  }

  // 문제가 입력을 받기 시작한 순간. 생각한 시간은 여기서부터 잰다.
  // open: false 면 문제만 남기고, 입력이 실제로 열리는 순간 open() 을 부른다 (지시 따르기: 지시를 읽는 단계 · 램프 기다리기)
  question(game, level, data, open = true) {
    if (this.done) return;
    this.pendingQuestion = { game, number: ++this.questionCount, clock: open ? this.app.clock : null, first: null };
    // 문제 번호(q)는 맨 뒤에 둬서 게임이 보낸 내용의 같은 이름 칸이 덮어쓰지 못하게 한다 (예전에 상자 속 과일의 q 가 덮어썼다)
    this.event('question', { game, level, ...data, q: this.pendingQuestion.number }); // eslint-disable-line id-length -- 세션 로그 형식
  }

  // question(..., false) 로 띄운 문제의 입력이 열린 순간
  open(game) {
    const question = this.pendingQuestion;
    if (!question || question.clock != null) return;
    question.clock = this.app.clock;
    this.event('input_open', { game, q: question.number }); // eslint-disable-line id-length -- 세션 로그 형식
  }

  // 입력이 열린 뒤 지금까지 걸린 시간 (게임 시계 ms). 열리기 전이면 null
  since(question) {
    return question && question.clock != null ? Math.round(this.app.clock - question.clock) : null;
  }

  // 답이 끝까지 정해진 순간 (시간 초과 포함). ms = 입력이 열린 뒤 답이 정해질 때까지,
  // first = 입력이 열린 뒤 처음 입력할 때까지 (한 번 눌러 답하는 게임은 ms 와 같다. 아무것도 누르지 않고 시간이 다 되면 null)
  // 반환: { thinkMs (= ms), first } — App 이 게임별 생각한 시간(stats.think)에 더한다
  answer(game, data) {
    const question = this.pendingQuestion;
    const ms = this.since(question); // eslint-disable-line id-length -- 세션 로그 형식 (answer 이벤트의 ms 칸)
    const first = question && question.first != null ? question.first : data.timedOut ? null : ms;
    this.event('answer', { game, q: question ? question.number : null, ms, first, ...data }); // eslint-disable-line id-length -- 세션 로그 형식
    this.pendingQuestion = null;
    return { thinkMs: ms, first };
  }

  // 답 도중의 입력 하나 (길 따라 그리기의 칸 하나, 사칙연산의 숫자 넣기/빼기)
  input(game, data) {
    const question = this.pendingQuestion;
    const ms = this.since(question); // eslint-disable-line id-length -- 세션 로그 형식 (input 이벤트의 ms 칸)
    if (question && question.first == null && ms != null) question.first = ms;
    this.event('input', { game, q: question ? question.number : null, ms, ...data }); // eslint-disable-line id-length -- 세션 로그 형식
  }

  key(code) {
    if (!this.done) this.keys.push([this.now(), code]);
  }

  capdFrame(values) {
    if (!this.done) this.capd.push([this.now(), ...values]);
  }

  workoutFrame(frame) {
    if (!this.done) this.workout.push([this.now(), frame.rpm, frame.watt, frame.revCount]);
  }

  sample(deltaSec, rpm) {
    if (this.done) return;
    this.sampleAcc += deltaSec;
    if (this.sampleAcc < SessionLog.SAMPLE_SEC) return;
    this.sampleAcc = 0;
    const app = this.app;
    const round1 = (value) => (value == null ? null : Math.round(value * 10) / 10);
    // 목표·공 위치·점수는 카운트다운부터 의미가 있다 (측정 중에는 앞 판의 값이 남아 있다)
    const live = app.state === 'countdown' || app.state === 'play';
    this.samples.push([this.now(), Math.round(app.clock), round1(rpm), live ? round1(app.target) : null,
      live ? Math.round(app.band.deviation * 1000) / 1000 : null, live ? (app.band.inZone ? 1 : 0) : null, live ? app.score : 0]);
  }

  // ended: complete | operator | idle | abandoned
  finish(ended, summary = {}) {
    if (this.done) return;
    this.event('session_end', { ended });
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
    const startedAt = new Date(this.meta.startedAt);
    const pad2 = (number) => String(number).padStart(2, '0');
    const stamp = `${startedAt.getFullYear()}${pad2(startedAt.getMonth() + 1)}${pad2(startedAt.getDate())}-${pad2(startedAt.getHours())}${pad2(startedAt.getMinutes())}${pad2(startedAt.getSeconds())}`;
    const who = this.meta.participant ? `-${this.meta.participant}` : '';
    return `exergame-session${who}-${stamp}.json`;
  }

  download() {
    downloadBlob(this.fileName(), [JSON.stringify(this)], 'application/json');
  }
}

function downloadBlob(name, parts, type) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(parts, { type }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

// 운영 버전(스테이션 흐름): 끝난 세션을 태블릿에 쌓아 두고 운영 메뉴에서 한꺼번에 내보낸다
export const SessionStore = {
  database: null,

  open() {
    if (!this.database) {
      this.database = new Promise((resolve, reject) => {
        // 2: 서버로 보낸 세션의 id 를 적어 두는 uploaded 를 더했다 (js/session-upload.js)
        const request = indexedDB.open('exergame-sessions', 2);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('sessions')) database.createObjectStore('sessions', { keyPath: 'meta.id' });
          if (!database.objectStoreNames.contains('uploaded')) database.createObjectStore('uploaded', { keyPath: 'id' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      // 저장 공간이 모자랄 때 브라우저가 지우지 않도록 요청한다 (허락하지 않아도 저장은 된다)
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    }
    return this.database;
  },

  async run(mode, work, store = 'sessions') {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(store, mode);
      const request = work(transaction.objectStore(store));
      transaction.oncomplete = () => resolve(request && request.result);
      transaction.onerror = () => reject(transaction.error);
    });
  },

  put(log) {
    return this.run('readwrite', (objectStore) => objectStore.put(JSON.parse(JSON.stringify(log))));
  },

  count() {
    return this.run('readonly', (objectStore) => objectStore.count());
  },

  get(id) {
    return this.run('readonly', (objectStore) => objectStore.get(id));
  },

  keys() {
    return this.run('readonly', (objectStore) => objectStore.getAllKeys());
  },

  // 업로드 (js/session-upload.js): 서버가 받았다고 답한 세션
  uploadedKeys() {
    return this.run('readonly', (objectStore) => objectStore.getAllKeys(), 'uploaded');
  },

  markUploaded(id) {
    return this.run('readwrite', (objectStore) => objectStore.put({ id, at: new Date().toISOString() }), 'uploaded'); // eslint-disable-line id-length -- 저장된 기록 형식
  },

  // 세션을 하나씩 visit(log) 에 넘긴다 (시험용 회원 기록 서버, app/member-records.js)
  scan(visit) {
    return this.run('readonly', (objectStore) => {
      const request = objectStore.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        visit(cursor.value);
        cursor.continue();
      };
      return null;
    });
  },

  // 한 줄에 세션 하나 (JSON Lines). 큰 문자열 하나로 합치지 않고 조각째 Blob 으로 넘긴다
  async exportAll(name) {
    const parts = [];
    await this.run('readonly', (objectStore) => {
      const request = objectStore.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        parts.push(JSON.stringify(cursor.value), '\n');
        cursor.continue();
      };
      return null;
    });
    if (parts.length) downloadBlob(name, parts, 'application/x-ndjson');
    return parts.length / 2;
  },
};
