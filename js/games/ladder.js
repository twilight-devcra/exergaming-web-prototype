// 사다리 타기
// 사다리 위의 출발점마다 모양 조각(peg)이 하나씩 있고, 아래 끝 몇 곳에는 모양 구멍이 있다.
// 사다리를 타고 내려가 같은 모양의 구멍에 쏙 들어가는 조각을 고른다. 그런 조각은 하나뿐이다. 판 하나에 문제 3개.
// 설명 없이도 통하도록:
//   - 사다리타기는 누구나 안다. '네모 조각은 동그라미 구멍에 안 들어간다'도 누구나 안다.
//   - 고른 조각이 길을 따라 미끄러져 내려가고(뒤로 길이 그려진다), 맞으면 구멍에 쏙 들어가고 길이 초록이 된다.
//     틀리면 바닥이나 다른 구멍에 걸려 튕기고 길이 빨강이 된다. 고른 길만 그린다.
// 외울 것이 없다. 눈으로 줄을 따라가다 속도 띠를 보고 와도 가로줄 하나 단위로 다시 찾아 이어 갈 수 있다.
//
// 가로줄은 양 끝의 높이를 따로 가진 선분이다. 길은 그려진 그대로 따라간다: 세로줄을 내려가다 처음 만나는 가로줄 끝에서
// 그 가로줄을 타고 반대쪽 끝으로 건너가(비스듬하면 올라갈 수도 있다) 거기서부터 다시 내려간다.
// 가로줄은 칸(row) 단위로 놓는다. 보통의 사다리타기처럼 한 칸에서 한 세로줄에 양쪽으로 붙지 않는다 (갈림길이 생기지 않는다).
// 그리고 양 끝 높이를 칸 안에서 흔든다 (slant). 칸 안에서만 흔들면 같은 세로줄에서 가로줄 끝의 순서가 칸 순서 그대로라
// 비스듬해 보여도 평평한 사다리와 길이 같다 — 겉모습만 다르다.
// 그래서 높은 단계에는 '속임 가로줄'(tricks)을 둔다: 가로줄 한쪽 끝을 이웃 칸까지 기울여, 같은 세로줄에 붙은 옆 칸 가로줄의 끝을 넘어가게 한다.
// 그러면 그 세로줄에서 두 가로줄을 만나는 순서가 바뀐다. 가로줄을 평평하게(가운데 높이로) 읽으면 길이 달라진다.
// 정답 길은 평평하게 읽었을 때와 실제가 반드시 다르고, 되도록 평평하게 읽으면 다른 조각이 맞는 것처럼 보이게 만든다 (generate 참고).
// 속임 가로줄만 기울어 있으면 '기운 줄 = 속임수' 가 되므로 다른 가로줄도 칸 안에서 기울여 섞는다.
//
// 구멍마다 거꾸로 한 줄씩 따라 올라가 그 위의 조각 모양을 보면 답이 나온다. 그래서 어려움은 구멍 수로 올린다.
// 눈으로만 걸러 낼 수 없도록, 구멍 모양마다 그 구멍에 닿지 않는 같은 모양 조각이 적어도 하나 있다.
// 1단계는 조각이 모두 같고 구멍이 하나뿐이라 '★ 에 닿는 곳 찾기'와 같다. 2단계에서 다른 모양 조각이 섞이고, 3단계부터 구멍이 늘어난다.
// 난이도:
//   lanes    — 세로줄 수 = 보기 수
//   rows     — 가로줄을 놓을 수 있는 칸 수
//   p        — 칸마다 가로줄을 놓을 확률
//   minCross — 정답 길이 지나는 가로줄의 최소 수
//   holes    — 구멍 수 (따라 올라가 봐야 하는 길 수)
//   kinds    — 조각 모양 수
//   slant    — 가로줄 끝 높이의 칸 안 흔들림 (칸 높이 비율). 0 이면 양 끝이 같이 움직여 평평하다
//   tricks   — 속임 가로줄 수
const LADDER_PEGS = [
  // 색만으로 구분하지 않도록 색마다 모양이 다르다 (색약 대응). 모두 (0, 0) 을 가운데로 그린다
  { id: 'circle', fill: '#e5484d', svg: '<circle r="21"/>' },
  { id: 'square', fill: '#2f6fed', svg: '<rect x="-19" y="-19" width="38" height="38" rx="4"/>' },
  { id: 'triangle', fill: '#1f9d55', svg: '<polygon points="0,-23 23,17 -23,17"/>' },
  { id: 'diamond', fill: '#e09b00', svg: '<polygon points="0,-24 24,0 0,24 -24,0"/>' },
  { id: 'plus', fill: '#8e4ec6', svg: '<path d="M-8 -22h16v14h14v16h-14v14h-16v-14h-14v-16h14z"/>' },
];

