// 상자 속 과일 세기
// 가운데의 검은 상자로 과일이 들어가고 나온다. 다 끝나면 상자 안에 남은 과일에 대해 묻는다. 한 게임에 순서 하나, 답 하나다.
// 판은 테두리를 두른 네모 칸이다. 과일은 늘 칸의 왼쪽 끝 밖에서 밀려 들어와(스크롤) 상자 뒤로 사라지고,
// 나올 때는 상자 뒤에서 나와 칸의 오른쪽 끝 밖으로 밀려 나간다.
// 한 차례에는 넣기나 빼기 한 가지만 한다. 여러 개를 옮길 때는 한 줄로 하나씩 뒤따라간다 —
// 덩어리로 묶어 옮기거나 넣기와 빼기를 함께 하면 한눈에 세기 어려웠다 (2026-11-02).
// 과일은 이름이 바로 떠오르지 않을 수 있어서 (배·사과 …) 특정 과일을 묻는 질문은 이름 대신 그림으로 묻는다.
//
// 빠르기: 화면 밖에서 0.4초, 0.65초(나타났다 사라지게) 만에 들어가게 했을 때는 너무 빨라 따라갈 수 없었다 (2026-11-02).
// 지금은 가속 없이 SPEED 로 움직인다. 칸 끝과 상자 사이(GAP)를 좁혀서 들어가기·나오기는 늘 같은 거리만 움직인다.
// 시간: 순서를 보여 주는 동안에도 라운드 시계는 간다. 그래서 차례는 2~4번으로 두고 (순서 약 4~8초),
// 난이도는 차례를 늘리는 대신 한 줄에 서는 과일 수·섞임과 질문으로 올린다:
//   steps — 차례 수
//   per   — 한 차례에 한 줄로 옮기는 과일 수 [최소, 최대]
//   kinds — 과일 종류 수
//   mixed — 한 줄 안에서 다음 과일이 앞 과일과 다른 종류일 확률 (0 이면 한 줄은 늘 같은 과일)
//   start — 처음부터 상자 안에 든 과일 수 [최소, 최대]. 상자가 열린 채로 잠깐 보여 준 뒤 닫힌다 (0 이면 빈 상자).
//           상자가 둘이면 두 상자를 합친 수이고, 상자마다 START_MIN 개 이상 든다.
//           첫 차례에는 상자를 비우지 않는다 — 비우면 처음 보여 준 과일을 기억할 필요가 없어진다
//           (예전에는 Lv4 판의 약 4분의 1, Lv8 판의 3분의 1 남짓이 첫 차례에 상자를 비웠다, 2026-11-09)
//   out   — 한 차례가 빼기(상자 → 밖, 또는 상자 → 상자)일 확률 (기본 OUT. 뺄 것이 없으면 넣는다)
//   decoy — 상자 위로 지나가기만 하고 들어가지 않는 과일 수 (주의 흐트리기. 차례와 함께 움직인다. 상자가 하나일 때만)
//   boxes — 상자 수. 둘이면 위아래 두 줄에 하나씩 두고 (줄마다 상자 하나일 때와 똑같이 왼쪽에서 들어가 오른쪽으로 나온다)
//           한쪽 상자에 대해 묻는다. 처음에는 한 줄에 상자 둘을 두고 왼쪽 상자 → 오른쪽 상자로 옮기게 했더니,
//           나오자마자 다른 상자로 들어가는 과일을 따라가기 벅찼다 (2026-11-02)
//   questionTypes — 질문 종류: total 모두 몇 개 · kind (그림) 몇 개 · most 가장 많은 과일 · diff (그림)가 (그림)보다 몇 개 더
//   optionCount — 숫자 보기 수 (기본 4)
import { Util } from '../config.js';
import { Diagram } from '../diagram.js';
import { Sfx } from '../sfx.js';
import { Tag } from './tags.js';

const FRUITS = [
  {
    id: 'apple',
    svg: '<path d="M50 32C38 20 14 24 16 52c2 26 20 40 34 32 14 8 32-6 34-32 2-28-22-32-34-20z" fill="#e5484d"/>' +
      '<path d="M50 32q0-14 6-22" stroke="#7a4a21" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '<path d="M55 21q13-13 24-5-11 13-24 5z" fill="#2fa84f"/>',
  },
  {
    // 바나나는 가늘게 그리면 알아보기 어려워서 (2026-11-02) 모양이 뚜렷한 수박 조각으로 바꿨다
    id: 'watermelon',
    svg: '<path d="M6 34a44 44 0 0 0 88 0z" fill="#2fa84f"/><path d="M14 34a36 36 0 0 0 72 0z" fill="#ef4b5a"/>' +
      [[34, 44], [50, 48], [66, 44], [42, 58], [58, 58]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="4" fill="#2b2b2b"/>`).join(''),
  },
  {
    id: 'grape',
    svg: '<path d="M50 26l3-14" stroke="#2fa84f" stroke-width="5" stroke-linecap="round"/>' +
      [[30, 38], [50, 38], [70, 38], [40, 57], [60, 57], [50, 76]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11.5" fill="#8e4ec6"/>`).join(''),
  },
  {
    id: 'pear',
    svg: '<path d="M50 18c-10 0-12 16-14 24-14 10-16 28-8 38 10 12 34 12 44 0 8-10 6-28-8-38-2-8-4-24-14-24z" fill="#9ccc3c"/>' +
      '<path d="M50 20q0-10 6-14" stroke="#7a4a21" stroke-width="5" fill="none" stroke-linecap="round"/>',
  },
  {
    id: 'orange',
    svg: '<circle cx="50" cy="56" r="32" fill="#f7931e"/><path d="M50 25q12-12 24-6-10 12-24 6z" fill="#2fa84f"/>' +
      '<circle cx="39" cy="45" r="6" fill="#fff" opacity="0.35"/>',
  },
];
// 함께 내지 않는 짝: 작게 보면 둥글고 붉은 기운이 비슷하다
const FRUIT_CLASH = [['apple', 'orange']];

