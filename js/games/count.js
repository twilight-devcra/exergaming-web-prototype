// 우세한 색 찾기
// n×m 격자에 여러 색을 켜 두고, 그중 가장 많이 켜진 색을 아래 보기에서 고른다.
// 난이도는 네 가지로 조절한다.
//   margin — 1위와 2위의 개수 차이. 차이가 작아지면 눈대중이 안 통하고 실제로 세어야 한다.
//   colors — 색 수. 동시에 들고 있어야 하는 집계 수가 늘어난다.
//   spread — 비우승 색들이 2위보다 얼마나 적어질 수 있는지. 좁을수록 어느 색도 눈으로 쳐낼 수 없다.
//   clump  — 같은 색이 서로 붙어 놓일 확률. 뭉쳐 있으면 면적으로 바로 보이고, 흩어지면 하나씩 세야 한다.
// 격자는 일부러 작게 유지한다. 칸 수를 늘리면 어려워지는 게 아니라 지루해지기만 한다.
const COUNT_COLORS = [
  // 색만으로 구분하지 않도록 칸마다 색에 딸린 모양을 함께 찍는다 (색약 대응)
  { id: 'red', fill: '#e5484d', glyph: '<circle cx="50" cy="50" r="25"/>' },
  { id: 'blue', fill: '#2f6fed', glyph: '<rect x="27" y="27" width="46" height="46" rx="6"/>' },
  { id: 'green', fill: '#1f9d55', glyph: '<polygon points="50,25 76,73 24,73"/>' },
  { id: 'yellow', fill: '#f5b301', glyph: '<polygon points="50,22 78,50 50,78 22,50"/>' },
  { id: 'purple', fill: '#8e4ec6', glyph: '<path d="M43 23h14v20h20v14H57v20H43V57H23V43h20z"/>' },
];

class CountGame {
  static id = 'count';
  static tags = ['search']; // 꼬리표가 겹치는 게임끼리는 연달아 나오지 않는다 (main.js planPass)
  static title = '우세한 색 찾기';
  static hint = '격자에 가장 많이 켜진 색을<br>아래 보기에서 고르세요';
  // cells = 켜는 칸 수의 상한 (격자를 가득 채우지 않는다)
  static levels = [
    // 쉬운 단계: 작은 판, 두세 색, 같은 색끼리 늘 붙어 있다
    { grid: [3, 3], colors: 2, cells: 7, margin: 3, spread: 3, clump: 1 },
    { grid: [3, 4], colors: 3, cells: 10, margin: 4, spread: 3, clump: 1 },
    { grid: [4, 4], colors: 3, cells: 12, margin: 4, spread: 3, clump: 0.9 },
    { grid: [4, 4], colors: 3, cells: 14, margin: 3, spread: 3, clump: 0.7 },
    { grid: [4, 5], colors: 4, cells: 16, margin: 2, spread: 3, clump: 0.5 },
    { grid: [5, 5], colors: 4, cells: 20, margin: 2, spread: 2, clump: 0.3 },
    { grid: [5, 5], colors: 5, cells: 22, margin: 1, spread: 2, clump: 0.15 },
    { grid: [5, 6], colors: 5, cells: 25, margin: 1, spread: 1, clump: 0 },
  ];
  static maxLevel = CountGame.levels.length;
  static ROUNDS = 3;

  // 소개 그림: ① 가장 많은 색을 찾아 ② 아래 보기에서 고른다
  static diagram() {
    const [red, blue] = COUNT_COLORS;
    const cell = (col, x, y, s) => (col
      ? `<rect fill="${col.fill}" x="${x}" y="${y}" width="${s}" height="${s}" rx="7"/>` + Dg.glyph(col.glyph, x + s / 2, y + s / 2, s, 'fill="rgba(255,255,255,0.7)"')
      : Dg.rect(x, y, s, s));
    const layout = [[red, red, blue], [red, red, null], [red, blue, null]];
    let grid = '';
    layout.forEach((row, r) => row.forEach((col, c) => (grid += cell(col, 30 + c * 40, 6 + r * 40, 36))));
    return [
      { svg: Dg.svg('0 0 180 130', grid), caption: '가장 많은 색을 찾아' },
      { svg: Dg.svg('0 0 180 130', cell(blue, 36, 41, 48) + cell(red, 96, 41, 48) + Dg.tap(120, 65, 30)), caption: '아래 보기에서 고르기' },
    ];
  }

