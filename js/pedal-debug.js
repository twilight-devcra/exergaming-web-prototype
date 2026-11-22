// 페달 센서 디버그 페이지 (pedal-debug.html).
// 게임과 같은 PedalLink·Pedal을 그대로 써서, 페달이 보낸 원본 알림부터 게임이 실제로 쓰는 RPM까지 단계별로 보여준다.
//  ① WORKOUT 프레임의 avg_rpm → ② Pedal.sensorFrame()의 0 유예를 거친 값 → ③ Pedal.update()로 다듬은 값
// rev_count 기준 RPM은 게임이 쓰지 않는 참고값이다. 느리게 밟을 때 avg_rpm과 비교하려고 둔다.
// 기록은 브라우저(IndexedDB)에 계속 저장되므로, 회전을 놓친 순간에 표시를 남겨두고 나중에 파일로 꺼내 볼 수 있다.
//
// 페달 펌웨어의 진단 명령도 쓴다 (페달 저장소 docs/02-system-sequence.md §5, 모두 읽기 전용):
//  DBG   회전 검출기 내부 상태 24필드. 요청할 때마다 1회 응답 → DBG_POLL_MS 마다 폴링한다
//  CAP   검출기에 들어가는 필터 후 100Hz 파형(lz, ly, gx, gz)을 CAPD 프레임으로 20Hz push. 최대 300초라 갱신한다
//  RS_G  회전 검출 파라미터 14개 (정지 판정 기준 등) — 연결 때 한 번 읽는다
// 같은 조합을 페달 쪽 PC 툴이 tools/capture_dbg_cap.py 로 받는다. CAP CSV 는 그 툴과 같은 형식이라
// 페달 저장소의 tools/verify_phase_detector.py 로 그대로 재생할 수 있다.
import { Config, $, Util } from './config.js';
import { Pedal } from './pedal.js';
import { NUS, FrameCodec, PedalLink } from './pedal-link.js';
import { LzCadence } from './cadence-est.js';

const DBG_POLL_MS = 500;
const CAP_SEC = 300;         // 펌웨어 상한 RAW_CAP_MAX_SEC
const CAP_RENEW_MS = 280000; // 자동 정지 전에 다시 건다 (다시 걸면 seq 가 0부터 새로 시작한다)
const CAP_BATCH = 5;
const CAP_CHANNELS = ['lz', 'ly', 'gx', 'gz'];
const CAP_RATE_HZ = 100;
// cardio_tool/protocol.py DBG_FIELDS 와 같은 순서
const DBG_FIELDS = ['moving', 'locked_revs', 'status', 'period', 'r_win_mg', 'rev_r_mg', 'lz_mg', 'ly_mg', 'gz_x10',
  'gx_min', 'gx_max', 'rev_cnt', 'reject_cnt', 'relock_cnt', 'avg_rpm', 'torque_x10', 'watt',
  'w_lz_pk_mg', 'w_lz_rms_mg', 'w_ly_rms_mg', 'w_gz_x10', 'w_gx_x10', 'w_r_rms_mg', 'dc_mg'];
const DBG_INDEX = Object.fromEntries(DBG_FIELDS.map((field, i) => [field, i]));
const RS_FIELDS = ['min_period', 'max_period', 'lock_revs', 'ratio_min', 'ratio_max', 'r_min_mg', 'hyst_ratio',
  'motion_min_mg', 'hpf_fc_mhz', 'gx_limit_dps', 'rev_r_min_mg', 'stall_windows', 'out_ema_alpha', 'supervise_ratio'];
const RS_STATUS = { 0: 'OK', 1: 'PERIOD_RANGE', 2: 'PERIOD_JUMP', 3: 'GX_LIMIT', 4: 'AMP_LOW', 5: 'LOCKING', 6: 'DIR_FLIP' };
const RS_STATUS_KO = {
  0: '정상 회전', 1: '주기가 허용 범위 밖', 2: '직전 회전 대비 주기 급변', 3: 'gx 포화',
  4: '진폭 부족 (rev_r < rev_r_min)', 5: '락온 전 (출력 안 함)', 6: '위상 방향 뒤집힘',
};

const REV_WINDOW_MS = 5000;  // rev_count 기준 RPM을 계산할 구간
const SAMPLE_MS = 100;       // ③을 기록하는 간격
const MAX_ROWS = 300;        // 표·원본 로그에 그리는 최대 줄 수 (기록 자체는 모두 남긴다)
const AUTOSAVE_MS = 5000;

const config = Config.load();
const link = new PedalLink();
const pedal = new Pedal();
pedal.lzOn = config.rpmSource !== 'pedal'; // 게임 메뉴의 '속도 측정 방식'을 따른다

// 화면에 보이는 데이터 묶음. t는 모두 이 묶음이 시작된 때부터의 초.
// 저장은 '기록 시작'을 누른 때부터 '기록 중지'를 누를 때까지만 한다 (session.recording).
// 기록 중이 아닐 때도 화면은 똑같이 움직이지만 아무것도 저장되지 않는다.
// 아래 속성 이름(t, v 등)은 저장·내보내기 형식이라 바꾸지 않는다.
//  chunks  { t, dir: 'in'|'out', text }
//  frames  { t, gap, raw, rpm, watt, rev, dRev, revRpm, held, zeroRun, note, kind }
//  samples { t, game }
//  marks   { t, kind: 'manual'|'auto', note }
//  dbg     { t, v: [24 ints] }               DBG 응답
//  cap     CapBuffer (메모리) / 저장 형식은 CapBuffer.pack()   CAPD 100Hz 파형
//  capSegs { t, sec }                        CAP 시작 응답. 다시 걸 때마다 seq 가 0부터라 구간을 나눈다
//  rs      { min_period: …, … } | null       RS_G 응답
//  est     { t, zc, teo, comb }              lz 기반 케이던스 추정 (js/cadence-est.js), 약 10Hz
//  zcUpd   { t, v }                          영교차 추정이 새로 나온 순간 (반 바퀴마다)
//  turns   { t, v }                          페달 검출기가 회전을 확정한 순간 (DBG rev_cnt 증가, 0.5초 폴링이라 최대 0.5초 늦게 보인다)
// 모든 추정값의 t 는 그 값을 계산할 수 있게 된 시각(= CAPD 도착 시각)이다. 반응 속도를 공정하게 비교하려는 것.
let session;
let sessionStartAt;
const sessionTime = (timestamp = performance.now()) => (timestamp - sessionStartAt) / 1000;

function newSession(recording) {
  sessionStartAt = performance.now();
  const startDate = new Date();
  session = {
    id: startDate.toISOString(),
    startedAt: startDate.toISOString(),
    endedAt: null, // 기록 중지를 눌러야 채워진다. 비어 있는 채로 저장된 기록은 페이지가 닫혀 끊긴 것
    recording,
    chunks: [], frames: [], samples: [], marks: [],
    // eslint-disable-next-line id-length -- 저장된 기록 형식
    dbg: [], cap: new CapBuffer(), capSegs: [], rs: lastRsParams,
    est: [], zcUpd: [], turns: [],
  };
  edge = true;
  dirty = { frames: true, raw: true, save: false };
}

// CAPD 는 초당 100샘플 × 4채널이라 객체 배열로 두면 자동 저장(구조화 복제)이 무거워진다. 형식 배열에 쌓는다.
class CapBuffer {
  constructor() {
    this.count = 0;
    this.allocate(1024);
  }
  allocate(capacity) {
    const grow = (ArrayType, previous, width) => {
      const array = new ArrayType(capacity * width);
      if (previous) array.set(previous.subarray(0, this.count * width));
      return array;
    };
    this.times = grow(Float64Array, this.times, 1);     // 프레임 첫 샘플의 시각 (기록 시작부터의 초, seq 로 복원)
    this.seq = grow(Uint32Array, this.seq, 1);
    this.segments = grow(Uint16Array, this.segments, 1);
    this.values = grow(Int16Array, this.values, CAP_BATCH * CAP_CHANNELS.length);
    this.capacity = capacity;
  }
  push(time, segment, seq, values) {
    if (this.count === this.capacity) this.allocate(this.capacity * 2);
    const i = this.count++;
    this.times[i] = time; this.seq[i] = seq; this.segments[i] = segment;
    this.values.set(values, i * values.length);
  }
  // IndexedDB·JSON 용. 형식 배열은 slice 로 길이에 맞춰 복사한다 (subarray 는 버퍼 전체가 복제된다)
  pack() {
    const valuesPerFrame = CAP_BATCH * CAP_CHANNELS.length;
    const count = this.count;
    // eslint-disable-next-line id-length -- 저장된 기록 형식
    return { n: count, t: this.times.slice(0, count), seq: this.seq.slice(0, count), seg: this.segments.slice(0, count), v: this.values.slice(0, count * valuesPerFrame) };
  }
}
// 저장된 형식(pack 결과, IndexedDB 에서 읽으면 형식 배열 / JSON 이면 일반 배열) → 샘플 순회
function forEachCapSample(packed, visit) {
  const valuesPerFrame = CAP_BATCH * CAP_CHANNELS.length;
  for (let i = 0; i < packed.n; i++) {
    for (let sampleIndex = 0; sampleIndex < CAP_BATCH; sampleIndex++) {
      const offset = i * valuesPerFrame + sampleIndex * CAP_CHANNELS.length;
      visit(packed.t[i] + sampleIndex / CAP_RATE_HZ, packed.v[offset], packed.v[offset + 1], packed.v[offset + 2], packed.v[offset + 3], packed.seg[i], packed.seq[i]);
    }
  }
}