const SVG_NS = 'http://www.w3.org/2000/svg';

// 게임 진행 단계
const Phase = Object.freeze({
  SHOW: 'show',   // 처음에 든 과일을 보여 준다
  PLAY: 'play',   // 과일이 드나든다
  INPUT: 'input', // 답을 기다린다
  END: 'end',
});

// 자리 이름. 세션 기록(steps 의 from·to, 질문의 box)에도 이 값이 그대로 남는다
const Spot = Object.freeze({
  LEFT: 'L',   // 칸 왼쪽 밖 (과일이 들어오는 곳)
  RIGHT: 'R',  // 칸 오른쪽 밖 (과일이 나가는 곳)
  TOP: 'A',    // 위 상자, 또는 하나뿐인 상자
  BOTTOM: 'B', // 아래 상자
});

// 질문 종류 (단계 표의 q). 세션 기록에도 이 값이 남는다
const QuestionType = Object.freeze({
  TOTAL: 'total', // 모두 몇 개
  KIND: 'kind',   // (그림) 몇 개
  MOST: 'most',   // 가장 많은 과일
  DIFF: 'diff',   // (그림)가 (그림)보다 몇 개 더
});

export class BoxGame {
  static id = 'box';
  static tags = [Tag.MEMORY, Tag.NUMBER];
  static title = '상자 속 과일 세기';
  static hint = '상자에 들어가고 나오는 과일을 잘 보고<br>상자 안에 남은 과일을 맞혀 보세요';
  static levels = [
    // 쉬운 단계: 한 가지 과일이 빈 상자에 들어가기만 한다 (Lv2 부터 가끔 나온다)
    { steps: 2, per: [1, 2], kinds: 1, start: 0, out: 0, questionTypes: [QuestionType.TOTAL], optionCount: 3 },
    { steps: 3, per: [1, 2], kinds: 1, start: 0, out: 0.35, questionTypes: [QuestionType.TOTAL], optionCount: 3 },
    // 두 가지 과일 가운데 하나를 묻는다
    { steps: 3, per: [1, 2], kinds: 2, start: 0, questionTypes: [QuestionType.KIND] },
    { steps: 3, per: [1, 3], kinds: 2, start: [2, 3], mixed: 0.3, questionTypes: [QuestionType.KIND, QuestionType.TOTAL] },
    // 비교하는 질문
    { steps: 3, per: [1, 3], kinds: 2, start: [2, 4], mixed: 0.4, questionTypes: [QuestionType.MOST, QuestionType.DIFF, QuestionType.KIND] },
    // 세 가지 과일 · 지나가기만 하는 과일
    { steps: 3, per: [2, 3], kinds: 3, start: [3, 4], mixed: 0.5, decoy: 1, questionTypes: [QuestionType.KIND, QuestionType.MOST] },
    { steps: 4, per: [1, 3], kinds: 3, start: [3, 5], mixed: 0.6, decoy: 2, questionTypes: [QuestionType.DIFF, QuestionType.KIND], optionCount: 5 },
    // 상자 둘 (위아래 두 줄)
    { steps: 4, per: [1, 3], kinds: 2, start: [4, 5], mixed: 0.4, boxes: 2, questionTypes: [QuestionType.KIND, QuestionType.TOTAL], optionCount: 5 },
  ];
  static maxLevel = BoxGame.levels.length;
  static SPEED = 0.1;     // 판 단위/ms. 과일 하나가 칸 끝에서 상자 뒤까지(GAP + FRUIT_SIZE) 약 1.2초
  static PAUSE_MS = 300;  // 한 줄이 다 숨은 뒤 다음 차례까지
  static CAP = 9;         // 상자 하나에 들 수 있는 과일 수 (답이 한 자리 수가 되게)
  static OUT = 0.45;      // 단계 표에 out 이 없을 때 한 차례가 빼기일 확률
  static ZERO = 0.12;     // 답이 0 인 문제를 이 정도만 남긴다 (자주 나오면 '0' 을 찍는 것이 수가 된다)
  static START_MIN = 2;   // 상자가 둘일 때 상자마다 처음 드는 최소 과일 수
  // 판 (판 단위). 한 번에 하나씩 숨으므로 상자는 과일 하나만 가리면 되지만, 열었을 때 9개가 3열로 들어가게 둔다
  static FRUIT_SIZE = 46;     // 움직이는 과일 크기 (열린 상자 속은 OPEN_FRUIT_SIZE)
  static OPEN_FRUIT_SIZE = 24;
  static FRUIT_SPACING = 54;  // 한 줄에서 과일 사이 거리 (가운데끼리)
  static GAP = 76;        // 칸 끝과 상자 사이
  static BOX = { width: 84, height: 84, top: 64 };
  static BOARD_HEIGHT = 160; // 판 높이. 너비는 상자 수에 따라
  static LANE = 32;       // 지나가기만 하는 과일이 다니는 높이 (상자 위)
  static ROWS = { tops: [12, 116], boardHeight: 212 }; // 상자가 둘일 때: 줄마다 상자 위쪽 끝, 판 높이 (지나가는 과일 없이)

