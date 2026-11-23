// 금고 열기 — 판 그리기 (스케치). 설계: docs/games/drafts/safe.md
// 한 상태(state)를 받아 판 하나를 그린다. 목업(index.html)은 손으로 쓴 상태를, 눌러 보는 스케치는 진행 중인 상태를 넘긴다.
//
// state = {
//   layout: 'door' | 'below' | 'strip'
//       door  — A. 열쇠 표 | 금고 문 | 번호판(3×3) 을 옆으로
//       below — C. 열쇠 표 | 금고 문, 그 아래 번호판 1–9 한 줄
//       strip — B. 기호표 줄(그림 위 · 숫자 아래) 위에, 금고 문, 번호판 한 줄
//       phone — 휴대폰(세로, 판 자리가 좁고 길다): 열쇠 표(여러 칸에 나눠 담음) · 금고 문 · 번호판 3×3 을 위에서 아래로.
//               크기는 판 자리에 맞춰 함께 줄어든다 (safe.css 의 --u, fitPhone)
//   key: [[그림 id, 숫자, 식?], …]  — 열쇠 표. 식이 있으면 숫자 대신 식을 보여 준다 (높은 단계)
//       식 = 토큰 배열. 그림 id 는 그림으로, 나머지(연산자 · 수)는 글자로: ['star', '+', 2], ['star', '×', 2], ['square', '+', 'plus']
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
export const PAD = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const digitFor = (state, id) => state.key.find(([shape]) => shape === id)[1];

// 식의 값 (손으로 쓴 상태가 맞는지 확인용 — 틀리면 콘솔에 알린다)
function evaluate(state, tokens) {
  const value = (token) => (typeof token === 'number' ? token : digitFor(state, token));
  let total = value(tokens[0]);
  for (let i = 1; i < tokens.length; i += 2) {
    const operand = value(tokens[i + 1]);
    total = tokens[i] === '+' ? total + operand : tokens[i] === '−' ? total - operand : total * operand;
  }
  return total;
}

const formulaHtml = (tokens, glyphClass) => tokens.map((token) =>
  (typeof token === 'string' && Sketch.symbol(token) ? Sketch.glyph(token, glyphClass) : `<span class="sf-op">${token}</span>`)).join('');

function check(state) {
  for (const [id, digit, formula] of state.key) {
    if (formula && evaluate(state, formula) !== digit) console.warn(`식이 맞지 않음: ${id} = ${formula.join(' ')} ≠ ${digit}`);
  }
  const digits = state.key.map(([, digit]) => digit);
  if (new Set(digits).size !== digits.length || digits.some((digit) => digit < 1 || digit > 9)) console.warn('숫자가 겹치거나 1–9 밖', digits);
}

// A · C: 세로 표. 식이 있는 줄은 숫자 자리에 식을 쓴다
function keyTable(state) {
  const box = element('div', 'sf-key');
  box.append(element('div', 'sf-label', '열쇠 표'));
  const rows = element('div', 'sf-krows');
  for (const [id, digit, formula] of state.key) {
    rows.append(element('div', `sf-krow${formula ? ' formula' : ''}`,
      `${Sketch.glyph(id, 'sf-kglyph')}<span class="sf-eq">=</span>${formula ? `<span class="sf-formula">${formulaHtml(formula, 'sf-fglyph')}</span>` : `<b>${digit}</b>`}`));
  }
  box.append(rows);
  return box;
}

// B: 가로 줄. 식이 있는 칸은 ? 로 두고 식은 옆 상자에 모은다
function keyStrip(state) {
  const box = element('div', 'sf-key');
  box.append(element('div', 'sf-label', '열쇠 표'));
  const rows = element('div', 'sf-krows');
  for (const [id, digit, formula] of state.key) {
    rows.append(element('div', `sf-krow${formula ? ' unknown' : ''}`, `${Sketch.glyph(id, 'sf-kglyph')}<b>${formula ? '?' : digit}</b>`));
  }
  box.append(rows);
  const formulas = state.key.filter(([, , formula]) => formula);
  if (!formulas.length) return [box];
  const clues = element('div', 'sf-clues');
  for (const [id, , formula] of formulas) {
    clues.append(element('div', 'sf-clue', `${Sketch.glyph(id, 'sf-fglyph')}<span class="sf-op">=</span>${formulaHtml(formula, 'sf-fglyph')}`));
  }
  return [box, clues];
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
  if (layout === 'door' || layout === 'phone') {
    wrap.append(keyTable(state), door(state), pad(state));
  } else if (layout === 'below') {
    const right = element('div', 'sf-right');
    right.append(door(state), pad(state));
    wrap.append(keyTable(state), right);
  } else {
    const top = element('div', 'sf-top');
    top.append(...keyStrip(state));
    wrap.append(top, door(state), pad(state));
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