let lastRsParams = null; // 페달이 바뀌지 않는 한 그대로이므로 새 묶음에도 이어 붙인다
let frozen = false;
let dirty;
// 공이 왼쪽 끝에 붙어 있는 중인지. 자동 표시를 끝에 닿는 순간 한 번만 남기려고 둔다.
// 연결 직후에는 ③이 0에서 올라오는 중이라 끝에 있는 게 당연하므로, 한 번 벗어난 뒤부터 센다.
let edge = true;
newSession(false);

// ---------------- 수신 ----------------
link.onState = (state, detail) => {
  pedal.setSensor(state === 'ready');
  if (state === 'ready') edge = true;
  const statusElement = $('#status');
  statusElement.dataset.state = state;
  statusElement.textContent = detail || state;
  $('#btn-connect').textContent = link.wantLink ? '연결 해제' : '페달 연결';
  WakeLock.want(state === 'ready');
  // 연결 상태가 바뀐 것도 기록에 남긴다 (끊김과 놓침이 겹치는지 보려고)
  if (session.recording) mark('auto', `연결 상태: ${state}${detail ? ` (${detail})` : ''}`);
  if (state === 'ready' && link.device) session.device = link.device.name;
  Diagnostics.onState(state);
};

link.onRaw = (text) => {
  // CAPD(초당 20개)·DBG(초당 2개)는 원본 로그를 덮어 버린다. 온전한 알림 하나면 파싱된 저장소에만 남긴다.
  if (/^(CAPD|DBG),[^;]*;$/.test(text)) return;
  // eslint-disable-next-line id-length -- 저장된 기록 형식
  session.chunks.push({ t: sessionTime(), dir: 'in', text });
  dirty.raw = dirty.save = true;
};

link.onFrame = (raw, frame) => {
  const { frames } = session;
  const time = sessionTime();
  // 진단 응답은 프레임 표에 섞지 않고 따로 쌓는다
  if (frame && Diagnostics.frame(frame, time)) return;
  dirty.frames = dirty.save = true;
  if (frame && frame.name === 'VER') {
    session.firmware = frame.values.join(' ');
    $('#fw').textContent = `fw ${session.firmware}`;
  }
  if (!frame || frame.name !== 'WORKOUT') {
    // eslint-disable-next-line id-length -- 저장된 기록 형식
    frames.push({ t: time, raw, kind: 'other', note: frame ? `${frame.name} 프레임` : '파싱 실패' });
    return;
  }
  const workout = FrameCodec.workout(frame);
  const previous = lastWorkout();
  const gap = previous ? Math.round((time - previous.t) * 1000) : null;
  if (!workout) {
    // eslint-disable-next-line id-length -- 저장된 기록 형식
    frames.push({ t: time, gap, raw, kind: 'bad', note: '형식 오류 (무시됨)' });
    return;
  }
  const heldBefore = pedal.sensorRpm;
  pedal.sensorFrame(workout.rpm); // 게임과 똑같이 처리
  const held = pedal.sensorRpm;
  const notes = [];
  if (workout.rpm === 0 && heldBefore > 0 && held > 0) notes.push(`0 무시 (${pedal.zeroRun}/${Pedal.SENSOR_ZERO_GRACE}) → ${held} 유지`);
  else if (workout.rpm === 0 && heldBefore > 0) notes.push('0 유예 초과 → 정지');
  else if (workout.rpm === 0) notes.push('정지');
  if (gap != null && gap > 1500) notes.push('간격 김');
  const dRev = previous ? workout.revCount - previous.rev : null;
  if (dRev != null && dRev < 0) notes.push('rev_count 감소');
  frames.push({
    // eslint-disable-next-line id-length -- 저장된 기록 형식
    t: time, gap, raw, kind: 'workout',
    rpm: workout.rpm, watt: workout.watt, rev: workout.revCount, dRev,
    revRpm: revRpmAt(time, workout.revCount),
    held, zeroRun: pedal.zeroRun, note: notes.join(' · '),
  });

  // 회전을 놓쳤을 수 있는 순간은 자동으로 표시해 둔다
  if (workout.rpm === 0 && dRev > 0) mark('auto', `rev_count가 ${dRev} 늘었는데 rpm 0`);
  if (heldBefore > 0 && held === 0) mark('auto', '② 0으로 떨어짐 (게임은 정지로 봄)');
  if (gap != null && gap > 2500) mark('auto', `프레임 간격 ${gap}ms`);
};

function lastWorkout() {
  const { frames } = session;
  for (let i = frames.length - 1; i >= 0; i--) if (frames[i].kind === 'workout') return frames[i];
  return null;
}

// 최근 REV_WINDOW_MS 안의 가장 오래된 프레임과 비교한 회전 수 기준 RPM
function revRpmAt(time, revCount) {
  const { frames } = session;
  let reference = null;
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i];
    if (frame.kind !== 'workout') continue;
    if ((time - frame.t) * 1000 > REV_WINDOW_MS) break;
    if (frame.rev > revCount) break; // 카운터가 리셋된 경우 그 이후만 쓴다
    reference = frame;
  }
  if (!reference || time - reference.t < 0.5) return null;
  return ((revCount - reference.rev) / (time - reference.t)) * 60;
}

function mark(kind, note) {
  if (kind === 'manual' && !session.recording) return;
  // eslint-disable-next-line id-length -- 저장된 기록 형식
  session.marks.push({ t: sessionTime(), kind, note });
  dirty.frames = dirty.save = true;
  if (kind === 'manual') {
    const button = $('#btn-mark');
    button.classList.remove('flash');
    void button.offsetWidth;
    button.classList.add('flash');
    Saver.save(); // 직접 남긴 표시는 바로 저장한다
  }
}

// ---------------- 펌웨어 진단 (DBG / CAP / RS_G) ----------------
// 명령은 한 번에 하나씩 보낸다. Web Bluetooth 는 GATT 쓰기가 겹치면 예외를 던진다.
const Commands = {
  chain: Promise.resolve(),
  send(text, log = true) {
    const run = async () => {
      await link.send(text);
      if (log) {
        // eslint-disable-next-line id-length -- 저장된 기록 형식
        session.chunks.push({ t: sessionTime(), dir: 'out', text });
        dirty.raw = dirty.save = true;
      }
    };
    const sent = this.chain.then(run, run);
    this.chain = sent.catch(() => {});
    return sent;
  },
};

// lz 케이던스 추정기에 CAPD 를 순서대로 넣는다. 구간이 바뀌거나 크게 끊기면 처음부터 다시 잡는다.
const Estimator = {
  cadence: new LzCadence(),
  segment: -1,
  frame(values, segment, time) {
    if (segment !== this.segment) this.cadence.seq = -1; // 새 캡처 구간: capd() 가 처음부터 잡는다
    this.segment = segment;
    const reading = this.cadence.capd(values);
    this.last = { time, ...reading };
    // 게임과 같은 설정으로 페달에 넣어 '게임 ③' 이 실제 게임과 같은 값이 되게 한다
    // (준비되지 않은 0 은 넣지 않는다 — main.js onPedalFrame 과 같은 규칙)
    if (config.rpmSource !== 'pedal' && (reading.stopped || reading[config.rpmSource] > 0)) pedal.lzFrame(reading.stopped ? 0 : reading[config.rpmSource]);
    // eslint-disable-next-line id-length -- 저장된 기록 형식
    if (reading.zcNew) session.zcUpd.push({ t: time, v: reading.zcFull });
    const est = session.est;
    if (!est.length || time - est[est.length - 1].t >= 0.1 || reading.zcNew) {
      // eslint-disable-next-line id-length -- 저장된 기록 형식
      est.push({ t: time, zc: +reading.zc.toFixed(2), teo: +reading.teo.toFixed(2), comb: +reading.comb.toFixed(2) });
    }
  },
  last: null,
};

