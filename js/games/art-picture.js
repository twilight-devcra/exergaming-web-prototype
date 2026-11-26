// 그림 조각 기억하기 (js/games/art.js) 의 그림 만들기. 설계와 검토 기록: docs/games/drafts/art.md
// 색종이 바탕 위에 큰 모양과 작은 무늬를 둔 추상화 (A+C 화풍). 칸 하나 = 100 단위, 그림 = cols×100 × rows×100.
// makePicture(cols, rows, seed, { calm }) → { cols, rows, seed, palette, heroes, accents, attempts, parts(p) }
//   parts(p) = 그리는 차례대로 [id, svg, alt]. p = svg 마다 다른 무늬 id 머리말. alt 는 '바꾼 조각' 에서 그 부분 대신 그리는 모양
//
// 보통 그림 (attempt): 색종이 나누기 → 종이 사이 흰 틈 → 큰 모양(1~3) → 가로지르는 선 → 칸마다 작은 무늬 → 칸이 저마다 다른지 확인
//   - 색종이: 가장 넓은 종이를 비스듬히 자르기를 되풀이한다. 자른 선의 두 끝은 칸 경계에서 22 이상 떨어진다 (조각에 부스러기가 남지 않게)
//   - 큰 모양: 칸 귀퉁이를 조금만 스치면(겹친 쪽 길이 18 미만) 자리를 다시 뽑는다
//   - 작은 무늬: 칸 안에 8 이상 들어와 놓인다 (경계에 걸치지 않게). 종류는 주머니에서 꺼내듯 고르게 돌아간다
//   - 무늬 색: 그 자리 종이와 밝기 차이가 큰 색만 (색만으로 가리지 않도록 모양도 늘 다르다)
//   - 확인: 칸마다 '덮은 큰 모양 + 제 무늬 + 바탕 종이 색' 을 적고, 두 칸이 같으면 씨앗을 바꿔 다시 만든다
//   - 바꾼 조각(alt): 작은 무늬마다 모양이 다른 짝을 정해 둔다 (지그재그 → 곧은 줄, 원 → 점 …)
// 차분한 그림 (calmAttempt, 낮은 단계): 아래 설명
// node tools/art-check.js 로 레벨마다 수백 장을 확인한다.
const PAPER = '#fbf8f1';
const INK = { black: '#1d1d1f', white: '#fbf8f1', red: '#d94b3d', yellow: '#f2b928', blue: '#2c5aa0', orange: '#e8772e' };
export const PALETTES = {
  primary: ['#2c5aa0', '#e98a9b', '#f2b928', '#2a9d8f', '#a9cde3'],
  warm: ['#c8553d', '#e0a526', '#e9d8b4', '#7a8b45', '#7b4b6a'],
  cool: ['#23395b', '#8fd3c1', '#b9a7d9', '#9cc7e6', '#2f7f8f'],
  pop: ['#e4572e', '#2546b8', '#a4c639', '#f4a582', '#7d5ba6'],
};


// 씨앗으로 정해지는 난수 (mulberry32). 같은 씨앗이면 같은 그림이 나온다
export function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (random, list) => list[Math.floor(random() * list.length)];
const between = (random, low, high) => low + random() * (high - low);
const shuffle = (random, list) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
const tenth = (value) => Math.round(value * 10) / 10; // svg 좌표는 소수 한 자리까지

