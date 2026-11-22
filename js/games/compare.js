// 두 그림 비교하기
// 점 격자 위에 굵은 선으로 그린 그림 둘을 나란히 보여 주고, 두 그림이 똑같은지 묻는다 (같아요 / 달라요). 한 게임에 3번.
// 집중력 게임이라 외울 것은 없다: 두 그림은 답할 때까지 늘 보인다. 다르면 꼭 선 하나만 다르다.
//
// 그림: 이웃한 두 점(대각선 포함)을 잇는 짧은 선들. 긴 직선은 짧은 선 여럿이 이어진 것이다.
//   - 한 덩어리로 이어지고 점의 모든 줄과 칸을 쓴다 (한쪽 구석에 몰리면 비교할 거리가 적어 쉽다)
//   - 한 점에 만나는 선은 셋까지 (넷이 넘으면 굵은 선이 뭉쳐 덩어리로 보인다)
//   - 한 칸 안에서 엇갈리는 대각선(✕)은 쓰지 않는다 (속 빈 선이 꽉 찬 선 위를 지나는 것처럼 보여 다름이 하나 더 생긴다)
// 선은 꽉 찬 선이거나 속 빈 선(굵은 테두리만 있는 선)이다. 모든 선을 굵게 그리므로 어느 모양이 섞여도 한 그림으로 이어져 보인다.
// 속 빈 선이 꽉 찬 선과 만나는 점에서는 속을 덜 그려 평평하게 끝내고, 속 빈 선끼리는 속이 이어진다.
//
// 다름 (한 쌍마다 레벨의 changes 가운데 하나를 고르게 고른다. 바꾼 뒤에도 위의 규칙을 지키는 것만 쓴다):
//   add 선이 생김 · remove 선이 없어짐 · shift 선 하나가 한 칸 밀림 (상하좌우) · style 꽉 찬 선 ↔ 속 빈 선
// 같은지 다른지는 문제마다 반반으로 따로 정한다 (게임 안에서 맞춰 놓지 않는다 — 앞의 답으로 마지막 답을 짐작하지 못하게).
//
// 난이도 (모양을 굴리거나 다른 곳을 누르게 하는 것은 넣지 않았다 — 집중해서 비교하는 데만 쓴다):
//   grid    — 점 grid×grid,  lines — 선 수
//   changes — 고를 수 있는 다름. 속 빈 선과 style 은 Lv5 부터
//   hollow  — 선 하나가 속 빈 선일 확률 (0 이면 모두 꽉 찬 선)
//   crowd   — 생김·없어짐·밀림을 선이 붐비는 자리에서 고를 확률 (가장자리에서 바뀌면 윤곽이 달라져 쉽다)
//   edge    — 꽉 참 ↔ 속 빔을 '속 빈 구간의 끝'(다른 모양의 선과 맞닿은 선)에서 고를 확률.
//             그러면 구간이 한 칸 늘거나 줄기만 한다 (구간 한가운데를 바꾸면 줄이 둘로 끊겨 보여 쉽다)
// 미리 보기로 다듬은 값이다 (2026-11-09). 플레이해 보며 고친다.
import { Util } from '../config.js';
import { Diagram } from '../diagram.js';
import { Sfx } from '../sfx.js';
import { Tag } from './tags.js';
import { Phase, Progress, pointsPer, resultOf, abortedResult } from './kit.js';

const COMPARE_GEO = ['add', 'remove', 'shift'];