class LadderGame {
  static id = 'ladder';
  static title = '사다리 타기';
  static hint = '사다리를 타고 내려가 같은 모양 구멍에<br>쏙 들어가는 조각을 위에서 고르세요';
  static levels = [
    { lanes: 3, rows: 5, p: 0.45, minCross: 2, holes: 1, kinds: 1, slant: 0, tricks: 0 },
    { lanes: 4, rows: 6, p: 0.45, minCross: 3, holes: 1, kinds: 2, slant: 0, tricks: 0 },
    { lanes: 4, rows: 7, p: 0.5, minCross: 3, holes: 2, kinds: 2, slant: 0.3, tricks: 1 },
    { lanes: 5, rows: 8, p: 0.5, minCross: 4, holes: 2, kinds: 3, slant: 0.35, tricks: 2 },
    { lanes: 5, rows: 9, p: 0.5, minCross: 4, holes: 3, kinds: 3, slant: 0.35, tricks: 3 },
    { lanes: 6, rows: 10, p: 0.55, minCross: 5, holes: 4, kinds: 4, slant: 0.35, tricks: 4 },
  ];
  static maxLevel = LadderGame.levels.length;
  static ROUNDS = 3;
  static TRIES = 400;
  // SVG 단위. 세로줄 간격 S, 사다리 높이 LH, 위(조각)·아래(구멍) 여백
  static S = 100;
  static PAD = 55;
  static LH = 380;
  static TOP = 80;
  static BOT = 70;
  static JITTER = 0.28;     // 평평한 단계의 칸 안 흔들림 (양 끝이 같이 움직인다)
  // 한 세로줄 위 가로줄 끝끼리의 최소 거리 (SVG 단위, 가로형 태블릿에서 약 15px). 어느 가로줄을 먼저 만나는지 헷갈리는 것은
  // 이 게임의 어려움이 아니다 — 가로줄 끝은 늘 이만큼 떨어져 있다. 칸 안 흔들림도 이 거리를 넘지 않게 줄인다 (generate)
  static GAP = 16;
  static TRICK = [0, 0.2];  // 속임 가로줄 끝이 옆 가로줄 끝을 넘어가는 거리 = GAP + 이 범위 (칸 높이 비율)
  static DRAW_MS = 800;     // css .lad-trace 의 transition 과 같게

  constructor(host) {
    this.h = host;
    this.spec = LadderGame.levels[host.level - 1];
    this.round = 0;
    this.correct = 0;
    this.phase = 'wait';
  }

  start() {
    const { stage, level } = this.h;
    stage.append(U.el('div', 'stage-title', `${LadderGame.title} · Lv.${level}`));
    this.msg = U.el('div', 'stage-msg', '');
    this.wrap = U.el('div', 'lad-wrap');
    this.progress = U.el('div', 'dots');
    for (let i = 0; i < LadderGame.ROUNDS; i++) this.progress.append(U.el('span'));
    this.board = U.el('div', 'lad-board');
    this.wrap.append(this.progress, this.board);
    stage.append(this.msg, this.wrap);
    this.next();
  }

