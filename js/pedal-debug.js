// 페달 센서 디버그 페이지 (pedal-debug.html).
// 게임과 같은 PedalLink·Pedal을 그대로 써서, 페달이 보낸 원본 알림부터 게임이 실제로 쓰는 RPM까지 단계별로 보여준다.
//  ① WORKOUT 프레임의 avg_rpm → ② Pedal.sensorFrame()의 0 유예를 거친 값 → ③ Pedal.update()로 다듬은 값
// rev_count 기준 RPM은 게임이 쓰지 않는 참고값이다. 느리게 밟을 때 avg_rpm과 비교하려고 둔다.
const $ = (s) => document.querySelector(s);

const REV_WINDOW_MS = 5000;  // rev_count 기준 RPM을 계산할 구간
const SAMPLE_MS = 100;       // ③을 기록하는 간격
const MAX_ROWS = 300;        // 표·원본 로그에 그리는 최대 줄 수 (기록 자체는 모두 남긴다)

const cfg = Config.load();
const link = new PedalLink();
const pedal = new Pedal();
let t0 = performance.now();
const sec = (t = performance.now()) => (t - t0) / 1000;

let chunks = [];  // { t, dir: 'in'|'out', text }
let frames = [];  // { t, gap, raw, rpm, watt, rev, dRev, revRpm, held, zeroRun, note, kind }
let samples = []; // { t, game }
let frozen = false;
let dirty = { frames: true, raw: true };

// ---------------- 수신 ----------------
link.onState = (state, detail) => {
  pedal.setSensor(state === 'ready');
  const s = $('#status');
  s.dataset.state = state;
  s.textContent = detail || state;
  $('#btn-connect').textContent = link.wantLink ? '연결 해제' : '페달 연결';
};

link.onRaw = (text) => {
  chunks.push({ t: sec(), dir: 'in', text });
  dirty.raw = true;
};

link.onFrame = (raw, f) => {
  const now = performance.now();
  const t = sec(now);
  if (f && f.name === 'VER') $('#fw').textContent = `fw ${f.values.join(' ')}`;
  if (!f || f.name !== 'WORKOUT') {
    frames.push({ t, raw, kind: 'other', note: f ? `${f.name} 프레임` : '파싱 실패' });
    dirty.frames = true;
    return;
  }
  const w = FrameCodec.workout(f);
  const prev = lastWorkout();
  const gap = prev ? Math.round((t - prev.t) * 1000) : null;
  if (!w) {
    frames.push({ t, gap, raw, kind: 'bad', note: '형식 오류 (무시됨)' });
    dirty.frames = true;
    return;
  }
  const heldBefore = pedal.sensorRpm;
  pedal.sensorFrame(w.rpm); // 게임과 똑같이 처리
  const held = pedal.sensorRpm;
  let note = '';
  if (w.rpm === 0 && heldBefore > 0 && held > 0) note = `0 무시 (${pedal.zeroRun}/${Pedal.SENSOR_ZERO_GRACE}) → ${held} 유지`;
  else if (w.rpm === 0 && heldBefore > 0) note = '0 유예 초과 → 정지';
  else if (w.rpm === 0) note = '정지';
  if (gap != null && gap > 1500) note = (note ? note + ' · ' : '') + '간격 김';
  const dRev = prev ? w.revCount - prev.rev : null;
  if (dRev != null && dRev < 0) note = (note ? note + ' · ' : '') + 'rev_count 감소';
  frames.push({
    t, gap, raw, kind: 'workout',
    rpm: w.rpm, watt: w.watt, rev: w.revCount, dRev,
    revRpm: revRpmAt(t, w.revCount),
    held, zeroRun: pedal.zeroRun, note,
  });
  dirty.frames = true;
};

function lastWorkout() {
  for (let i = frames.length - 1; i >= 0; i--) if (frames[i].kind === 'workout') return frames[i];
  return null;
}

