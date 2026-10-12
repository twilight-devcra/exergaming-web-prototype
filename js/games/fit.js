// 구멍에 맞는 조각
// 판에 뚫린 구멍을 보고, 아래 조각 중 그 구멍에 꼭 맞는 하나를 고른다. 조각은 저마다 다른 각도로 놓여 있다.
// 조각은 테트리스처럼 정사각형 칸이 붙은 모양이라 90°씩만 돌아가고, 다른 점도 '칸 하나 차이'로 또렷하게 보인다.
//
// 오답 조각은 '뒤집은 것'이 아니라 '모양이 다른 것'이다. 돌리는 건 되고 뒤집는 건 안 된다는 규칙이 있으면
// 그 규칙을 따로 알려 줘야 하므로, 아예 뒤집어도 맞지 않는 조각만 오답으로 쓴다.
// 오답은 칸 수와 테두리 크기까지 정답과 같게 맞춘다. 안 그러면 돌려 보지 않고 크기만으로 걸러낼 수 있다.
//
// 난이도는 네 가지로 조절한다.
//   cells   — 칸 수. 많을수록 머릿속에 담아 둘 것이 늘어난다.
//   cands   — 조각 수.
//   sameBox — 오답의 테두리 크기를 정답과 같게 맞출지. 맞추면 크기로 걸러낼 수 없어 반드시 돌려 봐야 한다.
//   rots    — 조각이 놓일 수 있는 방향 수 (2 = 0°·180°, 4 = 네 방향 모두).
// 오답은 언제나 '칸 하나를 옮긴' 모양이다. 칸이 적을 때는 만들 수 있는 모양 자체가 몇 개 없어서
// (4칸짜리는 전부 5종뿐) 두 칸 이상 옮기는 걸 난이도 조절에 쓸 수 없다.
class FitGame {
  static id = 'fit';
  static title = '구멍에 맞는 조각';
  static hint = '판에 뚫린 구멍과 꼭 맞는 조각을<br>아래에서 고르세요';
  static levels = [
    { cells: 5, cands: 3, sameBox: false, rots: 2 },
    { cells: 6, cands: 3, sameBox: true, rots: 4 },
    { cells: 7, cands: 4, sameBox: false, rots: 4 },
    { cells: 8, cands: 4, sameBox: true, rots: 4 },
    { cells: 9, cands: 5, sameBox: true, rots: 4 },
    { cells: 10, cands: 5, sameBox: true, rots: 4 },
  ];
  static maxLevel = FitGame.levels.length;
  static ROUNDS = 3;
  // 조각은 버튼의 FILL%, 구멍은 판의 HOLE_FILL%를 차지한다. 판을 그만큼 크게 띄우면
  // 구멍과 조각이 화면에서 같은 크기로 보여서 '이게 저기 들어갈까'를 눈으로 가늠할 수 있다 (layout 참고).
  static FILL = 86;
  static HOLE_FILL = 60;
  static NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];

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
    this.plate = U.el('div', 'fit-hole');
    this.cands = U.el('div', 'fit-cands');
    this.wrap.append(this.progress, this.plate, this.cands);
    stage.append(this.msg, this.wrap);
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(stage);
    this.next();
  }

  next() {
    const { rots } = this.spec;
    const { hole, pieces, span } = FitGame.makeRound(this.spec);
    this.hole = hole;
    this.span = span;
    this.holeRot = U.rand(4);
    // 조각마다 놓인 방향을 따로 정한다. 방향만 보고는 정답을 알 수 없다.
    this.shown = U.shuffle(pieces.map((cells, i) => ({
      cells,
      answer: i === 0,
      rot: rots === 2 ? this.holeRot + U.rand(2) * 2 : U.rand(4),
    })));

    this.msg.textContent = '구멍에 꼭 맞는 조각을 고르세요';
    this.msg.className = 'stage-msg';
    [...this.progress.children].forEach((d, i) => d.classList.toggle('cur', i === this.round));

    const unit = FitGame.HOLE_FILL / span;
    this.plate.innerHTML =
      `<svg viewBox="0 0 100 100"><g class="hole">${FitGame.rects(FitGame.turn(hole, this.holeRot), unit)}</g></svg>`;
    this.plateSvg = this.plate.querySelector('svg');

    this.cands.innerHTML = '';
    this.btns = this.shown.map((s, i) => {
      const rc = FitGame.rects(FitGame.turn(s.cells, s.rot), FitGame.FILL / span);
      const b = U.el('button', 'fit-cand', `<svg viewBox="0 0 100 100"><g>${rc}</g></svg>`);
      b.addEventListener('pointerdown', () => this.pick(i, b));
      this.cands.append(b);
      return b;
    });

    this.layout();
    this.phase = 'input';
  }

  layout() {
    const s = this.h.stage;
    const n = this.spec.cands;
    const ratio = FitGame.HOLE_FILL / FitGame.FILL;   // 버튼 크기 = 판 크기 * ratio
    const avail = s.clientHeight - 290;
    const cand = U.clamp(Math.min(avail / (1 / ratio + 1.1), (s.clientWidth - 120) / n - 16), 52, 132);
    this.wrap.style.setProperty('--psz', `${cand}px`);
    this.wrap.style.setProperty('--hsz', `${Math.round(cand / ratio)}px`);
  }

  pick(i, btn) {
    if (this.phase !== 'input') return;
    this.phase = 'wait';
    const s = this.shown[i];
    const ok = s.answer;

    this.btns.forEach((b, j) => {
      b.disabled = true;
      if (this.shown[j].answer) b.classList.add('right');
    });
    if (!ok) btn.classList.add('wrong');

    // 고른 조각을 구멍 쪽으로 돌려 끼워 본다. 맞으면 구멍을 꼭 채우고, 아니면 칸이 남거나 삐져나온다.
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `seat ${ok ? 'right' : 'wrong'}`);
    g.innerHTML = FitGame.rects(FitGame.turn(s.cells, this.holeRot), FitGame.HOLE_FILL / this.span);
    g.style.transform = `rotate(${(s.rot - this.holeRot) * 90}deg)`;
    this.plateSvg.append(g);
    requestAnimationFrame(() => requestAnimationFrame(() => (g.style.transform = 'rotate(0deg)')));

    const d = this.progress.children[this.round];
    d.classList.remove('cur');
    d.classList.add(ok ? 'right' : 'wrong');

    if (ok) {
      this.correct++;
      this.msg.textContent = '딱 맞았어요!';
      this.msg.className = 'stage-msg good';
      this.h.award((this.h.base * this.h.mult) / FitGame.ROUNDS, this.plate);
      this.h.sfx('good');
    } else {
      this.msg.textContent = '맞지 않아요';
      this.msg.className = 'stage-msg bad';
      this.h.sfx('bad');
    }
    this.h.after(ok ? 1300 : 2000, () => this.advance());
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

  // ---- 칸 모음 다루기 ----
  // 조각은 [행, 열] 칸의 목록이다. 왼쪽 위를 (0,0)으로 당겨 두고 항상 같은 순서로 정렬해 비교한다.
  static norm(cells) {
    const minR = Math.min(...cells.map(([r]) => r));
    const minC = Math.min(...cells.map(([, c]) => c));
    return cells.map(([r, c]) => [r - minR, c - minC]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }

  static str(cells) {
    return cells.map(([r, c]) => `${r},${c}`).join(' ');
  }

  static turn(cells, times) {
    let out = cells;
    for (let i = 0; i < (times & 3); i++) out = out.map(([r, c]) => [c, -r]);
    return FitGame.norm(out);
  }

  // 가로·세로 테두리 크기 (돌려도 같게 보려고 작은 쪽부터 적는다)
  static box(cells) {
    const h = Math.max(...cells.map(([r]) => r)) + 1;
    const w = Math.max(...cells.map(([, c]) => c)) + 1;
    return [Math.min(h, w), Math.max(h, w)];
  }

  // 돌리거나 뒤집어서 겹칠 수 있는 조각들에 같은 이름을 붙인다.
  // 뒤집은 것까지 한 묶음으로 보기 때문에 오답이 '정답을 뒤집은 것'이 되는 일은 없다.
  static key(cells) {
    let best = null;
    let cur = cells;
    for (let f = 0; f < 2; f++) {
      for (let r = 0; r < 4; r++) {
        const s = FitGame.str(FitGame.norm(cur));
        if (best === null || s < best) best = s;
        cur = cur.map(([a, b]) => [b, -a]);
      }
      cur = cur.map(([a, b]) => [a, -b]);
    }
    return best;
  }

  static connected(cells) {
    const has = new Set(cells.map(([r, c]) => `${r},${c}`));
    const seen = new Set([FitGame.str([cells[0]])]);
    const stack = [cells[0]];
    while (stack.length) {
      const [r, c] = stack.pop();
      for (const [dr, dc] of FitGame.NB) {
        const k = `${r + dr},${c + dc}`;
        if (has.has(k) && !seen.has(k)) {
          seen.add(k);
          stack.push([r + dr, c + dc]);
        }
      }
    }
    return seen.size === cells.length;
  }

  // 칸 하나에서 시작해 이웃으로 한 칸씩 붙여 나간다
  static grow(n) {
    const cells = [[0, 0]];
    const has = new Set(['0,0']);
    let guard = 0;
    while (cells.length < n && guard++ < 500) {
      const [r, c] = cells[U.rand(cells.length)];
      const [dr, dc] = FitGame.NB[U.rand(4)];
      const k = `${r + dr},${c + dc}`;
      if (has.has(k)) continue;
      has.add(k);
      cells.push([r + dr, c + dc]);
    }
    return FitGame.norm(cells);
  }

  // 칸 하나를 떼어 다른 빈 자리에 붙여 만들 수 있는 모든 모양. 떼고도 조각이 끊기지 않아야 한다.
  static neighbours(cells) {
    const out = new Map();
    for (let i = 0; i < cells.length; i++) {
      const rest = cells.filter((_, j) => j !== i);
      if (!FitGame.connected(rest)) continue;
      const has = new Set(rest.map(([r, c]) => `${r},${c}`));
      const spots = new Set();
      for (const [r, c] of rest) {
        for (const [dr, dc] of FitGame.NB) {
          const k = `${r + dr},${c + dc}`;
          if (!has.has(k)) spots.add(k);
        }
      }
      for (const sp of spots) {
        const shape = FitGame.norm([...rest, sp.split(',').map(Number)]);
        out.set(FitGame.key(shape), shape);
      }
    }
    return out;
  }

  // 칸을 정확히 moves번 옮겨야 닿는 모양들. 더 가까운 모양은 빼기 때문에
  // moves가 클수록 정답과 확실히 다른(= 쉬운) 오답이 나온다.
  static variants(hole, moves) {
    const seen = new Set([FitGame.key(hole)]);
    let frontier = [hole];
    let layer = [];
    for (let m = 0; m < moves; m++) {
      layer = [];
      for (const shape of frontier) {
        for (const [k, s] of FitGame.neighbours(shape)) {
          if (seen.has(k)) continue;
          seen.add(k);
          layer.push(s);
        }
      }
      frontier = layer;
      if (!layer.length) break;
    }
    return layer;
  }

  // ---- 한 문제 만들기: 정답 1개 + 어떻게 돌리거나 뒤집어도 맞지 않는 오답들 ----
  // 닿을 수 있는 모양을 전부 펼쳐 놓고 거기서 고른다. 무작위로 뽑아 버리기를 반복하지 않아 빠르고 확실하다.
  static makeRound({ cands, cells, sameBox }) {
    // 길쭉한 모양은 칸이 작게 그려져 알아보기 어렵다. 가로세로를 이만큼으로 묶어 뭉툭한 모양만 쓴다.
    const maxSpan = Math.ceil(Math.sqrt(cells)) + 1;
    // 테두리를 맞추는 쪽이 어렵다. 그 조건으로 못 찾으면 풀어 주고, 그래도 안 되면 두 칸까지 옮겨 본다.
    for (const [mv, strict] of [[1, sameBox], [1, false], [2, false]]) {
      for (let outer = 0; outer < 150; outer++) {
        const hole = FitGame.grow(cells);
        if (hole.length < cells) continue;
        const box = FitGame.box(hole);
        if (box[1] > maxSpan) continue;
        let pool = FitGame.variants(hole, mv).filter((p) => FitGame.box(p)[1] <= maxSpan);
        if (strict) {
          pool = pool.filter((p) => {
            const b = FitGame.box(p);
            return b[0] === box[0] && b[1] === box[1];
          });
        }
        if (pool.length < cands - 1) continue;
        const pieces = [hole, ...U.shuffle(pool).slice(0, cands - 1)];
        return { hole, pieces, span: Math.max(...pieces.map((p) => FitGame.box(p)[1])) };
      }
    }
    return FitGame.makeRound({ cands, cells: cells + 1, sameBox });
  }

  // ---- 그리기: 칸마다 정사각형 하나. 맞닿은 변이 딱 붙어 한 덩어리로 보인다 ----
  static rects(cells, unit) {
    const h = Math.max(...cells.map(([r]) => r)) + 1;
    const w = Math.max(...cells.map(([, c]) => c)) + 1;
    const ox = 50 - (w * unit) / 2;
    const oy = 50 - (h * unit) / 2;
    return cells.map(([r, c]) =>
      `<rect x="${(ox + c * unit).toFixed(2)}" y="${(oy + r * unit).toFixed(2)}" ` +
      `width="${unit.toFixed(2)}" height="${unit.toFixed(2)}"/>`
    ).join('');
  }
}
