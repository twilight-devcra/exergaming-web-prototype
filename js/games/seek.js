// 숨은 순서 찾기
// 육각형 칸으로 된 육각형 판 어딘가에 왼쪽(좁은 화면에서는 위)에 보이는 그림 순서가 일직선으로 딱 한 번 놓여 있다.
// 그 줄에 속한 칸을 하나만 누르면 된다 — 처음 누른 칸이 정답 줄 위에 있는지로 맞고 틀림을 가린다.
// 설명 없이도 '어느 방향이든 된다'가 전해지도록:
//   - 판이 육각형이라 가로줄이 따로 눈에 띄지 않고 여섯 방향이 똑같아 보인다.
//   - 찾을 순서는 가로로 늘어놓지 않고 천천히 도는 사슬로 보여준다 (시작과 끝도 따로 없다).
//   - 쉬운 단계(slanted)의 첫 문제는 일부러 비스듬한 줄에 숨긴다.
// 난이도:
//   radius  — 판 반지름. 칸 수는 1 → 7칸, 2 → 19칸, 3 → 37칸, 4 → 61칸
//   sequenceLength — 찾을 그림 순서의 길이
//   symbolCount — 판에 쓰는 그림 가짓수. 칸마다 이 가운데서 무작위로 고른다
//   decoys  — 한 칸만 다른 가짜 줄의 수
//   slanted — 첫 문제를 비스듬한 줄에 숨긴다 (쉬운 단계)
// 육각 칸은 축 좌표 (column, row) 로 적는다. 흔히 (q, r) 라 쓰는 것으로, row 는 가로줄 번호이고
// column 은 줄마다 반 칸씩 비껴 가는 세로 방향 번호다 (center 참고)
import { Util } from '../config.js';
import { Diagram } from '../diagram.js';
import { Sfx } from '../sfx.js';
import { Tag } from './tags.js';
import { Phase, Progress, pointsPer, resultOf, abortedResult } from './kit.js';

const SEEK_SYMBOLS = [
  // 색만으로 구분하지 않도록 색마다 모양이 다르다 (색약 대응)
  '<circle cx="50" cy="50" r="33" fill="#e5484d"/>',
  '<rect x="21" y="21" width="58" height="58" rx="8" fill="#2f6fed"/>',
  '<polygon points="50,15 88,79 12,79" fill="#1f9d55"/>',
  '<path d="M40 14h20v26h26v20H60v26H40V60H14V40h26z" fill="#8e4ec6"/>',
  '<polygon points="50,6 62,38 94,50 62,62 50,94 38,62 6,50 38,38" fill="#f5b301"/>',
  '<circle cx="50" cy="50" r="27" fill="none" stroke="#06aed5" stroke-width="15"/>',
];

