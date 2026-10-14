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
const $ = (s) => document.querySelector(s);

const DBG_POLL_MS = 500;
const CAP_SEC = 300;         // 펌웨어 상한 RAW_CAP_MAX_SEC
const CAP_RENEW_MS = 280000; // 자동 정지 전에 다시 건다 (다시 걸면 seq 가 0부터 새로 시작한다)
const CAP_BATCH = 5;
const CAP_CH = ['lz', 'ly', 'gx', 'gz'];
const CAP_FS = 100;
// cardio_tool/protocol.py DBG_FIELDS 와 같은 순서
const DBG_FIELDS = ['moving', 'locked_revs', 'status', 'period', 'r_win_mg', 'rev_r_mg', 'lz_mg', 'ly_mg', 'gz_x10',
  'gx_min', 'gx_max', 'rev_cnt', 'reject_cnt', 'relock_cnt', 'avg_rpm', 'torque_x10', 'watt',
  'w_lz_pk_mg', 'w_lz_rms_mg', 'w_ly_rms_mg', 'w_gz_x10', 'w_gx_x10', 'w_r_rms_mg', 'dc_mg'];
const DBG_I = Object.fromEntries(DBG_FIELDS.map((f, i) => [f, i]));
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

const cfg = Config.load();
const link = new PedalLink();
const pedal = new Pedal();
pedal.lzOn = cfg.rpmSource !== 'pedal'; // 게임 메뉴의 '속도 측정 방식'을 따른다

// 화면에 보이는 데이터 묶음. t는 모두 이 묶음이 시작된 때부터의 초.
// 저장은 '기록 시작'을 누른 때부터 '기록 중지'를 누를 때까지만 한다 (session.recording).
// 기록 중이 아닐 때도 화면은 똑같이 움직이지만 아무것도 저장되지 않는다.
//  chunks  { t, dir: 'in'|'out', text }
//  frames  { t, gap, raw, rpm, watt, rev, dRev, revRpm, held, zeroRun, note, kind }
//  samples { t, game }
//  marks   { t, kind: 'manual'|'auto', note }
//  dbg     { t, v: [24 ints] }               DBG 응답
//  cap     CapBuf (메모리) / 저장 형식은 CapBuf.pack()   CAPD 100Hz 파형
//  capSegs { t, sec }                        CAP 시작 응답. 다시 걸 때마다 seq 가 0부터라 구간을 나눈다
//  rs      { min_period: …, … } | null       RS_G 응답
//  est     { t, zc, teo, comb }              lz 기반 케이던스 추정 (js/cadence-est.js), 약 10Hz
//  zcUpd   { t, v }                          영교차 추정이 새로 나온 순간 (반 바퀴마다)
//  turns   { t, v }                          페달 검출기가 회전을 확정한 순간 (DBG rev_cnt 증가, 0.5초 폴링이라 최대 0.5초 늦게 보인다)
// 모든 추정값의 t 는 그 값을 계산할 수 있게 된 시각(= CAPD 도착 시각)이다. 반응 속도를 공정하게 비교하려는 것.
let session;
let t0;
const sec = (t = performance.now()) => (t - t0) / 1000;

function newSession(recording) {
  t0 = performance.now();
  const d = new Date();
  session = {
    id: d.toISOString(),
    startedAt: d.toISOString(),
    endedAt: null, // 기록 중지를 눌러야 채워진다. 비어 있는 채로 저장된 기록은 페이지가 닫혀 끊긴 것
    recording,
    chunks: [], frames: [], samples: [], marks: [],
    dbg: [], cap: new CapBuf(), capSegs: [], rs: lastRs,
    est: [], zcUpd: [], turns: [],
  };
  edge = true;
  dirty = { frames: true, raw: true, save: false };
}

// CAPD 는 초당 100샘플 × 4채널이라 객체 배열로 두면 자동 저장(구조화 복제)이 무거워진다. 형식 배열에 쌓는다.
class CapBuf {
  constructor() {
    this.n = 0;
    this.alloc(1024);
  }
  alloc(cap) {
    const grow = (Old, old, k) => { const a = new Old(cap * k); if (old) a.set(old.subarray(0, this.n * k)); return a; };
    this.t = grow(Float64Array, this.t, 1);     // 프레임 첫 샘플의 시각 (기록 시작부터의 초, seq 로 복원)
    this.seq = grow(Uint32Array, this.seq, 1);
    this.seg = grow(Uint16Array, this.seg, 1);
    this.v = grow(Int16Array, this.v, CAP_BATCH * CAP_CH.length);
    this.cap = cap;
  }
  push(t, seg, seq, vals) {
    if (this.n === this.cap) this.alloc(this.cap * 2);
    const i = this.n++;
    this.t[i] = t; this.seq[i] = seq; this.seg[i] = seg;
    this.v.set(vals, i * vals.length);
  }
  // IndexedDB·JSON 용. 형식 배열은 slice 로 길이에 맞춰 복사한다 (subarray 는 버퍼 전체가 복제된다)
  pack() {
    const W = CAP_BATCH * CAP_CH.length;
    return { n: this.n, t: this.t.slice(0, this.n), seq: this.seq.slice(0, this.n), seg: this.seg.slice(0, this.n), v: this.v.slice(0, this.n * W) };
  }
}
// 저장된 형식(pack 결과, IndexedDB 에서 읽으면 형식 배열 / JSON 이면 일반 배열) → 샘플 순회
function forEachCapSample(c, fn) {
  const W = CAP_BATCH * CAP_CH.length;
  for (let i = 0; i < c.n; i++) {
    for (let k = 0; k < CAP_BATCH; k++) {
      const o = i * W + k * CAP_CH.length;
      fn(c.t[i] + k / CAP_FS, c.v[o], c.v[o + 1], c.v[o + 2], c.v[o + 3], c.seg[i], c.seq[i]);
    }
  }
}

let lastRs = null; // 페달이 바뀌지 않는 한 그대로이므로 새 묶음에도 이어 붙인다
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
  const s = $('#status');
  s.dataset.state = state;
  s.textContent = detail || state;
  $('#btn-connect').textContent = link.wantLink ? '연결 해제' : '페달 연결';
  WakeLock.want(state === 'ready');
  // 연결 상태가 바뀐 것도 기록에 남긴다 (끊김과 놓침이 겹치는지 보려고)
  if (session.recording) mark('auto', `연결 상태: ${state}${detail ? ` (${detail})` : ''}`);
  if (state === 'ready' && link.device) session.device = link.device.name;
  Diag.onState(state);
};

link.onRaw = (text) => {
  // CAPD(초당 20개)·DBG(초당 2개)는 원본 로그를 덮어 버린다. 온전한 알림 하나면 파싱된 저장소에만 남긴다.
  if (/^(CAPD|DBG),[^;]*;$/.test(text)) return;
  session.chunks.push({ t: sec(), dir: 'in', text });
  dirty.raw = dirty.save = true;
};

