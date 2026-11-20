// 사칙연산 역산
// (?) ± (?) ± (?) = 답 에서 후보 숫자를 골라 빈칸을 모두 채워 식을 완성한다.
// 난이도는 숫자를 키우지 않고 빈칸 수로 올린다. 숫자는 늘 한 자리라 계산 자체는 쉽고,
// 빈칸이 늘수록 중간 합을 머릿속에 들고 여러 조합을 따져 보는 부담(작업 기억·계획)이 커진다.
//   blanks  — 빈칸 수. 최대 3개 (4개는 다른 게임보다 지나치게 어려웠다)
//   n       — 후보 숫자 수 (모두 서로 다른 한 자리 수)
//   maxSols — 답이 되는 조합의 최대 개수. 순서만 다른 것은 같은 조합으로 센다.
//   plus    — 덧셈만 쓴다 (쉬운 단계). 빼는 칸은 '어느 쪽이 커야 하나'까지 따져야 해서 한결 어렵다.
//   given   — 미리 채워 두는 칸 수 (가장 쉬운 단계). 채워 둔 숫자는 후보에서 빠지므로 n 은 그 숫자까지 센 수다.
//             빈칸이 하나 남으면 '답 − 채워 둔 수'를 찾기만 하면 된다.
// '큰 수부터 넣고 나머지를 맞춰 보는' 요령이 통하지 않도록 문제를 고른다 (generate 참고).
import { U } from '../config.js';
import { Dg } from '../diagram.js';
import { Sfx } from '../sfx.js';
import { Tag } from './tags.js';
import { Phase, Progress, pointsPer, resultOf, abortedResult } from './kit.js';

export class ArithGame {
  static id = 'arith';
  static tags = [Tag.NUMBER];
  static title = '사칙연산 역산';
  static hint = '아래 숫자를 골라 빈칸을 모두 채워 식을 완성하세요<br>채운 칸을 누르면 숫자를 다시 뺄 수 있습니다';
  static levels = [
    // 쉬운 단계: 덧셈만. Lv1 은 한 칸을 채워 두고 나머지 한 칸을 후보 3개에서 고른다
    { blanks: 2, n: 4, maxSols: 1, plus: true, given: 1 },
    { blanks: 2, n: 4, maxSols: 1, plus: true },
    { blanks: 2, n: 4, maxSols: 1 },
    { blanks: 2, n: 5, maxSols: 1 },
    { blanks: 3, n: 5, maxSols: 3 },
    { blanks: 3, n: 6, maxSols: 3 },
    // 빈칸이 3개에서 멈춘 뒤로는 답이 되는 조합을 줄이고(2개) 후보 숫자를 늘려(7개) 어렵게 한다.
    // n 7 · maxSols 2 는 약 97% 조건을 맞추고, 못 맞추면 가장 가까운 문제를 쓴다 (generate 참고)
    { blanks: 3, n: 6, maxSols: 2 },
    { blanks: 3, n: 7, maxSols: 2 },
  ];
  static maxLevel = ArithGame.levels.length;
  static ROUNDS = 3;
  static LO = 1;
  static HI = 9;
  static TRIES = 120; // 문제 하나를 만들 때 후보 묶음을 다시 뽑아 보는 횟수 (화면이 멈칫하지 않을 만큼만)

  // 소개 그림: ① 빈칸에 들어갈 수를 찾아 ② 아래에서 골라 채운다
  static diagram() {
    const eq = (filled) =>
      Dg.rect(14, 14, 38, 38, filled ? 'dg-slot good' : 'dg-slot active') + Dg.text(33, 33, filled || '?', 22, filled ? 'dg-txt' : 'dg-txt num') +
      Dg.text(68, 33, '+', 22) +
      Dg.rect(84, 14, 38, 38, filled ? 'dg-slot active' : 'dg-slot') + Dg.text(103, 33, '?', 22, 'dg-txt num') +
      Dg.text(140, 33, '=', 22) + Dg.text(170, 33, '9', 24);
    const cands = (used) => [[4, 40], [7, 82], [5, 124]].map(([v, x]) =>
      `<g class="${used.includes(v) ? 'dg-dim' : ''}">${Dg.rect(x, 84, 38, 38)}${Dg.text(x + 19, 103, v, 20)}</g>`).join('');
    return [
      { svg: Dg.svg('0 0 200 136', eq(null) + cands([])), caption: '빈칸에 들어갈 수를 찾아' },
      { svg: Dg.svg('0 0 200 136', eq(4) + cands([4]) + Dg.tap(143, 103)), caption: '아래에서 골라 채우기' },
    ];
  }

  /** @param {import('./host.js').GameHost} host */

  constructor(host) {
    this.host = host;
    this.spec = ArithGame.levels[host.level - 1];
    this.round = 0;
    this.correct = 0;
    this.phase = Phase.WAIT;
  }