  // 소개 그림: ① 들어가고 나오는 과일을 보고 ② 남은 과일 수를 고른다
  static diagram() {
    const [apple, melon] = FRUITS;
    const box = '<rect class="dg-bx" x="62" y="22" width="56" height="50" rx="6"/>' + Diagram.text(90, 48, '?', 22, 'dg-bx-q');
    const step1 = Diagram.glyph(apple.svg, 20, 47, 26) + diagramArrow(36, 56, 47) + box + diagramArrow(124, 144, 47) +
      Diagram.glyph(melon.svg, 160, 47, 26);
    const choices = [1, 2, 3].map((value, i) => Diagram.rect(44 + i * 34, 62, 28, 28) + Diagram.text(58 + i * 34, 76, value, 16)).join('');
    const step2 = Diagram.text(66, 30, '상자 안', 14, 'dg-txt') + Diagram.glyph(apple.svg, 106, 30, 24) + Diagram.text(132, 30, '?', 16, 'dg-txt') +
      choices + Diagram.tap(92, 76, 18);
    return [
      { svg: Diagram.svg('0 0 180 96', step1), caption: '들어가고 나오는 과일을 보고' },
      { svg: Diagram.svg('0 0 180 96', step2), caption: '상자 안에 남은 수 고르기' },
    ];
  }

  /** @param {import('./host.js').GameHost} host */
  constructor(host) {
    this.host = host;
    this.spec = BoxGame.levels[host.level - 1];
    this.phase = Phase.SHOW;
    this.cleared = false;
    this.puzzle = BoxGame.make(this.spec);
  }

  start() {
    const { stage, level } = this.host;
    const { puzzle } = this;
    const hasStartFruits = puzzle.boxes.some((box) => BoxGame.sum(puzzle.start[box]) > 0);
    this.message = Util.element('div', 'stage-msg look', hasStartFruits ? '상자 안의 과일을 잘 보세요' : '들어가고 나오는 과일을 잘 보세요');
    this.body = Util.frame(stage, `${BoxGame.title} · Lv.${level}`, this.message).body;
    this.wrap = Util.element('div', 'bx-wrap');
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('class', 'bx-arena');
    this.svg.setAttribute('viewBox', `0 0 ${puzzle.width} ${puzzle.height}`);
    this.svg.innerHTML = renderArena(puzzle);
    this.backLayer = this.svg.querySelector('.bx-back');
    this.frontLayer = this.svg.querySelector('.bx-front');
    this.boxGroups = perBox(puzzle.boxes, (box) => this.svg.querySelector(`[data-box="${box}"]`));
    this.optionBar = Util.element('div', 'ar-cands bx-opts');
    this.wrap.append(this.svg, this.optionBar);
    this.body.append(this.wrap);
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.body);
    // 보기 높이가 상자 크기 셈에 들어가므로, 보기가 바뀌면 다시 맞춘다
    this.resizeObserver.observe(this.optionBar);
    this.layout();

