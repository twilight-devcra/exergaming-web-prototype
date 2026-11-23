// 금고 열기
// 그림마다 정해진 숫자를 암호 표에서 찾아, 금고 문의 그림 줄(암호)을 차례대로 번호판으로 누른다.
// 낮은 단계는 표에서 찾아 옮기는 속도(처리 속도), 높은 단계는 표의 일부 그림이 숫자 대신 단서로 나와 계산하고 따져서 숫자를 알아낸다.
// 한 판에 긴 암호 하나 (길 따라 그리기처럼): 맞힌 자리마다 60% 를 나눠 주고, 다 맞혀 열면 40%. 난이도 계기판에는 답 하나로 센다.
// 틀린 자리는 정답을 넣어 보여 주고 다음 자리로 넘어간다. 설계와 검토 기록: docs/games/drafts/safe.md
//   key     — 암호 표의 줄 수 (숫자 줄 + 단서 줄, 최대 6)
//   code    — 암호 자릿수
//   hidden  — 숫자 대신 단서로 나오는 그림 수
//   kinds   — 단서 종류. 판마다 이 가운데 하나를 고른다 (TEMPLATES)
//   given   — 처음부터 정답으로 채워 둔 자리 수 (Lv1: 할 일을 말없이 보여 준다)
// 문제는 생성기가 만들고, 단서를 만족하는 답이 꼭 하나인지 0–9 를 모두 넣어 확인한다 (그림끼리 숫자가 다르다는 가정 없이:
// 그 가정으로만 풀리면 '남는 숫자' 로 건너뛸 수 있다). node tools/safe-check.js 로 레벨마다 수백 판을 확인한다.
import { Util } from '../config.js';
import { Diagram } from '../diagram.js';
import { Sfx } from '../sfx.js';
import { Tag } from './tags.js';
import { Phase, abortedResult } from './kit.js';
import { SYMBOLS } from './symbol.js';

const PAD = [1, 2, 3, 4, 5, 6, 7, 8, 9];   // 0 은 어느 그림의 숫자도 아니라 번호판에 없다
const MAX_ROWS = 6;
const DIGIT_SHARE = 0.6;                     // 자리마다 나눠 주는 몫. 나머지는 금고를 열면
const WRONG_MS = 900;                        // 틀린 자리의 정답을 보여 주는 시간
const END_MS = 1400;                         // 다 채운 뒤 결과를 보여 주는 시간
const STACK_RATIO = 1.5;                     // 판 자리의 너비 ÷ 높이가 이보다 작으면 위아래로 쌓는다 (휴대폰)
const SHAPES = SYMBOLS.map((symbol) => symbol.id);
const svgOf = (id) => SYMBOLS.find((symbol) => symbol.id === id).svg;
const glyph = (id, cls) => `<svg class="${cls}" viewBox="0 0 100 100">${svgOf(id)}</svg>`;

// ---------------- 규칙 (화면과 상관없음) ----------------
// 문제 = { known: [[그림, 숫자], …], clues: [[토큰, …], …], hidden: { 그림: 숫자 }, code: [그림, …], kind }
//   토큰: 그림 id, 수, 연산자(+ − ×), 관계(= < >), 성질 낱말('짝수' · '홀수' · 'N의 배수'). 셈은 왼쪽부터 차례로 한다
const PARITY = { '홀수': { divisor: 2, remainder: 1 }, '짝수': { divisor: 2, remainder: 0 } };
const PROPERTIES = ['짝수', '홀수', '3의 배수', '4의 배수', '5의 배수'];
const propertyOf = (token) => {
  if (typeof token !== 'string') return null;
  if (token in PARITY) return PARITY[token];
  const multiple = /^([2-5])의 배수$/.exec(token);
  return multiple ? { divisor: Number(multiple[1]), remainder: 0 } : null;
};
const fits = (value, property) => value % propertyOf(property).divisor === propertyOf(property).remainder;
const RELATIONS = new Set(['=', '<', '>']);

