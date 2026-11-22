// 풍경 그림: 길가 소품(나무 · 집 · 풍차 · 꽃), 길 아래 풀밭과 언덕, 달리는 사람 배지(자전거 · 두뇌).
// (x, y) = 밑동, treeHeight 같은 크기 인자 = 소품 크기. 그리는 함수는 scene = { context: 캔버스, palette: 색, look: 화면 스타일, time: 흐른 시간(s),
// roll: 바퀴 회전각, pop: 정답 직후 1→0 } 을 받는다 (보통 Band 자신. 운영 버전 측정 화면은 제 것을 넘긴다)
import { Util } from './config.js';
import { hash, mix } from './paint.js';

const BRAIN_LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 4], [0, 4]];

const BRAIN_NODES = [[-0.6, -0.1], [-0.2, -0.45], [0.3, -0.42], [0.55, -0.05], [0.15, 0.2], [-0.35, 0.25]];

// 두뇌 배지 (두뇌 게임만 하는 판의 공·자전거 대신, radius = 배지 반지름). 두뇌 모양은 로고(app/logo.svg)와 같다.
// 정답 직후(pop)에는 초록으로 물들고 신경망 마디가 밝아진다. 달리는 느낌이 나게 박자 없이 살짝 오르내린다
const BRAIN = new Path2D('M-0.95 0.05 C-1 -0.45 -0.6 -0.8 -0.1 -0.8 C0.45 -0.82 0.95 -0.5 0.95 -0.05 C0.97 0.25 0.85 0.42 0.62 0.45 C0.7 0.62 0.5 0.75 0.3 0.66 C0.22 0.62 0.18 0.56 0.15 0.52 L0.13 0.8 L0.01 0.8 L0.02 0.5 C-0.2 0.55 -0.45 0.5 -0.55 0.38 C-0.8 0.42 -0.92 0.28 -0.95 0.05 Z');

export function drawPine(scene, x, y, treeHeight) {
  const { context, palette } = scene;
  context.fillStyle = palette.tree;
  context.beginPath();
  context.moveTo(x - treeHeight * 0.32, y);
  context.lineTo(x, y - treeHeight);
  context.lineTo(x + treeHeight * 0.32, y);
  context.closePath();
  context.fill();
}

export function drawRoundTree(scene, x, y, treeHeight, fruit) {
  const { context, palette } = scene;
  context.fillStyle = palette.trunk;
  context.fillRect(x - treeHeight * 0.06, y - treeHeight * 0.5, treeHeight * 0.12, treeHeight * 0.5);
  context.fillStyle = palette.treeRound;
  context.beginPath();
  context.arc(x, y - treeHeight * 0.66, treeHeight * 0.34, 0, Math.PI * 2);
  context.fill();
  if (!fruit) return;
  context.fillStyle = palette.fruit;
  for (const [offsetX, offsetY] of [[-0.14, -0.7], [0.12, -0.6], [0.02, -0.82], [0.17, -0.8]]) {
    context.beginPath();
    context.arc(x + offsetX * treeHeight, y + offsetY * treeHeight, Math.max(1.5, treeHeight * 0.05), 0, Math.PI * 2);
    context.fill();
  }
}

export function drawHouse(scene, x, y, houseHeight, pick) {
  const { context, palette } = scene;
  const houseWidth = houseHeight * 0.95;
  const wallHeight = houseHeight * 0.55;
  context.fillStyle = palette.wall;
  context.fillRect(x - houseWidth / 2, y - wallHeight, houseWidth, wallHeight);
  context.fillStyle = pick > 0.7 ? palette.roofAlt : palette.roof;
  context.beginPath();
  context.moveTo(x - houseWidth * 0.62, y - wallHeight);
  context.lineTo(x, y - wallHeight - houseHeight * 0.42);
  context.lineTo(x + houseWidth * 0.62, y - wallHeight);
  context.closePath();
  context.fill();
  context.fillStyle = palette.window;
  context.fillRect(x - houseWidth * 0.3, y - wallHeight * 0.72, houseWidth * 0.22, wallHeight * 0.3);
  context.fillRect(x + houseWidth * 0.1, y - wallHeight * 0.72, houseWidth * 0.22, wallHeight * 0.3);
}

