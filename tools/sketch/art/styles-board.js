// 그림 조각 기억하기 (art) — 화풍 비교 (styles.html, 1단계 덤). 목업(index.html)은 board.js · pictures.js. 설계 카드: docs/games/drafts/art.md
// 손으로 그린 추상화 4가지 화풍. 모두 300×300 단위로 그리고, 칸(타일)은 그 그림을 viewBox 로 잘라 보여 준다.
// 줄무늬·물방울·체크 무늬는 userSpaceOnUse 라 잘라도 이웃 칸과 이어진다.
//
// drawBoard(body, state)
//   state.style  — STYLES 의 키
//   state.grid   — 한 줄 칸 수 (3 = 3×3)
//   state.mode   — 'study' 그림 보기 · 'flip' 칸이 뒤집히는 중 · 'hidden' 다 뒤집힘 + 보기 · 'crops' 칸을 떼어 늘어놓기 (검토용)
//   state.target — 물어보는 칸 번호 (왼쪽 위부터 0)
//   state.choices — 보기 칸 번호들 (hidden)
const SIZE = 300;
let uid = 0;

const C = {
  cream: '#f3ead6', paper: '#efe6d2', red: '#d94b3d', blue: '#2c5aa0', yellow: '#f2b928',
  black: '#1d1d1f', teal: '#2a9d8f', pink: '#e98a9b', orange: '#e8772e', sky: '#cfe0e8', white: '#fbf8f1',
};

const defs = (p) => `<defs>
  <pattern id="${p}checker" width="20" height="20" patternUnits="userSpaceOnUse">
    <rect width="20" height="20" fill="${C.white}"/><rect width="10" height="10" fill="${C.black}"/><rect x="10" y="10" width="10" height="10" fill="${C.black}"/>
  </pattern>
  <pattern id="${p}stripes" width="12" height="12" patternUnits="userSpaceOnUse">
    <rect width="12" height="12" fill="${C.white}"/><rect width="12" height="6" fill="${C.blue}"/>
  </pattern>
  <pattern id="${p}dots" width="14" height="14" patternUnits="userSpaceOnUse">
    <rect width="14" height="14" fill="${C.teal}"/><circle cx="7" cy="7" r="3.2" fill="${C.white}"/>
  </pattern>
</defs>`;

const star = (cx, cy, outer, inner, points) => Array.from({ length: points * 2 }, (_, i) => {
  const angle = (-90 + (180 / points) * i) * Math.PI / 180;
  const radius = i % 2 ? inner : outer;
  return `${(cx + Math.cos(angle) * radius).toFixed(1)},${(cy + Math.sin(angle) * radius).toFixed(1)}`;
}).join(' ');