const Diagnostics = {
  dbgOn: true,
  capOn: true,
  capIdle: true,    // 기록 중이 아닐 때도 받는다 (속도 추정 비교 그래프용)
  dbgBusy: false,
  capAt: 0,         // 마지막으로 CAP 을 건 시각 (performance.now). 0 = 걸려 있지 않음
  previous: null,   // 직전 DBG 값 (자동 표시용)
  lastDbgAt: 0,

  onState(state) {
    if (state === 'ready') {
      this.capAt = 0;
      // VER 는 PedalLink 가 연결 직후 보낸다. 겹치지 않게 조금 뒤에 읽는다
      setTimeout(() => Commands.send(NUS.command('RS_G')).catch(() => {}), 400);
    } else {
      this.capAt = 0; // 펌웨어는 연결이 끊기면 캡처를 스스로 멈춘다
    }
  },

  // 진단 프레임이면 처리하고 true
  frame(frame, time) {
    const integers = (count) => (frame.values.length === count && frame.values.every((value) => /^-?\d+$/.test(value)) ? frame.values.map(Number) : null);
    if (frame.name === 'DBG') {
      const values = integers(DBG_FIELDS.length);
      if (!values) return true;
      // eslint-disable-next-line id-length -- 저장된 기록 형식
      session.dbg.push({ t: time, v: values });
      if (this.previous && values[DBG_INDEX.rev_cnt] > this.previous[DBG_INDEX.rev_cnt] && values[DBG_INDEX.period] > 0) {
        // eslint-disable-next-line id-length -- 저장된 기록 형식
        session.turns.push({ t: time, v: 6000 / values[DBG_INDEX.period] });
      }
      this.lastDbgAt = performance.now();
      this.autoMarks(values);
      this.previous = values;
      dirty.save = true;
      dirty.dbg = true;
      return true;
    }
    if (frame.name === 'CAPD') {
      const values = integers(1 + CAP_BATCH * CAP_CHANNELS.length);
      if (!values) return true;
      const segments = session.capSegs;
      // CAP 응답보다 CAPD 가 먼저 오는 일은 없지만, 기록 도중에 시작된 캡처를 이어 받는 경우를 위해 구간을 만든다
      // eslint-disable-next-line id-length -- 저장된 기록 형식
      if (!segments.length) segments.push({ t: time - (values[0] * CAP_BATCH) / CAP_RATE_HZ, sec: null });
      const segment = segments.length - 1;
      session.cap.push(segments[segment].t + (values[0] * CAP_BATCH) / CAP_RATE_HZ, segment, values[0], values.slice(1));
      Estimator.frame(values, segment, time);
      dirty.save = true;
      return true;
    }
    if (frame.name === 'CAP') {
      const values = integers(1);
      // eslint-disable-next-line id-length -- 저장된 기록 형식
      if (values && values[0] > 0) session.capSegs.push({ t: time, sec: values[0] });
      return true;
    }
    if (frame.name === 'RS_G') {
      const values = integers(RS_FIELDS.length);
      // 미설정 기기는 'RS_G,0:;' — 펌웨어가 컴파일 기본값을 쓴다는 뜻이다
      lastRsParams = values ? Object.fromEntries(RS_FIELDS.map((field, i) => [field, values[i]])) : { unset: true };
      session.rs = lastRsParams; // eslint-disable-line id-length -- 저장된 기록 형식
      dirty.save = dirty.dbg = true;
      return true;
    }
    return false;
  },

  // 검출기가 회전을 기각하거나 다시 락온하는 순간이 '놓침'의 직접 원인이다
  autoMarks(values) {
    const previous = this.previous;
    if (!previous) return;
    const index = DBG_INDEX;
    const rejected = values[index.reject_cnt] - previous[index.reject_cnt];
    if (rejected > 0) {
      const status = values[index.status];
      mark('auto', `페달 검출기: 회전 기각 ${rejected}회 — ${RS_STATUS[status] || status} (${RS_STATUS_KO[status] || '?'}), period ${values[index.period]} = ${formatNumber(6000 / values[index.period], 1)} rpm, rev_r ${values[index.rev_r_mg]} mg`);
    }
    if (values[index.relock_cnt] > previous[index.relock_cnt]) mark('auto', '페달 검출기: 재락온 (감독자 FFT 교차검증)');
    if (previous[index.moving] === 1 && values[index.moving] === 0) mark('auto', `페달 검출기: 움직임 없음 판정 (w_r_rms ${values[index.w_r_rms_mg]} mg)`);
    if (previous[index.avg_rpm] > 0 && values[index.avg_rpm] === 0) mark('auto', `페달 검출기: 출력 0 (status ${RS_STATUS[values[index.status]]}, locked ${values[index.locked_revs]})`);
  },

  tick(now) {
    if (link.state !== 'ready' || simulator.timer) return;
    if (this.dbgOn && !this.dbgBusy && now - this.lastPoll >= DBG_POLL_MS) {
      this.lastPoll = now;
      this.dbgBusy = true;
      Commands.send(NUS.command('DBG'), false).catch(() => {}).finally(() => (this.dbgBusy = false));
    }
    // 원시 파형은 기록 중에만 받는다 (데이터가 많고, 화면용으로는 DBG 로 충분하다)
    const wantCap = this.capOn && (session.recording || this.capIdle) && !session.stopping;
    if (wantCap && (!this.capAt || now - this.capAt > CAP_RENEW_MS)) {
      this.capAt = now;
      Commands.send(NUS.command('CAP', [CAP_SEC])).catch(() => (this.capAt = 0));
    } else if (!wantCap && this.capAt) {
      this.stopCap();
    }
  },
  lastPoll: 0,

  stopCap() {
    if (!this.capAt) return Promise.resolve();
    this.capAt = 0;
    return link.state === 'ready' ? Commands.send(NUS.command('CAP', [0])).catch(() => {}) : Promise.resolve();
  },
};