export class CompareGame {
  static id = 'compare';
  static tags = [Tag.SEARCH];
  static title = '두 그림 비교하기';
  static hint = '두 그림이 똑같은지 잘 비교해 보고<br>같으면 같아요, 다르면 달라요를 누르세요';
  static levels = [
    // 쉬운 단계: 선이 적고, 선이 생기거나 없어지기만 한다
    { grid: 3, lines: 4, changes: ['add', 'remove'], hollow: 0, crowd: 0, edge: 0 },
    { grid: 3, lines: 5, changes: ['add', 'remove'], hollow: 0, crowd: 0, edge: 0 },
    { grid: 4, lines: 6, changes: COMPARE_GEO, hollow: 0, crowd: 0.2, edge: 0 },
    { grid: 4, lines: 8, changes: COMPARE_GEO, hollow: 0, crowd: 0.4, edge: 0 },
    // 속 빈 선이 섞이고, 선 모양이 바뀌는 다름이 더해진다
    { grid: 4, lines: 8, changes: [...COMPARE_GEO, 'style'], hollow: 0.4, crowd: 0.4, edge: 0.3 },
    // 점이 촘촘해지고 선이 많아진다 (7×7 까지는 선을 가늘게 그리면 어수선해 보이지 않았다)
    { grid: 6, lines: 13, changes: [...COMPARE_GEO, 'style'], hollow: 0.45, crowd: 0.6, edge: 0.5 },
    { grid: 6, lines: 20, changes: [...COMPARE_GEO, 'style'], hollow: 0.5, crowd: 0.7, edge: 0.7 },
    { grid: 7, lines: 35, changes: [...COMPARE_GEO, 'style'], hollow: 0.5, crowd: 0.8, edge: 0.85 },
  ];
  static maxLevel = CompareGame.levels.length;
  static QUESTIONS = 3;
  static MAX_DEGREE = 3;
  // 판 (판 단위). 그림 하나는 CARD_SIZE×CARD_SIZE, 둘 사이는 GAP. 선은 굵기 LINE_WIDTH, 속 빈 선의 속은 INNER_WIDTH.
  // 점 사이가 좁은 판(6×6, 7×7)에서는 둘 다 점 사이에 맞춰 줄인다 (CompareGame.widths)
  static CARD_SIZE = 300;
  static CARD_PADDING = 30;
  static GAP = 28;
  static LINE_WIDTH = 18;
  static INNER_WIDTH = 8;