  next() {
    const p = LadderGame.generate(this.spec);
    this.p = p;
    this.msg.textContent = '같은 모양 구멍에 들어가는 것은?';
    this.msg.className = 'stage-msg';
    [...this.progress.children].forEach((d, i) => d.classList.toggle('cur', i === this.round));
    this.render();
    this.phase = 'input';
    const r3 = (v) => Math.round(v * 1000) / 1000;
    this.h.question({
      lanes: p.lanes,
      rungs: p.rungs.map((g) => [g.i, r3(g.yl), r3(g.yr), g.trick ? 1 : 0]),
      pegs: p.pegs.map((k) => LADDER_PEGS[k].id),
      holes: p.holes.map((k) => (k == null ? null : LADDER_PEGS[k].id)),
      answer: p.answer,
      cross: p.ends[p.answer].cross,
      load: p.load,
      flatEnd: p.flatEnds[p.answer].end, // 가로줄을 평평하게 읽었을 때 정답 조각이 닿는 곳
      trap: p.trap,                      // 평평하게 읽으면 맞는 것처럼 보이는 조각 (없으면 -1)
    });
    this.h.timer(p.load, () => this.pick(-1));
  }

  // ---- 그리기 ----
  x(i) { return LadderGame.PAD + i * LadderGame.S; }
  // 가로줄 g 의 한쪽 끝 높이. side 0 = 왼쪽 세로줄(g.i), 1 = 오른쪽(g.i + 1). yl, yr 은 사다리 높이에 대한 비율
  y(g, side) { return LadderGame.TOP + (side ? g.yr : g.yl) * LadderGame.LH; }
  get topY() { return LadderGame.TOP - 40; }
  get botY() { return LadderGame.TOP + LadderGame.LH + 42; }

  render() {
    const { lanes, rungs, pegs, holes } = this.p;
    const { S, PAD, LH, TOP, BOT } = LadderGame;
    const W = PAD * 2 + (lanes - 1) * S;
    const H = TOP + LH + BOT;
    const bottom = TOP + LH;
    let svg = `<svg class="lad-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">`;
    for (let i = 0; i < lanes; i++) svg += `<line class="lad-rail" x1="${this.x(i)}" y1="${TOP - 18}" x2="${this.x(i)}" y2="${bottom + 18}"/>`;
    for (const g of rungs) {
      svg += `<line class="lad-rung" x1="${this.x(g.i)}" y1="${this.y(g, 0).toFixed(1)}" x2="${this.x(g.i + 1)}" y2="${this.y(g, 1).toFixed(1)}"/>`;
    }
    // 구멍: 조각과 같은 모양을 조금 크게, 어두운 속과 그 모양의 색 테두리로 그린다.
    // 자리는 감싼 g 로 옮긴다 (css 애니메이션을 받는 안쪽 요소에 transform 속성이 있으면 서로 부딪친다)
    for (let i = 0; i < lanes; i++) {
      const k = holes[i];
      svg += k == null
        ? `<g transform="translate(${this.x(i)} ${this.botY})"><circle class="lad-floor lad-end" r="8"/></g>`
        : `<g transform="translate(${this.x(i)} ${this.botY}) scale(1.18)">`
          + `<g class="lad-floor lad-hole" stroke="${LADDER_PEGS[k].fill}">${LADDER_PEGS[k].svg}</g></g>`;
    }
    svg += '<g class="lad-traces"></g>';
    // 출발점: 조각보다 넓게 세로줄 한 칸 폭을 눌러도 되게 한다. 조각은 고르면 길을 따라 내려가므로 따로 둔다
    for (let i = 0; i < lanes; i++) {
      svg += `<g class="lad-start"><rect x="${this.x(i) - S / 2}" y="0" width="${S}" height="${TOP}"/>`
        + `<circle class="lad-halo" cx="${this.x(i)}" cy="${this.topY}" r="31"/></g>`;
    }
    for (let i = 0; i < lanes; i++) {
      const k = pegs[i];
      svg += `<g class="lad-peg-pos" transform="translate(${this.x(i)} ${this.topY})">`
        + `<g class="lad-peg" fill="${LADDER_PEGS[k].fill}">${LADDER_PEGS[k].svg}</g></g>`;
    }
    svg += '</svg>';
    this.board.innerHTML = svg;
    this.traces = this.board.querySelector('.lad-traces');
    this.startEls = [...this.board.querySelectorAll('.lad-start')];
    this.pegEls = [...this.board.querySelectorAll('.lad-peg-pos')];
    this.floorEls = [...this.board.querySelectorAll('.lad-floor')];
    this.startEls.forEach((el, i) => el.addEventListener('pointerdown', () => this.pick(i)));
  }

