// 길 따라 그리기
// 격자 위에 경로를 한 칸씩 보여준 뒤, 같은 순서대로 선택하게 한다.
// 난이도는 격자를 키우는 대신 길을 더 꼬아서 올린다. 곧게 뻗은 구간은 한 덩어리로 외워지므로
// 기억에 부담을 주는 것은 길이보다 꺾이는 횟수다.
//   grid  — 격자 [행, 열]
//   len   — 경로의 칸 수 범위
//   turns — 최소 꺾임 횟수
//   free  — 꺼져 있으면 왼쪽 열에서 시작해 오른쪽 열에서 끝난다 (진행 방향을 짐작할 수 있다).
//           켜면 아무 칸에서나 시작해 아무 데서나 끝나고, 되돌아가기도 한다.
//           이때는 길이 한쪽 구석에 뭉치지 않도록 격자의 거의 전체 폭과 높이에 걸치게 만든다.
//   touch — 길이 자기 자신 바로 옆을 지나가도 되는 칸 수. 옆 칸이 다음 칸인지 헷갈리게 된다.
//           제한 없이 두면 길이 한 덩어리로 뭉쳐 버리므로 몇 칸까지만 허용한다.
//   step  — 한 칸을 보여주는 시간(ms). 쉬운 단계(Lv1·Lv2)만 따로 정하고, 나머지는 STEP_MS 로 고정이다.
import { U } from '../config.js';
import { Dg } from '../diagram.js';
import { Sfx } from '../sfx.js';
import { Tag } from './tags.js';
import { Phase } from './kit.js';

export class PathGame {
  static id = 'path';
  static tags = [Tag.MEMORY, Tag.TRACE];
  static title = '길 따라 그리기';
  static hint = '불이 켜지며 만들어지는 길을 기억했다가<br>같은 순서대로 칸을 눌러 길을 완성하세요';
  static levels = [
    // 쉬운 단계: 짧은 길을 천천히 보여준다
    { grid: [3, 3], len: [4, 4], turns: 1, step: 560 },
    { grid: [3, 4], len: [4, 5], turns: 1, step: 470 },
    { grid: [3, 4], len: [5, 6], turns: 1 },
    { grid: [3, 5], len: [6, 8], turns: 2 },
    { grid: [4, 5], len: [8, 9], turns: 4 },
    { grid: [4, 6], len: [10, 11], turns: 5, free: true },
    { grid: [5, 6], len: [12, 13], turns: 7, free: true, touch: 2 },
    { grid: [5, 7], len: [14, 15], turns: 9, free: true, touch: 3 },
  ];
  static maxLevel = PathGame.levels.length;
  static STEP_MS = 380; // 경로 한 칸을 보여주는 시간 (쉬운 단계 말고는 난이도와 무관하게 고정)

  // 소개 그림: ① 켜지는 길을 보고 ② 같은 순서로 누른다
  static diagram() {
    const CELL = 34, GAP = 8;
    const at = (row, col) => [8 + col * (CELL + GAP), 8 + row * (CELL + GAP)];
    const mid = (row, col) => at(row, col).map((coord) => coord + CELL / 2);
    const path = [[1, 0], [1, 1], [0, 1], [0, 2], [1, 2], [1, 3]];
    const k = (row, col) => path.findIndex(([pr, pc]) => pr === row && pc === col);
    const grid = (cls) => {
      let svg = '';
      for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) svg += Dg.rect(...at(row, col), CELL, CELL, cls(k(row, col)));
      return svg;
    };
    const line = `<polyline class="dg-line" points="${path.map((cell) => mid(...cell).join(',')).join(' ')}"/>`;
    const nums = (n, cls) => path.slice(0, n).map((cell, i) => Dg.text(...mid(...cell), i + 1, 17, cls)).join('');

