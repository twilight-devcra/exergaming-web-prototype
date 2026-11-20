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
//   n      — 조각 수.
//   shapes — 돌기 모양 가짓수 (3~4).
//   depth  — 함정 깊이 [최소, 최대]. 잘못 고른 조각 하나를 놓은 뒤 길이 막힐 때까지 놓을 수 있는 조각 수 (그 조각 포함). 0 이면 함정이 없다 (어느 순서로 놓아도 끝까지 간다).
//   pMax   — 맞는 조각을 아무거나 눌렀을 때 끝까지 이을 확률의 상한. 낮을수록 미리 생각해야 한다.
//   pMin   — 같은 확률의 하한 (쉬운 단계).
import { U } from '../config.js';
import { Dg } from '../diagram.js';
import { Sfx } from '../sfx.js';
import { Tag } from './tags.js';
import { Phase, Progress, pointsPer, resultOf, abortedResult } from './kit.js';

// 돌기 모양. 점은 (u, v): u = 변에서 바깥으로 나온 거리, v = 변을 따라 가운데에서 떨어진 거리 (위가 음수).
// 돌기와 홈은 같은 점을 쓴다 — 앞 조각의 돌기가 뒤 조각의 홈에 꼭 맞는다.
// 모양에 색을 칠하지 않는다. 돌기를 모양 색으로 칠했더니 조각이 한 덩어리로 보이지 않고 상자에 색 표시를 붙인 것처럼 보였다.
// 조각은 모두 같은 종이 질감 하나이고, 돌기와 홈의 윤곽만으로 모양을 가린다 (진짜 직소 퍼즐처럼)
// 동그라미: 좁은 목(폭 12) 끝에 반지름 10 의 원. 원은 목과 만나는 −143° 에서 바깥 끝(0°)을 거쳐 +143° 까지 그린다
const circlePts = () => {
  const a0 = Math.atan2(-6, 5 - 13);
  const arc = Array.from({ length: 17 }, (_, k) => {
    const angle = a0 - (2 * a0 * (k + 1)) / 18;
    return [13 + 10 * Math.cos(angle), 10 * Math.sin(angle)];
  });
  return [[0, -6], [5, -6], ...arc, [5, 6], [0, 6]];
};
// 점은 작은 격자에 그린 뒤 KNOB_SCALE 배로 키운다
const KNOB_SCALE = 1.25;
const SHAPES = [
  { id: 'circle', name: '동그라미', pts: circlePts() },
  { id: 'triangle', name: '세모', pts: [[0, -14], [22, 0], [0, 14]] },
  { id: 'square', name: '네모', pts: [[0, -12], [20, -12], [20, 12], [0, 12]] },
  { id: 'tee', name: '티자', pts: [[0, -5], [11, -5], [11, -14], [22, -14], [22, 14], [11, 14], [11, 5], [0, 5]] },
].map((shape) => ({ ...shape, pts: shape.pts.map(([px, py]) => [px * KNOB_SCALE, py * KNOB_SCALE]) }));

export class ChainGame {
  static id = 'chain';
  static tags = [Tag.SHAPE];
  static title = '조각 잇기';
  static hint = '모양이 맞는 조각을 이어 끝까지 채우세요<br>놓은 조각은 되돌릴 수 없으니 미리 생각해 보세요';
  static levels = [
    // 쉬운 단계: 함정이 없거나 바로 드러난다. Lv1 은 조각 둘로 '모양을 맞춰 잇는다'만 익힌다
    { n: 2, shapes: 3, depth: [0, 0] },
    { n: 4, shapes: 3, depth: [0, 1], pMin: 0.5 },
    // 잘못 고르면 다음 수에 막힌다
    { n: 4, shapes: 3, depth: [1, 1], pMax: 0.67 },
    // 함정이 한 수 더 깊어지기 시작한다
    { n: 5, shapes: 3, depth: [1, 2], pMax: 0.67 },
    { n: 5, shapes: 3, depth: [2, 2], pMax: 0.6 },
    { n: 6, shapes: 3, depth: [2, 3], pMax: 0.5 },
    // 모양 네 가지: 함정이 깊어진다. 8조각·함정 4~6수(Lv8 의 처음 값)는 너무 어려워 뺐다
    { n: 6, shapes: 4, depth: [3, 4], pMax: 0.5 },
    { n: 7, shapes: 4, depth: [3, 5], pMax: 0.4 },
  ];
  static maxLevel = ChainGame.levels.length;
  static ROUNDS = 2;
  static W = 76;    // 조각 한 칸의 너비 (판 단위). 몸통은 정사각형이다 — 넓으면 조각이 아니라 상자처럼 보였다
  static H = 76;    // 조각 높이
  static KNOB = 30; // 돌기가 튀어나온 길이 (가장 긴 동그라미 28.75)
  static WALL = 40; // 양쪽 벽 두께 (마지막 돌기가 벽 밖으로 나오지 않게 KNOB 보다 두껍게)
  static PAD = 5;   // 그림 둘레 여백
  static ARROW = 30; // 줄 위에 다음 칸을 가리키는 화살표가 들어갈 높이