// ---------- 색 ----------
function luminance(hex) {
  const [red, green, blue] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
const contrast = (first, second) => {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
};
// ground 위에서 잘 보이는 잉크 하나 (avoid 는 빼고)
function inkOn(random, ground, avoid = [], min = 2.2) {
  const options = Object.values(INK).filter((ink) => ink !== ground && !avoid.includes(ink) && contrast(ink, ground) >= min);
  return options.length ? pick(random, options) : contrast(INK.black, ground) > contrast(INK.white, ground) ? INK.black : INK.white;
}

// ---------- 다각형 ----------
const area = (poly) => Math.abs(poly.reduce((sum, [x, y], i) => {
  const [nextX, nextY] = poly[(i + 1) % poly.length];
  return sum + x * nextY - nextX * y;
}, 0)) / 2;
const bbox = (poly) => {
  const xValues = poly.map(([x]) => x);
  const yValues = poly.map(([, y]) => y);
  return { left: Math.min(...xValues), right: Math.max(...xValues), top: Math.min(...yValues), bottom: Math.max(...yValues) };
};
// 직선 lineStart→lineEnd 로 볼록 다각형을 둘로 나눈다. 돌려주는 것: [왼쪽, 오른쪽, 자른 선분의 두 끝]
function split(poly, lineStart, lineEnd) {
  const side = ([x, y]) => (lineEnd[0] - lineStart[0]) * (y - lineStart[1]) - (lineEnd[1] - lineStart[1]) * (x - lineStart[0]);
  const left = [];
  const right = [];
  const cut = [];
  poly.forEach((point, i) => {
    const next = poly[(i + 1) % poly.length];
    const sideHere = side(point);
    const sideNext = side(next);
    (sideHere >= 0 ? left : right).push(point);
    if ((sideHere >= 0) !== (sideNext >= 0)) {
      const share = sideHere / (sideHere - sideNext);
      const crossing = [point[0] + (next[0] - point[0]) * share, point[1] + (next[1] - point[1]) * share];
      left.push(crossing);
      right.push(crossing);
      cut.push(crossing);
    }
  });
  return [left, right, cut];
}
const inside = ([x, y], poly) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [pointX, pointY] = poly[i];
    const [prevX, prevY] = poly[j];
    if ((pointY > y) !== (prevY > y) && x < ((prevX - pointX) * (y - pointY)) / (prevY - pointY) + pointX) hit = !hit;
  }
  return hit;
};
const offEdge = (value) => {
  const offset = ((value % 100) + 100) % 100;
  return offset >= 22 && offset <= 78;
};

// 색종이 나누기: 가장 넓은 종이를 비스듬히 자른다
function panels(random, width, height, count) {
  let list = [[[0, 0], [width, 0], [width, height], [0, height]]];
  const seams = [];
  for (let guard = 0; list.length < count && guard < 60; guard++) {
    list.sort((a, b) => area(b) - area(a));
    const poly = list[0];
    const box = bbox(poly);
    const spanX = box.right - box.left;
    const spanY = box.bottom - box.top;
    const vertical = spanX > spanY * 1.15 ? true : spanY > spanX * 1.15 ? false : random() < 0.5;
    const span = vertical ? spanX : spanY;
    if (span < 90) break;
    const start = (vertical ? box.left : box.top) + span * between(random, 0.3, 0.7);
    const end = start + between(random, -26, 26);
    if (!offEdge(start) || !offEdge(end)) continue;
    const [lineStart, lineEnd] = vertical ? [[start, box.top - 1], [end, box.bottom + 1]] : [[box.left - 1, start], [box.right + 1, end]];
    const [left, right, cut] = split(poly, lineStart, lineEnd);
    if (cut.length !== 2 || area(left) < 4000 || area(right) < 4000) continue;
    list = [left, right, ...list.slice(1)];
    seams.push(cut);
  }
  return { list, seams };
}