function holds(tokens, values) {
  const value = (token) => (typeof token === 'number' ? token : values[token]);
  const sides = [[]];
  const relations = [];
  for (const token of tokens) {
    if (RELATIONS.has(token)) {
      relations.push(token);
      sides.push([]);
    } else sides[sides.length - 1].push(token);
  }
  const evaluate = (terms) => {
    if (terms.length === 1 && propertyOf(terms[0])) return { property: propertyOf(terms[0]) };
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
    if (right?.property) return left % right.property.divisor === right.property.remainder;
    return relation === '=' ? left === right : relation === '<' ? left < right : left > right;
  });
}

export const SafeRules = {
  holds,
  propertyOf,
  valuesOf: (puzzle) => ({ ...Object.fromEntries(puzzle.known), ...puzzle.hidden }),
  // 암호 표의 줄: 숫자 줄 '★ = 4' 다음에 단서 줄
  rowsOf: (puzzle) => [...puzzle.known.map(([id, digit]) => [id, '=', digit]), ...puzzle.clues],
  // 숨은 그림마다 0–9 를 모두 넣어 단서를 다 만족하는 답을 센다 (limit 개까지)
  solutions(puzzle, limit = 2) {
    const ids = Object.keys(puzzle.hidden);
    const found = [];
    const values = Object.fromEntries(puzzle.known);
    for (let combo = 0; combo < 10 ** ids.length && found.length < limit; combo++) {
      ids.forEach((id, i) => (values[id] = Math.floor(combo / 10 ** i) % 10));
      if (puzzle.clues.every((clue) => holds(clue, values))) found.push({ ...values });
    }
    return found;
  },
  // 문제의 잘못을 글로 (없으면 빈 배열)
  problemsOf(puzzle) {
    const problems = [];
    const ids = Object.keys(puzzle.hidden);
    const found = SafeRules.solutions(puzzle);
    if (ids.length && (found.length !== 1 || ids.some((id) => found[0][id] !== puzzle.hidden[id]))) problems.push(`답이 ${found.length}개`);
    const digits = Object.values(SafeRules.valuesOf(puzzle));
    if (new Set(digits).size !== digits.length) problems.push('숫자가 겹침');
    if (digits.some((digit) => !PAD.includes(digit))) problems.push('번호판에 없는 숫자');
    if (SafeRules.rowsOf(puzzle).length > MAX_ROWS) problems.push(`표가 ${MAX_ROWS}줄을 넘음`);
    if (puzzle.code.some((id) => !(id in SafeRules.valuesOf(puzzle)))) problems.push('표에 없는 그림');
    if (ids.some((id) => !puzzle.code.includes(id))) problems.push('암호에 안 나오는 숨은 그림');
    return problems;
  },
};

