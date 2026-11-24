// 배관 타기
// 위의 출발점마다 모양 조각(peg)이 하나씩 있고, 아래 끝 몇 곳에는 모양 구멍이 있다. 출발점마다 관 하나가
// 아래 끝 하나로 이어진다. 관을 따라가 같은 모양의 구멍에 쏙 들어가는 조각을 고른다. 그런 조각은 하나뿐이다. 판 하나에 문제 3개.
//
// 2026-11-20: '사다리 타기'(id ladder)를 이 게임으로 바꿨다. '가로줄을 만나면 건너간다'는 규칙이 생각만큼 바로 통하지 않아
// Lv1 도 어렵다는 말을 들었다. 관 하나를 끝까지 눈으로 따라가는 것은 규칙을 몰라도 된다. 다른 게임이므로 id 도 pipe 로 새로 둔다
// (예전 세션 로그는 ladder 로 남고 api/replay.html 이 그대로 그린다. 저장된 '켜 둔 게임' 목록의 ladder 는 Config.load 가 pipe 로 바꾼다).
// 처음에는 선마다 제 세로 자리(레인)를 지키며 이웃과만 엇갈리게 했더니 너무 쉬웠다. 지킬 규칙이 '선은 이어진다' 하나뿐이니
// 선은 판 어디로든 간다: 거슬러 올라가기도 하고, 제 몸을 감아 도는 고리를 만들고, 같은 선과 여러 번 엇갈린다.
// 생김새는 '배관 미로' 그림처럼 굵은 관이 가로세로로 곧게 길게 뻗고 모퉁이만 둥글다 (2026-11-20). 판 아무 곳으로나 휘는 곡선도 해 봤는데
// 꼬불꼬불하거나 엇갈림이 뭉개져 보였다.
//
// 설명 없이도 통하도록:
//   - 선은 끊기지 않고 한 줄로 이어진다. 관마다 어두운 테두리가 있어 엇갈리는 곳에서 어느 관이 위로 지나가는지 보인다 (나중 관이 위).
//   - '네모 조각은 동그라미 구멍에 안 들어간다'는 누구나 안다.
//   - 고른 조각이 선을 따라 미끄러져 가고(뒤로 길이 그려진다), 맞으면 구멍에 쏙 들어가고 길이 초록이 된다.
//     틀리면 바닥이나 다른 구멍에 걸려 튕기고 길이 빨강이 된다. 고른 길만 그린다.
// 외울 것이 없다. 속도 띠를 보고 와도 엇갈림 하나 단위로 다시 찾아 이어 갈 수 있다.
//
// 선 만들기 (PipeGame.route): 판 안의 보이지 않는 칸에서 칸으로 걷는 길을 낸다. 칸마다 곧은 토막이거나 사분원 모퉁이다 (pathOf).
// 아무렇게나 그은 선은 '눈이 헷갈려서' 따라가기 어려울 수 있는데, 그건 이 게임의 어려움이 아니다. 칸 규칙 덕에 그런 일이 없다:
//   - 두 길이 한 칸을 함께 쓰는 것은 하나는 가로로, 하나는 세로로 곧게 지날 때뿐이다 → 엇갈림은 늘 직각이고 칸마다 하나라 뭉치지 않는다
//   - 엇갈리지 않는 길끼리는 서로 다른 칸을 지난다 → 나란히 붙어 가도 관 사이가 떨어져 있다
//
// 구멍마다 거꾸로 선을 따라 올라가 그 위의 조각 모양을 보면 답이 나온다. 그래서 어려움은 구멍 수로도 올린다.
// 눈으로만 걸러 낼 수 없도록, 구멍 모양마다 그 구멍에 닿지 않는 같은 모양 조각이 적어도 하나 있다.
// Lv1~3 은 조각이 모두 같고 구멍이 하나뿐이라 '구멍에 닿는 선 찾기'와 같다. Lv4 에서 다른 모양 조각이 섞이고, Lv5 부터 구멍이 늘어난다.
// 난이도:
//   lanes    — 선 수 = 보기 수
//   grid     — 칸 크기 (없으면 GRID 40). 작을수록 관이 가늘고 촘촘하다
//   length   — 선마다 지나는 칸 수 [최소, 최대] (칸 40 이면 선 넷까지의 판이 9 × 10 칸, 칸 32 면 12 × 12 칸)
//   turn     — 한 칸 갈 때마다 꺾을 확률 (낮을수록 길게 곧다)
//   loops    — 선마다 제 몸을 감아 도는 고리 수 (정수 부분은 늘, 소수 부분은 그 확률로 하나 더)
//   minCross — 정답 선이 지나는 엇갈림의 최소 수 (제 몸과 엇갈리는 고리도 센다)
//   holes    — 구멍 수 (따라 올라가 봐야 하는 선 수)
//   kinds    — 조각 모양 수
import { Util } from '../config.js';
import { Diagram } from '../diagram.js';
import { Sfx } from '../sfx.js';
import { Tag } from './tags.js';
import { Phase, Progress, pointsPer, resultOf, abortedResult } from './kit.js';

const PIPE_PEGS = [
  // 색만으로 구분하지 않도록 색마다 모양이 다르다 (색약 대응). 모두 (0, 0) 을 가운데로 그린다
  { id: 'circle', fill: '#e5484d', svg: '<circle r="21"/>' },
  { id: 'square', fill: '#2f6fed', svg: '<rect x="-19" y="-19" width="38" height="38" rx="4"/>' },
  { id: 'triangle', fill: '#1f9d55', svg: '<polygon points="0,-23 23,17 -23,17"/>' },
  { id: 'diamond', fill: '#e09b00', svg: '<polygon points="0,-24 24,0 0,24 -24,0"/>' },
  { id: 'plus', fill: '#8e4ec6', svg: '<path d="M-8 -22h16v14h14v16h-14v14h-16v-14h-14v-16h14z"/>' },
];