// 풍차 날개는 시간에 따라 돈다. itemIndex = 길가 소품 번호 (풍차마다 날개 각도가 다르게)
export function drawWindmill(scene, x, y, millHeight, itemIndex) {
  const { context, palette } = scene;
  const top = y - millHeight * 1.15;
  context.fillStyle = palette.mill;
  context.beginPath();
  context.moveTo(x - millHeight * 0.2, y);
  context.lineTo(x - millHeight * 0.09, top);
  context.lineTo(x + millHeight * 0.09, top);
  context.lineTo(x + millHeight * 0.2, y);
  context.closePath();
  context.fill();
  context.strokeStyle = palette.blade;
  context.lineWidth = Math.max(2, millHeight * 0.07);
  context.lineCap = 'round';
  context.beginPath();
  const firstBladeAngle = scene.time * 1.4 + itemIndex;
  for (let blade = 0; blade < 4; blade++) {
    const angle = firstBladeAngle + (blade * Math.PI) / 2;
    context.moveTo(x, top);
    context.lineTo(x + Math.cos(angle) * millHeight * 0.6, top + Math.sin(angle) * millHeight * 0.6);
  }
  context.stroke();
  context.lineCap = 'butt';
  context.fillStyle = palette.blade;
  context.beginPath();
  context.arc(x, top, Math.max(2, millHeight * 0.07), 0, Math.PI * 2);
  context.fill();
}

// itemIndex = 길가 소품 번호 (꽃 색과 흩어진 모양을 정한다)
export function drawFlowerPatch(scene, x, y, patchSize, itemIndex) {
  const { context, palette } = scene;
  const colors = [palette.flowerA, palette.flowerB, palette.flowerC, palette.flowerD];
  const color = colors[Math.floor(hash(itemIndex + 17) * colors.length)];
  context.fillStyle = color;
  for (let flower = 0; flower < 7; flower++) {
    context.beginPath();
    context.arc(x + (hash(itemIndex * 7 + flower) - 0.5) * patchSize * 1.6, y - hash(itemIndex * 5 + flower) * patchSize * 0.35, Math.max(2.5, patchSize * 0.1), 0, Math.PI * 2);
    context.fill();
  }
}

