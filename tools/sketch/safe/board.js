// 금고 열기 — 판 그리기 (스케치). 설계: docs/games/drafts/safe.md
// 한 상태(state)를 받아 판 하나를 그린다. 목업(index.html)은 손으로 쓴 상태를, 눌러 보는 스케치는 진행 중인 상태를 넘긴다.
//
// state = 문제(logic.js 의 모양: known · clues · hidden · code)에 진행 상황을 더한 것
//   layout: 'below' | 'phone'
//       below — 태블릿: 암호 표 | 금고 문, 그 아래 번호판 한 줄 (1–9)
//       phone — 휴대폰(세로, 판 자리가 좁고 길다): 암호 표 · 금고 문 · 번호판 2×5(마지막 칸은 빈칸)를 위에서 아래로.
//               크기는 판 자리에 맞춰 함께 줄어든다 (safe.css 의 --u, fitPhone)
//   typed: [숫자, …]               — 지금까지 들어간 칸 (틀린 칸은 정답 숫자가 들어간다)
//   wrong: [{ slot, tapped }]      — 틀린 칸과 그때 누른 숫자 (시간 초과로 채운 칸은 tapped 가 null)
//   pressed, answer                — 번호판에서 방금 누른 숫자 / 정답으로 보여 줄 숫자 (틀렸을 때)
//   result: 'open' | 'shut'        — 다 채운 뒤
import { Sketch } from '../sketch.js';
import { PAD, problemsOf, propertyOf, statementsOf } from './logic.js';

export { digitFor, valuesOf } from './logic.js';

const element = (tag, cls, html = '') => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.innerHTML = html;
  return node;
};

const LOCK_SHUT = '<svg viewBox="0 0 24 24" class="sf-lock"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" fill="none"/></svg>';
const LOCK_OPEN = '<svg viewBox="0 0 24 24" class="sf-lock"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.8" fill="none"/></svg>';
// ---------- 그리기 ----------
const tokenHtml = (token) => {
  if (typeof token === 'string' && Sketch.symbol(token)) return Sketch.glyph(token, 'sf-kglyph');
  if (typeof token === 'number') return `<b>${token}</b>`;
  if (propertyOf(token)) return `<span class="sf-word">${token}</span>`;
  return `<span class="sf-op">${token}</span>`;
};

// 암호 표: 숫자 줄도 단서 줄도 같은 모양의 줄 (단서라고 따로 칠하거나 줄을 바꾸지 않는다)
function keyTable(state) {
  const box = element('div', 'sf-key');
  box.append(element('div', 'sf-label', '암호 표'));
  const rows = element('div', 'sf-krows');
  const statements = statementsOf(state);
  for (const tokens of statements) rows.append(element('div', 'sf-krow', tokens.map(tokenHtml).join('')));
  box.classList.toggle('dense', statements.length > 6);
  box.append(rows);
  return box;
}

function door(state) {
  const typed = state.typed || [];
  const wrongAt = new Map((state.wrong || []).map((entry) => [entry.slot, entry.tapped]));
  const box = element('div', `sf-door${state.result ? ` ${state.result}` : ''}`);
  box.style.setProperty('--n', state.code.length);
  const windows = element('div', 'sf-windows');
  state.code.forEach((id, i) => {
    const filled = i < typed.length;
    const current = !state.result && i === typed.length;
    const cls = ['sf-win', filled && (wrongAt.has(i) ? 'bad' : 'good'), current && 'cur'].filter(Boolean).join(' ');
    const tapped = wrongAt.get(i) != null ? `<s>${wrongAt.get(i)}</s>` : ''; // 시간 초과로 채운 칸은 누른 숫자가 없다
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
  for (const problem of problemsOf(state)) Sketch.warn(`Lv${state.level ?? '?'}: ${problem}`);
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
  body.skFit?.disconnect();
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
  body.skFit = new ResizeObserver(fit);
  body.skFit.observe(body);
  document.fonts?.ready.then(fit);
  fit();
}

// 안내 문구 안의 제한 시간 막대를 멈춘 모습으로 (목업용). left = 남은 비율
export function staticTimer(message, left) {
  const bar = element('div', `qtimer on${left < 0.4 ? ' warn' : ''}`, `<i style="transform: scaleX(${left})"></i>`);
  message.append(bar);
}