link.onFrame = (raw, f) => {
  const { frames } = session;
  const t = sec();
  // 진단 응답은 프레임 표에 섞지 않고 따로 쌓는다
  if (f && Diag.frame(f, t)) return;
  dirty.frames = dirty.save = true;
  if (f && f.name === 'VER') {
    session.firmware = f.values.join(' ');
    $('#fw').textContent = `fw ${session.firmware}`;
  }
  if (!f || f.name !== 'WORKOUT') {
    frames.push({ t, raw, kind: 'other', note: f ? `${f.name} 프레임` : '파싱 실패' });
    return;
  }
  const w = FrameCodec.workout(f);
  const prev = lastWorkout();
  const gap = prev ? Math.round((t - prev.t) * 1000) : null;
  if (!w) {
    frames.push({ t, gap, raw, kind: 'bad', note: '형식 오류 (무시됨)' });
    return;
  }
  const heldBefore = pedal.sensorRpm;
  pedal.sensorFrame(w.rpm); // 게임과 똑같이 처리
  const held = pedal.sensorRpm;
  const notes = [];
  if (w.rpm === 0 && heldBefore > 0 && held > 0) notes.push(`0 무시 (${pedal.zeroRun}/${Pedal.SENSOR_ZERO_GRACE}) → ${held} 유지`);
  else if (w.rpm === 0 && heldBefore > 0) notes.push('0 유예 초과 → 정지');
  else if (w.rpm === 0) notes.push('정지');
  if (gap != null && gap > 1500) notes.push('간격 김');
  const dRev = prev ? w.revCount - prev.rev : null;
  if (dRev != null && dRev < 0) notes.push('rev_count 감소');
  frames.push({
    t, gap, raw, kind: 'workout',
    rpm: w.rpm, watt: w.watt, rev: w.revCount, dRev,
    revRpm: revRpmAt(t, w.revCount),
    held, zeroRun: pedal.zeroRun, note: notes.join(' · '),
  });

  // 회전을 놓쳤을 수 있는 순간은 자동으로 표시해 둔다
  if (w.rpm === 0 && dRev > 0) mark('auto', `rev_count가 ${dRev} 늘었는데 rpm 0`);
  if (heldBefore > 0 && held === 0) mark('auto', '② 0으로 떨어짐 (게임은 정지로 봄)');
  if (gap != null && gap > 2500) mark('auto', `프레임 간격 ${gap}ms`);
};

function lastWorkout() {
  const { frames } = session;
  for (let i = frames.length - 1; i >= 0; i--) if (frames[i].kind === 'workout') return frames[i];
  return null;
}

// 최근 REV_WINDOW_MS 안의 가장 오래된 프레임과 비교한 회전 수 기준 RPM
function revRpmAt(t, rev) {
  const { frames } = session;
  let ref = null;
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i];
    if (f.kind !== 'workout') continue;
    if ((t - f.t) * 1000 > REV_WINDOW_MS) break;
    if (f.rev > rev) break; // 카운터가 리셋된 경우 그 이후만 쓴다
    ref = f;
  }
  if (!ref || t - ref.t < 0.5) return null;
  return ((rev - ref.rev) / (t - ref.t)) * 60;
}

function mark(kind, note) {
  if (kind === 'manual' && !session.recording) return;
  session.marks.push({ t: sec(), kind, note });
  dirty.frames = dirty.save = true;
  if (kind === 'manual') {
    const b = $('#btn-mark');
    b.classList.remove('flash');
    void b.offsetWidth;
    b.classList.add('flash');
    Saver.save(); // 직접 남긴 표시는 바로 저장한다
  }
}