    if (hasStartFruits) {
      // 처음에 든 과일을 열린 상자 속에 보여 준 뒤 닫는다
      puzzle.boxes.forEach((box) => this.openBox(box, puzzle.start[box]));
      const startTotal = puzzle.boxes.reduce((sum, box) => sum + BoxGame.sum(puzzle.start[box]), 0);
      this.host.after(1100 + 160 * startTotal, () => {
        puzzle.boxes.forEach((box) => this.closeBox(box));
        this.host.sfx(Sfx.BLINK);
        this.host.after(450, () => this.play());
      });
    } else {
      puzzle.boxes.forEach((box) => this.closeBox(box));
      this.host.after(500, () => this.play());
    }
  }

  layout() {
    const { body } = this;
    const aspect = this.puzzle.width / this.puzzle.height;
    // 보기가 없는 동안(과일이 오가는 것을 보는 동안)은 보기 줄을 접어 두어 상자 판이 판 자리를 다 쓰고,
    // 보기가 나오면 그만큼 줄어든다 (css .bx-arena transition)
    const hasOptions = this.optionBar.childElementCount > 0;
    const optionsHeight = hasOptions ? this.optionBar.offsetHeight : 0;
    const gap = hasOptions ? Util.gapOf(this.wrap, 22) : 0;
    // 최소 200px: 화면이 낮아도 상자와 보기가 판 자리를 넘치지 않게
    const fitHeight = body.clientHeight - optionsHeight - gap - 18;
    const width = Math.max(200, Math.min(body.clientWidth - 40, fitHeight * aspect, 960));
    this.svg.style.width = `${width}px`;
    this.svg.style.height = `${width / aspect}px`;
  }

  // 상자를 열어 속(counts = { 과일 id: 수 })을 보여 준다. 과일 종류끼리 모아 3열로 늘어놓는다
  openBox(box, counts) {
    const boxGroup = this.boxGroups[box];
    const size = BoxGame.OPEN_FRUIT_SIZE;
    const fruits = this.puzzle.kinds.flatMap((kind) => Array(counts[kind] || 0).fill(kind));
    const columns = Math.min(3, Math.max(1, fruits.length));
    const rows = Math.ceil(fruits.length / 3);
    const cell = size + 2;
    const firstX = this.puzzle.centerX[box] - ((columns - 1) * cell) / 2;
    const firstY = rowMidY(this.puzzle, box) - ((rows - 1) * cell) / 2;
    boxGroup.querySelector('.bx-in').innerHTML = fruits.map((kind, i) =>
      Diagram.glyph(BoxGame.fruit(kind).svg, firstX + (i % 3) * cell, firstY + Math.floor(i / 3) * cell, size)).join('');
    boxGroup.classList.add('open');
  }

  closeBox(box) {
    const boxGroup = this.boxGroups[box];
    boxGroup.classList.remove('open');
    boxGroup.querySelector('.bx-in').replaceChildren();
  }

  // 순서를 보여 준다. 과일마다 출발 시각·자리·도착 자리를 정해 두고(flight), 게임 시계(host.now)로 위치를 고른다 —
  // 일시정지·운영 메뉴 중에는 과일도 멈춘다. 출발·도착 자리는 칸 밖 또는 상자 뒤에 과일이 통째로 숨는 자리라서
  // 움직이기 전·뒤에는 보이지 않는다. 한 줄의 과일은 같은 길을 FRUIT_SPACING 만큼씩 늦게 출발한다
  play() {
    const { puzzle } = this;
    Util.say(this.message, '잘 보세요', 'look');
    this.phase = Phase.PLAY;
    const { FRUIT_SPACING, SPEED, PAUSE_MS } = BoxGame;
    this.flights = [];
    let stepStart = 0;
    puzzle.steps.forEach((moves) => {
      const stepAt = stepStart;
      let stepEnd = stepStart;
      moves.forEach((move) => {
        move.fruits.forEach((kind, i) => {
          const flight = this.launch(move, kind, stepAt + (i * FRUIT_SPACING) / SPEED);
          // 지나가기만 하는 과일은 다음 차례를 기다리게 하지 않는다
          if (!move.decoy) stepEnd = Math.max(stepEnd, flight.departAt + flight.duration);
        });
      });
      this.host.after(stepAt, () => this.host.sfx(Sfx.BLINK));
      stepStart = stepEnd + PAUSE_MS;
    });
    const clockStart = this.host.now();
    const tick = () => {
      if (this.phase !== Phase.PLAY) return;
      const elapsed = this.host.now() - clockStart;
      this.flights.forEach((flight) => this.placeFlight(flight, Util.clamp((elapsed - flight.departAt) / flight.duration, 0, 1)));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const lastLanding = Math.max(...this.flights.map((flight) => flight.departAt + flight.duration));
    this.host.after(lastLanding + 350, () => this.ask());
  }

  // 과일 하나를 판에 올리고 움직임(flight)을 정한다. departAt = 출발 시각 (순서 시작부터 ms)
  launch(move, kind, departAt) {
    const { puzzle } = this;
    const fromX = departX(puzzle, move.from);
    const toX = arriveX(puzzle, move.to);
    const sprite = document.createElementNS(SVG_NS, 'g');
    sprite.innerHTML = Diagram.glyph(BoxGame.fruit(kind).svg, 0, 0, BoxGame.FRUIT_SIZE);
    (move.decoy ? this.frontLayer : this.backLayer).append(sprite);
    const rowBox = move.to === Spot.RIGHT ? move.from : move.to;
    const flight = { sprite, departAt, duration: Math.abs(toX - fromX) / BoxGame.SPEED, fromX, toX, y: move.decoy ? BoxGame.LANE : rowMidY(puzzle, rowBox) };
    // 상자 가장자리를 지나는 순간 (과일이 반쯤 가려질 때) 상자가 움찔하고 그 자리에 고리가 퍼진다
    if (!move.decoy) {
      if (move.to !== Spot.RIGHT) flight.enter = { box: move.to, x: puzzle.left[move.to] };
      if (move.from !== Spot.LEFT) flight.leave = { box: move.from, x: puzzle.right[move.from] };
    }
    this.flights.push(flight);
    this.placeFlight(flight, 0);
    return flight;
  }

  // progress = 0 (출발) … 1 (도착). 가속 없이 같은 빠르기로
  placeFlight(flight, progress) {
    const x = Util.lerp(flight.fromX, flight.toX, progress);
    flight.sprite.setAttribute('transform', `translate(${x.toFixed(2)} ${flight.y})`);
    if (this.phase !== Phase.PLAY) return;
    this.crossEdge(flight, flight.leave, 'out', x);
    this.crossEdge(flight, flight.enter, 'in', x);
  }

  // 과일이 상자 가장자리(edge)를 처음 지날 때 한 번만 상자를 움찔하게 한다
  crossEdge(flight, edge, direction, x) {
    if (!edge || edge.done || x < edge.x) return;
    edge.done = true;
    this.pulseBox(edge.box, edge.x, flight.y, direction);
  }

  // 들어갈 때(in)와 나올 때(out) 상자가 조금 다르게 움찔한다 (css .bx-box.fx-in / .fx-out). 고리는 가장자리에서 퍼진다
  pulseBox(box, x, y, direction) {
    const boxGroup = this.boxGroups[box];
    boxGroup.classList.remove('fx-in', 'fx-out');
    boxGroup.getBoundingClientRect(); // 연달아 지나가도 움찔하는 애니메이션을 처음부터 다시
    boxGroup.classList.add(`fx-${direction}`);
    const ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('class', 'bx-ring');
    ring.setAttribute('cx', String(x));
    ring.setAttribute('cy', String(y));
    ring.setAttribute('r', String(BoxGame.FRUIT_SIZE / 2));
    ring.addEventListener('animationend', () => ring.remove());
    this.frontLayer.append(ring);
  }

  ask() {
    const { puzzle } = this;
    const { question } = puzzle;
    const twoBoxes = puzzle.boxes.length > 1;
    this.phase = Phase.INPUT;
    this.backLayer.replaceChildren();
    this.frontLayer.replaceChildren();
    if (twoBoxes) this.boxGroups[question.box].classList.add('asked');
    Util.say(this.message, '', 'act');
    this.message.insertBefore(Util.element('span', 'bx-q-text', questionText(question, twoBoxes)), this.message.firstChild);

    this.optionButtons = question.options.map((value) => {
      const label = question.type === QuestionType.MOST ? fruitIcon(value) : String(value);
      const button = Util.element('button', 'ar-cand bx-opt', label);
      button.addEventListener('pointerdown', () => this.pick(value, button));
      this.optionBar.append(button);
      return { value, button };
    });
    this.layout();
    // 세션 기록의 이름(ask·ans·opts)은 예전 기록과 맞춰 둔다 (api/replay.html 이 읽는다)
    this.host.question({
      boxes: puzzle.boxes, kinds: puzzle.kinds, start: puzzle.start, steps: puzzle.steps,
      ask: { type: question.type, box: question.box, kinds: question.kinds },
      ans: question.answer, opts: question.options, end: puzzle.end,
    });
    this.host.timer(questionLoad(puzzle), () => this.pick(null, null));
  }

  // value = 고른 답, button = 누른 보기. 둘 다 null 이면 시간이 다 된 것. 답한 뒤에는 상자를 열어 속을 보여 준다
  pick(value, button) {
    if (this.phase !== Phase.INPUT) return;
    this.phase = Phase.END;
    this.host.stopTimer();
    const { puzzle } = this;
    const { question } = puzzle;
    const correct = value === question.answer;
    this.cleared = correct;
    this.host.answer({ picked: value, correct, timedOut: !button });
    this.optionButtons.forEach((option) => {
      option.button.disabled = true;
      if (option.value === question.answer) option.button.classList.add(correct ? 'right' : 'answer');
    });
    if (!correct && button) button.classList.add('wrong');
    puzzle.boxes.forEach((box) => this.openBox(box, puzzle.end[box]));
    if (correct) {
      Util.say(this.message, '정답!', 'good');
      this.host.award(this.host.base * this.host.multiplier, button);
      this.host.sfx(Sfx.GOOD);
    } else {
      Util.say(this.message, button ? '상자 안을 보세요' : '시간 초과 · 상자 안을 보세요', 'bad');
      this.host.sfx(Sfx.BAD);
    }
    this.host.after(correct ? 1100 : 2000, () => this.finish());
  }

  finish() {
    this.resizeObserver.disconnect();
    this.host.done(this.result());
  }

  result() {
    return { cleared: this.cleared, correct: this.cleared ? 1 : 0, total: 1 };
  }

  abort() {
    const answered = this.phase === Phase.END;
    this.phase = Phase.END;
    this.resizeObserver.disconnect();
    return { cleared: false, correct: this.cleared ? 1 : 0, total: answered ? 1 : 0 };
  }

  static fruit(id) {
    return FRUITS.find((fruit) => fruit.id === id);
  }

  // counts = { 과일 id: 수 } 의 합
  static sum(counts) {
    return Object.values(counts).reduce((sum, count) => sum + count, 0);
  }

  // ---- 문제 만들기 ----
  // 반환 (puzzle): { width, height, boxes, centerX·left·right·top (상자 → 가운데·왼쪽 끝·오른쪽 끝·위쪽 끝),
  //                 kinds, start, steps, end, question }
  //   steps — 차례마다 [{ from, to, fruits: [과일 id, ...] (한 줄의 앞에서부터), decoy }]. 지나가기만 하는 과일 말고는 차례마다 하나다
  //   from·to 는 Spot (L·R 은 드나드는 상자의 줄). start·end = 상자마다 { 과일 id: 수 }
  static make(spec) {
    for (let tries = 0; tries < 400; tries++) {
      const puzzle = BoxGame.tryMake(spec);
      if (puzzle) return puzzle;
    }
    // 조건을 못 맞추면 가장 단순한 판: 한 가지 과일을 넣기만 한다
    const simplest = { ...spec, kinds: 1, start: 0, out: 0, mixed: 0, decoy: 0, boxes: 1, questionTypes: [QuestionType.TOTAL] };
    return BoxGame.tryMake(simplest, true);
  }

  // 판 하나를 만들어 본다. 조건(질문이 되는지 등)을 못 맞추면 null. loose 이면 조건을 느슨하게 본다
  static tryMake(spec, loose = false) {
    const boxCount = spec.boxes || 1;
    const boxes = boxCount === 2 ? [Spot.TOP, Spot.BOTTOM] : [Spot.TOP];
    const { GAP, BOX, ROWS } = BoxGame;
    const width = 2 * GAP + BOX.width;
    const height = boxCount === 2 ? ROWS.boardHeight : BoxGame.BOARD_HEIGHT;
    const left = perBox(boxes, () => GAP);
    const top = perBox(boxes, (box, i) => (boxCount === 2 ? ROWS.tops[i] : BOX.top));
    const right = perBox(boxes, (box) => left[box] + BOX.width);
    const centerX = perBox(boxes, (box) => left[box] + BOX.width / 2);
    const kinds = pickFruitKinds(spec.kinds);
    const counts = perBox(boxes, () => zeroCounts(kinds));
    // 처음 든 과일: 상자가 둘이면 위 상자에 더 많이 (같을 수도 있다), 상자마다 START_MIN 개 이상
    if (spec.start) {
      const total = Util.randomInt(...spec.start);
      const min = BoxGame.START_MIN;
      const bottomCount = boxCount === 2 ? Util.randomInt(min, Math.max(min, Math.floor(total / 2))) : 0;
      addRandomFruits(counts[Spot.TOP], kinds, total - bottomCount);
      if (boxCount === 2) addRandomFruits(counts[Spot.BOTTOM], kinds, bottomCount);
    }
    const start = deepCopy(counts);
    const routes = boxes.flatMap((box) => [[Spot.LEFT, box], [box, Spot.RIGHT]]);
    const steps = [];
    for (let stepIndex = 0; stepIndex < spec.steps; stepIndex++) {
      const move = BoxGame.makeMove(spec, kinds, routes, counts, stepIndex === 0);
      if (!move) return null;
      steps.push([move]);
    }
    // 지나가기만 하는 과일: 상자 위로 다니므로 아무 차례에나 얹는다 (서로 다른 차례에).
    // 마지막 차례에는 얹지 않는다 — 칸 끝까지 가는 동안 질문이 늦어진다
    const decoyCount = boxCount === 1 ? spec.decoy || 0 : 0;
    const carrierSteps = Util.shuffle(steps.slice(0, -1));
    for (let i = 0; i < decoyCount && i < carrierSteps.length; i++) {
      // eslint-disable-next-line id-length -- 움직임(from·to)은 세션 기록에 그대로 남는다 (api/replay.html 이 읽는다)
      carrierSteps[i].push({ from: Spot.LEFT, to: Spot.RIGHT, fruits: [randomKind(kinds)], decoy: true });
    }
    const end = counts;
    const question = BoxGame.question(spec, kinds, boxes, steps, end, loose);
    if (!question) return null;
    return { width, height, boxes, centerX, left, right, top, kinds, start, steps, end, question };
  }

  // 한 차례의 움직임을 정하고 counts 에 반영한다. 할 수 있는 움직임이 없으면 null.
  // routes = 드나들 수 있는 길 [from, to] 목록
  static makeMove(spec, kinds, routes, counts, firstStep) {
    // 빼기를 먼저 해 볼지 넣기를 먼저 해 볼지 정한다 (뺄 것이 없거나 상자가 차면 다른 쪽)
    const takeOut = Math.random() < (spec.out ?? BoxGame.OUT);
    const tryLater = ([from]) => ((from === Spot.LEFT) === takeOut ? 1 : 0);
    const order = Util.shuffle([...routes]).sort((a, b) => tryLater(a) - tryLater(b));
    for (const [from, target] of order) {
      const room = target === Spot.RIGHT ? Infinity : BoxGame.CAP - BoxGame.sum(counts[target]);
      // 첫 차례에 빼면 적어도 하나는 남긴다
      const available = from === Spot.LEFT ? Infinity : BoxGame.sum(counts[from]) - (firstStep ? 1 : 0);
      const size = Math.min(Util.randomInt(...spec.per), room, available);
      if (size < 1) continue;
      const fruits = lineUpFruits(spec, kinds, from === Spot.LEFT ? null : counts[from], size);
      fruits.forEach((kind) => {
        if (from !== Spot.LEFT) counts[from][kind]--;
        if (target !== Spot.RIGHT) counts[target][kind]++;
      });
      // eslint-disable-next-line id-length -- 움직임(from·to)은 세션 기록에 그대로 남는다 (api/replay.html 이 읽는다)
      return { from, to: target, fruits };
    }
    return null;
  }

  // 질문과 답·보기를 정한다. 못 정하면 null (판을 다시 만든다)
  static question(spec, kinds, boxes, steps, end, loose) {
    const type = spec.questionTypes[Util.randomBelow(spec.questionTypes.length)];
    const moves = steps.flat().filter((move) => !move.decoy);
    // 상자가 둘이면 드나든 일이 있는 상자 가운데 하나를 묻는다
    const box = boxes.length > 1
      ? Util.shuffle([...boxes]).find((candidate) => moves.some((move) => move.to === candidate) && moves.some((move) => move.from === candidate))
      : Spot.TOP;
    if (!box) return null;
    const timesMoved = (kind) => moves.filter((move) => move.fruits.includes(kind) && (move.from === box || move.to === box)).length;
    const takeOuts = moves.filter((move) => move.from === box).length;
    // 빼기가 나올 수 있는 단계라면 묻는 상자에서 적어도 한 번은 빠져나가야 한다 (더하기만 하면 너무 쉽다)
    if (!loose && (spec.out ?? BoxGame.OUT) > 0 && (spec.start || spec.kinds > 1) && !takeOuts) return null;
    const finalCounts = end[box];
    let askedKinds = [];
    if (type === QuestionType.KIND) {
      const kind = Util.shuffle([...kinds]).find((candidate) => timesMoved(candidate) >= 2);
      if (!kind) return null;
      askedKinds = [kind];
    } else if (type === QuestionType.MOST) {
      const top = Math.max(...kinds.map((kind) => finalCounts[kind]));
      const best = kinds.filter((kind) => finalCounts[kind] === top);
      if (top < 1 || best.length !== 1) return null;
      return { type, box, kinds: [], answer: best[0], options: [...kinds] };
    } else if (type === QuestionType.DIFF) {
      const pairs = Util.shuffle(kinds.flatMap((more) => kinds
        .filter((less) => finalCounts[more] > finalCounts[less] && timesMoved(more) && timesMoved(less))
        .map((less) => [more, less])));
      if (!pairs.length) return null;
      askedKinds = pairs[0];
    }
    const answer = countAnswer(type, finalCounts, askedKinds);
    if (answer === 0 && !loose && Math.random() > BoxGame.ZERO) return null;
    // 하기 쉬운 실수: 마지막 차례나 아무 한 차례를 통째로, 또는 줄의 마지막 과일 하나를 빠뜨리고 센 값
    const countSkipping = (skipped) => countAnswer(type, undoMoves(end, skipped)[box], askedKinds);
    const wholeLine = (move) => move.fruits.map((kind) => ({ move, kind }));
    const lastFruit = (move) => [{ move, kind: move.fruits[move.fruits.length - 1] }];
    const mistakes = [
      countSkipping(wholeLine(moves[moves.length - 1])),
      countSkipping(wholeLine(moves[Util.randomBelow(moves.length)])),
      countSkipping(lastFruit(moves[Util.randomBelow(moves.length)])),
    ];
    return { type, box, kinds: askedKinds, answer, options: pickOptions(answer, mistakes, spec.optionCount || 4) };
  }
}

