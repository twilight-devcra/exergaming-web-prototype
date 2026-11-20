// 기념물 그림: 마을(집 · 가게 · 탑)과 소품(바람개비 · 풍선 · 돌탑), 이름 팻말, 별.
// 무엇을 세우는가(종류·생김새)는 js/landmarks.js, 어디에 언제 세우는가는 js/band.js 가 정한다.
// 그리는 함수는 scene = { g: 캔버스, pal: 색, time: 흐른 시간(s), roll: 바퀴 회전각, theta: 길 기울기 } 을 받는다 (보통 Band 자신).
import { U } from './config.js';
import { Landmarks } from './landmarks.js';
import { hash, mix } from './paint.js';

// 기념물 소품 색 (바람개비·풍선·건물 장식)
const LM_COLORS = ['#e5484d', '#f5b301', '#2f6fed', '#e93d82', '#12a594'];

// 밑면 너비의 절반(body)과 팻말을 세울 자리(sign, 지붕 처마 바깥). h = 기념물 크기
export function footprint(kind, size, h) {
  if (kind === 'cottage') return { body: 0.4 * h, sign: 0.544 * h };
  if (kind === 'shop') return { body: 0.46 * h, sign: 0.51 * h };
  if (kind === 'tower') return { body: 0.28 * h, sign: 0.36 * h };
  if (kind === 'cairn') return { body: (0.26 + 0.03 * size) * h, sign: 0.32 * h };
  return { body: 0.08 * h, sign: 0.32 * h };
}

// 기념물 전체 높이 어림 (밑동에서 지붕·깃발 끝까지). 짓는 동안 아래부터 보이게 자르고 이름표 자리를 미리 잡는 데 쓴다
export function heightOf(kind, size, h) {
  const f = size + 1;
  if (kind === 'cottage') return h * (0.44 * f + 0.55);
  if (kind === 'shop') return h * (0.44 * f + 0.24);
  if (kind === 'tower') return h * (0.44 * (f + 0.55) + 1.0);
  return h * 1.6;
}

// 기념물 하나 { kind, size, seed, best } 를 길 좌표 (x, y) 밑동에 h 크기로. tag = 오른쪽 작은 팻말의 글자 (날짜).
// 오르막·내리막에서는 길이 기울지만(theta) 기념물은 똑바로 선다. 밑에는 언덕 비탈에 드리운 옅은 그림자를 깔아 땅에 붙어 보이게 한다.
// 돌려주는 값 = 맨 위 높이 (밑동 기준, 똑바로 선 좌표. 별·이름표를 그 위에 둔다)
export function drawLandmark(scene, lm, x, y, h, tag = '', r = h / 1.8) {
  const { g, pal } = scene;
  g.save();
  g.translate(x, y);
  g.rotate(scene.theta);
  let top;
  const fp = footprint(lm.kind, lm.size, h);
  g.fillStyle = 'rgba(30, 60, 35, 0.22)';
  g.beginPath();
  g.ellipse(h * 0.05, 0, fp.body * 1.25 + h * 0.05, h * 0.07, 0, 0, Math.PI * 2);
  g.fill();
  if (lm.kind === 'pinwheel') top = drawPinwheel(scene, 0, 0, h, lm.size, lm.seed);
  else if (lm.kind === 'cairn') top = drawCairn(scene, 0, 0, h, lm.size, lm.seed);
  else if (lm.kind === 'balloon') top = drawBalloons(scene, 0, 0, h, lm.size, lm.seed);
  else ({ top } = drawBuilding(scene, lm.kind, 0, 0, h, lm.size, lm.seed, lm));
  if (lm.best) {
    drawStar(scene, 0, top - h * 0.2, h * 0.17);
    top -= h * 0.37;
  }
  if (tag) drawSign(scene, lm, h, tag, r);
  g.restore();
  return top;
}

// 기념물 오른쪽(지붕 처마 바깥)의 작은 날짜 팻말. 밑동 기준, 똑바로 선 좌표에서 부른다
export function drawSign(scene, lm, h, tag, r) {
  const { g, pal } = scene;
  const fs = Math.round(U.clamp(r * 0.42, 10, 18));
  g.font = `800 ${fs}px ${pal.font}`;
  const w = g.measureText(tag).width + fs * 0.7;
  const sh = fs * 1.35;
  const sx = footprint(lm.kind, lm.size, h).sign + h * 0.06;
  const sy = -h * 0.3 - sh;
  g.fillStyle = pal.trunk;
  g.fillRect(sx + w * 0.5 - 1.5, sy + sh, 3, -sy - sh + 1);
  g.beginPath();
  g.roundRect(sx, sy, w, sh, 3);
  g.fill();
  g.fillStyle = pal.panel;
  g.beginPath();
  g.roundRect(sx + 1.5, sy + 1.5, w - 3, sh - 3, 2);
  g.fill();
  g.fillStyle = pal.ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(tag, sx + w / 2, sy + sh / 2 + 1);
}

