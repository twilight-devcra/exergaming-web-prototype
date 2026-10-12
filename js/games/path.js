// 길 따라 그리기
// 왼쪽 열의 한 칸에서 시작해 오른쪽 열까지 이어지는 경로를 한 칸씩 보여준 뒤, 같은 순서대로 선택하게 한다.
class PathGame {
  static id = 'path';
  static title = '길 따라 그리기';
  static hint = '불이 켜지며 만들어지는 길을 기억했다가<br>같은 순서대로 칸을 눌러 길을 완성하세요';
  static sizes = [[3, 4], [3, 5], [4, 6], [5, 7], [5, 8], [6, 9]]; // [행, 열] = 난이도
  static maxLevel = PathGame.sizes.length;
  static STEP_MS = 380; // 경로 한 칸을 보여주는 시간 (난이도와 무관하게 고정)

  constructor(host) {
    this.h = host;
    [this.rows, this.cols] = PathGame.sizes[host.level - 1];
    this.k = 1;          // 다음에 선택해야 할 경로 인덱스
    this.phase = 'show';
    this.lines = [];
  }

  start() {
    const { stage, level } = this.h;
    stage.append(U.el('div', 'stage-title', `${PathGame.title} · Lv.${level}`));
    this.msg = U.el('div', 'stage-msg', '잘 보세요');
    stage.append(this.msg);
    this.board = U.el('div', 'path-board');
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.board.append(this.svg);
    stage.append(this.board);

    this.path = PathGame.genPath(this.rows, this.cols);
    this.cells = [];
    for (let r = 0; r < this.rows; r++) {
      this.cells[r] = [];
      for (let c = 0; c < this.cols; c++) {
        const cell = U.el('div', 'pcell');
        cell.addEventListener('pointerdown', () => this.pick(r, c));
        this.board.append(cell);
        this.cells[r][c] = cell;
      }
    }
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.board);
    this.layout();