// ---------- 무늬 ----------
// 작은 무늬: (x, y) 가운데, 크기 size, 색 color, 돌린 각도 turn, 무늬 id 머리말 prefix. 모양 짝(alt)은 SIBLING
const ACCENTS = {
  tri: (x, y, size, color, turn) => `<polygon points="${[0, 120, 240].map((degrees) => { const a = ((degrees + turn) * Math.PI) / 180; return `${tenth(x + Math.sin(a) * size * 0.5)},${tenth(y - Math.cos(a) * size * 0.5)}`; }).join(' ')}" fill="${color}"/>`,
  zigzag: (x, y, size, color) => `<polyline points="${[0, 1, 2, 3, 4].map((i) => `${tenth(x - size / 2 + (i * size) / 4)},${tenth(y + (i % 2 ? -size * 0.2 : size * 0.2))}`).join(' ')}" fill="none" stroke="${color}" stroke-width="6" stroke-linejoin="round"/>`,
  bar: (x, y, size, color) => `<line x1="${tenth(x - size / 2)}" y1="${y}" x2="${tenth(x + size / 2)}" y2="${y}" stroke="${color}" stroke-width="6" stroke-linecap="round"/>`,
  checker: (x, y, size, color, turn, prefix) => `<rect x="${tenth(x - size * 0.4)}" y="${tenth(y - size * 0.4)}" width="${tenth(size * 0.8)}" height="${tenth(size * 0.8)}" fill="url(#${prefix}checker)" stroke="${INK.black}" stroke-width="3" transform="rotate(${turn % 30} ${x} ${y})"/>`,
  stripes: (x, y, size, color, turn, prefix) => `<rect x="${tenth(x - size * 0.25)}" y="${tenth(y - size * 0.45)}" width="${tenth(size * 0.5)}" height="${tenth(size * 0.9)}" fill="url(#${prefix}stripes)" stroke="${INK.blue}" stroke-width="3"/>`,
  dots: (x, y, size, color) => [-1, 0, 1].map((i) => `<circle cx="${tenth(x + i * size * 0.36)}" cy="${y}" r="6" fill="${color}"/>`).join(''),
  ring: (x, y, size, color) => `<circle cx="${x}" cy="${y}" r="${tenth(size * 0.3)}" fill="none" stroke="${color}" stroke-width="5"/>`,
  dot: (x, y, size, color) => `<circle cx="${x}" cy="${y}" r="${tenth(size * 0.32)}" fill="${color}"/>`,
  square: (x, y, size, color, turn) => `<rect x="${tenth(x - size * 0.3)}" y="${tenth(y - size * 0.3)}" width="${tenth(size * 0.6)}" height="${tenth(size * 0.6)}" fill="${color}" transform="rotate(${turn % 40} ${x} ${y})"/>`,
  cross: (x, y, size, color) => `<path d="M${tenth(x - size * 0.3)} ${tenth(y - size * 0.3)}L${tenth(x + size * 0.3)} ${tenth(y + size * 0.3)}M${tenth(x + size * 0.3)} ${tenth(y - size * 0.3)}L${tenth(x - size * 0.3)} ${tenth(y + size * 0.3)}" stroke="${color}" stroke-width="6" stroke-linecap="round"/>`,
  star: (x, y, size, color) => `<polygon points="${Array.from({ length: 10 }, (_, i) => { const a = ((-90 + i * 36) * Math.PI) / 180; const rad = (i % 2 ? 0.2 : 0.46) * size; return `${tenth(x + Math.cos(a) * rad)},${tenth(y + Math.sin(a) * rad)}`; }).join(' ')}" fill="${color}"/>`,
  wave: (x, y, size, color) => `<path d="M${tenth(x - size / 2)} ${y} q${tenth(size / 8)} ${tenth(-size * 0.3)} ${tenth(size / 4)} 0 t${tenth(size / 4)} 0 t${tenth(size / 4)} 0 t${tenth(size / 4)} 0" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"/>`,
  moon: (x, y, size, color, turn) => `<path d="M${tenth(x - size * 0.36)} ${y} A${tenth(size * 0.36)} ${tenth(size * 0.36)} 0 0 1 ${tenth(x + size * 0.36)} ${y} Z" fill="${color}" transform="rotate(${turn} ${x} ${y})"/>`,
};
const ACCENT_KINDS = ['tri', 'zigzag', 'checker', 'stripes', 'dots', 'ring', 'dot', 'square', 'cross', 'star', 'wave', 'moon'];
const SIBLING = { tri: 'square', zigzag: 'bar', checker: 'stripes', stripes: 'checker', dots: 'bar', ring: 'dot', dot: 'square', square: 'dot', cross: 'ring', star: 'dot', wave: 'bar', moon: 'tri' };