  // 소개 그림: ① 앞 돌기와 모양이 맞는 조각을 골라 ② 끝까지 모두 잇는다
  static diagram() {
    const { W, H, WALL, PAD } = ChainGame;
    const [circleShape, triangleShape, squareShape] = SHAPES;
    const { ARROW } = ChainGame;
    const vbRow = (n) => `${-WALL - PAD} ${-PAD} ${n * W + 2 * WALL + 2 * PAD} ${H + 2 * PAD}`;
    // ① 벽의 동그라미 돌기 · 다음 칸 · 아래 조각 둘 (동그라미 홈은 누르고, 세모 홈은 흐리게)
    const y2 = H + 30;
    const pick = ChainGame.defs() + `<g class="ch-row">${ChainGame.slot(0)}${ChainGame.slot(W)}${ChainGame.wallStart(circleShape)}${ChainGame.wallEnd(2 * W, squareShape)}` +
      `<g transform="translate(${W / 2} 0)">${ChainGame.arrow()}</g></g>` +
      `<g transform="translate(-20 ${y2})">${ChainGame.piece(0, circleShape, triangleShape)}</g>` +
      `<g transform="translate(${W + 30} ${y2})" opacity="0.5">${ChainGame.piece(0, triangleShape, squareShape)}</g>` +
      Dg.tap(30, y2 + H / 2, 18);
    const vb1 = `${-WALL - PAD} ${-PAD - ARROW} ${2 * W + 2 * WALL + 2 * PAD + 20} ${y2 + H + 2 * PAD + ARROW}`;
    const done = ChainGame.defs() + `<g class="ch-row">${ChainGame.wallStart(circleShape)}${ChainGame.piece(0, circleShape, triangleShape)}${ChainGame.piece(W, triangleShape, squareShape)}${ChainGame.wallEnd(2 * W, squareShape)}</g>`;
    return [
      { svg: Dg.svg(vb1, pick), caption: '모양이 맞는 조각을 골라' },
      { svg: Dg.svg(vbRow(2), done), caption: '조각을 모두 써서 끝까지 잇기' },
    ];
  }

  /** @param {import('./host.js').GameHost} host */

  constructor(host) {
    this.host = host;
    this.spec = ChainGame.levels[host.level - 1];
    this.round = 0;
    this.correct = 0;
    this.phase = Phase.WAIT;
  }