  // 출발점 s 에서 내려가는 길 (SVG 좌표의 꺾은선)
  points(s) {
    const { rungs, lanes } = this.p;
    const pts = [[this.x(s), this.topY]];
    const t = LadderGame.trace(rungs, lanes, s);
    for (const [k, from] of t.steps) {
      const g = rungs[k];
      pts.push([this.x(g.i + from), this.y(g, from)], [this.x(g.i + 1 - from), this.y(g, 1 - from)]);
    }
    pts.push([this.x(t.end), this.botY]);
    return pts;
  }

  // 길을 위에서부터 그려 내려간다 (pathLength 1 기준의 dashoffset 을 1 → 0)
  draw(pts) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    el.setAttribute('points', pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '));
    el.setAttribute('pathLength', '1');
    el.setAttribute('class', 'lad-trace');
    this.traces.append(el);
    el.getBoundingClientRect();
    el.classList.add('go');
    return el;
  }

  // 조각을 길을 따라 같은 빠르기로 옮긴다. 길이 그려지는 속도(선형)와 같아서 조각이 선을 끌고 내려가는 것처럼 보인다
  slide(el, pts) {
    const seg = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
    const total = seg.reduce((a, b) => a + b, 0);
    const t0 = performance.now();
    const step = (now) => {
      let d = U.clamp((now - t0) / LadderGame.DRAW_MS, 0, 1) * total;
      let i = 0;
      while (i < seg.length - 1 && d > seg[i]) d -= seg[i++];
      const f = seg[i] ? Math.min(1, d / seg[i]) : 1;
      const x = U.lerp(pts[i][0], pts[i + 1][0], f);
      const y = U.lerp(pts[i][1], pts[i + 1][1], f);
      el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      if (now - t0 < LadderGame.DRAW_MS && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // i = 고른 출발점. -1 이면 시간이 다 된 것 (아무것도 내려보내지 않는다)
  pick(i) {
    if (this.phase !== 'input') return;
    this.phase = 'wait';
    this.h.stopTimer();
    const { answer, ends } = this.p;
    const ok = i === answer;
    this.h.answer({ picked: i >= 0 ? i : null, end: i >= 0 ? ends[i].end : null, correct: ok, timedOut: i < 0 });

    this.startEls.forEach((el) => el.classList.add('done'));
    const start = this.startEls[i];
    let trace = null;
    if (start) {
      const pts = this.points(i);
      trace = this.draw(pts);
      this.slide(this.pegEls[i], pts);
      this.h.sfx('tap');
    }

    // 조각이 다 내려온 뒤에 맞고 틀림을 알린다
    this.h.after(start ? LadderGame.DRAW_MS : 0, () => {
      if (start) {
        trace.classList.add(ok ? 'right' : 'wrong');
        this.pegEls[i].firstChild.classList.add(ok ? 'seated' : 'bump');
        this.floorEls[ends[i].end].classList.add(ok ? 'fit' : 'miss');
      }
      const d = this.progress.children[this.round];
      d.classList.remove('cur');
      d.classList.add(ok ? 'right' : 'wrong');
      if (ok) {
        this.correct++;
        this.msg.textContent = '정답!';
        this.msg.className = 'stage-msg good';
        this.h.award((this.h.base * this.h.mult) / LadderGame.ROUNDS, this.floorEls[ends[i].end]);
        this.h.sfx('good');
      } else {
        this.msg.textContent = start ? '맞는 구멍이 아니에요' : '시간 초과';
        this.msg.className = 'stage-msg bad';
        this.h.sfx('bad');
      }
      this.h.after(ok ? 600 : 1000, () => this.advance());
    });
  }

  advance() {
    this.round++;
    if (this.round < LadderGame.ROUNDS) this.next();
    else this.h.done(this.result());
  }

  result() {
    return { cleared: this.correct === LadderGame.ROUNDS, correct: this.correct, total: LadderGame.ROUNDS };
  }

  // 점수는 맞힐 때마다 바로 지급하므로 중단될 때 따로 줄 것이 없다
  abort() {
    return { cleared: false, correct: this.correct, total: this.round };
  }

  // ---- 길 따라가기 ----
  // 그려진 그대로 따라간다. flat 이면 가로줄마다 양 끝을 가운데 높이로 펴서 따라간다 (평평하게 잘못 읽은 경우).
  // 반환: { end, cross(지난 가로줄 수), steps: [[가로줄 번호, 들어간 쪽(0 왼쪽 · 1 오른쪽)], ...] }. 같은 가로줄을 두 번 타면(맴돌면) null
  static trace(rungs, lanes, s, flat = false) {
    const at = Array.from({ length: lanes }, () => []); // 세로줄마다 [높이, 가로줄 번호, 쪽]
    rungs.forEach((g, k) => {
      const yl = flat ? (g.yl + g.yr) / 2 : g.yl;
      const yr = flat ? yl : g.yr;
      at[g.i].push([yl, k, 0]);
      at[g.i + 1].push([yr, k, 1]);
    });
    at.forEach((list) => list.sort((a, b) => a[0] - b[0]));
    let lane = s;
    let y = -Infinity;
    const used = new Set();
    const steps = [];
    for (;;) {
      const e = at[lane].find((q) => q[0] > y);
      if (!e) break;
      const [, k, side] = e;
      if (used.has(k)) return null;
      used.add(k);
      steps.push([k, side]);
      const other = at[lane + (side ? -1 : 1)].find((q) => q[1] === k);
      lane += side ? -1 : 1;
      y = other[0];
    }
    return { end: lane, cross: steps.length, steps };
  }

  // ---- 문제 생성 ----
  // 1) 칸마다 세로줄 사이를 섞은 순서로 보며 p 의 확률로 가로줄을 놓는다 (이웃한 자리에 이미 있으면 건너뛴다).
  //    세로줄 사이마다 가로줄이 적어도 하나는 있어야 한다. 양 끝 높이를 칸 안에서 흔든다.
  // 2) 속임 가로줄을 tricks 개 만든다 (makeTricks).
  // 3) 길을 따라가 보고(맴돌거나 두 길이 한 곳에 닿으면 버린다), 아래 끝 holes 곳에 서로 다른 모양의 구멍을 뚫고,
  //    그중 하나(정답 구멍)에 닿는 출발점에 같은 모양 조각을 둔다. 다른 구멍에 닿는 출발점에는 그 구멍과 다른 모양을,
  //    구멍 없는 곳에 닿는 출발점에는 아무 모양이나 둔다. 그래서 답은 하나다.
  //    평평하게 읽었을 때 맞는 것처럼 보이는 조각(trap)이 정답이 아닌 것으로 하나 있으면 그것으로 둔다.
  // 4) 다음을 모두 맞춰야 쓴다 (못 찾으면 가장 가까운 것):
  //    - 정답 모양 조각이 둘 이상 (조각 모양만 보고 고를 수 없게)
  //    - 다른 구멍마다 그 모양 조각이 적어도 하나 (구멍을 따라가 보지도 않고 지울 수 없게)
  //    - 쓰는 모양이 kinds 개 모두 나온다
  //    - 정답이 정답 구멍 바로 위가 아니다 ('그냥 아래로 내려가겠지' 하는 짐작이 맞지 않게)
  //    - 정답 길이 minCross 개 이상의 가로줄을 지난다
  //    - 속임 가로줄이 있는 단계: 속임 가로줄을 tricks 개 다 만들었고, 정답 길이 평평하게 읽을 때와 다르고, trap 이 있다
  // 반환: lanes, rungs = [{ i(왼쪽 세로줄), yl, yr(양 끝 높이, 사다리 높이 비율), trick }],
  //       pegs = 출발점마다 모양 번호(LADDER_PEGS), holes = 아래 끝마다 모양 번호 또는 null, answer,
  //       ends / flatEnds = 출발점마다 { end, cross } (실제 / 평평하게 읽었을 때), trap,
  //       load = 구멍에 닿는 길들의 가로줄 수 합 (따라 올라가 볼 일의 양)
  static generate({ lanes, rows, p, minCross, holes: nHoles, kinds, slant, tricks }) {
    let best = null;
    const unit = 1 / (rows + 1); // 칸 높이
    const gap = LadderGame.GAP / LadderGame.LH;
    for (let tries = 0; tries < LadderGame.TRIES; tries++) {
      const has = Array.from({ length: rows }, () => new Array(lanes - 1).fill(false));
      for (let r = 0; r < rows; r++) {
        for (const i of U.shuffle([...Array(lanes - 1).keys()])) {
          if (has[r][i - 1] || has[r][i + 1]) continue;
          if (Math.random() < p) has[r][i] = true;
        }
      }
      if (![...Array(lanes - 1).keys()].every((i) => has.some((row) => row[i]))) continue;

      // 이웃한 칸의 가로줄 끝이 한 세로줄에서 GAP 보다 가까워지지 않도록 흔들림을 (칸 높이 − GAP) / 2 로 묶는다
      const amp = Math.min((slant || LadderGame.JITTER) * unit, (unit - gap) / 2);
      const jit = () => (Math.random() * 2 - 1) * amp;
      const rungs = [];
      has.forEach((row, r) => row.forEach((on, i) => {
        if (!on) return;
        const base = (r + 1) * unit;
        const yl = base + jit();
        rungs.push({ r, i, yl, yr: slant ? base + jit() : yl, trick: false });
      }));
      const made = tricks ? LadderGame.makeTricks(rungs, lanes, tricks, unit) : 0;
      if (!LadderGame.spaced(rungs, lanes, unit)) continue;

      const ends = Array.from({ length: lanes }, (_, s) => LadderGame.trace(rungs, lanes, s));
      const flatEnds = Array.from({ length: lanes }, (_, s) => LadderGame.trace(rungs, lanes, s, true));
      if (ends.includes(null) || flatEnds.includes(null)) continue;
      if (new Set(ends.map((e) => e.end)).size !== lanes) continue;
      const from = [];
      ends.forEach((e, s) => (from[e.end] = s));

      const kindIds = U.shuffle([...LADDER_PEGS.keys()]).slice(0, kinds);
      const holeLanes = U.shuffle([...Array(lanes).keys()]).slice(0, nHoles);
      const holes = new Array(lanes).fill(null);
      U.shuffle([...kindIds]).slice(0, nHoles).forEach((k, j) => (holes[holeLanes[j]] = k));
      const goal = holeLanes[0];
      const answer = from[goal];
      const pegs = ends.map((e, s) => {
        if (s === answer) return holes[goal];
        const others = kindIds.filter((k) => k !== holes[e.end]);
        return others[U.rand(others.length)];
      });
      // 평평하게 읽으면 구멍에 맞아 보이는 조각: 그 구멍 모양을 줄 수 있는 출발점(실제로는 다른 구멍에 닿지 않는 곳)이면 그 모양으로 바꾼다
      let trap = -1;
      if (tricks) {
        for (const s of U.shuffle([...Array(lanes).keys()])) {
          const k = holes[flatEnds[s].end];
          if (s === answer || k == null) continue;
          const real = holes[ends[s].end];
          if (real != null && real === k) continue;
          pegs[s] = k;
          trap = s;
          break;
        }
      }

      const count = (k) => pegs.filter((x) => x === k).length;
      const miss = (count(holes[goal]) >= 2 ? 0 : 1)
        + holeLanes.slice(1).filter((h) => count(holes[h]) < 1).length
        + kindIds.filter((k) => count(k) < 1).length
        + (answer === goal ? 2 : 0)
        + Math.max(0, minCross - ends[answer].cross)
        + (tricks ? (tricks - made) + (flatEnds[answer].end === goal ? 3 : 0) + (trap < 0 ? 1 : 0) : 0);
      if (best && miss >= best.miss) continue;
      const load = holeLanes.reduce((a, h) => a + ends[from[h]].cross, 0);
      best = { lanes, rungs, pegs, holes, answer, ends, flatEnds, trap, load, miss };
      if (miss === 0) break;
    }
    return best;
  }

  // 속임 가로줄: 가로줄 A 의 한쪽 끝을 같은 세로줄에 붙은 옆 칸 가로줄 B 의 끝 너머로(TRICK 만큼) 옮긴다.
  // B 는 A 바로 위나 아래 칸, A 와 이웃한 세로줄 사이에 있다. 옮긴 뒤에도 다음을 지켜야 한다:
  //   - 가로줄 끝끼리 GAP 이상 떨어져 있고 X 자로 엇갈리지 않는다 (spaced)
  //   - 평평하게(가운데 높이로) 읽으면 그 세로줄에서 A 와 B 를 만나는 순서가 실제와 반대다
  // 한 번 쓴 A, B 는 다시 쓰지 않는다 (B 를 옮기면 A 와의 순서가 흐트러진다). 반환: 만든 수
  static makeTricks(rungs, lanes, n, unit) {
    const { TRICK } = LadderGame;
    const gap = LadderGame.GAP / LadderGame.LH;
    const endY = (g, lane) => (lane === g.i ? g.yl : g.yr);
    let made = 0;
    for (const a of U.shuffle([...rungs])) {
      if (made >= n) break;
      if (a.trick || a.lock) continue;
      // a 의 끝이 붙은 세로줄과, 그 세로줄 반대편 칸의 가로줄 b (바로 위나 아래 칸)
      const opts = [];
      for (const side of [0, 1]) {
        const lane = a.i + side;
        for (const b of rungs) {
          if (b === a || b.trick || b.lock || Math.abs(b.r - a.r) !== 1) continue;
          if (b.i !== (side ? lane : lane - 1)) continue;
          opts.push({ side, lane, b });
        }
      }
      for (const { side, lane, b } of U.shuffle(opts)) {
        const key = side ? 'yr' : 'yl';
        const keep = a[key];
        const by = endY(b, lane);
        const d = gap + U.lerp(TRICK[0], TRICK[1], Math.random()) * unit;
        a[key] = b.r > a.r ? by + d : by - d;
        // 평평하게 읽었을 때의 a 높이(가운데)가 실제와 반대편에 있어야 속임이 된다
        const mid = (a.yl + a.yr) / 2;
        const fools = (a[key] > by) !== (mid > by);
        if (fools && LadderGame.spaced(rungs, lanes, unit)) {
          a.trick = true;
          b.lock = true;
          made++;
          break;
        }
        a[key] = keep;
      }
    }
    return made;
  }

  // 가로줄을 읽기 쉬운가: 한 세로줄 위 가로줄 끝끼리 GAP 이상 떨어져 있고, 사다리 위아래 끝에 너무 붙지 않고,
  // 같은 세로줄 사이의 가로줄끼리 X 자로 엇갈리지 않는다
  static spaced(rungs, lanes, unit) {
    const gap = LadderGame.GAP / LadderGame.LH;
    for (let lane = 0; lane < lanes; lane++) {
      const ys = rungs.filter((g) => g.i === lane || g.i === lane - 1).map((g) => (lane === g.i ? g.yl : g.yr)).sort((a, b) => a - b);
      if (!ys.length) continue;
      if (ys[0] < unit * 0.4 || ys[ys.length - 1] > 1 - unit * 0.4) return false;
      for (let j = 1; j < ys.length; j++) if (ys[j] - ys[j - 1] < gap - 1e-9) return false;
    }
    for (const a of rungs) {
      for (const b of rungs) {
        if (a !== b && a.i === b.i && Math.sign(a.yl - b.yl) !== Math.sign(a.yr - b.yr)) return false;
      }
    }
    return true;
  }
}