// 큰 모양: 여러 칸에 걸친다
function hero(random, kind, width, height, groundAt) {
  const clampX = (value) => Math.min(Math.max(value, 5), width - 5);
  const clampY = (value) => Math.min(Math.max(value, 5), height - 5);
  if (kind === 'rings') {
    const radius = between(random, 40, 62);
    // 가운데가 칸 경계 가까이 오면 네 칸에 똑같은 1/4 원이 생긴다 → 칸 안쪽 25~75 에
    const centerX = Math.floor(between(random, 0, width / 100)) * 100 + between(random, 25, 75);
    const centerY = Math.floor(between(random, 0, height / 100)) * 100 + between(random, 25, 75);
    const outer = inkOn(random, groundAt(centerX, centerY));
    const middle = inkOn(random, outer, [], 1.6);
    const inner = inkOn(random, middle, [outer], 1.6);
    return { kind, box: [centerX - radius, centerY - radius, centerX + radius, centerY + radius],
      svg: `<circle cx="${tenth(centerX)}" cy="${tenth(centerY)}" r="${tenth(radius)}" fill="${outer}"/><circle cx="${tenth(centerX + radius * 0.1)}" cy="${tenth(centerY - radius * 0.1)}" r="${tenth(radius * 0.6)}" fill="${middle}"/><circle cx="${tenth(centerX + radius * 0.18)}" cy="${tenth(centerY - radius * 0.18)}" r="${tenth(radius * 0.24)}" fill="${inner}"/>` };
  }
  if (kind === 'half') {
    // 그림 가장자리에 붙은 반원 (안에 작은 반원)
    const radius = between(random, 44, 62);
    const edge = pick(random, height >= width ? ['left', 'right', 'bottom'] : ['bottom', 'top']);
    const along = (edge === 'left' || edge === 'right' ? height : width);
    const spot = Math.floor(between(random, 0, along / 100)) * 100 + 50 + between(random, -12, 12);
    const [centerX, centerY, turn] = { bottom: [spot, height, 0], top: [spot, 0, 180], left: [0, spot, 90], right: [width, spot, -90] }[edge];
    const outer = inkOn(random, groundAt(clampX(centerX), clampY(centerY)));
    const inner = inkOn(random, outer, [], 1.6);
    return { kind, box: [centerX - radius, centerY - radius, centerX + radius, centerY + radius],
      svg: `<g transform="rotate(${turn} ${tenth(centerX)} ${tenth(centerY)})"><path d="M${tenth(centerX - radius)} ${tenth(centerY)} A${tenth(radius)} ${tenth(radius)} 0 0 1 ${tenth(centerX + radius)} ${tenth(centerY)} Z" fill="${outer}"/><path d="M${tenth(centerX - radius * 0.42)} ${tenth(centerY)} A${tenth(radius * 0.42)} ${tenth(radius * 0.42)} 0 0 1 ${tenth(centerX + radius * 0.42)} ${tenth(centerY)} Z" fill="${inner}"/></g>` };
  }
  if (kind === 'quarter') {
    // 그림 모서리의 큰 사분원
    const radius = between(random, 62, 86);
    const [centerX, centerY] = pick(random, [[0, 0], [width, 0], [0, height], [width, height]]);
    const color = inkOn(random, groundAt(clampX(centerX), clampY(centerY)));
    return { kind, box: [centerX - radius, centerY - radius, centerX + radius, centerY + radius],
      svg: `<circle cx="${centerX}" cy="${centerY}" r="${tenth(radius)}" fill="${color}"/><circle cx="${centerX}" cy="${centerY}" r="${tenth(radius * 0.55)}" fill="none" stroke="${inkOn(random, color)}" stroke-width="5"/>` };
  }
  // bigTri: 큰 세모 (칸 둘에 걸치게)
  const size = between(random, 80, 110);
  const centerX = Math.floor(between(random, 0, width / 100)) * 100 + between(random, 30, 70);
  const centerY = Math.floor(between(random, 0, height / 100)) * 100 + between(random, 30, 70);
  const turn = between(random, 0, 360);
  const corners = [0, 120, 240].map((degrees) => {
    const a = ((degrees + turn) * Math.PI) / 180;
    return [centerX + Math.sin(a) * size * 0.55, centerY - Math.cos(a) * size * 0.55];
  });
  return { kind, box: [centerX - size * 0.55, centerY - size * 0.55, centerX + size * 0.55, centerY + size * 0.55],
    svg: `<polygon points="${corners.map(([x, y]) => `${tenth(x)},${tenth(y)}`).join(' ')}" fill="${inkOn(random, groundAt(centerX, centerY))}"/>` };
}
const HERO_KINDS = ['rings', 'half', 'quarter', 'bigTri'];

// 가로지르는 선: 없음 · 굵은 S 곡선 · 가는 직선 · 굵은 호
function crossLine(random, width, height) {
  const roll = random();
  if (roll < 0.2) return '';
  if (roll < 0.35) {
    // 굵은 S 곡선 (가로로 그림을 거의 다 지난다)
    const y = between(random, height * 0.3, height * 0.7);
    const bend = between(random, 30, 55) * (random() < 0.5 ? 1 : -1);
    return `<path d="M8 ${tenth(y)} C${tenth(width * 0.3)} ${tenth(y - bend)} ${tenth(width * 0.6)} ${tenth(y + bend)} ${width - 8} ${tenth(y - bend * 0.4)}" fill="none" stroke="${INK.black}" stroke-width="6" stroke-linecap="round"/>`;
  }
  if (roll < 0.7) {
    const [startY, endY] = [between(random, 0.2, 0.95) * height, between(random, 0.05, 0.8) * height];
    return `<line x1="0" y1="${tenth(startY)}" x2="${width}" y2="${tenth(endY)}" stroke="${INK.black}" stroke-width="3"/>`;
  }
  const startX = between(random, 10, width * 0.3);
  const startY = between(random, height * 0.5, height - 15);
  const endX = startX + between(random, 90, 160);
  const endY = startY - between(random, -30, 40);
  return `<path d="M${tenth(startX)} ${tenth(startY)} Q${tenth((startX + endX) / 2)} ${tenth(startY - between(random, 50, 90))} ${tenth(endX)} ${tenth(endY)}" fill="none" stroke="${INK.black}" stroke-width="8" stroke-linecap="round"/>`;
}