  start() {
    const { stage, level } = this.host;
    this.message = U.el('div', 'stage-msg', '');
    const { body, dots } = U.frame(stage, `${ArithGame.title} · Lv.${level}`, this.message, ArithGame.ROUNDS);
    this.progress = dots;
    this.wrap = U.el('div', 'ar-wrap');
    this.equation = U.el('div', 'ar-eq');
    this.equation.classList.toggle('long', this.spec.blanks > 2);
    this.candidateRow = U.el('div', 'ar-cands');
    this.wrap.append(this.equation, this.candidateRow);
    body.append(this.wrap);
    this.next();
  }

  next() {
    const puzzle = ArithGame.generate(this.spec);
    this.puzzle = puzzle;
    this.fill = puzzle.sol.map(() => null); // 칸마다 { value, btn } 또는 null. 채워 둔 칸은 { value, given: true }
    const givenAt = U.shuffle([...puzzle.sol.keys()]).slice(0, this.spec.given || 0);
    givenAt.forEach((i) => (this.fill[i] = { value: puzzle.sol[i], given: true }));
    const shown = puzzle.cands.filter((value) => !givenAt.some((i) => puzzle.sol[i] === value));
    U.say(this.message, '빈칸에 들어갈 숫자를 고르세요', 'act');
    Progress.current(this.progress, this.round);

    this.equation.innerHTML = '';
    this.slots = puzzle.sol.map((_, i) => {
      const slot = U.el('div', `ar-slot${this.fill[i] ? ' given' : ''}`, '?');
      slot.addEventListener('pointerdown', () => this.unpick(i));
      if (i > 0) this.equation.append(U.el('div', '', puzzle.ops[i - 1] === '+' ? '+' : '−'));
      this.equation.append(slot);
      return slot;
    });
    this.equation.append(U.el('div', '', '='), U.el('div', '', String(puzzle.ans)));

    this.candidateRow.innerHTML = '';
    this.candidateButtons = shown.map((value) => {
      const button = U.el('button', 'ar-cand', String(value));
      button.addEventListener('pointerdown', () => this.pick(value, button));
      this.candidateRow.append(button);
      return button;
    });
    this.phase = Phase.INPUT;
    this.render();
    this.host.question({ ops: puzzle.ops, cands: shown, ans: puzzle.ans, sol: puzzle.sol, solutions: puzzle.count, given: givenAt });
    this.host.timer(this.spec.blanks - givenAt.length, () => this.judge(true));
  }

  // 고른 숫자는 비어 있는 가장 앞 칸에 들어간다
  pick(value, btn) {
    if (this.phase !== Phase.INPUT || btn.disabled) return;
    const slot = this.fill.indexOf(null);
    this.fill[slot] = { value, btn };
    this.host.input({ put: value, slot });
    btn.disabled = true;
    this.host.sfx(Sfx.TAP);
    this.render();
    // 마지막 칸을 채우는 순간 채점한다. 그 전까지는 얼마든지 뺐다 넣었다 할 수 있다.
    if (!this.fill.includes(null)) this.judge();
  }

  unpick(i) {
    if (this.phase !== Phase.INPUT || !this.fill[i] || this.fill[i].given) return;
    this.host.input({ remove: this.fill[i].value, slot: i });
    this.fill[i].btn.disabled = false;
    this.fill[i] = null;
    this.render();
  }

  render() {
    const next = this.fill.indexOf(null);
    this.slots.forEach((slot, i) => {
      const entry = this.fill[i];
      slot.textContent = entry ? String(entry.value) : '?';
      slot.classList.toggle('filled', !!entry);
      slot.classList.toggle('active', this.phase === Phase.INPUT && i === next);
    });
  }

  // 정해 둔 답과 달라도 식만 맞으면 정답이다. timedOut = 시간이 다 되어 채점하는 경우 (빈칸이 남아 있을 수 있다)
  judge(timedOut = false) {
    if (this.phase !== Phase.INPUT) return;
    this.phase = Phase.WAIT;
    this.host.stopTimer();
    this.render();
    const ok = !timedOut && ArithGame.value(this.fill.map((entry) => entry.value), this.puzzle.ops) === this.puzzle.ans;
    this.host.answer({ fill: this.fill.map((entry) => (entry ? entry.value : null)), correct: ok, timedOut });
    this.slots.forEach((slot) => slot.classList.add(ok ? 'right' : 'wrong'));
    Progress.mark(this.progress, this.round, ok);

    if (ok) {
      this.correct++;
      U.say(this.message, '정답!', 'good');
      this.host.award(pointsPer(this.host, ArithGame.ROUNDS), this.equation);
      this.host.sfx(Sfx.GOOD);
    } else {
      const { sol, ops } = this.puzzle;
      U.say(this.message, `${timedOut ? '시간 초과 · ' : ''}정답: ${sol.map((value, i) => (i ? `${ops[i - 1] === '+' ? '+' : '−'} ${value}` : value)).join(' ')}`, 'bad');
      this.candidateButtons.forEach((button) => {
        if (sol.includes(Number(button.textContent))) button.classList.add('answer');
      });
      this.host.sfx(Sfx.BAD);
    }
    this.host.after(ok ? 800 : 1700, () => this.advance());
  }

