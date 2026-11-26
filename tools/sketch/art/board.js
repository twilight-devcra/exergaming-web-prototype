// 그림 조각 기억하기 (art) — 목업 판 그리기. 목업(index.html)과 눌러 보는 스케치가 같이 쓴다. 설계 카드: docs/games/drafts/art.md
// drawBoard(body, state)
//   pic      — PICTURES 의 키 (pictures.js)
//   mode     — 'study' 그림 보기 · 'flip' 칸이 뒤집히는 중 · 'ask' 노란 칸 + 보기 · 'right' 맞힘 · 'wrong' 틀림 (정답 표시)
//   front    — flip: 지금 반쯤 돌아간 대각선 번호 (왼쪽 위 = 0). 그보다 앞은 다 뒤집힘
//   target   — 물어보는 칸 번호 (왼쪽 위부터 줄 순서, 0 부터)
//   choices  — 보기: 칸 번호, 또는 '5*' (5번 칸에서 무늬 하나를 바꾼 조각)
//   picked   — right / wrong: 누른 보기
//   layout   — 'big' 태블릿: 그림 옆에 큰 보기 한 줄 · 'same' 태블릿: 칸과 같은 크기의 보기 2줄 · 'phone' 위에서 아래로
// 크기는 판 자리를 재어 정한다 (진짜 게임은 ResizeObserver). 칸 --t, 보기 --c. 키우는 데 끝이 있다 (TILE_MAX)
import { PICTURES, defs, C } from './pictures.js';

const TILE_MAX = 150;
const CHOICE_BIG = 132;
let uid = 0;

const element = (tag, cls, html = '') => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.innerHTML = html;
  return node;
};

// 그림 svg. tile = 칸 번호 (없으면 그림 전체), alter = 그 칸에서 바꿔 그릴지
export function pictureSvg(picKey, tile = null, alter = false) {
  const pic = typeof picKey === 'string' ? PICTURES[picKey] : picKey; // 손 그림 이름 또는 generate.js 가 만든 그림
  const p = `art${uid++}-`;
  const box = tile == null ? `0 0 ${pic.cols * 100} ${pic.rows * 100}` : `${(tile % pic.cols) * 100} ${Math.floor(tile / pic.cols) * 100} 100 100`;
  // 바꾼 조각: 그 칸 안에 있는 부분 가운데 alt 가 있는 것을 바꾼다 (손 그림이라 칸마다 하나뿐)
  const body = pic.parts(p).map(([, svg, alt]) => (alter && alt ? alt : svg)).join('');
  const paper = `<rect width="${pic.cols * 100}" height="${pic.rows * 100}" fill="${C.paper}"/>`; // 종이 사이 틈은 흰 종이
  return `<svg viewBox="${box}" aria-hidden="true">${defs(p)}${paper}${body}</svg>`;
}
export const choiceOf = (choice) => ({ tile: parseInt(choice, 10), alter: String(choice).endsWith('*') });

const back = (target) => `<div class="art-back${target ? ' target' : ''}">${target ? '<span>?</span>' : ''}</div>`;

export function drawBoard(body, state) {
  const pic = typeof state.pic === 'string' ? PICTURES[state.pic] : state.pic;
  const { cols, rows } = pic;
  const layout = state.layout || 'big';
  const wrap = element('div', `art-board layout-${layout} mode-${state.mode}`);
  const picture = element('div', 'art-pic');
  picture.style.setProperty('--cols', cols);
  picture.style.setProperty('--rows', rows);
  const done = state.mode === 'right' || state.mode === 'wrong';
  for (let i = 0; i < cols * rows; i++) {
    const cell = element('div', 'art-tile');
    const diagonal = (i % cols) + Math.floor(i / cols);
    if (state.mode === 'study') cell.innerHTML = pictureSvg(state.pic, i);
    else if (state.mode === 'flip') {
      cell.innerHTML = diagonal < state.front ? back() : diagonal === state.front ? `<div class="art-half">${back()}</div>` : pictureSvg(state.pic, i);
    } else if (done && i === state.target) {
      cell.innerHTML = pictureSvg(state.pic, i); // 맞든 틀리든 노란 칸이 도로 뒤집혀 제 조각을 보여 준다
      cell.classList.add('shown', state.mode);
    } else cell.innerHTML = back(i === state.target);
    picture.append(cell);
  }
  wrap.append(picture);

  if (state.mode !== 'study' && state.mode !== 'flip') {
    const choices = element('div', 'art-choices');
    choices.style.setProperty('--k', state.choices.length);
    for (const choice of state.choices) {
      const { tile, alter } = choiceOf(choice);
      const button = element('button', 'art-choice', pictureSvg(state.pic, tile, alter));
      const right = tile === state.target && !alter;
      if (done && right) button.classList.add('right');
      if (done && choice === state.picked && !right) button.classList.add('wrong');
      if (button.classList.contains('right')) button.append(element('i', 'art-mark', '✓'));
      if (button.classList.contains('wrong')) button.append(element('i', 'art-mark', '✕'));
      choices.append(button);
    }
    wrap.append(choices);
  } else {
    // 그림 보기 동안 보기 자리에 점선 칸을 둔다: 보기가 나올 때 그림이 옮겨 다니지 않고, 어디에 나올지 미리 보인다
    const slots = element('div', 'art-choices');
    slots.style.setProperty('--k', state.choices.length);
    for (let i = 0; i < state.choices.length; i++) slots.append(element('div', 'art-slot'));
    wrap.append(slots);
  }
  body.append(wrap);
  fit(body, wrap, pic, state);
  return wrap;
}

// 판 자리에 맞춰 칸(--t)과 보기(--c) 크기를 정한다
function fit(body, wrap, pic, state) {
  const k = state.choices?.length || 4;
  const gap = 16;
  const run = () => {
    const W = body.clientWidth;
    const H = body.clientHeight;
    let t;
    let c;
    if (state.layout === 'phone') {
      // 보기는 한 줄. 남은 높이를 그림이 쓴다
      c = Math.min(110, Math.floor((W - (k - 1) * 12) / k));
      t = Math.min(TILE_MAX, Math.floor(W / pic.cols), Math.floor((H - c - 20) / pic.rows));
    } else if (state.layout === 'same') {
      // 보기를 칸과 같은 크기로: 2개까지는 한 줄, 3~4개는 2줄
      const perRow = k <= 2 ? k : 2;
      const lines = Math.ceil(k / perRow);
      t = Math.min(TILE_MAX, Math.floor(H / pic.rows), Math.floor((H - (lines - 1) * 12) / lines),
        Math.floor((W - 48) / (pic.cols + perRow)));
      c = t;
    } else {
      c = CHOICE_BIG;
      t = Math.min(TILE_MAX, Math.floor(H / pic.rows), Math.floor((W - 48 - k * (c + gap)) / pic.cols));
    }
    wrap.style.setProperty('--t', `${t}px`);
    wrap.style.setProperty('--c', `${c}px`);
  };
  body.artFit?.disconnect();
  body.artFit = new ResizeObserver(run);
  body.artFit.observe(body);
  run();
}

// 안내 문구 안의 제한 시간 막대를 멈춘 모습으로 (목업용). left = 남은 비율
export function staticTimer(message, left) {
  message.append(element('div', `qtimer on${left < 0.4 ? ' warn' : ''}`, `<i style="transform: scaleX(${left})"></i>`));
}
