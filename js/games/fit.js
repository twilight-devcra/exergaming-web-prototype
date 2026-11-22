// 빈자리 채우기
// 육각형 타일 판에 한 칸이 비어 있고, 둘레의 타일에서 색깔 선이 그 빈자리로 들어온다.
// 아래 조각들에도 같은 색 선이 그려져 있는데 저마다 다른 각도로 돌아가 있다.
// 돌려서 끼웠을 때 모든 선이 이어지는 조각 하나를 고른다.
//
// 조각은 육각형이라 60°씩 여섯 방향으로 돌아간다. 한 변에는 선 끝이 둘까지 들어갈 수 있다.
// 하나면 변의 한가운데에서, 둘이면 나란히 붙어서 끝난다. 그래서 '이 색이 어느 변으로 나가는가'만
// 보면 되고, 선의 굽은 정도 같은 것으로 헷갈릴 일이 없다.
// 한 변에 나란히 놓인 두 선의 순서는 따지지 않는다. 순서만 다른 두 조각은 눈으로 가려내기 어렵고
// '돌려서 맞춰 보기'와도 상관없다. 순서는 그리는 쪽에서 선이 덜 엇갈리게 정한다 (arrange).
// 한 색의 선은 하나뿐이라, 조각은 변마다 놓인 색들로 완전히 정해진다.
//
// 오답 조각은 '뒤집은 것'이 아니라 '모양이 다른 것'이다. 돌리는 건 되고 뒤집는 건 안 된다는 규칙이 있으면
// 그 규칙을 따로 알려 줘야 하므로, 아예 뒤집어도 맞지 않는 조각만 오답으로 쓴다.
//
// 난이도는 세 가지로 조절한다.
//   lines — 선 수 (1~3). 많을수록 맞춰 볼 끝점이 늘어난다.
//   choiceCount — 조각 수.
//   pick  — 오답을 고르는 방법. far = 정답과 셋 이상의 변에서 다른 것, near = 가장 적게 다른 것, any = 아무거나.
//   upright — 조각을 돌려 놓지 않는다 (쉬운 단계). 정답 조각이 빈자리와 같은 방향이라 머릿속으로 돌려 볼 필요가 없다.
import { Util } from '../config.js';
import { Diagram } from '../diagram.js';
import { Sfx } from '../sfx.js';
import { Tag } from './tags.js';
import { Phase, Progress, pointsPer, resultOf, abortedResult } from './kit.js';

export class FitGame {
  static id = 'fit';
  static tags = [Tag.SHAPE];
  static title = '빈자리 채우기';
  static hint = '빈자리에 끼웠을 때 선이 모두 이어지는<br>조각을 아래에서 고르세요';
  static levels = [
    { lines: 1, choiceCount: 2, pick: 'any', upright: true },
    { lines: 1, choiceCount: 3, pick: 'any', upright: true },
    { lines: 1, choiceCount: 3, pick: 'any' },
    { lines: 2, choiceCount: 3, pick: 'far' },
    { lines: 2, choiceCount: 4, pick: 'near' },
    { lines: 3, choiceCount: 4, pick: 'far' },
    { lines: 3, choiceCount: 5, pick: 'near' },
    { lines: 3, choiceCount: 6, pick: 'near' },
  ];
  static maxLevel = FitGame.levels.length;
  static ROUNDS = 3;
  static COLORS = ['#e8453c', '#f5c400', '#2f9bff'];
  // 판과 조각을 같은 단위로 그린다. 조각 버튼은 PIECE_VIEW, 판은 BOARD_VIEW 너비를 보여 주므로
  // 판을 그 비율만큼 크게 띄우면 빈자리와 조각이 화면에서 같은 크기로 보인다 (layout 참고).
  static RADIUS = 42;       // 육각형 중심에서 꼭짓점까지
  static PIECE_VIEW = 100;
  static BOARD_VIEW = 180;
  static LINE = 8;
  static GAP = 7;           // 한 변에 선 끝이 둘일 때 변의 한가운데에서 떨어진 거리