export class PipeGame {
  static id = 'pipe';
  static tags = [Tag.TRACE];
  static title = '배관 타기';
  static hint = '관을 따라가 같은 모양 구멍에<br>쏙 들어가는 조각을 위에서 고르세요';
  static levels = [
    // 쉬운 단계: 관 셋, 판을 몇 번 가로지른다
    { lanes: 3, length: [14, 19], turn: 0.14, loops: 0, minCross: 2, holes: 1, kinds: 1 },
    { lanes: 3, length: [18, 24], turn: 0.14, loops: 0.5, minCross: 4, holes: 1, kinds: 1 },
    { lanes: 3, length: [22, 28], turn: 0.14, loops: 0.8, minCross: 6, holes: 1, kinds: 1 },
    // 다른 모양 조각이 섞인다
    { lanes: 4, length: [20, 26], turn: 0.14, loops: 0.8, minCross: 6, holes: 1, kinds: 2 },
    // 구멍이 늘어난다. 높은 단계는 칸을 촘촘히(grid 32) 해 가는 관이 배관 미로처럼 빽빽하다
    { lanes: 4, grid: 32, length: [30, 38], turn: 0.14, loops: 1, minCross: 8, holes: 2, kinds: 2 },
    { lanes: 5, grid: 32, length: [34, 40], turn: 0.14, loops: 1, minCross: 10, holes: 2, kinds: 3 },
    { lanes: 5, grid: 32, length: [36, 46], turn: 0.14, loops: 1.3, minCross: 13, holes: 3, kinds: 3 },
    // Lv8 은 관이 판을 거의 채워 칸 32 로는 판 하나 만드는 데 0.7초(길면 2초)가 걸렸다. 칸 30 이면 같은 어려움으로 몇십 ms
    { lanes: 6, grid: 30, length: [42, 52], turn: 0.14, loops: 2.1, minCross: 16, holes: 4, kinds: 4 },
  ];
  static maxLevel = PipeGame.levels.length;
  static ROUNDS = 3;
  static TRIES = 200;
  // SVG 단위. 출발점 사이 간격 LANE_SPACING (선이 넷보다 적어도 판은 넷 만큼 넓게), 선이 돌아다니는 높이 MAZE_HEIGHT, 위(조각)·아래(구멍) 여백
  static LANE_SPACING = 110;
  static PADDING = 55;
  static MAZE_HEIGHT = 470;
  static TOP = 80;
  static BOTTOM = 70;

  static SPEED = 0.8;       // 고른 조각이 선을 따라 가는 빠르기 (SVG 단위/ms). 길이에 따라 0.8 ~ 2.2 초

  // 소개 그림: ① 선을 따라가 ② 같은 모양 구멍에 들어가는 조각을 고른다 (바로 위 조각이 답이 아니다)
  static diagram() {
    const peg = (kind, x, y, scale = 0.5) => `<g transform="translate(${x} ${y}) scale(${scale})" fill="${PIPE_PEGS[kind].fill}">${PIPE_PEGS[kind].svg}</g>`;
    // 관 셋: 출발점 x 50 · 100 · 150 → 끝 150 · 50(구멍) · 100. 가로세로로 곧게 가다 꺾이고, 엇갈리는 곳은 나중 관이 위로 지난다.
    // 모퉁이는 굵은 선의 둥근 이음으로 둥글게 보인다
    const pipes = [
      [50, 24, 50, 88, 150, 88, 150, 118],
      [100, 24, 100, 40, 132, 40, 132, 72, 30, 72, 30, 108, 50, 108, 50, 118],
      [150, 24, 150, 56, 100, 56, 100, 118],
    ];
    const pointsOf = (flat) => flat.map((value, i) => (i % 2 ? `${value} ` : `${value},`)).join('').trim();
    const frame = pipes.map((pipe) => `<polyline class="dg-pipe-edge" points="${pointsOf(pipe)}"/><polyline class="dg-pipe" points="${pointsOf(pipe)}"/>`).join('') +
      `<g transform="translate(50 128) scale(0.6)" class="dg-hole" stroke="${PIPE_PEGS[2].fill}">${PIPE_PEGS[2].svg}</g>` +
      [100, 150].map((x) => `<circle class="dg-end" cx="${x}" cy="128" r="4"/>`).join('');
    const trace = `<polyline class="dg-trace" points="100,14 ${pointsOf(pipes[1])} 50,126"/>`;
    return [
      { svg: Diagram.svg('0 0 200 140', frame + peg(1, 50, 14) + peg(2, 100, 14) + peg(0, 150, 14)), caption: '관을 따라' },
      { svg: Diagram.svg('0 0 200 140', frame + trace + peg(1, 50, 14) + peg(0, 150, 14) + peg(2, 50, 128, 0.5) + Diagram.tap(100, 14, 15)), caption: '같은 모양 구멍에 들어가는 조각' },
    ];
  }

  /** @param {import('./host.js').GameHost} host */
  constructor(host) {
    this.host = host;
    this.spec = PipeGame.levels[host.level - 1];
    this.round = 0;
    this.correct = 0;
    this.answered = 0; // 채점한 문제 수. round 는 피드백이 끝나야 넘어가므로, 피드백 중에 판이 끝나면(abort) 이것으로 센다
    this.phase = Phase.WAIT;
  }

  start() {
    const { stage, level } = this.host;
    this.message = Util.element('div', 'stage-msg', '');
    const { body, dots } = Util.frame(stage, `${PipeGame.title} · Lv.${level}`, this.message, PipeGame.ROUNDS);
    this.progress = dots;
    this.wrap = Util.element('div', 'pipe-wrap');
    this.board = Util.element('div', 'pipe-board');
    this.wrap.append(this.board);
    body.append(this.wrap);
    this.next();
  }

