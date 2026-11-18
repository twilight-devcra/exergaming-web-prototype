// 같은 글자 넣기
// 낱말 몇 개에서 같은 글자 하나씩이 빈칸으로 비어 있다. 보기 가운데 모든 빈칸에 들어맞는 글자를 고른다.
//   예) 바□ · □리 → 다 (바다, 다리)
// 말하기·쓰기·듣기 없이 낱말을 떠올리는 언어 게임이다: 빈칸마다 들어갈 수 있는 글자를 떠올려 보고(이름 대기·낱말 인출),
// 모든 낱말에 맞는 하나를 찾는다. 높은 단계는 낱말 하나만 보고는 답을 알 수 없게 해 모든 낱말을 맞춰 보게 한다.
//
// 문제는 미리 만들어 둔 묶음(js/games/blank-bank.js)에서 꺼낸다. 묶음은 node tools/blank-build.js 가 만든다:
// 문제 낱말은 국립국어원 「한국어 학습용 어휘 목록」의 명사이고, 오답 보기가 우연히 모든 빈칸에 맞아 답이 둘이 되지 않도록
// 약 6만 낱말의 사전(맞춤법 검사기 낱말 자료와 위키낱말사전)으로 걸렀다. 레벨 값을 고치면 묶음을 다시 만든다.
// 난이도:
//   words  — 낱말 수 (= 빈칸 수)
//   opts   — 보기 수
//   grades — 문제 낱말의 어휘 등급 (A 가장 쉬움 · B · C)
//   lens   — 낱말 길이 (음절 수)
//   traps  — 함정 오답의 최소 수. 함정은 빈칸 하나만 빼고 모두 아는 낱말이 되는 글자라, 마지막 낱말까지 넣어 봐야 걸러진다.
//            0 이면(Lv1~2) 오답은 어느 빈칸에서도 아는 낱말이 되지 않는다
//   solo   — '혼자 풀리는 빈칸'의 최대 수. 어느 오답도 맞지 않는 빈칸은 그 낱말 하나만 보고 답을 알 수 있다
//   top    — 문제 낱말의 빈도 순위 상한 (어휘 목록의 순위, 작을수록 자주 쓰는 말). 없으면 등급만 본다.
//            Lv1 은 가장 흔한 낱말만 쓰고, 다음·이번 같은 가리키는 것이 없는 말도 뺀다 (tools/blank-build.js ABSTRACT)
//   clean  — 오답이 빈칸에서 사전의 어느 낱말도 되지 않는다 (드문 낱말까지). Lv1 에서 답이 하나뿐인 것을 확실히 한다
import { U } from '../config.js';
import { Dg } from '../diagram.js';
import { BLANK_BANK } from './blank-bank.js';

export class BlankGame {
  static id = 'blank';
  static tags = ['word']; // 꼬리표가 겹치는 게임끼리는 연달아 나오지 않는다 (main.js planPass)
  static title = '같은 글자 넣기';
  static hint(level) {
    return level === 1
      ? '빈칸에 들어갈 글자를 고르세요<br>낱말이 되는 글자는 하나뿐입니다'
      : '빈칸에 똑같이 들어가는 글자 하나를 찾으세요<br>모든 낱말이 말이 되어야 합니다';
  }
  static levels = [
    // 맨 처음: 아주 흔한 두 글자 낱말 하나. 오답은 어떤 낱말도 되지 않는 글자라 보자마자 답이 보인다
    { words: 1, opts: 3, grades: 'A', lens: [2], traps: 0, solo: 1, top: 2000, clean: true },
    // 쉬운 단계: 흔한 두 글자 낱말 둘. 오답은 어느 빈칸에서도 아는 낱말이 되지 않는다
    { words: 2, opts: 3, grades: 'A', lens: [2], traps: 0, solo: 2 },
    { words: 2, opts: 3, grades: 'AB', lens: [2], traps: 1, solo: 1 },
    { words: 3, opts: 4, grades: 'AB', lens: [2], traps: 1, solo: 2 },
    { words: 3, opts: 4, grades: 'AB', lens: [2, 3], traps: 1, solo: 1 },
    { words: 3, opts: 4, grades: 'ABC', lens: [2, 3], traps: 2, solo: 1 },
    { words: 4, opts: 4, grades: 'ABC', lens: [2, 3], traps: 1, solo: 1 },
    // 맨 위: 어느 낱말 하나만 보고는 답을 알 수 없다. 4낱말에 함정 3개는 문제가 거의 없어(160개 중 14개) 함정은 2개에서 멈춘다.
    // 덜 흔한 낱말(B·C 등급)만 쓰는 단계를 따로 두었다가 Lv1 을 새로 넣으며 이 단계에 합쳤다 (B·C 문제는 이 단계 문제의 일부다)
    { words: 4, opts: 5, grades: 'ABC', lens: [2, 3], traps: 2, solo: 0 },
  ];
  static maxLevel = BlankGame.levels.length;
  static ROUNDS = 3;