// 화풍마다 그림 하나. p = 이 svg 안의 id 머리말
export const STYLES = {
  // A. 구성 — 동심원, 가로지르는 가는 선, 체크 무늬 판, 호, 점 줄 (칸딘스키 풍)
  comp: {
    name: 'A · 구성 (원과 선)',
    svg: (p) => `${defs(p)}
      <rect width="300" height="300" fill="${C.cream}"/>
      <polygon points="0,186 124,150 142,300 0,300" fill="${C.sky}"/>
      <circle cx="80" cy="86" r="64" fill="${C.blue}"/>
      <circle cx="90" cy="78" r="38" fill="${C.yellow}"/>
      <circle cx="97" cy="74" r="15" fill="${C.red}"/>
      <polygon points="214,16 292,28 250,104" fill="${C.red}"/>
      <path d="M100 300 A50 50 0 0 1 200 300 Z" fill="${C.teal}"/>
      <g transform="rotate(14 230 224)"><rect x="192" y="186" width="76" height="76" fill="url(#${p}checker)" stroke="${C.black}" stroke-width="3"/></g>
      <line x1="0" y1="262" x2="300" y2="44" stroke="${C.black}" stroke-width="3"/>
      <line x1="168" y1="0" x2="192" y2="300" stroke="${C.black}" stroke-width="2"/>
      <path d="M16 238 Q70 150 142 178" fill="none" stroke="${C.black}" stroke-width="9" stroke-linecap="round"/>
      <polyline points="200,154 218,134 236,154 254,134 272,154 290,134" fill="none" stroke="${C.orange}" stroke-width="6" stroke-linejoin="round"/>
      <circle cx="150" cy="130" r="13" fill="${C.pink}" stroke="${C.black}" stroke-width="2"/>
      ${[22, 42, 62, 82].map((x) => `<circle cx="${x}" cy="280" r="6" fill="${C.black}"/>`).join('')}
      <circle cx="268" cy="276" r="10" fill="none" stroke="${C.red}" stroke-width="4"/>`,
  },
  // A+C. 섞음 — C 의 색종이 바탕 위에 A 의 원·선·체크·지그재그. 바탕색에 묻히지 않게 A 의 색을 바꿨다
  //   (파란 바탕 위 동심원은 노랑·빨강·흰색, 분홍 위 세모는 검정, 반원은 빨강, 고리는 흰색)
  mix: {
    name: 'A+C · 섞음 (색종이 위 원과 선)',
    svg: (p) => `${defs(p)}
      <rect width="300" height="300" fill="${C.white}"/>
      <polygon points="0,0 158,0 150,172 0,164" fill="${C.blue}"/>
      <polygon points="166,0 300,0 300,138 160,128" fill="${C.pink}"/>
      <polygon points="0,172 148,180 136,300 0,300" fill="${C.yellow}"/>
      <polygon points="156,136 300,146 300,300 144,300" fill="${C.teal}"/>
      <circle cx="72" cy="82" r="56" fill="${C.yellow}"/>
      <circle cx="78" cy="76" r="34" fill="${C.red}"/>
      <circle cx="82" cy="72" r="13" fill="${C.white}"/>
      <polygon points="214,16 292,28 250,104" fill="${C.black}"/>
      <path d="M96 300 A46 46 0 0 1 188 300 Z" fill="${C.red}"/>
      <g transform="rotate(14 232 228)"><rect x="196" y="192" width="72" height="72" fill="url(#${p}checker)" stroke="${C.black}" stroke-width="3"/></g>
      <line x1="0" y1="262" x2="300" y2="44" stroke="${C.black}" stroke-width="3"/>
      <path d="M16 240 Q66 164 136 186" fill="none" stroke="${C.black}" stroke-width="9" stroke-linecap="round"/>
      <polyline points="196,156 214,136 232,156 250,136 268,156 286,136" fill="none" stroke="${C.black}" stroke-width="6" stroke-linejoin="round"/>
      <circle cx="154" cy="132" r="13" fill="${C.white}" stroke="${C.black}" stroke-width="3"/>
      ${[22, 42, 62, 82].map((x) => `<circle cx="${x}" cy="280" r="6" fill="${C.black}"/>`).join('')}
      <circle cx="270" cy="278" r="10" fill="none" stroke="${C.white}" stroke-width="5"/>
      <circle cx="180" cy="52" r="9" fill="${C.white}"/>`,
  },
  // B. 포스터 — 넓은 색면, 반원, 줄무늬 띠, 사분원 (바우하우스 풍)
  poster: {
    name: 'B · 포스터 (색면과 반원)',
    svg: (p) => `${defs(p)}
      <rect width="300" height="300" fill="${C.paper}"/>
      <polygon points="0,0 214,0 0,214" fill="${C.yellow}"/>
      <path d="M300 0 L300 84 A84 84 0 0 1 216 0 Z" fill="${C.teal}"/>
      <rect x="186" y="36" width="34" height="176" fill="url(#${p}stripes)" stroke="${C.blue}" stroke-width="3"/>
      <circle cx="110" cy="96" r="46" fill="${C.red}"/>
      <rect x="20" y="22" width="40" height="40" fill="${C.black}" transform="rotate(18 40 42)"/>
      <polygon points="244,120 300,118 300,196" fill="${C.pink}"/>
      <line x1="0" y1="212" x2="300" y2="212" stroke="${C.black}" stroke-width="5"/>
      <path d="M50 300 A92 92 0 0 1 234 300 Z" fill="${C.black}"/>
      <path d="M104 300 A38 38 0 0 1 180 300 Z" fill="${C.red}"/>
      <rect x="246" y="232" width="54" height="68" fill="url(#${p}dots)"/>
      <circle cx="30" cy="250" r="14" fill="none" stroke="${C.blue}" stroke-width="6"/>
      <circle cx="150" cy="176" r="8" fill="${C.blue}"/>`,
  },
  // C. 종이 오리기 — 색종이 바탕 위 잎, 별, 물결 (마티스 풍)
  cutout: {
    name: 'C · 종이 오리기 (잎과 물결)',
    svg: (p) => `${defs(p)}
      <rect width="300" height="300" fill="${C.white}"/>
      <polygon points="0,0 158,0 150,172 0,164" fill="${C.blue}"/>
      <polygon points="166,0 300,0 300,138 160,128" fill="${C.pink}"/>
      <polygon points="0,172 148,180 136,300 0,300" fill="${C.yellow}"/>
      <polygon points="156,136 300,146 300,300 144,300" fill="${C.teal}"/>
      <path d="M72 160 C62 130 32 120 24 96 C44 100 54 108 62 112 C44 86 28 70 34 40 C54 56 62 80 68 96 C66 70 70 40 86 14 C96 40 90 70 84 96 C94 76 106 60 130 54 C122 80 102 100 88 116 C102 110 116 110 132 118 C112 130 92 136 80 160 Z" fill="${C.white}"/>
      <polygon points="${star(230, 62, 50, 20, 7)}" fill="${C.black}"/>
      <path d="M8 252 C40 208 70 272 104 228 C136 188 164 252 196 214 L204 234 C168 274 138 212 106 252 C74 292 42 232 14 274 Z" fill="${C.white}"/>
      <circle cx="240" cy="222" r="36" fill="${C.red}"/>
      <path d="M262 270 A26 26 0 1 1 290 300 A20 20 0 1 0 262 270 Z" fill="${C.black}"/>
      ${[[180, 160], [202, 176], [184, 190]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="${C.yellow}"/>`).join('')}
      <path d="M40 196 l14 0 l-7 14 z M70 186 l14 0 l-7 14 z" fill="${C.red}"/>`,
  },
  // D. 선과 별 — 굵은 검은 곡선, 테두리 친 색 덩어리, 별, 초승달, 눈 (미로 풍)
  lines: {
    name: 'D · 선과 별 (곡선과 기호)',
    svg: (p) => `${defs(p)}
      <rect width="300" height="300" fill="${C.cream}"/>
      <path d="M118 176 C150 160 176 196 160 224 C140 256 100 236 104 206 C106 190 110 182 118 176 Z" fill="${C.yellow}"/>
      <path d="M8 206 C60 116 120 262 170 168 S260 54 292 122" fill="none" stroke="${C.black}" stroke-width="7" stroke-linecap="round"/>
      <path d="M44 70 C44 26 136 26 136 70 C136 112 44 112 44 70 Z" fill="${C.red}" stroke="${C.black}" stroke-width="5"/>
      <circle cx="90" cy="70" r="15" fill="${C.white}" stroke="${C.black}" stroke-width="4"/><circle cx="92" cy="72" r="6" fill="${C.black}"/>
      <circle cx="240" cy="58" r="36" fill="${C.blue}"/><circle cx="256" cy="46" r="30" fill="${C.cream}"/>
      <circle cx="270" cy="176" r="13" fill="${C.pink}" stroke="${C.black}" stroke-width="4"/>
      <g stroke="${C.black}" stroke-width="5" stroke-linecap="round">
        <line x1="204" y1="232" x2="260" y2="232"/><line x1="232" y1="204" x2="232" y2="260"/>
        <line x1="212" y1="212" x2="252" y2="252"/><line x1="252" y1="212" x2="212" y2="252"/>
      </g>
      <circle cx="232" cy="232" r="8" fill="${C.yellow}" stroke="${C.black}" stroke-width="3"/>
      <path d="M232 204 C226 180 244 172 236 150" fill="none" stroke="${C.black}" stroke-width="2.5"/>
      <polygon points="150,96 176,140 124,140" fill="${C.teal}" stroke="${C.black}" stroke-width="3"/>
      <circle cx="34" cy="262" r="12" fill="${C.black}"/>
      <circle cx="184" cy="28" r="7" fill="${C.black}"/>
      <path d="M60 300 C60 270 96 262 110 286 C118 300 140 296 140 300 Z" fill="${C.teal}" stroke="${C.black}" stroke-width="3"/>
      <path d="M262 290 l10 -18 l10 18 z" fill="${C.red}"/>
      <line x1="20" y1="140" x2="34" y2="156" stroke="${C.black}" stroke-width="3"/><line x1="34" y1="140" x2="20" y2="156" stroke="${C.black}" stroke-width="3"/>`,
  },
};

// 칸 하나 (또는 전체 그림) 를 svg 로. tile = 칸 번호, 없으면 전체
export function pictureSvg(style, grid = 3, tile = null) {
  const p = `art${uid++}-`;
  const step = SIZE / grid;
  const box = tile == null ? `0 0 ${SIZE} ${SIZE}` : `${(tile % grid) * step} ${Math.floor(tile / grid) * step} ${step} ${step}`;
  return `<svg viewBox="${box}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${STYLES[style].svg(p)}</svg>`;
}