  // 소개 그림: ① 선이 끊긴 빈자리에 ② 선이 모두 이어지는 조각을 끼운다
  static diagram() {
    const piece = [[0], [], [0], [], [], []];
    const view = FitGame.BOARD_VIEW;
    const viewBox = `${-view / 2} ${-view / 2} ${view} ${view}`;
    return [
      { svg: Diagram.svg(viewBox, `<g class="fit-board">${FitGame.drawBoard(piece)}</g>`), caption: '선이 끊긴 빈자리에' },
      { svg: Diagram.svg(viewBox, `<g class="fit-board">${FitGame.drawBoard(piece)}<g class="seat right">${FitGame.drawPiece(piece)}</g></g>`), caption: '선이 이어지는 조각 고르기' },
    ];
  }

  /** @param {import('./host.js').GameHost} host */

  constructor(host) {
    this.host = host;
    this.spec = FitGame.levels[host.level - 1];
    this.round = 0;
    this.correct = 0;
    this.phase = Phase.WAIT;
  }

  start() {
    const { stage, level } = this.host;
    this.message = Util.element('div', 'stage-msg', '');
    const { body, dots } = Util.frame(stage, `${FitGame.title} · Lv.${level}`, this.message, FitGame.ROUNDS);
    this.body = body;
    this.progress = dots;
    this.wrap = Util.element('div', 'fit-wrap');
    this.board = Util.element('div', 'fit-board');
    this.candidateRow = Util.element('div', 'fit-cands');
    this.wrap.append(this.board, this.candidateRow);
    body.append(this.wrap);
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(body);
    this.next();
  }

  next() {
    const pieces = FitGame.makeRound(this.spec);
    this.missingPiece = pieces[0];
    // 조각마다 놓인 방향을 따로 정한다. 정답은 빈자리와 같은 방향으로는 놓지 않는다 — 돌려 보지 않고도 맞힐 수 있다.
    // upright 단계는 거꾸로 일부러 모두 빈자리와 같은 방향으로 둔다.
    this.choices = Util.shuffle(pieces.map((piece, i) => {
      if (this.spec.upright) return { piece, rotation: 0, answer: i === 0 };
      let rotation = Util.randomBelow(6);
      if (i === 0) {
        const turned = [1, 2, 3, 4, 5].filter((turns) => FitGame.code(FitGame.turn(piece, turns)) !== FitGame.code(piece));
        if (turned.length) rotation = turned[Util.randomBelow(turned.length)];
      }
      return { piece, rotation, answer: i === 0 };
    }));

    Util.say(this.message, '선이 모두 이어지는 조각을 고르세요', 'act');
    Progress.current(this.progress, this.round);

    const view = FitGame.BOARD_VIEW;
    this.board.innerHTML =
      `<svg viewBox="${-view / 2} ${-view / 2} ${view} ${view}">${FitGame.drawBoard(this.missingPiece)}</svg>`;
    this.boardSvg = this.board.querySelector('svg');

    const pieceView = FitGame.PIECE_VIEW;
    this.candidateRow.innerHTML = '';
    this.candidateButtons = this.choices.map((choice, i) => {
      const button = Util.element('button', 'fit-cand',
        `<svg viewBox="${-pieceView / 2} ${-pieceView / 2} ${pieceView} ${pieceView}">${FitGame.drawPiece(FitGame.turn(choice.piece, choice.rotation))}</svg>`);
      button.addEventListener('pointerdown', () => this.pick(i, button));
      this.candidateRow.append(button);
      return button;
    });

    this.layout();
    this.phase = Phase.INPUT;
    this.host.question({
      gap: FitGame.code(this.missingPiece),
      shown: this.choices.map((choice) => ({ piece: FitGame.code(choice.piece), rot: choice.rotation, answer: choice.answer })),
    });
    this.host.timer(this.spec.choiceCount, () => this.pick(-1, null));
  }