  next() {
    const puzzle = PipeGame.generate(this.spec);
    this.puzzle = puzzle;
    Util.say(this.message, '같은 모양 구멍에 들어갈 조각을 고르세요', 'act');
    Progress.current(this.progress, this.round);
    this.render();
    this.phase = Phase.INPUT;
    this.host.question({

      lanes: puzzle.lanes,
      size: [puzzle.width, PipeGame.height],
      // 선마다 그린 점 [x, y, x, y, ...] (SVG 단위, 정수). 둘에 하나씩만 적어도 화면과 같은 모양이다
      lines: puzzle.paths.map((path) => path.filter((_, i) => i % 2 === 0 || i === path.length - 1).flatMap(([x, y]) => [Math.round(x), Math.round(y)])),
      pegs: puzzle.pegs.map((kind) => PIPE_PEGS[kind].id),
      holes: puzzle.holes.map((kind) => (kind == null ? null : PIPE_PEGS[kind].id)),
      answer: puzzle.answer,
      cross: puzzle.cross[puzzle.answer],
      load: puzzle.load,
    });
    this.host.timer(puzzle.load, () => this.pick(-1));
  }

  // ---- 판 ----
  static get height() { return PipeGame.TOP + PipeGame.MAZE_HEIGHT + PipeGame.BOTTOM; }
  static widthOf(lanes) { return PipeGame.PADDING * 2 + Math.max(3, lanes - 1) * PipeGame.LANE_SPACING; }
  // 출발점·끝 i 의 x (판 너비에 고르게)
  static laneX(i, lanes) {
    const width = PipeGame.widthOf(lanes);
    return PipeGame.PADDING + (i * (width - 2 * PipeGame.PADDING)) / (lanes - 1);
  }
  static get topY() { return PipeGame.TOP - 40; }
  static get bottomY() { return PipeGame.TOP + PipeGame.MAZE_HEIGHT + 42; }

  render() {
    const { lanes, width, paths, pegs, holes } = this.puzzle;
    const { LANE_SPACING, TOP } = PipeGame;
    const boardHeight = PipeGame.height;
    const laneX = (i) => PipeGame.laneX(i, lanes);
    const toPointsAttribute = (points) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    let svg = `<svg class="pipe-svg" viewBox="0 0 ${width} ${boardHeight}" preserveAspectRatio="xMidYMid meet">`;
    // 관마다 어두운 테두리를 먼저 깔고 그 위에 몸통을 그린다. 나중 관이 앞 관의 테두리를 덮어 어느 관이 위로 지나가는지 보인다.
    // 굵기는 칸 크기를 따른다 (칸이 촘촘한 높은 단계는 관도 가늘다): 몸통은 칸의 PIPE 배, 테두리는 양쪽으로 EDGE 씩
    const pipe = (this.puzzle.cell * PipeGame.PIPE).toFixed(1);
    const edge = (this.puzzle.cell * PipeGame.PIPE + PipeGame.EDGE * 2).toFixed(1);
    for (const path of paths) {
      const points = toPointsAttribute(path);
      svg += `<polyline class="pipe-gap" points="${points}" stroke-width="${edge}"/><polyline class="pipe-line" points="${points}" stroke-width="${pipe}"/>`;
    }
    // 구멍: 조각과 같은 모양을 조금 크게, 어두운 속과 그 모양의 색 테두리로 그린다.
    // 자리는 감싼 g 로 옮긴다 (css 애니메이션을 받는 안쪽 요소에 transform 속성이 있으면 서로 부딪친다)
    for (let i = 0; i < lanes; i++) {
      const kind = holes[i];
      svg += kind == null
        ? `<g transform="translate(${laneX(i)} ${PipeGame.bottomY})"><circle class="pipe-floor pipe-end" r="8"/></g>`
        : `<g transform="translate(${laneX(i)} ${PipeGame.bottomY}) scale(1.18)">`
        + `<g class="pipe-floor pipe-hole" stroke="${PIPE_PEGS[kind].fill}">${PIPE_PEGS[kind].svg}</g></g>`;
    }
    svg += '<g class="pipe-traces"></g>';
    // 출발점: 조각보다 넓게 눌러도 되게 한다. 조각은 고르면 선을 따라 가므로 따로 둔다
    for (let i = 0; i < lanes; i++) {
      svg += `<g class="pipe-start"><rect x="${laneX(i) - LANE_SPACING / 2}" y="0" width="${LANE_SPACING}" height="${TOP}"/>`
        + `<circle class="pipe-halo" cx="${laneX(i)}" cy="${PipeGame.topY}" r="31"/></g>`;
    }
    for (let i = 0; i < lanes; i++) {
      const kind = pegs[i];
      svg += `<g class="pipe-peg-pos" transform="translate(${laneX(i)} ${PipeGame.topY})">`
        + `<g class="pipe-peg" fill="${PIPE_PEGS[kind].fill}">${PIPE_PEGS[kind].svg}</g></g>`;
    }
    svg += '</svg>';
    this.board.innerHTML = svg;
    this.traces = this.board.querySelector('.pipe-traces');
    this.startElements = [...this.board.querySelectorAll('.pipe-start')];
    this.pegElements = [...this.board.querySelectorAll('.pipe-peg-pos')];
    this.floorElements = [...this.board.querySelectorAll('.pipe-floor')];
    this.startElements.forEach((startElement, i) => startElement.addEventListener('pointerdown', () => this.pick(i)));
  }

  // 출발점 start 에서 끝까지의 길 (조각 자리 → 선 → 구멍 자리)
  points(start) {
    const { lanes, paths, ends } = this.puzzle;
    return [[PipeGame.laneX(start, lanes), PipeGame.topY], ...paths[start], [PipeGame.laneX(ends[start], lanes), PipeGame.bottomY]];
  }