const back = (extra = '') => `<div class="art-back ${extra}">${extra.includes('target') ? '<span>?</span>' : ''}</div>`;

function grid(state, tileContent) {
  const wrap = document.createElement('div');
  wrap.className = 'art-pic';
  wrap.style.setProperty('--n', state.grid);
  for (let i = 0; i < state.grid * state.grid; i++) {
    const cell = document.createElement('div');
    cell.className = 'art-tile';
    cell.innerHTML = tileContent(i);
    wrap.append(cell);
  }
  return wrap;
}

export function drawBoard(body, state) {
  const n = state.grid;
  const board = document.createElement('div');
  board.className = `art-board mode-${state.mode}`;

  if (state.mode === 'study') {
    board.append(grid(state, (i) => pictureSvg(state.style, n, i)));
  } else if (state.mode === 'flip') {
    // 왼쪽 위부터 대각선 차례로 뒤집힌다: 대각선 번호 d 가 front 보다 작으면 다 뒤집힘, 같으면 반쯤
    board.append(grid(state, (i) => {
      const d = (i % n) + Math.floor(i / n);
      if (d < state.front) return back();
      if (d === state.front) return `<div class="art-half">${back()}</div>`;
      return pictureSvg(state.style, n, i);
    }));
  } else if (state.mode === 'crops') {
    board.append(grid(state, (i) => pictureSvg(state.style, n, i)));
    const crops = grid(state, (i) => pictureSvg(state.style, n, i));
    crops.classList.add('art-crops');
    board.append(crops);
  } else {
    board.append(grid(state, (i) => back(i === state.target ? 'target' : '')));
    const choices = document.createElement('div');
    choices.className = 'art-choices';
    for (const tile of state.choices) {
      const button = document.createElement('button');
      button.className = 'art-choice';
      if (state.reveal != null && tile === state.target) button.classList.add('right');
      if (state.reveal === tile && tile !== state.target) button.classList.add('wrong');
      button.innerHTML = pictureSvg(state.style, n, tile);
      choices.append(button);
    }
    board.append(choices);
  }
  body.append(board);
}