  layout() {
    const body = this.body;
    const choiceCount = this.spec.choiceCount;
    const ratio = FitGame.PIECE_VIEW / FitGame.BOARD_VIEW;   // 버튼 크기 = 판 크기 * ratio
    // 판과 조각 사이 간격(css gap)을 뺀 높이에 판 + 조각 한 줄을 맞춘다
    const availableHeight = body.clientHeight - 88 - Util.gapOf(this.wrap, 24);
    const pieceSize = Util.clamp(Math.min(availableHeight / (1 / ratio + 1.1), (body.clientWidth - 40) / choiceCount - 16), 52, 132);
    this.wrap.style.setProperty('--psz', `${pieceSize}px`);
    this.wrap.style.setProperty('--bsz', `${Math.round(pieceSize / ratio)}px`);
  }

  // i = 고른 조각. -1 이면 시간이 다 된 것 (끼워 보지 않고 정답 조각만 표시한다)
  pick(i, button) {
    if (this.phase !== Phase.INPUT) return;
    this.phase = Phase.WAIT;
    this.host.stopTimer();
    const choice = this.choices[i];
    const ok = !!choice && choice.answer;
    this.host.answer({ picked: choice ? i : null, correct: ok, timedOut: !choice });

    this.candidateButtons.forEach((candidateButton, j) => {
      candidateButton.disabled = true;
      if (this.choices[j].answer) candidateButton.classList.add('right');
    });
    if (!ok && button) button.classList.add('wrong');
    if (choice) this.seat(choice, ok);
    this.score(ok, choice ? '선이 이어지지 않아요' : '시간 초과');
  }

  // 고른 조각을 빈자리로 돌려 끼워 본다. 오답은 가장 많이 이어지는 방향으로 끼우고,
  // 그래도 어긋나는 변에 표시를 해서 왜 안 맞는지 보이게 한다.
  seat(choice, ok) {
    const turns = FitGame.bestTurn(choice.piece, this.missingPiece);
    const seated = FitGame.turn(choice.piece, turns);
    const seatGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    seatGroup.setAttribute('class', `seat ${ok ? 'right' : 'wrong'}`);
    seatGroup.innerHTML = FitGame.drawPiece(seated);
    seatGroup.style.transform = `rotate(${FitGame.shortest(choice.rotation - turns) * 60}deg)`;
    this.boardSvg.append(seatGroup);
    if (!ok) {
      const marks = FitGame.misses(seated, this.missingPiece).map((missed, edge) => (missed ? FitGame.miss(edge) : '')).join('');
      this.boardSvg.insertAdjacentHTML('beforeend', `<g class="miss">${marks}</g>`);
    }
    requestAnimationFrame(() => requestAnimationFrame(() => (seatGroup.style.transform = 'rotate(0deg)')));
  }

  score(ok, failMessage) {
    Progress.mark(this.progress, this.round, ok);

    if (ok) {
      this.correct++;
      Util.say(this.message, '선이 모두 이어졌어요!', 'good');
      this.host.award(pointsPer(this.host, FitGame.ROUNDS), this.board);
      this.host.sfx(Sfx.GOOD);
    } else {
      Util.say(this.message, failMessage, 'bad');
      this.host.sfx(Sfx.BAD);
    }
    this.host.after(ok ? 1300 : 2200, () => this.advance());
  }

  advance() {
    this.round++;
    if (this.round < FitGame.ROUNDS) return this.next();
    this.resizeObserver.disconnect();
    this.host.done(this.result());
  }

  result() {
    return resultOf(this.correct, FitGame.ROUNDS);
  }

  // 점수는 맞힐 때마다 바로 지급하므로 중단될 때 따로 줄 것이 없다
  abort() {
    this.resizeObserver.disconnect();
    return abortedResult(this.correct, this.round);
  }