// ---------------- 저장 (IndexedDB) ----------------
// sessions에는 기록 전체, index에는 목록에 보여줄 요약만 둔다 (목록을 그릴 때 큰 기록을 다 읽지 않으려고)
const Store = {
  database: null,
  open() {
    if (!this.database) {
      this.database = new Promise((resolve, reject) => {
        const request = indexedDB.open('pedal-debug', 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('sessions', { keyPath: 'id' });
          request.result.createObjectStore('index', { keyPath: 'id' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return this.database;
  },
  async run(stores, mode, body) {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(stores, mode);
      const request = body(transaction);
      transaction.oncomplete = () => resolve(request && request.result);
      transaction.onerror = () => reject(transaction.error);
    });
  },
  put(record, summary) {
    return this.run(['sessions', 'index'], 'readwrite', (transaction) => {
      transaction.objectStore('sessions').put(record);
      transaction.objectStore('index').put(summary);
    });
  },
  get(id) {
    return this.run(['sessions'], 'readonly', (transaction) => transaction.objectStore('sessions').get(id));
  },
  list() {
    return this.run(['index'], 'readonly', (transaction) => transaction.objectStore('index').getAll());
  },
  remove(id) {
    return this.run(['sessions', 'index'], 'readwrite', (transaction) => {
      transaction.objectStore('sessions').delete(id);
      transaction.objectStore('index').delete(id);
    });
  },
};

const Saver = {
  ok: !!window.indexedDB,
  async save() {
    if (!this.ok || !session.recording || !dirty.save) return;
    dirty.save = false;
    try {
      await Store.put(exportData(session), summarize(session));
      $('#save-note').textContent = `${session.endedAt ? '기록 완료' : '자동 저장'} ${new Date().toLocaleTimeString()}`;
      renderSessions();
    } catch (error) {
      dirty.save = true;
      $('#save-note').textContent = `저장 실패: ${error.message}`;
    }
  },
};
// 기록 중에는 AUTOSAVE_MS마다, 그리고 탭이 가려질 때 저장한다. 페이지가 갑자기 닫히면 마지막 저장까지만 남는다.
setInterval(() => Saver.save(), AUTOSAVE_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') Saver.save();
});

function summarize(record) {
  const workouts = record.frames.filter((frame) => frame.kind === 'workout');
  return {
    id: record.id,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    duration: record.endedAt ? (Date.parse(record.endedAt) - Date.parse(record.startedAt)) / 1000 : record.frames.length ? record.frames[record.frames.length - 1].t : 0,
    frames: workouts.length,
    zeros: workouts.filter((frame) => frame.rpm === 0).length,
    manual: record.marks.filter((entry) => entry.kind === 'manual').length,
    auto: record.marks.filter((entry) => entry.kind === 'auto').length,
    dbg: record.dbg ? record.dbg.length : 0,
    cap: record.cap ? record.cap.count * CAP_BATCH : 0,
  };
}

function exportData(record) {
  return {
    id: record.id,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    savedAt: new Date().toISOString(),
    firmware: link.firmware || record.firmware || '',
    device: (link.device && link.device.name) || record.device || '',
    userAgent: navigator.userAgent,
    pedal: { SENSOR_ZERO_GRACE: Pedal.SENSOR_ZERO_GRACE, SENSOR_STALE_MS: Pedal.SENSOR_STALE_MS },
    target: +targetInput.value,
    config,
    chunks: record.chunks, frames: record.frames, samples: record.samples, marks: record.marks,
    // eslint-disable-next-line id-length -- 저장된 기록 형식
    dbgFields: DBG_FIELDS, dbg: record.dbg, rs: record.rs,
    est: record.est, zcUpd: record.zcUpd, turns: record.turns,
    capChannels: CAP_CHANNELS, capScale: { acc: 'g × 10000 (0.1 mg)', gyr: 'dps × 10 (0.1 dps)' },
    capSegs: record.capSegs, cap: record.cap instanceof CapBuffer ? record.cap.pack() : record.cap,
  };
}

// 형식 배열은 JSON.stringify 하면 {"0":…} 객체가 되므로 일반 배열로 바꾼다
function jsonable(data) {
  if (!data.cap) return data;
  const packed = data.cap;
  // eslint-disable-next-line id-length -- 저장된 기록 형식
  return { ...data, cap: { n: packed.n, t: Array.from(packed.t), seq: Array.from(packed.seq), seg: Array.from(packed.seg), v: Array.from(packed.v) } };
}

// 페달 저장소 cardio_tool 의 cap CSV 와 같은 형식 — tools/verify_phase_detector.py --csv 로 재생된다.
// t_s 는 기록 시작부터의 초. CAP 을 다시 건 구간 경계에서는 몇 샘플이 비고, seq 유실 구간도 빈 채로 둔다.
function capCsv(data) {
  const lines = ['t_s,lz_g,ly_g,gx_dps,gz_dps'];
  const rows = [];
  forEachCapSample(data.cap, (time, accelZ, accelY, gyroX, gyroZ) => rows.push([time, accelZ, accelY, gyroX, gyroZ]));
  rows.sort((a, b) => a[0] - b[0]);
  for (const row of rows) lines.push(`${row[0].toFixed(4)},${(row[1] / 10000).toFixed(5)},${(row[2] / 10000).toFixed(5)},${(row[3] / 10).toFixed(2)},${(row[4] / 10).toFixed(2)}`);
  return lines.join('\n');
}

// 페달 저장소 cardio_tool 의 dbg CSV 와 같은 형식 (timestamp, epoch_ms, 24필드). t_s 열을 덧붙인다
function dbgCsv(data) {
  const start = Date.parse(data.startedAt);
  const lines = [['timestamp', 'epoch_ms'].concat(DBG_FIELDS, ['t_s']).join(',')];
  for (const reading of data.dbg) {
    const epochMs = Math.round(start + reading.t * 1000);
    lines.push([new Date(epochMs).toISOString(), epochMs].concat(reading.v, [reading.t.toFixed(3)]).join(','));
  }
  return lines.join('\n');
}

// ---------------- 내보내기 ----------------
const fileStamp = (iso) => iso.slice(0, 19).replace(/[:T]/g, '-');

function toCsv(record) {
  const columns = ['t', 'gap', 'rpm', 'watt', 'rev', 'dRev', 'revRpm', 'held', 'zeroRun', 'note', 'raw'];
  const csvCell = (value) => (value == null ? '' : /[",\n;]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value));
  const rows = record.frames.map((frame) => columns.map((column) => (column === 't' ? frame.t.toFixed(3) : column === 'revRpm' && frame.revRpm != null ? frame.revRpm.toFixed(1) : frame[column])));
  // 표시는 같은 열 구성의 줄로 끼워 넣는다 (rpm 칸이 비어 있고 note에 내용)
  for (const entry of record.marks) rows.push([entry.t.toFixed(3), '', '', '', '', '', '', '', '', `[${entry.kind === 'manual' ? '직접 표시' : '자동 표시'}] ${entry.note}`, '']);
  rows.sort((a, b) => a[0] - b[0]);
  return '﻿' + [columns.join(',')].concat(rows.map((row) => row.map(csvCell).join(','))).join('\n');
}

// 태블릿에서는 공유 시트(메신저·메일·드라이브)로 바로 보내는 편이 편하다. 안 되면 내려받기로.
async function deliver(name, text, type, viaShare) {
  if (viaShare) {
    const file = new File([text], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }
  }
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([text], { type }));
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

// 저장된 기록은 저장할 때 이미 exportData() 형태로 만들어 둔 것이다
function exportJson(record, viaShare) {
  const data = jsonable(record === session ? exportData(record) : record);
  return deliver(`pedal-debug-${fileStamp(record.startedAt)}.json`, JSON.stringify(data), 'application/json', viaShare);
}

// ---------------- 저장된 기록 목록 ----------------
async function renderSessions() {
  if (!Saver.ok) {
    $('#sessions').innerHTML = '<tr><td class="l" colspan="7">이 브라우저에서는 기록을 저장할 수 없습니다. 내려받기를 쓰세요.</td></tr>';
    return;
  }
  const list = (await Store.list()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const canShare = !!navigator.canShare;
  $('#sessions').innerHTML = list.length ? list.map((summary) => {
    const isCurrent = session.recording && summary.id === session.id;
    const when = new Date(summary.startedAt).toLocaleString();
    const state = isCurrent ? '<b>기록 중</b>' : summary.endedAt ? '완료' : '<span title="기록 중지 전에 페이지가 닫혔습니다. 마지막 자동 저장까지만 남아 있습니다.">중간에 끊김</span>';
    return `<tr data-id="${escapeHtml(summary.id)}">
      <td class="l">${escapeHtml(when)}</td><td class="l">${state}</td>
      <td>${formatDuration(summary.duration)}</td><td>${summary.frames}</td><td>${summary.zeros}</td><td>${summary.manual} / ${summary.auto}</td>
      <td class="l actions">
        ${canShare ? '<button class="btn small" data-act="share">공유</button>' : ''}
        <button class="btn small" data-act="json">JSON</button>
        <button class="btn small" data-act="csv">CSV</button>
        ${summary.dbg ? '<button class="btn small" data-act="dbg">DBG CSV</button>' : ''}
        ${summary.cap ? '<button class="btn small" data-act="cap">CAP CSV</button>' : ''}
        ${isCurrent ? '' : '<button class="btn small danger" data-act="del">삭제</button>'}
      </td></tr>`;
  }).join('') : '<tr><td class="l" colspan="7">아직 저장된 기록이 없습니다. <b>● 기록 시작</b>을 누르면 그때부터 저장됩니다.</td></tr>';
}

$('#sessions').onclick = async (event) => {
  const button = event.target.closest('button[data-act]');
  if (!button) return;
  const id = button.closest('tr').dataset.id;
  const action = button.dataset.act;
  if (action === 'del') {
    if (!confirm('이 기록을 삭제할까요?')) return;
    await Store.remove(id);
    renderSessions();
    return;
  }
  // 지금 기록 중인 것은 메모리에 있는 최신 상태로 내보낸다
  const record = session.recording && id === session.id ? session : await Store.get(id);
  if (!record) return;
  if (action === 'share') exportJson(record, true);
  if (action === 'json') exportJson(record, false);
  if (action === 'csv') deliver(`pedal-frames-${fileStamp(record.startedAt)}.csv`, toCsv(record), 'text/csv', false);
  const data = record === session ? exportData(record) : record;
  if (action === 'dbg') deliver(`pedal-dbg-${fileStamp(record.startedAt)}.csv`, dbgCsv(data), 'text/csv', false);
  if (action === 'cap') deliver(`pedal-cap-${fileStamp(record.startedAt)}.csv`, capCsv(data), 'text/csv', false);
};

const formatDuration = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

// ---------------- 화면 꺼짐 방지 ----------------
// 태블릿 화면이 꺼지면 BLE 연결이 끊기거나 알림이 밀릴 수 있어서, 연결되어 있는 동안은 화면을 켜 둔다
const WakeLock = {
  wanted: false,
  lock: null,
  async want(keepAwake) {
    this.wanted = keepAwake;
    if (!('wakeLock' in navigator)) return;
    if (keepAwake && !this.lock && document.visibilityState === 'visible') {
      try {
        this.lock = await navigator.wakeLock.request('screen');
        this.lock.addEventListener('release', () => (this.lock = null));
      } catch {}
    } else if (!keepAwake && this.lock) {
      this.lock.release();
    }
  },
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && WakeLock.wanted) WakeLock.want(true);
});

// ---------------- 조작 ----------------
$('#btn-connect').onclick = () => {
  if (simulator.timer) simulator.stop();
  link.wantLink ? link.disconnect() : link.connect();
};
if (!link.supported) {
  $('#btn-connect').disabled = true;
  link.onState('idle', 'Web Bluetooth를 쓸 수 없습니다 (Chrome·Edge에서 localhost로 열어주세요)');
}

$('#btn-mark').onclick = () => mark('manual', '직접 표시');
document.addEventListener('keydown', (event) => {
  if (event.code === 'KeyM' && !event.repeat && !(event.target instanceof HTMLInputElement)) mark('manual', '직접 표시');
});

$('#btn-freeze').onclick = (event) => {
  frozen = !frozen;
  event.target.setAttribute('aria-pressed', frozen);
  event.target.textContent = frozen ? '화면 멈춤 해제' : '화면 멈춤';
  dirty.frames = dirty.raw = true;
};

// 기록 시작: 화면을 비우고 그 시점부터 저장한다. 기록 중지: 마지막으로 저장하고 기록을 닫는다.
// 중지 후에는 다시 저장하지 않는 새 화면으로 넘어간다 (저장된 기록과 화면이 어긋나지 않게).
async function setRecording(recording) {
  if (recording === session.recording) return;
  if (recording) {
    newSession(true);
    dirty.save = true;
    if (link.firmware) session.firmware = link.firmware;
    if (link.device) session.device = link.device.name;
    mark('auto', `기록 시작 (연결 상태: ${link.state})`);
  } else {
    session.stopping = true; // CAP 정지 응답을 기다리는 동안 루프가 캡처를 다시 걸지 않게
    await Diagnostics.stopCap();
    session.endedAt = new Date().toISOString();
    mark('auto', '기록 중지');
  }
  await Saver.save();
  if (!recording) newSession(false);
  renderRecording();
  renderSessions();
}

function renderRecording() {
  const recording = session.recording;
  const button = $('#btn-rec');
  button.textContent = recording ? '■ 기록 중지' : '● 기록 시작';
  button.classList.toggle('on', recording);
  $('#btn-mark').disabled = !recording;
  document.body.classList.toggle('recording', recording);
}

$('#btn-rec').onclick = () => {
  if (session.recording && !confirm('기록을 중지할까요? 지금까지의 기록이 저장됩니다.')) return;
  setRecording(!session.recording);
};

// 기록 중에 실수로 페이지를 닫지 않게 한 번 묻는다
window.addEventListener('beforeunload', (event) => {
  if (!session.recording) return;
  Saver.save();
  event.preventDefault();
  event.returnValue = '';
});

$('#btn-send').onclick = async () => {
  const text = $('#cmd').value;
  try {
    await Commands.send(text);
    $('#send-note').textContent = '';
  } catch (error) {
    $('#send-note').textContent = `실패: ${error.message}`;
  }
};

$('#opt-dbg').onchange = (event) => (Diagnostics.dbgOn = event.target.checked);
$('#opt-cap').onchange = (event) => (Diagnostics.capOn = event.target.checked);
$('#opt-cap-idle').onchange = (event) => (Diagnostics.capIdle = event.target.checked);

const targetInput = $('#target');
const toleranceInput = $('#tol');
targetInput.value = config.fallbackRpm;
toleranceInput.value = Math.round(config.tolerance * 100);
$('#maxdev').textContent = Math.round(config.maxDeviation * 100);
$('#btn-target-avg').onclick = () => {
  const from = sessionTime() - 10;
  const recentRpms = session.samples.filter((sample) => sample.t >= from && sample.game > 0).map((sample) => sample.game);
  if (recentRpms.length) targetInput.value = Math.round(recentRpms.reduce((a, b) => a + b, 0) / recentRpms.length);
};

// ---------------- 시뮬레이터 (?sim) ----------------
// 실제 펌웨어 동작은 모른다. 느린 회전 문제를 재현해 보려고 '1초 창 안에 회전이 끝나지 않으면 0'이라고 가정한 것뿐이다.
// 실제 연결과 같은 경로(notify → 분할 → 파싱)를 타도록 알림을 두 조각으로 나눠 넣는다.
const simulator = {
  timer: null,
  revs: 0,
  last: 0,
  start() {
    if (link.wantLink) link.disconnect();
    this.revs = 0;
    this.last = performance.now();
    link.setState('ready', '시뮬레이터');
    const tick = () => {
      const now = performance.now();
      const cadence = +$('#sim-cadence').value;
      const before = Math.floor(this.revs);
      this.revs += (cadence / 60) * ((now - this.last) / 1000);
      this.last = now;
      const rev = Math.floor(this.revs);
      const rpm = rev > before ? Math.max(0, Math.round(cadence + (Math.random() - 0.5) * 4)) : 0;
      const text = `WORKOUT,3:${rpm},${Math.round(rpm * 1.4)},${rev};`;
      const cut = 1 + Math.floor(Math.random() * (text.length - 1));
      const encoder = new TextEncoder();
      link.notify(new DataView(encoder.encode(text.slice(0, cut)).buffer));
      link.notify(new DataView(encoder.encode(text.slice(cut)).buffer));
      this.timer = setTimeout(tick, 950 + Math.random() * 100);
    };
    this.timer = setTimeout(tick, 1000);
    $('#sim-toggle').textContent = '정지';
  },
  stop() {
    clearTimeout(this.timer);
    this.timer = null;
    link.setState('idle', '연결 안 됨');
    $('#sim-toggle').textContent = '시작';
  },
};
if (new URLSearchParams(location.search).has('sim')) {
  $('#sim-panel').hidden = false;
  $('#sim-toggle').onclick = () => (simulator.timer ? simulator.stop() : simulator.start());
  $('#sim-cadence').oninput = (event) => ($('#sim-cadence-v').textContent = event.target.value);
}

// ---------------- 화면 ----------------
const formatNumber = (value, digits = 0) => (value == null || Number.isNaN(value) ? '-' : value.toFixed(digits));

function renderTiles(now, game) {
  const lastFrame = lastWorkout();
  $('#v-raw').textContent = lastFrame ? lastFrame.rpm : '-';
  $('#v-raw-s').textContent = lastFrame ? `t=${lastFrame.t.toFixed(1)}s` : '마지막 WORKOUT 프레임';
  $('#v-held').textContent = pedal.sensorOn ? pedal.sensorRpm : '-';
  $('#v-held-s').textContent = pedal.zeroRun ? `연속 0: ${pedal.zeroRun} (유예 ${Pedal.SENSOR_ZERO_GRACE})` : `연속 0 유예 ${Pedal.SENSOR_ZERO_GRACE}개`;
  $('#v-game').textContent = formatNumber(game, 1);
  $('#v-rev').textContent = lastFrame ? formatNumber(lastFrame.revRpm, 1) : '-';
  $('#v-rev-s').textContent = `최근 ${REV_WINDOW_MS / 1000}초 Δrev로 계산`;
  $('#v-count').textContent = lastFrame ? `${lastFrame.rev} / ${lastFrame.watt}` : '-';
  $('#v-count-s').textContent = lastFrame && lastFrame.dRev != null ? `직전 프레임 대비 Δrev ${lastFrame.dRev}` : '';
  const age = lastFrame ? now - (sessionStartAt + lastFrame.t * 1000) : null;
  $('#v-age').textContent = age == null ? '-' : `${(age / 1000).toFixed(1)}s`;
  $('#v-age-s').textContent = `${Pedal.SENSOR_STALE_MS / 1000}초 넘으면 게임은 0으로 봄`;
  $('#t-age').classList.toggle('alert', pedal.sensorOn && age != null && age > Pedal.SENSOR_STALE_MS);
  const recent = session.frames.filter((frame) => frame.kind === 'workout' && frame.t >= sessionTime(now) - 30);
  const zeros = recent.filter((frame) => frame.rpm === 0).length;
  $('#v-zero').textContent = recent.length ? `${Math.round((zeros / recent.length) * 100)}%` : '-';
  $('#v-zero-s').textContent = recent.length ? `${zeros} / ${recent.length} 프레임` : '';
  $('#rec-time').textContent = session.recording ? formatDuration(sessionTime(now)) : '저장 안 함';
  const manual = session.marks.filter((entry) => entry.kind === 'manual').length;
  $('#v-marks').textContent = `${manual} / ${session.marks.length - manual}`;
}

function renderBall(game) {
  const target = +targetInput.value;
  const tolerance = (+toleranceInput.value || 0) / 100;
  if (!(target > 0)) return;
  const deviation = (game - target) / target;
  const position = Util.clamp(deviation / config.maxDeviation, -1, 1);
  const percent = (offset) => `${50 + offset * 50}%`;
  const zone = $('#ball-zone');
  zone.style.left = percent(-tolerance / config.maxDeviation);
  zone.style.right = percent(-tolerance / config.maxDeviation);
  const ball = $('#ball');
  ball.style.left = percent(position);
  ball.classList.toggle('out', Math.abs(deviation) > tolerance);
  $('#dev-text').textContent = `편차 ${(deviation * 100).toFixed(1)}%${Math.abs(deviation) > tolerance ? ' · 구역 밖' : ''}${position <= -1 ? ' · 왼쪽 끝' : ''}`;
}

// 공이 왼쪽 끝에 닿는 순간도 자동으로 표시한다 (목표 RPM 기준이라 목표를 맞게 넣어야 의미가 있다)
function checkEdge(game) {
  const target = +targetInput.value;
  if (!pedal.sensorOn || !(target > 0)) return;
  const atEdge = (game - target) / target <= -config.maxDeviation;
  if (atEdge && !edge) mark('auto', `공 왼쪽 끝 (③ ${game.toFixed(1)}, 목표 ${target})`);
  edge = atEdge;
}

function renderFrames() {
  const { frames, marks } = session;
  const rows = frames.slice(-MAX_ROWS);
  const from = rows.length ? rows[0].t : 0;
  const items = rows.concat(marks.filter((entry) => entry.t >= from).map((entry) => ({ ...entry, kind: 'mark', manual: entry.kind === 'manual' })));
  items.sort((a, b) => b.t - a.t);
  $('#frames').innerHTML = items.map((item) => {
    if (item.kind === 'mark') {
      return `<tr class="mark ${item.manual ? 'manual' : ''}"><td>${item.t.toFixed(2)}</td><td colspan="7"></td><td class="l">${item.manual ? '★ 직접 표시' : '▲ ' + escapeHtml(item.note)}</td></tr>`;
    }
    if (item.kind !== 'workout') {
      return `<tr class="bad"><td>${item.t.toFixed(2)}</td><td>${item.gap ?? ''}</td><td colspan="6"></td><td class="l">${escapeHtml(item.note)}: ${escapeHtml(item.raw)}</td></tr>`;
    }
    const rowClass = item.rpm === 0 ? (item.held > 0 ? 'held' : 'zero') : '';
    return `<tr class="${rowClass}"><td>${item.t.toFixed(2)}</td><td>${item.gap ?? ''}</td><td>${item.rpm}</td><td>${item.watt}</td><td>${item.rev}</td><td>${item.dRev ?? ''}</td><td>${formatNumber(item.revRpm, 1)}</td><td>${item.held}</td><td class="l">${escapeHtml(item.note)}</td></tr>`;
  }).join('');
  $('#frame-count').textContent = `${frames.length}개 기록${frames.length > MAX_ROWS ? ` (최근 ${MAX_ROWS}개 표시)` : ''} · 빨강 = 0 정지, 주황 = 0이지만 유예로 유지`;
}

function renderRaw() {
  const visible = (text) => escapeHtml(text).replace(/\n/g, '⏎').replace(/\r/g, '␍');
  $('#raw').innerHTML = session.chunks.slice(-MAX_ROWS).reverse().map((chunk) =>
    `<span class="t">${chunk.t.toFixed(3)}</span> ${chunk.dir === 'out' ? '<span class="out">→ ' + visible(chunk.text) + '</span>' : '← ' + visible(chunk.text)}`
  ).join('\n');
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
}

// ---------------- 그래프 ----------------
const chartCanvas = $('#chart');
const cssVariable = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// 캔버스 픽셀 크기를 화면 크기에 맞추고, CSS 픽셀 단위로 그리게 한다. 그릴 영역의 크기를 돌려준다
function fitCanvas(canvas, context) {
  const pixelRatio = window.devicePixelRatio || 1;
  const bounds = canvas.getBoundingClientRect();
  if (canvas.width !== Math.round(bounds.width * pixelRatio) || canvas.height !== Math.round(bounds.height * pixelRatio)) {
    canvas.width = Math.round(bounds.width * pixelRatio);
    canvas.height = Math.round(bounds.height * pixelRatio);
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  return { width: bounds.width, height: bounds.height };
}

function drawChart(now) {
  const context = chartCanvas.getContext('2d');
  const { width, height } = fitCanvas(chartCanvas, context);
  const pad = { left: 36, right: 8, top: 8, bottom: 20 };
  context.clearRect(0, 0, width, height);

  const span = +$('#window').value;
  const endTime = sessionTime(now), startTime = endTime - span;
  const target = +targetInput.value || 0;
  const tolerance = (+toleranceInput.value || 0) / 100;
  const visibleFrames = session.frames.filter((frame) => frame.kind === 'workout' && frame.t >= startTime);
  let maxRpm = Math.max(40, target * (1 + config.maxDeviation));
  for (const frame of visibleFrames) maxRpm = Math.max(maxRpm, frame.rpm, frame.revRpm || 0);
  maxRpm = Math.ceil(maxRpm / 20) * 20;
  const toX = (time) => pad.left + ((time - startTime) / span) * (width - pad.left - pad.right);
  const toY = (rpm) => height - pad.bottom - (rpm / maxRpm) * (height - pad.top - pad.bottom);

  // 격자
  context.font = '11px ui-monospace, Consolas, monospace';
  context.fillStyle = cssVariable('--ink-soft');
  context.strokeStyle = cssVariable('--bg');
  context.lineWidth = 1;
  context.textAlign = 'right';
  for (let rpm = 0; rpm <= maxRpm; rpm += 20) {
    context.beginPath(); context.moveTo(pad.left, toY(rpm)); context.lineTo(width - pad.right, toY(rpm)); context.stroke();
    context.fillText(rpm, pad.left - 4, toY(rpm) + 4);
  }
  context.textAlign = 'center';
  const step = span <= 60 ? 10 : span <= 120 ? 20 : 60;
  for (let second = Math.ceil(startTime / step) * step; second <= endTime; second += step) {
    if (second < 0) continue;
    context.beginPath(); context.moveTo(toX(second), pad.top); context.lineTo(toX(second), height - pad.bottom); context.stroke();
    context.fillText(`${second}s`, toX(second), height - 5);
  }

  // 허용 구역과 공이 왼쪽 끝에 닿는 선
  if (target > 0) {
    context.fillStyle = cssVariable('--good-soft');
    context.fillRect(pad.left, toY(target * (1 + tolerance)), width - pad.left - pad.right, toY(target * (1 - tolerance)) - toY(target * (1 + tolerance)));
    context.setLineDash([4, 4]);
    context.strokeStyle = cssVariable('--good');
    horizontalLine(toY(target));
    context.strokeStyle = cssVariable('--bad');
    horizontalLine(toY(target * (1 - config.maxDeviation)));
    context.setLineDash([]);
  }
  function horizontalLine(y) {
    context.beginPath(); context.moveTo(pad.left, y); context.lineTo(width - pad.right, y); context.stroke();
  }

  context.save();
  context.beginPath();
  context.rect(pad.left, pad.top, width - pad.left - pad.right, height - pad.top - pad.bottom);
  context.clip();

  // 표시 (직접 = 굵은 보라 실선, 자동 = 가는 빨간 점선)
  for (const entry of session.marks) {
    if (entry.t < startTime) continue;
    const manual = entry.kind === 'manual';
    context.strokeStyle = cssVariable(manual ? '--mark' : '--bad');
    context.lineWidth = manual ? 2.5 : 1;
    context.setLineDash(manual ? [] : [2, 3]);
    context.beginPath(); context.moveTo(toX(entry.t), pad.top); context.lineTo(toX(entry.t), height - pad.bottom); context.stroke();
  }
  context.setLineDash([]);

  // rev_count 기준
  context.strokeStyle = cssVariable('--good');
  context.lineWidth = 1.5;
  context.beginPath();
  let started = false;
  for (const frame of visibleFrames) {
    if (frame.revRpm == null) { started = false; continue; }
    started ? context.lineTo(toX(frame.t), toY(frame.revRpm)) : context.moveTo(toX(frame.t), toY(frame.revRpm));
    started = true;
  }
  context.stroke();

  // ② 0 유예 후 (계단)
  context.strokeStyle = cssVariable('--warn');
  context.lineWidth = 2;
  context.beginPath();
  visibleFrames.forEach((frame, i) => {
    if (i === 0) context.moveTo(toX(frame.t), toY(frame.held));
    else { context.lineTo(toX(frame.t), toY(visibleFrames[i - 1].held)); context.lineTo(toX(frame.t), toY(frame.held)); }
  });
  if (visibleFrames.length) context.lineTo(toX(endTime), toY(visibleFrames[visibleFrames.length - 1].held));
  context.stroke();

  // ③ 게임 RPM
  context.strokeStyle = cssVariable('--accent');
  context.lineWidth = 2.5;
  context.beginPath();
  started = false;
  for (const sample of session.samples) {
    if (sample.t < startTime) continue;
    started ? context.lineTo(toX(sample.t), toY(sample.game)) : context.moveTo(toX(sample.t), toY(sample.game));
    started = true;
  }
  context.stroke();

  // ① 원본 avg_rpm
  for (const frame of visibleFrames) {
    context.fillStyle = frame.rpm === 0 ? cssVariable('--bad') : cssVariable('--ink');
    context.beginPath(); context.arc(toX(frame.t), toY(frame.rpm), 3.5, 0, Math.PI * 2); context.fill();
  }
  context.restore();
}

// ---------------- 펌웨어 진단 화면 ----------------
function renderDbg() {
  const last = session.dbg[session.dbg.length - 1];
  const rsParams = session.rs;
  const rsText = !rsParams ? 'RS_G 응답 없음' : rsParams.unset ? 'RS_G 미설정 — 펌웨어 컴파일 기본값 사용 중'
    : `정지 판정: 락온 전 ${rsParams.max_period / 100}s (= ${formatNumber(6000 / rsParams.max_period, 1)} rpm) 넘게 회전 없음 · 락온 후 직전 주기의 ${rsParams.ratio_max / 1000}배 · `
      + `주기 급변 허용 ${rsParams.ratio_min / 1000}~${rsParams.ratio_max / 1000}배 · 진폭 하한 rev_r_min ${rsParams.rev_r_min_mg} mg · 움직임 하한 ${rsParams.motion_min_mg} mg · `
      + `저진폭 ${rsParams.stall_windows}창 연속이면 즉시 정지 · 락온 ${rsParams.lock_revs}회전`;
  $('#rs-text').textContent = rsText;
  if (!last) return;
  const values = last.v, index = DBG_INDEX;
  const status = values[index.status];
  const hasRsParams = rsParams && !rsParams.unset;
  const items = [
    ['moving', values[index.moving] ? '1 (움직임)' : '0 (정지)', `w_r_rms ${values[index.w_r_rms_mg]} mg`, !values[index.moving]],
    ['status', `${status} ${RS_STATUS[status] || ''}`, RS_STATUS_KO[status] || '', status !== 0 && status !== 5],
    ['locked_revs', values[index.locked_revs], '연속 유효 회전'],
    ['period', `${values[index.period]}`, values[index.period] ? `${(values[index.period] / 100).toFixed(2)}s = ${formatNumber(6000 / values[index.period], 1)} rpm` : ''],
    ['rev_r_mg', values[index.rev_r_mg], hasRsParams ? `하한 ${rsParams.rev_r_min_mg} mg` : '마지막 회전 진폭', hasRsParams && values[index.rev_r_mg] < rsParams.rev_r_min_mg],
    ['avg_rpm', values[index.avg_rpm], '검출기 출력 (EMA)', values[index.avg_rpm] === 0],
    ['torque_x10', values[index.torque_x10], `gz_x10 ${values[index.gz_x10]} (회전당 원시)`],
    ['watt', values[index.watt], ''],
    ['rev / reject / relock', `${values[index.rev_cnt]} / ${values[index.reject_cnt]} / ${values[index.relock_cnt]}`, '누적'],
    ['gx min / max', `${values[index.gx_min]} / ${values[index.gx_max]}`, 'dps, 마지막 회전'],
  ];
  $('#dbg-tiles').innerHTML = items.map(([label, value, detail, warn]) =>
    `<div class="tile${warn ? ' alert' : ''}"><div class="k">${escapeHtml(label)}</div><div class="v">${escapeHtml(value)}</div><div class="s">${escapeHtml(detail)}</div></div>`).join('');
  $('#dbg-note').textContent = `DBG ${session.dbg.length}개 · CAP ${session.cap.count * CAP_BATCH}샘플${session.capSegs.length > 1 ? ` (${session.capSegs.length}구간)` : ''}`;
}

// 원시 파형: 위는 lz/ly (가속도, mg), 아래는 gx/gz (자이로, dps). 위쪽 시계열과 같은 시간 창
const waveCanvas = $('#wave');
function drawWave(now) {
  const context = waveCanvas.getContext('2d');
  const { width, height } = fitCanvas(waveCanvas, context);
  context.clearRect(0, 0, width, height);
  const span = +$('#window').value;
  const endTime = sessionTime(now), startTime = endTime - span;
  const pad = { left: 44, right: 8 };
  const toX = (time) => pad.left + ((time - startTime) / span) * (width - pad.left - pad.right);
  const capture = session.cap;
  const valuesPerFrame = CAP_BATCH * CAP_CHANNELS.length;
  // 창 안의 첫 프레임을 찾는다 (시각은 단조 증가에 가깝다 — 구간 경계에서만 약간 겹칠 수 있다)
  let firstFrame = capture.count;
  for (let i = capture.count - 1; i >= 0; i--) { if (capture.times[i] < startTime) break; firstFrame = i; }
  const sampleCount = (capture.count - firstFrame) * CAP_BATCH;
  context.font = '11px ui-monospace, Consolas, monospace';
  if (!sampleCount) {
    context.fillStyle = cssVariable('--ink-soft');
    context.textAlign = 'center';
    context.fillText(!Diagnostics.capOn ? 'CAP 꺼짐' : session.recording || Diagnostics.capIdle ? 'CAPD 대기 중…' : '기록 중에만 받습니다', width / 2, height / 2);
    return;
  }
  const stride = Math.max(1, Math.floor(sampleCount / (width - pad.left - pad.right) / 2));
  const panes = [
    { top: 6, height: height / 2 - 12, channels: [[0, '--accent'], [1, '--warn']], scale: 10, unit: 'mg' },
    { top: height / 2 + 6, height: height / 2 - 12, channels: [[2, '--good'], [3, '--mark']], scale: 10, unit: 'dps' },
  ];
  for (const pane of panes) {
    let peak = 1;
    for (let i = firstFrame; i < capture.count; i++) {
      for (const [channel] of pane.channels) {
        for (let sampleIndex = 0; sampleIndex < CAP_BATCH; sampleIndex++) peak = Math.max(peak, Math.abs(capture.values[i * valuesPerFrame + sampleIndex * 4 + channel]));
      }
    }
    const toY = (value) => pane.top + pane.height / 2 - (value / peak) * (pane.height / 2);
    context.strokeStyle = cssVariable('--line');
    context.lineWidth = 1;
    context.beginPath(); context.moveTo(pad.left, toY(0)); context.lineTo(width - pad.right, toY(0)); context.stroke();
    context.fillStyle = cssVariable('--ink-soft');
    context.textAlign = 'right';
    context.fillText(`${Math.round(peak / pane.scale)}`, pad.left - 4, pane.top + 10);
    context.fillText(pane.unit, pad.left - 4, toY(0) + 4);
    context.fillText(`-${Math.round(peak / pane.scale)}`, pad.left - 4, pane.top + pane.height);
    for (const [channel, color] of pane.channels) {
      context.strokeStyle = cssVariable(color);
      context.lineWidth = 1.2;
      context.beginPath();
      let started = false, sampleNumber = 0, previousSeq = -1, previousSegment = -1;
      for (let i = firstFrame; i < capture.count; i++) {
        // seq 가 끊긴 곳(유실·구간 경계)은 선을 잇지 않는다
        if (capture.segments[i] !== previousSegment || capture.seq[i] !== previousSeq + 1) started = false;
        previousSegment = capture.segments[i]; previousSeq = capture.seq[i];
        for (let sampleIndex = 0; sampleIndex < CAP_BATCH; sampleIndex++, sampleNumber++) {
          if (sampleNumber % stride) continue;
          const x = toX(capture.times[i] + sampleIndex / CAP_RATE_HZ), y = toY(capture.values[i * valuesPerFrame + sampleIndex * 4 + channel]);
          started ? context.lineTo(x, y) : context.moveTo(x, y);
          started = true;
        }
      }
      context.stroke();
    }
  }
  // 표시 위치
  for (const entry of session.marks) {
    if (entry.t < startTime) continue;
    context.strokeStyle = cssVariable(entry.kind === 'manual' ? '--mark' : '--bad');
    context.setLineDash(entry.kind === 'manual' ? [] : [2, 3]);
    context.beginPath(); context.moveTo(toX(entry.t), 0); context.lineTo(toX(entry.t), height); context.stroke();
  }
  context.setLineDash([]);
}

// ---------------- 속도 추정 비교 ----------------
// 방법마다 선 하나 + 아래 띠에 '새 추정값이 나온 순간' 눈금. 값은 계산할 수 있게 된 시각에 찍는다.
// 계열 key 는 속도 측정 방식 설정값(rpmSource: zc·teo·comb)과 같은 이름이다
const EST_SERIES = [
  { key: 'workout', name: '페달 avg_rpm (WORKOUT)', color: '--s-workout', rate: '1초마다' },
  { key: 'turn', name: '페달 회전 확정 (DBG)', color: '--s-turn', rate: '회전마다 · 0.5초 폴링' },
  // eslint-disable-next-line id-length -- 속도 측정 방식 설정값(rpmSource) 이름
  { key: 'game', name: `게임 ③ (지금 공을 움직이는 값 · ${{ zc: '파형 영교차', comb: '파형 결합', teo: '파형 모양', pedal: '페달 avg_rpm' }[config.rpmSource]})`, color: '--s-game', rate: '연속' },
  { key: 'zc', name: 'lz 영교차', color: '--s-zc', rate: '반 바퀴마다' },
  { key: 'teo', name: 'lz 파형 모양 (TEO 0.5초)', color: '--s-teo', rate: 'CAPD 마다 (20Hz)' },
  { key: 'comb', name: 'lz 결합', color: '--s-comb', rate: 'CAPD 마다 (20Hz)' },
];
const seriesShown = Object.fromEntries(EST_SERIES.map((series) => [series.key, true]));
$('#est-legend').innerHTML = EST_SERIES.map((series) =>
  `<label><input type="checkbox" data-key="${series.key}" checked><i style="background:var(${series.color})"></i>${escapeHtml(series.name)}</label>`).join('');
$('#est-legend').onchange = (event) => (seriesShown[event.target.dataset.key] = event.target.checked);

// 계열마다 [현재 값, 마지막 갱신 뒤 지난 초]
function currentEstimates(now) {
  const time = sessionTime(now);
  const lastFrame = lastWorkout();
  const turn = session.turns[session.turns.length - 1];
  // Estimator.last 는 묶음이 바뀌어도 남아 있으므로, 이번 묶음에 추정값이 쌓인 뒤에만 쓴다
  const estimate = session.est.length ? Estimator.last : null;
  const lastZcUpdate = session.zcUpd[session.zcUpd.length - 1];
  const sample = session.samples[session.samples.length - 1];
  return {
    workout: lastFrame && [lastFrame.rpm, time - lastFrame.t],
    turn: turn && [turn.v, time - turn.t],
    game: sample && [sample.game, 0],
    // eslint-disable-next-line id-length -- 속도 측정 방식 설정값(rpmSource) 이름
    zc: estimate && [estimate.zc, lastZcUpdate ? time - lastZcUpdate.t : null],
    teo: estimate && [estimate.teo, time - estimate.time],
    comb: estimate && [estimate.comb, time - estimate.time],
  };
}

function drawEstimates(now) {
  const estCanvas = $('#est-chart');
  const context = estCanvas.getContext('2d');
  const { width, height } = fitCanvas(estCanvas, context);
  context.clearRect(0, 0, width, height);
  const span = +$('#est-window').value;
  const endTime = sessionTime(now), startTime = endTime - span;
  const rows = EST_SERIES.filter((series) => seriesShown[series.key]);
  const stripHeight = 14 * rows.length + 6;
  const pad = { left: 56, right: 8, top: 8, bottom: 20 + stripHeight };
  const plotBottom = height - pad.bottom;
  const toX = (time) => pad.left + ((time - startTime) / span) * (width - pad.left - pad.right);

  // 각 방법의 (갱신 시각, 값) 목록
  const estimates = session.est.filter((estimate) => estimate.t >= startTime - 2);
  const points = {
    workout: session.frames.filter((frame) => frame.kind === 'workout' && frame.t >= startTime - 2).map((frame) => ({ time: frame.t, rpm: frame.rpm })),
    turn: session.turns.filter((turn) => turn.t >= startTime - 10).map((turn) => ({ time: turn.t, rpm: turn.v })),
    game: session.samples.filter((sample) => sample.t >= startTime - 2).map((sample) => ({ time: sample.t, rpm: sample.game })),
    // eslint-disable-next-line id-length -- 속도 측정 방식 설정값(rpmSource) 이름
    zc: estimates.map((estimate) => ({ time: estimate.t, rpm: estimate.zc })),
    teo: estimates.map((estimate) => ({ time: estimate.t, rpm: estimate.teo })),
    comb: estimates.map((estimate) => ({ time: estimate.t, rpm: estimate.comb })),
  };
  // 각 방법이 새 값을 낸 시각
  const estimateTimes = estimates.map((estimate) => estimate.t);
  const updateTimes = {
    workout: points.workout.map((point) => point.time), turn: points.turn.map((point) => point.time), game: [],
    // eslint-disable-next-line id-length -- 속도 측정 방식 설정값(rpmSource) 이름
    zc: session.zcUpd.filter((update) => update.t >= startTime).map((update) => update.t),
    teo: estimateTimes, comb: estimateTimes,
  };

  let maxRpm = 60;
  for (const series of rows) for (const point of points[series.key]) if (point.time >= startTime && point.rpm > maxRpm) maxRpm = point.rpm;
  maxRpm = Math.ceil(maxRpm / 20) * 20;
  const toY = (rpm) => plotBottom - (rpm / maxRpm) * (plotBottom - pad.top);

  context.font = '11px ui-monospace, Consolas, monospace';
  context.strokeStyle = cssVariable('--bg');
  context.fillStyle = cssVariable('--ink-soft');
  context.lineWidth = 1;
  context.textAlign = 'right';
  for (let rpm = 0; rpm <= maxRpm; rpm += 10) {
    context.beginPath(); context.moveTo(pad.left, toY(rpm)); context.lineTo(width - pad.right, toY(rpm)); context.stroke();
    if (rpm % 20 === 0) context.fillText(rpm, pad.left - 4, toY(rpm) + 4);
  }
  context.textAlign = 'center';
  const step = span <= 20 ? 2 : span <= 60 ? 5 : 10;
  for (let second = Math.ceil(startTime / step) * step; second <= endTime; second += step) {
    if (second < 0) continue;
    context.beginPath(); context.moveTo(toX(second), pad.top); context.lineTo(toX(second), plotBottom + stripHeight); context.stroke();
    context.fillText(`${second}s`, toX(second), height - 5);
  }
  // 표시 (놓침 등)
  for (const entry of session.marks) {
    if (entry.t < startTime) continue;
    context.strokeStyle = cssVariable(entry.kind === 'manual' ? '--mark' : '--bad');
    context.setLineDash(entry.kind === 'manual' ? [] : [2, 3]);
    context.beginPath(); context.moveTo(toX(entry.t), pad.top); context.lineTo(toX(entry.t), plotBottom); context.stroke();
  }
  context.setLineDash([]);

  context.save();
  context.beginPath(); context.rect(pad.left, pad.top, width - pad.left - pad.right, plotBottom - pad.top); context.clip();
  for (const series of rows) {
    const seriesPoints = points[series.key];
    if (!seriesPoints.length) continue;
    const color = cssVariable(series.color);
    context.strokeStyle = color;
    context.lineWidth = series.key === 'comb' ? 3 : series.key === 'teo' ? 1.2 : 2;
    context.beginPath();
    // 갱신 사이에는 값이 그대로 유지되므로 계단으로 그린다 (연속 계열은 촘촘해서 사실상 선이 된다)
    seriesPoints.forEach((point, i) => {
      if (i === 0) context.moveTo(toX(point.time), toY(point.rpm));
      else { context.lineTo(toX(point.time), toY(seriesPoints[i - 1].rpm)); context.lineTo(toX(point.time), toY(point.rpm)); }
    });
    context.lineTo(toX(endTime), toY(seriesPoints[seriesPoints.length - 1].rpm));
    context.stroke();
    // 띄엄띄엄 갱신되는 방법은 갱신 순간에 점
    if (series.key === 'workout' || series.key === 'turn' || series.key === 'zc') {
      context.fillStyle = color;
      const dots = series.key === 'zc'
        ? session.zcUpd.filter((update) => update.t >= startTime - 2).map((update) => ({ time: update.t, rpm: update.v }))
        : seriesPoints;
      for (const point of dots) {
        context.beginPath(); context.arc(toX(point.time), toY(point.rpm), 3, 0, Math.PI * 2); context.fill();
      }
    }
  }
  context.restore();

  // 갱신 시점 띠
  context.textAlign = 'left';
  rows.forEach((series, i) => {
    const y = plotBottom + 6 + i * 14;
    context.fillStyle = cssVariable('--bg');
    context.fillRect(pad.left, y, width - pad.left - pad.right, 11);
    context.strokeStyle = cssVariable(series.color);
    context.lineWidth = 1.5;
    context.beginPath();
    for (const time of updateTimes[series.key]) {
      if (time < startTime) continue;
      context.moveTo(toX(time), y); context.lineTo(toX(time), y + 11);
    }
    context.stroke();
    if (series.key === 'game') {
      context.fillStyle = cssVariable(series.color);
      context.fillRect(pad.left, y + 4, width - pad.left - pad.right, 3);
    }
    context.fillStyle = cssVariable('--ink-soft');
    context.textAlign = 'right';
    context.fillText(series.key, pad.left - 4, y + 9);
  });

  // 현재 값 표
  const current = currentEstimates(now);
  $('#est-tiles').innerHTML = EST_SERIES.map((series) => {
    const entry = current[series.key];
    const age = entry && entry[1] != null && series.key !== 'game' ? `${entry[1].toFixed(1)}초 전 갱신` : '';
    return `<div class="tile est-tile" style="border-left:4px solid var(${series.color})"><div class="k">${escapeHtml(series.name)}</div><div class="v">${entry ? formatNumber(entry[0], 1) : '-'}</div><div class="s">${escapeHtml(series.rate)}${age ? ' · ' + age : ''}</div></div>`;
  }).join('');
}

// ---------------- 루프 ----------------
let lastFrameAt = performance.now();
let lastSampleAt = 0;
function loop(now) {
  const deltaSeconds = Math.min(0.1, (now - lastFrameAt) / 1000);
  lastFrameAt = now;
  const game = pedal.sensorOn ? pedal.update(deltaSeconds) : 0; // 게임 루프와 같은 호출
  if (pedal.sensorOn && now - lastSampleAt >= SAMPLE_MS) {
    session.samples.push({
      t: Math.round(sessionTime(now) * 1000) / 1000, // eslint-disable-line id-length -- 저장된 기록 형식
      game: Math.round(game * 100) / 100,
    });
    lastSampleAt = now;
  }
  checkEdge(game);
  Diagnostics.tick(now);
  if (!frozen) {
    renderTiles(now, game);
    renderBall(game);
    drawChart(now);
    drawWave(now);
    drawEstimates(now);
    if (dirty.dbg) { renderDbg(); dirty.dbg = false; }
    if (dirty.frames) { renderFrames(); dirty.frames = false; }
    if (dirty.raw) { renderRaw(); dirty.raw = false; }
  }
  requestAnimationFrame(loop);
}
renderRecording();
renderDbg();
renderSessions();
requestAnimationFrame(loop);