// 마을 기념물 (동화책 풍): cottage(편안하게) 불룩한 박공지붕 집 · shop(보통) 줄무늬 차양 가게 · tower(도전) 깃발 단 탑.
// size 0~2 = 층수 1~3. 벽·지붕 색은 colors(저장한 생김새의 wall · roof), 없으면 seed 로. 둥근 모서리, 아치 문·창, 창가 화분, 오른쪽 그늘.
// 윤곽선은 검은 선이 아니라 칸마다 제 색을 조금 어둡게 한 선이다 (윤곽 없는 풍경 그림과 어울리게).
// 길가 언덕의 앞 비탈에 선다. 돌려주는 값 = { top: 맨 위 높이, half: 몸체 너비의 절반 }
export function drawBuilding(scene, kind, x, y, h, size, seed, colors = {}) {
  const { g } = scene;
  const floors = size + 1;
  const fh = h * 0.44;                 // 한 층 높이
  const wall = colors.wall || Landmarks.WALLS[seed % Landmarks.WALLS.length];
  const roof = colors.roof || Landmarks.ROOFS[(seed * 3 + 1) % Landmarks.ROOFS.length];
  const glass = '#ffe2a0', woodC = '#8a5a3a', stone = '#e6d6bb', brick = '#c0674a';
  const tone = (c) => mix(c, '#3a2a20', 0.3);
  const lw = Math.max(1.2, h * 0.04);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = lw;
  const paint = (fill) => {
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = tone(fill);
    g.stroke();
  };
  const shade = (bx, by, bw, bh) => {
    g.fillStyle = 'rgba(80, 50, 30, 0.1)';
    g.fillRect(bx + bw * 0.72, by, bw * 0.28, bh);
  };
  const archWin = (cx, cy, s) => {
    g.beginPath();
    g.moveTo(cx - s / 2, cy + s * 0.55);
    g.lineTo(cx - s / 2, cy - s * 0.1);
    g.arc(cx, cy - s * 0.1, s / 2, Math.PI, 0);
    g.lineTo(cx + s / 2, cy + s * 0.55);
    g.closePath();
    g.fillStyle = glass;
    g.fill();
    g.strokeStyle = tone(wall);
    g.stroke();
    g.lineWidth = lw * 0.6;
    g.beginPath();
    g.moveTo(cx, cy - s * 0.55);
    g.lineTo(cx, cy + s * 0.55);
    g.moveTo(cx - s / 2, cy + s * 0.12);
    g.lineTo(cx + s / 2, cy + s * 0.12);
    g.stroke();
    g.lineWidth = lw;
    // 창가 화분
    g.beginPath();
    g.roundRect(cx - s * 0.6, cy + s * 0.55, s * 1.2, s * 0.22, s * 0.08);
    paint('#b8704a');
    for (let i = 0; i < 3; i++) {
      g.fillStyle = LM_COLORS[(seed + i) % LM_COLORS.length];
      g.beginPath();
      g.arc(cx - s * 0.35 + i * s * 0.35, cy + s * 0.52, s * 0.12, 0, Math.PI * 2);
      g.fill();
    }
  };
  const door = (cx, dw, dh) => {
    g.beginPath();
    g.moveTo(cx - dw / 2, y);
    g.lineTo(cx - dw / 2, y - dh + dw / 2);
    g.arc(cx, y - dh + dw / 2, dw / 2, Math.PI, 0);
    g.lineTo(cx + dw / 2, y);
    g.closePath();
    paint(woodC);
    g.fillStyle = '#f5d36b';
    g.beginPath();
    g.arc(cx + dw * 0.25, y - dh * 0.42, lw * 0.6, 0, Math.PI * 2);
    g.fill();
  };
  // 불룩한 지붕: 양 처마에서 꼭대기로 곡선
  const puffyRoof = (ry, hw, rh, bulge) => {
    g.beginPath();
    g.moveTo(x - hw, ry + h * 0.04);
    g.quadraticCurveTo(x - hw * 0.44, ry - rh * bulge, x, ry - rh);
    g.quadraticCurveTo(x + hw * 0.44, ry - rh * bulge, x + hw, ry + h * 0.04);
    g.closePath();
    paint(roof);
  };

  if (kind === 'tower') {
    const w = h * 0.5;
    const bh = fh * (floors + 0.55);
    g.beginPath();
    g.moveTo(x - w * 0.56, y);
    g.lineTo(x - w * 0.46, y - bh);
    g.lineTo(x + w * 0.46, y - bh);
    g.lineTo(x + w * 0.56, y);
    g.closePath();
    g.fillStyle = stone;
    g.fill();
    shade(x - w * 0.5, y - bh, w, bh);
    g.strokeStyle = tone(stone);
    g.stroke();
    // 돌 무늬
    g.fillStyle = 'rgba(120, 90, 60, 0.22)';
    for (let i = 0; i < floors * 3; i++) {
      g.beginPath();
      g.roundRect(x - w * 0.4 + hash(seed + i) * w * 0.6, y - bh + hash(seed + i * 7) * bh * 0.9, w * 0.16, h * 0.05, 2);
      g.fill();
    }
    for (let i = 1; i <= floors; i++) archWin(x, y - fh * (i + 0.15), h * 0.18);
    door(x, w * 0.36, fh * 0.6);
    const ry = y - bh;
    const rh = h * 0.7;
    puffyRoof(ry, w * 0.72, rh, 0.25);
    const pole = ry - rh;
    g.strokeStyle = tone(roof);
    g.beginPath();
    g.moveTo(x, pole);
    g.lineTo(x, pole - h * 0.3);
    g.stroke();
    const flutter = Math.sin(scene.time * 4 + seed) * h * 0.03;
    g.beginPath();
    g.moveTo(x, pole - h * 0.3);
    g.quadraticCurveTo(x + h * 0.14, pole - h * 0.3 + flutter, x + h * 0.24, pole - h * 0.22 + flutter);
    g.lineTo(x, pole - h * 0.16);
    g.closePath();
    paint('#f5b301');
    return { top: pole - h * 0.3, half: w * 0.72 };
  }

  if (kind === 'shop') {
    const w = h * 0.92;
    const bh = fh * floors + h * 0.12;
    g.beginPath();
    g.roundRect(x - w / 2, y - bh, w, bh, h * 0.04);
    g.fillStyle = wall;
    g.fill();
    shade(x - w / 2, y - bh, w, bh);
    g.strokeStyle = tone(wall);
    g.stroke();
    g.beginPath();
    g.roundRect(x - w / 2 - h * 0.05, y - bh - h * 0.12, w + h * 0.1, h * 0.14, h * 0.05);
    paint(roof);
    // 1층: 큰 진열창과 문, 그 위 줄무늬 차양
    g.beginPath();
    g.roundRect(x - w * 0.42, y - fh * 0.74, w * 0.46, fh * 0.56, h * 0.04);
    g.fillStyle = glass;
    g.fill();
    g.strokeStyle = tone(wall);
    g.stroke();
    door(x + w * 0.26, w * 0.24, fh * 0.74);
    const aw = w + h * 0.1;
    const ay = y - fh * 0.98;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const sx = x - aw / 2 + (aw / n) * i;
      g.beginPath();
      g.moveTo(sx, ay);
      g.lineTo(sx + aw / n, ay);
      g.lineTo(sx + aw / n, ay + h * 0.1);
      g.arc(sx + aw / n / 2, ay + h * 0.1, aw / n / 2, 0, Math.PI);
      g.closePath();
      g.fillStyle = i % 2 ? '#fffaf0' : roof;
      g.fill();
      g.strokeStyle = tone(roof);
      g.stroke();
    }
    for (let f = 1; f < floors; f++) {
      archWin(x - w * 0.22, y - fh * (f + 0.45), h * 0.17);
      archWin(x + w * 0.22, y - fh * (f + 0.45), h * 0.17);
    }
    return { top: y - bh - h * 0.12, half: w / 2 + h * 0.05 };
  }

  // cottage
  const w = h * 0.8;
  const bh = fh * floors;
  g.beginPath();
  g.roundRect(x - w / 2, y - bh, w, bh, h * 0.03);
  g.fillStyle = wall;
  g.fill();
  shade(x - w / 2, y - bh, w, bh);
  g.strokeStyle = tone(wall);
  g.stroke();
  door(x - w * 0.22, w * 0.26, fh * 0.7);
  archWin(x + w * 0.2, y - fh * 0.55, h * 0.17);
  for (let f = 1; f < floors; f++) {
    archWin(x - w * 0.2, y - fh * (f + 0.45), h * 0.17);
    archWin(x + w * 0.2, y - fh * (f + 0.45), h * 0.17);
  }
  const ry = y - bh;
  const rh = h * 0.5;
  // 굴뚝(지붕 뒤)과 피어오르는 연기
  g.beginPath();
  g.roundRect(x + w * 0.14, ry - rh * 0.95, w * 0.16, rh * 0.7, h * 0.02);
  paint(brick);
  g.fillStyle = 'rgba(255, 255, 255, 0.8)';
  const a0 = g.globalAlpha;
  for (let i = 0; i < 3; i++) {
    const t = (scene.time * 0.35 + i / 3 + seed * 0.13) % 1;
    g.globalAlpha = a0 * (1 - t);
    g.beginPath();
    g.arc(x + w * 0.22 + t * h * 0.16, ry - rh - h * (0.04 + t * 0.32), h * (0.035 + t * 0.05), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = a0;
  puffyRoof(ry, w * 0.68, rh, 0.6);
  // 지붕 위 밝은 띠
  g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  g.beginPath();
  g.moveTo(x - w * 0.42, ry - rh * 0.22);
  g.quadraticCurveTo(x, ry - rh * 0.55, x + w * 0.42, ry - rh * 0.22);
  g.stroke();
  return { top: ry - rh, half: w * 0.68 };
}

// 바람개비 (편안하게): 막대 위의 네 날개. 페달을 밟는 만큼 돈다. size 0~2 = 크기
export function drawPinwheel(scene, x, y, h, size, seed) {
  const { g, pal } = scene;
  const L = h * (0.8 + 0.18 * size);
  const R = h * (0.28 + 0.07 * size);
  const cy = y - L;
  g.strokeStyle = pal.trunk;
  g.lineWidth = Math.max(2, h * 0.06);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, cy);
  g.stroke();
  const a0 = scene.roll * 0.7 + seed;
  const C = LM_COLORS;
  g.lineWidth = Math.max(1, h * 0.025);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  for (let k = 0; k < 4; k++) {
    const a = a0 + (k * Math.PI) / 2;
    g.fillStyle = C[(seed + k) % C.length];
    g.beginPath();
    g.moveTo(x, cy);
    g.lineTo(x + Math.cos(a) * R, cy + Math.sin(a) * R);
    g.lineTo(x + Math.cos(a + 0.8) * R * 0.72, cy + Math.sin(a + 0.8) * R * 0.72);
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(x, cy, Math.max(1.5, h * 0.045), 0, Math.PI * 2);
  g.fill();
  return cy - R;
}

// 풍선 (보통): 말뚝에 묶인 풍선 size+1 개. 천천히 흔들린다
export function drawBalloons(scene, x, y, h, size, seed) {
  const { g, pal } = scene;
  const n = size + 1;
  const rx = h * 0.2;
  const ry = h * 0.25;
  const peg = y - h * 0.14;
  g.fillStyle = pal.trunk;
  g.fillRect(x - h * 0.03, peg, h * 0.06, y - peg);
  let top = y;
  const C = LM_COLORS;
  for (let i = 0; i < n; i++) {
    const off = n === 1 ? 0 : (i - (n - 1) / 2) * h * 0.34;
    const cx = x + off + Math.sin(scene.time * 1.3 + seed + i * 2.1) * h * 0.05;
    const cy = y - h * (1.25 + (i % 2) * 0.14) + Math.sin(scene.time * 1.7 + seed * 0.7 + i) * h * 0.04;
    g.strokeStyle = pal.ink;
    g.globalAlpha *= 0.55;
    g.lineWidth = Math.max(1, h * 0.02);
    g.beginPath();
    g.moveTo(x, peg);
    g.quadraticCurveTo(x + off * 0.3, (peg + cy) / 2, cx, cy + ry);
    g.stroke();
    g.globalAlpha /= 0.55;
    g.fillStyle = C[(seed + i * 2) % C.length];
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(cx, cy + ry - 1);
    g.lineTo(cx - rx * 0.22, cy + ry + rx * 0.3);
    g.lineTo(cx + rx * 0.22, cy + ry + rx * 0.3);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.beginPath();
    g.ellipse(cx - rx * 0.35, cy - ry * 0.35, rx * 0.22, ry * 0.3, -0.5, 0, Math.PI * 2);
    g.fill();
    top = Math.min(top, cy - ry);
  }
  return top;
}

// 돌탑 (도전): 납작한 돌을 위로 갈수록 작게 쌓는다. size 0~2 = 돌 3~5 개
export function drawCairn(scene, x, y, h, size, seed) {
  const { g } = scene;
  const greys = ['#8d949b', '#aeb4ba', '#767d84', '#9da3a9'];
  let w = h * (0.52 + 0.06 * size);
  let cy = y;
  g.strokeStyle = '#4b5157';
  g.lineWidth = Math.max(1, h * 0.03);
  for (let i = 0; i < 3 + size; i++) {
    const sh = w * 0.5;
    const dx = (hash(seed + i * 13) - 0.5) * w * 0.25;
    g.fillStyle = greys[(seed + i) % greys.length];
    g.beginPath();
    g.ellipse(x + dx, cy - sh / 2, w / 2, sh / 2, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    cy -= sh * 0.85;
    w *= 0.8;
  }
  return cy;
}

export function drawStar(scene, x, y, s) {
  const { g, pal } = scene;
  g.fillStyle = pal.sun;
  g.strokeStyle = pal.ink;
  g.lineWidth = Math.max(1, s * 0.15);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 ? s * 0.45 : s;
    g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  g.closePath();
  g.fill();
  g.stroke();
}