    const [sr, sc] = this.path[0];
    this.cells[sr][sc].classList.add('start');
    for (let i = 1; i < this.path.length; i++) {
      this.h.after(500 + i * PathGame.STEP_MS, () => {
        const [r, c] = this.path[i];
        this.cells[r][c].classList.add('on');
        this.addLine(i - 1, i, '');
        this.h.sfx('blink');
      });
    }
    this.h.after(500 + this.path.length * PathGame.STEP_MS + 600, () => this.beginInput());
  }

  beginInput() {
    for (let i = 1; i < this.path.length; i++) {
      const [r, c] = this.path[i];
      this.cells[r][c].classList.remove('on');
    }
    this.clearLines();
    this.cells.flat().forEach((cell) => cell.classList.add('clickable'));
    this.msg.textContent = '같은 길을 그려보세요';
    this.phase = 'input';
  }

  pick(r, c) {
    if (this.phase !== 'input') return;
    const [nr, nc] = this.path[this.k];
    const cell = this.cells[r][c];
    if (r === nr && c === nc) {
      cell.classList.add('on');
      this.addLine(this.k - 1, this.k, '');
      const per = (this.h.base * 0.6 * this.h.mult) / (this.path.length - 1);
      this.h.award(per, cell);
      this.h.sfx('tap');
      this.k++;
      if (this.k === this.path.length) this.complete();
    } else {
      this.fail(cell);
    }
  }

  complete() {
    this.phase = 'end';
    this.path.forEach(([r, c]) => this.cells[r][c].classList.add('done'));
    this.svg.querySelectorAll('line').forEach((l) => l.classList.add('done'));
    const [lr, lc] = this.path[this.path.length - 1];
    this.h.after(200, () => this.h.award(this.h.base * 0.4 * this.h.mult, this.cells[lr][lc], '완성 '));
    this.msg.textContent = '완성!';
    this.msg.className = 'stage-msg good';
    this.h.sfx('good');   // 다 맞혔을 때의 축하음은 host가 따로 울린다
    this.cleared = true;
    this.h.after(1100, () => this.finish());
  }

  fail(cell) {
    this.phase = 'end';
    cell.classList.add('wrong');
    this.msg.textContent = '틀렸어요';
    this.msg.className = 'stage-msg bad';
    this.h.sfx('bad');
    // 남은 정답 경로를 흐리게 보여준다
    for (let i = this.k; i < this.path.length; i++) {
      const [r, c] = this.path[i];
      this.cells[r][c].classList.add('ghost');
      this.addLine(i - 1, i, 'ghost');
    }
    this.h.after(1500, () => this.finish());
  }

  result() {
    return {
      cleared: !!this.cleared,
      correct: this.k - 1,
      total: this.path.length - 1,
    };
  }

  finish() {
    this.ro.disconnect();
    this.h.done(this.result());
  }

  abort() {
    this.ro.disconnect();
    return this.result();
  }

  // ---- 그리기 ----
  layout() {
    const w = this.board.clientWidth;
    const h = this.board.clientHeight;
    const gapR = 0.22;
    const size = Math.min(
      w / (this.cols + (this.cols - 1) * gapR),
      h / (this.rows + (this.rows - 1) * gapR),
      120
    );
    const gap = size * gapR;
    const ox = (w - (size * this.cols + gap * (this.cols - 1))) / 2;
    const oy = (h - (size * this.rows + gap * (this.rows - 1))) / 2;
    this.geo = { size, gap, ox, oy };
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const s = this.cells[r][c].style;
        s.left = `${ox + c * (size + gap)}px`;
        s.top = `${oy + r * (size + gap)}px`;
        s.width = s.height = `${size}px`;
      }
    }
    this.lines.forEach((l) => this.placeLine(l));
  }

  center(i) {
    const [r, c] = this.path[i];
    const { size, gap, ox, oy } = this.geo;
    return [ox + c * (size + gap) + size / 2, oy + r * (size + gap) + size / 2];
  }

  addLine(i, j, cls) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    if (cls) el.setAttribute('class', cls);
    const l = { i, j, el };
    this.placeLine(l);
    this.svg.append(el);
    this.lines.push(l);
  }

  placeLine({ i, j, el }) {
    // 칸 사이의 틈만 잇는 짧은 선
    const [x1, y1] = this.center(i);
    const [x2, y2] = this.center(j);
    const half = this.geo.size / 2 - 4;
    const dx = Math.sign(x2 - x1);
    const dy = Math.sign(y2 - y1);
    el.setAttribute('x1', x1 + dx * half);
    el.setAttribute('y1', y1 + dy * half);
    el.setAttribute('x2', x2 - dx * half);
    el.setAttribute('y2', y2 - dy * half);
  }

  clearLines() {
    this.lines.forEach((l) => l.el.remove());
    this.lines = [];
  }

  // ---- 경로 생성 ----
  // 상하좌우 이동, 자기 자신과 맞닿지 않는(헷갈리지 않는) 경로를 랜덤 DFS로 생성
  static genPath(rows, cols) {
    const minLen = cols + Math.floor(rows / 2);
    const maxLen = cols + rows + 2;
    const moves = [
      { dr: 0, dc: 1, w: 3 },
      { dr: -1, dc: 0, w: 2 },
      { dr: 1, dc: 0, w: 2 },
      { dr: 0, dc: -1, w: 0.5 },
    ];
    const key = (r, c) => r * 100 + c;

    for (let attempt = 0; attempt < 300; attempt++) {
      const path = [[U.rand(rows), 0]];
      const visited = new Set([key(...path[0])]);
      let budget = 4000;

      const touchesOther = (r, c, fromR, fromC) => {
        for (const [ar, ac] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
          if (ar === fromR && ac === fromC) continue;
          if (visited.has(key(ar, ac))) return true;
        }
        return false;
      };

      const dfs = () => {
        if (--budget < 0) return false;
        const [r, c] = path[path.length - 1];
        if (c === cols - 1) return path.length >= minLen;
        if (path.length >= maxLen) return false;
        const order = moves
          .map((m) => ({ m, s: Math.pow(Math.random(), 1 / m.w) }))
          .sort((a, b) => b.s - a.s)
          .map((o) => o.m);
        for (const { dr, dc } of order) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          if (visited.has(key(nr, nc)) || touchesOther(nr, nc, r, c)) continue;
          path.push([nr, nc]);
          visited.add(key(nr, nc));
          if (dfs()) return true;
          path.pop();
          visited.delete(key(nr, nc));
        }
        return false;
      };

      if (dfs()) return path;
    }
    const r = U.rand(rows);
    return Array.from({ length: cols }, (_, c) => [r, c]);
  }
}