    // ②는 길의 칸을 1번부터 차례로 눌러 채우는 모습을 되풀이한다 (누를 칸 전부와 그 순서가 보이게).
    // 한 바퀴 = 첫 칸까지 LEAD, 칸마다 STEP, 다 채운 뒤 HOLD 만큼 멈춤. SMIL 로 그림 안에서 돌린다
    const LEAD = 0.4, STEP = 0.5, HOLD = 1.1;
    const dur = LEAD + STEP * path.length + HOLD;
    const t = (i) => ((LEAD + STEP * i) / dur).toFixed(4);   // i번째 칸을 누르는 순간 (한 바퀴 중 비율)
    const end = ((dur - 0.15) / dur).toFixed(4);             // 바퀴 끝에서 모두 지운다
    const show = (i) => `<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;${t(i)};${t(i)};${end};1" dur="${dur}s" repeatCount="indefinite"/>`;
    const pressed = path.map((cell, i) => {
      const [x, y] = at(...cell);
      return `<g opacity="0">${Dg.rect(x, y, CELL, CELL, 'dg-on')}${Dg.text(x + CELL / 2, y + CELL / 2, i + 1, 17, 'dg-txt on')}${show(i)}</g>`;
    }).join('');
    // 누르는 표시는 칸이 채워지기 반 박자 전에 그 칸으로 옮겨 간다 (같은 색으로 채워진 칸 위에서는 고리가 묻혀 보이지 않는다).
    // 다 채운 뒤에는 사라진다
    const pts = path.map((cell) => mid(...cell));
    const keys = `0;${path.map((_, i) => ((LEAD - STEP / 2 + STEP * i) / dur).toFixed(4)).join(';')}`;
    const ring = `<circle class="dg-tap" cx="${pts[0][0]}" cy="${pts[0][1]}" r="17">` +
      `<animate attributeName="cx" values="${pts[0][0]};${pts.map((point) => point[0]).join(';')}" keyTimes="${keys}" calcMode="discrete" dur="${dur}s" repeatCount="indefinite"/>` +
      `<animate attributeName="cy" values="${pts[0][1]};${pts.map((point) => point[1]).join(';')}" keyTimes="${keys}" calcMode="discrete" dur="${dur}s" repeatCount="indefinite"/>` +
      `<animate attributeName="visibility" values="visible;hidden" keyTimes="0;${((LEAD + STEP * (path.length - 1) + 0.05) / dur).toFixed(4)}" calcMode="discrete" dur="${dur}s" repeatCount="indefinite"/></circle>`;
    return [
      { svg: Dg.svg('0 0 176 134', grid((i) => (i >= 0 ? 'dg-soft' : 'dg-cell')) + line + nums(path.length, 'dg-txt num')), caption: '켜지는 길을 보고' },
      { svg: Dg.svg('0 0 176 134', grid(() => 'dg-cell') + pressed + ring), caption: '같은 순서로 하나씩 누르기' },
    ];
  }

  /** @param {import('./host.js').GameHost} host */

  constructor(host) {
    this.host = host;
    this.spec = PathGame.levels[host.level - 1];
    [this.rows, this.cols] = this.spec.grid;
    this.nextStep = 1;          // 다음에 선택해야 할 경로 인덱스
    this.phase = Phase.SHOW;
    this.lines = [];
  }

  start() {
    const { stage, level } = this.host;
    this.message = U.el('div', 'stage-msg look', '길을 잘 보세요');
    const { body } = U.frame(stage, `${PathGame.title} · Lv.${level}`, this.message);
    this.board = U.el('div', 'path-board');
    // 판을 격자가 차지할 만큼만 키워서 남는 자리의 가운데에 오게 한다 (칸 최대 120px · 틈 22%)
    this.board.style.maxHeight = `${this.rows * 120 + (this.rows - 1) * 120 * 0.22}px`;
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.board.append(this.svg);
    body.append(this.board);

    this.path = PathGame.genPath(this.spec);
    this.cells = [];
    for (let row = 0; row < this.rows; row++) {
      this.cells[row] = [];
      for (let col = 0; col < this.cols; col++) {
        const cell = U.el('div', 'pcell');
        cell.addEventListener('pointerdown', () => this.pick(row, col));
        this.board.append(cell);
        this.cells[row][col] = cell;
      }
    }
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.board);
    this.layout();

    const [sr, sc] = this.path[0];
    this.cells[sr][sc].classList.add('start');
    const step = this.spec.step || PathGame.STEP_MS;
    for (let i = 1; i < this.path.length; i++) {
      this.host.after(500 + i * step, () => {
        this.light(i);
        this.host.sfx(Sfx.BLINK);
      });
    }
    this.host.after(500 + this.path.length * step + 600, () => this.beginInput());
  }

  beginInput() {
    for (let i = 1; i < this.path.length; i++) {
      const [row, col] = this.path[i];
      this.cells[row][col].classList.remove('on', 'head');
    }
    this.clearLines();
    this.cells.flat().forEach((cell) => cell.classList.add('clickable'));
    U.say(this.message, '같은 순서로 누르세요', 'act');
    this.phase = Phase.INPUT;
    this.host.question({ grid: [this.rows, this.cols], path: this.path, free: !!this.spec.free });
    this.host.timer(this.path.length - 1, () => this.fail(null));
  }

  // 경로의 i번째 칸을 켠다. 가장 최근에 켜진 칸만 진하게 두고 지나온 칸은 옅게 물러난다.
  // 전부 진하게 두면 길이 자기 옆을 지날 때 붙은 칸들이 한 덩어리로 보여 순서를 읽을 수 없다.
  light(i) {
    if (this.head) this.head.classList.remove('head');
    const [row, col] = this.path[i];
    this.head = this.cells[row][col];
    this.head.classList.add('on', 'head');
    this.addLine(i - 1, i, '');
  }

  pick(row, col) {
    if (this.phase !== Phase.INPUT) return;
    // 이미 지나온 칸을 다시 누른 것은 틀린 게 아니다 (길은 같은 칸을 두 번 지나지 않는다)
    if (this.path.slice(0, this.nextStep).some(([pr, pc]) => pr === row && pc === col)) return;
    const [nr, nc] = this.path[this.nextStep];
    const cell = this.cells[row][col];
    if (row === nr && col === nc) {
      this.host.input({ cell: [row, col], ok: true, step: this.nextStep });
      this.light(this.nextStep);
      const per = (this.host.base * 0.6 * this.host.mult) / (this.path.length - 1);
      this.host.award(per, cell);
      this.host.sfx(Sfx.TAP);
      this.nextStep++;
      if (this.nextStep === this.path.length) this.complete();
    } else {
      this.fail(cell, [row, col]);
    }
  }

  complete() {
    this.phase = Phase.END;
    this.host.stopTimer();
    this.path.forEach(([row, col]) => this.cells[row][col].classList.add('done'));
    this.svg.querySelectorAll('line').forEach((line) => line.classList.add('done'));
    const [lr, lc] = this.path[this.path.length - 1];
    this.host.after(200, () => this.host.award(this.host.base * 0.4 * this.host.mult, this.cells[lr][lc], '완성 '));
    U.say(this.message, '완성!', 'good');
    this.host.sfx(Sfx.GOOD);   // 다 맞혔을 때의 축하음은 host가 따로 울린다
    this.cleared = true;
    this.host.answer({ correct: true, timedOut: false, reached: this.path.length - 1, of: this.path.length - 1 });
    this.host.after(1100, () => this.finish());
  }

  // cell = 잘못 누른 칸 (rc 는 그 좌표). null 이면 시간이 다 된 것
  fail(cell, rc = null) {
    if (this.phase !== Phase.INPUT) return;
    this.phase = Phase.END;
    this.host.stopTimer();
    this.host.answer({ correct: false, timedOut: !cell, wrongCell: rc, reached: this.nextStep - 1, of: this.path.length - 1 });
    if (cell) cell.classList.add('wrong');
    U.say(this.message, cell ? '틀렸어요' : '시간 초과', 'bad');
    this.host.sfx(Sfx.BAD);
    // 남은 정답 경로를 흐리게 보여준다
    for (let i = this.nextStep; i < this.path.length; i++) {
      const [row, col] = this.path[i];
      this.cells[row][col].classList.add('ghost');
      this.addLine(i - 1, i, 'ghost');
    }
    this.host.after(1500, () => this.finish());
  }

  result() {
    return {
      cleared: !!this.cleared,
      correct: this.nextStep - 1,
      total: this.path.length - 1,
    };
  }

  finish() {
    this.resizeObserver.disconnect();
    this.host.done(this.result());
  }

  abort() {
    this.resizeObserver.disconnect();
    return this.result();
  }

  // ---- 그리기 ----
  layout() {
    const width = this.board.clientWidth;
    const height = this.board.clientHeight;
    const gapR = 0.22;
    const size = Math.min(
      width / (this.cols + (this.cols - 1) * gapR),
      height / (this.rows + (this.rows - 1) * gapR),
      120
    );
    const gap = size * gapR;
    const ox = (width - (size * this.cols + gap * (this.cols - 1))) / 2;
    const oy = (height - (size * this.rows + gap * (this.rows - 1))) / 2;
    this.geometry = { size, gap, ox, oy };
    // 칸들이 차지하는 자리: 운영 버전은 여기에만 흰 판 바탕을 깐다 (app/app.css .path-board::before)
    const bs = this.board.style;
    bs.setProperty('--mat-x', `${ox}px`);
    bs.setProperty('--mat-y', `${oy}px`);
    bs.setProperty('--mat-w', `${size * this.cols + gap * (this.cols - 1)}px`);
    bs.setProperty('--mat-h', `${size * this.rows + gap * (this.rows - 1)}px`);
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const style = this.cells[row][col].style;
        style.left = `${ox + col * (size + gap)}px`;
        style.top = `${oy + row * (size + gap)}px`;
        style.width = style.height = `${size}px`;
      }
    }
    this.lines.forEach((line) => this.placeLine(line));
  }

  center(i) {
    const [row, col] = this.path[i];
    const { size, gap, ox, oy } = this.geometry;
    return [ox + col * (size + gap) + size / 2, oy + row * (size + gap) + size / 2];
  }

  addLine(i, j, cls) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    if (cls) el.setAttribute('class', cls);
    const line = { i, j, el };
    this.placeLine(line);
    this.svg.append(el);
    this.lines.push(line);
  }

  placeLine({ i, j, el }) {
    // 칸 사이의 틈만 잇는 짧은 선
    const [x1, y1] = this.center(i);
    const [x2, y2] = this.center(j);
    const half = this.geometry.size / 2 - 4;
    const dx = Math.sign(x2 - x1);
    const dy = Math.sign(y2 - y1);
    el.setAttribute('x1', x1 + dx * half);
    el.setAttribute('y1', y1 + dy * half);
    el.setAttribute('x2', x2 - dx * half);
    el.setAttribute('y2', y2 - dy * half);
  }

  clearLines() {
    this.lines.forEach((line) => line.el.remove());
    this.lines = [];
  }

  // ---- 경로 생성 ----
  // 상하좌우로만 움직이는 경로를 랜덤 DFS로 만든다. 길이는 len 범위에서 먼저 정하고 정확히 그 길이로 맞춘다.
  static genPath({ grid: [rows, cols], len, turns, free = false, touch = 0 }) {
    const key = (row, col) => row * 100 + col;
    const moves = [
      { dr: 0, dc: 1, w: free ? 1 : 3 },
      { dr: -1, dc: 0, w: free ? 1 : 2 },
      { dr: 1, dc: 0, w: free ? 1 : 2 },
      { dr: 0, dc: -1, w: free ? 1 : 0.5 },
    ];
    // 꺾임이 많이 필요한 단계에서는 직진보다 꺾는 쪽을 먼저 시도한다
    const turnBias = turns >= 4 ? 2 : 1;

    // 조건이 너무 빡빡해 못 찾으면 꺾임 조건을 하나씩 풀어 가며 다시 시도한다
    for (let need = turns; need >= 0; need--) {
      for (let attempt = 0; attempt < 200; attempt++) {
        const length = U.randInt(len[0], len[1]);
        const path = [[U.rand(rows), free ? U.rand(cols) : 0]];
        const visited = new Set([key(...path[0])]);
        let budget = 4000;

        // (r, c)에 들어서면 직전 칸 말고 이미 지나온 칸 몇 개와 맞닿게 되는가
        const contacts = (row, col, fromR, fromC) => {
          let n = 0;
          for (const [ar, ac] of [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]) {
            if (ar === fromR && ac === fromC) continue;
            if (visited.has(key(ar, ac))) n++;
          }
          return n;
        };
        // 자유 경로는 격자의 거의 전체 폭과 높이에 걸쳐야 한다
        const spread = () => {
          const rs = path.map((cell) => cell[0]);
          const cs = path.map((cell) => cell[1]);
          return Math.max(...rs) - Math.min(...rs) >= rows - 2 && Math.max(...cs) - Math.min(...cs) >= cols - 2;
        };

        // last = 직전 이동, bends = 지금까지 꺾인 횟수, touched = 자기 옆을 지나간 칸 수
        const dfs = (last, bends, touched) => {
          if (--budget < 0) return false;
          const [row, col] = path[path.length - 1];
          if (path.length === length) return bends >= need && (free ? spread() : col === cols - 1);
          // 남은 칸을 전부 꺾어도 모자라면 더 볼 필요가 없다
          if (bends + (length - path.length) < need) return false;
          const order = moves
            .map((move) => ({ move, score: Math.pow(Math.random(), 1 / (move.w * (last && move !== last ? turnBias : 1))) }))
            .sort((a, b) => b.score - a.score)
            .map((entry) => entry.move);
          for (const move of order) {
            const nr = row + move.dr;
            const nc = col + move.dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            if (visited.has(key(nr, nc))) continue;
            const t = touched + contacts(nr, nc, row, col);
            if (t > touch) continue;
            path.push([nr, nc]);
            visited.add(key(nr, nc));
            if (dfs(move, bends + (last && move !== last ? 1 : 0), t)) return true;
            path.pop();
            visited.delete(key(nr, nc));
          }
          return false;
        };

        if (dfs(null, 0, 0)) return path;
      }
    }
    const lane = U.rand(rows);
    return Array.from({ length: cols }, (_, col) => [lane, col]);
  }
}