// ---------------- 생성기 ----------------
// 단서 종류마다 틀: 자리 이름(hid1·hid2·hid3 = 숨은 그림, key1… = 숫자가 그대로 나오는 그림)에 숫자를 뽑고, 맞으면 단서를 돌려준다 (안 맞으면 null → 다시 뽑는다).
// 자리마다 어느 그림인지는 나중에 고른다
const range = (first, last) => Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);
const pickOne = (list, random) => list[Math.floor(random() * list.length)];
function shuffled(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
// target 자리의 숫자를 '사이' 나 '한쪽 경계' 와 성질 낱말로 좁히는 단서 두 줄. 경계는 sources 자리들에서 고른다.
// 경계만으로 후보가 2–4개 남고, 성질 낱말로 꼭 하나가 되는 것만 쓴다
function boundClues(target, sources, values, random) {
  const value = values[target];
  const options = [];
  for (const low of sources) {
    for (const high of sources) {
      if (values[low] < value && value < values[high]) options.push({ tokens: [low, '<', target, '<', high], candidates: range(values[low] + 1, values[high] - 1) });
    }
    if (values[low] < value) options.push({ tokens: [low, '<', target], candidates: range(values[low] + 1, 9) });
    if (values[low] > value) options.push({ tokens: [target, '<', low], candidates: range(0, values[low] - 1) });
  }
  const usable = options.filter(({ candidates }) => candidates.length >= 2 && candidates.length <= 4).flatMap(({ tokens, candidates }) =>
    PROPERTIES.filter((property) => candidates.filter((candidate) => fits(candidate, property)).length === 1 && fits(value, property)).map((property) => [tokens, [target, '=', property]]));
  return usable.length ? pickOne(usable, random) : null;
}

const TEMPLATES = {
  // Lv5: 계산 한 번
  add: { known: 4, build: ({ hid1, key1 }) => (hid1 - key1 >= 1 && hid1 - key1 <= 3 ? [['hid1', '=', 'key1', '+', hid1 - key1]] : null) },
  subtract: { known: 4, build: ({ hid1, key1 }) => (key1 - hid1 >= 1 && key1 - hid1 <= 3 ? [['hid1', '=', 'key1', '−', key1 - hid1]] : null) },
  backwards: { known: 4, build: ({ hid1, key1 }) => (key1 - hid1 >= 2 && key1 - hid1 <= 4 ? [['hid1', '+', key1 - hid1, '=', 'key1']] : null) },
  double: { known: 4, build: ({ hid1, key1 }) => (hid1 === key1 * 2 ? [['hid1', '=', 'key1', '×', 2]] : null) },
  sum: { known: 4, build: ({ hid1, key1, key2 }) => (hid1 === key1 + key2 ? [['hid1', '=', 'key1', '+', 'key2']] : null) },
  // Lv6: 한 번 더 생각
  between: { known: 4, build: ({ hid1, key1, key2 }) => (key1 === hid1 - 1 && key2 === hid1 + 1 ? [['key1', '<', 'hid1', '<', 'key2']] : null) },
  twice: { known: 4, build: ({ hid1, key1 }) => (key1 === hid1 * 2 ? [['hid1', '+', 'hid1', '=', 'key1']] : null) },
  missing: { known: 4, build: ({ hid1, key1, key2 }) => (key1 - hid1 === key2 ? [['key1', '−', 'hid1', '=', 'key2']] : null) },
  twicePlus: { known: 4, build: ({ hid1, key1, key2 }) => (hid1 * 2 + key1 === key2 ? [['hid1', '+', 'hid1', '+', 'key1', '=', 'key2']] : null) },
  // Lv7: 계산 + 논리
  sumBound: { known: 3, build: (values, random) => {
    if (values.hid1 !== values.key1 + values.key2) return null;
    const bound = boundClues('hid2', ['key1', 'key2', 'key3', 'hid1'], values, random);
    return bound && [['hid1', '=', 'key1', '+', 'key2'], ...bound];
  } },
  chain: { known: 4, build: ({ hid1, hid2, key1 }, random) => {
    const first = [hid1 - key1 >= 1 && hid1 - key1 <= 3 && ['hid1', '=', 'key1', '+', hid1 - key1], hid1 === key1 * 2 && ['hid1', '=', 'key1', '×', 2]].filter(Boolean);
    const second = [hid2 === hid1 * 2 && ['hid2', '=', 'hid1', '×', 2], hid2 - hid1 >= 1 && hid2 - hid1 <= 3 && ['hid2', '=', 'hid1', '+', hid2 - hid1]].filter(Boolean);
    return first.length && second.length ? [pickOne(first, random), pickOne(second, random)] : null;
  } },
  twiceBound: { known: 3, build: (values, random) => {
    if (values.key1 !== values.hid1 * 2) return null;
    const bound = boundClues('hid2', ['key2', 'key3'], values, random);
    return bound && bound[0].length === 3 ? [['hid1', '+', 'hid1', '=', 'key1'], ...bound] : null; // 한쪽 경계만
  } },
  subtractBound: { known: 3, build: (values, random) => {
    const difference = values.hid1 - values.key1;
    if (difference < 2 || difference > 5) return null;
    const bound = boundClues('hid2', ['key1', 'key2', 'key3', 'hid1'], values, random);
    return bound && bound[0].includes('hid1') ? [['hid1', '−', 'key1', '=', difference], ...bound] : null; // 앞에서 구한 답을 경계로
  } },
  // Lv8: 두 그림을 함께 정하거나 이어 풀고, 그 답으로 하나 더
  sumDouble: { known: 2, build: (values, random) => {
    if (values.hid1 !== values.hid2 * 2) return null;
    const bound = boundClues('hid3', ['key1', 'key2', 'hid1', 'hid2'], values, random);
    return bound && [['hid1', '+', 'hid2', '=', values.hid1 + values.hid2], ['hid1', '=', 'hid2', '×', 2], ...bound];
  } },
  sumDifference: { known: 2, build: (values, random) => {
    const difference = values.hid1 - values.hid2;
    if (difference < 1 || difference > 4) return null;
    const bound = boundClues('hid3', ['key1', 'key2', 'hid1', 'hid2'], values, random);
    return bound && [['hid1', '+', 'hid2', '=', values.hid1 + values.hid2], ['hid1', '=', 'hid2', '+', difference], ...bound];
  } },
  productDifference: { known: 3, build: ({ hid1, hid2, hid3 }) => {
    const difference = hid1 - hid2;
    if (difference < 1 || difference > 3 || hid2 < 2 || hid3 !== hid1 + hid2) return null; // × 1 은 곱셈이 아니다
    return [['hid1', '×', 'hid2', '=', hid1 * hid2], ['hid1', '=', 'hid2', '+', difference], ['hid3', '=', 'hid1', '+', 'hid2']];
  } },
  twicePlusChain: { known: 3, build: ({ hid1, hid2, hid3, key1 }, random) => {
    const second = [hid2 === hid1 * 2 && ['hid2', '=', 'hid1', '×', 2], hid2 - hid1 >= 1 && hid2 - hid1 <= 3 && ['hid2', '=', 'hid1', '+', hid2 - hid1]].filter(Boolean);
    if (!second.length || hid1 < 2 || hid3 !== hid1 + hid2) return null;
    return [['hid1', '+', 'hid1', '+', 'key1', '=', hid1 * 2 + key1], pickOne(second, random), ['hid3', '=', 'hid1', '+', 'hid2']];
  } },
};

// 암호: 같은 그림이 붙어 나오지 않게. must 의 그림은 꼭 넣고, repeat 이면 같은 그림이 한 번은 되풀이된다
function makeCode(shapes, length, must, repeat, random) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const code = [...must];
    while (code.length < length) code.push(pickOne(shapes, random));
    const order = shuffled(code, random);
    const adjacent = order.some((id, i) => i > 0 && order[i - 1] === id);
    const repeats = new Set(order).size < order.length;
    if (!adjacent && (!repeat || repeats)) return order;
  }
  return null;
}

