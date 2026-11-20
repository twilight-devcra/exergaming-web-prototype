// 풍경 그림: 길가 소품(나무 · 집 · 풍차 · 꽃), 길 아래 풀밭과 언덕, 달리는 사람 배지(자전거 · 두뇌).
// (x, y) = 밑동, h = 크기. 그리는 함수는 scene = { g: 캔버스, pal: 색, look: 화면 스타일, time: 흐른 시간(s),
// roll: 바퀴 회전각, pop: 정답 직후 1→0 } 을 받는다 (보통 Band 자신. 운영 버전 측정 화면은 제 것을 넘긴다)
import { U } from './config.js';
import { hash, mix } from './paint.js';

const BRAIN_LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 4], [0, 4]];

const BRAIN_NODES = [[-0.6, -0.1], [-0.2, -0.45], [0.3, -0.42], [0.55, -0.05], [0.15, 0.2], [-0.35, 0.25]];

// 두뇌 배지 (두뇌 게임만 하는 판의 공·자전거 대신, s = 배지 반지름). 두뇌 모양은 로고(app/logo.svg)와 같다.
// 정답 직후(pop)에는 초록으로 물들고 신경망 마디가 밝아진다. 달리는 느낌이 나게 박자 없이 살짝 오르내린다
const BRAIN = new Path2D('M-0.95 0.05 C-1 -0.45 -0.6 -0.8 -0.1 -0.8 C0.45 -0.82 0.95 -0.5 0.95 -0.05 C0.97 0.25 0.85 0.42 0.62 0.45 C0.7 0.62 0.5 0.75 0.3 0.66 C0.22 0.62 0.18 0.56 0.15 0.52 L0.13 0.8 L0.01 0.8 L0.02 0.5 C-0.2 0.55 -0.45 0.5 -0.55 0.38 C-0.8 0.42 -0.92 0.28 -0.95 0.05 Z');

export function drawPine(scene, x, y, h) {
  const { g, pal } = scene;
  g.fillStyle = pal.tree;
  g.beginPath();
  g.moveTo(x - h * 0.32, y);
  g.lineTo(x, y - h);
  g.lineTo(x + h * 0.32, y);
  g.closePath();
  g.fill();
}

export function drawRoundTree(scene, x, y, h, fruit) {
  const { g, pal } = scene;
  g.fillStyle = pal.trunk;
  g.fillRect(x - h * 0.06, y - h * 0.5, h * 0.12, h * 0.5);
  g.fillStyle = pal.treeRound;
  g.beginPath();
  g.arc(x, y - h * 0.66, h * 0.34, 0, Math.PI * 2);
  g.fill();
  if (!fruit) return;
  g.fillStyle = pal.fruit;
  for (const [dx, dy] of [[-0.14, -0.7], [0.12, -0.6], [0.02, -0.82], [0.17, -0.8]]) {
    g.beginPath();
    g.arc(x + dx * h, y + dy * h, Math.max(1.5, h * 0.05), 0, Math.PI * 2);
    g.fill();
  }
}

export function drawHouse(scene, x, y, h, pick) {
  const { g, pal } = scene;
  const w = h * 0.95;
  const bh = h * 0.55;
  g.fillStyle = pal.wall;
  g.fillRect(x - w / 2, y - bh, w, bh);
  g.fillStyle = pick > 0.7 ? pal.roofAlt : pal.roof;
  g.beginPath();
  g.moveTo(x - w * 0.62, y - bh);
  g.lineTo(x, y - bh - h * 0.42);
  g.lineTo(x + w * 0.62, y - bh);
  g.closePath();
  g.fill();
  g.fillStyle = pal.window;
  g.fillRect(x - w * 0.3, y - bh * 0.72, w * 0.22, bh * 0.3);
  g.fillRect(x + w * 0.1, y - bh * 0.72, w * 0.22, bh * 0.3);
}