  // 길을 위에서부터 그려 간다 (pathLength 1 기준의 dashoffset 을 1 → 0). duration = 다 그리는 시간
  draw(points, duration) {
    const trace = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    trace.setAttribute('points', points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '));
    trace.setAttribute('pathLength', '1');
    trace.setAttribute('class', 'pipe-trace');
    trace.setAttribute('stroke-width', (this.puzzle.cell * 0.32).toFixed(1));
    trace.style.transitionDuration = `${duration}ms, 0.15s`; // css .pipe-trace: stroke-dashoffset, stroke
    this.traces.append(trace);
    trace.getBoundingClientRect();
    trace.classList.add('go');
    return trace;
  }

  // 조각을 길을 따라 같은 빠르기로 옮긴다. 길이 그려지는 속도(선형)와 같아서 조각이 선을 끌고 가는 것처럼 보인다
  slide(peg, points, duration) {
    const segments = points.slice(1).map((point, i) => Math.hypot(point[0] - points[i][0], point[1] - points[i][1]));
    const total = segments.reduce((a, b) => a + b, 0);
    const startedAt = performance.now();
    const step = (now) => {
      let distance = Util.clamp((now - startedAt) / duration, 0, 1) * total;
      let i = 0;
      while (i < segments.length - 1 && distance > segments[i]) distance -= segments[i++];
      const fraction = segments[i] ? Math.min(1, distance / segments[i]) : 1;
      const x = Util.lerp(points[i][0], points[i + 1][0], fraction);
      const y = Util.lerp(points[i][1], points[i + 1][1], fraction);
      peg.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      if (now - startedAt < duration && peg.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // lane = 고른 출발점. -1 이면 시간이 다 된 것 (아무것도 보내지 않는다)
  pick(lane) {
    if (this.phase !== Phase.INPUT) return;
    this.phase = Phase.WAIT;
    this.host.stopTimer();
    const { answer, ends } = this.puzzle;
    const ok = lane === answer;
    this.host.answer({ picked: lane >= 0 ? lane : null, end: lane >= 0 ? ends[lane] : null, correct: ok, timedOut: lane < 0 });
    this.answered++;
    if (ok) this.correct++; // 맞고 틀림은 지금 정해진다 (알림 · 점수는 조각이 다 간 뒤). 그 사이에 판이 끝나도(abort) 맞힌 것으로 센다

    this.startElements.forEach((element) => element.classList.add('done'));
    const startElement = this.startElements[lane];
    let trace = null;
    let duration = 0;
    if (startElement) {
      const points = this.points(lane);
      const length = points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - points[index][0], point[1] - points[index][1]), 0);
      duration = Math.round(Util.clamp(length / PipeGame.SPEED, 800, 2200));
      trace = this.draw(points, duration);
      this.slide(this.pegElements[lane], points, duration);
      this.host.sfx(Sfx.TAP);
    }

    // 조각이 다 간 뒤에 맞고 틀림을 알린다
    this.host.after(duration, () => {
      if (startElement) {
        trace.classList.add(ok ? 'right' : 'wrong');
        this.pegElements[lane].firstChild.classList.add(ok ? 'seated' : 'bump');
        this.floorElements[ends[lane]].classList.add(ok ? 'fit' : 'miss');
      }
      Progress.mark(this.progress, this.round, ok);
      if (ok) {
        Util.say(this.message, '정답!', 'good');
        this.host.award(pointsPer(this.host, PipeGame.ROUNDS), this.floorElements[ends[lane]]);
        this.host.sfx(Sfx.GOOD);
      } else {
        Util.say(this.message, startElement ? '맞는 구멍이 아니에요' : '시간 초과', 'bad');
        this.host.sfx(Sfx.BAD);
      }
      this.host.after(ok ? 600 : 1000, () => this.advance());
    });
  }

  advance() {
    this.round++;
    if (this.round < PipeGame.ROUNDS) this.next();
    else this.host.done(this.result());
  }

  result() {
    return resultOf(this.correct, PipeGame.ROUNDS);
  }

  // 점수는 맞힐 때마다 바로 지급하므로 중단될 때 따로 줄 것이 없다
  abort() {
    return abortedResult(this.correct, this.answered);
  }

  // ---- 문제 만들기 ----
  // 판을 보이지 않는 정사각형 칸(GRID)으로 나누고 선마다 칸에서 칸으로 걷는 길을 낸다 (위로도 옆으로도 간다).
  // 한 칸은 길 하나가 지나거나, 두 길이 '하나는 가로로 곧게 · 하나는 세로로 곧게' 지날 때만 함께 쓴다 = 엇갈림.
  // 그러면 엇갈림은 늘 직각에 가깝고 칸 가운데에 하나씩이라 뭉치지 않으며, 엇갈리지 않는 길끼리는 서로 다른 칸을 지나 나란히 붙지 않는다.
  // 같은 선이 제 길을 가로질러도 된다 (고리).
  // 그리기 (pathOf): 길은 칸마다 곧은 토막이거나 칸 모서리를 가운데로 한 사분원이다 (배관 이음새처럼). 그래서 어느 모퉁이도
  // 반지름이 칸의 절반(GRID / 2)이다. 칸 가운데를 흔들어 곡선으로 이었을 때는 너무 꼬불꼬불했다 (2026-11-20).
  static GRID = 40;         // 관 사이 간격 (칸 크기). 단계마다 spec.grid 로 바꿀 수 있다
  static PIPE = 0.475;      // 관 몸통 굵기 (칸 크기 비율). 나란한 관 사이가 관 굵기쯤 빈다
  static EDGE = 1.8;        // 관 테두리 두께 (SVG 단위)
  static LENGTH_SLACK = 0.1; // 관 길이가 범위를 벗어나도 되는 정도 (최대 길이 비율)
  static RIP_UPS = 12;      // 막힌 관 때문에 앞 관을 거두고 다시 내는 횟수 (넘으면 판을 새로)
  static WALK_TRIES = 40;   // 선 하나의 길을 찾아보는 횟수 (못 찾으면 앞 관을 거두고 다시)

  // 판의 칸: cols × rows 개의 GRID 크기 칸을 판 가운데에. 물결의 위상은 판마다 새로
  // cell = 칸 크기 (단계마다 spec.grid, 없으면 GRID)
  static grid(lanes, cell = PipeGame.GRID) {
    const { PADDING, TOP, MAZE_HEIGHT } = PipeGame;
    const GRID = cell;
    const width = PipeGame.widthOf(lanes);
    const cols = Math.floor((width - 2 * (PADDING - 30)) / GRID);
    // 위아래로 출발점·끝점에서 칸까지 이어 줄 자리를 남긴다
    const rows = Math.floor((MAZE_HEIGHT - 70) / GRID);
    const offsetX = (width - cols * GRID) / 2;
    const offsetY = TOP + (MAZE_HEIGHT - rows * GRID) / 2;
    // 출발점·끝점 i 에 가장 가까운 칸 열
    const colOf = (i) => Util.clamp(Math.floor((PipeGame.laneX(i, lanes) - offsetX) / GRID), 0, cols - 1);
    return { width, cols, rows, cell: GRID, offsetX, offsetY, colOf };
  }

  // 반환: lanes, width, paths (선마다 그린 점들), ends (출발점마다 닿는 끝),
  //       cross (출발점마다 지나는 엇갈림 수), pegs (출발점마다 조각 모양), holes (끝마다 구멍 모양 또는 null), answer (정답 출발점),
  //       load = 구멍에 닿는 선들이 지나는 엇갈림 수의 합 (따라 올라가 볼 일의 양)
  static generate(spec) {
    const { lanes, minCross, holes: holeCount, kinds } = spec;
    let best = null;
    for (let tries = 0; tries < PipeGame.TRIES && !(best && best.miss === 0); tries++) {
      const grid = PipeGame.grid(lanes, spec.grid);
      const ends = Util.shuffle([...Array(lanes).keys()]);
      const routes = PipeGame.route(grid, ends, spec);
      if (!routes) continue;
      const { walks, cross } = routes;
      const paths = walks.map((walk, start) => PipeGame.pathOf(grid, walk, start, ends[start], lanes));
      const startOf = [];
      ends.forEach((end, start) => (startOf[end] = start));

      // 정답 구멍은 엇갈림을 minCross 이상 지나는 선의 끝에 둔다 (그런 선이 없으면 가장 많이 지나는 선)
      const enough = [...Array(lanes).keys()].filter((start) => cross[start] >= minCross && ends[start] !== start);
      const answer = enough.length ? enough[Util.randomBelow(enough.length)] : cross.indexOf(Math.max(...cross));
      const goal = ends[answer];
      const kindIds = Util.shuffle([...PIPE_PEGS.keys()]).slice(0, kinds);
      const holeLanes = [goal, ...Util.shuffle([...Array(lanes).keys()].filter((lane) => lane !== goal)).slice(0, holeCount - 1)];
      const holes = new Array(lanes).fill(null);
      Util.shuffle([...kindIds]).slice(0, holeCount).forEach((kind, j) => (holes[holeLanes[j]] = kind));
      const pegs = PipeGame.assignPegs(ends, answer, holes, holeLanes, kindIds);

      const count = (kind) => pegs.filter((peg) => peg === kind).length;
      const miss = (count(holes[goal]) >= 2 ? 0 : 1)
        + holeLanes.slice(1).filter((holeLane) => count(holes[holeLane]) < 1).length
        + kindIds.filter((kind) => count(kind) < 1).length
        + (answer === goal ? 2 : 0)
        + Math.max(0, minCross - cross[answer]);
      if (best && miss >= best.miss) continue;
      // 일의 양 = 구멍에 닿는 선들의 길이 (100 단위). 엇갈림이 아주 많은 판에서는 엇갈림 수보다 따라갈 길이가 시간을 잘 맞춘다
      const lengthOf = (path) => path.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - path[i][0], point[1] - path[i][1]), 0);
      const load = Math.round(holeLanes.reduce((sum, holeLane) => sum + lengthOf(paths[startOf[holeLane]]), 0) / 10) / 10;
      best = { lanes, width: grid.width, cell: grid.cell, paths, ends, cross, pegs, holes, answer, load, miss };
    }
    // 길을 하나도 못 내면 선을 조금 짧게 해서 다시 (드물다)
    if (!best) return PipeGame.generate({ ...spec, length: spec.length.map((value) => Math.max(6, value - 2)), loops: spec.loops / 2 });
    return best;
  }

