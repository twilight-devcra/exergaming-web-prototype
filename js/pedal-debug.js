// 페달 센서 디버그 페이지 (pedal-debug.html).
// 게임과 같은 PedalLink·Pedal을 그대로 써서, 페달이 보낸 원본 알림부터 게임이 실제로 쓰는 RPM까지 단계별로 보여준다.
//  ① WORKOUT 프레임의 avg_rpm → ② Pedal.sensorFrame()의 0 유예를 거친 값 → ③ Pedal.update()로 다듬은 값
// rev_count 기준 RPM은 게임이 쓰지 않는 참고값이다. 느리게 밟을 때 avg_rpm과 비교하려고 둔다.
// 기록은 브라우저(IndexedDB)에 계속 저장되므로, 회전을 놓친 순간에 표시를 남겨두고 나중에 파일로 꺼내 볼 수 있다.
const $ = (s) => document.querySelector(s);

const REV_WINDOW_MS = 5000;  // rev_count 기준 RPM을 계산할 구간
const SAMPLE_MS = 100;       // ③을 기록하는 간격
const MAX_ROWS = 300;        // 표·원본 로그에 그리는 최대 줄 수 (기록 자체는 모두 남긴다)
const AUTOSAVE_MS = 5000;

const cfg = Config.load();
const link = new PedalLink();
const pedal = new Pedal();

// 화면에 보이는 데이터 묶음. t는 모두 이 묶음이 시작된 때부터의 초.
// 저장은 '기록 시작'을 누른 때부터 '기록 중지'를 누를 때까지만 한다 (session.recording).
// 기록 중이 아닐 때도 화면은 똑같이 움직이지만 아무것도 저장되지 않는다.
//  chunks  { t, dir: 'in'|'out', text }
//  frames  { t, gap, raw, rpm, watt, rev, dRev, revRpm, held, zeroRun, note, kind }
//  samples { t, game }
//  marks   { t, kind: 'manual'|'auto', note }
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
  };
  edge = true;
  dirty = { frames: true, raw: true, save: false };
}

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
};

link.onRaw = (text) => {
  session.chunks.push({ t: sec(), dir: 'in', text });
  dirty.raw = dirty.save = true;
};

link.onFrame = (raw, f) => {
  const { frames } = session;
  const t = sec();
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
  };
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
  const data = s === session ? exportData(s) : s;
  return deliver(`pedal-debug-${fileStamp(s.startedAt)}.json`, JSON.stringify(data, null, 1), 'application/json', viaShare);
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
    await link.send(text);
    session.chunks.push({ t: sec(), dir: 'out', text });
    dirty.raw = dirty.save = true;
    $('#send-note').textContent = '';
  } catch (e) {
    $('#send-note').textContent = `실패: ${e.message}`;
  }
};

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
  if (!frozen) {
    renderTiles(now, game);
    renderBall(game);
    drawChart(now);
    if (dirty.frames) { renderFrames(); dirty.frames = false; }
    if (dirty.raw) { renderRaw(); dirty.raw = false; }
  }
  requestAnimationFrame(loop);
}
renderRecording();
renderSessions();
requestAnimationFrame(loop);
