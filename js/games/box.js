// 상자 속 과일 세기
// 가운데의 검은 상자로 과일이 들어가고 나온다. 다 끝나면 상자 안에 남은 과일에 대해 묻는다. 한 게임에 순서 하나, 답 하나다.
// 판은 테두리를 두른 네모 칸이다. 과일은 늘 칸의 왼쪽 끝 밖에서 밀려 들어와(스크롤) 상자 뒤로 사라지고,
// 나올 때는 상자 뒤에서 나와 칸의 오른쪽 끝 밖으로 밀려 나간다.
// 한 차례에는 넣기나 빼기 한 가지만 한다. 여러 개를 옮길 때는 한 줄로 하나씩 뒤따라간다 —
// 덩어리로 묶어 옮기거나 넣기와 빼기를 함께 하면 한눈에 세기 어려웠다 (2026-11-02).
// 과일은 이름이 바로 떠오르지 않을 수 있어서 (배·사과 …) 특정 과일을 묻는 질문은 이름 대신 그림으로 묻는다.
//
// 빠르기: 화면 밖에서 0.4초, 0.65초(나타났다 사라지게) 만에 들어가게 했을 때는 너무 빨라 따라갈 수 없었다 (2026-11-02).
// 지금은 가속 없이 SPEED 로 움직인다. 칸 끝과 상자 사이(GAP)를 좁혀서 들어가기·나오기는 늘 같은 거리만 움직인다.
// 시간: 순서를 보여 주는 동안에도 라운드 시계는 간다. 그래서 차례는 2~4번으로 두고 (순서 약 4~8초),
// 난이도는 차례를 늘리는 대신 한 줄에 서는 과일 수·섞임과 질문으로 올린다:
//   steps — 차례 수
//   per   — 한 차례에 한 줄로 옮기는 과일 수 [최소, 최대]
//   kinds — 과일 종류 수
//   mixed — 한 줄 안에서 다음 과일이 앞 과일과 다른 종류일 확률 (0 이면 한 줄은 늘 같은 과일)
//   start — 처음부터 상자 안에 든 과일 수 [최소, 최대]. 상자가 열린 채로 잠깐 보여 준 뒤 닫힌다 (0 이면 빈 상자).
//           상자가 둘이면 두 상자를 합친 수이고, 상자마다 START_MIN 개 이상 든다.
//           첫 차례에는 상자를 비우지 않는다 — 비우면 처음 보여 준 과일을 기억할 필요가 없어진다
//           (예전에는 Lv4 판의 약 4분의 1, Lv8 판의 3분의 1 남짓이 첫 차례에 상자를 비웠다, 2026-11-09)
//   out   — 한 차례가 빼기(상자 → 밖, 또는 상자 → 상자)일 확률 (기본 OUT. 뺄 것이 없으면 넣는다)
//   decoy — 상자 위로 지나가기만 하고 들어가지 않는 과일 수 (주의 흐트리기. 차례와 함께 움직인다. 상자가 하나일 때만)
//   boxes — 상자 수. 둘이면 위아래 두 줄에 하나씩 두고 (줄마다 상자 하나일 때와 똑같이 왼쪽에서 들어가 오른쪽으로 나온다)
//           한쪽 상자에 대해 묻는다. 처음에는 한 줄에 상자 둘을 두고 왼쪽 상자 → 오른쪽 상자로 옮기게 했더니,
//           나오자마자 다른 상자로 들어가는 과일을 따라가기 벅찼다 (2026-11-02)
//   q     — 질문 종류: total 모두 몇 개 · kind (그림) 몇 개 · most 가장 많은 과일 · diff (그림)가 (그림)보다 몇 개 더
//   opts  — 숫자 보기 수 (기본 4)
import { U } from '../config.js';
import { Dg } from '../diagram.js';