// 풍차 날개는 시간에 따라 돈다
export function drawWindmill(scene, x, y, h, i) {
  const { g, pal } = scene;
  const top = y - h * 1.15;
  g.fillStyle = pal.mill;
  g.beginPath();
  g.moveTo(x - h * 0.2, y);
  g.lineTo(x - h * 0.09, top);
  g.lineTo(x + h * 0.09, top);
  g.lineTo(x + h * 0.2, y);
  g.closePath();
  g.fill();
  g.strokeStyle = pal.blade;
  g.lineWidth = Math.max(2, h * 0.07);
  g.lineCap = 'round';
  g.beginPath();
  const a0 = scene.time * 1.4 + i;
  for (let k = 0; k < 4; k++) {
    const a = a0 + (k * Math.PI) / 2;
    g.moveTo(x, top);
    g.lineTo(x + Math.cos(a) * h * 0.6, top + Math.sin(a) * h * 0.6);
  }
  g.stroke();
  g.lineCap = 'butt';
  g.fillStyle = pal.blade;
  g.beginPath();
  g.arc(x, top, Math.max(2, h * 0.07), 0, Math.PI * 2);
  g.fill();
}

export function drawFlowerPatch(scene, x, y, h, i) {
  const { g, pal } = scene;
  const colors = [pal.flowerA, pal.flowerB, pal.flowerC, pal.flowerD];
  const c = colors[Math.floor(hash(i + 17) * colors.length)];
  g.fillStyle = c;
  for (let k = 0; k < 7; k++) {
    g.beginPath();
    g.arc(x + (hash(i * 7 + k) - 0.5) * h * 1.6, y - hash(i * 5 + k) * h * 0.35, Math.max(2.5, h * 0.1), 0, Math.PI * 2);
    g.fill();
  }
}