  // 소개 그림: ① 빈칸에 같은 글자가 들어가는 낱말들 ② 모두에 맞는 글자 고르기. Lv1 은 낱말 하나 (바□ → 다)
  static diagram(level = 2) {
    const word = (x, y, a, b, fill) => {
      const cell = (cx, ch) => (ch === '□'
        ? Dg.rect(cx, y, 34, 34, fill ? 'dg-slot good' : 'dg-slot active') + (fill ? Dg.text(cx + 17, y + 17, fill, 20) : '')
        : Dg.text(cx + 17, y + 17, ch, 22));
      return cell(x, a) + cell(x + 36, b);
    };
    const words = (fill) => word(18, 18, '바', '□', fill) + word(112, 18, '□', '리', fill);
    const opts = [['고', 40], ['다', 82], ['소', 124]].map(([v, x]) => Dg.rect(x, 84, 38, 38) + Dg.text(x + 19, 103, v, 20)).join('');
    if (level === 1) {
      const one = (fill) => word(65, 18, '바', '□', fill);
      return [
        { svg: Dg.svg('0 0 200 136', one(null) + opts), caption: '빈칸에 들어갈 글자를 찾아' },
        { svg: Dg.svg('0 0 200 136', one('다') + opts + Dg.tap(101, 103)), caption: '낱말이 되는 글자 고르기' },
      ];
    }
    return [
      { svg: Dg.svg('0 0 200 136', words(null) + opts), caption: '빈칸에 같은 글자가 들어갑니다' },
      { svg: Dg.svg('0 0 200 136', words('다') + opts + Dg.tap(101, 103)), caption: '모든 낱말에 맞는 글자 고르기' },
    ];
  }

  constructor(host) {
    this.h = host;
    this.spec = BlankGame.levels[host.level - 1];
    this.round = 0;
    this.correct = 0;
    this.phase = 'wait';
    // 문제 셋은 답 글자가 서로 다르게 고른다
    const qs = [];
    for (const q of U.shuffle([...BLANK_BANK[host.level - 1]])) {
      if (qs.some((x) => x[2] === q[2])) continue;
      qs.push(q);
      if (qs.length === BlankGame.ROUNDS) break;
    }
    this.qs = qs;
  }

  start() {
    const { stage, level } = this.h;
    // 낱말이 하나면(Lv1) '모든 빈칸'이라 하지 않는다
    this.ask_ = this.spec.words === 1 ? '빈칸에 들어갈 글자를 고르세요' : '모든 빈칸에 맞는 글자를 고르세요';
    this.msg = U.el('div', 'stage-msg act', this.ask_);
    const { body, dots } = U.frame(stage, `${BlankGame.title} · Lv.${level}`, this.msg, BlankGame.ROUNDS);
    this.progress = dots;
    this.wrap = U.el('div', 'bl-wrap');
    this.board = U.el('div', 'bl-board');
    this.opts = U.el('div', 'ar-cands bl-opts');
    this.wrap.append(this.board, this.opts);
    body.append(this.wrap);
    this.h.after(200, () => this.ask());
  }

