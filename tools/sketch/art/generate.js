// 그림 조각 기억하기 (art) — 그림 만들기 시제품 (A+C 화풍). 설계 카드: docs/games/drafts/art.md
// 사용자가 '만든 그림이 서로 너무 닮지 않은지' 보려고 2단계에서 미리 만들었다. 진짜 게임으로 옮길 때 다듬는다.
// makePicture(cols, rows, seed) → { cols, rows, seed, palette, heroes, attempts, parts(p) }  (pictures.js 의 손 그림과 같은 모양)
//
// 차례: 색종이 나누기 → 종이 사이 흰 틈 → 큰 모양(1~2) → 가로지르는 선 → 칸마다 작은 무늬 → 칸이 저마다 다른지 확인
//   - 색종이: 가장 넓은 종이를 비스듬히 자르기를 되풀이한다. 자른 선의 두 끝은 칸 경계에서 22 이상 떨어진다 (조각에 부스러기가 남지 않게)
//   - 작은 무늬: 칸 안에 10 이상 들어와 놓인다 (경계에 걸치지 않게). 종류는 주머니에서 꺼내듯 고르게 돌아간다
//   - 무늬 색: 그 자리 종이와 밝기 차이가 큰 색만 (색만으로 가리지 않도록 모양도 늘 다르다)
//   - 확인: 칸마다 '덮은 큰 모양 + 제 무늬 + 바탕 종이 색' 을 적고, 두 칸이 같으면 씨앗을 바꿔 다시 만든다
//   - 바꾼 조각(alt): 작은 무늬마다 모양이 다른 짝을 정해 둔다 (지그재그 → 곧은 줄, 원 → 네모 …)
const PAPER = '#fbf8f1';
const INK = { black: '#1d1d1f', white: '#fbf8f1', red: '#d94b3d', yellow: '#f2b928', blue: '#2c5aa0', orange: '#e8772e' };
export const PALETTES = {
  primary: ['#2c5aa0', '#e98a9b', '#f2b928', '#2a9d8f', '#a9cde3'],
  warm: ['#c8553d', '#e0a526', '#e9d8b4', '#7a8b45', '#7b4b6a'],
  cool: ['#23395b', '#8fd3c1', '#b9a7d9', '#9cc7e6', '#2f7f8f'],
  pop: ['#e4572e', '#2546b8', '#a4c639', '#f4a582', '#7d5ba6'],
};

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
const between = (r, a, b) => a + r() * (b - a);
const shuffle = (r, list) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
const f = (n) => Math.round(n * 10) / 10;

// ---------- 색 ----------
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
// ground 위에서 잘 보이는 잉크 하나 (avoid 는 빼고)
function inkOn(r, ground, avoid = [], min = 2.2) {
  const options = Object.values(INK).filter((ink) => ink !== ground && !avoid.includes(ink) && contrast(ink, ground) >= min);
  return options.length ? pick(r, options) : contrast(INK.black, ground) > contrast(INK.white, ground) ? INK.black : INK.white;
}

// ---------- 다각형 ----------
const area = (poly) => Math.abs(poly.reduce((sum, [x, y], i) => {
  const [nx, ny] = poly[(i + 1) % poly.length];
  return sum + x * ny - nx * y;
}, 0)) / 2;
const bbox = (poly) => {
  const xs = poly.map(([x]) => x);
  const ys = poly.map(([, y]) => y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};
// 직선 A→B 로 볼록 다각형을 둘로 나눈다. 돌려주는 것: [왼쪽, 오른쪽, 자른 선분의 두 끝]
function split(poly, A, B) {
  const side = ([x, y]) => (B[0] - A[0]) * (y - A[1]) - (B[1] - A[1]) * (x - A[0]);
  const left = [];
  const right = [];
  const cut = [];
  poly.forEach((P, i) => {
    const Q = poly[(i + 1) % poly.length];
    const sp = side(P);
    const sq = side(Q);
    (sp >= 0 ? left : right).push(P);
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq);
      const X = [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t];
      left.push(X);
      right.push(X);
      cut.push(X);
    }
  });
  return [left, right, cut];
}
const inside = ([x, y], poly) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
const offEdge = (v) => {
  const m = ((v % 100) + 100) % 100;
  return m >= 22 && m <= 78;
};