// 두 상자 [왼, 위, 오른, 아래] 가 겹친 넓이
const overlap = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

// 보통 그림 하나 (ok = 칸이 저마다 다른가)
function attempt(cols, rows, seed) {
  const random = rng(seed);
  const width = cols * 100;
  const height = rows * 100;
  const tiles = cols * rows;
  const paletteName = pick(random, Object.keys(PALETTES));
  const colors = shuffle(random, PALETTES[paletteName]);
  const { list, seams } = panels(random, width, height, Math.min(5, Math.max(2, Math.round(tiles / 2.2) + 1)));
  const panelColor = list.map((_, i) => colors[i % colors.length]);
  const groundAt = (x, y) => {
    const i = list.findIndex((poly) => inside([x, y], poly));
    return i < 0 ? PAPER : panelColor[i];
  };
  const tileBox = (tile) => [(tile % cols) * 100, Math.floor(tile / cols) * 100, (tile % cols) * 100 + 100, Math.floor(tile / cols) * 100 + 100];
  const heroKinds = shuffle(random, HERO_KINDS).slice(0, tiles >= 9 ? 3 : tiles >= 6 ? 2 : 1);
  // 큰 모양이 칸 귀퉁이를 조금만 스치면 그 조각에 부스러기가 남는다 (상자 기준, 겹친 쪽 길이가 18 미만) → 자리를 다시 뽑는다
  const grazes = (shape) => [...Array(tiles).keys()].some((tile) => {
    const box = tileBox(tile);
    const across = Math.min(shape.box[2], box[2]) - Math.max(shape.box[0], box[0]);
    const down = Math.min(shape.box[3], box[3]) - Math.max(shape.box[1], box[1]);
    return across > 0 && down > 0 && Math.min(across, down) < 18;
  });
  const heroes = heroKinds.map((kind) => {
    let shape;
    for (let tries = 0; tries < 12; tries++) {
      shape = hero(random, kind, width, height, groundAt);
      if (!grazes(shape)) break;
    }
    return shape;
  });
  const line = crossLine(random, width, height);

  // 칸마다 작은 무늬 (큰 모양이 칸의 35% 넘게 덮으면 대개 건너뛴다)
  const bag = [];
  const accents = [];
  for (const tile of shuffle(random, [...Array(tiles).keys()])) {
    const box = tileBox(tile);
    const covered = heroes.some((shape) => overlap(shape.box, box) > 3500);
    if (covered && random() < 0.8) continue;
    if (!bag.length) bag.push(...shuffle(random, ACCENT_KINDS));
    const kind = bag.pop();
    const size = between(random, 48, 64);
    for (let tries = 0; tries < 25; tries++) {
      const margin = size / 2 + 8;
      const x = between(random, box[0] + margin, box[2] - margin);
      const y = between(random, box[1] + margin, box[3] - margin);
      const mine = [x - size / 2, y - size / 2, x + size / 2, y + size / 2];
      // 큰 모양의 가운데(덮은 넓이가 큰 곳)는 피한다
      if (heroes.some((shape) => overlap(shape.box, mine) > size * size * 0.35)) continue;
      const color = inkOn(random, groundAt(x, y));
      const turn = Math.round(between(random, 0, 360));
      accents.push({ tile, kind, color, x: tenth(x), y: tenth(y), size: tenth(size), turn });
      break;
    }
  }

  // 칸 표: 덮은 큰 모양 + 제 무늬 + 바탕 종이 색. 같은 표의 두 칸이 있거나, 아무것도 없는 칸이 있으면 실패
  const signatures = [...Array(tiles).keys()].map((tile) => {
    const box = tileBox(tile);
    const parts = heroes.map((shape, i) => (overlap(shape.box, box) > 1500 ? `h${i}` : null)).filter(Boolean);
    accents.filter((accent) => accent.tile === tile).forEach((accent) => parts.push(accent.kind));
    const features = parts.length;
    parts.push(groundAt(box[0] + 50, box[1] + 50));
    return { key: parts.sort().join('|'), features };
  });
  const ok = !heroes.some(grazes) && new Set(signatures.map((one) => one.key)).size === tiles && signatures.every((one) => one.features > 0);

  const parts = (prefix) => [
    ['defs', `<defs><pattern id="${prefix}checker" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${INK.white}"/><rect width="8" height="8" fill="${INK.black}"/><rect x="8" y="8" width="8" height="8" fill="${INK.black}"/></pattern><pattern id="${prefix}stripes" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${INK.white}"/><rect width="10" height="5" fill="${INK.blue}"/></pattern></defs>`],
    ...list.map((poly, i) => [`panel${i}`, `<polygon points="${poly.map(([x, y]) => `${tenth(x)},${tenth(y)}`).join(' ')}" fill="${panelColor[i]}"/>`]),
    ...seams.map((cut, i) => [`seam${i}`, `<line x1="${tenth(cut[0][0])}" y1="${tenth(cut[0][1])}" x2="${tenth(cut[1][0])}" y2="${tenth(cut[1][1])}" stroke="${PAPER}" stroke-width="7"/>`]),
    ...heroes.map((shape, i) => [`hero${i}`, shape.svg]),
    ['line', line],
    ...accents.map((accent, i) => [`a${i}`,
      ACCENTS[accent.kind](accent.x, accent.y, accent.size, accent.color, accent.turn, prefix),
      ACCENTS[SIBLING[accent.kind]](accent.x, accent.y, accent.size, accent.color, accent.turn, prefix)]),
  ];
  return { ok, cols, rows, seed, palette: paletteName, heroes: heroKinds, accents, parts };
}