// 길 아래 풀밭의 꽃과 덤불 (길과 같이 기운 좌표에서 그린다). halfWidth = 그릴 너비의 절반, top = 풀밭 윗선, below = 풀밭 높이,
// scrolled = 흘러간 거리, opacity = 보이는 정도
export function drawRoadside(scene, halfWidth, top, below, scrolled, opacity) {
  const { context, palette } = scene;
  const spacing = 64;
  const plantSize = Util.clamp(below * 0.12, 6, 26);
  const colors = [palette.flowerA, palette.flowerB, palette.flowerC, palette.flowerD];
  context.globalAlpha = opacity;
  for (let j = Math.floor((scrolled - halfWidth) / spacing); j * spacing - scrolled < halfWidth + spacing; j++) {
    const chance = hash(j + 501);
    if (chance < 0.35) continue;
    const x = j * spacing - scrolled + hash(j + 77) * 30;
    const y = top + below * (0.22 + 0.45 * hash(j + 13));
    if (chance > 0.82) {
      context.fillStyle = palette.bush;
      context.beginPath();
      context.arc(x, y, plantSize * 1.3, Math.PI, 0);
      context.arc(x + plantSize * 1.2, y, plantSize * 0.95, Math.PI, 0);
      context.closePath();
      context.fill();
      continue;
    }
    context.strokeStyle = palette.tree;
    context.lineWidth = Math.max(1.5, plantSize * 0.14);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x, y - plantSize * 1.1);
    context.stroke();
    context.fillStyle = colors[Math.floor(hash(j + 9) * colors.length)];
    context.beginPath();
    context.arc(x, y - plantSize * 1.2, plantSize * 0.42, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

// 길가 언덕 (길 윗선 roadTop 에서 꼭대기 crest(x) 까지, 가로 -halfWidth~halfWidth). 기념물보다 먼저 그린다.
// 꼭대기는 뒤 언덕(hillNear)에 가까운 밝은 풀색, 길 쪽으로 갈수록 풀밭색 — 앞으로 기운 비탈처럼 보이고 뒤 언덕과 길을 잇는다
export function drawRoadsideHill(scene, halfWidth, roadTop, crest, verge) {
  const { context, palette } = scene;
  const gradient = context.createLinearGradient(0, roadTop - verge * 2, 0, roadTop);
  gradient.addColorStop(0, mix(palette.hillNear, palette.grass, 0.25));
  gradient.addColorStop(1, palette.grass);
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(-halfWidth, roadTop + 1);
  for (let x = -halfWidth; x <= halfWidth; x += 8) context.lineTo(x, crest(x));
  context.lineTo(halfWidth, roadTop + 1);
  context.closePath();
  context.fill();
}

export function drawBrainBadge(scene, x, y, radius) {
  const { context, palette, look } = scene;
  y += Math.sin(scene.time * 5) * radius * 0.04;
  context.fillStyle = palette.panel;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  if (scene.pop > 0) {
    context.globalAlpha = scene.pop;
    context.fillStyle = palette.goodSoft;
    context.fill();
    context.globalAlpha = 1;
  }
  context.lineWidth = Math.max(3, radius * 0.15);
  context.strokeStyle = palette.accent;
  if (look.glow) {
    context.shadowColor = palette.accent;
    context.shadowBlur = look.glow;
  }
  context.stroke();
  context.shadowBlur = 0;
  context.save();
  context.translate(x, y - radius * 0.02);
  const brainScale = radius * 0.62;
  context.scale(brainScale, brainScale);
  context.fillStyle = palette.accent;
  context.fill(BRAIN);
  if (scene.pop > 0) {
    context.globalAlpha = scene.pop;
    context.fillStyle = palette.good;
    context.fill(BRAIN);
    context.globalAlpha = 1;
  }
  const nodes = BRAIN_NODES;
  context.strokeStyle = palette.panel;
  context.lineWidth = 0.08;
  context.lineCap = 'round';
  context.globalAlpha = 0.7;
  context.beginPath();
  for (const [startNode, endNode] of BRAIN_LINKS) {
    context.moveTo(...nodes[startNode]);
    context.lineTo(...nodes[endNode]);
  }
  context.stroke();
  context.globalAlpha = 1;
  // 마디 하나씩 차례로 밝아진다 (생각이 도는 느낌). 정답 직후에는 모두 밝다
  const lit = Math.floor(scene.time * 2.5) % nodes.length;
  nodes.forEach(([nodeX, nodeY], i) => {
    context.fillStyle = palette.panel;
    context.globalAlpha = scene.pop > 0 || i === lit ? 1 : 0.75;
    context.beginPath();
    context.arc(nodeX, nodeY, i === lit ? 0.15 : 0.11, 0, Math.PI * 2);
    context.fill();
  });
  context.globalAlpha = 1;
  context.lineCap = 'butt';
  context.restore();
}

// 배지 안의 자전거 (radius = 배지 반지름). 바퀴는 페달보다 빨리 돌고, 크랭크는 페달 속도 그대로 돈다
export function drawBike(scene, x, y, radius) {
  const { context, palette } = scene;
  // 배지 반지름을 1 로 본 좌표 → 화면 좌표
  const point = (unitX, unitY) => [x + unitX * radius, y + unitY * radius];
  const wheelRadius = radius * 0.27;
  const rearHub = point(-0.4, 0.22), frontHub = point(0.4, 0.22), crank = point(-0.02, 0.22);
  const seatJoint = point(-0.15, -0.18), headJoint = point(0.27, -0.18);
  context.strokeStyle = palette.ink;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = Math.max(2, radius * 0.085);
  context.beginPath();
  context.arc(rearHub[0], rearHub[1], wheelRadius, 0, Math.PI * 2);
  context.moveTo(frontHub[0] + wheelRadius, frontHub[1]);
  context.arc(frontHub[0], frontHub[1], wheelRadius, 0, Math.PI * 2);
  context.moveTo(...rearHub);
  context.lineTo(...seatJoint);
  context.lineTo(...crank);
  context.lineTo(...rearHub);
  context.moveTo(...seatJoint);
  context.lineTo(...headJoint);
  context.lineTo(...crank);
  context.moveTo(...headJoint);
  context.lineTo(...frontHub);
  const seat = point(-0.17, -0.31);
  context.moveTo(...seatJoint);
  context.lineTo(...seat);
  context.moveTo(seat[0] - radius * 0.1, seat[1]);
  context.lineTo(seat[0] + radius * 0.08, seat[1]);
  const handlebar = point(0.3, -0.33);
  context.moveTo(...headJoint);
  context.lineTo(...handlebar);
  context.lineTo(handlebar[0] + radius * 0.1, handlebar[1] + radius * 0.02);
  context.stroke();
  context.lineWidth = Math.max(1.2, radius * 0.045);
  context.beginPath();
  for (const hub of [rearHub, frontHub]) {
    for (let spoke = 0; spoke < 3; spoke++) {
      const angle = scene.roll * 2 + (spoke * Math.PI) / 3;
      context.moveTo(hub[0] + Math.cos(angle) * wheelRadius, hub[1] + Math.sin(angle) * wheelRadius);
      context.lineTo(hub[0] - Math.cos(angle) * wheelRadius, hub[1] - Math.sin(angle) * wheelRadius);
    }
  }
  context.stroke();
  context.lineWidth = Math.max(2, radius * 0.07);
  context.beginPath();
  const crankAngle = scene.roll;
  context.moveTo(crank[0] + Math.cos(crankAngle) * radius * 0.13, crank[1] + Math.sin(crankAngle) * radius * 0.13);
  context.lineTo(crank[0] - Math.cos(crankAngle) * radius * 0.13, crank[1] - Math.sin(crankAngle) * radius * 0.13);
  context.stroke();
  context.lineCap = 'butt';
  context.lineJoin = 'miter';
}
