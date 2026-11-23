// 금고 열기 — 문제 규칙 (화면과 상관없는 부분). 브라우저(board.js, safe-game.js)와 Node(check.js)가 같이 쓴다.
//
// 문제 = {
//   known: [[그림 id, 숫자], …]    — 열쇠 표에 숫자가 그대로 나오는 그림 (표에 놓인 차례대로)
//   clues: [[토큰, …], …]          — 단서 문장. 표에서 known 줄 다음에, 같은 모양의 줄로 이어진다
//       토큰: 그림 id, 수, 연산자(+ − ×), 관계(= < >), '홀수' / '짝수'
//       예: ['heart', '=', 'moon', '+', 2] · ['star', '<', 'triangle', '<', 'moon'] · ['circle', '=', '짝수'] · ['triangle', '+', 'square', '=', 9]
//   hidden: { 그림 id: 숫자 }       — 단서로 알아내야 하는 그림의 답
//   code: [그림 id, …]             — 금고의 암호
// }

// 번호판: 1–9 (0 은 어느 그림의 숫자도 아니라 뺀다)
export const PAD = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const PARITY = { '홀수': 1, '짝수': 0 };
export const MAX_STATEMENTS = 6; // 열쇠 표의 줄 수 (숫자 줄 + 단서 줄) 상한

export const valuesOf = (puzzle) => ({ ...Object.fromEntries(puzzle.known), ...(puzzle.hidden || {}) });
export const digitFor = (puzzle, id) => valuesOf(puzzle)[id];
// 열쇠 표의 줄: 숫자 줄 '★ = 4' 다음에 단서 줄
export const statementsOf = (puzzle) => [...puzzle.known.map(([id, digit]) => [id, '=', digit]), ...(puzzle.clues || [])];

// 문장 하나가 참인가. values = 그림마다 숫자
export function holds(tokens, values) {
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

// 문제의 잘못을 모두 찾아 글로 돌려준다 (없으면 빈 배열).
// 단서의 답: 숨은 그림마다 0–9 를 모두 넣어 보고, 단서를 다 만족하는 답이 하나뿐이고 그것이 hidden 인지 본다.
// 그림끼리 숫자가 달라야 한다는 가정은 쓰지 않는다 (그 가정으로만 풀리면 '남는 숫자' 로 건너뛸 수 있다)
export function problemsOf(puzzle, { codeLength } = {}) {
  const problems = [];
  const hiddenIds = Object.keys(puzzle.hidden || {});
  const known = Object.fromEntries(puzzle.known);
  const solutions = [];
  for (let combo = 0; combo < 10 ** hiddenIds.length; combo++) {
    const values = { ...known };
    hiddenIds.forEach((id, i) => (values[id] = Math.floor(combo / 10 ** i) % 10));
    if ((puzzle.clues || []).every((clue) => holds(clue, values))) solutions.push(values);
  }
  if (hiddenIds.length && solutions.length !== 1) problems.push(`답이 ${solutions.length}개: ${solutions.slice(0, 4).map((values) => hiddenIds.map((id) => `${id}=${values[id]}`).join(' ')).join(' | ')}`);
  else if (hiddenIds.length && hiddenIds.some((id) => solutions[0][id] !== puzzle.hidden[id])) problems.push(`단서의 답이 hidden 과 다름: ${JSON.stringify(solutions[0])}`);
  if ((puzzle.clues || []).length && !hiddenIds.length) problems.push('단서가 있는데 숨은 그림이 없음');
  const values = valuesOf(puzzle);
  const digits = Object.values(values);
  if (new Set(digits).size !== digits.length) problems.push(`숫자가 겹침: ${digits.join(' ')}`);
  if (digits.some((digit) => !PAD.includes(digit))) problems.push(`번호판에 없는 숫자: ${digits.join(' ')}`);
  const statements = statementsOf(puzzle).length;
  if (statements > MAX_STATEMENTS) problems.push(`열쇠 표 ${statements}줄 (최대 ${MAX_STATEMENTS})`);
  const missing = puzzle.code.filter((id) => !(id in values));
  if (missing.length) problems.push(`표에 없는 그림: ${missing.join(' ')}`);
  const skipped = hiddenIds.filter((id) => !puzzle.code.includes(id));
  if (skipped.length) problems.push(`암호에 안 나오는 숨은 그림 (단서를 건너뛸 수 있음): ${skipped.join(' ')}`);
  if (codeLength && puzzle.code.length !== codeLength) problems.push(`암호 ${puzzle.code.length}자리 (레벨은 ${codeLength}자리)`);
  return problems;
}