// 색종이 나누기: 가장 넓은 종이를 비스듬히 자른다
function panels(r, W, H, count) {
  let list = [[[0, 0], [W, 0], [W, H], [0, H]]];
  const seams = [];
  for (let guard = 0; list.length < count && guard < 60; guard++) {
    list.sort((a, b) => area(b) - area(a));
    const poly = list[0];
    const box = bbox(poly);
    const w = box.x1 - box.x0;
    const h = box.y1 - box.y0;
    const vertical = w > h * 1.15 ? true : h > w * 1.15 ? false : r() < 0.5;
    const span = vertical ? w : h;
    if (span < 90) break;
    const a = (vertical ? box.x0 : box.y0) + span * between(r, 0.3, 0.7);
    const b = a + between(r, -26, 26);
    if (!offEdge(a) || !offEdge(b)) continue;
    const [A, B] = vertical ? [[a, box.y0 - 1], [b, box.y1 + 1]] : [[box.x0 - 1, a], [box.x1 + 1, b]];
    const [left, right, cut] = split(poly, A, B);
    if (cut.length !== 2 || area(left) < 4000 || area(right) < 4000) continue;
    list = [left, right, ...list.slice(1)];
    seams.push(cut);
  }
  return { list, seams };
}

// ---------- 무늬 ----------
// 작은 무늬: (x, y) 가운데, 크기 s, 색 c. 모양 짝(alt)은 SIBLING
const ACCENTS = {
  tri: (x, y, s, c, turn) => `<polygon points="${[0, 120, 240].map((d) => { const a = ((d + turn) * Math.PI) / 180; return `${f(x + Math.sin(a) * s * 0.5)},${f(y - Math.cos(a) * s * 0.5)}`; }).join(' ')}" fill="${c}"/>`,
  zigzag: (x, y, s, c) => `<polyline points="${[0, 1, 2, 3, 4].map((i) => `${f(x - s / 2 + (i * s) / 4)},${f(y + (i % 2 ? -s * 0.2 : s * 0.2))}`).join(' ')}" fill="none" stroke="${c}" stroke-width="6" stroke-linejoin="round"/>`,
  bar: (x, y, s, c) => `<line x1="${f(x - s / 2)}" y1="${y}" x2="${f(x + s / 2)}" y2="${y}" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`,
  checker: (x, y, s, c, turn, p) => `<rect x="${f(x - s * 0.4)}" y="${f(y - s * 0.4)}" width="${f(s * 0.8)}" height="${f(s * 0.8)}" fill="url(#${p}checker)" stroke="${INK.black}" stroke-width="3" transform="rotate(${turn % 30} ${x} ${y})"/>`,
  stripes: (x, y, s, c, turn, p) => `<rect x="${f(x - s * 0.25)}" y="${f(y - s * 0.45)}" width="${f(s * 0.5)}" height="${f(s * 0.9)}" fill="url(#${p}stripes)" stroke="${INK.blue}" stroke-width="3"/>`,
  dots: (x, y, s, c) => [-1, 0, 1].map((i) => `<circle cx="${f(x + i * s * 0.36)}" cy="${y}" r="6" fill="${c}"/>`).join(''),
  ring: (x, y, s, c) => `<circle cx="${x}" cy="${y}" r="${f(s * 0.3)}" fill="none" stroke="${c}" stroke-width="5"/>`,
  dot: (x, y, s, c) => `<circle cx="${x}" cy="${y}" r="${f(s * 0.32)}" fill="${c}"/>`,
  square: (x, y, s, c, turn) => `<rect x="${f(x - s * 0.3)}" y="${f(y - s * 0.3)}" width="${f(s * 0.6)}" height="${f(s * 0.6)}" fill="${c}" transform="rotate(${turn % 40} ${x} ${y})"/>`,
  cross: (x, y, s, c) => `<path d="M${f(x - s * 0.3)} ${f(y - s * 0.3)}L${f(x + s * 0.3)} ${f(y + s * 0.3)}M${f(x + s * 0.3)} ${f(y - s * 0.3)}L${f(x - s * 0.3)} ${f(y + s * 0.3)}" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`,
  star: (x, y, s, c) => `<polygon points="${Array.from({ length: 10 }, (_, i) => { const a = ((-90 + i * 36) * Math.PI) / 180; const rad = (i % 2 ? 0.2 : 0.46) * s; return `${f(x + Math.cos(a) * rad)},${f(y + Math.sin(a) * rad)}`; }).join(' ')}" fill="${c}"/>`,
  wave: (x, y, s, c) => `<path d="M${f(x - s / 2)} ${y} q${f(s / 8)} ${f(-s * 0.3)} ${f(s / 4)} 0 t${f(s / 4)} 0 t${f(s / 4)} 0 t${f(s / 4)} 0" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`,
  moon: (x, y, s, c, turn) => `<path d="M${f(x - s * 0.36)} ${y} A${f(s * 0.36)} ${f(s * 0.36)} 0 0 1 ${f(x + s * 0.36)} ${y} Z" fill="${c}" transform="rotate(${turn} ${x} ${y})"/>`,
};
const ACCENT_KINDS = ['tri', 'zigzag', 'checker', 'stripes', 'dots', 'ring', 'dot', 'square', 'cross', 'star', 'wave', 'moon'];
const SIBLING = { tri: 'square', zigzag: 'bar', checker: 'stripes', stripes: 'checker', dots: 'bar', ring: 'dot', dot: 'square', square: 'dot', cross: 'ring', star: 'dot', wave: 'bar', moon: 'tri' };