  ask() {
    const [words, at, ans, wrong] = this.qs[this.round];
    this.q = { words, at, ans };
    [...this.progress.children].forEach((d, i) => d.classList.toggle('cur', i === this.round));
    U.say(this.msg, this.ask_, 'act');

    // 낱말: 글자마다 칸 하나. 빈칸은 테두리가 있는 칸이다. 4낱말은 좁은 화면에서 두 줄로 넘어간다
    this.board.innerHTML = '';
    this.board.classList.toggle('many', words.length >= 4);
    this.holes = words.map((w, i) => {
      const el = U.el('div', 'bl-word');
      let hole = null;
      [...w].forEach((ch, j) => {
        const c = U.el('div', j === at[i] ? 'bl-ch hole' : 'bl-ch', j === at[i] ? '' : ch);
        if (j === at[i]) hole = c;
        el.append(c);
      });
      this.board.append(el);
      return hole;
    });

    // 보기는 가나다순으로 늘어놓는다 (자리로 답을 짐작할 수 없게)
    const opts = [ans, ...wrong].sort((x, y) => x.localeCompare(y, 'ko'));
    this.opts.innerHTML = '';
    this.btns = opts.map((v) => {
      const b = U.el('button', 'ar-cand bl-opt', v);
      b.addEventListener('pointerdown', () => this.pick(v, b));
      this.opts.append(b);
      return b;
    });
    this.h.sfx('blink');
    this.phase = 'input';
    this.h.question({ words, at, ans, opts });
    this.h.timer(words.length, () => this.pick(null, null));
  }

  // v = 고른 글자. null 이면 시간이 다 된 것
  pick(v, btn) {
    if (this.phase !== 'input') return;
    this.phase = 'wait';
    this.h.stopTimer();
    const { ans } = this.q;
    const ok = v === ans;
    this.h.answer({ picked: v, correct: ok, timedOut: !btn });

    // 고른 글자를 모든 빈칸에 넣어 보여 준다: 틀리면 말이 안 되는 낱말이 눈에 보인다
    this.holes.forEach((hl) => {
      hl.textContent = v || '';
      hl.classList.add(ok ? 'right' : 'wrong');
    });
    this.btns.forEach((b) => {
      b.disabled = true;
      if (b.textContent === ans) b.classList.add(ok ? 'right' : 'answer');
    });
    if (btn && !ok) btn.classList.add('wrong');
    const d = this.progress.children[this.round];
    d.classList.remove('cur');
    d.classList.add(ok ? 'right' : 'wrong');

    if (ok) {
      this.correct++;
      U.say(this.msg, '정답!', 'good');
      this.h.award((this.h.base * this.h.mult) / BlankGame.ROUNDS, btn);
      this.h.sfx('good');
    } else {
      U.say(this.msg, `${btn ? '' : '시간 초과 · '}정답은 '${ans}'`, 'bad');
      this.h.sfx('bad');
      // 잠깐 뒤 빈칸을 정답으로 바꿔 넣어 바른 낱말들을 보여 준다
      this.h.after(btn ? 700 : 300, () => this.holes.forEach((hl) => {
        hl.textContent = ans;
        hl.classList.remove('wrong');
        hl.classList.add('fixed');
      }));
    }
    this.round++;
    const wait = ok ? 900 : 2000;
    if (this.round >= BlankGame.ROUNDS) return this.h.after(wait, () => this.h.done(this.result()));
    this.h.after(wait, () => this.ask());
  }

  result() {
    return { cleared: this.correct === BlankGame.ROUNDS, correct: this.correct, total: BlankGame.ROUNDS };
  }

  // 점수는 맞힐 때마다 바로 지급하므로 중단될 때 따로 줄 것이 없다
  abort() {
    return { cleared: false, correct: this.correct, total: this.round };
  }
}