// ---- 문제 만들기 도우미 ----

// boxes 의 상자마다 값을 하나씩: { A: valueOf('A', 0), B: valueOf('B', 1) }
function perBox(boxes, valueOf) {
  return Object.fromEntries(boxes.map((box, i) => [box, valueOf(box, i)]));
}

function zeroCounts(kinds) {
  return Object.fromEntries(kinds.map((kind) => [kind, 0]));
}

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function randomKind(kinds) {
  return kinds[Util.randomBelow(kinds.length)];
}

function addRandomFruits(counts, kinds, fruitCount) {
  for (let i = 0; i < fruitCount; i++) counts[randomKind(kinds)]++;
}

// 과일 종류를 count 가지 고른다 (함께 내지 않는 짝은 피한다)
function pickFruitKinds(count) {
  const kinds = [];
  for (const fruit of Util.shuffle([...FRUITS])) {
    if (kinds.length >= count) break;
    const clashes = kinds.some((kind) => FRUIT_CLASH.some((pair) => pair.includes(kind) && pair.includes(fruit.id)));
    if (!clashes) kinds.push(fruit.id);
  }
  return kinds;
}

// 한 줄 세우기: 첫 과일을 고르고, 다음 과일은 spec.mixed 확률로 다른 종류. 상자에서 뺄 때는 든 것(source) 가운데서만.
// 섞지 않는 단계에서 같은 과일이 떨어지면 줄을 거기서 끊는다 (그래서 size 보다 짧을 수 있다)
function lineUpFruits(spec, kinds, source, size) {
  const remaining = source && { ...source };
  const isAvailable = (kind) => !remaining || remaining[kind] > 0;
  const fruits = [];
  for (let i = 0; i < size; i++) {
    const previous = fruits[i - 1];
    const keep = previous && isAvailable(previous) && Math.random() >= (spec.mixed || 0);
    const others = Util.shuffle(kinds.filter((kind) => isAvailable(kind) && kind !== previous));
    let next = null;
    if (keep) next = previous;
    else if (!previous || spec.mixed) next = others[0] || (isAvailable(previous) ? previous : null);
    if (!next) break;
    fruits.push(next);
    if (remaining) remaining[next]--;
  }
  return fruits;
}

