// 사칙연산 역산
// (?) ± (?) = 답 에서 후보 숫자 중 두 개를 골라 식을 완성한다. 답이 되는 조합은 하나뿐이다.
class ArithGame {
  static id = 'arith';
  static title = '사칙연산 역산';
  static hint = '아래 숫자 중 두 개를 골라<br>식이 맞도록 빈칸을 채우세요';
  static levels = [
    { n: 4, lo: 1, hi: 9 },
    { n: 5, lo: 1, hi: 9 },
    { n: 5, lo: 2, hi: 30 },
    { n: 6, lo: 5, hi: 60 },
    { n: 7, lo: 10, hi: 99 },
    { n: 8, lo: 10, hi: 99 },
  ];
  static maxLevel = ArithGame.levels.length;
  static ROUNDS = 3;

  constructor(host) {
    this.h = host;
    this.spec = ArithGame.levels[host.level - 1];
    this.round = 0;
    this.correct = 0;
    this.phase = 'wait';
  }

  start() {
    const { stage, level } = this.h;
    stage.append(U.el('div', 'stage-title', `${ArithGame.title} · Lv.${level}`));
    this.msg = U.el('div', 'stage-msg', '');
    this.wrap = U.el('div', 'ar-wrap');
    this.progress = U.el('div', 'dots');
    for (let i = 0; i < ArithGame.ROUNDS; i++) this.progress.append(U.el('span'));
    this.eq = U.el('div', 'ar-eq');
    this.cands = U.el('div', 'ar-cands');
    this.wrap.append(this.progress, this.eq, this.cands);
    stage.append(this.msg, this.wrap);
    this.next();
  }

  next() {
    const p = ArithGame.generate(this.spec);
    this.p = p;
    this.slot = 0;
    this.msg.textContent = '';
    this.msg.className = 'stage-msg';
    [...this.progress.children].forEach((d, i) => d.classList.toggle('cur', i === this.round));

    this.eq.innerHTML = '';
    this.slots = [U.el('div', 'ar-slot active', '?'), U.el('div', 'ar-slot', '?')];
    this.eq.append(this.slots[0], U.el('div', '', p.op === '+' ? '+' : '−'), this.slots[1], U.el('div', '', '='), U.el('div', '', String(p.ans)));

    this.cands.innerHTML = '';
    this.btns = p.cands.map((v) => {
      const b = U.el('button', 'ar-cand', String(v));
      b.addEventListener('pointerdown', () => this.pick(v, b));
      this.cands.append(b);
      return b;
    });
    this.phase = 'input';
  }

  pick(v, btn) {
    if (this.phase !== 'input' || btn.disabled) return;
    const { a, b, op } = this.p;
    const s = this.slots[this.slot];
    s.textContent = String(v);
    s.classList.add('filled');
    btn.disabled = true;

    let valid;
    if (this.slot === 0) {
      // 첫 칸: 정답 조합에 들어갈 수 없는 숫자면 바로 오답
      valid = op === '+' ? v === a || v === b : v === a;
      this.need = op === '+' ? this.p.ans - v : b;
    } else {
      valid = v === this.need;
    }

    if (!valid) return this.fail(btn);
    this.h.sfx('tap');
    if (this.slot === 0) {
      this.slot = 1;
      this.slots[0].classList.remove('active');
      this.slots[1].classList.add('active');
    } else {
      this.success();
    }
  }

  success() {
    this.phase = 'wait';
    this.slots.forEach((s) => s.classList.remove('active'));
    this.slots.forEach((s) => s.classList.add('right'));
    this.correct++;
    this.mark('right');
    this.msg.textContent = '정답!';
    this.msg.className = 'stage-msg good';
    this.h.award((this.h.base * this.h.mult) / ArithGame.ROUNDS, this.eq);
    this.h.sfx('good');
    this.h.after(800, () => this.advance());
  }

  fail(btn) {
    this.phase = 'wait';
    btn.classList.add('wrong');
    this.slots.forEach((s) => s.classList.remove('active'));
    this.slots[this.slot].classList.add('wrong');
    this.mark('wrong');
    const { a, b, op } = this.p;
    this.msg.textContent = `정답: ${a} ${op === '+' ? '+' : '−'} ${b}`;
    this.msg.className = 'stage-msg bad';
    this.btns.forEach((bt) => {
      const v = Number(bt.textContent);
      if (v === a || v === b) bt.classList.add('answer');
    });
    this.h.sfx('bad');
    this.h.after(1500, () => this.advance());
  }

  mark(cls) {
    const d = this.progress.children[this.round];
    d.classList.remove('cur');
    d.classList.add(cls);
  }

  advance() {
    this.round++;
    if (this.round < ArithGame.ROUNDS) this.next();
    else this.h.done(this.result());
  }

  result() {
    return { cleared: this.correct === ArithGame.ROUNDS, correct: this.correct, total: ArithGame.ROUNDS };
  }

  abort() {
    return { cleared: false, correct: this.correct, total: this.round };
  }

  // ---- 문제 생성: 정답 조합이 정확히 하나가 되도록 후보를 고른다 ----
  static generate({ n, lo, hi }) {
    for (let tries = 0; tries < 500; tries++) {
      const op = Math.random() < 0.5 ? '+' : '-';
      let a = U.randInt(lo, hi);
      let b = U.randInt(lo, hi);
      if (a === b) continue;
      if (op === '-' && a < b) [a, b] = [b, a];
      const ans = op === '+' ? a + b : a - b;
      const cands = [a, b];
      let guard = 0;
      while (cands.length < n && guard++ < 400) {
        const x = U.randInt(lo, hi);
        if (cands.includes(x)) continue;
        const clash = cands.some((y) =>
          op === '+' ? x + y === ans : x - y === ans || y - x === ans
        );
        if (!clash) cands.push(x);
      }
      if (cands.length === n) return { op, a, b, ans, cands: U.shuffle(cands) };
    }
    return { op: '+', a: 2, b: 3, ans: 5, cands: U.shuffle([2, 3, 7, 9].slice(0, n)) };
  }
}