  start() {
    const { stage, level } = this.host;
    this.message = U.el('div', 'stage-msg', '');
    const { body, dots } = U.frame(stage, `${ChainGame.title} · Lv.${level}`, this.message, ChainGame.ROUNDS);
    this.body = body;
    this.progress = dots;
    this.wrap = U.el('div', 'ch-wrap');
    this.rowBox = U.el('div', 'ch-rowbox');
    this.tray = U.el('div', 'ch-tray');
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
    this.kinds = U.shuffle([...SHAPES]).slice(0, this.spec.shapes);
    // 아래 조각은 섞어 둔다. 늘어놓은 차례가 그대로 정답이면 다시 섞는다
    const idx = puzzle.pieces.map((_, i) => i);
    for (let k = 0; k < 20; k++) {
      U.shuffle(idx);
      if (!ChainGame.solves(puzzle.start, idx.map((i) => puzzle.pieces[i]))) break;
    }
    this.order = idx;               // 단추 차례 → 조각 번호
    this.placed = [];               // 놓은 조각 번호 (차례대로)
    this.pos = puzzle.start;             // 줄 끝의 돌기 모양
    this.deadAt = -1;               // 길이 처음 막힌 수 (놓은 차례, 0부터)

    U.say(this.message, '맞는 조각을 차례로 누르세요', 'act');
    Progress.current(this.progress, this.round);

    const { W, H, WALL, PAD, ARROW } = ChainGame;
    const n = puzzle.pieces.length;
    this.rowW = n * W + 2 * WALL + 2 * PAD;
    this.rowH = H + 2 * PAD + ARROW;
    this.rowBox.innerHTML = `<svg class="ch-row" viewBox="${-WALL - PAD} ${-PAD - ARROW} ${this.rowW} ${this.rowH}">` +
      `${ChainGame.defs()}<g class="ch-slots"></g><g class="ch-placed"></g>` +
      `${ChainGame.wallStart(this.kind(puzzle.start))}<g class="ch-end">${ChainGame.wallEnd(n * W, this.kind(puzzle.finish))}</g>` +
      `<g class="ch-next">${ChainGame.arrow()}</g></svg>`;
    this.rowSvg = this.rowBox.firstChild;
    this.slotsGroup = this.rowSvg.querySelector('.ch-slots');
    this.placedGroup = this.rowSvg.querySelector('.ch-placed');
    this.endGroup = this.rowSvg.querySelector('.ch-end');
    this.nextGroup = this.rowSvg.querySelector('.ch-next');

    const { KNOB } = ChainGame;
    this.tray.innerHTML = '';
    this.pieceButtons = this.order.map((pi) => {
      const [sock, knob] = puzzle.pieces[pi];
      const b = U.el('button', 'ch-piece',
        `<svg viewBox="${-PAD} ${-PAD} ${W + KNOB + 2 * PAD} ${H + 2 * PAD}">${ChainGame.defs()}${ChainGame.piece(0, this.kind(sock), this.kind(knob))}</svg>`);
      b.addEventListener('pointerdown', () => this.pick(pi));
      this.tray.append(b);
      return b;
    });
    this.buttonOf = new Map(this.order.map((pi, k) => [pi, this.pieceButtons[k]]));

    this.refresh();
    this.layout();
    this.phase = Phase.INPUT;
    this.host.question({
      start: puzzle.start, finish: puzzle.finish,
      pieces: this.order.map((i) => puzzle.pieces[i]), // 단추 차례대로 [홈, 돌기]
      shapes: this.kinds.map((k) => k.id),       // 모양 번호 → 모양 id
      sols: puzzle.sols, traps: puzzle.traps, depth: puzzle.depth, pRandom: Math.round(puzzle.p * 1000) / 1000,
    });
    this.host.timer(n, () => this.end('timeout'));
  }

  kind(k) {
    return this.kinds[k];
  }

  // 다음 빈칸 표시와 누를 수 있는 조각을 맞춘다
  refresh() {
    const n = this.puzzle.pieces.length;
    const k = this.placed.length;
    this.slotsGroup.innerHTML = Array.from({ length: n - k }, (_, j) => ChainGame.slot((k + j) * ChainGame.W)).join('');
    // 화살표는 다음 칸 위로 옮긴다 (css transition 으로 미끄러진다). 다 채우면 숨긴다
    this.nextGroup.style.transform = `translateX(${(Math.min(k, n - 1) + 0.5) * ChainGame.W}px)`;
    this.nextGroup.classList.toggle('gone', k >= n);
    this.buttonOf.forEach((b, pi) => {
      const used = this.placed.includes(pi);
      b.classList.toggle('used', used);
      b.disabled = used || this.puzzle.pieces[pi][0] !== this.pos;
    });
  }