  // 출발점마다 조각 모양. 정답 출발점은 정답 구멍 모양이고, 나머지는 닿는 구멍과 다른 모양이다. 눈으로만 걸러 낼 수 없도록
  // 먼저 꼭 있어야 할 모양을 놓는다: 정답 구멍 모양 하나 더 (미끼) · 다른 구멍마다 그 모양 · 쓰는 모양마다 하나. 남은 자리는 아무 모양
  static assignPegs(ends, answer, holes, holeLanes, kindIds) {
    const lanes = ends.length;
    const allowed = (start, kind) => kind !== holes[ends[start]];
    let pegs = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      pegs = new Array(lanes).fill(null);
      pegs[answer] = holes[holeLanes[0]];
      const need = [holes[holeLanes[0]], ...holeLanes.slice(1).map((lane) => holes[lane]), ...Util.shuffle([...kindIds])];
      const free = Util.shuffle([...Array(lanes).keys()].filter((start) => start !== answer));
      const has = (kind) => pegs.filter((peg) => peg === kind).length;
      need.forEach((kind, i) => {
        // 미끼는 정답 말고 하나 더 (그래서 둘), 나머지는 하나면 된다
        if (has(kind) >= (i === 0 ? 2 : 1)) return;
        const slot = free.findIndex((start) => pegs[start] == null && allowed(start, kind));
        if (slot >= 0) pegs[free[slot]] = kind;
      });
      for (const start of free) {
        if (pegs[start] != null) continue;
        const others = kindIds.filter((kind) => allowed(start, kind));
        pegs[start] = others[Util.randomBelow(others.length)];
      }
      if (need.every((kind, i) => has(kind) >= (i === 0 ? 2 : 1))) break;
    }
    return pegs;
  }

  // 선마다 칸 길을 낸다. 반환: { walks (선마다 [[열, 줄], ...]), cross (선마다 엇갈림 수) } 또는 못 내면 null
  static route(grid, ends, spec) {
    const { rows, colOf } = grid;
    const lanes = ends.length;
    // 칸마다 지나간 길: [{ line, axis: 'h' | 'v' | 'turn' }]
    const used = new Map();
    const key = (col, row) => col * 100 + row;
    const passesAt = (col, row) => used.get(key(col, row)) || [];
    // 출발점·끝점 바로 아래·위 칸은 그 선만 쓴다
    const reserved = new Map();
    for (let i = 0; i < lanes; i++) {
      reserved.set(key(colOf(i), 0), i);
      reserved.set(key(colOf(ends[i]), rows - 1), i);
    }
    const walks = [];
    // 칸마다 지나간 모양을 적거나 (놓기) 지운다 (거두기)
    const place = (line, walk) => walk.forEach(([col, row], i) => {
      const previous = i === 0 ? [col, row - 1] : walk[i - 1];
      const next = i === walk.length - 1 ? [col, row + 1] : walk[i + 1];
      const axis = previous[1] === next[1] ? 'h' : previous[0] === next[0] ? 'v' : 'turn';
      if (!used.has(key(col, row))) used.set(key(col, row), []);
      used.get(key(col, row)).push({ line, axis });
    });
    const unplace = (line) => used.forEach((passes, cellKey) => used.set(cellKey, passes.filter((pass) => pass.line !== line)));
    // 관을 차례로 놓는다. 어느 관이 자리를 못 찾으면 바로 앞 관을 거두고 둘 다 다시 낸다 (RIP_UPS 번까지).
    // 판을 통째로 버리고 처음부터 다시 하는 것보다 훨씬 빠르다 — 관이 많은 단계에서는 뒤쪽 관이 자주 막힌다
    let ripUps = 0;
    for (let line = 0; line < lanes;) {
      const walk = PipeGame.walk(grid, line, colOf(line), colOf(ends[line]), spec, passesAt, reserved, key);
      if (walk) {
        place(line, walk);
        walks[line] = walk;
        line++;
        continue;
      }
      if (line === 0 || ++ripUps > PipeGame.RIP_UPS) return null;
      line--;
      unplace(line);
    }
    // 엇갈림 = 두 길이 함께 쓰는 칸 (같은 선끼리면 그 선에 하나)
    const cross = new Array(lanes).fill(0);
    for (const passes of used.values()) {
      if (passes.length < 2) continue;
      for (const line of new Set(passes.map((pass) => pass.line))) cross[line]++;
    }
    return { walks, cross };
  }

  // 선 하나의 칸 길: 출발 칸(맨 위 줄)에서 위로부터 들어와 끝 칸(맨 아래 줄)에서 아래로 나간다. 길이는 spec.length [최소, 최대] 칸.
  // 처음에는 돌아다니고(꺾을 확률 spec.turn, 남의 길을 가로지르는 칸을 조금 반긴다), 최소 길이에 가까워지면
  // 끝 칸까지 갈 수 있는 가장 짧은 길을 찾아 마저 간다 (finish). spec.loops 확률로 한 번, 옆으로 가던 중에
  // '위 → 뒤 → 아래' 로 감아 방금 지난 칸을 세로로 가로지르는 고리를 만든다 (롤러코스터처럼)
  static DIRECTIONS = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // 아래 · 오른쪽 · 위 · 왼쪽
  static walk(grid, line, startCol, endCol, spec, passesAt, reserved, key) {
    const { cols, rows } = grid;
    const { DIRECTIONS } = PipeGame;
    const [minLength, maxLength] = spec.length;
    for (let attempt = 0; attempt < PipeGame.WALK_TRIES; attempt++) {
      const walk = [[startCol, 0]];
      const mine = new Map([[key(startCol, 0), 1]]); // 이 길이 칸마다 지나간 횟수 (제 몸을 가로지르는지 보려고)
      const advance = (way) => {
        const [col, row] = walk[walk.length - 1];
        const cell = [col + DIRECTIONS[way][0], row + DIRECTIONS[way][1]];
        walk.push(cell);
        mine.set(key(...cell), (mine.get(key(...cell)) || 0) + 1);
      };
      let direction = 0;            // 위에서 들어왔으니 아래로 가는 중
      // 고리 수: 정수 부분은 늘, 소수 부분은 그 확률로 하나 더
      let loopsLeft = Math.floor(spec.loops) + (Math.random() < spec.loops % 1 ? 1 : 0);
      let plan = [];          // 고리를 그리는 동안 따라갈 방향들
      // 돌아다니는 것은 '지금까지 길이 + 끝 칸까지의 거리' 가 최소 길이에 닿을 때까지 (끝 칸에서 멀리 돌아다녔으면 일찍 멈춘다).
      // 고정된 칸 수만큼 돌아다니게 했더니 끝 칸에서 먼 곳에 멈춰 최대 길이 안에 못 닿는 일이 잦았다
      const toEnd = () => {
        const [col, row] = walk[walk.length - 1];
        return Math.abs(col - endCol) + Math.abs(rows - 1 - row);
      };
      const slack = Util.randomBelow(3);
      let stuck = false;
      while (walk.length + toEnd() + slack < minLength || plan.length) {
        const [col, row] = walk[walk.length - 1];
        const options = [];
        for (let way = 0; way < 4; way++) {
          if (way === (direction + 2) % 4) continue;
          const [nextCol, nextRow] = [col + DIRECTIONS[way][0], row + DIRECTIONS[way][1]];
          if (nextCol < 0 || nextCol >= cols || nextRow < 0 || nextRow >= rows) continue;
          if (nextCol === endCol && nextRow === rows - 1) continue; // 끝 칸은 마지막에만
          if (PipeGame.canEnter(nextCol, nextRow, way, line, passesAt, mine, reserved, key, walk)) options.push(way);
        }
        // 남과(또는 제 몸과) 함께 쓰는 칸에서는 꺾을 수 없다 (곧게만 지나야 엇갈림이다)
        const shared = passesAt(col, row).length > 0 || (mine.get(key(col, row)) || 0) > 1;
        const choices = shared ? options.filter((way) => way === direction) : options;
        if (!choices.length) { stuck = true; break; }
        let next;
        if (plan.length && !choices.includes(plan[0])) {
          // 고리를 마저 그릴 수 없으면 (판 끝이나 다른 관에 막힘) 고리를 그만두고 그냥 이어 간다. 거기까지 그린 길도 멀쩡한 길이다.
          // 예전에는 이 길을 통째로 버려서, 고리가 많은 단계에서는 관 하나 긋는 데 수백 번씩 다시 시작했다
          plan = [];
        }
        if (plan.length) {
          next = plan.shift();
        } else if (loopsLeft > 0 && direction % 2 === 1 && choices.includes(2) && Math.random() < 0.6
          && PipeGame.sideRun(walk) >= 3 && row >= 2) {
          // 고리: 옆으로 가는 중 → 위로 2 칸 → 뒤로 loopWidth 칸 → 아래로 2 칸 (loopWidth 칸 앞에 지난 칸을 세로로 가로지른다) → 다시 아래.
          // 롤러코스터처럼 큰 고리만 만든다 (loopWidth 는 2 칸, 곧게 온 길이 길면 가끔 3 칸)
          const loopWidth = PipeGame.sideRun(walk) >= 4 && Math.random() < 0.4 ? 3 : 2;
          const loopHeight = 2;
          loopsLeft--;
          plan = [...Array(loopHeight - 1).fill(2), ...Array(loopWidth).fill((direction + 2) % 4), ...Array(loopHeight).fill(0), 0];
          next = 2;
        } else {
          const weights = choices.map((way) => {
            let weight = way === direction ? 1 - spec.turn : spec.turn;
            if (passesAt(col + DIRECTIONS[way][0], row + DIRECTIONS[way][1]).length) weight *= 1.6;
            return weight;
          });
          let pick = Math.random() * weights.reduce((a, b) => a + b, 0);
          next = choices[choices.length - 1];
          for (let index = 0; index < choices.length; index++) {
            pick -= weights[index];
            if (pick <= 0) { next = choices[index]; break; }
          }
        }
        advance(next);
        direction = next;
      }
      if (stuck) continue;
      const rest = PipeGame.finish(grid, line, walk, direction, endCol, passesAt, mine, reserved, key);
      if (!rest) continue;
      rest.forEach(advance);
      // 길이는 정한 범위에서 조금(LENGTH_SLACK) 벗어나도 된다. 딱 맞는 길만 받으면 긴 관이 많은 단계에서 대부분 버려졌다
      const lengthSlack = Math.ceil(maxLength * PipeGame.LENGTH_SLACK);
      if (walk.length < minLength - lengthSlack || walk.length > maxLength + lengthSlack) continue;
      return walk;
    }
    return null;
  }

  // 길 끝에서 같은 줄을 한 방향으로 곧게 지나온 칸 수 (지금 칸 포함)
  static sideRun(walk) {
    const last = walk.length - 1;
    const row = walk[last][1];
    let count = 1;
    while (last - count >= 0 && walk[last - count][1] === row) count++;
    return count;
  }

  // 지금 칸에서 끝 칸까지 갈 수 있는 가장 짧은 길 (방향 목록). 꺾을 때마다 TURN_COST 칸만큼 더 먼 것으로 쳐서
  // 계단처럼 자꾸 꺾는 길보다 길게 곧은 길을 고른다. 제 몸은 더 가로지르지 않는다. 못 가면 null
  static TURN_COST = 2.5;
  static finish(grid, line, walk, direction, endCol, passesAt, mine, reserved, key) {
    const { cols, rows } = grid;
    const { DIRECTIONS } = PipeGame;
    const [fromCol, fromRow] = walk[walk.length - 1];
    // 상태 = (칸, 들어온 방향). 엇갈리는 칸에서는 들어온 방향 그대로만 나간다
    const id = (col, row, way) => (col * 100 + row) * 4 + way;
    const previous = new Map([[id(fromCol, fromRow, direction), null]]);
    const cost = new Map([[id(fromCol, fromRow, direction), 0]]);
    // 가장 가까운 상태부터 꺼낸다. 비용은 0.5 단위(한 칸 1 · 꺾기 TURN_COST 2.5)라 0.5 마다 바구니 하나를 두면
    // 줄을 훑지 않고 바로 꺼낼 수 있다 (긴 관이 많은 단계에서 이 찾기를 수천 번 한다)
    const buckets = [[[fromCol, fromRow, direction, 0]]];
    let bucketIndex = 0;
    const pop = () => {
      while (bucketIndex < buckets.length && !(buckets[bucketIndex] && buckets[bucketIndex].length)) bucketIndex++;
      return bucketIndex < buckets.length ? buckets[bucketIndex].pop() : null;
    };
    const push = (state) => {
      const bucket = Math.round(state[3] * 2);
      (buckets[bucket] ||= []).push(state);
    };
    const done = new Set();
    for (let state = pop(); state; state = pop()) {
      const [col, row, way, here] = state;
      if (done.has(id(col, row, way))) continue;
      done.add(id(col, row, way));
      if (col === endCol && row === rows - 1) {
        const directions = [];
        let stateId = id(col, row, way);
        let current = [col, row, way];
        while (previous.get(stateId)) {
          directions.unshift(current[2]);
          current = previous.get(stateId);
          stateId = id(...current);
        }
        return directions;
      }
      const crossing = passesAt(col, row).length > 0 || (mine.get(key(col, row)) || 0) > 1;
      for (let nextWay = 0; nextWay < 4; nextWay++) {
        if (nextWay === (way + 2) % 4 || (crossing && nextWay !== way)) continue;
        const [nextCol, nextRow] = [col + DIRECTIONS[nextWay][0], row + DIRECTIONS[nextWay][1]];
        if (nextCol < 0 || nextCol >= cols || nextRow < 0 || nextRow >= rows) continue;
        if (mine.has(key(nextCol, nextRow))) continue;
        if (!PipeGame.canEnter(nextCol, nextRow, nextWay, line, passesAt, mine, reserved, key, walk)) continue;
        const next = id(nextCol, nextRow, nextWay);
        const there = here + 1 + (nextWay === way ? 0 : PipeGame.TURN_COST);
        if (cost.has(next) && cost.get(next) <= there) continue;
        cost.set(next, there);
        previous.set(next, [col, row, way]);
        push([nextCol, nextRow, nextWay, there]);
      }
    }
    return null;
  }

  // 칸 (col, row) 로 방향 way 로 들어가도 되는가
  static canEnter(col, row, way, line, passesAt, mine, reserved, key, walk) {
    const cellKey = key(col, row);
    if (reserved.has(cellKey) && reserved.get(cellKey) !== line) return false;
    const others = passesAt(col, row);
    const selfCount = mine.get(cellKey) || 0;
    const total = others.length + selfCount;
    if (total >= 2) return false;
    if (total === 0) return true;
    if (reserved.has(cellKey)) return false;
    // 이미 한 길이 지난 칸: 그 길이 곧게 지났고, 이번엔 그와 엇갈리는 방향으로 곧게 지나야 한다
    let axis;
    if (others.length) axis = others[0].axis;
    else {
      // 제 몸: 그 칸을 지날 때의 모양. 고리는 칸 7 개 넘게 돌아야 한다 (작은 고리는 매끈하게 다듬으면 매듭처럼 오그라든다)
      const i = walk.findIndex(([walkCol, walkRow]) => walkCol === col && walkRow === row);
      if (walk.length - i < 7) return false;
      const previous = i === 0 ? [col, row - 1] : walk[i - 1];
      const next = walk[i + 1];
      if (!next) return false;
      axis = previous[1] === next[1] ? 'h' : previous[0] === next[0] ? 'v' : 'turn';
    }
    if (axis === 'turn') return false;
    const goingAxis = way % 2 === 0 ? 'v' : 'h';
    return goingAxis !== axis;
  }

  // 칸 길 → 그린 점들: 출발점 → (위에서 첫 칸으로 이어 주는 S 자) → 칸마다 곧은 토막 또는 사분원 → (끝 칸에서 끝점으로) → 끝점
  static pathOf(grid, walk, start, end, lanes) {
    const { TOP, MAZE_HEIGHT } = PipeGame;
    const { cell, offsetX, offsetY } = grid;
    const half = cell / 2;
    const points = [];
    // 세로로 들어가고 나오는 S 자 (위아래 끝의 곧은 부분과 칸 사이)
    const bridge = (fromPoint, toPoint) => {
      const bend = (toPoint[1] - fromPoint[1]) / 2;
      for (let i = 1; i <= 8; i++) {
        const progress = i / 8;
        const rest = 1 - progress;
        points.push([
          rest * rest * rest * fromPoint[0] + 3 * rest * rest * progress * fromPoint[0] + 3 * rest * progress * progress * toPoint[0] + progress * progress * progress * toPoint[0],
          rest * rest * rest * fromPoint[1] + 3 * rest * rest * progress * (fromPoint[1] + bend) + 3 * rest * progress * progress * (toPoint[1] - bend) + progress * progress * progress * toPoint[1],
        ]);
      }
    };
    const startPoint = [PipeGame.laneX(start, lanes), TOP - 14];
    points.push(startPoint);
    bridge(startPoint, [offsetX + (walk[0][0] + 0.5) * cell, offsetY]);
    walk.forEach(([col, row], i) => {
      const [previousCol, previousRow] = i === 0 ? [col, row - 1] : walk[i - 1];
      const [nextCol, nextRow] = i === walk.length - 1 ? [col, row + 1] : walk[i + 1];
      const entryDirection = [col - previousCol, row - previousRow];
      const exitDirection = [nextCol - col, nextRow - row];
      const centerX = offsetX + (col + 0.5) * cell;
      const centerY = offsetY + (row + 0.5) * cell;
      const entry = [centerX - entryDirection[0] * half, centerY - entryDirection[1] * half];
      const exit = [centerX + exitDirection[0] * half, centerY + exitDirection[1] * half];
      if (entryDirection[0] === exitDirection[0] && entryDirection[1] === exitDirection[1]) {
        for (let step = 1; step <= 6; step++) points.push([entry[0] + ((exit[0] - entry[0]) * step) / 6, entry[1] + ((exit[1] - entry[1]) * step) / 6]);
        return;
      }
      // 사분원: 들어온 변과 나가는 변이 만나는 칸 모서리가 가운데
      const corner = [centerX - entryDirection[0] * half + exitDirection[0] * half, centerY - entryDirection[1] * half + exitDirection[1] * half];
      const startAngle = Math.atan2(entry[1] - corner[1], entry[0] - corner[0]);
      let sweep = Math.atan2(exit[1] - corner[1], exit[0] - corner[0]) - startAngle;
      if (sweep > Math.PI) sweep -= 2 * Math.PI;
      if (sweep < -Math.PI) sweep += 2 * Math.PI;
      for (let step = 1; step <= 8; step++) {
        const angle = startAngle + (sweep * step) / 8;
        points.push([corner[0] + Math.cos(angle) * half, corner[1] + Math.sin(angle) * half]);
      }
    });
    const [lastCol, lastRow] = walk[walk.length - 1];
    bridge([offsetX + (lastCol + 0.5) * cell, offsetY + (lastRow + 1) * cell], [PipeGame.laneX(end, lanes), TOP + MAZE_HEIGHT + 14]);
    return points;
  }

}
