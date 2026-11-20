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
//   n       — 점 n×n,  lines — 선 수
//   changes — 고를 수 있는 다름. 속 빈 선과 style 은 Lv5 부터
//   hollow  — 선 하나가 속 빈 선일 확률 (0 이면 모두 꽉 찬 선)
//   crowd   — 생김·없어짐·밀림을 선이 붐비는 자리에서 고를 확률 (가장자리에서 바뀌면 윤곽이 달라져 쉽다)
//   edge    — 꽉 참 ↔ 속 빔을 '속 빈 구간의 끝'(다른 모양의 선과 맞닿은 선)에서 고를 확률.
//             그러면 구간이 한 칸 늘거나 줄기만 한다 (구간 한가운데를 바꾸면 줄이 둘로 끊겨 보여 쉽다)
// 미리 보기로 다듬은 값이다 (2026-11-09). 플레이해 보며 고친다.
import { U } from '../config.js';
import { Dg } from '../diagram.js';
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
    { n: 3, lines: 4, changes: ['add', 'remove'], hollow: 0, crowd: 0, edge: 0 },
    { n: 3, lines: 5, changes: ['add', 'remove'], hollow: 0, crowd: 0, edge: 0 },
    { n: 4, lines: 6, changes: COMPARE_GEO, hollow: 0, crowd: 0.2, edge: 0 },
    { n: 4, lines: 8, changes: COMPARE_GEO, hollow: 0, crowd: 0.4, edge: 0 },
    // 속 빈 선이 섞이고, 선 모양이 바뀌는 다름이 더해진다
    { n: 4, lines: 8, changes: [...COMPARE_GEO, 'style'], hollow: 0.4, crowd: 0.4, edge: 0.3 },
    // 점이 촘촘해지고 선이 많아진다 (7×7 까지는 선을 가늘게 그리면 어수선해 보이지 않았다)
    { n: 6, lines: 13, changes: [...COMPARE_GEO, 'style'], hollow: 0.45, crowd: 0.6, edge: 0.5 },
    { n: 6, lines: 20, changes: [...COMPARE_GEO, 'style'], hollow: 0.5, crowd: 0.7, edge: 0.7 },
    { n: 7, lines: 35, changes: [...COMPARE_GEO, 'style'], hollow: 0.5, crowd: 0.8, edge: 0.85 },
  ];
  static maxLevel = CompareGame.levels.length;
  static QUESTIONS = 3;
  static MAX_DEG = 3;
  // 판 (판 단위). 그림 하나는 S×S, 둘 사이는 GAP. 선은 굵기 W, 속 빈 선의 속은 w.
  // 점 사이가 좁은 판(6×6, 7×7)에서는 둘 다 점 사이에 맞춰 줄인다 (CompareGame.widths)
  static S = 300;
  static PAD = 30;
  static GAP = 28;
  static W = 18;
  static w = 8;

  // 소개 그림: ① 두 그림을 비교하고 ② 같아요 / 달라요 고르기
  static diagram() {
    const fig = [[[0, 0], [1, 0]], [[1, 0], [2, 1]], [[2, 1], [2, 2]], [[1, 0], [1, 2]]];
    const card = (x0, lines) => {
      const at = ([x, y]) => [x0 + 10 + x * 27, 15 + y * 27];
      let svg = `<rect class="dg-cmp-card" x="${x0}" y="5" width="74" height="74" rx="8"/>`;
      for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) { const [cx, cy] = at([x, y]); svg += `<circle class="dg-cmp-dot" cx="${cx}" cy="${cy}" r="2"/>`; }
      for (const [a, b] of lines) { const [from, to] = [at(a), at(b)]; svg += `<line class="dg-cmp-ln" x1="${from[0]}" y1="${from[1]}" x2="${to[0]}" y2="${to[1]}"/>`; }
      return svg;
    };
    const step1 = card(10, fig) + card(96, fig.filter((_, i) => i !== 1));
    // 게임의 단추처럼: 같아요 = 초록 바탕 ✓, 달라요 = 빨강 바탕 ✕
    const btn = (x, kind, label, icon) => Dg.rect(x, 26, 78, 44, `dg-cmp-${kind}`) +
      `<path class="dg-cmp-ico ${kind}" d="${icon}" transform="translate(${x + 7} 39) scale(0.75)"/>` + Dg.text(x + 48, 48, label, 14);
    const step2 = btn(8, 'same', '같아요', 'M4 12.5l5 5L20 6.5') + btn(94, 'diff', '달라요', 'M6 6l12 12M18 6L6 18') + Dg.tap(133, 48, 20);
    return [
      { svg: Dg.svg('0 0 180 84', step1), caption: '두 그림을 비교하고' },
      { svg: Dg.svg('0 0 180 84', step2), caption: '같은지 다른지 고르기' },
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
    this.message = U.el('div', 'stage-msg act', '두 그림이 같나요?');
    const { body, dots } = U.frame(stage, `${CompareGame.title} · Lv.${level}`, this.message, CompareGame.QUESTIONS);
    this.body = body;
    this.progress = dots;
    const { S, GAP } = CompareGame;
    this.VW = 2 * S + GAP;
    this.wrap = U.el('div', 'cmp-wrap');
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'cmp-board');
    this.svg.setAttribute('viewBox', `0 0 ${this.VW} ${S}`);
    this.optionRow = U.el('div', 'cmp-opts');
    // 같아요 = 초록 바탕에 ✓, 달라요 = 빨강 바탕에 ✕ (색만으로 가리지 않게 그림이 다르다)
    const icon = { same: 'M4 12.5l5 5L20 6.5', diff: 'M6 6l12 12M18 6L6 18' };
    this.optionButtons = [['same', '같아요'], ['diff', '달라요']].map(([value, label]) => {
      const svg = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon[value]}"/></svg>`;
      const b = U.el('button', `ar-cand cmp-btn ${value}`, `${svg}${label}`);
      b.disabled = true;
      b.addEventListener('pointerdown', () => this.pick(value));
      this.optionRow.append(b);
      return { v: value, b };
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
    const ar = this.VW / CompareGame.S;
    const optH = this.optionRow.offsetHeight || 104;
    const width = Math.max(280, Math.min(body.clientWidth - 40, (body.clientHeight - optH - U.gapOf(this.wrap, 22) - 18) * ar, 760));
    this.svg.style.width = `${width}px`;
    this.svg.style.height = `${width / ar}px`;
  }

  ask() {
    const puzzle = CompareGame.make(this.spec, Math.random() < 0.5);
    this.puzzle = puzzle;
    this.svg.innerHTML = CompareGame.card(this.spec.n, puzzle.left, 0) + CompareGame.card(this.spec.n, puzzle.right, CompareGame.S + CompareGame.GAP);
    this.optionButtons.forEach(({ b }) => {
      b.disabled = false;
      b.classList.remove('right', 'wrong', 'answer');
    });
    U.say(this.message, '두 그림이 같나요?', 'act');
    Progress.current(this.progress, this.answered);
    this.phase = Phase.INPUT;
    this.host.sfx(Sfx.BLINK);
    const line = (k, st) => [...CompareGame.parse(k).flat(), st === 'hollow' ? 'h' : 's'];
    const { diff } = puzzle;
    this.host.question({
      n: this.answered + 1, grid: this.spec.n, same: puzzle.same,
      left: Object.entries(puzzle.left).map(([k, st]) => line(k, st)),
      change: puzzle.same ? null : {
        kind: puzzle.kind,
        removed: diff.removed ? CompareGame.parse(diff.removed).flat() : null,
        added: diff.added ? line(diff.added, diff.st) : null,
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
    const ans = puzzle.same ? 'same' : 'diff';
    const ok = value === ans;
    this.host.answer({ picked: value, correct: ok, timedOut: value === null });
    this.optionButtons.forEach(({ v: bv, b }) => {
      b.disabled = true;
      if (bv === ans) b.classList.add(ok ? 'right' : 'answer');
      else if (bv === value) b.classList.add('wrong');
    });
    // 다른 쌍이면 맞혔든 틀렸든 다른 곳을 보여 준다. 같은 쌍을 틀리면 두 그림에 초록 테두리
    if (!puzzle.same) this.markChange();
    else if (!ok) this.svg.querySelectorAll('.cmp-card').forEach((el) => el.classList.add('same'));
    if (ok) {
      this.correct++;
      U.say(this.message, '정답!', 'good');
      this.host.award(pointsPer(this.host, CompareGame.QUESTIONS), this.optionButtons.find((x) => x.v === ans).b);
      this.host.sfx(Sfx.GOOD);
    } else {
      const why = puzzle.same ? '두 그림은 똑같아요' : '여기가 달라요';
      U.say(this.message, value === null ? `시간 초과 · ${why}` : why, 'bad');
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
    const { S, GAP } = CompareGame;
    const leftMarks = [];
    const rightMarks = [];
    if (diff.restyled) { leftMarks.push([diff.restyled]); rightMarks.push([diff.restyled]); }
    if (diff.removed) { leftMarks.push([diff.removed]); rightMarks.push([diff.removed, true]); }
    if (diff.added) { leftMarks.push([diff.added, true]); rightMarks.push([diff.added]); }
    const n = this.spec.n;
    const marks = (list, x0) => list.map(([k, miss]) => CompareGame.markLine(n, k, x0, miss)).join('');
    this.svg.querySelector('[data-side="0"] .cmp-marks').innerHTML = marks(leftMarks, 0);
    this.svg.querySelector('[data-side="1"] .cmp-marks').innerHTML = marks(rightMarks, S + GAP);
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
  // 선 굵기와 속 굵기. 5×5 까지는 W·w 그대로, 그보다 촘촘하면 점 사이의 LINE_K 배로 (속도 같은 비율로)
  static LINE_K = 0.3;
  static widths(n) {
    const { S, PAD, W, w: innerW, LINE_K } = CompareGame;
    const lw = Math.min(W, ((S - 2 * PAD) / (n - 1)) * LINE_K);
    return { lw, iw: (lw * innerW) / W };
  }

  static at(n, [x, y], x0) {
    const { S, PAD } = CompareGame;
    const step = (S - 2 * PAD) / (n - 1);
    return [x0 + PAD + x * step, PAD + y * step];
  }

  // 그림 하나 (styles = { 선: 'solid' | 'hollow' }). 모든 선을 굵게 그린 뒤 속 빈 선만 그 위에 밝은 속을 그린다.
  // 속의 끝: 꽉 찬 선이 닿는 점이면 W/2 만큼 덜 그려 평평하게 (꽉 찬 선을 파먹지 않게),
  // 그 밖(속 빈 선끼리 만나거나 끝이 비어 있는 점)이면 점까지 둥글게 그려 속끼리 이어지거나 둥근 테두리로 닫힌다
  static card(n, styles, x0) {
    const { S, parse, pts } = CompareGame;
    const { lw: W, iw: innerW } = CompareGame.widths(n);
    const at = (point) => CompareGame.at(n, point, x0);
    const keys = Object.keys(styles);
    const solidAt = new Set(keys.filter((k) => styles[k] === 'solid').flatMap(pts));
    let svg = `<g data-side="${x0 ? 1 : 0}"><rect class="cmp-card" x="${x0 + 1}" y="1" width="${S - 2}" height="${S - 2}" rx="14"/>`;
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) { const [cx, cy] = at([x, y]); svg += `<circle class="cmp-dot" cx="${cx}" cy="${cy}" r="3.5"/>`; }
    svg += '<g class="cmp-marks"></g>';
    for (const k of keys) {
      const [a, b] = parse(k).map(at);
      svg += `<line class="cmp-ln" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke-width="${W}"/>`;
    }
    for (const k of keys.filter((x) => styles[x] === 'hollow')) {
      const [pa, pb] = parse(k);
      let [a, b] = [at(pa), at(pb)];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ux = (b[0] - a[0]) / len;
      const uy = (b[1] - a[1]) / len;
      const cutA = solidAt.has(String(pa));
      const cutB = solidAt.has(String(pb));
      if (cutA) a = [a[0] + (ux * W) / 2, a[1] + (uy * W) / 2];
      if (cutB) b = [b[0] - (ux * W) / 2, b[1] - (uy * W) / 2];
      svg += `<line class="cmp-in" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke-width="${innerW}"/>`;
      if (!cutA) svg += `<circle class="cmp-in-cap" cx="${a[0]}" cy="${a[1]}" r="${innerW / 2}"/>`;
      if (!cutB) svg += `<circle class="cmp-in-cap" cx="${b[0]}" cy="${b[1]}" r="${innerW / 2}"/>`;
    }
    return svg + '</g>';
  }

  static markLine(n, k, x0, miss) {
    const [a, b] = CompareGame.parse(k).map((point) => CompareGame.at(n, point, x0));
    const { lw } = CompareGame.widths(n);
    return `<line class="cmp-mark${miss ? ' miss' : ''}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke-width="${miss ? 6 : lw + 16}"/>`;
  }

  // ---- 그림 만들기 ----
  // 선 = 이웃한 두 점. 점은 [x, y]. 키는 "x1,y1-x2,y2" (작은 쪽 먼저)
  static key(a, b) {
    const [lo, hi] = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? [a, b] : [b, a];
    return `${lo}-${hi}`;
  }

  static parse(k) {
    return k.split('-').map((part) => part.split(',').map(Number));
  }

  static pts(k) {
    return CompareGame.parse(k).map(String);
  }

  static allEdges(n) {
    const { key } = CompareGame;
    const out = [];
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) {
        if (x + 1 < n) out.push(key([x, y], [x + 1, y]));
        if (y + 1 < n) out.push(key([x, y], [x, y + 1]));
        if (x + 1 < n && y + 1 < n) out.push(key([x, y], [x + 1, y + 1]), key([x + 1, y], [x, y + 1]));
      }
    }
    return out;
  }

  // 같은 칸의 다른 대각선 (가로·세로 선이면 null)
  static crossOf(k) {
    const [a, b] = CompareGame.parse(k);
    if (a[0] === b[0] || a[1] === b[1]) return null;
    return CompareGame.key([a[0], b[1]], [b[0], a[1]]);
  }

  static degree(keys) {
    const counts = {};
    keys.forEach((k) => CompareGame.pts(k).forEach((point) => (counts[point] = (counts[point] || 0) + 1)));
    return counts;
  }

  static pieces(keys) {
    const adj = {};
    for (const edge of keys) {
      const [a, b] = CompareGame.pts(edge);
      (adj[a] ||= []).push(b);
      (adj[b] ||= []).push(a);
    }
    const seen = new Set();
    let count = 0;
    for (const start of Object.keys(adj)) {
      if (seen.has(start)) continue;
      count++;
      const stack = [start];
      while (stack.length) {
        const point = stack.pop();
        if (seen.has(point)) continue;
        seen.add(point);
        stack.push(...adj[point]);
      }
    }
    return count;
  }

  // 그림이 지켜야 할 것: 한 덩어리 · 점의 모든 줄과 칸을 씀 · 한 점에 MAX_DEG 개까지 · 엇갈리는 대각선 없음
  static valid(n, keys) {
    const Game = CompareGame;
    if (!keys.length || Game.pieces(keys) !== 1) return false;
    const used = keys.flatMap(Game.parse);
    if (new Set(used.map((point) => point[0])).size < n || new Set(used.map((point) => point[1])).size < n) return false;
    if (Math.max(...Object.values(Game.degree(keys))) > Game.MAX_DEG) return false;
    const set = new Set(keys);
    return keys.every((k) => !set.has(Game.crossOf(k)));
  }

  // 선의 자리: 선 하나에서 시작해 맞닿는 선을 하나씩 붙인다. 반은 아직 안 쓴 줄·칸으로 뻗는 선을 골라 판 전체로 퍼지게 한다
  static geometry(spec) {
    const Game = CompareGame;
    const all = Game.allEdges(spec.n);
    for (let t = 0; t < 3000; t++) {
      const set = new Set([all[U.rand(all.length)]]);
      while (set.size < spec.lines) {
        const used = new Set([...set].flatMap(Game.pts));
        const deg = Game.degree([...set]);
        const cand = all.filter((edge) => !set.has(edge) && !set.has(Game.crossOf(edge)) &&
          Game.pts(edge).some((point) => used.has(point)) && Game.pts(edge).every((point) => (deg[point] || 0) < Game.MAX_DEG));
        if (!cand.length) break;
        const xs = new Set([...used].map((point) => point.split(',')[0]));
        const ys = new Set([...used].map((point) => point.split(',')[1]));
        const out = cand.filter((edge) => Game.parse(edge).some(([x, y]) => !xs.has(String(x)) || !ys.has(String(y))));
        const from = out.length && Math.random() < 0.5 ? out : cand;
        set.add(from[U.rand(from.length)]);
      }
      if (set.size === spec.lines && Game.valid(spec.n, [...set])) return [...set];
    }
    // 시험에서는 일어나지 않았다. 혹시 못 만들면 선 하나 적게
    return Game.geometry({ ...spec, lines: spec.lines - 1 });
  }

  static styleOf(spec) {
    return Math.random() < spec.hollow ? 'hollow' : 'solid';
  }

  // 선마다 꽉 참 / 속 빔. 속 빈 선이 섞이는 단계에서는 둘 다 적어도 하나씩
  static dress(spec, keys) {
    if (!spec.hollow) return Object.fromEntries(keys.map((k) => [k, 'solid']));
    for (;;) {
      const styles = Object.fromEntries(keys.map((k) => [k, CompareGame.styleOf(spec)]));
      const hollowCount = Object.values(styles).filter((style) => style === 'hollow').length;
      if (hollowCount > 0 && hollowCount < keys.length) return styles;
    }
  }

  static neighbours(k, keys) {
    const points = CompareGame.pts(k);
    return keys.filter((edge) => edge !== k && CompareGame.pts(edge).some((point) => points.includes(point)));
  }

  // 다름 후보를 모두 만들고, 바꾼 뒤에도 그림이 지켜야 할 것을 지키는 것만 남긴다
  static candidates(spec, styles, kind) {
    const Game = CompareGame;
    const keys = Object.keys(styles);
    const out = [];
    if (kind === 'add') Game.allEdges(spec.n).filter((edge) => !styles[edge]).forEach((edge) => out.push({ added: edge, st: Game.styleOf(spec), at: edge }));
    if (kind === 'remove') keys.forEach((edge) => out.push({ removed: edge, at: edge }));
    if (kind === 'shift') {
      keys.forEach((edge) => {
        const [a, b] = Game.parse(edge);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a2 = [a[0] + dx, a[1] + dy];
          const b2 = [b[0] + dx, b[1] + dy];
          if ([a2, b2].some(([x, y]) => x < 0 || y < 0 || x >= spec.n || y >= spec.n)) continue;
          const moved = Game.key(a2, b2);
          if (!styles[moved]) out.push({ removed: edge, added: moved, st: styles[edge], at: edge });
        }
      });
    }
    if (kind === 'style') keys.forEach((edge) => out.push({ restyled: edge, at: edge }));
    return out.filter((diff) => Game.valid(spec.n, Object.keys(Game.apply(styles, diff))));
  }

  static apply(styles, diff) {
    const result = { ...styles };
    if (diff.removed) delete result[diff.removed];
    if (diff.added) result[diff.added] = diff.st;
    if (diff.restyled) result[diff.restyled] = styles[diff.restyled] === 'solid' ? 'hollow' : 'solid';
    return result;
  }

  static choose(spec, styles, kind, cands) {
    const Game = CompareGame;
    const keys = Object.keys(styles);
    const any = (list) => list[U.rand(list.length)];
    if (kind === 'style') {
      const ends = cands.filter((diff) => Game.neighbours(diff.at, keys).some((edge) => styles[edge] !== styles[diff.at]));
      return ends.length && Math.random() < spec.edge ? any(ends) : any(cands);
    }
    if (Math.random() < spec.crowd) {
      const score = (diff) => Game.neighbours(diff.at, diff.added && !diff.removed ? [...keys, diff.added] : keys).length;
      const top = Math.max(...cands.map(score));
      return any(cands.filter((diff) => score(diff) === top));
    }
    return any(cands);
  }

  // 반환: { left, right (그림 = { 선: 'solid' | 'hollow' }), same, kind, diff (바꾼 것: removed · added · st · restyled) }
  static make(spec, same) {
    const Game = CompareGame;
    for (let t = 0; t < 200; t++) {
      const left = Game.dress(spec, Game.geometry(spec));
      if (same) return { left, right: left, same: true };
      for (const kind of U.shuffle([...spec.changes])) {
        const cands = Game.candidates(spec, left, kind);
        if (!cands.length) continue;
        const diff = Game.choose(spec, left, kind, cands);
        return { left, right: Game.apply(left, diff), same: false, kind, diff };
      }
    }
    // 바꿀 수 있는 그림을 못 만들면 같은 쌍으로 낸다 (시험에서는 일어나지 않았다)
    return Game.make(spec, true);
  }
}
