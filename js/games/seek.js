// 숨은 순서 찾기
// 육각형 칸으로 된 육각형 판 어딘가에 왼쪽에 보이는 그림 순서가 일직선으로 딱 한 번 놓여 있다.
// 그 줄에 속한 칸을 하나만 누르면 된다 — 처음 누른 칸이 정답 줄 위에 있는지로 맞고 틀림을 가린다.
// 설명 없이도 '어느 방향이든 된다'가 전해지도록:
//   - 판이 육각형이라 가로줄이 따로 눈에 띄지 않고 여섯 방향이 똑같아 보인다.
//   - 찾을 순서는 가로로 늘어놓지 않고 천천히 도는 사슬로 보여준다 (시작과 끝도 따로 없다).
//   - 쉬운 단계(slanted)의 첫 문제는 일부러 비스듬한 줄에 숨긴다.
// 난이도는 판 크기(radius), 순서 길이(len), 그림 종류(symbols),
// 그리고 한 칸만 다른 가짜 줄의 수(decoys)로 조절한다.
const SEEK_SYMBOLS = [
  // 색만으로 구분하지 않도록 색마다 모양이 다르다 (색약 대응)
  '<circle cx="50" cy="50" r="33" fill="#e5484d"/>',
  '<rect x="21" y="21" width="58" height="58" rx="8" fill="#2f6fed"/>',
  '<polygon points="50,15 88,79 12,79" fill="#1f9d55"/>',
  '<path d="M40 14h20v26h26v20H60v26H40V60H14V40h26z" fill="#8e4ec6"/>',
  '<polygon points="50,6 62,38 94,50 62,62 50,94 38,62 6,50 38,38" fill="#f5b301"/>',
  '<circle cx="50" cy="50" r="27" fill="none" stroke="#06aed5" stroke-width="15"/>',
];

