// 짝 없는 것 찾기
// 빨랫줄에 양말이 걸려 있다. 모두 똑같은 짝이 있는데 하나만 짝이 없다. 그 양말을 누른다. 한 게임에 3번.
// 양말 하나 = 무늬(p) · 발목(cuff: 흰 발목 / 같은 색 발목) · 색(c). 같은 판의 서로 다른 양말은 무늬나 발목이 꼭 다르다 —
// 색만 다른 양말은 두지 않는다 (색만으로 가리지 않는다). 색은 쉬운 단계에서 덤으로 돕는 단서다.
// 틀리면 누른 양말의 짝을 점선으로, 짝 없는 양말을 파란 테두리로 보여 준다 (왜 틀렸는지 보이게).
// 난이도:
//   n       — 양말 수 (짝 (n-1)/2 쌍 + 하나)
//   palette — 쓰는 색 수. 0 이면 양말 종류마다 다른 색 (색만 보고도 짝을 찾을 수 있다)
//   lure    — 짝 없는 양말이 어느 짝과 한 군데만 다를 확률 (같은 색에 발목이나 무늬 하나만 다르다)
//   subtle  — 그때 다른 곳이 비슷한 무늬(굵은 줄 ↔ 가는 줄, 하트 ↔ 별 …)다
//   flip    — 양말이 저마다 왼쪽·오른쪽을 본다 (한 짝도 서로 반대로 걸릴 수 있다)
const PAIR_COLORS = [
  { fill: '#e5484d', ink: '#ffffff' },
  { fill: '#2f6fed', ink: '#ffffff' },
  { fill: '#1f9d55', ink: '#ffffff' },
  { fill: '#f5b301', ink: '#7a4b00' },
  { fill: '#8e4ec6', ink: '#ffffff' },
  { fill: '#f76808', ink: '#ffffff' },
  { fill: '#06aed5', ink: '#ffffff' },
];
// 양말은 80×110 안에 그린다 (발목이 위, 발끝이 오른쪽). 무늬는 양말 모양으로 잘라 낸다 (clip-path, PairGame.defs)
const PAIR_SOCK = 'M16 8 H46 V62 C46 70 50 74 58 78 L70 84 C80 89 80 102 70 104 C64 106 58 104 52 101 L28 89 C18 84 16 76 16 66 Z';
const PAIR_PATTERNS = {
  plain: () => '',
  stripes: (ink) => [30, 44, 58].map((y) => `<rect x="0" y="${y}" width="80" height="6" fill="${ink}"/>`).join(''),
  thin: (ink) => [32, 40, 48, 56].map((y) => `<rect x="0" y="${y}" width="80" height="2.5" fill="${ink}"/>`).join(''),
  dots: (ink) => [[24, 30], [38, 36], [24, 44], [38, 52], [26, 62], [40, 76], [56, 88], [68, 96]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6" fill="${ink}"/>`).join(''),
  zigzag: (ink) => [38, 54].map((y) => `<polyline points="14,${y} 21,${y - 6} 28,${y} 35,${y - 6} 42,${y} 49,${y - 6}" fill="none" stroke="${ink}" stroke-width="3.2" stroke-linejoin="round"/>`).join(''),
  heart: (ink) => `<path d="M31 56 L22 47 A5.2 5.2 0 0 1 31 39 A5.2 5.2 0 0 1 40 47 Z" fill="${ink}"/>`,
  star: (ink) => `<polygon points="${Array.from({ length: 10 }, (_, i) => {
    const a = ((-90 + i * 36) * Math.PI) / 180;
    const r = i % 2 ? 4.2 : 10;
    return `${(31 + Math.cos(a) * r).toFixed(1)},${(47 + Math.sin(a) * r).toFixed(1)}`;
  }).join(' ')}" fill="${ink}"/>`,
  vstripe: (ink) => [21, 29, 37].map((x) => `<rect x="${x}" y="20" width="4" height="46" fill="${ink}"/>`).join(''),
  toe: (ink) => `<path d="M56 74 L84 88 L84 112 L44 112 Z" fill="${ink}" opacity="0.9"/><circle cx="20" cy="84" r="9" fill="${ink}" opacity="0.9"/>`,
};
// 헷갈리기 쉬운 무늬 짝 (subtle 미끼에 쓴다)
const PAIR_SIMILAR = { stripes: 'thin', thin: 'stripes', heart: 'star', star: 'heart', dots: 'zigzag', zigzag: 'dots', vstripe: 'stripes', plain: 'toe', toe: 'plain' };

class PairGame {
  static id = 'pair';
  static tags = ['search']; // 꼬리표가 겹치는 게임끼리는 연달아 나오지 않는다 (main.js planPass)
  static title = '짝 없는 것 찾기';
  static hint = '빨랫줄의 양말은 모두 짝이 있는데<br>하나만 짝이 없어요. 그 양말을 누르세요';
  static levels = [
    // 쉬운 단계: 양말이 적고, 종류마다 색이 다르다
    { n: 5, palette: 0, lure: 0 },
    { n: 7, palette: 0, lure: 0 },
    { n: 7, palette: 4, lure: 0.3 },
    { n: 9, palette: 4, lure: 0.5, flip: true },
    { n: 9, palette: 3, lure: 0.7, flip: true },
    { n: 11, palette: 3, lure: 0.8, flip: true },
    // 색이 둘뿐이고, 짝 없는 양말은 늘 어느 짝과 비슷한 무늬 하나만 다르다
    { n: 13, palette: 2, lure: 1, subtle: true, flip: true },
    { n: 15, palette: 2, lure: 1, subtle: true, flip: true },
  ];
  static maxLevel = PairGame.levels.length;
  static QUESTIONS = 3;
  static CELL_W = 84;    // 양말 한 칸 (판 단위)
  static ROW_H = 132;    // 빨랫줄 한 줄

  // 양말 하나의 svg 조각 (84×110 칸, 원점 왼쪽 위). flip 이면 좌우를 뒤집어 발끝이 왼쪽을 본다.
  // 발목(빨래집게 자리)의 가운데: 그대로면 x 31, 뒤집으면 x 53 (PairGame.leg)
  static sock({ p, cuff, c }, flip, clip, cls = '') {
    const { fill, ink } = PAIR_COLORS[c];
    const cuffBand = cuff
      ? `<rect x="0" y="0" width="80" height="20" fill="#f7f8fa"/><path d="M22 9 V19 M28 9 V19 M34 9 V19 M40 9 V19" stroke="#c9ced6" stroke-width="1.6"/>`
      : `<rect x="0" y="18" width="80" height="2.5" fill="rgba(0,0,0,0.22)"/>`;
    const body = `<path d="${PAIR_SOCK}" fill="${fill}"/>` +
      `<g clip-path="url(#${clip})">${PAIR_PATTERNS[p](ink)}${cuffBand}</g>` +
      `<path class="pr-edge" d="${PAIR_SOCK}" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="2" stroke-linejoin="round"/>`;
    return `<g class="${cls}" ${flip ? 'transform="translate(84 0) scale(-1 1)"' : ''}>${body}</g>`;
  }

  static leg(flip) {
    return flip ? 53 : 31;
  }

  // 양말 모양 잘라 내기 틀. 그림(svg)마다 id 를 따로 둔다 — 같은 id 가 화면에 둘 있으면 브라우저는 앞의 것을 쓰는데,
  // 그것이 숨겨진 소개 그림 안에 있으면 무늬가 잘리지 않고 양말 밖으로 삐져나온다
  static clipId = 0;
  static defs() {
    const id = `pr-clip-${++PairGame.clipId}`;
    return { id, html: `<defs><clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path d="${PAIR_SOCK}"/></clipPath></defs>` };
  }

  // 소개 그림: ① 짝을 맞춰 보고 ② 짝 없는 하나를 누른다
  static diagram() {
    const socks = [{ p: 'stripes', cuff: 1, c: 1 }, { p: 'dots', cuff: 0, c: 0 }, { p: 'heart', cuff: 1, c: 2 }];
    const row = [0, 1, 0, 2, 1];
    const line = '<path d="M2 14 Q90 22 178 14" fill="none" stroke="currentColor" stroke-width="2" opacity="0.55"/>';
    const hang = (tap) => {
      const clip = PairGame.defs();
      return clip.html + line + row.map((k, i) => `<g transform="translate(${8 + i * 34} 12) scale(0.36)">${PairGame.sock(socks[k], false, clip.id)}<rect x="24" y="-6" width="10" height="16" rx="2" fill="#c08a4a"/></g>`).join('') +
        (tap ? Dg.tap(8 + 3 * 34 + 12, 34, 18) : '');
    };
    return [
      { svg: Dg.svg('0 0 180 64', hang(false)), caption: '양말 짝을 맞춰 보고' },
      { svg: Dg.svg('0 0 180 64', hang(true)), caption: '짝 없는 하나 누르기' },
    ];
  }

  constructor(host) {
    this.h = host;
    this.spec = PairGame.levels[host.level - 1];
    this.answered = 0;
    this.correct = 0;
    this.phase = 'wait';
    const n = this.spec.n;
    this.rows = n <= 6 ? 1 : n <= 12 ? 2 : 3;
    this.cols = Math.ceil(n / this.rows);
  }

  start() {
    const { stage, level } = this.h;
    this.msg = U.el('div', 'stage-msg act', '짝 없는 양말을 누르세요');
    const { body, dots } = U.frame(stage, `${PairGame.title} · Lv.${level}`, this.msg, PairGame.QUESTIONS);
    this.body = body;
    this.progress = dots;
    this.wrap = U.el('div', 'pr-wrap');
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'pr-board');
    this.W = this.cols * PairGame.CELL_W + 24;
    this.H = this.rows * PairGame.ROW_H + 8;
    this.svg.setAttribute('viewBox', `0 0 ${this.W} ${this.H}`);
    this.wrap.append(this.svg);
    body.append(this.wrap);
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(body);
    this.layout();
    this.h.after(200, () => this.ask());
  }

  layout() {
    const s = this.body;
    const ar = this.W / this.H;
    const w = Math.max(240, Math.min(s.clientWidth - 40, (s.clientHeight - 12) * ar, 1100));
    this.svg.style.width = `${w}px`;
    this.svg.style.height = `${w / ar}px`;
  }

  ask() {
    const q = PairGame.make(this.spec);
    this.q = q;
    const { CELL_W, ROW_H } = PairGame;
    // 줄마다 양말을 고르게 나눠 건다. 줄은 가운데가 살짝 처지고, 양말은 조금씩 기울어 걸린다
    const perRow = Array.from({ length: this.rows }, (_, r) => Math.floor(q.socks.length / this.rows) + (r < q.socks.length % this.rows ? 1 : 0));
    let k = 0;
    const clip = PairGame.defs();
    let html = clip.html;
    const lines = [];
    const socks = [];
    perRow.forEach((cnt, r) => {
      const y = 14 + r * ROW_H;
      lines.push(`<path class="pr-line" d="M4 ${y} Q${this.W / 2} ${y + 14} ${this.W - 4} ${y}"/>`);
      const x0 = (this.W - cnt * CELL_W) / 2;
      for (let i = 0; i < cnt; i++, k++) {
        const s = q.socks[k];
        const x = x0 + i * CELL_W;
        const leg = PairGame.leg(s.flip);
        const t = (x + leg) / this.W;
        const sag = 14 * 4 * t * (1 - t);   // 줄이 처진 만큼 내려 건다 (2차 곡선의 높이)
        const tilt = (U.rand(9) - 4) * 1.2;
        socks.push(`<g class="pr-sock" data-k="${k}" transform="translate(${x.toFixed(1)} ${(y + sag - 4).toFixed(1)}) rotate(${tilt} ${leg} 0)">` +
          `<rect class="pr-hit" x="0" y="0" width="${CELL_W}" height="112" fill="transparent"/>` +
          PairGame.sock(s.d, s.flip, clip.id) +
          `<rect class="pr-pin" x="${leg - 5.5}" y="-8" width="11" height="18" rx="2.5"/>` +
          `<g class="pr-mark" transform="translate(${s.flip ? 6 : 50} 2)"><circle r="13" cx="13" cy="13"/><text x="13" y="14" text-anchor="middle" dominant-baseline="central"></text></g></g>`);
      }
    });
    html += lines.join('') + socks.join('');
    this.svg.innerHTML = html;
    this.els = [...this.svg.querySelectorAll('.pr-sock')];
    this.els.forEach((el, i) => el.addEventListener('pointerdown', () => this.pick(i)));
    this.svg.classList.add('picking');
    U.say(this.msg, '짝 없는 양말을 누르세요', 'act');
    [...this.progress.children].forEach((d, i) => d.classList.toggle('cur', i === this.answered));
    this.phase = 'input';
    this.h.sfx('blink');
    this.h.question({
      n: this.answered + 1, odd: q.odd, lure: q.lure,
      socks: q.socks.map(({ d, flip }) => [d.p, d.cuff, d.c, flip ? 1 : 0]),
    });
    this.h.timer(q.socks.length, () => this.pick(-1));
  }

  // i = 누른 양말 (-1 이면 시간 초과)
  pick(i) {
    if (this.phase !== 'input') return;
    this.phase = 'wait';
    this.h.stopTimer();
    this.svg.classList.remove('picking');
    const { odd, socks } = this.q;
    const ok = i === odd;
    this.h.answer({ picked: i >= 0 ? i : null, correct: ok, timedOut: i < 0 });
    const mark = (k, cls, text) => {
      this.els[k].classList.add(cls);
      this.els[k].querySelector('.pr-mark text').textContent = text;
    };
    if (ok) {
      this.correct++;
      mark(odd, 'right', '✓');
      U.say(this.msg, '정답!', 'good');
      this.h.award((this.h.base * this.h.mult) / PairGame.QUESTIONS, this.els[odd]);
      this.h.sfx('good');
    } else {
      if (i >= 0) {
        mark(i, 'wrong', '✕');
        // 누른 양말의 짝을 보여 준다
        const twin = socks.findIndex((s, k) => k !== i && PairGame.same(s.d, socks[i].d));
        if (twin >= 0) this.els[twin].classList.add('twin');
      }
      mark(odd, 'reveal', '!');
      U.say(this.msg, i >= 0 ? '그 양말은 짝이 있어요 · 짝 없는 건 이것' : '시간 초과 · 짝 없는 건 이것', 'bad');
      this.h.sfx('bad');
    }
    const d = this.progress.children[this.answered];
    d.classList.remove('cur');
    d.classList.add(ok ? 'right' : 'wrong');
    this.answered++;
    this.h.after(ok ? 800 : 1700, () => {
      if (this.answered >= PairGame.QUESTIONS) return this.finish();
      this.ask();
    });
  }

  finish() {
    this.phase = 'end';
    this.ro.disconnect();
    this.h.done(this.result());
  }

  result() {
    return { cleared: this.correct === PairGame.QUESTIONS, correct: this.correct, total: PairGame.QUESTIONS };
  }

  // 점수는 맞힐 때마다 바로 지급하므로 중단될 때 따로 줄 것이 없다
  abort() {
    this.phase = 'end';
    this.ro.disconnect();
    return { cleared: false, correct: this.correct, total: this.answered };
  }

  // ---- 판 만들기 ----
  static same(a, b) {
    return a.p === b.p && a.cuff === b.cuff && a.c === b.c;
  }

  // 반환: { socks([{ d: { p, cuff, c }, flip }]), odd(짝 없는 양말의 자리), lure(미끼 종류: 'cuff' | 'pattern' | null) }
  static make({ n, palette, lure, subtle, flip }) {
    const k = (n - 1) / 2;
    const ids = (d) => `${d.p}.${d.cuff}`;
    for (;;) {
      // 무늬·발목이 서로 다른 짝 k 종류
      const shapes = U.shuffle(Object.keys(PAIR_PATTERNS).flatMap((p) => [{ p, cuff: 0 }, { p, cuff: 1 }]));
      const pairs = [];
      for (const s of shapes) {
        if (pairs.length === k) break;
        if (!pairs.some((x) => ids(x) === ids(s))) pairs.push({ ...s });
      }
      // 색: palette 0 이면 종류마다 다른 색, 아니면 palette 가지 색 안에서 고른다
      const colors = U.shuffle([...PAIR_COLORS.keys()]);
      const pool = palette ? colors.slice(0, palette) : colors;
      pairs.forEach((d, i) => (d.c = palette ? pool[U.rand(pool.length)] : pool[i % pool.length]));

      // 짝 없는 양말
      const used = new Set(pairs.map(ids));
      let odd = null;
      let lureKind = null;
      if (Math.random() < lure) {
        const base = pairs[U.rand(k)];
        const swap = { ...base, p: PAIR_SIMILAR[base.p] };
        const toggle = { ...base, cuff: 1 - base.cuff };
        const cand = subtle ? [swap, toggle] : [toggle, swap];
        odd = cand.find((d) => !used.has(ids(d)));
        if (odd) lureKind = odd.p === base.p ? 'cuff' : 'pattern';
      }
      if (!odd) {
        const free = shapes.filter((s) => !used.has(ids(s)));
        if (!free.length) continue;   // 무늬 9 × 발목 2 = 18 가지라 실제로는 일어나지 않는다
        odd = { ...free[0], c: palette ? pool[U.rand(pool.length)] : pool[k % pool.length] };
      }
      const socks = U.shuffle([...pairs.flatMap((d) => [d, d]), odd]).map((d) => ({ d, flip: !!flip && Math.random() < 0.5 }));
      return { socks, odd: socks.findIndex((s) => s.d === odd), lure: lureKind };
    }
  }
}