// ---------- 차분한 그림 (낮은 단계) ----------
// 작은 무늬 없이 굵은 큰 모양 몇 개만. 모양마다 이웃한 두 칸의 경계에 가운데를 두어 두 칸에 반씩 걸친다.
// 그래서 조각마다 큰 모양 하나의 큰 부분(세모의 왼쪽, 원의 아래쪽 …)이 보이고, 조각끼리는 모양과 '어느 쪽이 보이나'로 갈린다 (색이 아니라).
// 칸을 빠짐없이 덮도록 이웃한 칸끼리 짝을 지어 짝마다 모양 하나: 1×2 → 1개, 2×2 → 2개, 2×3 → 3개. 종이는 2장, 선 없음.
// 낮은 단계에는 바꾼 조각이 없으므로 작은 무늬가 필요 없다 (accents 는 빈 목록).
// 모양: (x, y) 가운데, 반지름 radius, 색 color · color2 (동심원 안쪽), 돌린 각도 turn, 무늬 id 머리말 prefix
const CALM_SHAPES = {
  disc: (x, y, radius, color) => `<circle cx="${tenth(x)}" cy="${tenth(y)}" r="${tenth(radius)}" fill="${color}"/>`,
  rings: (x, y, radius, color, turn, prefix, color2) => `<circle cx="${tenth(x)}" cy="${tenth(y)}" r="${tenth(radius)}" fill="${color}"/><circle cx="${tenth(x)}" cy="${tenth(y)}" r="${tenth(radius * 0.58)}" fill="${color2}"/><circle cx="${tenth(x)}" cy="${tenth(y)}" r="${tenth(radius * 0.22)}" fill="${color}"/>`,
  tri: (x, y, radius, color, turn) => `<polygon points="${[0, 120, 240].map((degrees) => { const a = ((degrees + turn) * Math.PI) / 180; return `${tenth(x + Math.sin(a) * radius * 1.2)},${tenth(y - Math.cos(a) * radius * 1.2)}`; }).join(' ')}" fill="${color}"/>`,
  square: (x, y, radius, color, turn) => `<rect x="${tenth(x - radius * 0.8)}" y="${tenth(y - radius * 0.8)}" width="${tenth(radius * 1.6)}" height="${tenth(radius * 1.6)}" fill="${color}" transform="rotate(${turn % 90} ${tenth(x)} ${tenth(y)})"/>`,
  half: (x, y, radius, color, turn) => `<path d="M${tenth(x - radius * 1.1)} ${tenth(y + radius * 0.3)} A${tenth(radius * 1.1)} ${tenth(radius * 1.1)} 0 0 1 ${tenth(x + radius * 1.1)} ${tenth(y + radius * 0.3)} Z" fill="${color}" transform="rotate(${turn} ${tenth(x)} ${tenth(y)})"/>`,
  arch: (x, y, radius, color, turn) => `<path d="M${tenth(x - radius * 0.85)} ${tenth(y + radius * 0.4)} A${tenth(radius * 0.85)} ${tenth(radius * 0.85)} 0 0 1 ${tenth(x + radius * 0.85)} ${tenth(y + radius * 0.4)}" fill="none" stroke="${color}" stroke-width="${tenth(radius * 0.4)}" transform="rotate(${turn} ${tenth(x)} ${tenth(y)})"/>`,
  checker: (x, y, radius, color, turn, prefix) => `<rect x="${tenth(x - radius * 0.75)}" y="${tenth(y - radius * 0.75)}" width="${tenth(radius * 1.5)}" height="${tenth(radius * 1.5)}" fill="url(#${prefix}checker)" stroke="${INK.black}" stroke-width="4" transform="rotate(${turn % 30} ${tenth(x)} ${tenth(y)})"/>`,
  stripes: (x, y, radius, color, turn, prefix) => `<circle cx="${tenth(x)}" cy="${tenth(y)}" r="${tenth(radius)}" fill="url(#${prefix}stripes)" stroke="${INK.blue}" stroke-width="4"/>`,
  star: (x, y, radius, color, turn) => `<polygon points="${Array.from({ length: 10 }, (_, i) => { const a = ((-90 + turn % 72 + i * 36) * Math.PI) / 180; const rad = (i % 2 ? 0.5 : 1.2) * radius; return `${tenth(x + Math.cos(a) * rad)},${tenth(y + Math.sin(a) * rad)}`; }).join(' ')}" fill="${color}"/>`,
};