  constructor(host) {
    this.h = host;
    this.spec = CountGame.levels[host.level - 1];
    this.round = 0;
    this.correct = 0;
    this.phase = 'wait';
  }

  start() {
    const { stage, level } = this.h;
    stage.append(U.el('div', 'stage-title', `${CountGame.title} · Lv.${level}`));
    this.msg = U.el('div', 'stage-msg', '');
    this.wrap = U.el('div', 'cnt-wrap');
    this.progress = U.el('div', 'dots');
    for (let i = 0; i < CountGame.ROUNDS; i++) this.progress.append(U.el('span'));
    this.grid = U.el('div', 'cnt-grid');
    this.opts = U.el('div', 'cnt-opts');
    // 안내 문구는 격자 바로 위에 둔다
    this.wrap.append(this.progress, this.msg, this.grid, this.opts);
    stage.append(this.wrap);
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(stage);
    this.next();
  }

  next() {
    const [rows, cols] = this.spec.grid;
    // counts와 palette는 모두 개수 내림차순 — 0번이 언제나 정답이다
    this.counts = CountGame.makeCounts(this.spec);
    this.palette = U.shuffle([...COUNT_COLORS]).slice(0, this.spec.colors);
    const owner = CountGame.place(this.counts, rows, cols, this.spec.clump);

    U.say(this.msg, '가장 많은 색을 고르세요', 'act');
    [...this.progress.children].forEach((d, i) => d.classList.toggle('cur', i === this.round));

    this.grid.innerHTML = '';
    this.grid.style.setProperty('--cols', cols);
    this.cells = owner.map((ci) => {
      const cell = U.el('div', 'ccell');
      if (ci >= 0) {
        const col = this.palette[ci];
        cell.classList.add('lit');
        cell.dataset.c = String(ci);
        cell.style.background = col.fill;
        cell.innerHTML = `<svg viewBox="0 0 100 100">${col.glyph}</svg>`;
      }
      this.grid.append(cell);
      return cell;
    });

    this.opts.innerHTML = '';
    this.btns = U.shuffle(this.palette.map((col, i) => ({ col, i }))).map(({ col, i }) => {
      const b = U.el('button', 'cnt-opt', `<svg viewBox="0 0 100 100">${col.glyph}</svg><span class="n"></span>`);
      b.style.background = col.fill;
      b.addEventListener('pointerdown', () => this.pick(i, b));
      this.opts.append(b);
      return { b, i };
    });

    this.layout();
    this.phase = 'input';
    this.h.question({ grid: [rows, cols], colors: this.palette.map((c) => c.id), counts: this.counts, cells: owner });
    this.h.timer(this.counts.reduce((a, b) => a + b, 0), () => this.pick(-1, null));
  }

  layout() {
    const s = this.h.stage;
    const [rows, cols] = this.spec.grid;
    // 안내 문구·진행 점·보기 버튼이 쓰는 높이를 뺀 나머지에 격자를 맞춘다
    const avail = s.clientHeight - 310;
    const sz = U.clamp(Math.min(avail / rows, (s.clientWidth - 120) / cols), 22, 92);
    this.wrap.style.setProperty('--csz', `${sz}px`);
  }