// 질문의 답. counts = 묻는 상자의 { 과일 id: 수 }, askedKinds = 질문에 나오는 과일 (kind 는 하나, diff 는 [많은 쪽, 적은 쪽])
function countAnswer(type, counts, askedKinds) {
  const [first, second] = askedKinds;
  if (type === QuestionType.TOTAL) return BoxGame.sum(counts);
  if (type === QuestionType.KIND) return counts[first];
  return counts[first] - counts[second];
}

// skipped 의 과일({ move, kind })을 옮기지 않았다고 치면 상자마다 몇 개 남았을지 (실수한 답 셈)
function undoMoves(end, skipped) {
  const counts = deepCopy(end);
  skipped.forEach(({ move, kind }) => {
    if (move.from !== Spot.LEFT) counts[move.from][kind]++;
    if (move.to !== Spot.RIGHT) counts[move.to][kind]--;
  });
  return counts;
}

// 숫자 보기 count 개: 답, 하기 쉬운 실수 (하나는 자리를 남겨 둔다), 답 가까운 수, 모자라면 0 부터 채운다
function pickOptions(answer, mistakes, count) {
  const options = new Set([answer]);
  for (const guess of Util.shuffle(mistakes)) {
    if (options.size < count - 1 && guess >= 0 && guess !== answer) options.add(guess);
  }
  for (const offset of Util.shuffle([-2, -1, 1, 2, 3])) {
    if (options.size >= count) break;
    if (answer + offset >= 0) options.add(answer + offset);
  }
  for (let filler = 0; options.size < count; filler++) options.add(filler);
  return [...options].sort((a, b) => a - b);
}

