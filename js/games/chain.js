// 조각 잇기
// 왼쪽 벽에서 오른쪽 벽까지 빈칸이 한 줄로 놓여 있고, 아래에 퍼즐 조각이 있다.
// 조각마다 왼쪽 끝은 홈, 오른쪽 끝은 돌기이고 모양(동그라미·세모·네모·티자)이 저마다 다르다.
// 누른 조각이 줄의 다음 빈칸에 붙는데, 그 조각의 홈이 바로 앞 돌기와 같은 모양이어야 한다. 조각을 모두 써야 끝난다.
//
// 계획하기(런던 탑 검사)를 노린다. 놓은 조각은 되돌릴 수 없고, 지금 맞는 조각이라도 나중에 길이 막힐 수 있다.
// 예: 세모 돌기로 끝나는 조각을 너무 일찍 쓰면, 남은 조각 가운데 세모 홈으로 시작하는 것이 없어 멈춘다.
// 숫자를 더하지 않고 모양만 맞추므로 계산 게임이 되지 않는다.
//
// 맞지 않는 조각은 흐리게 하고 누를 수 없다. 모양을 잘못 보는 실수는 막고, 앞을 내다보는 선택만 남긴다.
// 남은 조각 가운데 이어 붙일 것이 하나도 없으면 그 문제는 실패이고, 길이 막힌 첫 조각을 표시해 보여 준다.
//
// 문제는 무작위로 만든 뒤 모든 순서를 풀어 보고 레벨 조건에 맞는 것만 쓴다 (make, analyze).
// 모양 가짓수가 적을수록 쉽다. 두 가지뿐이면 잘못 고른 조각이 바로 다음 수에 막혀서 앞을 내다볼 일이 거의 없다.
// 난이도:
//   pieceCount — 조각 수.
//   shapes — 돌기 모양 가짓수 (3~4).
//   depth  — 함정 깊이 [최소, 최대]. 잘못 고른 조각 하나를 놓은 뒤 길이 막힐 때까지 놓을 수 있는 조각 수 (그 조각 포함). 0 이면 함정이 없다 (어느 순서로 놓아도 끝까지 간다).
//   pMax   — 맞는 조각을 아무거나 눌렀을 때 끝까지 이을 확률의 상한. 낮을수록 미리 생각해야 한다.
//   pMin   — 같은 확률의 하한 (쉬운 단계).
import { Util } from '../config.js';
import { Diagram } from '../diagram.js';
import { Sfx } from '../sfx.js';
import { Tag } from './tags.js';
import { Phase, Progress, pointsPer, resultOf, abortedResult } from './kit.js';

// 돌기 모양. 점은 (u, v): u = 변에서 바깥으로 나온 거리, v = 변을 따라 가운데에서 떨어진 거리 (위가 음수).
// 돌기와 홈은 같은 점을 쓴다 — 앞 조각의 돌기가 뒤 조각의 홈에 꼭 맞는다.
// 모양에 색을 칠하지 않는다. 돌기를 모양 색으로 칠했더니 조각이 한 덩어리로 보이지 않고 상자에 색 표시를 붙인 것처럼 보였다.
// 조각은 모두 같은 종이 질감 하나이고, 돌기와 홈의 윤곽만으로 모양을 가린다 (진짜 직소 퍼즐처럼)
// 동그라미: 좁은 목(폭 12) 끝에 반지름 10 의 원. 원은 목과 만나는 −143° 에서 바깥 끝(0°)을 거쳐 +143° 까지 그린다
const circlePoints = () => {
  const startAngle = Math.atan2(-6, 5 - 13);
  const arc = Array.from({ length: 17 }, (_, step) => {
    const angle = startAngle - (2 * startAngle * (step + 1)) / 18;
    return [13 + 10 * Math.cos(angle), 10 * Math.sin(angle)];
  });
  return [[0, -6], [5, -6], ...arc, [5, 6], [0, 6]];
};
// 점은 작은 격자에 그린 뒤 KNOB_SCALE 배로 키운다
const KNOB_SCALE = 1.25;
const SHAPES = [
  { id: 'circle', name: '동그라미', points: circlePoints() },
  { id: 'triangle', name: '세모', points: [[0, -14], [22, 0], [0, 14]] },
  { id: 'square', name: '네모', points: [[0, -12], [20, -12], [20, 12], [0, 12]] },
  { id: 'tee', name: '티자', points: [[0, -5], [11, -5], [11, -14], [22, -14], [22, 14], [11, 14], [11, 5], [0, 5]] },
].map((shape) => ({ ...shape, points: shape.points.map(([outward, along]) => [outward * KNOB_SCALE, along * KNOB_SCALE]) }));