  advance() {
    this.round++;
    if (this.round < ArithGame.ROUNDS) this.next();
    else this.host.done(this.result());
  }

  result() {
    return resultOf(this.correct, ArithGame.ROUNDS);
  }

  abort() {
    return abortedResult(this.correct, this.round);
  }

  // ---- 계산 ----
  static value(vals, ops) {
    return vals.reduce((t, value, i) => (i === 0 ? value : ops[i - 1] === '+' ? t + value : t - value), 0);
  }

  // ---- 문제 생성 ----
  // 후보와 연산자를 먼저 뽑고, 그 후보로 만들 수 있는 모든 값 가운데 아래 조건에 맞는 것을 답으로 고른다.
  //   - 빈칸이 셋 이상이면 뺄셈이 적어도 하나 들어간다 (전부 덧셈이면 큰 수만 고르면 된다).
  //   - 답은 만들 수 있는 값들의 가운데 구간에서 고른다. 양 끝 값은 가장 큰/작은 수를 몰아 넣어야만 나온다.
  //   - 가장 큰 수들(또는 가장 작은 수들)을 빈칸 하나만 남기고 다 쓰는 풀이가 있으면 버린다.
  //   - 가장 큰 수가 답에 쓰이는 문제와 함정인 문제가 반반 나오게 한다.
  // 반환: ops, cands, ans, sol = 틀렸을 때 보여줄 풀이 하나, count = 답이 되는 조합 수
  static generate({ blanks, n, maxSols, plus = false }) {
    const pool = Array.from({ length: ArithGame.HI - ArithGame.LO + 1 }, (_, i) => ArithGame.LO + i);
    let best = null;
    // 이번 문제에서 가장 큰 수가 답에 쓰이게 할 것인가. 시도마다 다시 정하면 만들기 쉬운 쪽으로 쏠린다.
    const wantBig = Math.random() < 0.5;
    for (let tries = 0; tries < ArithGame.TRIES; tries++) {
      const ops = Array.from({ length: blanks - 1 }, () => (plus || Math.random() < 0.5 ? '+' : '-'));
      if (blanks >= 3 && !plus && !ops.includes('-')) ops[U.rand(ops.length)] = '-';
      const cands = U.shuffle([...pool]).slice(0, n);
      const sorted = [...cands].sort((a, b) => a - b);
      const top = sorted.slice(n - (blanks - 1));
      const bottom = sorted.slice(0, blanks - 1);

      // 값마다: 풀이들, 조합(순서만 다른 것은 하나) 집합
      const byValue = new Map();
      ArithGame.fills(cands, blanks).forEach((fill) => {
        const value = ArithGame.value(fill, ops);
        if (value < 1) return;
        if (!byValue.has(value)) byValue.set(value, { fills: [], sets: new Set() });
        const entry = byValue.get(value);
        entry.fills.push(fill);
        entry.sets.add(ArithGame.signature(fill, ops));
      });
      const values = [...byValue.keys()].sort((a, b) => a - b);
      const mid = values.slice(Math.floor(values.length * 0.25), Math.ceil(values.length * 0.75));

      for (const ans of U.shuffle(mid)) {
        const { fills, sets } = byValue.get(ans);
        // 왼쪽부터 계산할 때 중간 값이 0 이하로 내려가지 않는 풀이를 보여줄 답으로 삼는다
        const sol = fills.find((fill) => fill.every((_, i) => ArithGame.value(fill.slice(0, i + 1), ops) >= 1));
        if (!sol) continue;
        if (blanks >= 3 && fills.some((fill) => top.every((x) => fill.includes(x)) || bottom.every((x) => fill.includes(x)))) continue;
        const usesBig = fills.some((fill) => fill.includes(sorted[n - 1]));
        const miss = Math.max(0, sets.size - maxSols) + (usesBig === wantBig ? 0 : 1);
        const puzzle = { ops, sol, ans, cands, count: sets.size, miss };
        if (miss === 0) return puzzle;
        if (!best || miss < best.miss) best = puzzle;
      }
    }
    return best;
  }

  // 후보에서 k개를 골라 늘어놓는 모든 방법
  static fills(cands, k) {
    if (k === 0) return [[]];
    return cands.flatMap((first, i) => ArithGame.fills(cands.filter((_, j) => j !== i), k - 1).map((rest) => [first, ...rest]));
  }

  // 더하는 칸끼리, 빼는 칸끼리 순서만 바꾼 풀이는 같은 조합으로 본다
  static signature(fill, ops) {
    const plus = fill.filter((_, i) => i === 0 || ops[i - 1] === '+').sort();
    const minus = fill.filter((_, i) => i > 0 && ops[i - 1] === '-').sort();
    return `${plus}|${minus}`;
  }
}