  // ---- 조각 다루기 ----
  // 조각은 변 여섯 개의 목록이고, 변마다 거기서 끝나는 선의 색을 작은 번호부터 담는다 (0~2개).
  // 변 0은 오른쪽 위이고 시계 방향으로 번호가 붙는다. 한 색은 서로 다른 두 변에 한 번씩 나타난다.
  static code(piece) {
    return piece.map((edge) => edge.join('')).join('/');
  }

  // 시계 방향으로 60° × times
  static turn(piece, times) {
    const turns = ((times % 6) + 6) % 6;
    return piece.map((_, edge) => piece[(edge - turns + 6) % 6]);
  }

  // -3 ~ 2 단위로 바꿔서 늘 짧은 쪽으로 돌아가게 한다
  static shortest(times) {
    const turns = ((times % 6) + 6) % 6;
    return turns > 3 ? turns - 6 : turns;
  }

  // 돌리거나 뒤집어서 겹칠 수 있는 조각들에 같은 이름을 붙인다.
  // 뒤집은 것까지 한 묶음으로 보기 때문에 오답이 '정답을 뒤집은 것'이 되는 일은 없다.
  static key(piece) {
    const flipped = piece.map((_, edge) => piece[(6 - edge) % 6]);
    let best = null;
    for (const variant of [piece, flipped]) {
      for (let turns = 0; turns < 6; turns++) {
        const name = FitGame.code(FitGame.turn(variant, turns));
        if (best === null || name < best) best = name;
      }
    }
    return best;
  }

  static misses(piece, gap) {
    return piece.map((edge, i) => edge.join('') !== gap[i].join(''));
  }

  // 조각을 빈자리에 끼울 때 어긋나는 변 수가 가장 적은 방향
  static bestTurn(piece, gap) {
    let best = 0;
    let bestMiss = Infinity;
    for (let turns = 0; turns < 6; turns++) {
      const miss = FitGame.misses(FitGame.turn(piece, turns), gap).filter(Boolean).length;
      if (miss < bestMiss) [best, bestMiss] = [turns, miss];
    }
    return best;
  }

  static distance(first, second) {
    return FitGame.misses(FitGame.turn(second, FitGame.bestTurn(second, first)), first).filter(Boolean).length;
  }

  // 선 lines개로 만들 수 있는 모든 조각. 색마다 두 변을 고른다 (작은 색부터 넣으므로 변마다 정렬된 채로 쌓인다).
  static all(lines) {
    const out = [];
    const fill = (piece, color) => {
      if (color === lines) return out.push(piece.map((edgeColors) => edgeColors.slice()));
      for (let fromEdge = 0; fromEdge < 6; fromEdge++) {
        if (piece[fromEdge].length >= 2) continue;
        for (let toEdge = fromEdge + 1; toEdge < 6; toEdge++) {
          if (piece[toEdge].length >= 2) continue;
          piece[fromEdge].push(color);
          piece[toEdge].push(color);
          fill(piece, color + 1);
          piece[fromEdge].pop();
          piece[toEdge].pop();
        }
      }
    };
    fill([[], [], [], [], [], []], 0);
    return out;
  }

  // ---- 한 문제 만들기: 정답 1개 + 어떻게 돌리거나 뒤집어도 맞지 않는 오답들 ----
  // 만들 수 있는 조각을 전부 펼쳐 놓고 묶음마다 하나씩 남긴 뒤, 난이도에 맞는 것을 고른다.
  static makeRound({ lines, choiceCount, pick }) {
    const all = FitGame.all(lines);
    const answer = all[Util.randomBelow(all.length)];
    const own = FitGame.key(answer);
    const classes = new Map();
    for (const piece of Util.shuffle(all)) {
      const pieceKey = FitGame.key(piece);
      if (pieceKey !== own && !classes.has(pieceKey)) classes.set(pieceKey, piece);
    }
    let pool = [...classes.values()].map((piece) => ({ piece, misses: FitGame.distance(answer, piece) }));
    // 선 하나짜리는 끝 사이 간격(1·2·3칸)으로 세 가지뿐이라 고를 것이 없다
    if (pick === 'near') pool.sort((a, b) => a.misses - b.misses);   // 섞어 둔 순서를 지키며 가까운 것부터
    if (pick === 'far') {
      const far = pool.filter((entry) => entry.misses >= 3);
      if (far.length >= choiceCount - 1) pool = far;
    }
    return [answer, ...pool.slice(0, choiceCount - 1).map((entry) => entry.piece)];
  }