// 숫자 줄의 차례: 위아래 줄의 숫자가 이어지지 않게 (자리로 숫자를 짐작하지 못하게). 그런 차례가 없으면 null (4·5·6 처럼)
function orderKnown(known, random) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const order = shuffled(known, random);
    if (order.every(([, digit], i) => i === 0 || Math.abs(order[i - 1][1] - digit) > 1)) return order;
  }
  return null;
}

// spec = levels 의 한 줄. 판마다 kinds 에서 단서 종류 하나를 고르고, 그 종류에 맞는 숫자가 나올 때까지 다시 뽑는다
// (뽑을 때마다 종류를 새로 고르면 숫자가 잘 안 맞는 종류가 덜 나온다)
function generate(spec, random = Math.random) {
  const kind = spec.kinds ? pickOne(spec.kinds, random) : null;
  const template = kind && TEMPLATES[kind];
  for (let attempt = 0; attempt < 5000; attempt++) {
    const knownCount = template ? template.known : spec.key;
    const slots = [...range(1, knownCount).map((i) => `key${i}`), ...range(1, spec.hidden).map((i) => `hid${i}`)];
    const digits = shuffled(PAD, random).slice(0, slots.length);
    const values = Object.fromEntries(slots.map((slot, i) => [slot, digits[i]]));
    const clueSlots = template ? template.build(values, random) : [];
    if (!clueSlots) continue;
    const shapeOf = {};
    shuffled(SHAPES, random).slice(0, slots.length).forEach((id, i) => (shapeOf[slots[i]] = id));
    const name = (token) => (typeof token === 'string' && token in shapeOf ? shapeOf[token] : token);
    const known = orderKnown(slots.filter((slot) => slot.startsWith('key')).map((slot) => [shapeOf[slot], values[slot]]), random);
    if (!known) continue;
    const hidden = Object.fromEntries(slots.filter((slot) => slot.startsWith('hid')).map((slot) => [shapeOf[slot], values[slot]]));
    const hiddenIds = Object.keys(hidden);
    const shapes = slots.map((slot) => shapeOf[slot]);
    // 3·4자리 암호는 표의 그림을 한 번씩 (표와 같은 차례는 피한다). 5자리부터는 같은 그림이 되풀이되고, Lv5·6 은 숨은 그림이 두 번 나와 알아낸 숫자를 다시 쓴다
    let code;
    if (spec.code <= 4) {
      code = shuffled(shapes, random);
      if (code.every((id, i) => id === known[i][0])) continue;
    } else {
      code = makeCode(shapes, spec.code, spec.hidden === 1 ? [...hiddenIds, ...hiddenIds] : hiddenIds, true, random);
    }
    if (!code) continue;
    const puzzle = { known, clues: clueSlots.map((tokens) => tokens.map(name)), hidden, code, kind };
    if (SafeRules.rowsOf(puzzle).length !== spec.key || SafeRules.problemsOf(puzzle).length) continue;
    return puzzle;
  }
  throw new Error(`금고 열기: 문제를 만들지 못함 (${JSON.stringify(spec)})`);
}

