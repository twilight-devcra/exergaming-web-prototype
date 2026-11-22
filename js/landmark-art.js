// 기념물 그림: 마을(집 · 가게 · 탑)과 소품(바람개비 · 풍선 · 돌탑), 이름 팻말, 별.
// 무엇을 세우는가(종류·생김새)는 js/landmarks.js, 어디에 언제 세우는가는 js/band.js 가 정한다.
// 그리는 함수는 scene = { context: 캔버스, palette: 색, time: 흐른 시간(s), roll: 바퀴 회전각, theta: 길 기울기 } 을 받는다 (보통 Band 자신).
// scale = 기념물 크기 (모든 치수를 이 길이에 곱해 정한다). size = 0~2 (층수·돌 수·풍선 수)
import { Util } from './config.js';
import { Landmarks } from './landmarks.js';
import { hash, mix } from './paint.js';

// 기념물 소품 색 (바람개비·풍선·건물 장식)
const LANDMARK_COLORS = ['#e5484d', '#f5b301', '#2f6fed', '#e93d82', '#12a594'];

// 밑면 너비의 절반(body)과 팻말을 세울 자리(sign, 지붕 처마 바깥)
export function footprint(kind, size, scale) {
  if (kind === 'cottage') return { body: 0.4 * scale, sign: 0.544 * scale };
  if (kind === 'shop') return { body: 0.46 * scale, sign: 0.51 * scale };
  if (kind === 'tower') return { body: 0.28 * scale, sign: 0.36 * scale };
  if (kind === 'cairn') return { body: (0.26 + 0.03 * size) * scale, sign: 0.32 * scale };
  return { body: 0.08 * scale, sign: 0.32 * scale };
}

// 기념물 전체 높이 어림 (밑동에서 지붕·깃발 끝까지). 짓는 동안 아래부터 보이게 자르고 이름표 자리를 미리 잡는 데 쓴다
export function heightOf(kind, size, scale) {
  const floors = size + 1;
  if (kind === 'cottage') return scale * (0.44 * floors + 0.55);
  if (kind === 'shop') return scale * (0.44 * floors + 0.24);
  if (kind === 'tower') return scale * (0.44 * (floors + 0.55) + 1.0);
  return scale * 1.6;
}

// 기념물 하나 { kind, size, seed, best } 를 길 좌표 (x, y) 밑동에 scale 크기로. tag = 오른쪽 작은 팻말의 글자 (날짜),
// tagScale = 팻말 글자 크기의 기준.
// 오르막·내리막에서는 길이 기울지만(theta) 기념물은 똑바로 선다. 밑에는 언덕 비탈에 드리운 옅은 그림자를 깔아 땅에 붙어 보이게 한다.
// 돌려주는 값 = 맨 위 높이 (밑동 기준, 똑바로 선 좌표. 별·이름표를 그 위에 둔다)
export function drawLandmark(scene, landmark, x, y, scale, tag = '', tagScale = scale / 1.8) {
  const { context } = scene;
  context.save();
  context.translate(x, y);
  context.rotate(scene.theta);
  let top;
  const bodyHalfWidth = footprint(landmark.kind, landmark.size, scale).body;
  context.fillStyle = 'rgba(30, 60, 35, 0.22)';
  context.beginPath();
  context.ellipse(scale * 0.05, 0, bodyHalfWidth * 1.25 + scale * 0.05, scale * 0.07, 0, 0, Math.PI * 2);
  context.fill();
  if (landmark.kind === 'pinwheel') top = drawPinwheel(scene, 0, 0, scale, landmark.size, landmark.seed);
  else if (landmark.kind === 'cairn') top = drawCairn(scene, 0, 0, scale, landmark.size, landmark.seed);
  else if (landmark.kind === 'balloon') top = drawBalloons(scene, 0, 0, scale, landmark.size, landmark.seed);
  else ({ top } = drawBuilding(scene, landmark.kind, 0, 0, scale, landmark.size, landmark.seed, landmark));
  if (landmark.best) {
    drawStar(scene, 0, top - scale * 0.2, scale * 0.17);
    top -= scale * 0.37;
  }
  if (tag) drawSign(scene, landmark, scale, tag, tagScale);
  context.restore();
  return top;
}