  // ---- 그리기 ----
  // 꼭짓점이 위로 가는 육각형. 변 edge 의 바깥쪽 방향은 -60° + 60°·edge (화면 좌표, 시계 방향)
  static normal(edge) {
    const angle = ((-60 + 60 * edge) * Math.PI) / 180;
    return [Math.cos(angle), Math.sin(angle)];
  }

  // 한 변에 선 끝이 둘이면 어느 쪽에 둘지 정한다. 선이 가장 덜 엇갈리는 배치를 고르는데,
  // 기준 방향으로 돌려 놓고 고른 뒤 되돌리기 때문에 조각을 돌려 놓아도 대개 같은 그림이 나온다.
  // (반 바퀴 돌려도 같은 조각 — 예: 마주 보는 두 변을 잇는 나란한 두 선 — 은 두 선의 좌우만 바뀔 수 있다.)
  // 빈자리와 끼워진 조각은 같은 방향의 같은 조각이라 언제나 똑같이 그려지고, 끝이 정확히 이어진다.
  static arrange(piece) {
    let baseTurn = 0;
    for (let turns = 1; turns < 6; turns++) {
      if (FitGame.code(FitGame.turn(piece, turns)) < FitGame.code(FitGame.turn(piece, baseTurn))) baseTurn = turns;
    }
    const base = FitGame.turn(piece, baseTurn);
    const shared = [0, 1, 2, 3, 4, 5].filter((edge) => base[edge].length === 2);
    let best = base;
    let bestCrossings = Infinity;
    for (let mask = 0; mask < 1 << shared.length; mask++) {
      const layout = base.map((edgeColors) => edgeColors.slice());
      shared.forEach((edge, i) => { if (mask & (1 << i)) layout[edge].reverse(); });
      const crossings = FitGame.crossings(layout);
      if (crossings < bestCrossings) [best, bestCrossings] = [layout, crossings];
    }
    return FitGame.turn(best, -baseTurn);
  }

  // 둘레를 시계 방향으로 돌며 선 끝에 번호를 매기면, 두 선은 끝이 서로 엇갈려 놓일 때만 만난다
  static crossings(layout) {
    const ends = {};
    layout.forEach((edgeColors, edge) => edgeColors.forEach((color, j) => (ends[color] ||= []).push(edge * 3 + (edgeColors.length < 2 ? 1 : j * 2))));
    const chords = Object.values(ends);
    let count = 0;
    for (let i = 0; i < chords.length; i++) {
      for (let j = i + 1; j < chords.length; j++) {
        const [start, end] = chords[i];
        const inside = chords[j].filter((point) => point > start && point < end).length;
        if (inside === 1) count++;
      }
    }
    return count;
  }

  // 변 edge 에서 j번째 선 끝의 자리와 바깥쪽 방향. 끝이 하나면 한가운데, 둘이면 시계 방향 순서로 나란히 놓는다.
  // layout 은 arrange 를 거친 배치다.
  static port(layout, edge, j) {
    const apothem = (FitGame.RADIUS * Math.sqrt(3)) / 2;
    const [normalX, normalY] = FitGame.normal(edge);
    const offset = layout[edge].length < 2 ? 0 : (j === 0 ? -1 : 1) * FitGame.GAP;
    return { x: normalX * apothem - normalY * offset, y: normalY * apothem + normalX * offset, normalX, normalY };
  }

