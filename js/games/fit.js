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
//   cands — 조각 수.
//   pick  — 오답을 고르는 방법. far = 정답과 셋 이상의 변에서 다른 것, near = 가장 적게 다른 것, any = 아무거나.
//   upright — 조각을 돌려 놓지 않는다 (쉬운 단계). 정답 조각이 빈자리와 같은 방향이라 머릿속으로 돌려 볼 필요가 없다.
class FitGame {
  static id = 'fit';
  static title = '빈자리 채우기';
  static hint = '빈자리에 끼웠을 때 선이 모두 이어지는<br>조각을 아래에서 고르세요';
  static levels = [
    { lines: 1, cands: 2, pick: 'any', upright: true },
    { lines: 1, cands: 3, pick: 'any', upright: true },
    { lines: 1, cands: 3, pick: 'any' },
    { lines: 2, cands: 3, pick: 'far' },
    { lines: 2, cands: 4, pick: 'near' },
    { lines: 3, cands: 4, pick: 'far' },
    { lines: 3, cands: 5, pick: 'near' },
    { lines: 3, cands: 6, pick: 'near' },
  ];
  static maxLevel = FitGame.levels.length;
  static ROUNDS = 3;
  static COLORS = ['#e8453c', '#f5c400', '#2f9bff'];
  // 판과 조각을 같은 단위로 그린다. 조각 버튼은 PIECE_VIEW, 판은 BOARD_VIEW 너비를 보여 주므로
  // 판을 그 비율만큼 크게 띄우면 빈자리와 조각이 화면에서 같은 크기로 보인다 (layout 참고).
  static R = 42;            // 육각형 중심에서 꼭짓점까지
  static PIECE_VIEW = 100;
  static BOARD_VIEW = 180;
  static LINE = 8;
  static GAP = 7;           // 한 변에 선 끝이 둘일 때 변의 한가운데에서 떨어진 거리

  constructor(host) {
    this.h = host;
    this.spec = FitGame.levels[host.level - 1];
    this.round = 0;
    this.correct = 0;
    this.phase = 'wait';
  }

  start() {
    const { stage, level } = this.h;
    stage.append(U.el('div', 'stage-title', `${FitGame.title} · Lv.${level}`));
    this.msg = U.el('div', 'stage-msg', '');
    this.wrap = U.el('div', 'fit-wrap');
    this.progress = U.el('div', 'dots');
    for (let i = 0; i < FitGame.ROUNDS; i++) this.progress.append(U.el('span'));
    this.board = U.el('div', 'fit-board');
    this.cands = U.el('div', 'fit-cands');
    this.wrap.append(this.progress, this.board, this.cands);
    stage.append(this.msg, this.wrap);
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(stage);
    this.next();
  }

  next() {
    const pieces = FitGame.makeRound(this.spec);
    this.gap = pieces[0];
    // 조각마다 놓인 방향을 따로 정한다. 정답은 빈자리와 같은 방향으로는 놓지 않는다 — 돌려 보지 않고도 맞힐 수 있다.
    // upright 단계는 거꾸로 일부러 모두 빈자리와 같은 방향으로 둔다.
    this.shown = U.shuffle(pieces.map((p, i) => {
      if (this.spec.upright) return { p, rot: 0, answer: i === 0 };
      let rot = U.rand(6);
      if (i === 0) {
        const turned = [1, 2, 3, 4, 5].filter((k) => FitGame.str(FitGame.turn(p, k)) !== FitGame.str(p));
        if (turned.length) rot = turned[U.rand(turned.length)];
      }
      return { p, rot, answer: i === 0 };
    }));

    this.msg.textContent = '선이 모두 이어지는 조각을 고르세요';
    this.msg.className = 'stage-msg';
    [...this.progress.children].forEach((d, i) => d.classList.toggle('cur', i === this.round));

    const v = FitGame.BOARD_VIEW;
    this.board.innerHTML =
      `<svg viewBox="${-v / 2} ${-v / 2} ${v} ${v}">${FitGame.drawBoard(this.gap)}</svg>`;
    this.boardSvg = this.board.querySelector('svg');

    const pv = FitGame.PIECE_VIEW;
    this.cands.innerHTML = '';
    this.btns = this.shown.map((s, i) => {
      const b = U.el('button', 'fit-cand',
        `<svg viewBox="${-pv / 2} ${-pv / 2} ${pv} ${pv}">${FitGame.drawPiece(FitGame.turn(s.p, s.rot))}</svg>`);
      b.addEventListener('pointerdown', () => this.pick(i, b));
      this.cands.append(b);
      return b;
    });

    this.layout();
    this.phase = 'input';
    this.h.question({
      gap: FitGame.str(this.gap),
      shown: this.shown.map((s) => ({ piece: FitGame.str(s.p), rot: s.rot, answer: s.answer })),
    });
    this.h.timer(this.spec.cands, () => this.pick(-1, null));
  }