  layout() {
    if (!this.puzzle) return;
    const body = this.body;
    const BW = body.clientWidth - 16;
    const BH = body.clientHeight - 16;
    const n = this.puzzle.pieces.length;
    const { W, H, KNOB, PAD } = ChainGame;
    const gap = U.gapOf(this.wrap, 24);
    // 줄: 너비에 맞추되 조각 한 칸이 170px 를 넘지 않게
    const rowScale = Math.min(BW / this.rowW, 170 / W, (BH * 0.45) / this.rowH);
    const rowH = this.rowH * rowScale;
    this.rowSvg.style.width = `${this.rowW * rowScale}px`;
    this.rowSvg.style.height = `${rowH}px`;
    // 아래 조각: 한 줄에 다 들어가면 한 줄, 아니면 두~네 줄로. 단추가 가장 커지는 줄 수를 고른다
    const ar = (W + KNOB + 2 * PAD) / (H + 2 * PAD);
    const tg = 12;
    const availH = BH - rowH - gap - 8;
    let best = 0;
    for (let rows = 1; rows <= 4; rows++) {
      const cols = Math.ceil(n / rows);
      const byW = (BW - tg * (cols - 1)) / cols;
      const byH = ((availH - tg * (rows - 1)) / rows) * ar;
      best = Math.max(best, Math.min(byW, byH));
    }
    const tw = U.clamp(best, 56, 170);
    // 높이도 직접 준다. aspect-ratio 에 맡기면 Safari 는 안의 svg(height:100%)와 맞물려 단추를 길게 늘인다
    this.wrap.style.setProperty('--tw', `${tw}px`);
    this.wrap.style.setProperty('--th', `${tw / ar}px`);
  }