// 기념물 오른쪽(지붕 처마 바깥)의 작은 날짜 팻말. 밑동 기준, 똑바로 선 좌표에서 부른다
export function drawSign(scene, landmark, scale, tag, tagScale) {
  const { context, palette } = scene;
  const fontSize = Math.round(Util.clamp(tagScale * 0.42, 10, 18));
  context.font = `800 ${fontSize}px ${palette.font}`;
  const signWidth = context.measureText(tag).width + fontSize * 0.7;
  const signHeight = fontSize * 1.35;
  const signX = footprint(landmark.kind, landmark.size, scale).sign + scale * 0.06;
  const signY = -scale * 0.3 - signHeight;
  context.fillStyle = palette.trunk;
  context.fillRect(signX + signWidth * 0.5 - 1.5, signY + signHeight, 3, -signY - signHeight + 1);
  context.beginPath();
  context.roundRect(signX, signY, signWidth, signHeight, 3);
  context.fill();
  context.fillStyle = palette.panel;
  context.beginPath();
  context.roundRect(signX + 1.5, signY + 1.5, signWidth - 3, signHeight - 3, 2);
  context.fill();
  context.fillStyle = palette.ink;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(tag, signX + signWidth / 2, signY + signHeight / 2 + 1);
}

// 마을 기념물 (동화책 풍): cottage(편안하게) 불룩한 박공지붕 집 · shop(보통) 줄무늬 차양 가게 · tower(도전) 깃발 단 탑.
// size 0~2 = 층수 1~3. 벽·지붕 색은 colors(저장한 생김새의 wall · roof), 없으면 seed 로. 둥근 모서리, 아치 문·창, 창가 화분, 오른쪽 그늘.
// 윤곽선은 검은 선이 아니라 칸마다 제 색을 조금 어둡게 한 선이다 (윤곽 없는 풍경 그림과 어울리게).
// 길가 언덕의 앞 비탈에 선다. 돌려주는 값 = { top: 맨 위 높이, half: 몸체 너비의 절반 }
export function drawBuilding(scene, kind, x, y, scale, size, seed, colors = {}) {
  const { context } = scene;
  const floors = size + 1;
  const floorHeight = scale * 0.44;    // 한 층 높이
  const wall = colors.wall || Landmarks.WALLS[seed % Landmarks.WALLS.length];
  const roof = colors.roof || Landmarks.ROOFS[(seed * 3 + 1) % Landmarks.ROOFS.length];
  const glass = '#ffe2a0', wood = '#8a5a3a', stone = '#e6d6bb', brick = '#c0674a';
  const outlineOf = (color) => mix(color, '#3a2a20', 0.3);
  const lineWidth = Math.max(1.2, scale * 0.04);
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.lineWidth = lineWidth;
  const paint = (fill) => {
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = outlineOf(fill);
    context.stroke();
  };
  // 몸체 오른쪽 그늘
  const shade = (left, top, width, height) => {
    context.fillStyle = 'rgba(80, 50, 30, 0.1)';
    context.fillRect(left + width * 0.72, top, width * 0.28, height);
  };
  const archWindow = (centerX, centerY, windowSize) => {
    context.beginPath();
    context.moveTo(centerX - windowSize / 2, centerY + windowSize * 0.55);
    context.lineTo(centerX - windowSize / 2, centerY - windowSize * 0.1);
    context.arc(centerX, centerY - windowSize * 0.1, windowSize / 2, Math.PI, 0);
    context.lineTo(centerX + windowSize / 2, centerY + windowSize * 0.55);
    context.closePath();
    context.fillStyle = glass;
    context.fill();
    context.strokeStyle = outlineOf(wall);
    context.stroke();
    context.lineWidth = lineWidth * 0.6;
    context.beginPath();
    context.moveTo(centerX, centerY - windowSize * 0.55);
    context.lineTo(centerX, centerY + windowSize * 0.55);
    context.moveTo(centerX - windowSize / 2, centerY + windowSize * 0.12);
    context.lineTo(centerX + windowSize / 2, centerY + windowSize * 0.12);
    context.stroke();
    context.lineWidth = lineWidth;
    // 창가 화분
    context.beginPath();
    context.roundRect(centerX - windowSize * 0.6, centerY + windowSize * 0.55, windowSize * 1.2, windowSize * 0.22, windowSize * 0.08);
    paint('#b8704a');
    for (let i = 0; i < 3; i++) {
      context.fillStyle = LANDMARK_COLORS[(seed + i) % LANDMARK_COLORS.length];
      context.beginPath();
      context.arc(centerX - windowSize * 0.35 + i * windowSize * 0.35, centerY + windowSize * 0.52, windowSize * 0.12, 0, Math.PI * 2);
      context.fill();
    }
  };
  const door = (centerX, doorWidth, doorHeight) => {
    context.beginPath();
    context.moveTo(centerX - doorWidth / 2, y);
    context.lineTo(centerX - doorWidth / 2, y - doorHeight + doorWidth / 2);
    context.arc(centerX, y - doorHeight + doorWidth / 2, doorWidth / 2, Math.PI, 0);
    context.lineTo(centerX + doorWidth / 2, y);
    context.closePath();
    paint(wood);
    context.fillStyle = '#f5d36b';
    context.beginPath();
    context.arc(centerX + doorWidth * 0.25, y - doorHeight * 0.42, lineWidth * 0.6, 0, Math.PI * 2);
    context.fill();
  };
  // 불룩한 지붕: 양 처마에서 꼭대기로 곡선. eaveY = 처마 높이, halfWidth = 지붕 너비의 절반
  const puffyRoof = (eaveY, halfWidth, roofHeight, bulge) => {
    context.beginPath();
    context.moveTo(x - halfWidth, eaveY + scale * 0.04);
    context.quadraticCurveTo(x - halfWidth * 0.44, eaveY - roofHeight * bulge, x, eaveY - roofHeight);
    context.quadraticCurveTo(x + halfWidth * 0.44, eaveY - roofHeight * bulge, x + halfWidth, eaveY + scale * 0.04);
    context.closePath();
    paint(roof);
  };

  if (kind === 'tower') {
    const towerWidth = scale * 0.5;
    const bodyHeight = floorHeight * (floors + 0.55);
    context.beginPath();
    context.moveTo(x - towerWidth * 0.56, y);
    context.lineTo(x - towerWidth * 0.46, y - bodyHeight);
    context.lineTo(x + towerWidth * 0.46, y - bodyHeight);
    context.lineTo(x + towerWidth * 0.56, y);
    context.closePath();
    context.fillStyle = stone;
    context.fill();
    shade(x - towerWidth * 0.5, y - bodyHeight, towerWidth, bodyHeight);
    context.strokeStyle = outlineOf(stone);
    context.stroke();
    // 돌 무늬
    context.fillStyle = 'rgba(120, 90, 60, 0.22)';
    for (let i = 0; i < floors * 3; i++) {
      context.beginPath();
      context.roundRect(x - towerWidth * 0.4 + hash(seed + i) * towerWidth * 0.6, y - bodyHeight + hash(seed + i * 7) * bodyHeight * 0.9, towerWidth * 0.16, scale * 0.05, 2);
      context.fill();
    }
    for (let i = 1; i <= floors; i++) archWindow(x, y - floorHeight * (i + 0.15), scale * 0.18);
    door(x, towerWidth * 0.36, floorHeight * 0.6);
    const eaveY = y - bodyHeight;
    const roofHeight = scale * 0.7;
    puffyRoof(eaveY, towerWidth * 0.72, roofHeight, 0.25);
    const poleBottom = eaveY - roofHeight;
    context.strokeStyle = outlineOf(roof);
    context.beginPath();
    context.moveTo(x, poleBottom);
    context.lineTo(x, poleBottom - scale * 0.3);
    context.stroke();
    const flutter = Math.sin(scene.time * 4 + seed) * scale * 0.03;
    context.beginPath();
    context.moveTo(x, poleBottom - scale * 0.3);
    context.quadraticCurveTo(x + scale * 0.14, poleBottom - scale * 0.3 + flutter, x + scale * 0.24, poleBottom - scale * 0.22 + flutter);
    context.lineTo(x, poleBottom - scale * 0.16);
    context.closePath();
    paint('#f5b301');
    return { top: poleBottom - scale * 0.3, half: towerWidth * 0.72 };
  }

  if (kind === 'shop') {
    const shopWidth = scale * 0.92;
    const bodyHeight = floorHeight * floors + scale * 0.12;
    context.beginPath();
    context.roundRect(x - shopWidth / 2, y - bodyHeight, shopWidth, bodyHeight, scale * 0.04);
    context.fillStyle = wall;
    context.fill();
    shade(x - shopWidth / 2, y - bodyHeight, shopWidth, bodyHeight);
    context.strokeStyle = outlineOf(wall);
    context.stroke();
    context.beginPath();
    context.roundRect(x - shopWidth / 2 - scale * 0.05, y - bodyHeight - scale * 0.12, shopWidth + scale * 0.1, scale * 0.14, scale * 0.05);
    paint(roof);
    // 1층: 큰 진열창과 문, 그 위 줄무늬 차양
    context.beginPath();
    context.roundRect(x - shopWidth * 0.42, y - floorHeight * 0.74, shopWidth * 0.46, floorHeight * 0.56, scale * 0.04);
    context.fillStyle = glass;
    context.fill();
    context.strokeStyle = outlineOf(wall);
    context.stroke();
    door(x + shopWidth * 0.26, shopWidth * 0.24, floorHeight * 0.74);
    const awningWidth = shopWidth + scale * 0.1;
    const awningY = y - floorHeight * 0.98;
    const stripes = 5;
    const stripeWidth = awningWidth / stripes;
    for (let i = 0; i < stripes; i++) {
      const stripeX = x - awningWidth / 2 + stripeWidth * i;
      context.beginPath();
      context.moveTo(stripeX, awningY);
      context.lineTo(stripeX + stripeWidth, awningY);
      context.lineTo(stripeX + stripeWidth, awningY + scale * 0.1);
      context.arc(stripeX + stripeWidth / 2, awningY + scale * 0.1, stripeWidth / 2, 0, Math.PI);
      context.closePath();
      context.fillStyle = i % 2 ? '#fffaf0' : roof;
      context.fill();
      context.strokeStyle = outlineOf(roof);
      context.stroke();
    }
    for (let floor = 1; floor < floors; floor++) {
      archWindow(x - shopWidth * 0.22, y - floorHeight * (floor + 0.45), scale * 0.17);
      archWindow(x + shopWidth * 0.22, y - floorHeight * (floor + 0.45), scale * 0.17);
    }
    return { top: y - bodyHeight - scale * 0.12, half: shopWidth / 2 + scale * 0.05 };
  }

  // cottage
  const cottageWidth = scale * 0.8;
  const bodyHeight = floorHeight * floors;
  context.beginPath();
  context.roundRect(x - cottageWidth / 2, y - bodyHeight, cottageWidth, bodyHeight, scale * 0.03);
  context.fillStyle = wall;
  context.fill();
  shade(x - cottageWidth / 2, y - bodyHeight, cottageWidth, bodyHeight);
  context.strokeStyle = outlineOf(wall);
  context.stroke();
  door(x - cottageWidth * 0.22, cottageWidth * 0.26, floorHeight * 0.7);
  archWindow(x + cottageWidth * 0.2, y - floorHeight * 0.55, scale * 0.17);
  for (let floor = 1; floor < floors; floor++) {
    archWindow(x - cottageWidth * 0.2, y - floorHeight * (floor + 0.45), scale * 0.17);
    archWindow(x + cottageWidth * 0.2, y - floorHeight * (floor + 0.45), scale * 0.17);
  }
  const eaveY = y - bodyHeight;
  const roofHeight = scale * 0.5;
  // 굴뚝(지붕 뒤)과 피어오르는 연기
  context.beginPath();
  context.roundRect(x + cottageWidth * 0.14, eaveY - roofHeight * 0.95, cottageWidth * 0.16, roofHeight * 0.7, scale * 0.02);
  paint(brick);
  context.fillStyle = 'rgba(255, 255, 255, 0.8)';
  const baseAlpha = context.globalAlpha;
  for (let i = 0; i < 3; i++) {
    // 연기 한 덩이가 굴뚝에서 나와 사라지기까지 0→1
    const rise = (scene.time * 0.35 + i / 3 + seed * 0.13) % 1;
    context.globalAlpha = baseAlpha * (1 - rise);
    context.beginPath();
    context.arc(x + cottageWidth * 0.22 + rise * scale * 0.16, eaveY - roofHeight - scale * (0.04 + rise * 0.32), scale * (0.035 + rise * 0.05), 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = baseAlpha;
  puffyRoof(eaveY, cottageWidth * 0.68, roofHeight, 0.6);
  // 지붕 위 밝은 띠
  context.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  context.beginPath();
  context.moveTo(x - cottageWidth * 0.42, eaveY - roofHeight * 0.22);
  context.quadraticCurveTo(x, eaveY - roofHeight * 0.55, x + cottageWidth * 0.42, eaveY - roofHeight * 0.22);
  context.stroke();
  return { top: eaveY - roofHeight, half: cottageWidth * 0.68 };
}

// 바람개비 (편안하게): 막대 위의 네 날개. 페달을 밟는 만큼 돈다. size 0~2 = 크기
export function drawPinwheel(scene, x, y, scale, size, seed) {
  const { context, palette } = scene;
  const stickHeight = scale * (0.8 + 0.18 * size);
  const bladeLength = scale * (0.28 + 0.07 * size);
  const hubY = y - stickHeight;
  context.strokeStyle = palette.trunk;
  context.lineWidth = Math.max(2, scale * 0.06);
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x, hubY);
  context.stroke();
  const spinAngle = scene.roll * 0.7 + seed;
  const colors = LANDMARK_COLORS;
  context.lineWidth = Math.max(1, scale * 0.025);
  context.strokeStyle = 'rgba(0,0,0,0.25)';
  for (let blade = 0; blade < 4; blade++) {
    const angle = spinAngle + (blade * Math.PI) / 2;
    context.fillStyle = colors[(seed + blade) % colors.length];
    context.beginPath();
    context.moveTo(x, hubY);
    context.lineTo(x + Math.cos(angle) * bladeLength, hubY + Math.sin(angle) * bladeLength);
    context.lineTo(x + Math.cos(angle + 0.8) * bladeLength * 0.72, hubY + Math.sin(angle + 0.8) * bladeLength * 0.72);
    context.closePath();
    context.fill();
    context.stroke();
  }
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(x, hubY, Math.max(1.5, scale * 0.045), 0, Math.PI * 2);
  context.fill();
  return hubY - bladeLength;
}

// 풍선 (보통): 말뚝에 묶인 풍선 size+1 개. 천천히 흔들린다
export function drawBalloons(scene, x, y, scale, size, seed) {
  const { context, palette } = scene;
  const count = size + 1;
  const radiusX = scale * 0.2;
  const radiusY = scale * 0.25;
  const pegTop = y - scale * 0.14;
  context.fillStyle = palette.trunk;
  context.fillRect(x - scale * 0.03, pegTop, scale * 0.06, y - pegTop);
  let top = y;
  const colors = LANDMARK_COLORS;
  for (let i = 0; i < count; i++) {
    const spreadX = count === 1 ? 0 : (i - (count - 1) / 2) * scale * 0.34;
    const balloonX = x + spreadX + Math.sin(scene.time * 1.3 + seed + i * 2.1) * scale * 0.05;
    const balloonY = y - scale * (1.25 + (i % 2) * 0.14) + Math.sin(scene.time * 1.7 + seed * 0.7 + i) * scale * 0.04;
    context.strokeStyle = palette.ink;
    context.globalAlpha *= 0.55;
    context.lineWidth = Math.max(1, scale * 0.02);
    context.beginPath();
    context.moveTo(x, pegTop);
    context.quadraticCurveTo(x + spreadX * 0.3, (pegTop + balloonY) / 2, balloonX, balloonY + radiusY);
    context.stroke();
    context.globalAlpha /= 0.55;
    context.fillStyle = colors[(seed + i * 2) % colors.length];
    context.beginPath();
    context.ellipse(balloonX, balloonY, radiusX, radiusY, 0, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(balloonX, balloonY + radiusY - 1);
    context.lineTo(balloonX - radiusX * 0.22, balloonY + radiusY + radiusX * 0.3);
    context.lineTo(balloonX + radiusX * 0.22, balloonY + radiusY + radiusX * 0.3);
    context.closePath();
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.45)';
    context.beginPath();
    context.ellipse(balloonX - radiusX * 0.35, balloonY - radiusY * 0.35, radiusX * 0.22, radiusY * 0.3, -0.5, 0, Math.PI * 2);
    context.fill();
    top = Math.min(top, balloonY - radiusY);
  }
  return top;
}

// 돌탑 (도전): 납작한 돌을 위로 갈수록 작게 쌓는다. size 0~2 = 돌 3~5 개
export function drawCairn(scene, x, y, scale, size, seed) {
  const { context } = scene;
  const greys = ['#8d949b', '#aeb4ba', '#767d84', '#9da3a9'];
  let stoneWidth = scale * (0.52 + 0.06 * size);
  let stackTop = y;
  context.strokeStyle = '#4b5157';
  context.lineWidth = Math.max(1, scale * 0.03);
  for (let i = 0; i < 3 + size; i++) {
    const stoneHeight = stoneWidth * 0.5;
    const shiftX = (hash(seed + i * 13) - 0.5) * stoneWidth * 0.25;
    context.fillStyle = greys[(seed + i) % greys.length];
    context.beginPath();
    context.ellipse(x + shiftX, stackTop - stoneHeight / 2, stoneWidth / 2, stoneHeight / 2, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    stackTop -= stoneHeight * 0.85;
    stoneWidth *= 0.8;
  }
  return stackTop;
}

// 별 (가장 높은 점수의 기념물 위). outerRadius = 뾰족한 끝까지의 반지름
export function drawStar(scene, x, y, outerRadius) {
  const { context, palette } = scene;
  context.fillStyle = palette.sun;
  context.strokeStyle = palette.ink;
  context.lineWidth = Math.max(1, outerRadius * 0.15);
  context.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const pointRadius = i % 2 ? outerRadius * 0.45 : outerRadius;
    context.lineTo(x + Math.cos(angle) * pointRadius, y + Math.sin(angle) * pointRadius);
  }
  context.closePath();
  context.fill();
  context.stroke();
}