// 큰 모양: 여러 칸에 걸친다
function hero(r, kind, W, H, groundAt) {
  if (kind === 'rings') {
    const R = between(r, 40, 62);
    // 가운데가 칸 경계 가까이 오면 네 칸에 똑같은 1/4 원이 생긴다 → 칸 안쪽 20~80 에
    const cx = Math.floor(between(r, 0, W / 100)) * 100 + between(r, 25, 75);
    const cy = Math.floor(between(r, 0, H / 100)) * 100 + between(r, 25, 75);
    const outer = inkOn(r, groundAt(cx, cy));
    const middle = inkOn(r, outer, [], 1.6);
    const inner = inkOn(r, middle, [outer], 1.6);
    return { kind, box: [cx - R, cy - R, cx + R, cy + R],
      svg: `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R)}" fill="${outer}"/><circle cx="${f(cx + R * 0.1)}" cy="${f(cy - R * 0.1)}" r="${f(R * 0.6)}" fill="${middle}"/><circle cx="${f(cx + R * 0.18)}" cy="${f(cy - R * 0.18)}" r="${f(R * 0.24)}" fill="${inner}"/>` };
  }
  if (kind === 'half') {
    // 그림 가장자리에 붙은 반원 (안에 작은 반원)
    const R = between(r, 44, 62);
    const edge = pick(r, H >= W ? ['left', 'right', 'bottom'] : ['bottom', 'top']);
    const along = (edge === 'left' || edge === 'right' ? H : W);
    const t = Math.floor(between(r, 0, along / 100)) * 100 + 50 + between(r, -12, 12);
    const [cx, cy, turn] = { bottom: [t, H, 0], top: [t, 0, 180], left: [0, t, 90], right: [W, t, -90] }[edge];
    const outer = inkOn(r, groundAt(Math.min(Math.max(cx, 5), W - 5), Math.min(Math.max(cy, 5), H - 5)));
    const inner = inkOn(r, outer, [], 1.6);
    return { kind, box: [cx - R, cy - R, cx + R, cy + R],
      svg: `<g transform="rotate(${turn} ${f(cx)} ${f(cy)})"><path d="M${f(cx - R)} ${f(cy)} A${f(R)} ${f(R)} 0 0 1 ${f(cx + R)} ${f(cy)} Z" fill="${outer}"/><path d="M${f(cx - R * 0.42)} ${f(cy)} A${f(R * 0.42)} ${f(R * 0.42)} 0 0 1 ${f(cx + R * 0.42)} ${f(cy)} Z" fill="${inner}"/></g>` };
  }
  if (kind === 'quarter') {
    // 그림 모서리의 큰 사분원
    const R = between(r, 62, 86);
    const [cx, cy] = pick(r, [[0, 0], [W, 0], [0, H], [W, H]]);
    const c = inkOn(r, groundAt(Math.min(Math.max(cx, 5), W - 5), Math.min(Math.max(cy, 5), H - 5)));
    return { kind, box: [cx - R, cy - R, cx + R, cy + R],
      svg: `<circle cx="${cx}" cy="${cy}" r="${f(R)}" fill="${c}"/><circle cx="${cx}" cy="${cy}" r="${f(R * 0.55)}" fill="none" stroke="${inkOn(r, c)}" stroke-width="5"/>` };
  }
  // bigTri: 큰 세모 (칸 둘에 걸치게)
  const s = between(r, 80, 110);
  const cx = Math.floor(between(r, 0, W / 100)) * 100 + between(r, 30, 70);
  const cy = Math.floor(between(r, 0, H / 100)) * 100 + between(r, 30, 70);
  const turn = between(r, 0, 360);
  const pts = [0, 120, 240].map((d) => { const a = ((d + turn) * Math.PI) / 180; return [cx + Math.sin(a) * s * 0.55, cy - Math.cos(a) * s * 0.55]; });
  return { kind, box: [cx - s * 0.55, cy - s * 0.55, cx + s * 0.55, cy + s * 0.55],
    svg: `<polygon points="${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}" fill="${inkOn(r, groundAt(cx, cy))}"/>` };
}
const HERO_KINDS = ['rings', 'half', 'quarter', 'bigTri'];