const FRUITS = [
  {
    id: 'apple',
    svg: '<path d="M50 32C38 20 14 24 16 52c2 26 20 40 34 32 14 8 32-6 34-32 2-28-22-32-34-20z" fill="#e5484d"/>' +
      '<path d="M50 32q0-14 6-22" stroke="#7a4a21" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '<path d="M55 21q13-13 24-5-11 13-24 5z" fill="#2fa84f"/>',
  },
  {
    // 바나나는 가늘게 그리면 알아보기 어려워서 (2026-11-02) 모양이 뚜렷한 수박 조각으로 바꿨다
    id: 'watermelon',
    svg: '<path d="M6 34a44 44 0 0 0 88 0z" fill="#2fa84f"/><path d="M14 34a36 36 0 0 0 72 0z" fill="#ef4b5a"/>' +
      [[34, 44], [50, 48], [66, 44], [42, 58], [58, 58]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="4" fill="#2b2b2b"/>`).join(''),
  },
  {
    id: 'grape',
    svg: '<path d="M50 26l3-14" stroke="#2fa84f" stroke-width="5" stroke-linecap="round"/>' +
      [[30, 38], [50, 38], [70, 38], [40, 57], [60, 57], [50, 76]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11.5" fill="#8e4ec6"/>`).join(''),
  },
  {
    id: 'pear',
    svg: '<path d="M50 18c-10 0-12 16-14 24-14 10-16 28-8 38 10 12 34 12 44 0 8-10 6-28-8-38-2-8-4-24-14-24z" fill="#9ccc3c"/>' +
      '<path d="M50 20q0-10 6-14" stroke="#7a4a21" stroke-width="5" fill="none" stroke-linecap="round"/>',
  },
  {
    id: 'orange',
    svg: '<circle cx="50" cy="56" r="32" fill="#f7931e"/><path d="M50 25q12-12 24-6-10 12-24 6z" fill="#2fa84f"/>' +
      '<circle cx="39" cy="45" r="6" fill="#fff" opacity="0.35"/>',
  },
];
// 함께 내지 않는 짝: 작게 보면 둥글고 붉은 기운이 비슷하다
const FRUIT_CLASH = [['apple', 'orange']];

export class BoxGame {
  static id = 'box';
  static tags = ['memory', 'number']; // 꼬리표가 겹치는 게임끼리는 연달아 나오지 않는다 (main.js planPass)
  static title = '상자 속 과일 세기';
  static hint = '상자에 들어가고 나오는 과일을 잘 보고<br>상자 안에 남은 과일을 맞혀 보세요';
  static levels = [
    // 쉬운 단계: 한 가지 과일이 빈 상자에 들어가기만 한다 (Lv2 부터 가끔 나온다)
    { steps: 2, per: [1, 2], kinds: 1, start: 0, out: 0, q: ['total'], opts: 3 },
    { steps: 3, per: [1, 2], kinds: 1, start: 0, out: 0.35, q: ['total'], opts: 3 },
    // 두 가지 과일 가운데 하나를 묻는다
    { steps: 3, per: [1, 2], kinds: 2, start: 0, q: ['kind'] },
    { steps: 3, per: [1, 3], kinds: 2, start: [2, 3], mixed: 0.3, q: ['kind', 'total'] },
    // 비교하는 질문
    { steps: 3, per: [1, 3], kinds: 2, start: [2, 4], mixed: 0.4, q: ['most', 'diff', 'kind'] },
    // 세 가지 과일 · 지나가기만 하는 과일
    { steps: 3, per: [2, 3], kinds: 3, start: [3, 4], mixed: 0.5, decoy: 1, q: ['kind', 'most'] },
    { steps: 4, per: [1, 3], kinds: 3, start: [3, 5], mixed: 0.6, decoy: 2, q: ['diff', 'kind'], opts: 5 },
    // 상자 둘 (위아래 두 줄)
    { steps: 4, per: [1, 3], kinds: 2, start: [4, 5], mixed: 0.4, boxes: 2, q: ['kind', 'total'], opts: 5 },
  ];
  static maxLevel = BoxGame.levels.length;
  static SPEED = 0.1;     // 판 단위/ms. 과일 하나가 칸 끝에서 상자 뒤까지(GAP + FS) 약 1.2초
  static PAUSE_MS = 300;  // 한 줄이 다 숨은 뒤 다음 차례까지
  static CAP = 9;         // 상자 하나에 들 수 있는 과일 수 (답이 한 자리 수가 되게)
  static OUT = 0.45;
  static ZERO = 0.12;
  static START_MIN = 2;   // 상자가 둘일 때 상자마다 처음 드는 최소 과일 수     // 답이 0 인 문제를 이 정도만 남긴다 (자주 나오면 '0' 을 찍는 것이 수가 된다)
  // 판 (판 단위). 한 번에 하나씩 숨으므로 상자는 과일 하나만 가리면 되지만, 열었을 때 9개가 3열로 들어가게 둔다
  static FS = 46;         // 움직이는 과일 크기 (열린 상자 속은 IN_FS)
  static IN_FS = 24;
  static SP = 54;         // 한 줄에서 과일 사이 거리 (가운데끼리)
  static GAP = 76;        // 칸 끝과 상자 사이
  static BOX = { w: 84, h: 84, y: 64 };
  static H = 160;         // 판 높이. 너비는 상자 수에 따라
  static LANE = 32;       // 지나가기만 하는 과일이 다니는 높이 (상자 위)
  static ROWS = { y: [12, 116], h: 212 }; // 상자가 둘일 때: 줄마다 상자 위쪽 끝, 판 높이 (지나가는 과일 없이)