export class SeekGame {
  static id = 'seek';
  static tags = [Tag.SEARCH];
  static title = '숨은 순서 찾기';
  static STACK_BELOW = 560; // 판 자리가 이보다 좁으면 사슬을 판 위에 둔다 (px)
  static hint = '빙글빙글 도는 그림 순서가 판 어딘가에 한 줄로 숨어 있습니다<br>그 줄에 있는 칸을 아무거나 하나 누르세요';
  // slanted — 첫 문제를 비스듬한 줄에 숨긴다. 처음 하는 사람이 나올 법한 단계(Lv1~3)에 둔다
  static levels = [
    // 쉬운 단계: 판이 작고(Lv1 은 7칸에 두 개짜리 순서), 그림 종류가 많아 찾는 순서가 눈에 잘 띈다
    { radius: 1, sequenceLength: 2, symbolCount: 4, decoys: 0, slanted: true },
    { radius: 2, sequenceLength: 3, symbolCount: 5, decoys: 0, slanted: true },
    { radius: 2, sequenceLength: 3, symbolCount: 4, decoys: 0, slanted: true },
    { radius: 2, sequenceLength: 3, symbolCount: 4, decoys: 1 },
    { radius: 3, sequenceLength: 3, symbolCount: 5, decoys: 2 },
    { radius: 3, sequenceLength: 4, symbolCount: 5, decoys: 2 },
    { radius: 4, sequenceLength: 4, symbolCount: 5, decoys: 3 },
    { radius: 4, sequenceLength: 5, symbolCount: 6, decoys: 4 },
  ];
  static maxLevel = SeekGame.levels.length;
  static ROUNDS = 3;
  static DIRECTIONS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]; // 축 좌표 (column, row)의 여섯 방향
  static UNIT = 50; // SVG 안에서 육각형 한 칸의 반지름

  // 소개 그림: ① 이 순서를 ② 판에서 한 줄로 찾아 누른다 (어느 방향이든 된다 — 일부러 비스듬한 줄로 보여 준다)
  static diagram() {
    const viewBox = '-130 -125 260 250';
    // 찾을 순서는 판에서처럼 비스듬히 늘어놓는다 (가로로만 찾는 게 아니라는 것도 함께 보인다)
    const bead = (x, y, symbol) => `<polygon class="dg-cell" points="${SeekGame.hexPoints(x, y, 54)}"/>` +
      `<g transform="translate(${x - 34} ${y - 34}) scale(0.68)">${SEEK_SYMBOLS[symbol]}</g>`;
    const chain = '<line class="dg-chain" x1="-72" y1="-66" x2="72" y2="66"/>' +
      [[-72, -66, 0], [0, 0, 1], [72, 66, 2]].map(([x, y, symbol]) => bead(x, y, symbol)).join('');
    // [column, row, 그림]. column = 0 인 세 칸이 정답 줄이다
    const cells = [[-1, 0, 4], [-1, 1, 0], [0, -1, 0], [0, 0, 1], [0, 1, 2], [1, -1, 3], [1, 0, 5]];
    const unit = SeekGame.UNIT;
    let board = cells.map(([column, row]) => {
      const [x, y] = SeekGame.center(column, row);
      return `<polygon class="${column === 0 ? 'dg-soft' : 'dg-cell'}" points="${SeekGame.hexPoints(x, y, unit * 0.93)}"/>`;
    }).join('');
    const [startX, startY] = SeekGame.center(0, -1);
    const [endX, endY] = SeekGame.center(0, 1);
    board += `<line class="dg-line" x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}"/>`;
    board += cells.map(([column, row, symbol]) => {
      const [x, y] = SeekGame.center(column, row);
      return `<g transform="translate(${x - 31} ${y - 31}) scale(0.62)">${SEEK_SYMBOLS[symbol]}</g>`;
    }).join('');
    return [
      { svg: Diagram.svg(viewBox, chain), caption: '이 순서가' },
      { svg: Diagram.svg(viewBox, board + Diagram.tap(0, 0, 36)), caption: '한 줄로 놓인 곳 누르기' },
    ];
  }

  /** @param {import('./host.js').GameHost} host */

  constructor(host) {
    this.host = host;
    this.spec = SeekGame.levels[host.level - 1];
    this.round = 0;
    this.correct = 0;
    this.phase = Phase.WAIT;
  }

  start() {
    const { stage, level } = this.host;
    this.message = Util.element('div', 'stage-msg', '');
    const { body, dots } = Util.frame(stage, `${SeekGame.title} · Lv.${level}`, this.message, SeekGame.ROUNDS);
    this.body = body;
    this.progress = dots;
    this.wrap = Util.element('div', 'seek-wrap');
    const side = Util.element('div', 'seek-side');
    this.target = Util.element('div', 'seek-target');
    side.append(this.target);
    this.board = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.board.setAttribute('class', 'seek-board');
    this.board.addEventListener('pointerdown', (event) => {
      const cell = event.target.closest('.hcell');
      if (cell) this.pick(Number(cell.dataset.i));
    });
    this.wrap.append(side, this.board);
    body.append(this.wrap);
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(body);
    this.next();
  }

  next() {
    const { radius, sequenceLength } = this.spec;
    // 설명을 대신하는 첫 문제: 가로줄이 아닌 곳에 숨겨 '가로만 보면 안 된다'를 바로 겪게 한다
    const slanted = !!this.spec.slanted && this.round === 0;
    this.puzzle = SeekGame.make(this.spec, slanted);
    const { cells, cellSymbols, sequence } = this.puzzle;
    const glyphs = Util.shuffle([...SEEK_SYMBOLS]);

    Util.say(this.message, `${this.isStacked() ? '위' : '왼쪽'} 순서가 놓인 줄을 누르세요`, 'act');
    Progress.current(this.progress, this.round);

    // 찾을 순서: 천천히 도는 사슬. 그림은 판에서와 같은 방향으로 서 있도록 반대로 돌린다.
    const turn = `${-Math.random() * 30}s`; // 문제마다 다른 각도에서 시작
    this.target.replaceChildren();
    const chain = Util.element('div', 'seek-chain');
    chain.style.animationDelay = turn;
    sequence.forEach((symbol) => {
      const bead = Util.element('div', 'seek-bead',
        `<svg viewBox="0 0 100 100"><polygon class="hexbg" points="${SeekGame.hexPoints(50, 50, 48)}"/>` +
        `<g transform="translate(19 19) scale(0.62)">${glyphs[symbol]}</g></svg>`);
      bead.style.animationDelay = turn;
      chain.append(bead);
    });
    this.target.append(chain);

    // 판
    const unit = SeekGame.UNIT;
    const width = Math.sqrt(3) * unit * (2 * radius + 1);
    const height = unit * (3 * radius + 2);
    this.board.setAttribute('viewBox', `${-width / 2} ${-height / 2} ${width} ${height}`);
    this.aspect = width / height;
    this.board.innerHTML = cells.map(([column, row], i) => {
      const [x, y] = SeekGame.center(column, row);
      return `<g class="hcell clickable" data-i="${i}"><polygon points="${SeekGame.hexPoints(x, y, unit * 0.93)}"/>` +
        `<g transform="translate(${x - 31} ${y - 31}) scale(0.62)">${glyphs[cellSymbols[i]]}</g></g>`;
    }).join('');
    this.cellGroups = [...this.board.querySelectorAll('.hcell')];

    this.wrap.style.setProperty('--len', sequenceLength);
    this.layout();
    this.phase = Phase.INPUT;
    this.host.question({ radius, len: sequenceLength, cells, syms: cellSymbols, seq: sequence, answer: this.puzzle.answer });
    this.host.timer(cells.length, () => this.pick(-1));
  }

  // 좁은 화면(세로로 든 휴대폰)에서는 사슬을 판 위에 둔다. 나란히 두면 판이 들어갈 너비가 없다
  isStacked() {
    return this.body.clientWidth < SeekGame.STACK_BELOW;
  }

  layout() {
    const body = this.body;
    const { sequenceLength } = this.spec;
    // 머리 아래 남은 자리에 판을 맞춘다. 사슬 옆(좁으면 위)에는 사슬이 한 바퀴 돌 자리가 필요하다.
    const stack = this.isStacked();
    this.wrap.classList.toggle('stack', stack);
    const bead = Util.clamp(body.clientWidth / 24, stack ? 22 : 30, 50);
    const side = sequenceLength * bead + (sequenceLength - 1) * 6 + 28;
    const availableHeight = body.clientHeight - 30 - (stack ? side + 16 : 0);
    const availableWidth = body.clientWidth - (stack ? 24 : side + 48);
    const boardHeight = Util.clamp(Math.min(availableHeight, availableWidth / this.aspect), 140, 620);
    this.board.style.height = `${boardHeight}px`;
    this.board.style.width = `${boardHeight * this.aspect}px`;
    this.wrap.style.setProperty('--bead', `${bead}px`);
    this.wrap.style.setProperty('--side', `${side}px`);
  }

  // i = 누른 칸. -1 이면 시간이 다 된 것
  pick(i) {
    if (this.phase !== Phase.INPUT) return;
    this.phase = Phase.WAIT;
    this.host.stopTimer();
    const { answer } = this.puzzle;
    const ok = answer.includes(i);
    this.host.answer({ cell: i >= 0 ? i : null, correct: ok, timedOut: i < 0 });

    this.cellGroups.forEach((cell, j) => {
      cell.classList.remove('clickable');
      if (answer.includes(j)) cell.classList.add(ok ? 'right' : 'reveal');
      else cell.classList.add('dim');
    });
    if (!ok && i >= 0) {
      this.cellGroups[i].classList.remove('dim');
      this.cellGroups[i].classList.add('wrong');
    }
    // 정답 줄을 한 획으로 그어 '일직선'이라는 규칙을 매번 다시 보여준다
    const [startX, startY] = SeekGame.center(...this.puzzle.cells[answer[0]]);
    const [endX, endY] = SeekGame.center(...this.puzzle.cells[answer[answer.length - 1]]);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', `seek-stroke ${ok ? 'right' : 'reveal'}`);
    line.setAttribute('x1', startX);
    line.setAttribute('y1', startY);
    line.setAttribute('x2', endX);
    line.setAttribute('y2', endY);
    this.board.append(line);

    Progress.mark(this.progress, this.round, ok);

    if (ok) {
      this.correct++;
      Util.say(this.message, '정답!', 'good');
      this.host.award(pointsPer(this.host, SeekGame.ROUNDS), this.cellGroups[i]);
      this.host.sfx(Sfx.GOOD);
    } else {
      Util.say(this.message, i >= 0 ? '여기에 있었어요' : '시간 초과 · 여기에 있었어요', 'bad');
      this.host.sfx(Sfx.BAD);
    }
    this.host.after(ok ? 1000 : 1700, () => this.advance());
  }

  advance() {
    this.round++;
    if (this.round < SeekGame.ROUNDS) return this.next();
    this.resizeObserver.disconnect();
    this.host.done(this.result());
  }

  result() {
    return resultOf(this.correct, SeekGame.ROUNDS);
  }

  // 점수는 맞힐 때마다 바로 지급하므로 중단될 때 따로 줄 것이 없다
  abort() {
    this.resizeObserver.disconnect();
    return abortedResult(this.correct, this.round);
  }

  // ---- 좌표 ----
  // 뾰족한 쪽이 위로 가는 육각형 칸. 축 좌표 (column, row) → 칸 중심
  static center(column, row) {
    const unit = SeekGame.UNIT;
    return [Math.sqrt(3) * unit * (column + row / 2), 1.5 * unit * row];
  }

  static hexPoints(x, y, radius) {
    return Array.from({ length: 6 }, (_, corner) => {
      const angle = ((60 * corner - 90) * Math.PI) / 180;
      return `${(x + Math.cos(angle) * radius).toFixed(1)},${(y + Math.sin(angle) * radius).toFixed(1)}`;
    }).join(' ');
  }

  // ---- 문제 생성 ----
  // 반환: cells = [[column, row], ...], cellSymbols = 칸마다의 그림 번호, sequence = 찾을 순서, answer = 정답 줄의 칸 번호들.
  // 순서는 여섯 방향 중 어느 쪽으로 읽어도 판 전체에서 정확히 한 줄에만 나온다.
  static make({ radius, sequenceLength, symbolCount, decoys }, slanted) {
    const cells = [];
    for (let column = -radius; column <= radius; column++) {
      for (let row = -radius; row <= radius; row++) {
        if (Math.abs(column + row) <= radius) cells.push([column, row]);
      }
    }
    const index = new Map(cells.map(([column, row], i) => [`${column},${row}`, i]));
    // 판 안에 온전히 들어가는 길이 sequenceLength 의 모든 줄 (방향 포함)
    const lines = [];
    cells.forEach(([column, row]) => {
      SeekGame.DIRECTIONS.forEach(([stepColumn, stepRow]) => {
        const line = [];
        for (let position = 0; position < sequenceLength; position++) {
          const i = index.get(`${column + stepColumn * position},${row + stepRow * position}`);
          if (i === undefined) return;
          line.push(i);
        }
        lines.push({ line, flat: stepRow === 0 });
      });
    });
    const other = (symbol) => (symbol + 1 + Util.randomBelow(symbolCount - 1)) % symbolCount;

    for (;;) {
      // 뒤집어도 같은 순서는 한 줄이 양쪽 방향으로 두 번 맞아 버리므로 쓰지 않는다
      let sequence;
      do {
        sequence = Array.from({ length: sequenceLength }, () => Util.randomBelow(symbolCount));
      } while (sequence.every((symbol, position) => symbol === sequence[sequenceLength - 1 - position]));

      const cellSymbols = cells.map(() => Util.randomBelow(symbolCount));
      const pool = slanted ? lines.filter((candidate) => !candidate.flat) : lines;
      const answer = pool[Util.randomBelow(pool.length)].line;
      answer.forEach((i, position) => (cellSymbols[i] = sequence[position]));
      const locked = new Set(answer);

      // 가짜 줄: 정답과 겹치지 않는 곳에, 처음이나 끝 한 칸만 다르게 놓는다
      for (let decoy = 0; decoy < decoys; decoy++) {
        const free = lines.filter((candidate) => candidate.line.every((i) => !locked.has(i)));
        if (!free.length) break;
        const { line } = free[Util.randomBelow(free.length)];
        const wrongAt = Util.randomBelow(2) ? 0 : sequenceLength - 1;
        line.forEach((i, position) => {
          cellSymbols[i] = position === wrongAt ? other(sequence[position]) : sequence[position];
          locked.add(i);
        });
      }

      // 우연히 생긴 또 다른 정답 줄을 없앤다: 그 줄에서 정답에 속하지 않는 칸 하나를 다른 그림으로 바꾼다
      for (let pass = 0; pass < 200; pass++) {
        const extra = lines.find(({ line }) => line !== answer && line.every((i, position) => cellSymbols[i] === sequence[position]));
        if (!extra) return { cells, cellSymbols, sequence, answer };
        const outside = extra.line.filter((i) => !answer.includes(i));
        const loose = outside.filter((i) => !locked.has(i));
        const i = (loose.length ? loose : outside)[Util.randomBelow((loose.length ? loose : outside).length)];
        cellSymbols[i] = other(cellSymbols[i]);
      }
    }
  }
}