// ---------------- 펌웨어 진단 (DBG / CAP / RS_G) ----------------
// 명령은 한 번에 하나씩 보낸다. Web Bluetooth 는 GATT 쓰기가 겹치면 예외를 던진다.
const Cmd = {
  chain: Promise.resolve(),
  send(text, log = true) {
    const run = async () => {
      await link.send(text);
      if (log) {
        session.chunks.push({ t: sec(), dir: 'out', text });
        dirty.raw = dirty.save = true;
      }
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  },
};

// lz 케이던스 추정기에 CAPD 를 순서대로 넣는다. 구간이 바뀌거나 크게 끊기면 처음부터 다시 잡는다.
const Est = {
  lz: new LzCadence(),
  seg: -1,
  frame(v, seg, t) {
    if (seg !== this.seg) this.lz.seq = -1; // 새 캡처 구간: capd() 가 처음부터 잡는다
    this.seg = seg;
    const r = this.lz.capd(v);
    this.last = { t, ...r };
    // 게임과 같은 설정으로 페달에 넣어 '게임 ③' 이 실제 게임과 같은 값이 되게 한다
    // (준비되지 않은 0 은 넣지 않는다 — main.js onPedalFrame 과 같은 규칙)
    if (cfg.rpmSource !== 'pedal' && (r.stopped || r[cfg.rpmSource] > 0)) pedal.lzFrame(r.stopped ? 0 : r[cfg.rpmSource]);
    if (r.zcNew) session.zcUpd.push({ t, v: r.zcFull });
    const est = session.est;
    if (!est.length || t - est[est.length - 1].t >= 0.1 || r.zcNew) {
      est.push({ t, zc: +r.zc.toFixed(2), teo: +r.teo.toFixed(2), comb: +r.comb.toFixed(2) });
    }
  },
  last: null,
};

const Diag = {
  dbgOn: true,
  capOn: true,
  capIdle: true,    // 기록 중이 아닐 때도 받는다 (속도 추정 비교 그래프용)
  dbgBusy: false,
  capAt: 0,         // 마지막으로 CAP 을 건 시각 (performance.now). 0 = 걸려 있지 않음
  prev: null,       // 직전 DBG 값 (자동 표시용)
  lastDbgAt: 0,

  onState(state) {
    if (state === 'ready') {
      this.capAt = 0;
      // VER 는 PedalLink 가 연결 직후 보낸다. 겹치지 않게 조금 뒤에 읽는다
      setTimeout(() => Cmd.send(NUS.command('RS_G')).catch(() => {}), 400);
    } else {
      this.capAt = 0; // 펌웨어는 연결이 끊기면 캡처를 스스로 멈춘다
    }
  },

  // 진단 프레임이면 처리하고 true
  frame(f, t) {
    const ints = (n) => (f.values.length === n && f.values.every((v) => /^-?\d+$/.test(v)) ? f.values.map(Number) : null);
    if (f.name === 'DBG') {
      const v = ints(DBG_FIELDS.length);
      if (!v) return true;
      session.dbg.push({ t, v });
      if (this.prev && v[DBG_I.rev_cnt] > this.prev[DBG_I.rev_cnt] && v[DBG_I.period] > 0) {
        session.turns.push({ t, v: 6000 / v[DBG_I.period] });
      }
      this.lastDbgAt = performance.now();
      this.autoMarks(v);
      this.prev = v;
      dirty.save = true;
      dirty.dbg = true;
      return true;
    }
    if (f.name === 'CAPD') {
      const v = ints(1 + CAP_BATCH * CAP_CH.length);
      if (!v) return true;
      const segs = session.capSegs;
      // CAP 응답보다 CAPD 가 먼저 오는 일은 없지만, 기록 도중에 시작된 캡처를 이어 받는 경우를 위해 구간을 만든다
      if (!segs.length) segs.push({ t: t - (v[0] * CAP_BATCH) / CAP_FS, sec: null });
      const seg = segs.length - 1;
      session.cap.push(segs[seg].t + (v[0] * CAP_BATCH) / CAP_FS, seg, v[0], v.slice(1));
      Est.frame(v, seg, t);
      dirty.save = true;
      return true;
    }
    if (f.name === 'CAP') {
      const v = ints(1);
      if (v && v[0] > 0) session.capSegs.push({ t, sec: v[0] });
      return true;
    }
    if (f.name === 'RS_G') {
      const v = ints(RS_FIELDS.length);
      // 미설정 기기는 'RS_G,0:;' — 펌웨어가 컴파일 기본값을 쓴다는 뜻이다
      lastRs = v ? Object.fromEntries(RS_FIELDS.map((k, i) => [k, v[i]])) : { unset: true };
      session.rs = lastRs;
      dirty.save = dirty.dbg = true;
      return true;
    }
    return false;
  },

  // 검출기가 회전을 기각하거나 다시 락온하는 순간이 '놓침'의 직접 원인이다
  autoMarks(v) {
    const p = this.prev;
    if (!p) return;
    const I = DBG_I;
    const rej = v[I.reject_cnt] - p[I.reject_cnt];
    if (rej > 0) {
      const st = v[I.status];
      mark('auto', `페달 검출기: 회전 기각 ${rej}회 — ${RS_STATUS[st] || st} (${RS_STATUS_KO[st] || '?'}), period ${v[I.period]} = ${fmt(6000 / v[I.period], 1)} rpm, rev_r ${v[I.rev_r_mg]} mg`);
    }
    if (v[I.relock_cnt] > p[I.relock_cnt]) mark('auto', '페달 검출기: 재락온 (감독자 FFT 교차검증)');
    if (p[I.moving] === 1 && v[I.moving] === 0) mark('auto', `페달 검출기: 움직임 없음 판정 (w_r_rms ${v[I.w_r_rms_mg]} mg)`);
    if (p[I.avg_rpm] > 0 && v[I.avg_rpm] === 0) mark('auto', `페달 검출기: 출력 0 (status ${RS_STATUS[v[I.status]]}, locked ${v[I.locked_revs]})`);
  },

  tick(now) {
    if (link.state !== 'ready' || sim.timer) return;
    if (this.dbgOn && !this.dbgBusy && now - this.lastPoll >= DBG_POLL_MS) {
      this.lastPoll = now;
      this.dbgBusy = true;
      Cmd.send(NUS.command('DBG'), false).catch(() => {}).finally(() => (this.dbgBusy = false));
    }
    // 원시 파형은 기록 중에만 받는다 (데이터가 많고, 화면용으로는 DBG 로 충분하다)
    const wantCap = this.capOn && (session.recording || this.capIdle) && !session.stopping;
    if (wantCap && (!this.capAt || now - this.capAt > CAP_RENEW_MS)) {
      this.capAt = now;
      Cmd.send(NUS.command('CAP', [CAP_SEC])).catch(() => (this.capAt = 0));
    } else if (!wantCap && this.capAt) {
      this.stopCap();
    }
  },
  lastPoll: 0,

  stopCap() {
    if (!this.capAt) return Promise.resolve();
    this.capAt = 0;
    return link.state === 'ready' ? Cmd.send(NUS.command('CAP', [0])).catch(() => {}) : Promise.resolve();
  },
};

// ---------------- 저장 (IndexedDB) ----------------
// sessions에는 기록 전체, index에는 목록에 보여줄 요약만 둔다 (목록을 그릴 때 큰 기록을 다 읽지 않으려고)
const Store = {
  db: null,
  open() {
    if (!this.db) {
      this.db = new Promise((res, rej) => {
        const r = indexedDB.open('pedal-debug', 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore('sessions', { keyPath: 'id' });
          r.result.createObjectStore('index', { keyPath: 'id' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return this.db;
  },
  async run(stores, mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction(stores, mode);
      const req = fn(tx);
      tx.oncomplete = () => res(req && req.result);
      tx.onerror = () => rej(tx.error);
    });
  },
  put(s, summary) {
    return this.run(['sessions', 'index'], 'readwrite', (tx) => {
      tx.objectStore('sessions').put(s);
      tx.objectStore('index').put(summary);
    });
  },
  get(id) {
    return this.run(['sessions'], 'readonly', (tx) => tx.objectStore('sessions').get(id));
  },
  list() {
    return this.run(['index'], 'readonly', (tx) => tx.objectStore('index').getAll());
  },
  del(id) {
    return this.run(['sessions', 'index'], 'readwrite', (tx) => {
      tx.objectStore('sessions').delete(id);
      tx.objectStore('index').delete(id);
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
    } catch (e) {
      dirty.save = true;
      $('#save-note').textContent = `저장 실패: ${e.message}`;
    }
  },
};
// 기록 중에는 AUTOSAVE_MS마다, 그리고 탭이 가려질 때 저장한다. 페이지가 갑자기 닫히면 마지막 저장까지만 남는다.
setInterval(() => Saver.save(), AUTOSAVE_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') Saver.save();
});

function summarize(s) {
  const workouts = s.frames.filter((f) => f.kind === 'workout');
  return {
    id: s.id,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    duration: s.endedAt ? (Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 1000 : s.frames.length ? s.frames[s.frames.length - 1].t : 0,
    frames: workouts.length,
    zeros: workouts.filter((f) => f.rpm === 0).length,
    manual: s.marks.filter((m) => m.kind === 'manual').length,
    auto: s.marks.filter((m) => m.kind === 'auto').length,
    dbg: s.dbg ? s.dbg.length : 0,
    cap: s.cap ? s.cap.n * CAP_BATCH : 0,
  };
}

function exportData(s) {
  return {
    id: s.id,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    savedAt: new Date().toISOString(),
    firmware: link.firmware || s.firmware || '',
    device: (link.device && link.device.name) || s.device || '',
    userAgent: navigator.userAgent,
    pedal: { SENSOR_ZERO_GRACE: Pedal.SENSOR_ZERO_GRACE, SENSOR_STALE_MS: Pedal.SENSOR_STALE_MS },
    target: +targetInput.value,
    config: cfg,
    chunks: s.chunks, frames: s.frames, samples: s.samples, marks: s.marks,
    dbgFields: DBG_FIELDS, dbg: s.dbg, rs: s.rs,
    est: s.est, zcUpd: s.zcUpd, turns: s.turns,
    capChannels: CAP_CH, capScale: { acc: 'g × 10000 (0.1 mg)', gyr: 'dps × 10 (0.1 dps)' },
    capSegs: s.capSegs, cap: s.cap instanceof CapBuf ? s.cap.pack() : s.cap,
  };
}

// 형식 배열은 JSON.stringify 하면 {"0":…} 객체가 되므로 일반 배열로 바꾼다
function jsonable(d) {
  if (!d.cap) return d;
  const c = d.cap;
  return { ...d, cap: { n: c.n, t: Array.from(c.t), seq: Array.from(c.seq), seg: Array.from(c.seg), v: Array.from(c.v) } };
}

// 페달 저장소 cardio_tool 의 cap CSV 와 같은 형식 — tools/verify_phase_detector.py --csv 로 재생된다.
// t_s 는 기록 시작부터의 초. CAP 을 다시 건 구간 경계에서는 몇 샘플이 비고, seq 유실 구간도 빈 채로 둔다.
function capCsv(d) {
  const lines = ['t_s,lz_g,ly_g,gx_dps,gz_dps'];
  const rows = [];
  forEachCapSample(d.cap, (t, lz, ly, gx, gz) => rows.push([t, lz, ly, gx, gz]));
  rows.sort((a, b) => a[0] - b[0]);
  for (const r of rows) lines.push(`${r[0].toFixed(4)},${(r[1] / 10000).toFixed(5)},${(r[2] / 10000).toFixed(5)},${(r[3] / 10).toFixed(2)},${(r[4] / 10).toFixed(2)}`);
  return lines.join('\n');
}

// 페달 저장소 cardio_tool 의 dbg CSV 와 같은 형식 (timestamp, epoch_ms, 24필드). t_s 열을 덧붙인다
function dbgCsv(d) {
  const start = Date.parse(d.startedAt);
  const lines = [['timestamp', 'epoch_ms'].concat(DBG_FIELDS, ['t_s']).join(',')];
  for (const r of d.dbg) {
    const ms = Math.round(start + r.t * 1000);
    lines.push([new Date(ms).toISOString(), ms].concat(r.v, [r.t.toFixed(3)]).join(','));
  }
  return lines.join('\n');
}

// ---------------- 내보내기 ----------------
const fileStamp = (iso) => iso.slice(0, 19).replace(/[:T]/g, '-');

function toCsv(s) {
  const cols = ['t', 'gap', 'rpm', 'watt', 'rev', 'dRev', 'revRpm', 'held', 'zeroRun', 'note', 'raw'];
  const esc = (v) => (v == null ? '' : /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = s.frames.map((f) => cols.map((c) => (c === 't' ? f.t.toFixed(3) : c === 'revRpm' && f.revRpm != null ? f.revRpm.toFixed(1) : f[c])));
  // 표시는 같은 열 구성의 줄로 끼워 넣는다 (rpm 칸이 비어 있고 note에 내용)
  for (const m of s.marks) rows.push([m.t.toFixed(3), '', '', '', '', '', '', '', '', `[${m.kind === 'manual' ? '직접 표시' : '자동 표시'}] ${m.note}`, '']);
  rows.sort((a, b) => a[0] - b[0]);
  return '﻿' + [cols.join(',')].concat(rows.map((r) => r.map(esc).join(','))).join('\n');
}

// 태블릿에서는 공유 시트(메신저·메일·드라이브)로 바로 보내는 편이 편하다. 안 되면 내려받기로.
async function deliver(name, text, type, viaShare) {
  if (viaShare) {
    const file = new File([text], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// 저장된 기록은 저장할 때 이미 exportData() 형태로 만들어 둔 것이다
function exportJson(s, viaShare) {
  const data = jsonable(s === session ? exportData(s) : s);
  return deliver(`pedal-debug-${fileStamp(s.startedAt)}.json`, JSON.stringify(data), 'application/json', viaShare);
}

// ---------------- 저장된 기록 목록 ----------------
async function renderSessions() {
  if (!Saver.ok) {
    $('#sessions').innerHTML = '<tr><td class="l" colspan="7">이 브라우저에서는 기록을 저장할 수 없습니다. 내려받기를 쓰세요.</td></tr>';
    return;
  }
  const list = (await Store.list()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const canShare = !!navigator.canShare;
  $('#sessions').innerHTML = list.length ? list.map((s) => {
    const cur = session.recording && s.id === session.id;
    const when = new Date(s.startedAt).toLocaleString();
    const state = cur ? '<b>기록 중</b>' : s.endedAt ? '완료' : '<span title="기록 중지 전에 페이지가 닫혔습니다. 마지막 자동 저장까지만 남아 있습니다.">중간에 끊김</span>';
    return `<tr data-id="${esc(s.id)}">
      <td class="l">${esc(when)}</td><td class="l">${state}</td>
      <td>${fmtDur(s.duration)}</td><td>${s.frames}</td><td>${s.zeros}</td><td>${s.manual} / ${s.auto}</td>
      <td class="l actions">
        ${canShare ? '<button class="btn small" data-act="share">공유</button>' : ''}
        <button class="btn small" data-act="json">JSON</button>
        <button class="btn small" data-act="csv">CSV</button>
        ${s.dbg ? '<button class="btn small" data-act="dbg">DBG CSV</button>' : ''}
        ${s.cap ? '<button class="btn small" data-act="cap">CAP CSV</button>' : ''}
        ${cur ? '' : '<button class="btn small danger" data-act="del">삭제</button>'}
      </td></tr>`;
  }).join('') : '<tr><td class="l" colspan="7">아직 저장된 기록이 없습니다. <b>● 기록 시작</b>을 누르면 그때부터 저장됩니다.</td></tr>';
}

$('#sessions').onclick = async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('tr').dataset.id;
  const act = btn.dataset.act;
  if (act === 'del') {
    if (!confirm('이 기록을 삭제할까요?')) return;
    await Store.del(id);
    renderSessions();
    return;
  }
  // 지금 기록 중인 것은 메모리에 있는 최신 상태로 내보낸다
  const s = session.recording && id === session.id ? session : await Store.get(id);
  if (!s) return;
  if (act === 'share') exportJson(s, true);
  if (act === 'json') exportJson(s, false);
  if (act === 'csv') deliver(`pedal-frames-${fileStamp(s.startedAt)}.csv`, toCsv(s), 'text/csv', false);
  const d = s === session ? exportData(s) : s;
  if (act === 'dbg') deliver(`pedal-dbg-${fileStamp(s.startedAt)}.csv`, dbgCsv(d), 'text/csv', false);
  if (act === 'cap') deliver(`pedal-cap-${fileStamp(s.startedAt)}.csv`, capCsv(d), 'text/csv', false);
};

const fmtDur = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---------------- 화면 꺼짐 방지 ----------------
// 태블릿 화면이 꺼지면 BLE 연결이 끊기거나 알림이 밀릴 수 있어서, 연결되어 있는 동안은 화면을 켜 둔다
const WakeLock = {
  wanted: false,
  lock: null,
  async want(on) {
    this.wanted = on;
    if (!('wakeLock' in navigator)) return;
    if (on && !this.lock && document.visibilityState === 'visible') {
      try {
        this.lock = await navigator.wakeLock.request('screen');
        this.lock.addEventListener('release', () => (this.lock = null));
      } catch (e) {}
    } else if (!on && this.lock) {
      this.lock.release();
    }
  },
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && WakeLock.wanted) WakeLock.want(true);
});

// ---------------- 조작 ----------------
$('#btn-connect').onclick = () => {
  if (sim.timer) sim.stop();
  link.wantLink ? link.disconnect() : link.connect();
};
if (!link.supported) {
  $('#btn-connect').disabled = true;
  link.onState('idle', 'Web Bluetooth를 쓸 수 없습니다 (Chrome·Edge에서 localhost로 열어주세요)');
}

$('#btn-mark').onclick = () => mark('manual', '직접 표시');
document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && !e.repeat && !(e.target instanceof HTMLInputElement)) mark('manual', '직접 표시');
});

$('#btn-freeze').onclick = (e) => {
  frozen = !frozen;
  e.target.setAttribute('aria-pressed', frozen);
  e.target.textContent = frozen ? '화면 멈춤 해제' : '화면 멈춤';
  dirty.frames = dirty.raw = true;
};

// 기록 시작: 화면을 비우고 그 시점부터 저장한다. 기록 중지: 마지막으로 저장하고 기록을 닫는다.
// 중지 후에는 다시 저장하지 않는 새 화면으로 넘어간다 (저장된 기록과 화면이 어긋나지 않게).
async function setRecording(on) {
  if (on === session.recording) return;
  if (on) {
    newSession(true);
    dirty.save = true;
    if (link.firmware) session.firmware = link.firmware;
    if (link.device) session.device = link.device.name;
    mark('auto', `기록 시작 (연결 상태: ${link.state})`);
  } else {
    session.stopping = true; // CAP 정지 응답을 기다리는 동안 루프가 캡처를 다시 걸지 않게
    await Diag.stopCap();
    session.endedAt = new Date().toISOString();
    mark('auto', '기록 중지');
  }
  await Saver.save();
  if (!on) newSession(false);
  renderRecording();
  renderSessions();
}

function renderRecording() {
  const rec = session.recording;
  const b = $('#btn-rec');
  b.textContent = rec ? '■ 기록 중지' : '● 기록 시작';
  b.classList.toggle('on', rec);
  $('#btn-mark').disabled = !rec;
  document.body.classList.toggle('recording', rec);
}

$('#btn-rec').onclick = () => {
  if (session.recording && !confirm('기록을 중지할까요? 지금까지의 기록이 저장됩니다.')) return;
  setRecording(!session.recording);
};

// 기록 중에 실수로 페이지를 닫지 않게 한 번 묻는다
window.addEventListener('beforeunload', (e) => {
  if (!session.recording) return;
  Saver.save();
  e.preventDefault();
  e.returnValue = '';
});

$('#btn-send').onclick = async () => {
  const text = $('#cmd').value;
  try {
    await Cmd.send(text);
    $('#send-note').textContent = '';
  } catch (e) {
    $('#send-note').textContent = `실패: ${e.message}`;
  }
};

$('#opt-dbg').onchange = (e) => (Diag.dbgOn = e.target.checked);
$('#opt-cap').onchange = (e) => (Diag.capOn = e.target.checked);
$('#opt-cap-idle').onchange = (e) => (Diag.capIdle = e.target.checked);

const targetInput = $('#target');
const tolInput = $('#tol');
targetInput.value = cfg.fallbackRpm;
tolInput.value = Math.round(cfg.tolerance * 100);
$('#maxdev').textContent = Math.round(cfg.maxDeviation * 100);
$('#btn-target-avg').onclick = () => {
  const from = sec() - 10;
  const xs = session.samples.filter((s) => s.t >= from && s.game > 0).map((s) => s.game);
  if (xs.length) targetInput.value = Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
};

// ---------------- 시뮬레이터 (?sim) ----------------
// 실제 펌웨어 동작은 모른다. 느린 회전 문제를 재현해 보려고 '1초 창 안에 회전이 끝나지 않으면 0'이라고 가정한 것뿐이다.
// 실제 연결과 같은 경로(notify → 분할 → 파싱)를 타도록 알림을 두 조각으로 나눠 넣는다.
const sim = {
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
      const enc = new TextEncoder();
      link.notify(new DataView(enc.encode(text.slice(0, cut)).buffer));
      link.notify(new DataView(enc.encode(text.slice(cut)).buffer));
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
  $('#sim-toggle').onclick = () => (sim.timer ? sim.stop() : sim.start());
  $('#sim-cadence').oninput = (e) => ($('#sim-cadence-v').textContent = e.target.value);
}

// ---------------- 화면 ----------------
const fmt = (v, d = 0) => (v == null || Number.isNaN(v) ? '-' : v.toFixed(d));

function renderTiles(now, game) {
  const last = lastWorkout();
  $('#v-raw').textContent = last ? last.rpm : '-';
  $('#v-raw-s').textContent = last ? `t=${last.t.toFixed(1)}s` : '마지막 WORKOUT 프레임';
  $('#v-held').textContent = pedal.sensorOn ? pedal.sensorRpm : '-';
  $('#v-held-s').textContent = pedal.zeroRun ? `연속 0: ${pedal.zeroRun} (유예 ${Pedal.SENSOR_ZERO_GRACE})` : `연속 0 유예 ${Pedal.SENSOR_ZERO_GRACE}개`;
  $('#v-game').textContent = fmt(game, 1);
  $('#v-rev').textContent = last ? fmt(last.revRpm, 1) : '-';
  $('#v-rev-s').textContent = `최근 ${REV_WINDOW_MS / 1000}초 Δrev로 계산`;
  $('#v-count').textContent = last ? `${last.rev} / ${last.watt}` : '-';
  $('#v-count-s').textContent = last && last.dRev != null ? `직전 프레임 대비 Δrev ${last.dRev}` : '';
  const age = last ? now - (t0 + last.t * 1000) : null;
  $('#v-age').textContent = age == null ? '-' : `${(age / 1000).toFixed(1)}s`;
  $('#v-age-s').textContent = `${Pedal.SENSOR_STALE_MS / 1000}초 넘으면 게임은 0으로 봄`;
  $('#t-age').classList.toggle('alert', pedal.sensorOn && age != null && age > Pedal.SENSOR_STALE_MS);
  const recent = session.frames.filter((f) => f.kind === 'workout' && f.t >= sec(now) - 30);
  const zeros = recent.filter((f) => f.rpm === 0).length;
  $('#v-zero').textContent = recent.length ? `${Math.round((zeros / recent.length) * 100)}%` : '-';
  $('#v-zero-s').textContent = recent.length ? `${zeros} / ${recent.length} 프레임` : '';
  $('#rec-time').textContent = session.recording ? fmtDur(sec(now)) : '저장 안 함';
  const manual = session.marks.filter((m) => m.kind === 'manual').length;
  $('#v-marks').textContent = `${manual} / ${session.marks.length - manual}`;
}

function renderBall(game) {
  const target = +targetInput.value;
  const tol = (+tolInput.value || 0) / 100;
  if (!(target > 0)) return;
  const dev = (game - target) / target;
  const x = U.clamp(dev / cfg.maxDeviation, -1, 1);
  const pct = (v) => `${50 + v * 50}%`;
  const zone = $('#ball-zone');
  zone.style.left = pct(-tol / cfg.maxDeviation);
  zone.style.right = pct(-tol / cfg.maxDeviation);
  const ball = $('#ball');
  ball.style.left = pct(x);
  ball.classList.toggle('out', Math.abs(dev) > tol);
  $('#dev-text').textContent = `편차 ${(dev * 100).toFixed(1)}%${Math.abs(dev) > tol ? ' · 구역 밖' : ''}${x <= -1 ? ' · 왼쪽 끝' : ''}`;
}

// 공이 왼쪽 끝에 닿는 순간도 자동으로 표시한다 (목표 RPM 기준이라 목표를 맞게 넣어야 의미가 있다)
function checkEdge(game) {
  const target = +targetInput.value;
  if (!pedal.sensorOn || !(target > 0)) return;
  const atEdge = (game - target) / target <= -cfg.maxDeviation;
  if (atEdge && !edge) mark('auto', `공 왼쪽 끝 (③ ${game.toFixed(1)}, 목표 ${target})`);
  edge = atEdge;
}

function renderFrames() {
  const { frames, marks } = session;
  const rows = frames.slice(-MAX_ROWS);
  const from = rows.length ? rows[0].t : 0;
  const items = rows.concat(marks.filter((m) => m.t >= from).map((m) => ({ ...m, kind: 'mark', manual: m.kind === 'manual' })));
  items.sort((a, b) => b.t - a.t);
  $('#frames').innerHTML = items.map((f) => {
    if (f.kind === 'mark') {
      return `<tr class="mark ${f.manual ? 'manual' : ''}"><td>${f.t.toFixed(2)}</td><td colspan="7"></td><td class="l">${f.manual ? '★ 직접 표시' : '▲ ' + esc(f.note)}</td></tr>`;
    }
    if (f.kind !== 'workout') {
      return `<tr class="bad"><td>${f.t.toFixed(2)}</td><td>${f.gap ?? ''}</td><td colspan="6"></td><td class="l">${esc(f.note)}: ${esc(f.raw)}</td></tr>`;
    }
    const cls = f.rpm === 0 ? (f.held > 0 ? 'held' : 'zero') : '';
    return `<tr class="${cls}"><td>${f.t.toFixed(2)}</td><td>${f.gap ?? ''}</td><td>${f.rpm}</td><td>${f.watt}</td><td>${f.rev}</td><td>${f.dRev ?? ''}</td><td>${fmt(f.revRpm, 1)}</td><td>${f.held}</td><td class="l">${esc(f.note)}</td></tr>`;
  }).join('');
  $('#frame-count').textContent = `${frames.length}개 기록${frames.length > MAX_ROWS ? ` (최근 ${MAX_ROWS}개 표시)` : ''} · 빨강 = 0 정지, 주황 = 0이지만 유예로 유지`;
}

function renderRaw() {
  const vis = (s) => esc(s).replace(/\n/g, '⏎').replace(/\r/g, '␍');
  $('#raw').innerHTML = session.chunks.slice(-MAX_ROWS).reverse().map((c) =>
    `<span class="t">${c.t.toFixed(3)}</span> ${c.dir === 'out' ? '<span class="out">→ ' + vis(c.text) + '</span>' : '← ' + vis(c.text)}`
  ).join('\n');
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---------------- 그래프 ----------------
const canvas = $('#chart');
const g = canvas.getContext('2d');
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function drawChart(now) {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) {
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = r.height;
  const pad = { l: 36, r: 8, t: 8, b: 20 };
  g.clearRect(0, 0, W, H);

  const span = +$('#window').value;
  const tEnd = sec(now), tStart = tEnd - span;
  const target = +targetInput.value || 0;
  const tol = (+tolInput.value || 0) / 100;
  const vis = session.frames.filter((f) => f.kind === 'workout' && f.t >= tStart);
  let yMax = Math.max(40, target * (1 + cfg.maxDeviation));
  for (const f of vis) yMax = Math.max(yMax, f.rpm, f.revRpm || 0);
  yMax = Math.ceil(yMax / 20) * 20;
  const X = (t) => pad.l + ((t - tStart) / span) * (W - pad.l - pad.r);
  const Y = (v) => H - pad.b - (v / yMax) * (H - pad.t - pad.b);

  // 격자
  g.font = '11px ui-monospace, Consolas, monospace';
  g.fillStyle = css('--ink-soft');
  g.strokeStyle = css('--bg');
  g.lineWidth = 1;
  g.textAlign = 'right';
  for (let v = 0; v <= yMax; v += 20) {
    g.beginPath(); g.moveTo(pad.l, Y(v)); g.lineTo(W - pad.r, Y(v)); g.stroke();
    g.fillText(v, pad.l - 4, Y(v) + 4);
  }
  g.textAlign = 'center';
  const step = span <= 60 ? 10 : span <= 120 ? 20 : 60;
  for (let t = Math.ceil(tStart / step) * step; t <= tEnd; t += step) {
    if (t < 0) continue;
    g.beginPath(); g.moveTo(X(t), pad.t); g.lineTo(X(t), H - pad.b); g.stroke();
    g.fillText(`${t}s`, X(t), H - 5);
  }

  // 허용 구역과 공이 왼쪽 끝에 닿는 선
  if (target > 0) {
    g.fillStyle = css('--good-soft');
    g.fillRect(pad.l, Y(target * (1 + tol)), W - pad.l - pad.r, Y(target * (1 - tol)) - Y(target * (1 + tol)));
    g.setLineDash([4, 4]);
    g.strokeStyle = css('--good');
    hline(Y(target));
    g.strokeStyle = css('--bad');
    hline(Y(target * (1 - cfg.maxDeviation)));
    g.setLineDash([]);
  }
  function hline(y) {
    g.beginPath(); g.moveTo(pad.l, y); g.lineTo(W - pad.r, y); g.stroke();
  }

  g.save();
  g.beginPath();
  g.rect(pad.l, pad.t, W - pad.l - pad.r, H - pad.t - pad.b);
  g.clip();

  // 표시 (직접 = 굵은 보라 실선, 자동 = 가는 빨간 점선)
  for (const m of session.marks) {
    if (m.t < tStart) continue;
    const manual = m.kind === 'manual';
    g.strokeStyle = css(manual ? '--mark' : '--bad');
    g.lineWidth = manual ? 2.5 : 1;
    g.setLineDash(manual ? [] : [2, 3]);
    g.beginPath(); g.moveTo(X(m.t), pad.t); g.lineTo(X(m.t), H - pad.b); g.stroke();
  }
  g.setLineDash([]);

  // rev_count 기준
  g.strokeStyle = css('--good');
  g.lineWidth = 1.5;
  g.beginPath();
  let started = false;
  for (const f of vis) {
    if (f.revRpm == null) { started = false; continue; }
    started ? g.lineTo(X(f.t), Y(f.revRpm)) : g.moveTo(X(f.t), Y(f.revRpm));
    started = true;
  }
  g.stroke();

  // ② 0 유예 후 (계단)
  g.strokeStyle = css('--warn');
  g.lineWidth = 2;
  g.beginPath();
  vis.forEach((f, i) => {
    if (i === 0) g.moveTo(X(f.t), Y(f.held));
    else { g.lineTo(X(f.t), Y(vis[i - 1].held)); g.lineTo(X(f.t), Y(f.held)); }
  });
  if (vis.length) g.lineTo(X(tEnd), Y(vis[vis.length - 1].held));
  g.stroke();

  // ③ 게임 RPM
  g.strokeStyle = css('--accent');
  g.lineWidth = 2.5;
  g.beginPath();
  started = false;
  for (const s of session.samples) {
    if (s.t < tStart) continue;
    started ? g.lineTo(X(s.t), Y(s.game)) : g.moveTo(X(s.t), Y(s.game));
    started = true;
  }
  g.stroke();

  // ① 원본 avg_rpm
  for (const f of vis) {
    g.fillStyle = f.rpm === 0 ? css('--bad') : css('--ink');
    g.beginPath(); g.arc(X(f.t), Y(f.rpm), 3.5, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// ---------------- 펌웨어 진단 화면 ----------------
function renderDbg() {
  const last = session.dbg[session.dbg.length - 1];
  const rs = session.rs;
  const rsText = !rs ? 'RS_G 응답 없음' : rs.unset ? 'RS_G 미설정 — 펌웨어 컴파일 기본값 사용 중'
    : `정지 판정: 락온 전 ${rs.max_period / 100}s (= ${fmt(6000 / rs.max_period, 1)} rpm) 넘게 회전 없음 · 락온 후 직전 주기의 ${rs.ratio_max / 1000}배 · `
      + `주기 급변 허용 ${rs.ratio_min / 1000}~${rs.ratio_max / 1000}배 · 진폭 하한 rev_r_min ${rs.rev_r_min_mg} mg · 움직임 하한 ${rs.motion_min_mg} mg · `
      + `저진폭 ${rs.stall_windows}창 연속이면 즉시 정지 · 락온 ${rs.lock_revs}회전`;
  $('#rs-text').textContent = rsText;
  if (!last) return;
  const v = last.v, I = DBG_I;
  const st = v[I.status];
  const items = [
    ['moving', v[I.moving] ? '1 (움직임)' : '0 (정지)', `w_r_rms ${v[I.w_r_rms_mg]} mg`, !v[I.moving]],
    ['status', `${st} ${RS_STATUS[st] || ''}`, RS_STATUS_KO[st] || '', st !== 0 && st !== 5],
    ['locked_revs', v[I.locked_revs], '연속 유효 회전'],
    ['period', `${v[I.period]}`, v[I.period] ? `${(v[I.period] / 100).toFixed(2)}s = ${fmt(6000 / v[I.period], 1)} rpm` : ''],
    ['rev_r_mg', v[I.rev_r_mg], rs && !rs.unset ? `하한 ${rs.rev_r_min_mg} mg` : '마지막 회전 진폭', rs && !rs.unset && v[I.rev_r_mg] < rs.rev_r_min_mg],
    ['avg_rpm', v[I.avg_rpm], '검출기 출력 (EMA)', v[I.avg_rpm] === 0],
    ['torque_x10', v[I.torque_x10], `gz_x10 ${v[I.gz_x10]} (회전당 원시)`],
    ['watt', v[I.watt], ''],
    ['rev / reject / relock', `${v[I.rev_cnt]} / ${v[I.reject_cnt]} / ${v[I.relock_cnt]}`, '누적'],
    ['gx min / max', `${v[I.gx_min]} / ${v[I.gx_max]}`, 'dps, 마지막 회전'],
  ];
  $('#dbg-tiles').innerHTML = items.map(([k, val, sub, warn]) =>
    `<div class="tile${warn ? ' alert' : ''}"><div class="k">${esc(k)}</div><div class="v">${esc(val)}</div><div class="s">${esc(sub)}</div></div>`).join('');
  $('#dbg-note').textContent = `DBG ${session.dbg.length}개 · CAP ${session.cap.n * CAP_BATCH}샘플${session.capSegs.length > 1 ? ` (${session.capSegs.length}구간)` : ''}`;
}

// 원시 파형: 위는 lz/ly (가속도, mg), 아래는 gx/gz (자이로, dps). 위쪽 시계열과 같은 시간 창
const wave = $('#wave');
const wg = wave.getContext('2d');
function drawWave(now) {
  const dpr = window.devicePixelRatio || 1;
  const r = wave.getBoundingClientRect();
  if (wave.width !== Math.round(r.width * dpr) || wave.height !== Math.round(r.height * dpr)) {
    wave.width = Math.round(r.width * dpr);
    wave.height = Math.round(r.height * dpr);
  }
  wg.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = r.height;
  wg.clearRect(0, 0, W, H);
  const span = +$('#window').value;
  const tEnd = sec(now), tStart = tEnd - span;
  const pad = { l: 44, r: 8 };
  const X = (t) => pad.l + ((t - tStart) / span) * (W - pad.l - pad.r);
  const c = session.cap;
  const W20 = CAP_BATCH * CAP_CH.length;
  // 창 안의 첫 프레임을 찾는다 (t 는 단조 증가에 가깝다 — 구간 경계에서만 약간 겹칠 수 있다)
  let i0 = c.n;
  for (let i = c.n - 1; i >= 0; i--) { if (c.t[i] < tStart) break; i0 = i; }
  const n = (c.n - i0) * CAP_BATCH;
  wg.font = '11px ui-monospace, Consolas, monospace';
  if (!n) {
    wg.fillStyle = css('--ink-soft');
    wg.textAlign = 'center';
    wg.fillText(!Diag.capOn ? 'CAP 꺼짐' : session.recording || Diag.capIdle ? 'CAPD 대기 중…' : '기록 중에만 받습니다', W / 2, H / 2);
    return;
  }
  const stride = Math.max(1, Math.floor(n / (W - pad.l - pad.r) / 2));
  const panes = [
    { y0: 6, h: H / 2 - 12, ch: [[0, '--accent'], [1, '--warn']], scale: 10, unit: 'mg' },
    { y0: H / 2 + 6, h: H / 2 - 12, ch: [[2, '--good'], [3, '--mark']], scale: 10, unit: 'dps' },
  ];
  for (const p of panes) {
    let m = 1;
    for (let i = i0; i < c.n; i++) for (const [k] of p.ch) for (let s2 = 0; s2 < CAP_BATCH; s2++) m = Math.max(m, Math.abs(c.v[i * W20 + s2 * 4 + k]));
    const Y = (v) => p.y0 + p.h / 2 - (v / m) * (p.h / 2);
    wg.strokeStyle = css('--line');
    wg.lineWidth = 1;
    wg.beginPath(); wg.moveTo(pad.l, Y(0)); wg.lineTo(W - pad.r, Y(0)); wg.stroke();
    wg.fillStyle = css('--ink-soft');
    wg.textAlign = 'right';
    wg.fillText(`${Math.round(m / p.scale)}`, pad.l - 4, p.y0 + 10);
    wg.fillText(p.unit, pad.l - 4, Y(0) + 4);
    wg.fillText(`-${Math.round(m / p.scale)}`, pad.l - 4, p.y0 + p.h);
    for (const [k, color] of p.ch) {
      wg.strokeStyle = css(color);
      wg.lineWidth = 1.2;
      wg.beginPath();
      let started = false, cnt = 0, prevSeq = -1, prevSeg = -1;
      for (let i = i0; i < c.n; i++) {
        // seq 가 끊긴 곳(유실·구간 경계)은 선을 잇지 않는다
        if (c.seg[i] !== prevSeg || c.seq[i] !== prevSeq + 1) started = false;
        prevSeg = c.seg[i]; prevSeq = c.seq[i];
        for (let s2 = 0; s2 < CAP_BATCH; s2++, cnt++) {
          if (cnt % stride) continue;
          const x = X(c.t[i] + s2 / CAP_FS), y = Y(c.v[i * W20 + s2 * 4 + k]);
          started ? wg.lineTo(x, y) : wg.moveTo(x, y);
          started = true;
        }
      }
      wg.stroke();
    }
  }
  // 표시 위치
  for (const mk of session.marks) {
    if (mk.t < tStart) continue;
    wg.strokeStyle = css(mk.kind === 'manual' ? '--mark' : '--bad');
    wg.setLineDash(mk.kind === 'manual' ? [] : [2, 3]);
    wg.beginPath(); wg.moveTo(X(mk.t), 0); wg.lineTo(X(mk.t), H); wg.stroke();
  }
  wg.setLineDash([]);
}

// ---------------- 속도 추정 비교 ----------------
// 방법마다 선 하나 + 아래 띠에 '새 추정값이 나온 순간' 눈금. 값은 계산할 수 있게 된 시각에 찍는다.
const EST_SERIES = [
  { key: 'workout', name: '페달 avg_rpm (WORKOUT)', color: '--s-workout', rate: '1초마다' },
  { key: 'turn', name: '페달 회전 확정 (DBG)', color: '--s-turn', rate: '회전마다 · 0.5초 폴링' },
  { key: 'game', name: `게임 ③ (지금 공을 움직이는 값 · ${{ zc: '파형 영교차', comb: '파형 결합', teo: '파형 모양', pedal: '페달 avg_rpm' }[cfg.rpmSource]})`, color: '--s-game', rate: '연속' },
  { key: 'zc', name: 'lz 영교차', color: '--s-zc', rate: '반 바퀴마다' },
  { key: 'teo', name: 'lz 파형 모양 (TEO 0.5초)', color: '--s-teo', rate: 'CAPD 마다 (20Hz)' },
  { key: 'comb', name: 'lz 결합', color: '--s-comb', rate: 'CAPD 마다 (20Hz)' },
];
const estShow = Object.fromEntries(EST_SERIES.map((s) => [s.key, true]));
$('#est-legend').innerHTML = EST_SERIES.map((s) =>
  `<label><input type="checkbox" data-key="${s.key}" checked><i style="background:var(${s.color})"></i>${esc(s.name)}</label>`).join('');
$('#est-legend').onchange = (e) => (estShow[e.target.dataset.key] = e.target.checked);

function estNow(now) {
  const t = sec(now);
  const lastW = lastWorkout();
  const turn = session.turns[session.turns.length - 1];
  // Est.last 는 묶음이 바뀌어도 남아 있으므로, 이번 묶음에 추정값이 쌓인 뒤에만 쓴다
  const e = session.est.length ? Est.last : null;
  const zcU = session.zcUpd[session.zcUpd.length - 1];
  const g = session.samples[session.samples.length - 1];
  return {
    workout: lastW && [lastW.rpm, t - lastW.t],
    turn: turn && [turn.v, t - turn.t],
    game: g && [g.game, 0],
    zc: e && [e.zc, zcU ? t - zcU.t : null],
    teo: e && [e.teo, t - e.t],
    comb: e && [e.comb, t - e.t],
  };
}

function drawEst(now) {
  const cv = $('#est-chart');
  const g = cv.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) {
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = r.height;
  g.clearRect(0, 0, W, H);
  const span = +$('#est-window').value;
  const tEnd = sec(now), tStart = tEnd - span;
  const rows = EST_SERIES.filter((s) => estShow[s.key]);
  const stripH = 14 * rows.length + 6;
  const pad = { l: 56, r: 8, t: 8, b: 20 + stripH };
  const plotB = H - pad.b;
  const X = (t) => pad.l + ((t - tStart) / span) * (W - pad.l - pad.r);

  // 각 방법의 (갱신 시각, 값) 목록
  const est = session.est.filter((p) => p.t >= tStart - 2);
  const src = {
    workout: session.frames.filter((f) => f.kind === 'workout' && f.t >= tStart - 2).map((f) => ({ t: f.t, v: f.rpm })),
    turn: session.turns.filter((p) => p.t >= tStart - 10),
    game: session.samples.filter((p) => p.t >= tStart - 2).map((p) => ({ t: p.t, v: p.game })),
    zc: est.map((p) => ({ t: p.t, v: p.zc })),
    teo: est.map((p) => ({ t: p.t, v: p.teo })),
    comb: est.map((p) => ({ t: p.t, v: p.comb })),
  };
  const ticks = {
    workout: src.workout, turn: src.turn, game: [], zc: session.zcUpd.filter((p) => p.t >= tStart),
    teo: est, comb: est,
  };

  let yMax = 60;
  for (const s of rows) for (const p of src[s.key]) if (p.t >= tStart && p.v > yMax) yMax = p.v;
  yMax = Math.ceil(yMax / 20) * 20;
  const Y = (v) => plotB - (v / yMax) * (plotB - pad.t);

  g.font = '11px ui-monospace, Consolas, monospace';
  g.strokeStyle = css('--bg');
  g.fillStyle = css('--ink-soft');
  g.lineWidth = 1;
  g.textAlign = 'right';
  for (let v = 0; v <= yMax; v += 10) {
    g.beginPath(); g.moveTo(pad.l, Y(v)); g.lineTo(W - pad.r, Y(v)); g.stroke();
    if (v % 20 === 0) g.fillText(v, pad.l - 4, Y(v) + 4);
  }
  g.textAlign = 'center';
  const step = span <= 20 ? 2 : span <= 60 ? 5 : 10;
  for (let t = Math.ceil(tStart / step) * step; t <= tEnd; t += step) {
    if (t < 0) continue;
    g.beginPath(); g.moveTo(X(t), pad.t); g.lineTo(X(t), plotB + stripH); g.stroke();
    g.fillText(`${t}s`, X(t), H - 5);
  }
  // 표시 (놓침 등)
  for (const m of session.marks) {
    if (m.t < tStart) continue;
    g.strokeStyle = css(m.kind === 'manual' ? '--mark' : '--bad');
    g.setLineDash(m.kind === 'manual' ? [] : [2, 3]);
    g.beginPath(); g.moveTo(X(m.t), pad.t); g.lineTo(X(m.t), plotB); g.stroke();
  }
  g.setLineDash([]);

  g.save();
  g.beginPath(); g.rect(pad.l, pad.t, W - pad.l - pad.r, plotB - pad.t); g.clip();
  for (const s of rows) {
    const pts = src[s.key];
    if (!pts.length) continue;
    const color = css(s.color);
    g.strokeStyle = color;
    g.lineWidth = s.key === 'comb' ? 3 : s.key === 'teo' ? 1.2 : 2;
    g.beginPath();
    // 갱신 사이에는 값이 그대로 유지되므로 계단으로 그린다 (연속 계열은 촘촘해서 사실상 선이 된다)
    pts.forEach((p, i) => {
      if (i === 0) g.moveTo(X(p.t), Y(p.v));
      else { g.lineTo(X(p.t), Y(pts[i - 1].v)); g.lineTo(X(p.t), Y(p.v)); }
    });
    g.lineTo(X(tEnd), Y(pts[pts.length - 1].v));
    g.stroke();
    // 띄엄띄엄 갱신되는 방법은 갱신 순간에 점
    if (s.key === 'workout' || s.key === 'turn' || s.key === 'zc') {
      g.fillStyle = color;
      for (const p of s.key === 'zc' ? session.zcUpd.filter((q) => q.t >= tStart - 2) : pts) {
        g.beginPath(); g.arc(X(p.t), Y(p.v), 3, 0, Math.PI * 2); g.fill();
      }
    }
  }
  g.restore();

  // 갱신 시점 띠
  g.textAlign = 'left';
  rows.forEach((s, i) => {
    const y = plotB + 6 + i * 14;
    g.fillStyle = css('--bg');
    g.fillRect(pad.l, y, W - pad.l - pad.r, 11);
    g.strokeStyle = css(s.color);
    g.lineWidth = 1.5;
    g.beginPath();
    for (const p of ticks[s.key]) {
      if (p.t < tStart) continue;
      g.moveTo(X(p.t), y); g.lineTo(X(p.t), y + 11);
    }
    g.stroke();
    if (s.key === 'game') {
      g.fillStyle = css(s.color);
      g.fillRect(pad.l, y + 4, W - pad.l - pad.r, 3);
    }
    g.fillStyle = css('--ink-soft');
    g.textAlign = 'right';
    g.fillText(s.key, pad.l - 4, y + 9);
  });

  // 현재 값 표
  const cur = estNow(now);
  $('#est-tiles').innerHTML = EST_SERIES.map((s) => {
    const c = cur[s.key];
    const age = c && c[1] != null && s.key !== 'game' ? `${c[1].toFixed(1)}초 전 갱신` : '';
    return `<div class="tile est-tile" style="border-left:4px solid var(${s.color})"><div class="k">${esc(s.name)}</div><div class="v">${c ? fmt(c[0], 1) : '-'}</div><div class="s">${esc(s.rate)}${age ? ' · ' + age : ''}</div></div>`;
  }).join('');
}

// ---------------- 루프 ----------------
let last = performance.now();
let lastSample = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const game = pedal.sensorOn ? pedal.update(dt) : 0; // 게임 루프와 같은 호출
  if (pedal.sensorOn && now - lastSample >= SAMPLE_MS) {
    session.samples.push({ t: Math.round(sec(now) * 1000) / 1000, game: Math.round(game * 100) / 100 });
    lastSample = now;
  }
  checkEdge(game);
  Diag.tick(now);
  if (!frozen) {
    renderTiles(now, game);
    renderBall(game);
    drawChart(now);
    drawWave(now);
    drawEst(now);
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