  // 소개 그림: ① 들어가고 나오는 과일을 보고 ② 남은 과일 수를 고른다
  static diagram() {
    const [apple, melon] = FRUITS;
    const box = '<rect class="dg-bx" x="62" y="22" width="56" height="50" rx="6"/>' + Dg.text(90, 48, '?', 22, 'dg-bx-q');
    const arrow = (x1, x2, y) => `<path class="dg-bx-arrow" d="M${x1} ${y}H${x2}m-6 -5l6 5-6 5"/>`;
    const step1 = Dg.glyph(apple.svg, 20, 47, 26) + arrow(36, 56, 47) + box + arrow(124, 144, 47) + Dg.glyph(melon.svg, 160, 47, 26);
    const opts = [1, 2, 3].map((v, i) => Dg.rect(44 + i * 34, 62, 28, 28) + Dg.text(58 + i * 34, 76, v, 16)).join('');
    const step2 = Dg.text(66, 30, '상자 안', 14, 'dg-txt') + Dg.glyph(apple.svg, 106, 30, 24) + Dg.text(132, 30, '?', 16, 'dg-txt') +
      opts + Dg.tap(92, 76, 18);
    return [
      { svg: Dg.svg('0 0 180 96', step1), caption: '들어가고 나오는 과일을 보고' },
      { svg: Dg.svg('0 0 180 96', step2), caption: '상자 안에 남은 수 고르기' },
    ];
  }

  constructor(host) {
    this.h = host;
    this.spec = BoxGame.levels[host.level - 1];
    this.phase = 'show';
    this.p = BoxGame.make(this.spec);
  }