export class ChainGame {
  static id = 'chain';
  static tags = [Tag.SHAPE];
  static title = '조각 잇기';
  static hint = '모양이 맞는 조각을 이어 끝까지 채우세요<br>놓은 조각은 되돌릴 수 없으니 미리 생각해 보세요';
  static levels = [
    // 쉬운 단계: 함정이 없거나 바로 드러난다. Lv1 은 조각 둘로 '모양을 맞춰 잇는다'만 익힌다
    { pieceCount: 2, shapes: 3, depth: [0, 0] },
    { pieceCount: 4, shapes: 3, depth: [0, 1], pMin: 0.5 },
    // 잘못 고르면 다음 수에 막힌다
    { pieceCount: 4, shapes: 3, depth: [1, 1], pMax: 0.67 },
    // 함정이 한 수 더 깊어지기 시작한다
    { pieceCount: 5, shapes: 3, depth: [1, 2], pMax: 0.67 },
    { pieceCount: 5, shapes: 3, depth: [2, 2], pMax: 0.6 },
    { pieceCount: 6, shapes: 3, depth: [2, 3], pMax: 0.5 },
    // 모양 네 가지: 함정이 깊어진다. 8조각·함정 4~6수(Lv8 의 처음 값)는 너무 어려워 뺐다
    { pieceCount: 6, shapes: 4, depth: [3, 4], pMax: 0.5 },
    { pieceCount: 7, shapes: 4, depth: [3, 5], pMax: 0.4 },
  ];
  static maxLevel = ChainGame.levels.length;
  static ROUNDS = 2;
  static PIECE_WIDTH = 76;    // 조각 한 칸의 너비 (판 단위). 몸통은 정사각형이다 — 넓으면 조각이 아니라 상자처럼 보였다
  static PIECE_HEIGHT = 76;    // 조각 높이
  static KNOB = 30; // 돌기가 튀어나온 길이 (가장 긴 동그라미 28.75)
  static WALL = 40; // 양쪽 벽 두께 (마지막 돌기가 벽 밖으로 나오지 않게 KNOB 보다 두껍게)
  static PADDING = 5;   // 그림 둘레 여백
  static ARROW = 30; // 줄 위에 다음 칸을 가리키는 화살표가 들어갈 높이

  // 소개 그림: ① 앞 돌기와 모양이 맞는 조각을 골라 ② 끝까지 모두 잇는다
  static diagram() {
    const { PIECE_WIDTH, PIECE_HEIGHT, WALL, PADDING } = ChainGame;
    const [circleShape, triangleShape, squareShape] = SHAPES;
    const { ARROW } = ChainGame;
    const rowViewBox = (slots) => `${-WALL - PADDING} ${-PADDING} ${slots * PIECE_WIDTH + 2 * WALL + 2 * PADDING} ${PIECE_HEIGHT + 2 * PADDING}`;
    // ① 벽의 동그라미 돌기 · 다음 칸 · 아래 조각 둘 (동그라미 홈은 누르고, 세모 홈은 흐리게)
    const trayY = PIECE_HEIGHT + 30;
    const pick = ChainGame.defs() + `<g class="ch-row">${ChainGame.slot(0)}${ChainGame.slot(PIECE_WIDTH)}${ChainGame.wallStart(circleShape)}${ChainGame.wallEnd(2 * PIECE_WIDTH, squareShape)}` +
      `<g transform="translate(${PIECE_WIDTH / 2} 0)">${ChainGame.arrow()}</g></g>` +
      `<g transform="translate(-20 ${trayY})">${ChainGame.piece(0, circleShape, triangleShape)}</g>` +
      `<g transform="translate(${PIECE_WIDTH + 30} ${trayY})" opacity="0.5">${ChainGame.piece(0, triangleShape, squareShape)}</g>` +
      Diagram.tap(30, trayY + PIECE_HEIGHT / 2, 18);
    const pickViewBox = `${-WALL - PADDING} ${-PADDING - ARROW} ${2 * PIECE_WIDTH + 2 * WALL + 2 * PADDING + 20} ${trayY + PIECE_HEIGHT + 2 * PADDING + ARROW}`;
    const done = ChainGame.defs() + `<g class="ch-row">${ChainGame.wallStart(circleShape)}${ChainGame.piece(0, circleShape, triangleShape)}${ChainGame.piece(PIECE_WIDTH, triangleShape, squareShape)}${ChainGame.wallEnd(2 * PIECE_WIDTH, squareShape)}</g>`;
    return [
      { svg: Diagram.svg(pickViewBox, pick), caption: '모양이 맞는 조각을 골라' },
      { svg: Diagram.svg(rowViewBox(2), done), caption: '조각을 모두 써서 끝까지 잇기' },
    ];
  }