  // i = 고른 색 (0 이 정답). -1 이면 시간이 다 된 것
  pick(i, btn) {
    if (this.phase !== 'input') return;
    this.phase = 'wait';
    this.h.stopTimer();
    const ok = i === 0;
    this.h.answer({ picked: i >= 0 ? this.palette[i].id : null, count: i >= 0 ? this.counts[i] : null, correct: ok, timedOut: !btn });

    // 보기마다 실제 개수를 적어 주고, 정답 색이 아닌 칸은 흐리게 해서 왜 그 색인지 보이게 한다
    this.btns.forEach(({ b, i: j }) => {
      b.querySelector('.n').textContent = String(this.counts[j]);
      if (j === 0) b.classList.add('right');
      b.disabled = true;
    });
    if (!ok && btn) btn.classList.add('wrong');
    this.cells.forEach((c) => {
      if (c.classList.contains('lit') && c.dataset.c !== '0') c.classList.add('dim');
    });

    const d = this.progress.children[this.round];
    d.classList.remove('cur');
    d.classList.add(ok ? 'right' : 'wrong');

    if (ok) {
      this.correct++;
      U.say(this.msg, '정답!', 'good');
      this.h.award((this.h.base * this.h.mult) / CountGame.ROUNDS, this.grid);
      this.h.sfx('good');
    } else {
      U.say(this.msg, `${btn ? '' : '시간 초과 · '}가장 많은 색은 ${this.counts[0]}칸`, 'bad');
      this.h.sfx('bad');
    }
    this.h.after(ok ? 1000 : 1600, () => this.advance());
  }

  advance() {
    this.round++;
    if (this.round < CountGame.ROUNDS) return this.next();
    this.ro.disconnect();
    this.h.done(this.result());
  }

  result() {
    return { cleared: this.correct === CountGame.ROUNDS, correct: this.correct, total: CountGame.ROUNDS };
  }

  // 점수는 맞힐 때마다 바로 지급하므로 중단될 때 따로 줄 것이 없다
  abort() {
    this.ro.disconnect();
    return { cleared: false, correct: this.correct, total: this.round };
  }

  // ---- 개수 배분 ----
  // 1위만 2위보다 정확히 margin만큼 많게 고정하고, 나머지 색은 2위 이하에서 무작위로 뽑는다.
  // 비우승 색끼리는 개수가 겹쳐도 된다. 모든 색을 서로 다르게 두면 개수가 늘 같은 계단(7·6·5·4·3)이 되어
  // '제일 많은 색 고르기'가 아니라 '7개짜리 찾기'가 되어 버린다. 2위 개수도 라운드마다 흔들어
  // 정답의 절대 개수를 외울 수 없게 한다.
  static makeCounts({ colors, cells, margin, spread }) {
    const floor = (s) => Math.max(1, s - spread);                       // 비우승 색이 내려갈 수 있는 하한
    const least = (s) => s + margin + s + (colors - 2) * floor(s);      // 그 2위 개수로 가능한 최소 총량
    let hi = 1;
    while (least(hi + 1) <= cells) hi++;

    for (let tries = 0; tries < 200; tries++) {
      const second = Math.max(1, hi - U.rand(2));
      const list = [second + margin, second];
      while (list.length < colors) list.push(U.randInt(floor(second), second));
      if (list.reduce((a, b) => a + b, 0) <= cells) return list;
    }
    return [hi + margin, hi, ...Array(Math.max(0, colors - 2)).fill(floor(hi))];
  }

  // ---- 배치: clump 확률로 같은 색을 이웃 칸에 붙인다 ----
  // 2위 색을 먼저 놓아 격자 전체로 퍼지게 한다. 넓게 퍼진 색은 실제보다 많아 보여서 눈대중을 방해한다.
  static place(counts, rows, cols, clump) {
    const total = rows * cols;
    const owner = new Array(total).fill(-1);
    const free = new Set(Array.from({ length: total }, (_, i) => i));
    const order = counts.map((_, i) => i);
    if (order.length >= 2) [order[0], order[1]] = [order[1], order[0]];

    for (const ci of order) {
      const mine = [];
      for (let k = 0; k < counts[ci]; k++) {
        let pick = -1;
        if (mine.length && Math.random() < clump) {
          const nbrs = [];
          for (const idx of mine) {
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
              if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
              const n = nr * cols + nc;
              if (free.has(n)) nbrs.push(n);
            }
          }
          if (nbrs.length) pick = nbrs[U.rand(nbrs.length)];
        }
        if (pick < 0) {
          const arr = [...free];
          if (!arr.length) break;
          pick = arr[U.rand(arr.length)];
        }
        free.delete(pick);
        mine.push(pick);
        owner[pick] = ci;
      }
    }
    return owner;
  }
}