  start() {
    const { stage, level } = this.h;
    const { p } = this;
    const hasStart = p.boxes.some((b) => BoxGame.sum(p.start[b]) > 0);
    this.msg = U.el('div', 'stage-msg look', hasStart ? '상자 안의 과일을 잘 보세요' : '들어가고 나오는 과일을 잘 보세요');
    this.body = U.frame(stage, `${BoxGame.title} · Lv.${level}`, this.msg).body;
    this.wrap = U.el('div', 'bx-wrap');
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'bx-arena');
    this.svg.setAttribute('viewBox', `0 0 ${p.W} ${p.H}`);
    const { w, h } = BoxGame.BOX;
    // 그리는 차례: 칸 바탕 → 움직이는 과일(상자 뒤) → 상자 → 열렸을 때 보이는 속 → 지나가는 과일(상자 앞) → 칸 테두리.
    // 테두리를 맨 위에 그려 과일이 테두리 밑으로 밀려 들어오고 나가게 보인다 (칸 밖은 svg 가 잘라 낸다)
    this.svg.innerHTML = `<rect class="bx-field" width="${p.W}" height="${p.H}" rx="11"/>` +
      p.boxes.map((b) => `<line class="bx-ground" x1="0" x2="${p.W}" y1="${p.y[b] + h + 0.5}" y2="${p.y[b] + h + 0.5}"/>`).join('') +
      '<g class="bx-back"></g>' +
      p.boxes.map((b) => `<g class="bx-box" data-box="${b}"><rect class="bx-shell" x="${p.left[b]}" y="${p.y[b]}" width="${w}" height="${h}" rx="8"/>` +
        `<text class="bx-q" x="${p.x[b]}" y="${p.y[b] + h / 2 + 2}" text-anchor="middle" dominant-baseline="central">?</text>` +
        `<g class="bx-in"></g></g>`).join('') +
      '<g class="bx-front"></g>' +
      `<rect class="bx-frame" x="1" y="1" width="${p.W - 2}" height="${p.H - 2}" rx="10"/>`;
    this.back = this.svg.querySelector('.bx-back');
    this.front = this.svg.querySelector('.bx-front');
    this.boxEls = Object.fromEntries(p.boxes.map((b) => [b, this.svg.querySelector(`[data-box="${b}"]`)]));
    this.opts = U.el('div', 'ar-cands bx-opts');
    this.wrap.append(this.svg, this.opts);
    this.body.append(this.wrap);
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.body);
    // 보기 높이가 상자 크기 셈에 들어가므로, 보기가 바뀌면 다시 맞춘다
    this.ro.observe(this.opts);
    this.layout();

    if (hasStart) {
      // 처음에 든 과일을 열린 상자 속에 보여 준 뒤 닫는다
      p.boxes.forEach((b) => this.open(b, p.start[b]));
      const n = p.boxes.reduce((s, b) => s + BoxGame.sum(p.start[b]), 0);
      this.h.after(1100 + 160 * n, () => {
        p.boxes.forEach((b) => this.close(b));
        this.h.sfx('blink');
        this.h.after(450, () => this.play());
      });
    } else {
      p.boxes.forEach((b) => this.close(b));
      this.h.after(500, () => this.play());
    }
  }

  layout() {
    const s = this.body;
    const ar = this.p.W / this.p.H;
    const optH = this.opts.offsetHeight || 104;
    // 최소 200px: 화면이 낮아도 상자와 보기가 판 자리를 넘치지 않게
    const w = Math.max(200, Math.min(s.clientWidth - 40, (s.clientHeight - optH - U.gapOf(this.wrap, 22) - 18) * ar, 960));
    this.svg.style.width = `${w}px`;
    this.svg.style.height = `${w / ar}px`;
  }

  // 상자를 열어 속(counts = { 과일 id: 수 })을 보여 준다. 과일 종류끼리 모아 3열로 늘어놓는다
  open(b, counts) {
    const el = this.boxEls[b];
    const { IN_FS: FS, BOX } = BoxGame;
    const list = this.p.kinds.flatMap((k) => Array(counts[k] || 0).fill(k));
    const cols = Math.min(3, Math.max(1, list.length));
    const rows = Math.ceil(list.length / 3);
    const cell = FS + 2;
    const x0 = this.p.x[b] - ((cols - 1) * cell) / 2;
    const y0 = this.p.y[b] + BOX.h / 2 - ((rows - 1) * cell) / 2;
    el.querySelector('.bx-in').innerHTML = list.map((k, i) =>
      Dg.glyph(BoxGame.fruit(k).svg, x0 + (i % 3) * cell, y0 + Math.floor(i / 3) * cell, FS)).join('');
    el.classList.add('open');
  }

  close(b) {
    const el = this.boxEls[b];
    el.classList.remove('open');
    el.querySelector('.bx-in').innerHTML = '';
  }

  // 순서를 보여 준다. 과일마다 출발 시각·자리·도착 자리를 정해 두고, 게임 시계(host.now)로 위치를 고른다 —
  // 일시정지·운영 메뉴 중에는 과일도 멈춘다. 출발·도착 자리는 칸 밖 또는 상자 뒤에 과일이 통째로 숨는 자리라서
  // 움직이기 전·뒤에는 보이지 않는다. 한 줄의 과일은 같은 길을 SP 만큼씩 늦게 출발한다
  play() {
    const { p } = this;
    U.say(this.msg, '잘 보세요', 'look');
    this.phase = 'play';
    const { FS, SP, SPEED, BOX, LANE, PAUSE_MS } = BoxGame;
    const midY = (b) => p.y[b] + BOX.h / 2;
    const from = (at) => (at === 'L' ? -FS / 2 : p.right[at] - FS / 2);
    const to = (at) => (at === 'R' ? p.W + FS / 2 : p.left[at] + FS / 2);
    this.flights = [];
    let t = 0;
    p.steps.forEach((moves) => {
      const at = t;
      let end = t;
      moves.forEach((m) => {
        const x1 = from(m.from);
        const x2 = to(m.to);
        const dur = Math.abs(x2 - x1) / SPEED;
        m.fruits.forEach((kind, i) => {
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          g.innerHTML = Dg.glyph(BoxGame.fruit(kind).svg, 0, 0, FS);
          (m.decoy ? this.front : this.back).append(g);
          const f = { g, t0: at + (i * SP) / SPEED, dur, x1, x2, y: m.decoy ? LANE : midY(m.to === 'R' ? m.from : m.to) };
          // 상자 가장자리를 지나는 순간 (과일이 반쯤 가려질 때) 상자가 움찔하고 그 자리에 고리가 퍼진다
          if (!m.decoy) {
            if (m.to !== 'R') f.enter = { box: m.to, x: p.left[m.to] };
            if (m.from !== 'L') f.leave = { box: m.from, x: p.right[m.from] };
          }
          this.flights.push(f);
          this.place(f, 0);
          // 지나가기만 하는 과일은 다음 차례를 기다리게 하지 않는다
          if (!m.decoy) end = Math.max(end, f.t0 + dur);
        });
      });
      this.h.after(at, () => this.h.sfx('blink'));
      t = end + PAUSE_MS;
    });
    const t0 = this.h.now();
    const tick = () => {
      if (this.phase !== 'play') return;
      const now = this.h.now() - t0;
      this.flights.forEach((f) => this.place(f, U.clamp((now - f.t0) / f.dur, 0, 1)));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    this.h.after(Math.max(...this.flights.map((f) => f.t0 + f.dur)) + 350, () => this.ask());
  }

  // 가속 없이 같은 빠르기로
  place(f, k) {
    const x = U.lerp(f.x1, f.x2, k);
    f.g.setAttribute('transform', `translate(${x.toFixed(2)} ${f.y})`);
    if (this.phase !== 'play') return;
    for (const [key, kind] of [['leave', 'out'], ['enter', 'in']]) {
      const e = f[key];
      if (e && !e.done && x >= e.x) {
        e.done = true;
        this.boxFx(e.box, e.x, f.y, kind);
      }
    }
  }

  // 들어갈 때(in)와 나올 때(out) 상자가 조금 다르게 움찔한다 (css .bx-box.fx-in / .fx-out). 고리는 가장자리에서 퍼진다
  boxFx(b, x, y, kind) {
    const el = this.boxEls[b];
    el.classList.remove('fx-in', 'fx-out');
    el.getBoundingClientRect(); // 연달아 지나가도 움찔하는 애니메이션을 처음부터 다시
    el.classList.add(`fx-${kind}`);
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('class', 'bx-ring');
    ring.setAttribute('cx', x);
    ring.setAttribute('cy', y);
    ring.setAttribute('r', BoxGame.FS / 2);
    ring.addEventListener('animationend', () => ring.remove());
    this.front.append(ring);
  }

  ask() {
    const { p } = this;
    const { q } = p;
    this.phase = 'input';
    this.back.innerHTML = '';
    this.front.innerHTML = '';
    if (p.boxes.length > 1) this.boxEls[q.box].classList.add('asked');
    const ico = (k) => `<svg class="bx-ico" viewBox="0 0 100 100">${BoxGame.fruit(k).svg}</svg>`;
    const where = p.boxes.length > 1 ? `${q.box === 'A' ? '위' : '아래'} 상자` : '상자';
    const text = {
      total: () => `${where} 안에 과일이 모두 몇 개 있을까요?`,
      kind: () => `${where} 안에 ${ico(q.kinds[0])} 몇 개 있을까요?`,
      most: () => `${where} 안에 가장 많은 과일은?`,
      diff: () => `${ico(q.kinds[0])} 가 ${ico(q.kinds[1])} 보다 몇 개 더 많을까요?`,
    }[q.type]();
    U.say(this.msg, '', 'act');
    this.msg.insertBefore(U.el('span', 'bx-q-text', text), this.msg.firstChild);

    this.btns = q.opts.map((v) => {
      const btn = U.el('button', 'ar-cand bx-opt', q.type === 'most' ? ico(v) : String(v));
      btn.addEventListener('pointerdown', () => this.pick(v, btn));
      this.opts.append(btn);
      return { v, btn };
    });
    this.layout();
    this.h.question({
      boxes: p.boxes, kinds: p.kinds, start: p.start, steps: p.steps,
      q: { type: q.type, box: q.box, kinds: q.kinds }, ans: q.ans, opts: q.opts, end: p.end,
    });
    // 일의 양 = 머릿속에서 세어 둬야 하는 과일 종류 수 (상자가 둘이면 하나 더)
    const load = { total: p.kinds.length, kind: 1, most: p.kinds.length, diff: 2 }[q.type] + (p.boxes.length > 1 ? 1 : 0);
    this.h.timer(load, () => this.pick(null, null));
  }

  // v = 고른 답. null 이면 시간이 다 된 것. 답한 뒤에는 상자를 열어 속을 보여 준다
  pick(v, btn) {
    if (this.phase !== 'input') return;
    this.phase = 'end';
    this.h.stopTimer();
    const { p } = this;
    const { q } = p;
    const ok = v === q.ans;
    this.cleared = ok;
    this.h.answer({ picked: v, correct: ok, timedOut: !btn });
    this.btns.forEach((b) => {
      b.btn.disabled = true;
      if (b.v === q.ans) b.btn.classList.add(ok ? 'right' : 'answer');
    });
    if (!ok && btn) btn.classList.add('wrong');
    p.boxes.forEach((b) => this.open(b, p.end[b]));
    if (ok) {
      U.say(this.msg, '정답!', 'good');
      this.h.award(this.h.base * this.h.mult, btn);
      this.h.sfx('good');
    } else {
      U.say(this.msg, btn ? '상자 안을 보세요' : '시간 초과 · 상자 안을 보세요', 'bad');
      this.h.sfx('bad');
    }
    this.h.after(ok ? 1100 : 2000, () => this.finish());
  }

  finish() {
    this.ro.disconnect();
    this.h.done(this.result());
  }

  result() {
    return { cleared: !!this.cleared, correct: this.cleared ? 1 : 0, total: 1 };
  }

  abort() {
    const answered = this.phase === 'end';
    this.phase = 'end';
    this.ro.disconnect();
    return { cleared: false, correct: this.cleared ? 1 : 0, total: answered ? 1 : 0 };
  }

  static fruit(id) {
    return FRUITS.find((f) => f.id === id);
  }

  static sum(counts) {
    return Object.values(counts).reduce((s, v) => s + v, 0);
  }

  // ---- 문제 만들기 ----
  // 반환: { W, H, boxes, x·left·right·y(상자 → 가운데·왼쪽 끝·오른쪽 끝·위쪽 끝), kinds, start, steps, end, q }
  //   steps — 차례마다 [{ from, to, fruits: [과일 id, ...] (한 줄의 앞에서부터), decoy }]. 지나가기만 하는 과일 말고는 차례마다 하나다
  // 자리 이름: L 칸 왼쪽 밖 · A 위(또는 하나뿐인) 상자 · B 아래 상자 · R 칸 오른쪽 밖 (L·R 은 드나드는 상자의 줄)
  static make(spec) {
    for (let tries = 0; tries < 400; tries++) {
      const p = BoxGame.tryMake(spec);
      if (p) return p;
    }
    // 조건을 못 맞추면 가장 단순한 판: 한 가지 과일을 넣기만 한다
    return BoxGame.tryMake({ ...spec, kinds: 1, start: 0, out: 0, mixed: 0, decoy: 0, boxes: 1, q: ['total'] }, true);
  }

  static tryMake(spec, loose = false) {
    const nb = spec.boxes || 1;
    const boxes = nb === 2 ? ['A', 'B'] : ['A'];
    const { GAP, BOX, CAP } = BoxGame;
    const { ROWS } = BoxGame;
    const W = 2 * GAP + BOX.w;
    const H = nb === 2 ? ROWS.h : BoxGame.H;
    const left = Object.fromEntries(boxes.map((b) => [b, GAP]));
    const y = Object.fromEntries(boxes.map((b, i) => [b, nb === 2 ? ROWS.y[i] : BOX.y]));
    const right = Object.fromEntries(boxes.map((b) => [b, left[b] + BOX.w]));
    const x = Object.fromEntries(boxes.map((b) => [b, left[b] + BOX.w / 2]));
    // 과일 고르기 (함께 내지 않는 짝은 피한다)
    const kinds = [];
    for (const f of U.shuffle([...FRUITS])) {
      if (kinds.length >= spec.kinds) break;
      if (kinds.some((k) => FRUIT_CLASH.some((c) => c.includes(k) && c.includes(f.id)))) continue;
      kinds.push(f.id);
    }
    const empty = () => Object.fromEntries(kinds.map((k) => [k, 0]));
    const cnt = Object.fromEntries(boxes.map((b) => [b, empty()]));
    // 처음 든 과일: 상자가 둘이면 위 상자에 더 많이 (같을 수도 있다), 상자마다 START_MIN 개 이상
    if (spec.start) {
      const n = U.randInt(...spec.start);
      const lo = BoxGame.START_MIN;
      const bottom = nb === 2 ? U.randInt(lo, Math.max(lo, Math.floor(n / 2))) : 0;
      const fill = (b, m) => { for (let j = 0; j < m; j++) cnt[b][kinds[U.rand(kinds.length)]]++; };
      fill('A', n - bottom);
      if (nb === 2) fill('B', bottom);
    }
    const start = JSON.parse(JSON.stringify(cnt));
    const paths = boxes.flatMap((b) => [['L', b], [b, 'R']]);
    const steps = [];
    for (let s = 0; s < spec.steps; s++) {
      // 빼기를 먼저 해 볼지 넣기를 먼저 해 볼지 정한다 (뺄 것이 없거나 상자가 차면 다른 쪽)
      const takeOut = Math.random() < (spec.out ?? BoxGame.OUT);
      const first = (pt) => ((pt[0] === 'L') === takeOut ? 1 : 0);
      const order = U.shuffle([...paths]).sort((a, b) => first(a) - first(b));
      let move = null;
      for (const [from, to] of order) {
        const room = to === 'R' ? Infinity : CAP - BoxGame.sum(cnt[to]);
        // 첫 차례에 빼면 적어도 하나는 남긴다
        const have = from === 'L' ? Infinity : BoxGame.sum(cnt[from]) - (s === 0 ? 1 : 0);
        const n = Math.min(U.randInt(...spec.per), room, have);
        if (n < 1) continue;
        // 한 줄 세우기: 첫 과일을 고르고, 다음 과일은 mixed 확률로 다른 종류. 상자에서 뺄 때는 든 것 가운데서만
        const pool = from === 'L' ? null : { ...cnt[from] };
        const can = (k) => !pool || pool[k] > 0;
        const fruits = [];
        for (let i = 0; i < n; i++) {
          const prev = fruits[i - 1];
          const keep = prev && can(prev) && Math.random() >= (spec.mixed || 0);
          const others = U.shuffle(kinds.filter((k) => can(k) && k !== prev));
          // 섞지 않는 단계에서 같은 과일이 떨어지면 줄을 거기서 끊는다
          let k = null;
          if (keep) k = prev;
          else if (!prev || spec.mixed) k = others[0] || (can(prev) ? prev : null);
          if (!k) break;
          fruits.push(k);
          if (pool) pool[k]--;
        }
        fruits.forEach((k) => {
          if (from !== 'L') cnt[from][k]--;
          if (to !== 'R') cnt[to][k]++;
        });
        move = { from, to, fruits };
        break;
      }
      if (!move) return null;
      steps.push([move]);
    }
    // 지나가기만 하는 과일: 상자 위로 다니므로 아무 차례에나 얹는다 (서로 다른 차례에).
    // 마지막 차례에는 얹지 않는다 — 칸 끝까지 가는 동안 질문이 늦어진다
    const hosts = U.shuffle(steps.slice(0, -1));
    for (let i = 0; nb === 1 && i < (spec.decoy || 0) && i < hosts.length; i++) {
      hosts[i].push({ from: 'L', to: 'R', fruits: [kinds[U.rand(kinds.length)]], decoy: true });
    }
    const end = cnt;
    const q = BoxGame.question(spec, kinds, boxes, steps, end, loose);
    if (!q) return null;
    return { W, H, boxes, x, left, right, y, kinds, start, steps, end, q };
  }

  // 질문과 답·보기를 정한다. 못 정하면 null (판을 다시 만든다)
  static question(spec, kinds, boxes, steps, end, loose) {
    const type = spec.q[U.rand(spec.q.length)];
    const all = steps.flat().filter((m) => !m.decoy);
    // 상자가 둘이면 드나든 일이 있는 상자 가운데 하나를 묻는다
    const box = boxes.length > 1 ? U.shuffle([...boxes]).find((b) => all.some((m) => m.to === b) && all.some((m) => m.from === b)) : 'A';
    if (!box) return null;
    const touches = (k) => all.filter((m) => m.fruits.includes(k) && (m.from === box || m.to === box)).length;
    const outs = all.filter((m) => m.from === box).length;
    // 빼기가 나올 수 있는 단계라면 묻는 상자에서 적어도 한 번은 빠져나가야 한다 (더하기만 하면 너무 쉽다)
    if (!loose && (spec.out ?? BoxGame.OUT) > 0 && (spec.start || spec.kinds > 1) && !outs) return null;
    const c = end[box];
    let ans;
    let qk = [];
    if (type === 'total') {
      ans = BoxGame.sum(c);
    } else if (type === 'kind') {
      const k = U.shuffle([...kinds]).find((x) => touches(x) >= 2);
      if (!k) return null;
      qk = [k];
      ans = c[k];
    } else if (type === 'most') {
      const top = Math.max(...kinds.map((k) => c[k]));
      const best = kinds.filter((k) => c[k] === top);
      if (top < 1 || best.length !== 1) return null;
      return { type, box, kinds: [], ans: best[0], opts: [...kinds] };
    } else {
      const pairs = U.shuffle(kinds.flatMap((a) => kinds.filter((b) => c[a] > c[b] && touches(a) && touches(b)).map((b) => [a, b])));
      if (!pairs.length) return null;
      qk = pairs[0];
      ans = c[qk[0]] - c[qk[1]];
    }
    if (ans === 0 && !loose && Math.random() > BoxGame.ZERO) return null;
    // 하기 쉬운 실수: 마지막 차례나 아무 한 차례를 통째로, 또는 줄의 마지막 과일 하나를 빠뜨리고 센 값
    const value = (skip) => {
      const cc = JSON.parse(JSON.stringify(end));
      skip.forEach(({ m, k }) => {
        if (m.from !== 'L') cc[m.from][k]++;
        if (m.to !== 'R') cc[m.to][k]--;
      });
      const v = cc[box];
      return type === 'total' ? BoxGame.sum(v) : type === 'kind' ? v[qk[0]] : v[qk[0]] - v[qk[1]];
    };
    const whole = (m) => m.fruits.map((k) => ({ m, k }));
    const lastOf = (m) => [{ m, k: m.fruits[m.fruits.length - 1] }];
    const mistakes = [value(whole(all[all.length - 1])), value(whole(all[U.rand(all.length)])), value(lastOf(all[U.rand(all.length)]))];
    const k = spec.opts || 4;
    const out = new Set([ans]);
    for (const m of U.shuffle(mistakes)) if (out.size < k - 1 && m >= 0 && m !== ans) out.add(m);
    for (const d of U.shuffle([-2, -1, 1, 2, 3])) {
      if (out.size >= k) break;
      if (ans + d >= 0) out.add(ans + d);
    }
    for (let v = 0; out.size < k; v++) out.add(v);
    return { type, box, kinds: qk, ans, opts: [...out].sort((a, b) => a - b) };
  }
}