  /** @param {import('./host.js').GameHost} host */

  constructor(host) {
    this.host = host;
    this.spec = ChainGame.levels[host.level - 1];
    this.round = 0;
    this.correct = 0;
    this.answered = 0; // 채점한 문제 수. round 는 피드백이 끝나야 넘어가므로, 피드백 중에 판이 끝나면(abort) 이것으로 센다
    this.phase = Phase.WAIT;
  }

  start() {
    const { stage, level } = this.host;
    this.message = Util.element('div', 'stage-msg', '');
    const { body, dots } = Util.frame(stage, `${ChainGame.title} · Lv.${level}`, this.message, ChainGame.ROUNDS);
    this.body = body;
    this.progress = dots;
    this.wrap = Util.element('div', 'ch-wrap');
    this.rowBox = Util.element('div', 'ch-rowbox');
    this.tray = Util.element('div', 'ch-tray');
    this.wrap.append(this.rowBox, this.tray);
    body.append(this.wrap);
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(body);
    this.next();
  }

  next() {
    const puzzle = ChainGame.make(this.spec);
    this.puzzle = puzzle;
    // 이번 문제에 쓸 모양: 네 가지 가운데 shapes 가지를 무작위로
    this.kinds = Util.shuffle([...SHAPES]).slice(0, this.spec.shapes);
    // 아래 조각은 섞어 둔다. 늘어놓은 차례가 그대로 정답이면 다시 섞는다
    const order = puzzle.pieces.map((_, i) => i);
    for (let attempt = 0; attempt < 20; attempt++) {
      Util.shuffle(order);
      if (!ChainGame.solves(puzzle.start, order.map((i) => puzzle.pieces[i]))) break;
    }
    this.order = order;               // 단추 차례 → 조각 번호
    this.placed = [];               // 놓은 조각 번호 (차례대로)
    this.endKnob = puzzle.start;             // 줄 끝의 돌기 모양
    this.deadAt = -1;               // 길이 처음 막힌 수 (놓은 차례, 0부터)

    Util.say(this.message, '맞는 조각을 차례로 누르세요', 'act');
    Progress.current(this.progress, this.round);

    const { PIECE_WIDTH, PIECE_HEIGHT, WALL, PADDING, ARROW } = ChainGame;
    const pieceCount = puzzle.pieces.length;
    this.rowWidth = pieceCount * PIECE_WIDTH + 2 * WALL + 2 * PADDING;
    this.rowHeight = PIECE_HEIGHT + 2 * PADDING + ARROW;
    this.rowBox.innerHTML = `<svg class="ch-row" viewBox="${-WALL - PADDING} ${-PADDING - ARROW} ${this.rowWidth} ${this.rowHeight}">` +
      `${ChainGame.defs()}<g class="ch-slots"></g><g class="ch-placed"></g>` +
      `${ChainGame.wallStart(this.kind(puzzle.start))}<g class="ch-end">${ChainGame.wallEnd(pieceCount * PIECE_WIDTH, this.kind(puzzle.finish))}</g>` +
      `<g class="ch-next">${ChainGame.arrow()}</g></svg>`;
    this.rowSvg = this.rowBox.firstChild;
    this.slotsGroup = this.rowSvg.querySelector('.ch-slots');
    this.placedGroup = this.rowSvg.querySelector('.ch-placed');
    this.endGroup = this.rowSvg.querySelector('.ch-end');
    this.nextGroup = this.rowSvg.querySelector('.ch-next');

    const { KNOB } = ChainGame;
    this.tray.replaceChildren();
    this.pieceButtons = this.order.map((pieceIndex) => {
      const [sock, knob] = puzzle.pieces[pieceIndex];
      const button = Util.element('button', 'ch-piece',
        `<svg viewBox="${-PADDING} ${-PADDING} ${PIECE_WIDTH + KNOB + 2 * PADDING} ${PIECE_HEIGHT + 2 * PADDING}">${ChainGame.defs()}${ChainGame.piece(0, this.kind(sock), this.kind(knob))}</svg>`);
      button.addEventListener('pointerdown', () => this.pick(pieceIndex));
      this.tray.append(button);
      return button;
    });
    this.buttonOf = new Map(this.order.map((pieceIndex, buttonIndex) => [pieceIndex, this.pieceButtons[buttonIndex]]));

    this.refresh();
    this.layout();
    this.phase = Phase.INPUT;
    this.host.question({
      start: puzzle.start, finish: puzzle.finish,
      pieces: this.order.map((buttonIndex) => puzzle.pieces[buttonIndex]), // 단추 차례대로 [홈, 돌기]
      shapes: this.kinds.map((shape) => shape.id),       // 모양 번호 → 모양 id
      sols: puzzle.sols, traps: puzzle.traps, depth: puzzle.depth, pRandom: Math.round(puzzle.randomChance * 1000) / 1000,
    });
    this.host.timer(pieceCount, () => this.end('timeout'));
  }

