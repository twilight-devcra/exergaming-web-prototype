// 그림 조각 기억하기 (art) — 목업용 손 그림 (A+C 화풍: 색종이 바탕 위에 원·선·체크·지그재그). 설계 카드: docs/games/drafts/art.md
// 칸 하나 = 100 단위. 그림 크기 = cols×100 × rows×100. 그림이 정사각형일 필요는 없다 (1×2, 2×3, 3×4 …).
// parts = 그리는 차례대로 [id, svg] 또는 [id, svg, alt]. alt 는 '바꾼 조각' 보기에서 그 부분 대신 그리는 모양
// (색만 바꾸지 않고 모양을 바꾼다: 지그재그 → 곧은 줄, 원 → 네모).
// 작은 무늬는 칸 경계(100 의 배수)에 걸치지 않게 놓는다. 걸치면 두 조각에 무늬 부스러기가 남아 실수처럼 보인다.
export const C = {
  paper: '#fbf8f1', red: '#d94b3d', blue: '#2c5aa0', yellow: '#f2b928', black: '#1d1d1f',
  teal: '#2a9d8f', pink: '#e98a9b', sky: '#a9cde3', white: '#fbf8f1',
};

// 무늬 (userSpaceOnUse 라 잘라도 이웃 칸과 이어진다). p = svg 마다 다른 id 머리말
export const defs = (p) => `<defs>
  <pattern id="${p}checker" width="20" height="20" patternUnits="userSpaceOnUse">
    <rect width="20" height="20" fill="${C.white}"/><rect width="10" height="10" fill="${C.black}"/><rect x="10" y="10" width="10" height="10" fill="${C.black}"/>
  </pattern>
  <pattern id="${p}stripes" width="12" height="12" patternUnits="userSpaceOnUse">
    <rect width="12" height="12" fill="${C.white}"/><rect width="12" height="6" fill="${C.blue}"/>
  </pattern>
</defs>`;

const poly = (points, fill) => `<polygon points="${points}" fill="${fill}"/>`;
const rings = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.yellow}"/>` +
  `<circle cx="${cx + r * 0.11}" cy="${cy - r * 0.1}" r="${r * 0.61}" fill="${C.red}"/>` +
  `<circle cx="${cx + r * 0.18}" cy="${cy - r * 0.18}" r="${r * 0.23}" fill="${C.white}"/>`;
