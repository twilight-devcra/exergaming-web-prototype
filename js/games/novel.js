// 없던 그림 찾기
// 판에 그림 몇 개를 잠깐 보여 준 뒤 가림막을 내렸다 올린다. 그사이 처음 보는 그림 하나가 나타난다 —
// 빈 칸에 더해지거나(add) 있던 그림 하나를 밀어내고 들어간다(replace). 그 없던 그림을 누른다.
// 문제 3개는 이어진다: 답하고 나면 지금 판을 잠깐 다시 보여 주고 또 가림막을 내려 다음 새 그림을 낸다.
// 그림은 튀어나오는 효과 없이 그대로 놓인다 — 답한 뒤 판을 다시 그릴 때 그림이 튀면 새 그림처럼 보인다.
// 판마다 처음부터 외우게 하면 한 판이 10초를 훌쩍 넘는다.
// 없어진 그림은 누를 곳이 없고, 돌아간 그림은 다른 게임(빈자리 채우기 등)에서 같은 그림으로 치므로 둘 다 쓰지 않는다.
// 같은 까닭으로 모양·무늬에 서로 돌린 것(네모와 마름모, 가로줄과 세로줄 같은)을 넣지 않는다.
// 한 번 판에 나왔던 그림은 '새 그림'으로 다시 내지 않는다.
//
// 그림 = 바깥 모양(NOVEL_SHAPES) + 안쪽 흰 무늬(NOVEL_MARKS). 한 가지 색의 납작한 모양만으로는 그림이 열몇 개뿐이라
// 높은 단계에서 모자라고, 미묘한 변화를 줄 거리도 없다. 무늬를 더하면 55가지가 되고 색에 기대지 않는다 (색약 대응).
// 낮은 단계는 무늬 없이 모양만 쓴다.
// 가려진 사이 있던 그림들의 자리를 바꿀 수도 있다(shuffle). 그러면 자리로는 못 찾고 무슨 그림이 있었는지를 기억해야 한다.
// 너무 어려워서 지금은 어느 단계도 쓰지 않는다 (2026-10-22). 다시 쓰려면 levels 에 shuffle 을 넣는다.
// 난이도:
//   n       — 처음 그림 수
//   grid    — [행, 열]
//   show    — 처음 판을 보여 주는 시간(ms). 문제 사이에 다시 보여 주는 시간은 그 60% (1.2초 이상)
//   marks   — 쓰는 무늬 가짓수 (1 = 무늬 없음만)
//   replace — 있던 그림을 밀어내고 들어갈 확률 (나머지는 빈 칸에 더해진다). 밀어내면 그림 수가 그대로라 세어 봐서는 모른다
//   shuffle — 가려진 사이 자리를 바꾸는 그림 수 (없거나 0 = 그대로, 'all' = 모두). 지금은 쓰지 않는다
//   similar — 새 그림이 판에 있는 그림과 모양은 같고 무늬만 다를 확률. 그 밖에는 판에 없는 모양으로 고른다
const NOVEL_SHAPES = (() => {
  const poly = (k, r, cy, rot) => Array.from({ length: k }, (_, i) => {
    const a = ((rot + (360 / k) * i) * Math.PI) / 180;
    return `${(50 + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
  }).join(' ');
  const star = Array.from({ length: 10 }, (_, i) => {
    const a = ((-90 + i * 36) * Math.PI) / 180;
    const rad = i % 2 ? 24 : 48;
    return `${(50 + Math.cos(a) * rad).toFixed(1)},${(54 + Math.sin(a) * rad).toFixed(1)}`;
  }).join(' ');
  // 무늬가 들어가도록 속이 꽉 찬 모양만 쓴다. cy = 무늬를 놓을 가운데 높이. 모양이 모두 달라 색이 겹쳐도 된다
  return [
    { id: 'circle', cy: 50, svg: '<circle cx="50" cy="50" r="42" fill="#e5484d"/>' },
    { id: 'square', cy: 50, svg: '<rect x="10" y="10" width="80" height="80" rx="7" fill="#2f6fed"/>' },
    { id: 'triangle', cy: 63, svg: '<polygon points="50,6 96,92 4,92" fill="#1f9d55"/>' },
    { id: 'star', cy: 56, svg: `<polygon points="${star}" fill="#e09b00"/>` },
    { id: 'plus', cy: 50, svg: '<path d="M35 5h30v30h30v30H65v30H35V65H5V35h30z" fill="#f76808"/>' },
    { id: 'heart', cy: 48, svg: '<path d="M50 93 L10 54 A23 23 0 0 1 50 19 A23 23 0 0 1 90 54 Z" fill="#e5484d"/>' },
    { id: 'drop', cy: 62, svg: '<path d="M50 4 C62 24 86 44 86 62 A36 36 0 0 1 14 62 C14 44 38 24 50 4 Z" fill="#06aed5"/>' },
    { id: 'hexagon', cy: 50, svg: `<polygon points="${poly(6, 46, 50, -90)}" fill="#8e4ec6"/>` },
    { id: 'pentagon', cy: 55, svg: `<polygon points="${poly(5, 47, 55, -90)}" fill="#1f9d55"/>` },
    { id: 'dome', cy: 62, svg: '<path d="M6 86 A44 44 0 0 1 94 86 Z" fill="#8e4ec6"/>' },
    { id: 'cloud', cy: 58, svg: '<path d="M24 82 A18 18 0 0 1 22 46 A22 22 0 0 1 60 30 A20 20 0 0 1 82 50 A16 16 0 0 1 78 82 Z" fill="#2f6fed"/>' },
  ];
})();
// 안쪽 무늬 (cy 를 가운데로 그린다). 0 번은 무늬 없음. 흰색에 옅은 테두리를 둘러 노랑·하늘색 위에서도 보이게 한다
const NOVEL_MARKS = [
  { id: 'none', svg: () => '' },
  { id: 'dot', svg: (cy) => `<circle cx="50" cy="${cy}" r="10"/>` },
  { id: 'bar', svg: (cy) => `<rect x="31" y="${cy - 6}" width="38" height="12" rx="4"/>` },
  { id: 'ring', svg: (cy) => `<circle cx="50" cy="${cy}" r="12" fill="none" stroke="#fff" stroke-width="7"/>` },
  { id: 'tri', svg: (cy) => `<polygon points="50,${cy - 13} 63,${cy + 10} 37,${cy + 10}"/>` },
];
function novelPic(s, m) {
  const shape = NOVEL_SHAPES[s];
  const mark = NOVEL_MARKS[m].svg(shape.cy);
  return shape.svg + (mark ? `<g fill="#fff" stroke="rgba(0,0,0,0.22)" stroke-width="2.5" paint-order="stroke">${mark}</g>` : '');
}

class NovelGame {
  static id = 'novel';
  static tags = ['memory']; // 꼬리표가 겹치는 게임끼리는 연달아 나오지 않는다 (main.js planPass)
  static title = '없던 그림 찾기';
  static hint = '그림들을 잘 봐 두었다가<br>가림막이 걷히면 새로 나타난 그림을 누르세요';
  // 첫 판(2026-10-22)은 너무 어려웠다: 그림 수를 줄이고, 보여 주는 시간을 늘리고, 무늬를 늦게 들이고, 자리 바꾸기를 뺐다
  static levels = [
    // 쉬운 단계: 그림이 적고 오래 보여 주며, 새 그림은 늘 빈 칸에 더해진다
    { n: 2, grid: [2, 3], show: 3500, marks: 1, replace: 0 },
    { n: 3, grid: [2, 3], show: 3200, marks: 1, replace: 0 },
    { n: 3, grid: [3, 3], show: 2800, marks: 1, replace: 0.3 },
    { n: 4, grid: [3, 3], show: 2600, marks: 1, replace: 0.4 },
    { n: 4, grid: [3, 3], show: 2400, marks: 1, replace: 0.5 },
    { n: 5, grid: [3, 4], show: 2200, marks: 1, replace: 0.5 },
    // 무늬가 들어온다. 처음에는 모양이 모두 달라 무늬는 덤이고, 마지막 단계에서만 무늬만 다른 새 그림이 나온다
    { n: 5, grid: [3, 4], show: 2000, marks: 3, replace: 0.6 },
    { n: 6, grid: [3, 4], show: 1800, marks: 3, replace: 0.6, similar: 0.4 },
  ];
  static maxLevel = NovelGame.levels.length;
  static QUESTIONS = 3;
  // 가림막: 내려오는 시간 · 다 덮은 채로 있는 시간 · 걷히는 시간 (css .nv-curtain 의 transition 과 같게)
  static CLOSE_MS = 200;
  static HOLD_MS = 120;
  static OPEN_MS = 220;

  // 소개 그림: ① 그림들을 잘 보고 ② 가림막이 걷힌 뒤 새로 나타난 그림을 누른다
  static diagram() {
    const S = 38, G = 9;
    const at = (cell) => [10 + (cell % 3) * (S + G), 10 + Math.floor(cell / 3) * (S + G)];
    const shape = (id) => NOVEL_SHAPES.findIndex((x) => x.id === id);
    const board = (items) => [...Array(6).keys()].map((c) => Dg.rect(...at(c), S, S)).join('') +
      items.map(([c, id]) => Dg.glyph(novelPic(shape(id), 0), ...at(c).map((v) => v + S / 2), 28)).join('');
    const before = [[0, 'circle'], [2, 'star'], [4, 'triangle']];
    const mid = at(5).map((v) => v + S / 2);
    return [
      { svg: Dg.svg('0 0 152 104', board(before)), caption: '그림들을 잘 보고' },
      { svg: Dg.svg('0 0 152 104', board([...before, [5, 'heart']]) + Dg.tap(...mid, 22)), caption: '새로 나타난 그림 누르기' },
    ];
  }

  constructor(host) {
    this.h = host;
    this.spec = NovelGame.levels[host.level - 1];
    [this.rows, this.cols] = this.spec.grid;
    this.answered = 0;
    this.correct = 0;
    this.phase = 'show';
    // 판: [{ s(모양), m(무늬), at(칸) }]. 처음 판은 모양이 모두 다르다
    const cells = U.shuffle([...Array(this.rows * this.cols).keys()]);
    this.board = U.shuffle([...NOVEL_SHAPES.keys()]).slice(0, this.spec.n)
      .map((s, i) => ({ s, m: U.rand(this.spec.marks), at: cells[i] }));
    this.seen = new Set(this.board.map(NovelGame.key)); // 한 번이라도 판에 나온 그림
    this.lastAt = -1;
  }

  static key({ s, m }) {
    return `${s}.${m}`;
  }

  start() {
    const { stage, level } = this.h;
    this.msg = U.el('div', 'stage-msg look', '잘 보세요');
    const { body, dots } = U.frame(stage, `${NovelGame.title} · Lv.${level}`, this.msg, NovelGame.QUESTIONS);
    this.body = body;
    this.progress = dots;
    this.wrap = U.el('div', 'nv-wrap');
    this.grid = U.el('div', 'nv-grid');
    this.grid.style.setProperty('--cols', this.cols);
    this.grid.style.setProperty('--rows', this.rows);
    this.cells = [...Array(this.rows * this.cols).keys()].map((i) => {
      const cell = U.el('div', 'scell');
      cell.addEventListener('pointerdown', () => this.pick(i));
      this.grid.append(cell);
      return cell;
    });
    this.curtain = U.el('div', 'nv-curtain');
    this.grid.append(this.curtain);
    this.wrap.append(this.grid);
    body.append(this.wrap);
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(body);
    this.layout();

    this.render();
    this.h.sfx('blink');
    this.look(this.spec.show);
  }

  layout() {
    const s = this.body;
    const gap = 12;
    const sz = U.clamp(Math.min((s.clientHeight - 12) / this.rows - gap, (s.clientWidth - 40) / this.cols - gap), 48, 130);
    this.wrap.style.setProperty('--sz', `${sz}px`);
  }

  render() {
    this.cells.forEach((c) => {
      c.innerHTML = '';
      c.className = 'scell';
    });
    this.board.forEach(({ s, m, at }) => this.cells[at].append(U.el('div', 'sym', `<svg viewBox="0 0 100 100">${novelPic(s, m)}</svg>`)));
  }

  // 지금 판을 ms 동안 보여 준 뒤 가림막을 내리고, 가려진 사이 판을 바꾼 다음 걷어 올린다
  look(ms) {
    this.phase = 'show';
    U.say(this.msg, '잘 보세요', 'look');
    [...this.progress.children].forEach((d, i) => d.classList.toggle('cur', i === this.answered));
    this.h.after(ms, () => {
      this.curtain.classList.add('closed');
      U.say(this.msg, '');
      this.h.after(NovelGame.CLOSE_MS + NovelGame.HOLD_MS, () => {
        const before = this.change();
        this.curtain.classList.remove('closed');
        this.h.sfx('blink');
        this.h.after(NovelGame.OPEN_MS, () => this.ask(before));
      });
    });
  }

  // 가림막 뒤에서 새 그림을 넣는다. 반환: 바꾸기 전 판 (기록용)
  change() {
    const before = this.board.map((x) => ({ ...x }));
    const q = NovelGame.change(this.board, this.seen, this.rows * this.cols, this.spec, this.lastAt);
    this.board = q.board;
    this.seen.add(NovelGame.key(q.fresh));
    this.q = q;
    this.lastAt = q.at;
    this.render();
    return before;
  }

  // 가림막이 다 걷힌 뒤 답을 받기 시작한다
  ask(before) {
    const q = this.q;
    U.say(this.msg, '새로 나타난 그림을 누르세요', 'act');
    this.cells.forEach((c, i) => c.classList.toggle('clickable', this.board.some((x) => x.at === i)));
    this.phase = 'input';
    const ids = (b) => b.map((x) => [x.at, NOVEL_SHAPES[x.s].id, NOVEL_MARKS[x.m].id]);
    this.h.question({
      grid: [this.rows, this.cols], n: this.answered + 1,
      before: ids(before), after: ids(this.board),
      fresh: [NOVEL_SHAPES[q.fresh.s].id, NOVEL_MARKS[q.fresh.m].id], at: q.at, mode: q.mode, similar: q.similar, moved: q.moved,
    });
    this.h.timer(this.board.length, () => this.pick(-1));
  }

  // i = 누른 칸. -1 이면 시간이 다 된 것. 빈 칸은 무시한다
  pick(i) {
    if (this.phase !== 'input') return;
    const hit = this.board.find((x) => x.at === i);
    if (i >= 0 && !hit) return;
    this.phase = 'wait';
    this.h.stopTimer();
    const ok = i === this.q.at;
    this.h.answer({ cell: i >= 0 ? i : null, correct: ok, timedOut: i < 0 });
    this.cells.forEach((c) => c.classList.remove('clickable'));
    const answer = this.cells[this.q.at];
    if (ok) {
      answer.classList.add('right');
      answer.append(U.el('span', 'mark', '✓'));
      this.correct++;
      U.say(this.msg, '정답!', 'good');
      this.h.award((this.h.base * this.h.mult) / NovelGame.QUESTIONS, answer);
      this.h.sfx('good');
    } else {
      if (i >= 0) {
        this.cells[i].classList.add('wrong');
        this.cells[i].append(U.el('span', 'mark', '✕'));
      }
      answer.classList.add('reveal');
      U.say(this.msg, i >= 0 ? '새 그림은 여기였어요' : '시간 초과 · 새 그림은 여기였어요', 'bad');
      this.h.sfx('bad');
    }
    const d = this.progress.children[this.answered];
    d.classList.remove('cur');
    d.classList.add(ok ? 'right' : 'wrong');
    this.answered++;
    this.h.after(ok ? 800 : 1400, () => {
      if (this.answered >= NovelGame.QUESTIONS) return this.finish();
      // 표시를 지운 판을 잠깐 다시 보여 준 뒤 다음 문제로
      this.render();
      this.look(Math.max(1200, Math.round(this.spec.show * 0.6)));
    });
  }

  finish() {
    this.phase = 'end';
    this.ro.disconnect();
    this.h.done(this.result());
  }

  result() {
    return { cleared: this.correct === NovelGame.QUESTIONS, correct: this.correct, total: NovelGame.QUESTIONS };
  }

  // 점수는 맞힐 때마다 바로 지급하므로 중단될 때 따로 줄 것이 없다
  abort() {
    this.ro.disconnect();
    return { cleared: false, correct: this.correct, total: this.answered };
  }

  // ---- 문제 만들기 ----
  // board 에 새 그림 하나를 넣고 (빈 칸에 더하거나 하나를 밀어내고), shuffle 만큼 자리를 바꾼다.
  // 새 그림은 seen(한 번이라도 나온 그림)에 없는 것. similar 확률로 판에 있는 모양에 무늬만 다른 것을 고르고,
  // 그 밖에는 판에 없는 모양으로 고른다 (그래야 무늬 없는 낮은 단계에서 같은 모양이 둘 생기지 않는다).
  // 무늬만 다른 새 그림이 밀어낼 때는 같은 모양을 밀어낸다 — 같은 자리에서 무늬만 바뀌는 가장 미묘한 경우.
  // 새 그림이 바로 앞 문제와 같은 칸에 오지 않게 한다 (한 칸만 지켜보는 요령을 막는다).
  // 반환: { board, fresh({ s, m }), at(새 그림 칸), mode, similar, moved(자리를 바꾼 그림 수) }
  static change(board, seen, cells, { marks, replace, shuffle, similar = 0 }, lastAt) {
    const allShapes = [...NOVEL_SHAPES.keys()];
    for (let tries = 0; ; tries++) {
      const next = board.map((x) => ({ ...x }));
      const taken = new Set(next.map((x) => x.at));
      const empty = [...Array(cells).keys()].filter((c) => !taken.has(c));
      const mode = !empty.length || Math.random() < replace ? 'replace' : 'add';
      const onBoard = new Set(next.map((x) => x.s));

      // 새 그림 후보
      const fresh = (shapes) => shapes.flatMap((s) => [...Array(marks).keys()].map((m) => ({ s, m })))
        .filter((x) => !seen.has(NovelGame.key(x)));
      const near = marks > 1 ? fresh([...onBoard]) : [];
      const far = fresh(allShapes.filter((s) => !onBoard.has(s)));
      const like = near.length && (Math.random() < similar || !far.length);
      const pool = like ? near : far.length ? far : fresh(allShapes);
      const pic = pool[U.rand(pool.length)];

      let at;
      if (mode === 'add') {
        at = empty[U.rand(empty.length)];
        next.push({ ...pic, at });
      } else {
        const same = next.filter((x) => x.s === pic.s);
        const out = like && same.length ? same : next;
        const victim = out[U.rand(out.length)];
        at = victim.at;
        victim.s = pic.s;
        victim.m = pic.m;
      }

      // 자리 바꾸기: 고른 그림들을 빈 칸과 자기들끼리의 칸으로 옮긴다. 옮긴 그림은 모두 원래 칸을 떠난다
      const count = shuffle === 'all' ? next.length : Math.min(shuffle || 0, next.length);
      let moved = 0;
      if (count) {
        const movers = U.shuffle([...next]).slice(0, count);
        const stay = new Set(next.filter((x) => !movers.includes(x)).map((x) => x.at));
        const free = [...Array(cells).keys()].filter((c) => !stay.has(c));
        for (let k = 0; k < 50; k++) {
          const dest = U.shuffle([...free]).slice(0, movers.length);
          if (movers.every((x, j) => dest[j] !== x.at)) {
            movers.forEach((x, j) => (x.at = dest[j]));
            moved = movers.length;
            break;
          }
        }
        at = next.find((x) => x.s === pic.s && x.m === pic.m).at;
      }
      if (at !== lastAt || tries >= 20) return { board: next, fresh: pic, at, mode, similar: !!like, moved };
    }
  }
}