  kind(shapeIndex) {
    return this.kinds[shapeIndex];
  }

  // 다음 빈칸 표시와 누를 수 있는 조각을 맞춘다
  refresh() {
    const pieceCount = this.puzzle.pieces.length;
    const placedCount = this.placed.length;
    this.slotsGroup.innerHTML = Array.from({ length: pieceCount - placedCount }, (_, j) => ChainGame.slot((placedCount + j) * ChainGame.PIECE_WIDTH)).join('');
    // 화살표는 다음 칸 위로 옮긴다 (css transition 으로 미끄러진다). 다 채우면 숨긴다
    this.nextGroup.style.transform = `translateX(${(Math.min(placedCount, pieceCount - 1) + 0.5) * ChainGame.PIECE_WIDTH}px)`;
    this.nextGroup.classList.toggle('gone', placedCount >= pieceCount);
    this.buttonOf.forEach((button, pieceIndex) => {
      const used = this.placed.includes(pieceIndex);
      button.classList.toggle('used', used);
      button.disabled = used || this.puzzle.pieces[pieceIndex][0] !== this.endKnob;
    });
  }

  layout() {
    if (!this.puzzle) return;
    const body = this.body;
    const availableWidth = body.clientWidth - 16;
    const availableHeight = body.clientHeight - 16;
    const pieceCount = this.puzzle.pieces.length;
    const { PIECE_WIDTH, PIECE_HEIGHT, KNOB, PADDING } = ChainGame;
    const gap = Util.gapOf(this.wrap, 24);
    // 줄: 너비에 맞추되 조각 한 칸이 170px 를 넘지 않게
    const rowScale = Math.min(availableWidth / this.rowWidth, 170 / PIECE_WIDTH, (availableHeight * 0.45) / this.rowHeight);
    const rowHeight = this.rowHeight * rowScale;
    this.rowSvg.style.width = `${this.rowWidth * rowScale}px`;
    this.rowSvg.style.height = `${rowHeight}px`;
    // 아래 조각: 한 줄에 다 들어가면 한 줄, 아니면 두~네 줄로. 단추가 가장 커지는 줄 수를 고른다
    const aspectRatio = (PIECE_WIDTH + KNOB + 2 * PADDING) / (PIECE_HEIGHT + 2 * PADDING);
    const trayGap = 12;
    const trayHeight = availableHeight - rowHeight - gap - 8;
    let best = 0;
    for (let rows = 1; rows <= 4; rows++) {
      const cols = Math.ceil(pieceCount / rows);
      const widthLimited = (availableWidth - trayGap * (cols - 1)) / cols;
      const heightLimited = ((trayHeight - trayGap * (rows - 1)) / rows) * aspectRatio;
      best = Math.max(best, Math.min(widthLimited, heightLimited));
    }
    const buttonWidth = Util.clamp(best, 56, 170);
    // 높이도 직접 준다. aspect-ratio 에 맡기면 Safari 는 안의 svg(height:100%)와 맞물려 단추를 길게 늘인다
    this.wrap.style.setProperty('--tw', `${buttonWidth}px`);
    this.wrap.style.setProperty('--th', `${buttonWidth / aspectRatio}px`);
  }