const dots = (xs, y, fill = C.black, r = 6) => xs.map((x) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`).join('');
const zigzag = (x, y, teeth, w = 18, h = 20) => `<polyline points="${Array.from({ length: teeth * 2 + 1 }, (_, i) => `${x + i * w},${i % 2 ? y - h : y}`).join(' ')}" fill="none" stroke="${C.black}" stroke-width="6" stroke-linejoin="round"/>`;
const bar = (x, y, length) => `<line x1="${x}" y1="${y - 10}" x2="${x + length}" y2="${y - 10}" stroke="${C.black}" stroke-width="6" stroke-linecap="round"/>`;
const checker = (p, cx, cy, size, turn = 14) => `<g transform="rotate(${turn} ${cx} ${cy})"><rect x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" fill="url(#${p}checker)" stroke="${C.black}" stroke-width="3"/></g>`;
const ring = (cx, cy, r, stroke = C.white) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="5"/>`;
const joint = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="13" fill="${C.white}" stroke="${C.black}" stroke-width="3"/>`;
const halfDisc = (cx, bottom, r) => `<path d="M${cx - r} ${bottom} A${r} ${r} 0 0 1 ${cx + r} ${bottom} Z" fill="${C.red}"/>`;
const line = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.black}" stroke-width="3"/>`;
const arc = (d) => `<path d="${d}" fill="none" stroke="${C.black}" stroke-width="9" stroke-linecap="round"/>`;

export const PICTURES = {
  // Lv1 · 1×2: 파란 종이 위 동심원 | 분홍 종이 위 검은 세모
  p12: {
    cols: 2, rows: 1,
    parts: (p) => [
      ['blue', poly('0,0 132,0 124,100 0,100', C.blue)],
      ['pink', poly('138,0 200,0 200,100 130,100', C.pink)],
      ['rings', rings(50, 52, 36)],
      ['tri', poly('146,16 192,24 168,84', C.black)],
      ['line', line(0, 92, 200, 30)],
    ],
  },
  // Lv2 · 2×2
  p22: {
    cols: 2, rows: 2,
    parts: (p) => [
      ['blue', poly('0,0 128,0 120,78 0,70', C.blue)],
      ['pink', poly('134,0 200,0 200,84 126,84', C.pink)],
      ['yellow', poly('0,76 118,84 112,200 0,200', C.yellow)],
      ['teal', poly('124,90 200,90 200,200 118,200', C.teal)],
      ['rings', rings(50, 36, 28)],
      ['tri', poly('144,10 192,16 168,66', C.black)],
      ['dots', dots([20, 38, 56, 74], 176)],
      ['checker', checker(p, 150, 152, 54)],
      ['line', line(0, 190, 200, 20)],
    ],
  },
  // Lv3 · 2×3 (표준): 왼쪽 파란 종이 한 장이 위아래 두 칸에 걸친다
  p23: {
    cols: 3, rows: 2,
    parts: (p) => [
      ['blue', poly('0,0 128,0 122,200 0,200', C.blue)],
      ['pink', poly('134,0 300,0 300,66 132,74', C.pink)],
      ['yellow', poly('130,80 214,78 210,200 128,200', C.yellow)],
      ['teal', poly('220,72 300,70 300,200 216,200', C.teal)],
      ['rings', rings(52, 54, 40)],
      ['wdots', dots([22, 44, 66], 168, C.white, 7)],
      ['zigzag', zigzag(138, 52, 2, 14, 18), bar(138, 52, 56)],
      ['tri', poly('218,10 288,18 252,64', C.black)],
      ['half', halfDisc(156, 200, 38)],
      ['checker', checker(p, 252, 152, 52)],
      ['line', line(0, 130, 300, 10)],
    ],
  },
  // Lv4–6 · 3×3: 화풍 비교의 A+C 그림
  p33: {
    cols: 3, rows: 3,
    parts: (p) => [
      ['blue', poly('0,0 158,0 150,172 0,164', C.blue)],
      ['pink', poly('166,0 300,0 300,138 160,128', C.pink)],
      ['yellow', poly('0,172 148,180 136,300 0,300', C.yellow)],
      ['teal', poly('156,136 300,146 300,300 144,300', C.teal)],
      ['rings', rings(72, 82, 56)],
      ['tri', poly('214,16 292,28 250,104', C.black)],
      ['half', halfDisc(142, 300, 46)],
      ['checker', checker(p, 232, 228, 72)],
      ['line', line(0, 262, 300, 44)],
      ['arc', arc('M16 240 Q66 164 136 186')],
      ['zigzag', zigzag(214, 168, 2), bar(214, 168, 72)],
      ['joint', joint(154, 132)],
      ['dots', dots([22, 42, 62, 82], 280)],
      ['ring', ring(270, 278, 10)],
      ['wdot', `<circle cx="180" cy="52" r="9" fill="${C.white}"/>`],
    ],
  },
  // Lv7–8 · 3×4 (가장 붐비는 판): 종이 다섯 장, 칸마다 무늬 하나 이상
  p34: {
    cols: 4, rows: 3,
    parts: (p) => [
      ['blue', poly('0,0 152,0 146,166 0,158', C.blue)],
      ['pink', poly('160,0 400,0 400,76 154,122', C.pink)],
      ['yellow', poly('0,166 144,174 136,300 0,300', C.yellow)],
      ['sky', poly('152,130 284,114 290,300 144,300', C.sky)],
      ['teal', poly('292,84 400,82 400,300 298,300', C.teal)],
      ['rings', rings(56, 58, 42)],
      ['wdots', dots([22, 42, 62], 138, C.white, 7)],
      ['wdot', `<circle cx="176" cy="44" r="9" fill="${C.white}"/>`],
      ['tri', poly('214,14 286,24 246,88', C.black)],
      ['zigzag', zigzag(314, 56, 2), bar(314, 56, 72)],
      ['joint', joint(150, 146)],
      ['circle', `<circle cx="244" cy="164" r="20" fill="${C.red}"/>`, `<rect x="225" y="145" width="38" height="38" fill="${C.red}"/>`],
      ['stripes', `<rect x="328" y="126" width="40" height="62" fill="url(#${p}stripes)" stroke="${C.blue}" stroke-width="3"/>`],
      ['arc', arc('M16 258 Q60 190 126 214')],
      ['dots', dots([20, 38, 56, 74], 282)],
      ['half', halfDisc(150, 300, 38)],
      ['checker', checker(p, 250, 252, 54)],
      ['ring', ring(352, 262, 14)],
      ['line', line(0, 290, 400, 30)],
    ],
  },
};