// 가로지르는 선: 가는 직선 또는 굵은 호
function crossLine(r, W, H) {
  const roll = r();
  if (roll < 0.2) return '';
  if (roll < 0.35) {
    // 굵은 S 곡선 (가로로 그림을 거의 다 지난다)
    const y = between(r, H * 0.3, H * 0.7);
    const a = between(r, 30, 55) * (r() < 0.5 ? 1 : -1);
    return `<path d="M8 ${f(y)} C${f(W * 0.3)} ${f(y - a)} ${f(W * 0.6)} ${f(y + a)} ${W - 8} ${f(y - a * 0.4)}" fill="none" stroke="${INK.black}" stroke-width="6" stroke-linecap="round"/>`;
  }
  if (roll < 0.7) {
    const [y0, y1] = [between(r, 0.2, 0.95) * H, between(r, 0.05, 0.8) * H];
    return `<line x1="0" y1="${f(y0)}" x2="${W}" y2="${f(y1)}" stroke="${INK.black}" stroke-width="3"/>`;
  }
  const x0 = between(r, 10, W * 0.3);
  const y0 = between(r, H * 0.5, H - 15);
  const x1 = x0 + between(r, 90, 160);
  const y1 = y0 - between(r, -30, 40);
  return `<path d="M${f(x0)} ${f(y0)} Q${f((x0 + x1) / 2)} ${f(y0 - between(r, 50, 90))} ${f(x1)} ${f(y1)}" fill="none" stroke="${INK.black}" stroke-width="8" stroke-linecap="round"/>`;
}

const overlap = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