  pick(pieceIndex) {
    if (this.phase !== Phase.INPUT) return;
    const button = this.buttonOf.get(pieceIndex);
    if (!button || button.disabled) return;
    const [, knob] = this.puzzle.pieces[pieceIndex];
    const slot = this.placed.length;
    this.placed.push(pieceIndex);
    this.endKnob = knob;
    const left = this.puzzle.pieces.filter((_, i) => !this.placed.includes(i));
    const alive = ChainGame.canFinish(knob, left);
    if (!alive && this.deadAt < 0) this.deadAt = slot;
    this.host.input({ piece: this.order.indexOf(pieceIndex), slot, alive });
    this.host.sfx(Sfx.TAP);

    const [sock] = this.puzzle.pieces[pieceIndex];
    this.placedGroup.insertAdjacentHTML('beforeend',
      `<g class="ch-put" data-slot="${slot}">${ChainGame.piece(slot * ChainGame.PIECE_WIDTH, this.kind(sock), this.kind(knob))}</g>`);

    this.refresh();
    if (!left.length) return this.end('done');
    if (!left.some(([nextSock]) => nextSock === knob)) this.end('stuck');
  }

  // how = done 다 이음 · stuck 이을 조각이 없음 · timeout 시간 초과
  end(how) {
    if (this.phase !== Phase.INPUT) return;
    this.phase = Phase.WAIT;
    this.host.stopTimer();
    const ok = how === 'done';
    this.pieceButtons.forEach((button) => (button.disabled = true));
    this.host.answer({
      placed: this.placed.map((pieceIndex) => this.order.indexOf(pieceIndex)), // 놓은 차례대로 단추 번호
      correct: ok, stuck: how === 'stuck', timedOut: how === 'timeout',
      deadAt: this.deadAt >= 0 ? this.deadAt : null,
    });
    this.answered++;

    Progress.mark(this.progress, this.round, ok);
    this.nextGroup.classList.add('gone');

    if (ok) {
      this.correct++;
      this.endGroup.classList.add('right');
      Util.say(this.message, '끝까지 이었어요!', 'good');
      this.host.award(pointsPer(this.host, ChainGame.ROUNDS), this.rowBox);
      this.host.sfx(Sfx.GOOD);
    } else {
      // 길이 처음 막힌 조각을 표시한다. 그 앞까지는 끝까지 갈 수 있었다
      const culprit = this.placedGroup.querySelector(`[data-slot="${this.deadAt}"]`);
      culprit?.classList.add('culprit');
      // 막혔으면 늘 표시할 조각이 있다. 시간 초과인데 표시할 조각이 없으면 그때까지는 길이 열려 있었다
      const prefix = how === 'timeout' ? '시간 초과 · ' : '';
      Util.say(this.message, culprit ? `${prefix}빨간 조각에서 길이 막혔어요` : '시간 초과', 'bad');
      this.host.sfx(Sfx.BAD);
    }
    this.host.after(ok ? 1300 : 2800, () => this.advance());
  }

  advance() {
    this.round++;
    if (this.round < ChainGame.ROUNDS) return this.next();
    this.resizeObserver.disconnect();
    this.host.done(this.result());
  }

  result() {
    return resultOf(this.correct, ChainGame.ROUNDS);
  }

  // 점수는 맞힐 때마다 바로 지급하므로 중단될 때 따로 줄 것이 없다
  abort() {
    this.resizeObserver.disconnect();
    return abortedResult(this.correct, this.answered);
  }

  // ---- 그리기 ----
  // 돌기·홈의 점들을 변 위 x 에, 가운데 높이에 맞춰 놓는다 (along 이 작은 쪽 = 위부터)
  static edge(kind, x) {
    const middleY = ChainGame.PIECE_HEIGHT / 2;
    return kind.points.map(([outward, along]) => [x + outward, middleY + along]);
  }

  static lineTo(list) {
    return list.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  }