// 차분한 그림 하나 (ok = 칸이 저마다 다르고, 모양이 칸을 조금만 스치지 않는가)
function calmAttempt(cols, rows, seed) {
  const random = rng(seed);
  const width = cols * 100;
  const height = rows * 100;
  const tiles = cols * rows;
  const paletteName = pick(random, Object.keys(PALETTES));
  const colors = shuffle(random, PALETTES[paletteName]);
  const { list, seams } = panels(random, width, height, 2);
  const panelColor = list.map((_, i) => colors[i]);
  const groundAt = (x, y) => {
    const i = list.findIndex((poly) => inside([x, y], poly));
    return i < 0 ? PAPER : panelColor[i];
  };
  const tileBox = (tile) => [(tile % cols) * 100, Math.floor(tile / cols) * 100, (tile % cols) * 100 + 100, Math.floor(tile / cols) * 100 + 100];

  // 이웃한 칸끼리 짝짓기 (모든 칸이 한 번씩). 짝이 남지 않은 칸은 제 칸 가운데에 모양을 둔다
  const left = new Set([...Array(tiles).keys()]);
  const pairs = [];
  for (const tile of shuffle(random, [...left])) {
    if (!left.has(tile)) continue;
    left.delete(tile);
    const neighbours = shuffle(random, [tile - cols, tile + cols, tile % cols ? tile - 1 : -1, (tile + 1) % cols ? tile + 1 : -1].filter((other) => left.has(other)));
    if (neighbours.length) {
      left.delete(neighbours[0]);
      pairs.push([tile, neighbours[0]]);
    } else pairs.push([tile]);
  }

  const kinds = shuffle(random, Object.keys(CALM_SHAPES));
  const shapes = pairs.map((pair, i) => {
    const kind = kinds[i];
    const radius = between(random, 34, 42);
    const [a, b] = pair.map(tileBox);
    let x;
    let y;
    if (!b) [x, y] = [a[0] + 50, a[1] + 50];
    else if (a[1] === b[1]) [x, y] = [Math.max(a[0], b[0]) + between(random, -14, 14), a[1] + 50 + between(random, -14, 14)]; // 좌우 경계
    else [x, y] = [a[0] + 50 + between(random, -14, 14), Math.max(a[1], b[1]) + between(random, -14, 14)]; // 위아래 경계
    const color = inkOn(random, groundAt(x, y), [], 2);
    const color2 = inkOn(random, color, [], 1.8);
    const turn = Math.round(between(random, 0, 360));
    const reach = radius * 1.2;
    return { kind, pair, x, y, radius, box: [x - reach, y - reach, x + reach, y + reach], svg: CALM_SHAPES[kind](x, y, radius, color, turn, '__P__', color2) };
  });

  // 칸 표: 걸친 모양 + 모양의 가운데가 칸의 어느 쪽에 있나 + 바탕 종이 색. 모양이 칸을 조금만 스치면 실패
  let grazes = false;
  const signatures = [...Array(tiles).keys()].map((tile) => {
    const box = tileBox(tile);
    const parts = [];
    for (const shape of shapes) {
      const across = Math.min(shape.box[2], box[2]) - Math.max(shape.box[0], box[0]);
      const down = Math.min(shape.box[3], box[3]) - Math.max(shape.box[1], box[1]);
      if (across <= 0 || down <= 0) continue;
      if (Math.min(across, down) < 18) grazes = true;
      const side = (shape.x < box[0] + 35 ? 'L' : shape.x > box[0] + 65 ? 'R' : 'C') + (shape.y < box[1] + 35 ? 'U' : shape.y > box[1] + 65 ? 'D' : 'C');
      parts.push(`${shape.kind}:${side}`);
    }
    const features = parts.length;
    parts.push(groundAt(box[0] + 50, box[1] + 50));
    return { key: parts.sort().join('|'), features };
  });
  const ok = !grazes && new Set(signatures.map((one) => one.key)).size === tiles && signatures.every((one) => one.features > 0);

  const parts = (prefix) => [
    ['defs', `<defs><pattern id="${prefix}checker" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="${INK.white}"/><rect width="10" height="10" fill="${INK.black}"/><rect x="10" y="10" width="10" height="10" fill="${INK.black}"/></pattern><pattern id="${prefix}stripes" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="${INK.white}"/><rect width="12" height="6" fill="${INK.blue}"/></pattern></defs>`],
    ...list.map((poly, i) => [`panel${i}`, `<polygon points="${poly.map(([x, y]) => `${tenth(x)},${tenth(y)}`).join(' ')}" fill="${panelColor[i]}"/>`]),
    ...seams.map((cut, i) => [`seam${i}`, `<line x1="${tenth(cut[0][0])}" y1="${tenth(cut[0][1])}" x2="${tenth(cut[1][0])}" y2="${tenth(cut[1][1])}" stroke="${PAPER}" stroke-width="7"/>`]),
    ...shapes.map((shape, i) => [`shape${i}`, shape.svg.replaceAll('__P__', prefix)]),
  ];
  return { ok, cols, rows, seed, palette: paletteName, heroes: shapes.map((shape) => shape.kind), accents: [], parts };
}