  pick(pi) {
    if (this.phase !== Phase.INPUT) return;
    const b = this.buttonOf.get(pi);
    if (!b || b.disabled) return;
    const [, knob] = this.puzzle.pieces[pi];
    const slot = this.placed.length;
    this.placed.push(pi);
    this.pos = knob;
    const left = this.puzzle.pieces.filter((_, i) => !this.placed.includes(i));
    const alive = ChainGame.canFinish(knob, left);
    if (!alive && this.deadAt < 0) this.deadAt = slot;
    this.host.input({ piece: this.order.indexOf(pi), slot, alive });
    this.host.sfx(Sfx.TAP);

    const [sock] = this.puzzle.pieces[pi];
    this.placedGroup.insertAdjacentHTML('beforeend',
      `<g class="ch-put" data-slot="${slot}">${ChainGame.piece(slot * ChainGame.W, this.kind(sock), this.kind(knob))}</g>`);

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
    this.pieceButtons.forEach((b) => (b.disabled = true));
    this.host.answer({
      placed: this.placed.map((pi) => this.order.indexOf(pi)), // 놓은 차례대로 단추 번호
      correct: ok, stuck: how === 'stuck', timedOut: how === 'timeout',
      deadAt: this.deadAt >= 0 ? this.deadAt : null,
    });

    Progress.mark(this.progress, this.round, ok);
    this.nextGroup.classList.add('gone');

    if (ok) {
      this.correct++;
      this.endGroup.classList.add('right');
      U.say(this.message, '끝까지 이었어요!', 'good');
      this.host.award(pointsPer(this.host, ChainGame.ROUNDS), this.rowBox);
      this.host.sfx(Sfx.GOOD);
    } else {
      // 길이 처음 막힌 조각을 표시한다. 그 앞까지는 끝까지 갈 수 있었다
      const culprit = this.placedGroup.querySelector(`[data-slot="${this.deadAt}"]`);
      culprit?.classList.add('culprit');
      // 막혔으면 늘 표시할 조각이 있다. 시간 초과인데 표시할 조각이 없으면 그때까지는 길이 열려 있었다
      const pre = how === 'timeout' ? '시간 초과 · ' : '';
      U.say(this.message, culprit ? `${pre}빨간 조각에서 길이 막혔어요` : '시간 초과', 'bad');
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
    return abortedResult(this.correct, this.round);
  }

  // ---- 그리기 ----
  // 돌기·홈의 점들을 변 위 x 에, 가운데 높이에 맞춰 놓는다 (py 가 작은 쪽 = 위부터)
  static edge(kind, x) {
    const cy = ChainGame.H / 2;
    return kind.pts.map(([px, py]) => [x + px, cy + py]);
  }

  static pts(list) {
    return list.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  }

  // 조각 질감: 위가 밝은 종이색 그러데이션 하나. svg 마다 새 id 로 넣는다 (같은 id 를 여러 svg 에 두면
  // 먼저 나온 svg 가 사라질 때 다른 svg 의 칠이 빠질 수 있다). 화면 스타일과 상관없이 같은 색이다 (진짜 물건처럼)
  static gradSeq = 0;
  static defs() {
    ChainGame.gradId = `chg${++ChainGame.gradSeq}`;
    return `<defs><linearGradient id="${ChainGame.gradId}" x1="0" y1="0" x2="0.35" y2="1">` +
      '<stop offset="0" stop-color="#f7e2b8"/><stop offset="0.55" stop-color="#ecc98d"/><stop offset="1" stop-color="#d9ad6a"/>' +
      '</linearGradient></defs>';
  }

  // x0 에 놓인 조각: 왼쪽 홈 sockKind, 오른쪽 돌기 knobKind. 몸통·돌기·홈이 하나의 윤곽이고 한 가지로 칠한다.
  // 칠은 속성으로 주어 css 가 덮을 수 있게 한다 (길이 막힌 조각 .culprit). 바로 앞 defs() 의 질감을 쓴다
  static piece(x0, sockKind, knobKind) {
    const { W, H } = ChainGame;
    const knob = ChainGame.edge(knobKind, x0 + W);
    const sock = ChainGame.edge(sockKind, x0);
    const body = `M${x0},0 H${x0 + W} ${ChainGame.pts(knob)} V${H} H${x0} ${ChainGame.pts([...sock].reverse())} Z`;
    return `<path class="ch-body" d="${body}" fill="url(#${ChainGame.gradId})"/>`;
  }

  // 왼쪽 벽: 첫 칸 쪽으로 돌기가 나와 있다
  static wallStart(kind) {
    const { H, WALL } = ChainGame;
    const knob = ChainGame.edge(kind, 0);
    return `<path class="ch-wall" d="M${-WALL},0 H0 ${ChainGame.pts(knob)} V${H} H${-WALL} Z"/>`;
  }

  // 오른쪽 벽: 마지막 조각의 돌기가 들어갈 홈
  static wallEnd(x, kind) {
    const { H, WALL } = ChainGame;
    const sock = ChainGame.edge(kind, x);
    return `<path class="ch-wall" d="M${x},0 H${x + WALL} V${H} H${x} ${ChainGame.pts([...sock].reverse())} Z"/>`;
  }

  static slot(x) {
    const { W, H } = ChainGame;
    return `<rect class="ch-slot" x="${x + 3}" y="3" width="${W - 6}" height="${H - 6}" rx="8"/>`;
  }

  // 다음 칸을 가리키는 아래쪽 화살표. 가운데가 x = 0 이고 줄 위 ARROW 높이 안에 들어간다
  static arrow() {
    return '<path class="ch-arrow" d="M-9,-28 H9 V-16 H17 L0,-3 L-17,-16 H-9 Z"/>';
  }

  // ---- 문제 만들기와 풀기 ----
  // 조각 = [홈, 돌기] (모양 번호). 남은 조각 left 를 돌기 pos 뒤에 모두 이을 수 있는가
  static canFinish(pos, left) {
    if (!left.length) return true;
    const tried = new Set();
    return left.some(([sock, knob], i) => {
      if (sock !== pos || tried.has(`${sock}${knob}`)) return false;
      tried.add(`${sock}${knob}`);
      return ChainGame.canFinish(knob, left.filter((_, j) => j !== i));
    });
  }

  // 조각을 이 차례대로 놓으면 끝까지 이어지는가
  static solves(start, seq) {
    let pos = start;
    for (const [sock, knob] of seq) {
      if (sock !== pos) return false;
      pos = knob;
    }
    return true;
  }

  // 반환: sols 서로 다른 정답 차례 수 · traps 바르게 두는 동안 만나는 함정 수 · depth 함정 깊이 (난이도 설명 참고)
  //       forks 함정이 있는 갈림길 수 · p 맞는 조각을 아무거나 눌러 끝까지 갈 확률. 끝까지 이을 수 없으면 null
  static analyze(start, pieces) {
    const n = pieces.length;
    const full = (1 << n) - 1;
    const memo = { alive: new Map(), long: new Map(), p: new Map() };
    const key = (pos, mask) => mask * 8 + pos;
    const legal = (pos, mask) => pieces.map((_, i) => i).filter((i) => !(mask & (1 << i)) && pieces[i][0] === pos);
    // 같은 모양의 조각은 한 번만 따진다
    const moves = (pos, mask) => {
      const seen = new Set();
      return legal(pos, mask).filter((i) => {
        const k = pieces[i].join();
        return !seen.has(k) && seen.add(k);
      });
    };
    const alive = (pos, mask) => {
      if (mask === full) return true;
      const k = key(pos, mask);
      if (!memo.alive.has(k)) memo.alive.set(k, moves(pos, mask).some((i) => alive(pieces[i][1], mask | (1 << i))));
      return memo.alive.get(k);
    };
    const longest = (pos, mask) => {
      const k = key(pos, mask);
      if (!memo.long.has(k)) {
        memo.long.set(k, Math.max(0, ...moves(pos, mask).map((i) => 1 + longest(pieces[i][1], mask | (1 << i)))));
      }
      return memo.long.get(k);
    };
    const pRand = (pos, mask) => {
      if (mask === full) return 1;
      const k = key(pos, mask);
      if (!memo.p.has(k)) {
        const ls = legal(pos, mask);
        memo.p.set(k, ls.length ? ls.reduce((sum, i) => sum + pRand(pieces[i][1], mask | (1 << i)), 0) / ls.length : 0);
      }
      return memo.p.get(k);
    };
    if (!alive(start, 0)) return null;
    let sols = 0;
    let traps = 0;
    let depth = 0;
    let forks = 0;
    const seen = new Set();
    const walk = (pos, mask) => {
      if (mask === full) return void sols++;
      const first = !seen.has(key(pos, mask));
      seen.add(key(pos, mask));
      let fork = false;
      for (const i of moves(pos, mask)) {
        const m2 = mask | (1 << i);
        const knob = pieces[i][1];
        if (alive(knob, m2)) walk(knob, m2);
        else if (first) {
          traps++;
          fork = true;
          depth = Math.max(depth, 1 + longest(knob, m2));
        }
      }
      if (fork) forks++;
    };
    walk(start, 0);
    return { sols, traps, depth, forks, p: pRand(start, 0) };
  }

  // 시작 모양에서 무작위로 걸어 조각을 만든다 (그러니 늘 정답이 있다). 같은 모양끼리 잇는 조각(●–●)은 하나까지.
  // 레벨 조건에 맞을 때까지 다시 만든다. 레벨마다 평균 몇십 번 안에 맞는다
  static make(spec, rand = Math.random) {
    const { n, shapes } = spec;
    const [dMin, dMax] = spec.depth;
    let last = null;
    for (let tries = 0; tries < 5000; tries++) {
      const start = Math.floor(rand() * shapes);
      const pieces = [];
      let pos = start;
      for (let i = 0; i < n; i++) {
        const nx = Math.floor(rand() * shapes);
        pieces.push([pos, nx]);
        pos = nx;
      }
      if (pieces.filter(([sock, knob]) => sock === knob).length > 1) continue;
      const stats = ChainGame.analyze(start, pieces);
      if (!stats) continue;
      last = { start, finish: pos, pieces, ...stats };
      if (stats.depth < dMin || stats.depth > dMax) continue;
      if (stats.p > (spec.pMax ?? 1) || stats.p < (spec.pMin ?? 0)) continue;
      return last;
    }
    return last; // 조건에 꼭 맞는 것을 못 찾으면 마지막 것이라도 낸다 (실제로는 일어나지 않는다)
  }
}