  layout() {
    const s = this.h.stage;
    const n = this.spec.cands;
    const ratio = FitGame.PIECE_VIEW / FitGame.BOARD_VIEW;   // 버튼 크기 = 판 크기 * ratio
    const avail = s.clientHeight - 290;
    const cand = U.clamp(Math.min(avail / (1 / ratio + 1.1), (s.clientWidth - 120) / n - 16), 52, 132);
    this.wrap.style.setProperty('--psz', `${cand}px`);
    this.wrap.style.setProperty('--bsz', `${Math.round(cand / ratio)}px`);
  }

  // i = 고른 조각. -1 이면 시간이 다 된 것 (끼워 보지 않고 정답 조각만 표시한다)
  pick(i, btn) {
    if (this.phase !== 'input') return;
    this.phase = 'wait';
    this.h.stopTimer();
    const s = this.shown[i];
    const ok = !!s && s.answer;
    this.h.answer({ picked: s ? i : null, correct: ok, timedOut: !s });

    this.btns.forEach((b, j) => {
      b.disabled = true;
      if (this.shown[j].answer) b.classList.add('right');
    });
    if (!ok && btn) btn.classList.add('wrong');
    if (s) this.seat(s, ok);
    this.score(ok, s ? '선이 이어지지 않아요' : '시간 초과');
  }