// ---------------- 게임 ----------------
const LOCK_SHUT = '<svg viewBox="0 0 24 24" class="sf-lock"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" fill="none"/></svg>';
const LOCK_OPEN = '<svg viewBox="0 0 24 24" class="sf-lock"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.8" fill="none"/></svg>';

// 소개 그림 한 바퀴(INTRO_SECONDS). i번째 자리는 [i, i+1) 초 동안 켜지고, i + PRESS 초에 번호판을 눌러 그 숫자가 들어간다.
// 모든 움직임이 같은 SVG 시계를 쓴다 (CSS 애니메이션은 따로 돌아 어긋난다)
const INTRO_SECONDS = 4.4;
const PRESS = 0.55;
const RIPPLE = 0.45;
const keyTime = (seconds) => (seconds / INTRO_SECONDS).toFixed(4);
const during = (since, until, content) => {
  const times = until == null ? `0;${keyTime(since)}` : `0;${keyTime(since)};${keyTime(until)}`;
  const values = until == null ? '0;1' : '0;1;0';
  return `<g opacity="0">${content}<animate attributeName="opacity" dur="${INTRO_SECONDS}s" repeatCount="indefinite" calcMode="discrete" keyTimes="${times}" values="${values}"/></g>`;
};
// moment 초에 누른 자리: 고리가 작게 나타나 커지며 사라진다 (Diagram.tap 과 같은 모양)
const pulse = (x, y, radius, moment) => {
  const repeat = `dur="${INTRO_SECONDS}s" repeatCount="indefinite" keyTimes="0;${keyTime(moment)};${keyTime(moment + RIPPLE)};1"`;
  return `<circle class="dg-tap" style="animation: none" cx="${x}" cy="${y}" r="${radius * 0.7}" opacity="0">` +
    `<animate attributeName="r" ${repeat} values="${radius * 0.7};${radius * 0.7};${radius * 1.4};${radius * 1.4}"/>` +
    `<animate attributeName="opacity" ${repeat} calcMode="discrete" values="0;1;0;0"/>` +
    `<animate attributeName="stroke-opacity" ${repeat} values="1;1;0;0"/></circle>`;
};

