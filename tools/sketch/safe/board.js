// 금고 열기 — 판 그리기 (스케치). 설계: docs/games/drafts/safe.md
// 한 상태(state)를 받아 판 하나를 그린다. 목업(index.html)은 손으로 쓴 상태를, 눌러 보는 스케치는 진행 중인 상태를 넘긴다.
//
// state = {
//   layout: 'below' | 'phone'
//       below — 태블릿: 열쇠 표 | 금고 문, 그 아래 번호판 한 줄 (1–9, 0)
//       phone — 휴대폰(세로, 판 자리가 좁고 길다): 열쇠 표 · 금고 문 · 번호판 2×5 를 위에서 아래로.
//               크기는 판 자리에 맞춰 함께 줄어든다 (safe.css 의 --u, fitPhone)
//   known: [[그림 id, 숫자], …]    — 열쇠 표에 숫자가 그대로 나오는 그림 (표에 놓인 차례대로)
//   clues: [[토큰, …], …]          — 높은 단계의 단서 문장. 표에서 known 줄 다음에, 같은 모양의 줄로 이어진다
//       토큰: 그림 id 는 그림으로, 수 · 연산자(+ − ×) · 관계(= < >) · '홀수' / '짝수' 는 글자로
//       예: ['heart', '=', 'moon', '+', 2] · ['star', '<', 'triangle', '<', 'moon'] · ['circle', '=', '짝수'] · ['triangle', '+', 'square', '=', 9]
//   hidden: { 그림 id: 숫자 }       — 단서로 알아내야 하는 그림의 답
//   code: [그림 id, …]             — 이번 금고의 암호
//   typed: [숫자, …]               — 지금까지 들어간 칸 (틀린 칸은 정답 숫자가 들어간다)
//   wrong: [{ at, tapped }]        — 틀린 칸과 그때 누른 숫자
//   pressed, answer                — 번호판에서 방금 누른 숫자 / 정답으로 보여 줄 숫자 (틀렸을 때)
//   result: 'open' | 'shut'        — 다 채운 뒤
// }
import { Sketch } from '../sketch.js';

const element = (tag, cls, html = '') => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.innerHTML = html;
  return node;
};

const LOCK_SHUT = '<svg viewBox="0 0 24 24" class="sf-lock"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" fill="none"/></svg>';
const LOCK_OPEN = '<svg viewBox="0 0 24 24" class="sf-lock"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.8" fill="none"/></svg>';
// 번호판: 1–9 다음 0 (휴대폰 2×5 에서 1 2 3 4 5 / 6 7 8 9 0). 0 은 어느 그림의 숫자도 아니다
export const PAD = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
const PARITY = { '홀수': 1, '짝수': 0 };

export const valuesOf = (state) => ({ ...Object.fromEntries(state.known), ...(state.hidden || {}) });
export const digitFor = (state, id) => valuesOf(state)[id];

// ---------- 단서 확인: 손으로 쓴 판에 답이 꼭 하나인지 ----------
// 문장 하나가 참인가. values = 그림마다 숫자
function holds(tokens, values) {
  const value = (token) => (typeof token === 'number' ? token : values[token]);
  const sides = [];
  const relations = [];
  let side = [];
  for (const token of tokens) {
    if (token === '=' || token === '<' || token === '>') {
      sides.push(side);
      relations.push(token);
      side = [];
    } else side.push(token);
  }
  sides.push(side);
  const evaluate = (terms) => {
    if (terms.length === 1 && terms[0] in PARITY) return { parity: PARITY[terms[0]] };
    let total = value(terms[0]);
    for (let i = 1; i < terms.length; i += 2) {
      const operand = value(terms[i + 1]);
      total = terms[i] === '+' ? total + operand : terms[i] === '−' ? total - operand : total * operand;
    }
    return total;
  };
  const results = sides.map(evaluate);
  return relations.every((relation, i) => {
    const [left, right] = [results[i], results[i + 1]];
    if (right?.parity != null) return left % 2 === right.parity;
    return relation === '=' ? left === right : relation === '<' ? left < right : left > right;
  });
}

// 숨은 그림마다 0–9 를 모두 넣어 보고, 단서를 다 만족하는 답이 하나뿐이고 그것이 hidden 인지 본다.
// 그림끼리 숫자가 달라야 한다는 가정은 쓰지 않는다 (그 가정으로만 풀리면 '남는 숫자' 로 건너뛸 수 있다)
function check(state) {
  const hiddenIds = Object.keys(state.hidden || {});
  const known = Object.fromEntries(state.known);
  const solutions = [];
  const total = 10 ** hiddenIds.length;
  for (let combo = 0; combo < total; combo++) {
    const values = { ...known };
    hiddenIds.forEach((id, i) => (values[id] = Math.floor(combo / 10 ** i) % 10));
    if ((state.clues || []).every((clue) => holds(clue, values))) solutions.push(values);
  }
  const label = `Lv${state.level}`;
  if (hiddenIds.length && solutions.length !== 1) Sketch.warn(`${label}: 답이 ${solutions.length}개`, solutions.slice(0, 5));
  else if (hiddenIds.length && hiddenIds.some((id) => solutions[0][id] !== state.hidden[id])) Sketch.warn(`${label}: 답이 hidden 과 다름`, solutions[0]);
  const digits = Object.values(valuesOf(state));
  if (new Set(digits).size !== digits.length || digits.some((digit) => digit < 1 || digit > 9)) Sketch.warn(`${label}: 숫자가 겹치거나 1–9 밖`, digits);
  const missing = state.code.filter((id) => !(id in valuesOf(state)));
  if (missing.length) Sketch.warn(`${label}: 표에 없는 그림`, missing);
}