  // 조각 질감: 위가 밝은 종이색 그러데이션 하나. svg 마다 새 id 로 넣는다 (같은 id 를 여러 svg 에 두면
  // 먼저 나온 svg 가 사라질 때 다른 svg 의 칠이 빠질 수 있다). 화면 스타일과 상관없이 같은 색이다 (진짜 물건처럼)
  static gradientSerial = 0;
  static defs() {
    ChainGame.gradientId = `chg${++ChainGame.gradientSerial}`;
    return `<defs><linearGradient id="${ChainGame.gradientId}" x1="0" y1="0" x2="0.35" y2="1">` +
      '<stop offset="0" stop-color="#f7e2b8"/><stop offset="0.55" stop-color="#ecc98d"/><stop offset="1" stop-color="#d9ad6a"/>' +
      '</linearGradient></defs>';
  }

  // left 에 놓인 조각: 왼쪽 홈 sockKind, 오른쪽 돌기 knobKind. 몸통·돌기·홈이 하나의 윤곽이고 한 가지로 칠한다.
  // 칠은 속성으로 주어 css 가 덮을 수 있게 한다 (길이 막힌 조각 .culprit). 바로 앞 defs() 의 질감을 쓴다
  static piece(left, sockKind, knobKind) {
    const { PIECE_WIDTH, PIECE_HEIGHT } = ChainGame;
    const knob = ChainGame.edge(knobKind, left + PIECE_WIDTH);
    const sock = ChainGame.edge(sockKind, left);
    const body = `M${left},0 H${left + PIECE_WIDTH} ${ChainGame.lineTo(knob)} V${PIECE_HEIGHT} H${left} ${ChainGame.lineTo([...sock].reverse())} Z`;
    return `<path class="ch-body" d="${body}" fill="url(#${ChainGame.gradientId})"/>`;
  }

  // 왼쪽 벽: 첫 칸 쪽으로 돌기가 나와 있다
  static wallStart(kind) {
    const { PIECE_HEIGHT, WALL } = ChainGame;
    const knob = ChainGame.edge(kind, 0);
    return `<path class="ch-wall" d="M${-WALL},0 H0 ${ChainGame.lineTo(knob)} V${PIECE_HEIGHT} H${-WALL} Z"/>`;
  }

  // 오른쪽 벽: 마지막 조각의 돌기가 들어갈 홈
  static wallEnd(x, kind) {
    const { PIECE_HEIGHT, WALL } = ChainGame;
    const sock = ChainGame.edge(kind, x);
    return `<path class="ch-wall" d="M${x},0 H${x + WALL} V${PIECE_HEIGHT} H${x} ${ChainGame.lineTo([...sock].reverse())} Z"/>`;
  }

  static slot(x) {
    const { PIECE_WIDTH, PIECE_HEIGHT } = ChainGame;
    return `<rect class="ch-slot" x="${x + 3}" y="3" width="${PIECE_WIDTH - 6}" height="${PIECE_HEIGHT - 6}" rx="8"/>`;
  }

  // 다음 칸을 가리키는 아래쪽 화살표. 가운데가 x = 0 이고 줄 위 ARROW 높이 안에 들어간다
  static arrow() {
    return '<path class="ch-arrow" d="M-9,-28 H9 V-16 H17 L0,-3 L-17,-16 H-9 Z"/>';
  }

  // ---- 문제 만들기와 풀기 ----
  // 조각 = [홈, 돌기] (모양 번호). 남은 조각 left 를 돌기 endKnob 뒤에 모두 이을 수 있는가
  static canFinish(endKnob, left) {
    if (!left.length) return true;
    const tried = new Set();
    return left.some(([sock, knob], i) => {
      if (sock !== endKnob || tried.has(`${sock}${knob}`)) return false;
      tried.add(`${sock}${knob}`);
      return ChainGame.canFinish(knob, left.filter((_, j) => j !== i));
    });
  }

  // 조각을 이 차례대로 놓으면 끝까지 이어지는가
  static solves(start, sequence) {
    let endKnob = start;
    for (const [sock, knob] of sequence) {
      if (sock !== endKnob) return false;
      endKnob = knob;
    }
    return true;
  }