export class SafeGame {
  static id = 'safe';
  static tags = [Tag.NUMBER];
  static title = '금고 열기';
  static hint = '그림마다 정해진 숫자를 표에서 찾아<br>금고 암호를 차례대로 누르세요';
  static levels = [
    // 표에서 찾아 옮기기만. 3·4자리는 표의 그림을 한 번씩, Lv1 은 첫 자리를 채워 둔다
    { key: 3, code: 3, hidden: 0, given: 1 },
    { key: 4, code: 4, hidden: 0 },
    // 5자리부터 같은 그림이 되풀이된다
    { key: 4, code: 5, hidden: 0 },
    { key: 5, code: 5, hidden: 0 },
    // 계산 한 번: ♥ = ☾ + 2 · ▲ = ● − 3 · ● + 3 = ✚ · ■ = ♥ × 2 · ◆ = ■ + ★. 숨은 그림은 암호에 두 번 나온다
    { key: 5, code: 5, hidden: 1, kinds: ['add', 'subtract', 'backwards', 'double', 'sum'] },
    // 한 번 더 생각: ★ < ▲ < ☾ (사이에 수가 하나) · ■ + ■ = ☾ · ● − ▲ = ★ · ▲ + ▲ + ★ = ●
    { key: 5, code: 5, hidden: 1, kinds: ['between', 'twice', 'missing', 'twicePlus'] },
    // 계산 + 논리: 두 그림 더하기 + 경계·성질 낱말 · 이어 풀기(■ = ★ + 2, ● = ■ × 2) · ■ + ■ = ☾ + 한쪽 경계·성질 · 빼기 → 그 답을 경계로
    { key: 6, code: 5, hidden: 2, kinds: ['sumBound', 'chain', 'twiceBound', 'subtractBound'] },
    // 두 그림을 함께 (합과 두 배 · 합과 차) + 셋째는 경계·성질 낱말, 또는 곱과 차 · x + x + y 로 시작해 이어 풀기
    { key: 6, code: 5, hidden: 3, kinds: ['sumDouble', 'sumDifference', 'productDifference', 'twicePlusChain'] },
  ];
  static maxLevel = SafeGame.levels.length;
  static generate = generate;

  // 소개 그림 (모든 레벨 같음): ① 표에서 그림의 숫자 찾기 → ② 차례대로 누르기. 두 그림이 함께 움직인다:
  // ① 에서 ▲ → ★ → ● 줄이 차례로 켜지는 동안 ② 에서 그 자리가 켜지고, 번호판의 2 → 4 → 7 을 누르면 숫자가 들어간다
  static diagram() {
    const shape = (id, x, y, size) => Diagram.glyph(svgOf(id), x, y, size);
    const key = [['star', 4], ['circle', 7], ['triangle', 2]];
    const code = ['triangle', 'star', 'circle'];
    const digitOf = (id) => key.find(([keyId]) => keyId === id)[1];
    const rowY = (row) => 34 + row * 36;
    // 켜진 줄의 테두리를 먼저 그려야 그 줄의 그림과 숫자를 가리지 않는다
    const table = code.map((id, i) => during(i, i + 1, Diagram.rect(40, rowY(key.findIndex(([keyId]) => keyId === id)) - 16, 96, 32, 'dg-slot active', 7))).join('') +
      key.map(([id, digit], row) => shape(id, 62, rowY(row), 24) + Diagram.text(88, rowY(row), '=', 18) + Diagram.text(112, rowY(row), digit, 22)).join('');
    const padX = (digit) => 4 + (digit - 1) * 19;
    const windows = code.map((id, i) => {
      const x = 30 + i * 42;
      return Diagram.rect(x, 6, 34, 34, 'dg-cell', 7) + shape(id, x + 17, 23, 24) + Diagram.rect(x, 46, 34, 30, 'dg-slot', 6) +
        during(i, i + 1, Diagram.rect(x, 46, 34, 30, 'dg-slot active', 6)) +
        during(i + PRESS, null, Diagram.text(x + 17, 61, digitOf(id), 20)); // 누르는 순간 숫자가 들어간다
    }).join('');
    const keypad = PAD.map((digit) => Diagram.rect(padX(digit), 104, 16, 22, 'dg-cell', 4) + Diagram.text(padX(digit) + 8, 115, digit, 13)).join('');
    const taps = code.map((id, i) => pulse(padX(digitOf(id)) + 8, 115, 12, i + PRESS)).join(''); // 번호판 위에 그린다
    return [
      { svg: Diagram.svg('0 0 176 140', table), caption: '표에서 그림의 숫자 찾기' },
      { svg: Diagram.svg('0 0 176 140', windows + keypad + taps), caption: '차례대로 누르기' },
    ];
  }