// ---- 그리기 도우미 ----

// 그리는 차례: 칸 바탕 → 움직이는 과일(상자 뒤) → 상자 → 열렸을 때 보이는 속 → 지나가는 과일(상자 앞) → 칸 테두리.
// 테두리를 맨 위에 그려 과일이 테두리 밑으로 밀려 들어오고 나가게 보인다 (칸 밖은 svg 가 잘라 낸다)
function renderArena(puzzle) {
  const { width, height, boxes } = puzzle;
  return `<rect class="bx-field" width="${width}" height="${height}" rx="11"/>` +
    boxes.map((box) => renderGround(puzzle, box)).join('') +
    '<g class="bx-back"></g>' +
    boxes.map((box) => renderBox(puzzle, box)).join('') +
    '<g class="bx-front"></g>' +
    `<rect class="bx-frame" x="1" y="1" width="${width - 2}" height="${height - 2}" rx="10"/>`;
}

// 상자가 놓인 바닥 줄
function renderGround(puzzle, box) {
  const groundY = puzzle.top[box] + BoxGame.BOX.height + 0.5;
  return `<line class="bx-ground" x1="0" x2="${puzzle.width}" y1="${groundY}" y2="${groundY}"/>`;
}

// 상자 껍데기, 닫혔을 때의 '?', 열렸을 때 속을 그릴 자리(.bx-in)
function renderBox(puzzle, box) {
  const { width, height } = BoxGame.BOX;
  const top = puzzle.top[box];
  return `<g class="bx-box" data-box="${box}">` +
    `<rect class="bx-shell" x="${puzzle.left[box]}" y="${top}" width="${width}" height="${height}" rx="8"/>` +
    `<text class="bx-q" x="${puzzle.centerX[box]}" y="${top + height / 2 + 2}" text-anchor="middle" dominant-baseline="central">?</text>` +
    '<g class="bx-in"></g></g>';
}