  // 반환: sols 서로 다른 정답 차례 수 · traps 바르게 두는 동안 만나는 함정 수 · depth 함정 깊이 (난이도 설명 참고)
  //       forks 함정이 있는 갈림길 수 · randomChance 맞는 조각을 아무거나 눌러 끝까지 갈 확률. 끝까지 이을 수 없으면 null
  static analyze(start, pieces) {
    const pieceCount = pieces.length;
    const full = (1 << pieceCount) - 1;
    const memo = { alive: new Map(), longest: new Map(), chance: new Map() };
    const key = (endKnob, mask) => mask * 8 + endKnob;
    const legal = (endKnob, mask) => pieces.map((_, i) => i).filter((i) => !(mask & (1 << i)) && pieces[i][0] === endKnob);
    // 같은 모양의 조각은 한 번만 따진다
    const moves = (endKnob, mask) => {
      const seen = new Set();
      return legal(endKnob, mask).filter((i) => {
        const pieceKey = pieces[i].join();
        return !seen.has(pieceKey) && seen.add(pieceKey);
      });
    };
    const alive = (endKnob, mask) => {
      if (mask === full) return true;
      const stateKey = key(endKnob, mask);
      if (!memo.alive.has(stateKey)) memo.alive.set(stateKey, moves(endKnob, mask).some((i) => alive(pieces[i][1], mask | (1 << i))));
      return memo.alive.get(stateKey);
    };
    const longest = (endKnob, mask) => {
      const stateKey = key(endKnob, mask);
      if (!memo.longest.has(stateKey)) {
        memo.longest.set(stateKey, Math.max(0, ...moves(endKnob, mask).map((i) => 1 + longest(pieces[i][1], mask | (1 << i)))));
      }
      return memo.longest.get(stateKey);
    };
    const randomChance = (endKnob, mask) => {
      if (mask === full) return 1;
      const stateKey = key(endKnob, mask);
      if (!memo.chance.has(stateKey)) {
        const choices = legal(endKnob, mask);
        memo.chance.set(stateKey, choices.length ? choices.reduce((sum, i) => sum + randomChance(pieces[i][1], mask | (1 << i)), 0) / choices.length : 0);
      }
      return memo.chance.get(stateKey);
    };
    if (!alive(start, 0)) return null;
    let sols = 0;
    let traps = 0;
    let depth = 0;
    let forks = 0;
    const seen = new Set();
    const walk = (endKnob, mask) => {
      if (mask === full) return void sols++;
      const first = !seen.has(key(endKnob, mask));
      seen.add(key(endKnob, mask));
      let fork = false;
      for (const i of moves(endKnob, mask)) {
        const nextMask = mask | (1 << i);
        const knob = pieces[i][1];
        if (alive(knob, nextMask)) walk(knob, nextMask);
        else if (first) {
          traps++;
          fork = true;
          depth = Math.max(depth, 1 + longest(knob, nextMask));
        }
      }
      if (fork) forks++;
    };
    walk(start, 0);
    return { sols, traps, depth, forks, randomChance: randomChance(start, 0) };
  }

  // 시작 모양에서 무작위로 걸어 조각을 만든다 (그러니 늘 정답이 있다). 같은 모양끼리 잇는 조각(●–●)은 하나까지.
  // 레벨 조건에 맞을 때까지 다시 만든다. 레벨마다 평균 몇십 번 안에 맞는다
  static make(spec, rand = Math.random) {
    const { pieceCount, shapes } = spec;
    const [minDepth, maxDepth] = spec.depth;
    let last = null;
    for (let tries = 0; tries < 5000; tries++) {
      const start = Math.floor(rand() * shapes);
      const pieces = [];
      let endKnob = start;
      for (let i = 0; i < pieceCount; i++) {
        const nextKnob = Math.floor(rand() * shapes);
        pieces.push([endKnob, nextKnob]);
        endKnob = nextKnob;
      }
      if (pieces.filter(([sock, knob]) => sock === knob).length > 1) continue;
      const stats = ChainGame.analyze(start, pieces);
      if (!stats) continue;
      last = { start, finish: endKnob, pieces, ...stats };
      if (stats.depth < minDepth || stats.depth > maxDepth) continue;
      if (stats.randomChance > (spec.pMax ?? 1) || stats.randomChance < (spec.pMin ?? 0)) continue;
      return last;
    }
    return last; // 조건에 꼭 맞는 것을 못 찾으면 마지막 것이라도 낸다 (실제로는 일어나지 않는다)
  }
}