  static hex(centerX, centerY, className) {
    const points = [];
    for (let corner = 0; corner < 6; corner++) {
      const angle = ((-90 + 60 * corner) * Math.PI) / 180;
      points.push(`${(centerX + FitGame.RADIUS * Math.cos(angle)).toFixed(2)},${(centerY + FitGame.RADIUS * Math.sin(angle)).toFixed(2)}`);
    }
    return `<polygon class="${className}" points="${points.join(' ')}"/>`;
  }

  // 선은 테두리를 한 번 더 그려서 서로 겹쳐 지나갈 때도 어느 선이 어디로 가는지 보이게 한다
  static stroke(pathData, color) {
    return `<path class="halo" d="${pathData}" stroke-width="${FitGame.LINE + 4}"/>` +
      `<path d="${pathData}" stroke="${color}" stroke-width="${FitGame.LINE}"/>`;
  }

  // 변에서 곧게 INSET 만큼 들어가 꺾은 뒤, 다른 변 앞에서 다시 꺾어 곧게 나간다. 같은 변에서 시작하는 두 선은 처음에 나란히 간다.
  // 곡선으로 그리면 이웃한 변·한 칸 건너 변·마주 보는 변을 잇는 선이 모두 비슷한 호로 보였다. 꺾인 선은 각이 또렷해서
  // 갈고리(이웃) · 넓은 V(한 칸 건너) · 일자(마주 봄)로 한눈에 갈린다.
  static INSET = FitGame.RADIUS * 0.38;
  static drawPiece(pattern) {
    const layout = FitGame.arrange(pattern);
    const inset = FitGame.INSET;
    const fixed = (value) => value.toFixed(2);
    let lines = '';
    for (let color = 0; color < FitGame.COLORS.length; color++) {
      const [start, end] = [0, 1, 2, 3, 4, 5].flatMap((edge) => layout[edge].includes(color) ? [FitGame.port(layout, edge, layout[edge].indexOf(color))] : []);
      if (!end) continue;
      const pathData = `M${fixed(start.x)},${fixed(start.y)} L${fixed(start.x - start.normalX * inset)},${fixed(start.y - start.normalY * inset)} ` +
        `L${fixed(end.x - end.normalX * inset)},${fixed(end.y - end.normalY * inset)} L${fixed(end.x)},${fixed(end.y)}`;
      lines += FitGame.stroke(pathData, FitGame.COLORS[color]);
    }
    return `${FitGame.hex(0, 0, 'tile piece')}<g class="lines">${lines}</g>`;
  }

  // 빈자리와 둘레 타일 여섯 개. 선은 판 바깥에서 들어와 빈자리의 변에서 끊긴다.
  static drawBoard(pattern) {
    const gap = FitGame.arrange(pattern);
    const apothem = (FitGame.RADIUS * Math.sqrt(3)) / 2;
    let tiles = '';
    let stubs = '';
    for (let edge = 0; edge < 6; edge++) {
      const [normalX, normalY] = FitGame.normal(edge);
      tiles += FitGame.hex(normalX * apothem * 2, normalY * apothem * 2, 'tile');
      gap[edge].forEach((color, j) => {
        const { x, y } = FitGame.port(gap, edge, j);
        const pathData = `M${x.toFixed(2)},${y.toFixed(2)} L${(x + normalX * 110).toFixed(2)},${(y + normalY * 110).toFixed(2)}`;
        stubs += FitGame.stroke(pathData, FitGame.COLORS[color]);
      });
    }
    return `${tiles}${FitGame.hex(0, 0, 'gap')}<g class="lines">${stubs}</g>`;
  }

  // 오답을 끼웠을 때 어긋난 변에 찍는 표시. 선 끝이 둘이어도 함께 감싸도록 넉넉하게 그린다.
  static miss(edge) {
    const apothem = (FitGame.RADIUS * Math.sqrt(3)) / 2;
    const [normalX, normalY] = FitGame.normal(edge);
    return `<circle cx="${(normalX * apothem).toFixed(2)}" cy="${(normalY * apothem).toFixed(2)}" r="13"/>`;
  }
}