// 길 아래 풀밭의 꽃과 덤불 (길과 같이 기운 좌표에서 그린다). off = 흘러간 거리, a = 보이는 정도
export function drawRoadside(scene, ext, top, below, off, a) {
  const { g, pal } = scene;
  const sp = 64;
  const s = U.clamp(below * 0.12, 6, 26);
  const colors = [pal.flowerA, pal.flowerB, pal.flowerC, pal.flowerD];
  g.globalAlpha = a;
  for (let j = Math.floor((off - ext) / sp); j * sp - off < ext + sp; j++) {
    const h = hash(j + 501);
    if (h < 0.35) continue;
    const x = j * sp - off + hash(j + 77) * 30;
    const y = top + below * (0.22 + 0.45 * hash(j + 13));
    if (h > 0.82) {
      g.fillStyle = pal.bush;
      g.beginPath();
      g.arc(x, y, s * 1.3, Math.PI, 0);
      g.arc(x + s * 1.2, y, s * 0.95, Math.PI, 0);
      g.closePath();
      g.fill();
      continue;
    }
    g.strokeStyle = pal.tree;
    g.lineWidth = Math.max(1.5, s * 0.14);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x, y - s * 1.1);
    g.stroke();
    g.fillStyle = colors[Math.floor(hash(j + 9) * colors.length)];
    g.beginPath();
    g.arc(x, y - s * 1.2, s * 0.42, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

// 길가 언덕 (길 윗선 roadTop 에서 꼭대기 crest(x) 까지). 기념물보다 먼저 그린다.
// 꼭대기는 뒤 언덕(hillNear)에 가까운 밝은 풀색, 길 쪽으로 갈수록 풀밭색 — 앞으로 기운 비탈처럼 보이고 뒤 언덕과 길을 잇는다
export function drawRoadsideHill(scene, ext, roadTop, crest, verge) {
  const { g, pal } = scene;
  const grad = g.createLinearGradient(0, roadTop - verge * 2, 0, roadTop);
  grad.addColorStop(0, mix(pal.hillNear, pal.grass, 0.25));
  grad.addColorStop(1, pal.grass);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(-ext, roadTop + 1);
  for (let x = -ext; x <= ext; x += 8) g.lineTo(x, crest(x));
  g.lineTo(ext, roadTop + 1);
  g.closePath();
  g.fill();
}

export function drawBrainBadge(scene, x, y, s) {
  const { g, pal, look } = scene;
  y += Math.sin(scene.time * 5) * s * 0.04;
  g.fillStyle = pal.panel;
  g.beginPath();
  g.arc(x, y, s, 0, Math.PI * 2);
  g.fill();
  if (scene.pop > 0) {
    g.globalAlpha = scene.pop;
    g.fillStyle = pal.goodSoft;
    g.fill();
    g.globalAlpha = 1;
  }
  g.lineWidth = Math.max(3, s * 0.15);
  g.strokeStyle = pal.accent;
  if (look.glow) {
    g.shadowColor = pal.accent;
    g.shadowBlur = look.glow;
  }
  g.stroke();
  g.shadowBlur = 0;
  g.save();
  g.translate(x, y - s * 0.02);
  const k = s * 0.62;
  g.scale(k, k);
  g.fillStyle = pal.accent;
  g.fill(BRAIN);
  if (scene.pop > 0) {
    g.globalAlpha = scene.pop;
    g.fillStyle = pal.good;
    g.fill(BRAIN);
    g.globalAlpha = 1;
  }
  const N = BRAIN_NODES;
  g.strokeStyle = pal.panel;
  g.lineWidth = 0.08;
  g.lineCap = 'round';
  g.globalAlpha = 0.7;
  g.beginPath();
  for (const [a, b] of BRAIN_LINKS) {
    g.moveTo(...N[a]);
    g.lineTo(...N[b]);
  }
  g.stroke();
  g.globalAlpha = 1;
  // 마디 하나씩 차례로 밝아진다 (생각이 도는 느낌). 정답 직후에는 모두 밝다
  const lit = Math.floor(scene.time * 2.5) % N.length;
  N.forEach(([nx, ny], i) => {
    g.fillStyle = pal.panel;
    g.globalAlpha = scene.pop > 0 || i === lit ? 1 : 0.75;
    g.beginPath();
    g.arc(nx, ny, i === lit ? 0.15 : 0.11, 0, Math.PI * 2);
    g.fill();
  });
  g.globalAlpha = 1;
  g.lineCap = 'butt';
  g.restore();
}

// 배지 안의 자전거 (s = 배지 반지름). 바퀴는 페달보다 빨리 돌고, 크랭크는 페달 속도 그대로 돈다
export function drawBike(scene, x, y, s) {
  const { g, pal } = scene;
  const P = (px, py) => [x + px * s, y + py * s];
  const wr = s * 0.27;
  const R = P(-0.4, 0.22), F = P(0.4, 0.22), C = P(-0.02, 0.22), S = P(-0.15, -0.18), Hd = P(0.27, -0.18);
  g.strokeStyle = pal.ink;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(2, s * 0.085);
  g.beginPath();
  g.arc(R[0], R[1], wr, 0, Math.PI * 2);
  g.moveTo(F[0] + wr, F[1]);
  g.arc(F[0], F[1], wr, 0, Math.PI * 2);
  g.moveTo(...R);
  g.lineTo(...S);
  g.lineTo(...C);
  g.lineTo(...R);
  g.moveTo(...S);
  g.lineTo(...Hd);
  g.lineTo(...C);
  g.moveTo(...Hd);
  g.lineTo(...F);
  const seat = P(-0.17, -0.31);
  g.moveTo(...S);
  g.lineTo(...seat);
  g.moveTo(seat[0] - s * 0.1, seat[1]);
  g.lineTo(seat[0] + s * 0.08, seat[1]);
  const bar = P(0.3, -0.33);
  g.moveTo(...Hd);
  g.lineTo(...bar);
  g.lineTo(bar[0] + s * 0.1, bar[1] + s * 0.02);
  g.stroke();
  g.lineWidth = Math.max(1.2, s * 0.045);
  g.beginPath();
  for (const wh of [R, F]) {
    for (let k = 0; k < 3; k++) {
      const a = scene.roll * 2 + (k * Math.PI) / 3;
      g.moveTo(wh[0] + Math.cos(a) * wr, wh[1] + Math.sin(a) * wr);
      g.lineTo(wh[0] - Math.cos(a) * wr, wh[1] - Math.sin(a) * wr);
    }
  }
  g.stroke();
  g.lineWidth = Math.max(2, s * 0.07);
  g.beginPath();
  const ca = scene.roll;
  g.moveTo(C[0] + Math.cos(ca) * s * 0.13, C[1] + Math.sin(ca) * s * 0.13);
  g.lineTo(C[0] - Math.cos(ca) * s * 0.13, C[1] - Math.sin(ca) * s * 0.13);
  g.stroke();
  g.lineCap = 'butt';
  g.lineJoin = 'miter';
}