// 최근 REV_WINDOW_MS 안의 가장 오래된 프레임과 비교한 회전 수 기준 RPM
function revRpmAt(t, rev) {
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

// ---------------- 조작 ----------------
$('#btn-connect').onclick = () => {
  if (sim.timer) sim.stop();
  link.wantLink ? link.disconnect() : link.connect();
};
if (!link.supported) {
  $('#btn-connect').disabled = true;
  link.onState('idle', 'Web Bluetooth를 쓸 수 없습니다 (Chrome·Edge에서 localhost로 열어주세요)');
}

$('#btn-freeze').onclick = (e) => {
  frozen = !frozen;
  e.target.setAttribute('aria-pressed', frozen);
  e.target.textContent = frozen ? '화면 멈춤 해제' : '화면 멈춤';
  dirty = { frames: true, raw: true };
};

$('#btn-clear').onclick = () => {
  t0 = performance.now();
  chunks = [];
  frames = [];
  samples = [];
  dirty = { frames: true, raw: true };
};

$('#btn-send').onclick = async () => {
  const text = $('#cmd').value;
  try {
    await link.send(text);
    chunks.push({ t: sec(), dir: 'out', text });
    dirty.raw = true;
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
  const xs = samples.filter((s) => s.t >= from && s.game > 0).map((s) => s.game);
  if (xs.length) targetInput.value = Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
};

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

$('#btn-csv').onclick = () => {
  const cols = ['t', 'gap', 'rpm', 'watt', 'rev', 'dRev', 'revRpm', 'held', 'zeroRun', 'note', 'raw'];
  const esc = (v) => (v == null ? '' : /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = [cols.join(',')].concat(frames.map((f) => cols.map((c) => esc(c === 't' ? f.t.toFixed(3) : c === 'revRpm' && f.revRpm != null ? f.revRpm.toFixed(1) : f[c])).join(',')));
  download(`pedal-frames-${stamp()}.csv`, '﻿' + lines.join('\n'), 'text/csv');
};

$('#btn-json').onclick = () => {
  const data = {
    savedAt: new Date().toISOString(),
    firmware: link.firmware,
    device: link.device && link.device.name,
    userAgent: navigator.userAgent,
    pedal: { SENSOR_ZERO_GRACE: Pedal.SENSOR_ZERO_GRACE, SENSOR_STALE_MS: Pedal.SENSOR_STALE_MS },
    target: +targetInput.value,
    config: cfg,
    chunks, frames, samples,
  };
  download(`pedal-debug-${stamp()}.json`, JSON.stringify(data, null, 1), 'application/json');
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
  const recent = frames.filter((f) => f.kind === 'workout' && f.t >= sec(now) - 30);
  const zeros = recent.filter((f) => f.rpm === 0).length;
  $('#v-zero').textContent = recent.length ? `${Math.round((zeros / recent.length) * 100)}%` : '-';
  $('#v-zero-s').textContent = recent.length ? `${zeros} / ${recent.length} 프레임` : '';
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

function renderFrames() {
  const rows = frames.slice(-MAX_ROWS).reverse().map((f) => {
    if (f.kind !== 'workout') {
      return `<tr class="bad"><td>${f.t.toFixed(2)}</td><td>${f.gap ?? ''}</td><td colspan="6"></td><td class="l">${esc(f.note)}: ${esc(f.raw)}</td></tr>`;
    }
    const cls = f.rpm === 0 ? (f.held > 0 ? 'held' : 'zero') : '';
    return `<tr class="${cls}"><td>${f.t.toFixed(2)}</td><td>${f.gap ?? ''}</td><td>${f.rpm}</td><td>${f.watt}</td><td>${f.rev}</td><td>${f.dRev ?? ''}</td><td>${fmt(f.revRpm, 1)}</td><td>${f.held}</td><td class="l">${esc(f.note)}</td></tr>`;
  });
  $('#frames').innerHTML = rows.join('');
  $('#frame-count').textContent = `${frames.length}개 기록${frames.length > MAX_ROWS ? ` (최근 ${MAX_ROWS}개 표시)` : ''} · 빨강 = 0 정지, 주황 = 0이지만 유예로 유지`;
}

function renderRaw() {
  const vis = (s) => esc(s).replace(/\n/g, '⏎').replace(/\r/g, '␍');
  $('#raw').innerHTML = chunks.slice(-MAX_ROWS).reverse().map((c) =>
    `<span class="t">${c.t.toFixed(3)}</span> ${c.dir === 'out' ? '<span class="out">→ ' + vis(c.text) + '</span>' : '← ' + vis(c.text)}`
  ).join('\n');
}

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
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
  const vis = frames.filter((f) => f.kind === 'workout' && f.t >= tStart);
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
  for (const s of samples) {
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
    samples.push({ t: sec(now), game: Math.round(game * 100) / 100 });
    lastSample = now;
  }
  if (!frozen) {
    renderTiles(now, game);
    renderBall(game);
    drawChart(now);
    if (dirty.frames) { renderFrames(); dirty.frames = false; }
    if (dirty.raw) { renderRaw(); dirty.raw = false; }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