  // 고른 조각을 빈자리로 돌려 끼워 본다. 오답은 가장 많이 이어지는 방향으로 끼우고,
  // 그래도 어긋나는 변에 표시를 해서 왜 안 맞는지 보이게 한다.
  seat(s, ok) {
    const k = FitGame.bestTurn(s.p, this.gap);
    const seated = FitGame.turn(s.p, k);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `seat ${ok ? 'right' : 'wrong'}`);
    g.innerHTML = FitGame.drawPiece(seated);
    g.style.transform = `rotate(${FitGame.shortest(s.rot - k) * 60}deg)`;
    this.boardSvg.append(g);
    if (!ok) {
      const marks = FitGame.misses(seated, this.gap).map((m, e) => (m ? FitGame.miss(e) : '')).join('');
      this.boardSvg.insertAdjacentHTML('beforeend', `<g class="miss">${marks}</g>`);
    }
    requestAnimationFrame(() => requestAnimationFrame(() => (g.style.transform = 'rotate(0deg)')));
  }

  score(ok, failMsg) {
    const d = this.progress.children[this.round];
    d.classList.remove('cur');
    d.classList.add(ok ? 'right' : 'wrong');

    if (ok) {
      this.correct++;
      this.msg.textContent = '선이 모두 이어졌어요!';
      this.msg.className = 'stage-msg good';
      this.h.award((this.h.base * this.h.mult) / FitGame.ROUNDS, this.board);
      this.h.sfx('good');
    } else {
      this.msg.textContent = failMsg;
      this.msg.className = 'stage-msg bad';
      this.h.sfx('bad');
    }
    this.h.after(ok ? 1300 : 2200, () => this.advance());
  }

  advance() {
    this.round++;
    if (this.round < FitGame.ROUNDS) return this.next();
    this.ro.disconnect();
    this.h.done(this.result());
  }

  result() {
    return { cleared: this.correct === FitGame.ROUNDS, correct: this.correct, total: FitGame.ROUNDS };
  }

  // 점수는 맞힐 때마다 바로 지급하므로 중단될 때 따로 줄 것이 없다
  abort() {
    this.ro.disconnect();
    return { cleared: false, correct: this.correct, total: this.round };
  }

  // ---- 조각 다루기 ----
  // 조각은 변 여섯 개의 목록이고, 변마다 거기서 끝나는 선의 색을 작은 번호부터 담는다 (0~2개).
  // 변 0은 오른쪽 위이고 시계 방향으로 번호가 붙는다. 한 색은 서로 다른 두 변에 한 번씩 나타난다.
  static str(p) {
    return p.map((e) => e.join('')).join('/');
  }

  // 시계 방향으로 60° × times
  static turn(p, times) {
    const k = ((times % 6) + 6) % 6;
    return p.map((_, e) => p[(e - k + 6) % 6]);
  }

  // -3 ~ 2 단위로 바꿔서 늘 짧은 쪽으로 돌아가게 한다
  static shortest(times) {
    const k = ((times % 6) + 6) % 6;
    return k > 3 ? k - 6 : k;
  }

  // 돌리거나 뒤집어서 겹칠 수 있는 조각들에 같은 이름을 붙인다.
  // 뒤집은 것까지 한 묶음으로 보기 때문에 오답이 '정답을 뒤집은 것'이 되는 일은 없다.
  static key(p) {
    const flipped = p.map((_, e) => p[(6 - e) % 6]);
    let best = null;
    for (const q of [p, flipped]) {
      for (let k = 0; k < 6; k++) {
        const s = FitGame.str(FitGame.turn(q, k));
        if (best === null || s < best) best = s;
      }
    }
    return best;
  }

  static misses(p, gap) {
    return p.map((e, i) => e.join('') !== gap[i].join(''));
  }

  // 조각을 빈자리에 끼울 때 어긋나는 변 수가 가장 적은 방향
  static bestTurn(p, gap) {
    let best = 0;
    let bestMiss = Infinity;
    for (let k = 0; k < 6; k++) {
      const miss = FitGame.misses(FitGame.turn(p, k), gap).filter(Boolean).length;
      if (miss < bestMiss) [best, bestMiss] = [k, miss];
    }
    return best;
  }

  static dist(p, q) {
    return FitGame.misses(FitGame.turn(q, FitGame.bestTurn(q, p)), p).filter(Boolean).length;
  }

  // 선 lines개로 만들 수 있는 모든 조각. 색마다 두 변을 고른다 (작은 색부터 넣으므로 변마다 정렬된 채로 쌓인다).
  static all(lines) {
    const out = [];
    const fill = (p, c) => {
      if (c === lines) return out.push(p.map((x) => x.slice()));
      for (let a = 0; a < 6; a++) {
        if (p[a].length >= 2) continue;
        for (let b = a + 1; b < 6; b++) {
          if (p[b].length >= 2) continue;
          p[a].push(c);
          p[b].push(c);
          fill(p, c + 1);
          p[a].pop();
          p[b].pop();
        }
      }
    };
    fill([[], [], [], [], [], []], 0);
    return out;
  }

  // ---- 한 문제 만들기: 정답 1개 + 어떻게 돌리거나 뒤집어도 맞지 않는 오답들 ----
  // 만들 수 있는 조각을 전부 펼쳐 놓고 묶음마다 하나씩 남긴 뒤, 난이도에 맞는 것을 고른다.
  static makeRound({ lines, cands, pick }) {
    const all = FitGame.all(lines);
    const answer = all[U.rand(all.length)];
    const own = FitGame.key(answer);
    const classes = new Map();
    for (const p of U.shuffle(all)) {
      const k = FitGame.key(p);
      if (k !== own && !classes.has(k)) classes.set(k, p);
    }
    let pool = [...classes.values()].map((p) => ({ p, d: FitGame.dist(answer, p) }));
    // 선 하나짜리는 끝 사이 간격(1·2·3칸)으로 세 가지뿐이라 고를 것이 없다
    if (pick === 'near') pool.sort((a, b) => a.d - b.d);   // 섞어 둔 순서를 지키며 가까운 것부터
    if (pick === 'far') {
      const far = pool.filter((x) => x.d >= 3);
      if (far.length >= cands - 1) pool = far;
    }
    return [answer, ...pool.slice(0, cands - 1).map((x) => x.p)];
  }

  // ---- 그리기 ----
  // 꼭짓점이 위로 가는 육각형. 변 e의 바깥쪽 방향은 -60° + 60°·e (화면 좌표, 시계 방향)
  static normal(e) {
    const a = ((-60 + 60 * e) * Math.PI) / 180;
    return [Math.cos(a), Math.sin(a)];
  }

  // 한 변에 선 끝이 둘이면 어느 쪽에 둘지 정한다. 선이 가장 덜 엇갈리는 배치를 고르는데,
  // 기준 방향으로 돌려 놓고 고른 뒤 되돌리기 때문에 조각을 돌려 놓아도 대개 같은 그림이 나온다.
  // (반 바퀴 돌려도 같은 조각 — 예: 마주 보는 두 변을 잇는 나란한 두 선 — 은 두 선의 좌우만 바뀔 수 있다.)
  // 빈자리와 끼워진 조각은 같은 방향의 같은 조각이라 언제나 똑같이 그려지고, 끝이 정확히 이어진다.
  static arrange(p) {
    let k0 = 0;
    for (let k = 1; k < 6; k++) {
      if (FitGame.str(FitGame.turn(p, k)) < FitGame.str(FitGame.turn(p, k0))) k0 = k;
    }
    const q = FitGame.turn(p, k0);
    const shared = [0, 1, 2, 3, 4, 5].filter((e) => q[e].length === 2);
    let best = q;
    let bestX = Infinity;
    for (let mask = 0; mask < 1 << shared.length; mask++) {
      const o = q.map((x) => x.slice());
      shared.forEach((e, i) => { if (mask & (1 << i)) o[e].reverse(); });
      const x = FitGame.crossings(o);
      if (x < bestX) [best, bestX] = [o, x];
    }
    return FitGame.turn(best, -k0);
  }

  // 둘레를 시계 방향으로 돌며 선 끝에 번호를 매기면, 두 선은 끝이 서로 엇갈려 놓일 때만 만난다
  static crossings(o) {
    const ends = {};
    o.forEach((cs, e) => cs.forEach((c, j) => (ends[c] ||= []).push(e * 3 + (cs.length < 2 ? 1 : j * 2))));
    const chords = Object.values(ends);
    let n = 0;
    for (let i = 0; i < chords.length; i++) {
      for (let j = i + 1; j < chords.length; j++) {
        const [a, b] = chords[i];
        const inside = chords[j].filter((v) => v > a && v < b).length;
        if (inside === 1) n++;
      }
    }
    return n;
  }

  // 변 e에서 j번째 선 끝의 자리와 바깥쪽 방향. 끝이 하나면 한가운데, 둘이면 시계 방향 순서로 나란히 놓는다.
  // p는 arrange를 거친 배치다.
  static port(p, e, j) {
    const ap = (FitGame.R * Math.sqrt(3)) / 2;
    const [nx, ny] = FitGame.normal(e);
    const off = p[e].length < 2 ? 0 : (j === 0 ? -1 : 1) * FitGame.GAP;
    return { x: nx * ap - ny * off, y: ny * ap + nx * off, nx, ny };
  }

  static hex(cx, cy, cls) {
    const pts = [];
    for (let v = 0; v < 6; v++) {
      const a = ((-90 + 60 * v) * Math.PI) / 180;
      pts.push(`${(cx + FitGame.R * Math.cos(a)).toFixed(2)},${(cy + FitGame.R * Math.sin(a)).toFixed(2)}`);
    }
    return `<polygon class="${cls}" points="${pts.join(' ')}"/>`;
  }

  // 선은 테두리를 한 번 더 그려서 서로 겹쳐 지나갈 때도 어느 선이 어디로 가는지 보이게 한다
  static stroke(d, color) {
    return `<path class="halo" d="${d}" stroke-width="${FitGame.LINE + 4}"/>` +
      `<path d="${d}" stroke="${color}" stroke-width="${FitGame.LINE}"/>`;
  }

  // 변에서 곧게 INSET 만큼 들어가 꺾은 뒤, 다른 변 앞에서 다시 꺾어 곧게 나간다. 같은 변에서 시작하는 두 선은 처음에 나란히 간다.
  // 곡선으로 그리면 이웃한 변·한 칸 건너 변·마주 보는 변을 잇는 선이 모두 비슷한 호로 보였다. 꺾인 선은 각이 또렷해서
  // 갈고리(이웃) · 넓은 V(한 칸 건너) · 일자(마주 봄)로 한눈에 갈린다.
  static INSET = FitGame.R * 0.38;
  static drawPiece(pattern) {
    const p = FitGame.arrange(pattern);
    const k = FitGame.INSET;
    const f = (n) => n.toFixed(2);
    let lines = '';
    for (let c = 0; c < FitGame.COLORS.length; c++) {
      const [a, b] = [0, 1, 2, 3, 4, 5].flatMap((e) => p[e].includes(c) ? [FitGame.port(p, e, p[e].indexOf(c))] : []);
      if (!b) continue;
      const d = `M${f(a.x)},${f(a.y)} L${f(a.x - a.nx * k)},${f(a.y - a.ny * k)} ` +
        `L${f(b.x - b.nx * k)},${f(b.y - b.ny * k)} L${f(b.x)},${f(b.y)}`;
      lines += FitGame.stroke(d, FitGame.COLORS[c]);
    }
    return `${FitGame.hex(0, 0, 'tile piece')}<g class="lines">${lines}</g>`;
  }

  // 빈자리와 둘레 타일 여섯 개. 선은 판 바깥에서 들어와 빈자리의 변에서 끊긴다.
  static drawBoard(pattern) {
    const gap = FitGame.arrange(pattern);
    const ap = (FitGame.R * Math.sqrt(3)) / 2;
    let tiles = '';
    let stubs = '';
    for (let e = 0; e < 6; e++) {
      const [nx, ny] = FitGame.normal(e);
      tiles += FitGame.hex(nx * ap * 2, ny * ap * 2, 'tile');
      gap[e].forEach((c, j) => {
        const { x, y } = FitGame.port(gap, e, j);
        const d = `M${x.toFixed(2)},${y.toFixed(2)} L${(x + nx * 110).toFixed(2)},${(y + ny * 110).toFixed(2)}`;
        stubs += FitGame.stroke(d, FitGame.COLORS[c]);
      });
    }
    return `${tiles}${FitGame.hex(0, 0, 'gap')}<g class="lines">${stubs}</g>`;
  }

  // 오답을 끼웠을 때 어긋난 변에 찍는 표시. 선 끝이 둘이어도 함께 감싸도록 넉넉하게 그린다.
  static miss(e) {
    const ap = (FitGame.R * Math.sqrt(3)) / 2;
    const [nx, ny] = FitGame.normal(e);
    return `<circle cx="${(nx * ap).toFixed(2)}" cy="${(ny * ap).toFixed(2)}" r="13"/>`;
  }
}