  // 소개 그림: ① 두 그림을 비교하고 ② 같아요 / 달라요 고르기
  static diagram() {
    const figure = [[[0, 0], [1, 0]], [[1, 0], [2, 1]], [[2, 1], [2, 2]], [[1, 0], [1, 2]]];
    const card = (left, lines) => {
      const pointAt = ([x, y]) => [left + 10 + x * 27, 15 + y * 27];
      let svg = `<rect class="dg-cmp-card" x="${left}" y="5" width="74" height="74" rx="8"/>`;
      for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) { const [dotX, dotY] = pointAt([x, y]); svg += `<circle class="dg-cmp-dot" cx="${dotX}" cy="${dotY}" r="2"/>`; }
      for (const [a, b] of lines) { const [start, end] = [pointAt(a), pointAt(b)]; svg += `<line class="dg-cmp-ln" x1="${start[0]}" y1="${start[1]}" x2="${end[0]}" y2="${end[1]}"/>`; }
      return svg;
    };
    const step1 = card(10, figure) + card(96, figure.filter((_, i) => i !== 1));
    // 게임의 단추처럼: 같아요 = 초록 바탕 ✓, 달라요 = 빨강 바탕 ✕
    const button = (x, kind, label, icon) => Diagram.rect(x, 26, 78, 44, `dg-cmp-${kind}`) +
      `<path class="dg-cmp-ico ${kind}" d="${icon}" transform="translate(${x + 7} 39) scale(0.75)"/>` + Diagram.text(x + 48, 48, label, 14);
    const step2 = button(8, 'same', '같아요', 'M4 12.5l5 5L20 6.5') + button(94, 'diff', '달라요', 'M6 6l12 12M18 6L6 18') + Diagram.tap(133, 48, 20);
    return [
      { svg: Diagram.svg('0 0 180 84', step1), caption: '두 그림을 비교하고' },
      { svg: Diagram.svg('0 0 180 84', step2), caption: '같은지 다른지 고르기' },
    ];
  }

  /** @param {import('./host.js').GameHost} host */

  constructor(host) {
    this.host = host;
    this.spec = CompareGame.levels[host.level - 1];
    this.answered = 0;
    this.correct = 0;
    this.phase = Phase.WAIT;
  }

  start() {
    const { stage, level } = this.host;
    this.message = Util.element('div', 'stage-msg act', '두 그림이 같나요?');
    const { body, dots } = Util.frame(stage, `${CompareGame.title} · Lv.${level}`, this.message, CompareGame.QUESTIONS);
    this.body = body;
    this.progress = dots;
    const { CARD_SIZE, GAP } = CompareGame;
    this.viewWidth = 2 * CARD_SIZE + GAP;
    this.wrap = Util.element('div', 'cmp-wrap');
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'cmp-board');
    this.svg.setAttribute('viewBox', `0 0 ${this.viewWidth} ${CARD_SIZE}`);
    this.optionRow = Util.element('div', 'cmp-opts');
    // 같아요 = 초록 바탕에 ✓, 달라요 = 빨강 바탕에 ✕ (색만으로 가리지 않게 그림이 다르다)
    const icon = { same: 'M4 12.5l5 5L20 6.5', diff: 'M6 6l12 12M18 6L6 18' };
    this.optionButtons = [['same', '같아요'], ['diff', '달라요']].map(([value, label]) => {
      const svg = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon[value]}"/></svg>`;
      const button = Util.element('button', `ar-cand cmp-btn ${value}`, `${svg}${label}`);
      button.disabled = true;
      button.addEventListener('pointerdown', () => this.pick(value));
      this.optionRow.append(button);
      return { value, button };
    });
    this.wrap.append(this.svg, this.optionRow);
    body.append(this.wrap);
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(body);
    // 보기 높이가 그림 크기 셈에 들어가므로, 보기가 바뀌면 다시 맞춘다
    this.resizeObserver.observe(this.optionRow);
    this.layout();
    this.host.after(200, () => this.ask());
  }

  layout() {
    const body = this.body;
    const aspectRatio = this.viewWidth / CompareGame.CARD_SIZE;
    const optionRowHeight = this.optionRow.offsetHeight || 104;
    const width = Math.max(280, Math.min(body.clientWidth - 40, (body.clientHeight - optionRowHeight - Util.gapOf(this.wrap, 22) - 18) * aspectRatio, 760));
    this.svg.style.width = `${width}px`;
    this.svg.style.height = `${width / aspectRatio}px`;
  }

  ask() {
    const puzzle = CompareGame.make(this.spec, Math.random() < 0.5);
    this.puzzle = puzzle;
    this.svg.innerHTML = CompareGame.card(this.spec.grid, puzzle.left, 0) + CompareGame.card(this.spec.grid, puzzle.right, CompareGame.CARD_SIZE + CompareGame.GAP);
    this.optionButtons.forEach(({ button }) => {
      button.disabled = false;
      button.classList.remove('right', 'wrong', 'answer');
    });
    Util.say(this.message, '두 그림이 같나요?', 'act');
    Progress.current(this.progress, this.answered);
    this.phase = Phase.INPUT;
    this.host.sfx(Sfx.BLINK);
    const line = (edge, style) => [...CompareGame.parse(edge).flat(), style === 'hollow' ? 'h' : 's'];
    const { diff } = puzzle;
    this.host.question({
      // eslint-disable-next-line id-length -- 기록 형식
      n: this.answered + 1, grid: this.spec.grid, same: puzzle.same,
      left: Object.entries(puzzle.left).map(([edge, style]) => line(edge, style)),
      change: puzzle.same ? null : {
        kind: puzzle.kind,
        removed: diff.removed ? CompareGame.parse(diff.removed).flat() : null,
        added: diff.added ? line(diff.added, diff.style) : null,
        restyled: diff.restyled ? line(diff.restyled, puzzle.right[diff.restyled]) : null,
      },
    });
    // 일의 양 = 선 수 (비교할 거리)
    this.host.timer(Object.keys(puzzle.left).length, () => this.pick(null));
  }

  // value = 'same' | 'diff', null 이면 시간 초과
  pick(value) {
    if (this.phase !== Phase.INPUT) return;
    this.phase = Phase.WAIT;
    this.host.stopTimer();
    const { puzzle } = this;
    const rightAnswer = puzzle.same ? 'same' : 'diff';
    const ok = value === rightAnswer;
    this.host.answer({ picked: value, correct: ok, timedOut: value === null });
    this.optionButtons.forEach(({ value: optionValue, button }) => {
      button.disabled = true;
      if (optionValue === rightAnswer) button.classList.add(ok ? 'right' : 'answer');
      else if (optionValue === value) button.classList.add('wrong');
    });
    // 다른 쌍이면 맞혔든 틀렸든 다른 곳을 보여 준다. 같은 쌍을 틀리면 두 그림에 초록 테두리
    if (!puzzle.same) this.markChange();
    else if (!ok) this.svg.querySelectorAll('.cmp-card').forEach((card) => card.classList.add('same'));
    if (ok) {
      this.correct++;
      Util.say(this.message, '정답!', 'good');
      this.host.award(pointsPer(this.host, CompareGame.QUESTIONS), this.optionButtons.find((option) => option.value === rightAnswer).button);
      this.host.sfx(Sfx.GOOD);
    } else {
      const why = puzzle.same ? '두 그림은 똑같아요' : '여기가 달라요';
      Util.say(this.message, value === null ? `시간 초과 · ${why}` : why, 'bad');
      this.host.sfx(Sfx.BAD);
    }
    Progress.mark(this.progress, this.answered, ok);
    this.answered++;
    this.host.after(ok ? 900 : 1800, () => {
      if (this.answered >= CompareGame.QUESTIONS) return this.finish();
      this.ask();
    });
  }

  // 바뀐 선을 두 그림 모두에 표시한다. 한쪽에 없는 선은 그 자리에 점선
  markChange() {
    const { diff } = this.puzzle;
    const { CARD_SIZE, GAP } = CompareGame;
    const leftMarks = [];
    const rightMarks = [];
    if (diff.restyled) { leftMarks.push([diff.restyled]); rightMarks.push([diff.restyled]); }
    if (diff.removed) { leftMarks.push([diff.removed]); rightMarks.push([diff.removed, true]); }
    if (diff.added) { leftMarks.push([diff.added, true]); rightMarks.push([diff.added]); }
    const gridSize = this.spec.grid;
    const marks = (list, offsetX) => list.map(([edge, missing]) => CompareGame.markLine(gridSize, edge, offsetX, missing)).join('');
    this.svg.querySelector('[data-side="0"] .cmp-marks').innerHTML = marks(leftMarks, 0);
    this.svg.querySelector('[data-side="1"] .cmp-marks').innerHTML = marks(rightMarks, CARD_SIZE + GAP);
  }

  finish() {
    this.phase = Phase.END;
    this.resizeObserver.disconnect();
    this.host.done(this.result());
  }

  result() {
    return resultOf(this.correct, CompareGame.QUESTIONS);
  }

  // 점수는 맞힐 때마다 바로 지급하므로 중단될 때 따로 줄 것이 없다
  abort() {
    this.phase = Phase.END;
    this.resizeObserver.disconnect();
    return abortedResult(this.correct, this.answered);
  }

  // ---- 그리기 ----
  // 선 굵기와 속 굵기. 5×5 까지는 LINE_WIDTH·INNER_WIDTH 그대로, 그보다 촘촘하면 점 사이의 LINE_RATIO 배로 (속도 같은 비율로)
  static LINE_RATIO = 0.3;
  static widths(gridSize) {
    const { CARD_SIZE, CARD_PADDING, LINE_WIDTH, INNER_WIDTH, LINE_RATIO } = CompareGame;
    const lineWidth = Math.min(LINE_WIDTH, ((CARD_SIZE - 2 * CARD_PADDING) / (gridSize - 1)) * LINE_RATIO);
    return { lineWidth, innerWidth: (lineWidth * INNER_WIDTH) / LINE_WIDTH };
  }

  static pointAt(gridSize, [x, y], offsetX) {
    const { CARD_SIZE, CARD_PADDING } = CompareGame;
    const step = (CARD_SIZE - 2 * CARD_PADDING) / (gridSize - 1);
    return [offsetX + CARD_PADDING + x * step, CARD_PADDING + y * step];
  }

  // 그림 하나 (styles = { 선: 'solid' | 'hollow' }). 모든 선을 굵게 그린 뒤 속 빈 선만 그 위에 밝은 속을 그린다.
  // 속의 끝: 꽉 찬 선이 닿는 점이면 LINE_WIDTH/2 만큼 덜 그려 평평하게 (꽉 찬 선을 파먹지 않게),
  // 그 밖(속 빈 선끼리 만나거나 끝이 비어 있는 점)이면 점까지 둥글게 그려 속끼리 이어지거나 둥근 테두리로 닫힌다
  static card(gridSize, styles, offsetX) {
    const { CARD_SIZE, parse, endpoints } = CompareGame;
    const { lineWidth, innerWidth } = CompareGame.widths(gridSize);
    const pointAt = (point) => CompareGame.pointAt(gridSize, point, offsetX);
    const keys = Object.keys(styles);
    const solidAt = new Set(keys.filter((edge) => styles[edge] === 'solid').flatMap(endpoints));
    let svg = `<g data-side="${offsetX ? 1 : 0}"><rect class="cmp-card" x="${offsetX + 1}" y="1" width="${CARD_SIZE - 2}" height="${CARD_SIZE - 2}" rx="14"/>`;
    for (let x = 0; x < gridSize; x++) for (let y = 0; y < gridSize; y++) { const [dotX, dotY] = pointAt([x, y]); svg += `<circle class="cmp-dot" cx="${dotX}" cy="${dotY}" r="3.5"/>`; }
    svg += '<g class="cmp-marks"></g>';
    for (const edge of keys) {
      const [a, b] = parse(edge).map(pointAt);
      svg += `<line class="cmp-ln" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke-width="${lineWidth}"/>`;
    }
    for (const edge of keys.filter((line) => styles[line] === 'hollow')) {
      const [pointA, pointB] = parse(edge);
      let [a, b] = [pointAt(pointA), pointAt(pointB)];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const unitX = (b[0] - a[0]) / length;
      const unitY = (b[1] - a[1]) / length;
      const cutA = solidAt.has(String(pointA));
      const cutB = solidAt.has(String(pointB));
      if (cutA) a = [a[0] + (unitX * lineWidth) / 2, a[1] + (unitY * lineWidth) / 2];
      if (cutB) b = [b[0] - (unitX * lineWidth) / 2, b[1] - (unitY * lineWidth) / 2];
      svg += `<line class="cmp-in" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke-width="${innerWidth}"/>`;
      if (!cutA) svg += `<circle class="cmp-in-cap" cx="${a[0]}" cy="${a[1]}" r="${innerWidth / 2}"/>`;
      if (!cutB) svg += `<circle class="cmp-in-cap" cx="${b[0]}" cy="${b[1]}" r="${innerWidth / 2}"/>`;
    }
    return svg + '</g>';
  }

  static markLine(gridSize, edge, offsetX, missing) {
    const [a, b] = CompareGame.parse(edge).map((point) => CompareGame.pointAt(gridSize, point, offsetX));
    const { lineWidth } = CompareGame.widths(gridSize);
    return `<line class="cmp-mark${missing ? ' miss' : ''}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke-width="${missing ? 6 : lineWidth + 16}"/>`;
  }

  // ---- 그림 만들기 ----
  // 선 = 이웃한 두 점. 점은 [x, y]. 키는 "x1,y1-x2,y2" (작은 쪽 먼저)
  static key(a, b) {
    const [first, second] = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? [a, b] : [b, a];
    return `${first}-${second}`;
  }

  static parse(edge) {
    return edge.split('-').map((part) => part.split(',').map(Number));
  }

  static endpoints(edge) {
    return CompareGame.parse(edge).map(String);
  }

  static allEdges(gridSize) {
    const { key } = CompareGame;
    const out = [];
    for (let x = 0; x < gridSize; x++) {
      for (let y = 0; y < gridSize; y++) {
        if (x + 1 < gridSize) out.push(key([x, y], [x + 1, y]));
        if (y + 1 < gridSize) out.push(key([x, y], [x, y + 1]));
        if (x + 1 < gridSize && y + 1 < gridSize) out.push(key([x, y], [x + 1, y + 1]), key([x + 1, y], [x, y + 1]));
      }
    }
    return out;
  }

  // 같은 칸의 다른 대각선 (가로·세로 선이면 null)
  static crossOf(edge) {
    const [a, b] = CompareGame.parse(edge);
    if (a[0] === b[0] || a[1] === b[1]) return null;
    return CompareGame.key([a[0], b[1]], [b[0], a[1]]);
  }

  static degree(keys) {
    const counts = {};
    keys.forEach((edge) => CompareGame.endpoints(edge).forEach((point) => (counts[point] = (counts[point] || 0) + 1)));
    return counts;
  }

  static pieces(keys) {
    const adjacency = {};
    for (const edge of keys) {
      const [a, b] = CompareGame.endpoints(edge);
      (adjacency[a] ||= []).push(b);
      (adjacency[b] ||= []).push(a);
    }
    const seen = new Set();
    let count = 0;
    for (const start of Object.keys(adjacency)) {
      if (seen.has(start)) continue;
      count++;
      const stack = [start];
      while (stack.length) {
        const point = stack.pop();
        if (seen.has(point)) continue;
        seen.add(point);
        stack.push(...adjacency[point]);
      }
    }
    return count;
  }

  // 그림이 지켜야 할 것: 한 덩어리 · 점의 모든 줄과 칸을 씀 · 한 점에 MAX_DEGREE 개까지 · 엇갈리는 대각선 없음
  static valid(gridSize, keys) {
    const Game = CompareGame;
    if (!keys.length || Game.pieces(keys) !== 1) return false;
    const used = keys.flatMap(Game.parse);
    if (new Set(used.map((point) => point[0])).size < gridSize || new Set(used.map((point) => point[1])).size < gridSize) return false;
    if (Math.max(...Object.values(Game.degree(keys))) > Game.MAX_DEGREE) return false;
    const set = new Set(keys);
    return keys.every((edge) => !set.has(Game.crossOf(edge)));
  }

  // 선의 자리: 선 하나에서 시작해 맞닿는 선을 하나씩 붙인다. 반은 아직 안 쓴 줄·칸으로 뻗는 선을 골라 판 전체로 퍼지게 한다
  static geometry(spec) {
    const Game = CompareGame;
    const allEdges = Game.allEdges(spec.grid);
    for (let attempt = 0; attempt < 3000; attempt++) {
      const set = new Set([allEdges[Util.randomBelow(allEdges.length)]]);
      while (set.size < spec.lines) {
        const used = new Set([...set].flatMap(Game.endpoints));
        const degrees = Game.degree([...set]);
        const candidates = allEdges.filter((edge) => !set.has(edge) && !set.has(Game.crossOf(edge)) &&
          Game.endpoints(edge).some((point) => used.has(point)) && Game.endpoints(edge).every((point) => (degrees[point] || 0) < Game.MAX_DEGREE));
        if (!candidates.length) break;
        const usedXs = new Set([...used].map((point) => point.split(',')[0]));
        const usedYs = new Set([...used].map((point) => point.split(',')[1]));
        const spreading = candidates.filter((edge) => Game.parse(edge).some(([x, y]) => !usedXs.has(String(x)) || !usedYs.has(String(y))));
        const pool = spreading.length && Math.random() < 0.5 ? spreading : candidates;
        set.add(pool[Util.randomBelow(pool.length)]);
      }
      if (set.size === spec.lines && Game.valid(spec.grid, [...set])) return [...set];
    }
    // 시험에서는 일어나지 않았다. 혹시 못 만들면 선 하나 적게
    return Game.geometry({ ...spec, lines: spec.lines - 1 });
  }

  static styleOf(spec) {
    return Math.random() < spec.hollow ? 'hollow' : 'solid';
  }

  // 선마다 꽉 참 / 속 빔. 속 빈 선이 섞이는 단계에서는 둘 다 적어도 하나씩
  static dress(spec, keys) {
    if (!spec.hollow) return Object.fromEntries(keys.map((edge) => [edge, 'solid']));
    for (;;) {
      const styles = Object.fromEntries(keys.map((edge) => [edge, CompareGame.styleOf(spec)]));
      const hollowCount = Object.values(styles).filter((style) => style === 'hollow').length;
      if (hollowCount > 0 && hollowCount < keys.length) return styles;
    }
  }

  static neighbours(edge, keys) {
    const points = CompareGame.endpoints(edge);
    return keys.filter((other) => other !== edge && CompareGame.endpoints(other).some((point) => points.includes(point)));
  }

  // 다름 후보를 모두 만들고, 바꾼 뒤에도 그림이 지켜야 할 것을 지키는 것만 남긴다
  static candidates(spec, styles, kind) {
    const Game = CompareGame;
    const keys = Object.keys(styles);
    const out = [];
    if (kind === 'add') Game.allEdges(spec.grid).filter((edge) => !styles[edge]).forEach((edge) => out.push({ added: edge, style: Game.styleOf(spec), edge }));
    if (kind === 'remove') keys.forEach((edge) => out.push({ removed: edge, edge }));
    if (kind === 'shift') {
      keys.forEach((edge) => {
        const [a, b] = Game.parse(edge);
        for (const [stepX, stepY] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const movedA = [a[0] + stepX, a[1] + stepY];
          const movedB = [b[0] + stepX, b[1] + stepY];
          if ([movedA, movedB].some(([x, y]) => x < 0 || y < 0 || x >= spec.grid || y >= spec.grid)) continue;
          const moved = Game.key(movedA, movedB);
          if (!styles[moved]) out.push({ removed: edge, added: moved, style: styles[edge], edge });
        }
      });
    }
    if (kind === 'style') keys.forEach((edge) => out.push({ restyled: edge, edge }));
    return out.filter((diff) => Game.valid(spec.grid, Object.keys(Game.apply(styles, diff))));
  }

  static apply(styles, diff) {
    const result = { ...styles };
    if (diff.removed) delete result[diff.removed];
    if (diff.added) result[diff.added] = diff.style;
    if (diff.restyled) result[diff.restyled] = styles[diff.restyled] === 'solid' ? 'hollow' : 'solid';
    return result;
  }

  static choose(spec, styles, kind, candidates) {
    const Game = CompareGame;
    const keys = Object.keys(styles);
    const any = (list) => list[Util.randomBelow(list.length)];
    if (kind === 'style') {
      const ends = candidates.filter((diff) => Game.neighbours(diff.edge, keys).some((edge) => styles[edge] !== styles[diff.edge]));
      return ends.length && Math.random() < spec.edge ? any(ends) : any(candidates);
    }
    if (Math.random() < spec.crowd) {
      const score = (diff) => Game.neighbours(diff.edge, diff.added && !diff.removed ? [...keys, diff.added] : keys).length;
      const top = Math.max(...candidates.map(score));
      return any(candidates.filter((diff) => score(diff) === top));
    }
    return any(candidates);
  }

  // 반환: { left, right (그림 = { 선: 'solid' | 'hollow' }), same, kind, diff (바꾼 것: removed · added · style · restyled) }
  static make(spec, same) {
    const Game = CompareGame;
    for (let attempt = 0; attempt < 200; attempt++) {
      const left = Game.dress(spec, Game.geometry(spec));
      if (same) return { left, right: left, same: true };
      for (const kind of Util.shuffle([...spec.changes])) {
        const candidates = Game.candidates(spec, left, kind);
        if (!candidates.length) continue;
        const diff = Game.choose(spec, left, kind, candidates);
        return { left, right: Game.apply(left, diff), same: false, kind, diff };
      }
    }
    // 바꿀 수 있는 그림을 못 만들면 같은 쌍으로 낸다 (시험에서는 일어나지 않았다)
    return Game.make(spec, true);
  }
}