  /** @param {import('./host.js').GameHost} host */
  constructor(host) {
    this.host = host;
    this.spec = SafeGame.levels[host.level - 1];
    this.puzzle = generate(this.spec);
    this.given = this.spec.given || 0;
    this.values = SafeRules.valuesOf(this.puzzle);
    this.typed = this.puzzle.code.slice(0, this.given).map((id) => this.values[id]);
    this.wrong = [];          // [{ slot, tapped }] 틀린 자리와 그때 누른 숫자 (시간 초과로 채운 자리는 tapped 가 null)
    this.rightDigits = 0;
    this.phase = Phase.SHOW;
    this.flash = 0;
  }

  start() {
    const { stage, level } = this.host;
    this.message = Util.element('div', 'stage-msg', '');
    this.body = Util.frame(stage, `${SafeGame.title} · Lv.${level}`, this.message).body;
    this.wrap = Util.element('div', 'sf-wrap');
    this.keyBox = this.drawKey();
    this.door = Util.element('div', 'sf-door');
    this.door.style.setProperty('--n', this.puzzle.code.length);
    this.windows = Util.element('div', 'sf-windows');
    this.cols = this.puzzle.code.map((id) => {
      const col = Util.element('div', 'sf-col', `<div class="sf-tile">${glyph(id, 'sf-cglyph')}</div><div class="sf-win"></div>`);
      this.windows.append(col);
      return col;
    });
    this.lock = Util.element('div', 'sf-lockplate', LOCK_SHUT);
    this.door.append(this.windows, this.lock);
    this.pad = Util.element('div', 'sf-pad');
    this.buttons = PAD.map((digit) => {
      const button = Util.element('button', 'ar-cand sf-num', String(digit));
      button.addEventListener('pointerdown', () => this.press(digit, button));
      this.pad.append(button);
      return button;
    });
    this.right = Util.element('div', 'sf-right');
    this.body.append(this.wrap);
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.body);
    this.layout();
    document.fonts?.ready.then(() => this.phase !== Phase.END && this.layout());
    this.showWindows();
    Util.say(this.message, '암호를 누르세요', 'act');
    this.phase = Phase.INPUT;
    const { known, clues, hidden, code } = this.puzzle;
    this.host.question({ known, clues, hidden, code, kind: this.puzzle.kind, given: this.given });
    this.host.timer(code.length + 3 * clues.length, () => this.timeOut());
  }

  // 암호 표: 숫자 줄도 단서 줄도 같은 모양의 줄 (단서라고 따로 칠하거나 줄을 바꾸지 않는다)
  drawKey() {
    const token = (part) => {
      if (SHAPES.includes(part)) return glyph(part, 'sf-kglyph');
      if (typeof part === 'number') return `<b>${part}</b>`;
      if (propertyOf(part)) return `<span class="sf-word">${part}</span>`;
      return `<span class="sf-op">${part}</span>`;
    };
    const box = Util.element('div', 'sf-key', '<div class="sf-label">암호 표</div>');
    const rows = Util.element('div', 'sf-krows');
    for (const tokens of SafeRules.rowsOf(this.puzzle)) rows.append(Util.element('div', 'sf-krow', tokens.map(token).join('')));
    box.append(rows);
    return box;
  }

  // 판 자리가 넓으면 암호 표 | (금고 문, 그 아래 번호판 한 줄), 좁고 길면(휴대폰) 위아래로 쌓고 번호판은 5칸씩 두 줄.
  // 크기는 모두 --u 의 배수라, 설계 크기(--u = 1px)로 놓고 재어 판 자리에 맞게 줄인다 (키우지는 않는다)
  layout() {
    const width = this.body.clientWidth;
    const height = this.body.clientHeight;
    if (!width || !height) return;
    const stacked = width / height < STACK_RATIO;
    this.wrap.className = `sf-wrap ${stacked ? 'stacked' : 'wide'}`;
    if (stacked) this.wrap.replaceChildren(this.keyBox, this.door, this.pad);
    else {
      this.right.replaceChildren(this.door, this.pad);
      this.wrap.replaceChildren(this.keyBox, this.right);
    }
    this.wrap.style.setProperty('--u', '1px');
    const scale = Math.min(1, width / this.wrap.offsetWidth, height / this.wrap.offsetHeight);
    this.wrap.style.setProperty('--u', `${Math.floor(scale * 1000) / 1000}px`);
  }

  showWindows() {
    const wrongAt = new Map(this.wrong.map(({ slot, tapped }) => [slot, tapped]));
    this.cols.forEach((col, i) => {
      const win = col.lastElementChild;
      const filled = i < this.typed.length;
      const current = this.phase !== Phase.END && i === this.typed.length;
      col.classList.toggle('cur', current);
      win.className = ['sf-win', filled && (wrongAt.has(i) ? 'bad' : 'good'), current && 'cur'].filter(Boolean).join(' ');
      const tapped = wrongAt.get(i);
      win.innerHTML = filled ? `${this.typed[i]}${tapped != null ? `<s>${tapped}</s>` : ''}` : '';
    });
  }

  press(digit, button) {
    if (this.phase !== Phase.INPUT) return;
    const slot = this.typed.length;
    const expected = this.values[this.puzzle.code[slot]];
    const ok = digit === expected;
    this.host.input({ slot, digit, ok });
    this.typed.push(expected);
    this.buttons.forEach((other) => other.classList.remove('hit', 'wrong', 'answer'));
    if (ok) {
      this.rightDigits++;
      button.classList.add('hit');
      this.host.award((this.host.base * DIGIT_SHARE * this.host.multiplier) / (this.puzzle.code.length - this.given), button);
      this.host.sfx(Sfx.TAP);
    } else {
      this.wrong.push({ slot, tapped: digit });
      button.classList.add('wrong');
      this.buttons[expected - 1].classList.add('answer');
      Util.say(this.message, `정답은 ${expected}`, 'bad');
    }
    const mine = ++this.flash;
    this.host.after(ok ? 250 : WRONG_MS, () => {
      if (mine !== this.flash) return;
      this.buttons.forEach((other) => other.classList.remove('hit', 'wrong', 'answer'));
      if (this.phase === Phase.INPUT) Util.say(this.message, '암호를 누르세요', 'act');
    });
    if (this.typed.length === this.puzzle.code.length) this.finish(false);
    else this.showWindows();
  }

  // 시간 초과: 남은 자리를 정답으로 채워 보여 주고 끝낸다
  timeOut() {
    if (this.phase !== Phase.INPUT) return;
    for (let slot = this.typed.length; slot < this.puzzle.code.length; slot++) {
      this.typed.push(this.values[this.puzzle.code[slot]]);
      this.wrong.push({ slot, tapped: null });
    }
    this.finish(true);
  }

  finish(timedOut) {
    this.phase = Phase.END;
    this.host.stopTimer();
    this.cleared = this.wrong.length === 0;
    this.showWindows();
    this.door.classList.add(this.cleared ? 'open' : 'shut');
    if (this.cleared) this.lock.innerHTML = LOCK_OPEN;
    this.host.answer({ correct: this.cleared, timedOut, typed: this.typed, wrong: this.wrong });
    // 안내 문구를 먼저 바꾼다 (GOOD·BAD 는 연속 정답 보상까지 이어진다)
    if (this.cleared) {
      Util.say(this.message, '금고가 열렸어요!', 'good');
      this.host.after(200, () => this.host.award(this.host.base * (1 - DIGIT_SHARE) * this.host.multiplier, this.lock, '열림 '));
      this.host.sfx(Sfx.GOOD);
    } else {
      Util.say(this.message, timedOut ? '시간 초과' : `아쉬워요, ${this.wrong.length}칸이 틀렸어요`, 'bad');
      this.host.sfx(Sfx.BAD);
    }
    this.host.after(END_MS, () => {
      this.resizeObserver.disconnect();
      this.host.done(this.result());
    });
  }

  // 맞힌 자리 / 누른 자리 (처음부터 채워 둔 자리는 빼고)
  result() {
    return { cleared: !!this.cleared, correct: this.rightDigits, total: this.puzzle.code.length - this.given };
  }

  abort() {
    this.phase = Phase.END;
    this.resizeObserver?.disconnect();
    return abortedResult(this.rightDigits, this.typed.length - this.given);
  }
}
