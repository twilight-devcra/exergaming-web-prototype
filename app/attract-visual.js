// 대기 화면 오른쪽 그림 (운영 버전만): 바퀴 안의 두뇌.
// 바퀴가 한 바퀴 돌 때마다 불꽃이 두뇌로 들어가고, 신경망이 이어지며 차례로 밝아진다 — '페달을 밟으면 두뇌가 깨어난다'.
// 아무도 없으면 천천히 돌고, 대기 화면에서 페달을 밟으면 그 속도로 빨라진다. Demo.tick 이 대기 화면에서 매 프레임 부른다.
import { U } from '../js/config.js';
import { Band } from '../js/band.js';

export const AttractVisual = {
  // 옆에서 본 두뇌 (왼쪽이 앞). 가로 -1~1, 세로 대략 -0.8~0.8. 로고(app/logo.svg)도 같은 모양을 쓴다
  BRAIN: 'M-0.95 0.05 C-1 -0.45 -0.6 -0.8 -0.1 -0.8 C0.45 -0.82 0.95 -0.5 0.95 -0.05 C0.97 0.25 0.85 0.42 0.62 0.45 ' +
    'C0.7 0.62 0.5 0.75 0.3 0.66 C0.22 0.62 0.18 0.56 0.15 0.52 L0.13 0.8 L0.01 0.8 L0.02 0.5 ' +
    'C-0.2 0.55 -0.45 0.5 -0.55 0.38 C-0.8 0.42 -0.92 0.28 -0.95 0.05 Z',
  IDLE_RPM: 36,      // 아무도 없을 때 바퀴가 도는 빠르기
  HOP_SEC: 0.1,      // 신호가 이웃한 신경 하나를 건너가는 시간
  GLOW_SEC: 1.1,     // 밝아진 신경이 다시 어두워지는 시간
  SPARK_SEC: 0.45,   // 바퀴에서 두뇌까지 불꽃이 날아가는 시간

  init(app) {
    const c = document.getElementById('att-brain');
    if (!c) return null;
    this.app = app;
    this.c = c;
    this.g = c.getContext('2d');
    this.path = new Path2D(this.BRAIN);
    this.angle = -Math.PI / 2;
    this.revs = 0;
    this.t = 0;
    this.rpm = this.IDLE_RPM;
    this.sparks = [];
    this.waves = [];
    this.buildNetwork();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(c);
    return this;
  },

  // 두뇌 안에 신경(점)을 고르게 뿌리고 가까운 것끼리 잇는다. 매번 같은 모양이 나오도록 정해진 난수를 쓴다
  buildNetwork() {
    let seed = 7;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const test = document.createElement('canvas').getContext('2d');
    test.setTransform(100, 0, 0, 100, 200, 200);
    const inside = (x, y) => [[0, 0], [0.07, 0], [-0.07, 0], [0, 0.07], [0, -0.07]]
      .every(([dx, dy]) => test.isPointInPath(this.path, 200 + 100 * (x + dx), 200 + 100 * (y + dy)));
    const nodes = [];
    for (let k = 0; k < 4000 && nodes.length < 46; k++) {
      const x = rnd() * 2 - 1;
      const y = rnd() * 1.6 - 0.8;
      if (y > 0.5 || !inside(x, y)) continue; // 뇌줄기에는 두지 않는다
      if (nodes.some((n) => Math.hypot(n.x - x, n.y - y) < 0.2)) continue;
      nodes.push({ x, y, r: 0.7 + rnd() * 0.6 });
    }
    const edges = [];
    const adj = nodes.map(() => []);
    nodes.forEach((n, i) => {
      nodes
        .map((m, j) => ({ j, d: Math.hypot(m.x - n.x, m.y - n.y) }))
        .filter((o) => o.j !== i && o.d < 0.36)
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
        .forEach(({ j }) => {
          if (adj[i].includes(j)) return;
          adj[i].push(j);
          adj[j].push(i);
          edges.push([i, j]);
        });
    });
    this.nodes = nodes;
    this.edges = edges;
    this.adj = adj;
  },

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.c.getBoundingClientRect();
    this.W = r.width;
    this.H = r.height;
    this.c.width = Math.round(r.width * dpr);
    this.c.height = Math.round(r.height * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  },

  // 한 신경에서 시작해 이웃을 따라 퍼지는 물결. 신경마다 몇 걸음 떨어졌는지 미리 센다
  startWave(from) {
    const hop = this.nodes.map(() => Infinity);
    hop[from] = 0;
    const q = [from];
    while (q.length) {
      const i = q.shift();
      for (const j of this.adj[i]) if (hop[j] === Infinity) { hop[j] = hop[i] + 1; q.push(j); }
    }
    this.waves.push({ t0: this.t, hop });
  },

  tick(dt, rpm = 0) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    // 페달을 밟으면 그 속도로, 아니면 천천히
    this.rpm = U.lerp(this.rpm, Math.max(this.IDLE_RPM, Math.min(rpm, 110)), 1 - Math.exp(-dt / 0.5));
    this.angle += (this.rpm / 60) * Math.PI * 2 * dt;
    const revs = Math.floor((this.angle + Math.PI / 2) / (Math.PI * 2));
    if (revs > this.revs) {
      this.revs = revs;
      // 바퀴 꼭대기에서 불꽃이 나와 두뇌 윗부분 아무 신경으로 날아간다
      const top = this.nodes.map((n, i) => ({ i, y: n.y })).filter((o) => o.y < -0.2);
      const to = top[Math.floor(Math.random() * top.length)].i;
      this.sparks.push({ t0: this.t, to, a: this.angle });
    }
    this.sparks = this.sparks.filter((s) => {
      if (this.t - s.t0 < this.SPARK_SEC) return true;
      this.startWave(s.to);
      return false;
    });
    this.waves = this.waves.filter((w) => this.t - w.t0 < 12 * this.HOP_SEC + this.GLOW_SEC);
    this.draw();
  },

  // 신경 하나의 밝기 0~1 (여러 물결 중 가장 밝은 것)
  glow(i) {
    let v = 0;
    for (const w of this.waves) {
      const s = this.t - w.t0 - w.hop[i] * this.HOP_SEC;
      if (s < 0) continue;
      v = Math.max(v, s < 0.08 ? s / 0.08 : Math.exp(-(s - 0.08) / (this.GLOW_SEC * 0.4)));
    }
    return v;
  },

  draw() {
    const { g, W, H } = this;
    if (!W || !H) return;
    const css = getComputedStyle(document.body);
    const col = (n) => css.getPropertyValue(n).trim();
    const accent = col('--accent'), good = col('--good'), zone = col('--zone'), line = col('--line'), panel = col('--panel');
    g.clearRect(0, 0, W, H);
    const S = Math.min(W, H);
    const cx = W / 2, cy = H / 2;
    const R = S * 0.45;
    const ring = S * 0.04;

    // 바퀴: 옅은 테두리 위로 파란 띠가 돌고, 앞머리에 페달처럼 흰 점
    g.lineCap = 'round';
    g.lineWidth = ring;
    g.strokeStyle = line;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.stroke();
    const a = this.angle;
    for (let k = 0; k < 24; k++) {
      g.globalAlpha = Math.pow(1 - k / 24, 1.6);
      g.strokeStyle = accent;
      g.beginPath();
      g.arc(cx, cy, R, a - (k + 1) * 0.07, a - k * 0.07 + 0.01);
      g.stroke();
    }
    g.globalAlpha = 1;
    const hx = cx + Math.cos(a) * R, hy = cy + Math.sin(a) * R;
    g.fillStyle = panel;
    g.strokeStyle = accent;
    g.lineWidth = ring * 0.35;
    g.beginPath();
    g.arc(hx, hy, ring * 0.75, 0, Math.PI * 2);
    g.fill();
    g.stroke();

    // 두뇌: 흰 바탕 위 신경망
    const k = R * 0.74;
    const ox = cx, oy = cy - R * 0.02;
    const P = (n) => [ox + n.x * k, oy + n.y * k];
    g.save();
    g.translate(ox, oy);
    g.scale(k, k);
    g.shadowColor = 'rgba(29, 43, 36, 0.12)';
    g.shadowBlur = 30;
    g.shadowOffsetY = 8;
    g.fillStyle = panel;
    g.fill(this.path);
    g.shadowColor = 'transparent';
    g.lineWidth = 3 / k;
    g.strokeStyle = 'rgba(21, 128, 61, 0.22)';
    g.stroke(this.path);
    g.restore();

    const gl = this.nodes.map((_, i) => this.glow(i));
    g.lineWidth = Math.max(1.5, S * 0.004);
    for (const [i, j] of this.edges) {
      const [x1, y1] = P(this.nodes[i]);
      const [x2, y2] = P(this.nodes[j]);
      const e = Math.min(gl[i], gl[j]);
      g.strokeStyle = line;
      g.globalAlpha = 1;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
      if (e > 0.02) {
        g.strokeStyle = zone;
        g.globalAlpha = e;
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    const nr = S * 0.011;
    this.nodes.forEach((n, i) => {
      const [x, y] = P(n);
      const v = gl[i];
      if (v > 0.02) {
        g.globalAlpha = v * 0.35;
        g.fillStyle = zone;
        g.beginPath();
        g.arc(x, y, nr * n.r * (1.4 + 1.4 * v), 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
      g.fillStyle = v > 0.02 ? Band.mix('#b9d7c3', good, v) : '#b9d7c3';
      g.beginPath();
      g.arc(x, y, nr * n.r * (1 + 0.5 * v), 0, Math.PI * 2);
      g.fill();
    });

    // 바퀴에서 두뇌로 날아가는 불꽃
    for (const s of this.sparks) {
      const p = U.clamp((this.t - s.t0) / this.SPARK_SEC, 0, 1);
      const e = 1 - Math.pow(1 - p, 2);
      const [tx, ty] = P(this.nodes[s.to]);
      const fx = cx + Math.cos(s.a) * R, fy = cy + Math.sin(s.a) * R; // 불꽃이 나온 바퀴 위 자리
      for (let q = 0; q < 6; q++) {
        const pq = Math.max(0, e - q * 0.05);
        g.globalAlpha = (1 - q / 6) * 0.9;
        g.fillStyle = q ? zone : good;
        g.beginPath();
        g.arc(U.lerp(fx, tx, pq), U.lerp(fy, ty, pq), nr * (1.5 - q * 0.18), 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
  },
};
