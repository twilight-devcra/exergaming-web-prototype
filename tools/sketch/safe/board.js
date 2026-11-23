// 금고 열기 — 판 그리기 (스케치). 설계: docs/games/drafts/safe.md
// 한 상태(state)를 받아 판 하나를 그린다. 목업(index.html)은 손으로 쓴 상태를, 눌러 보는 스케치는 진행 중인 상태를 넘긴다.
//
// state = {
//   layout: 'door' | 'strip'      — door: 열쇠 표 · 금고 문 · 번호판을 옆으로 / strip: 기호표 줄을 위에, 번호판을 아래 한 줄로
//   key: [[그림 id, 숫자], …]      — 열쇠 표 (표에 놓인 차례대로)
//   unknown: [그림 id, …]         — 표에 '?' 로 나오는 그림 (단서로 알아내야 함)
//   notes: [{ code: [id…], digits: [n…] }]  — 열렸던 암호 쪽지
//   decoys: [숫자, …]             — 번호판에만 있는 숫자. 쪽지 단계에서 '남는 숫자' 로 바로 풀리지 않게 한다
//   code: [그림 id, …]            — 이번 금고의 암호
//   typed: [숫자, …]              — 지금까지 맞게/틀리게 들어간 칸 (틀린 칸은 정답 숫자가 들어간다)
//   wrong: [{ at, tapped }]       — 틀린 칸과 그때 누른 숫자
//   pressed, answer               — 번호판에서 방금 누른 숫자 / 정답으로 보여 줄 숫자 (틀렸을 때)
//   result: 'open' | 'shut'       — 다 채운 뒤
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

export const digitsOf = (state) => [...new Set([...state.key.map(([, digit]) => digit), ...(state.decoys || [])])].sort((a, b) => a - b);
export const digitFor = (state, id) => state.key.find(([shape]) => shape === id)[1];

function keyTable(state) {
  const box = element('div', 'sf-key');
  box.append(element('div', 'sf-label', '열쇠 표'));
  const rows = element('div', 'sf-krows');
  for (const [id, digit] of state.key) {
    const unknown = state.unknown?.includes(id);
    rows.append(element('div', `sf-krow${unknown ? ' unknown' : ''}`,
      `${Sketch.glyph(id, 'sf-kglyph')}<span class="sf-eq">=</span><b>${unknown ? '?' : digit}</b>`));
  }
  box.append(rows);
  return box;
}

function notes(state) {
  if (!state.notes?.length) return null;
  const box = element('div', 'sf-notes');
  for (const note of state.notes) {
    const card = element('div', 'sf-note');
    card.append(element('div', 'sf-label', `${LOCK_OPEN} 열렸던 암호`));
    const row = element('div', 'sf-nrow');
    note.code.forEach((id, i) => row.append(element('div', 'sf-ncol', `${Sketch.glyph(id, 'sf-nglyph')}<b>${note.digits[i]}</b>`)));
    card.append(row);
    box.append(card);
  }
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
  box.append(element('div', 'sf-handle', '<i></i><i></i><i></i>'));
  box.append(element('div', 'sf-state', state.result === 'open' ? LOCK_OPEN : LOCK_SHUT));
  return box;
}

function pad(state) {
  const box = element('div', 'sf-pad');
  const digits = digitsOf(state);
  box.style.setProperty('--count', digits.length);
  for (const digit of digits) {
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
  const layout = state.layout || 'door';
  const wrap = element('div', `sf-wrap ${layout}`);
  const note = notes(state);
  if (layout === 'door') {
    wrap.append(keyTable(state));
    if (note) wrap.append(note);
    wrap.append(door(state), pad(state));
  } else {
    const top = element('div', 'sf-top');
    top.append(keyTable(state));
    if (note) top.append(note);
    wrap.append(top, door(state), pad(state));
  }
  body.append(wrap);
  return wrap;
}

// 안내 문구 안의 제한 시간 막대를 멈춘 모습으로 (목업용). left = 남은 비율
export function staticTimer(message, left) {
  const bar = element('div', `qtimer on${left < 0.4 ? ' warn' : ''}`, `<i style="transform: scaleX(${left})"></i>`);
  message.append(bar);
}