function attempt(cols, rows, seed) {
  const r = rng(seed);
  const W = cols * 100;
  const H = rows * 100;
  const tiles = cols * rows;
  const paletteName = pick(r, Object.keys(PALETTES));
  const colors = shuffle(r, PALETTES[paletteName]);
  const { list, seams } = panels(r, W, H, Math.min(5, Math.max(2, Math.round(tiles / 2.2) + 1)));
  const panelColor = list.map((_, i) => colors[i % colors.length]);
  const groundAt = (x, y) => {
    const i = list.findIndex((poly) => inside([x, y], poly));
    return i < 0 ? PAPER : panelColor[i];
  };
  const tileBox = (t) => [(t % cols) * 100, Math.floor(t / cols) * 100, (t % cols) * 100 + 100, Math.floor(t / cols) * 100 + 100];
  const heroKinds = shuffle(r, HERO_KINDS).slice(0, tiles >= 9 ? 3 : tiles >= 6 ? 2 : 1);
  // 큰 모양이 칸 귀퉁이를 조금만 스치면 그 조각에 부스러기가 남는다 (상자 기준, 겹친 쪽 길이가 18 미만) → 자리를 다시 뽑는다
  const grazes = (h) => [...Array(tiles).keys()].some((t) => {
    const box = tileBox(t);
    const w = Math.min(h.box[2], box[2]) - Math.max(h.box[0], box[0]);
    const d = Math.min(h.box[3], box[3]) - Math.max(h.box[1], box[1]);
    return w > 0 && d > 0 && Math.min(w, d) < 18;
  });
  const heroes = heroKinds.map((kind) => {
    let h;
    for (let tries = 0; tries < 12; tries++) {
      h = hero(r, kind, W, H, groundAt);
      if (!grazes(h)) break;
    }
    return h;
  });
  const line = crossLine(r, W, H);

  // 칸마다 작은 무늬 (큰 모양이 칸의 35% 넘게 덮으면 반쯤은 건너뛴다)
  const bag = [];
  const accents = [];
  for (const t of shuffle(r, [...Array(tiles).keys()])) {
    const box = tileBox(t);
    const covered = heroes.some((h) => overlap(h.box, box) > 3500);
    if (covered && r() < 0.8) continue;
    if (!bag.length) bag.push(...shuffle(r, ACCENT_KINDS));
    const kind = bag.pop();
    const s = between(r, 48, 64);
    for (let tries = 0; tries < 25; tries++) {
      const margin = s / 2 + 8;
      const x = between(r, box[0] + margin, box[2] - margin);
      const y = between(r, box[1] + margin, box[3] - margin);
      const mine = [x - s / 2, y - s / 2, x + s / 2, y + s / 2];
      // 큰 모양의 가운데(덮은 넓이가 큰 곳)는 피한다
      if (heroes.some((h) => overlap(h.box, mine) > s * s * 0.35)) continue;
      const c = inkOn(r, groundAt(x, y));
      const turn = Math.round(between(r, 0, 360));
      accents.push({ tile: t, kind, color: c, x: f(x), y: f(y), s: f(s), turn });
      break;
    }
  }

  // 칸 표: 덮은 큰 모양 + 제 무늬 + 바탕 종이 색. 같은 표의 두 칸이 있거나, 아무것도 없는 칸이 있으면 실패
  const signatures = [...Array(tiles).keys()].map((t) => {
    const box = tileBox(t);
    const parts = heroes.map((h, i) => (overlap(h.box, box) > 1500 ? `h${i}` : null)).filter(Boolean);
    accents.filter((a) => a.tile === t).forEach((a) => parts.push(a.kind));
    const features = parts.length;
    parts.push(groundAt(box[0] + 50, box[1] + 50));
    return { key: parts.sort().join('|'), features };
  });
  const ok = !heroes.some(grazes) && new Set(signatures.map((s) => s.key)).size === tiles && signatures.every((s) => s.features > 0);

  const parts = (p) => [
    ['defs', `<defs><pattern id="${p}checker" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${INK.white}"/><rect width="8" height="8" fill="${INK.black}"/><rect x="8" y="8" width="8" height="8" fill="${INK.black}"/></pattern><pattern id="${p}stripes" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${INK.white}"/><rect width="10" height="5" fill="${INK.blue}"/></pattern></defs>`],
    ...list.map((poly, i) => [`panel${i}`, `<polygon points="${poly.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}" fill="${panelColor[i]}"/>`]),
    ...seams.map((cut, i) => [`seam${i}`, `<line x1="${f(cut[0][0])}" y1="${f(cut[0][1])}" x2="${f(cut[1][0])}" y2="${f(cut[1][1])}" stroke="${PAPER}" stroke-width="7"/>`]),
    ...heroes.map((h, i) => [`hero${i}`, h.svg]),
    ['line', line],
    ...accents.map((a, i) => [`a${i}`, ACCENTS[a.kind](a.x, a.y, a.s, a.color, a.turn, p), ACCENTS[SIBLING[a.kind]](a.x, a.y, a.s, a.color, a.turn, p)]),
  ];
  return { ok, cols, rows, seed, palette: paletteName, heroes: heroKinds, accents, parts };
}

// 칸이 저마다 다른 그림이 나올 때까지 씨앗을 바꿔 가며 만든다
export function makePicture(cols, rows, seed) {
  for (let i = 0; i < 50; i++) {
    const pic = attempt(cols, rows, seed * 7919 + i);
    if (pic.ok) return { ...pic, seed, attempts: i + 1 };
  }
  return { ...attempt(cols, rows, seed * 7919), seed, attempts: 50, failed: true };
}