class SeekGame {
  static id = 'seek';
  static tags = ['search']; // 꼬리표가 겹치는 게임끼리는 연달아 나오지 않는다 (main.js planPass)
  static title = '숨은 순서 찾기';
  static hint = '왼쪽의 그림 순서가 판 어딘가에 한 줄로 숨어 있습니다<br>그 줄에 있는 칸을 아무거나 하나 누르세요';
  // slanted — 첫 문제를 비스듬한 줄에 숨긴다. 처음 하는 사람이 나올 법한 단계(Lv1~3)에 둔다
  static levels = [
    // 쉬운 단계: 판이 작고(Lv1 은 7칸에 두 개짜리 순서), 그림 종류가 많아 찾는 순서가 눈에 잘 띈다
    { radius: 1, len: 2, symbols: 4, decoys: 0, slanted: true },
    { radius: 2, len: 3, symbols: 5, decoys: 0, slanted: true },
    { radius: 2, len: 3, symbols: 4, decoys: 0, slanted: true },
    { radius: 2, len: 3, symbols: 4, decoys: 1 },
    { radius: 3, len: 3, symbols: 5, decoys: 2 },
    { radius: 3, len: 4, symbols: 5, decoys: 2 },
    { radius: 4, len: 4, symbols: 5, decoys: 3 },
    { radius: 4, len: 5, symbols: 6, decoys: 4 },
  ];
  static maxLevel = SeekGame.levels.length;
  static ROUNDS = 3;
  static DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]; // 축 좌표 (q, r)의 여섯 방향
  static UNIT = 50; // SVG 안에서 육각형 한 칸의 반지름

  // 소개 그림: ① 이 순서를 ② 판에서 한 줄로 찾아 누른다 (어느 방향이든 된다 — 일부러 비스듬한 줄로 보여 준다)
  static diagram() {
    const vb = '-130 -125 260 250';
    // 찾을 순서는 판에서처럼 비스듬히 늘어놓는다 (가로로만 찾는 게 아니라는 것도 함께 보인다)
    const bead = (x, y, s) => `<polygon class="dg-cell" points="${SeekGame.hexPoints(x, y, 54)}"/>` +
      `<g transform="translate(${x - 34} ${y - 34}) scale(0.68)">${SEEK_SYMBOLS[s]}</g>`;
    const chain = '<line class="dg-chain" x1="-72" y1="-66" x2="72" y2="66"/>' +
      [[-72, -66, 0], [0, 0, 1], [72, 66, 2]].map(([x, y, s]) => bead(x, y, s)).join('');
    // [q, r, 그림]. q = 0 인 세 칸이 정답 줄이다
    const cells = [[-1, 0, 4], [-1, 1, 0], [0, -1, 0], [0, 0, 1], [0, 1, 2], [1, -1, 3], [1, 0, 5]];
    const S = SeekGame.UNIT;
    let board = cells.map(([q, r]) => {
      const [x, y] = SeekGame.center(q, r);
      return `<polygon class="${q === 0 ? 'dg-soft' : 'dg-cell'}" points="${SeekGame.hexPoints(x, y, S * 0.93)}"/>`;
    }).join('');
    const [x1, y1] = SeekGame.center(0, -1);
    const [x2, y2] = SeekGame.center(0, 1);
    board += `<line class="dg-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    board += cells.map(([q, r, s]) => {
      const [x, y] = SeekGame.center(q, r);
      return `<g transform="translate(${x - 31} ${y - 31}) scale(0.62)">${SEEK_SYMBOLS[s]}</g>`;
    }).join('');
    return [
      { svg: Dg.svg(vb, chain), caption: '이 순서가' },
      { svg: Dg.svg(vb, board + Dg.tap(0, 0, 36)), caption: '한 줄로 놓인 곳 누르기' },
    ];
  }

  constructor(host) {
    this.h = host;
    this.spec = SeekGame.levels[host.level - 1];
    this.round = 0;
    this.correct = 0;
    this.phase = 'wait';
  }

  start() {
    const { stage, level } = this.h;
    stage.append(U.el('div', 'stage-title', `${SeekGame.title} · Lv.${level}`));
    this.msg = U.el('div', 'stage-msg', '');
    this.wrap = U.el('div', 'seek-wrap');
    const side = U.el('div', 'seek-side');
    this.target = U.el('div', 'seek-target');
    this.progress = U.el('div', 'dots');
    for (let i = 0; i < SeekGame.ROUNDS; i++) this.progress.append(U.el('span'));
    side.append(this.target, this.progress);
    this.board = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.board.setAttribute('class', 'seek-board');
    this.board.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('.hcell');
      if (cell) this.pick(Number(cell.dataset.i));
    });
    this.wrap.append(side, this.board);
    stage.append(this.msg, this.wrap);
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(stage);
    this.next();
  }

  next() {
    const { radius, len } = this.spec;
    // 설명을 대신하는 첫 문제: 가로줄이 아닌 곳에 숨겨 '가로만 보면 안 된다'를 바로 겪게 한다
    const slanted = !!this.spec.slanted && this.round === 0;
    this.puzzle = SeekGame.make(this.spec, slanted);
    const { cells, syms, seq } = this.puzzle;
    const glyphs = U.shuffle([...SEEK_SYMBOLS]);

    U.say(this.msg, '왼쪽 순서가 놓인 줄을 누르세요', 'act');
    [...this.progress.children].forEach((d, i) => d.classList.toggle('cur', i === this.round));

    // 찾을 순서: 천천히 도는 사슬. 그림은 판에서와 같은 방향으로 서 있도록 반대로 돌린다.
    const turn = `${-Math.random() * 30}s`; // 문제마다 다른 각도에서 시작
    this.target.innerHTML = '';
    const chain = U.el('div', 'seek-chain');
    chain.style.animationDelay = turn;
    seq.forEach((s) => {
      const bead = U.el('div', 'seek-bead',
        `<svg viewBox="0 0 100 100"><polygon class="hexbg" points="${SeekGame.hexPoints(50, 50, 48)}"/>` +
        `<g transform="translate(19 19) scale(0.62)">${glyphs[s]}</g></svg>`);
      bead.style.animationDelay = turn;
      chain.append(bead);
    });
    this.target.append(chain);

    // 판
    const S = SeekGame.UNIT;
    const w = Math.sqrt(3) * S * (2 * radius + 1);
    const hgt = S * (3 * radius + 2);
    this.board.setAttribute('viewBox', `${-w / 2} ${-hgt / 2} ${w} ${hgt}`);
    this.aspect = w / hgt;
    this.board.innerHTML = cells.map(([q, r], i) => {
      const [x, y] = SeekGame.center(q, r);
      return `<g class="hcell clickable" data-i="${i}"><polygon points="${SeekGame.hexPoints(x, y, S * 0.93)}"/>` +
        `<g transform="translate(${x - 31} ${y - 31}) scale(0.62)">${glyphs[syms[i]]}</g></g>`;
    }).join('');
    this.cellEls = [...this.board.querySelectorAll('.hcell')];

    this.wrap.style.setProperty('--len', len);
    this.layout();
    this.phase = 'input';
    this.h.question({ radius, len, cells, syms, seq, answer: this.puzzle.answer });
    this.h.timer(cells.length, () => this.pick(-1));
  }

  layout() {
    const s = this.h.stage;
    const { radius, len } = this.spec;
    // 안내 문구가 쓰는 높이를 뺀 나머지에 판을 맞춘다. 왼쪽에는 사슬이 한 바퀴 돌 자리가 필요하다.
    const availH = s.clientHeight - 150;
    const bead = U.clamp(s.clientWidth / 26, 30, 50);
    const side = len * bead + (len - 1) * 6 + 28;
    const availW = s.clientWidth - 80 - side - 48;
    const hgt = U.clamp(Math.min(availH, availW / this.aspect), 140, 620);
    this.board.style.height = `${hgt}px`;
    this.board.style.width = `${hgt * this.aspect}px`;
    this.wrap.style.setProperty('--bead', `${bead}px`);
    this.wrap.style.setProperty('--side', `${side}px`);
  }

  // i = 누른 칸. -1 이면 시간이 다 된 것
  pick(i) {
    if (this.phase !== 'input') return;
    this.phase = 'wait';
    this.h.stopTimer();
    const { answer } = this.puzzle;
    const ok = answer.includes(i);
    this.h.answer({ cell: i >= 0 ? i : null, correct: ok, timedOut: i < 0 });

    this.cellEls.forEach((c, j) => {
      c.classList.remove('clickable');
      if (answer.includes(j)) c.classList.add(ok ? 'right' : 'reveal');
      else c.classList.add('dim');
    });
    if (!ok && i >= 0) {
      this.cellEls[i].classList.remove('dim');
      this.cellEls[i].classList.add('wrong');
    }
    // 정답 줄을 한 획으로 그어 '일직선'이라는 규칙을 매번 다시 보여준다
    const [x1, y1] = SeekGame.center(...this.puzzle.cells[answer[0]]);
    const [x2, y2] = SeekGame.center(...this.puzzle.cells[answer[answer.length - 1]]);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', `seek-stroke ${ok ? 'right' : 'reveal'}`);
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    this.board.append(line);

    const d = this.progress.children[this.round];
    d.classList.remove('cur');
    d.classList.add(ok ? 'right' : 'wrong');

    if (ok) {
      this.correct++;
      U.say(this.msg, '정답!', 'good');
      this.h.award((this.h.base * this.h.mult) / SeekGame.ROUNDS, this.cellEls[i]);
      this.h.sfx('good');
    } else {
      U.say(this.msg, i >= 0 ? '여기에 있었어요' : '시간 초과 · 여기에 있었어요', 'bad');
      this.h.sfx('bad');
    }
    this.h.after(ok ? 1000 : 1700, () => this.advance());
  }

  advance() {
    this.round++;
    if (this.round < SeekGame.ROUNDS) return this.next();
    this.ro.disconnect();
    this.h.done(this.result());
  }

  result() {
    return { cleared: this.correct === SeekGame.ROUNDS, correct: this.correct, total: SeekGame.ROUNDS };
  }

  // 점수는 맞힐 때마다 바로 지급하므로 중단될 때 따로 줄 것이 없다
  abort() {
    this.ro.disconnect();
    return { cleared: false, correct: this.correct, total: this.round };
  }

  // ---- 좌표 ----
  // 뾰족한 쪽이 위로 가는 육각형 칸. 축 좌표 (q, r) → 칸 중심
  static center(q, r) {
    const S = SeekGame.UNIT;
    return [Math.sqrt(3) * S * (q + r / 2), 1.5 * S * r];
  }

  static hexPoints(x, y, rad) {
    return Array.from({ length: 6 }, (_, k) => {
      const a = ((60 * k - 90) * Math.PI) / 180;
      return `${(x + Math.cos(a) * rad).toFixed(1)},${(y + Math.sin(a) * rad).toFixed(1)}`;
    }).join(' ');
  }

  // ---- 문제 생성 ----
  // 반환: cells = [[q, r], ...], syms = 칸마다의 그림 번호, seq = 찾을 순서, answer = 정답 줄의 칸 번호들.
  // 순서는 여섯 방향 중 어느 쪽으로 읽어도 판 전체에서 정확히 한 줄에만 나온다.
  static make({ radius, len, symbols, decoys }, slanted) {
    const cells = [];
    for (let q = -radius; q <= radius; q++) {
      for (let r = -radius; r <= radius; r++) {
        if (Math.abs(q + r) <= radius) cells.push([q, r]);
      }
    }
    const index = new Map(cells.map(([q, r], i) => [`${q},${r}`, i]));
    // 판 안에 온전히 들어가는 길이 len의 모든 줄 (방향 포함)
    const lines = [];
    cells.forEach(([q, r]) => {
      SeekGame.DIRS.forEach(([dq, dr]) => {
        const line = [];
        for (let k = 0; k < len; k++) {
          const i = index.get(`${q + dq * k},${r + dr * k}`);
          if (i === undefined) return;
          line.push(i);
        }
        lines.push({ line, flat: dr === 0 });
      });
    });
    const other = (s) => (s + 1 + U.rand(symbols - 1)) % symbols;

    for (;;) {
      // 뒤집어도 같은 순서는 한 줄이 양쪽 방향으로 두 번 맞아 버리므로 쓰지 않는다
      let seq;
      do {
        seq = Array.from({ length: len }, () => U.rand(symbols));
      } while (seq.every((s, k) => s === seq[len - 1 - k]));

      const syms = cells.map(() => U.rand(symbols));
      const pool = slanted ? lines.filter((l) => !l.flat) : lines;
      const answer = pool[U.rand(pool.length)].line;
      answer.forEach((i, k) => (syms[i] = seq[k]));
      const locked = new Set(answer);

      // 가짜 줄: 정답과 겹치지 않는 곳에, 처음이나 끝 한 칸만 다르게 놓는다
      for (let d = 0; d < decoys; d++) {
        const free = lines.filter((l) => l.line.every((i) => !locked.has(i)));
        if (!free.length) break;
        const { line } = free[U.rand(free.length)];
        const off = U.rand(2) ? 0 : len - 1;
        line.forEach((i, k) => {
          syms[i] = k === off ? other(seq[k]) : seq[k];
          locked.add(i);
        });
      }

      // 우연히 생긴 또 다른 정답 줄을 없앤다: 그 줄에서 정답에 속하지 않는 칸 하나를 다른 그림으로 바꾼다
      for (let pass = 0; pass < 200; pass++) {
        const extra = lines.find(({ line }) => line !== answer && line.every((i, k) => syms[i] === seq[k]));
        if (!extra) return { cells, syms, seq, answer };
        const outside = extra.line.filter((i) => !answer.includes(i));
        const loose = outside.filter((i) => !locked.has(i));
        const i = (loose.length ? loose : outside)[U.rand((loose.length ? loose : outside).length)];
        syms[i] = other(syms[i]);
      }
    }
  }
}