// ---------- 그리기 ----------
const tokenHtml = (token) => {
  if (typeof token === 'string' && Sketch.symbol(token)) return Sketch.glyph(token, 'sf-kglyph');
  if (typeof token === 'number') return `<b>${token}</b>`;
  if (token in PARITY) return `<span class="sf-word">${token}</span>`;
  return `<span class="sf-op">${token}</span>`;
};

// 열쇠 표: 숫자 줄도 단서 줄도 같은 모양의 줄 (단서라고 따로 칠하거나 줄을 바꾸지 않는다)
function keyTable(state) {
  const box = element('div', 'sf-key');
  box.append(element('div', 'sf-label', '열쇠 표'));
  const rows = element('div', 'sf-krows');
  const statements = [...state.known.map(([id, digit]) => [id, '=', digit]), ...(state.clues || [])];
  for (const tokens of statements) rows.append(element('div', 'sf-krow', tokens.map(tokenHtml).join('')));
  box.classList.toggle('dense', statements.length > 6);
  box.append(rows);
  return box;
}

function door(state) {
  const typed = state.typed || [];
  const wrongAt = new Map((state.wrong || []).map((entry) => [entry.at, entry.tapped]));
  const box = element('div', `sf-door${state.result ? ` ${state.result}` : ''}`);
  box.style.setProperty('--n', state.code.length);
  const windows = element('div', 'sf-windows');
  state.code.forEach((id, i) => {
    const filled = i < typed.length;
    const current = !state.result && i === typed.length;
    const cls = ['sf-win', filled && (wrongAt.has(i) ? 'bad' : 'good'), current && 'cur'].filter(Boolean).join(' ');
    const tapped = wrongAt.has(i) ? `<s>${wrongAt.get(i)}</s>` : '';
    windows.append(element('div', `sf-col${current ? ' cur' : ''}`,
      `<div class="sf-tile">${Sketch.glyph(id, 'sf-cglyph')}</div><div class="${cls}">${filled ? typed[i] : ''}${tapped}</div>`));
  });
  box.append(windows);
  // 손잡이 자리의 자물쇠: 열리면 풀린 자물쇠(초록), 틀린 칸이 있으면 빨강
  box.append(element('div', 'sf-lockplate', state.result === 'open' ? LOCK_OPEN : LOCK_SHUT));
  return box;
}

function pad(state) {
  const box = element('div', 'sf-pad');
  for (const digit of PAD) {
    const cls = ['ar-cand', 'sf-num',
      state.pressed === digit && (state.answer != null && state.answer !== digit ? 'wrong' : 'hit'),
      state.answer === digit && state.pressed !== digit && 'answer'].filter(Boolean).join(' ');
    const button = element('button', cls, String(digit));
    button.dataset.digit = digit;
    box.append(button);
  }
  return box;
}

export function drawBoard(body, state) {
  check(state);
  const layout = state.layout || 'below';
  const wrap = element('div', `sf-wrap ${layout}`);
  if (layout === 'phone') {
    wrap.append(keyTable(state), door(state), pad(state));
  } else {
    const right = element('div', 'sf-right');
    right.append(door(state), pad(state));
    wrap.append(keyTable(state), right);
  }
  body.append(wrap);
  if (layout === 'phone') fitPhone(body, wrap);
  return wrap;
}

// 휴대폰: 판을 설계 크기(--u = 1px)로 놓고 재어 판 자리에 들어가게 --u 를 줄인다 (진짜 게임이 ResizeObserver 로 하는 일).
// 낮은 단계는 판이 작아 덜 줄어든다. 키우지는 않는다
function fitPhone(body, wrap) {
  const fit = () => {
    wrap.style.setProperty('--u', '1px');
    const scale = Math.min(1, body.clientWidth / wrap.offsetWidth, body.clientHeight / wrap.offsetHeight);
    wrap.style.setProperty('--u', `${scale}px`);
  };
  new ResizeObserver(fit).observe(body);
  document.fonts?.ready.then(fit);
  fit();
}

// 안내 문구 안의 제한 시간 막대를 멈춘 모습으로 (목업용). left = 남은 비율
export function staticTimer(message, left) {
  const bar = element('div', `qtimer on${left < 0.4 ? ' warn' : ''}`, `<i style="transform: scaleX(${left})"></i>`);
  message.append(bar);
}