// 칸이 저마다 다른 그림이 나올 때까지 씨앗을 바꿔 가며 만든다 (calm = 차분한 그림). 50번 안에 못 만들면 마지막 그림에 failed 를 붙인다
export function makePicture(cols, rows, seed, { calm = false } = {}) {
  const build = calm ? calmAttempt : attempt;
  for (let i = 0; i < 50; i++) {
    const pic = build(cols, rows, seed * 7919 + i);
    if (pic.ok) return { ...pic, seed, attempts: i + 1 };
  }
  return { ...build(cols, rows, seed * 7919), seed, attempts: 50, failed: true };
}

// 그림 svg. tile = 칸 번호 (없으면 그림 전체), alter = 그 칸의 작은 무늬를 짝 모양으로 바꿔 그릴지
let uid = 0;
export function pictureSvg(pic, tile = null, alter = false) {
  const prefix = `art${uid++}-`;
  const box = tile == null ? `0 0 ${pic.cols * 100} ${pic.rows * 100}` : `${(tile % pic.cols) * 100} ${Math.floor(tile / pic.cols) * 100} 100 100`;
  // 바꾼 조각: 그 칸의 작은 무늬만 바꾼다 (작은 무늬는 칸 경계에 걸치지 않으므로 칸마다 따로 있다)
  const mine = alter ? new Set(pic.accents.map((accent, i) => (accent.tile === tile ? `a${i}` : null)).filter(Boolean)) : null;
  const body = pic.parts(prefix).map(([id, svg, alt]) => (alter && alt && mine.has(id) ? alt : svg)).join('');
  const paper = `<rect width="${pic.cols * 100}" height="${pic.rows * 100}" fill="${PAPER}"/>`; // 종이 사이 틈은 흰 종이
  return `<svg viewBox="${box}" aria-hidden="true">${paper}${body}</svg>`;
}

// 소개 그림의 1×2 손 그림: 파란 종이 위 동심원 | 분홍 종이 위 검은 세모
export const INTRO_PICTURE = {
  cols: 2, rows: 1, accents: [],
  parts: () => [
    ['blue', '<polygon points="0,0 132,0 124,100 0,100" fill="#2c5aa0"/>'],
    ['pink', '<polygon points="138,0 200,0 200,100 130,100" fill="#e98a9b"/>'],
    ['rings', '<circle cx="50" cy="52" r="36" fill="#f2b928"/><circle cx="54" cy="48.4" r="22" fill="#d94b3d"/><circle cx="56.5" cy="45.5" r="8.3" fill="#fbf8f1"/>'],
    ['tri', '<polygon points="146,16 192,24 168,84" fill="#1d1d1f"/>'],
    ['line', '<line x1="0" y1="92" x2="200" y2="30" stroke="#1d1d1f" stroke-width="3"/>'],
  ],
};