// 상자 줄의 가운데 높이
function rowMidY(puzzle, box) {
  return puzzle.top[box] + BoxGame.BOX.height / 2;
}

// 출발 자리: 칸 왼쪽 밖, 또는 상자 뒤 (오른쪽 끝에 과일이 통째로 숨는 자리)
function departX(puzzle, spot) {
  return spot === Spot.LEFT ? -BoxGame.FRUIT_SIZE / 2 : puzzle.right[spot] - BoxGame.FRUIT_SIZE / 2;
}

// 도착 자리: 칸 오른쪽 밖, 또는 상자 뒤 (왼쪽 끝에 과일이 통째로 숨는 자리)
function arriveX(puzzle, spot) {
  return spot === Spot.RIGHT ? puzzle.width + BoxGame.FRUIT_SIZE / 2 : puzzle.left[spot] + BoxGame.FRUIT_SIZE / 2;
}

function fruitIcon(id) {
  return `<svg class="bx-ico" viewBox="0 0 100 100">${BoxGame.fruit(id).svg}</svg>`;
}

function questionText({ type, box, kinds }, twoBoxes) {
  const where = twoBoxes ? `${box === Spot.TOP ? '위' : '아래'} 상자` : '상자';
  switch (type) {
    case QuestionType.TOTAL: return `${where} 안에 과일이 모두 몇 개 있을까요?`;
    case QuestionType.KIND: return `${where} 안에 ${fruitIcon(kinds[0])} 몇 개 있을까요?`;
    case QuestionType.MOST: return `${where} 안에 가장 많은 과일은?`;
    default: return `${fruitIcon(kinds[0])} 가 ${fruitIcon(kinds[1])} 보다 몇 개 더 많을까요?`;
  }
}

// 문제의 일의 양 = 머릿속에서 세어 둬야 하는 과일 종류 수 (상자가 둘이면 하나 더)
function questionLoad({ question, kinds, boxes }) {
  const kindsToTrack = {
    [QuestionType.TOTAL]: kinds.length,
    [QuestionType.KIND]: 1,
    [QuestionType.MOST]: kinds.length,
    [QuestionType.DIFF]: 2,
  }[question.type];
  return kindsToTrack + (boxes.length > 1 ? 1 : 0);
}

// 소개 그림의 오른쪽 화살표
function diagramArrow(fromX, toX, y) {
  return `<path class="dg-bx-arrow" d="M${fromX} ${y}H${toX}m-6 -5l6 5-6 5"/>`;
}
