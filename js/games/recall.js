// 차례대로 외우기
// 그림(모양과 개수가 있는)이 하나씩 나왔다 사라진다. 다 나온 뒤 그 가운데 한 가지(모양이나 개수)를 나온 차례대로 누른다.
// 한 게임에 순서 하나, 답 하나다.
// 그림을 그대로 외우기보다 '별 둘'처럼 말로 바꿔 속으로 되뇌는 편이 쉽도록 만든 게임이다 (말로 외우는 기억):
// 값마다 누구나 같은 이름을 바로 떠올리는 것만 쓰고 (동그라미·세모·네모·별·하트 · 하나·둘·셋),
// 비슷한 모양(마름모는 네모를 돌린 것으로 보인다)은 쓰지 않는다.
// 색은 성질로 쓰지 않는다 (2026-11-13): 색만으로 구별하는 단계가 생겨 색약인 사람이 풀 수 없었다. 그림은 모두 같은 무지갯빛이다 (HOLO).
// 레벨에서 쓰지 않는 성질은 모든 그림이 같다 (개수는 늘 하나, 모양은 게임마다 하나를 골라 모두에 쓴다).
// 성질이 하나뿐인 레벨은 어느 것을 바꿀지 게임마다 무작위다. 둘 다 바뀌면 묻는 것은 다 보여 준 뒤에야 알려 준다 —
// 그래서 둘 다 외워 둬야 한다.
// 바로 앞 그림과 똑같은 그림은 내지 않는다 (하나씩 보여 줄 때 바뀐 줄 모른다). 바뀌는 성질마다 값이 두 가지 이상 나온다.
// 답: 보기 단추를 누를 때마다 다음 칸이 찬다. 다 채우면 한꺼번에 채점하고, 맞힌 칸 수만큼 점수(칸마다 1/n)를 준다.
// 난이도 계기판에는 답 하나로 들어간다 (다 맞혀야 정답).
// 고른 칸을 무르는 단추는 두지 않는다 (공 따라가기에서 무르기는 알아채기 어려웠다).
// 난이도:
//   n    — 그림 수 (보여 주고 눌러야 할 차례 수)
//   p    — 바뀌는 성질 수 (1~2). 1 이면 모양이나 개수 가운데 하나만 바뀌고 다른 하나는 모든 그림이 같다
//   vals — 모양 수 (모양을 물을 때의 보기 단추 수). 개수는 늘 하나·둘·셋 세 가지다
//   show — 그림 하나를 보여 주는 시간(ms). 그림 사이에는 GAP_MS 동안 빈 카드가 보인다
import { U } from '../config.js';
import { Dg } from '../diagram.js';

const STAR = Array.from({ length: 10 }, (_, i) => {
  const a = ((-90 + i * 36) * Math.PI) / 180;
  const rad = i % 2 ? 19 : 46;
  return `${(50 + Math.cos(a) * rad).toFixed(1)},${(54 + Math.sin(a) * rad).toFixed(1)}`;
}).join(' ');

// 모양 (100×100). 칠하는 속성은 f 로 받는다
const SHAPES = [
  { id: 'circle', name: '동그라미', d: (f) => `<circle cx="50" cy="50" r="40" ${f}/>` },
  { id: 'triangle', name: '세모', d: (f) => `<polygon points="50,10 92,86 8,86" ${f}/>` },
  { id: 'square', name: '네모', d: (f) => `<rect x="13" y="13" width="74" height="74" rx="9" ${f}/>` },
  { id: 'star', name: '별', d: (f) => `<polygon points="${STAR}" ${f}/>` },
  { id: 'heart', name: '하트', d: (f) => `<path d="M50 89 L13 53 A21 21 0 0 1 50 22 A21 21 0 0 1 87 53 Z" ${f}/>` },
];
const COUNTS = [
  { id: 1, name: '하나' },
  { id: 2, name: '둘' },
  { id: 3, name: '셋' },
];
// 성질. obj = 조사('을/를')를 붙인 이름. 안내 문구에 늘어놓는 차례는 말로 할 때의 차례다 ('별 둘': 모양 → 개수)
const PROPS = {
  shape: { name: '모양', obj: '모양을', values: SHAPES },
  count: { name: '개수', obj: '개수를', values: COUNTS },
};
const PROP_ORDER = ['shape', 'count'];
// 모양의 겉: 모든 그림이 똑같은 무지갯빛(대각선 파스텔 그러데이션)에 윤기와 짙은 자주 테두리.
// 한 가지 색이 아니라 이름 붙일 색이 없으므로 외울 것이 아니라 꾸밈으로 보인다 (2026-11-13).
// 모양마다 다른 색을 줘 봤더니 색도 외워야 하는지 헷갈릴 수 있었고, '쓰지 않는 성질은 모든 그림이 같다'에도 어긋났다.
// 카드 바탕은 화면 스타일과 상관없이 밝은 종이색이다
const HOLO = ['#ff9a8b', '#ffd36e', '#7ee8c6', '#7aa7ff', '#c79bff'];
const EDGE = '#4a3f6b';
let uid = 0;
// 그러데이션 정의. 그림(svg)마다 따로 넣고 id 가 겹치지 않게 번호를 붙인다
function holoDefs() {
  const id = `rc${++uid}`;
  const stops = HOLO.map((c, i) => `<stop offset="${i / (HOLO.length - 1)}" stop-color="${c}"/>`).join('');
  return {
    id,
    defs: `<defs><linearGradient id="${id}-h" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>` +
      `<radialGradient id="${id}-g" cx="0.32" cy="0.22" r="0.62"><stop offset="0" stop-color="#fff" stop-opacity="0.8"/>` +
      '<stop offset="0.55" stop-color="#fff" stop-opacity="0.15"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>',
  };
}
// 모양 하나: 무지갯빛 바탕 + 테두리, 그 위에 윤기
const paintShape = (s, id, w = 4.5) =>
  s.d(`fill="url(#${id}-h)" stroke="${EDGE}" stroke-width="${w}" stroke-linejoin="round"`) + s.d(`fill="url(#${id}-g)"`);

export class RecallGame {
  static id = 'recall';
  static tags = ['memory']; // 꼬리표가 겹치는 게임끼리는 연달아 나오지 않는다 (main.js planPass)
  static title = '차례대로 외우기';
  static hint(level) {
    return RecallGame.levels[(level || 1) - 1].p > 1
      ? "'별 둘'처럼 속으로 말하며 외운 뒤<br>물어본 것을 나온 차례대로 누르세요"
      : '하나씩 나오는 그림을 외운 뒤<br>나온 차례대로 누르세요';
  }
  static levels = [
    // 쉬운 단계: 모양이나 개수 하나만 바뀐다
    { n: 2, p: 1, vals: 3, show: 1800 },
    { n: 3, p: 1, vals: 3, show: 1800 },
    // 모양과 개수가 함께 바뀐다: 어느 것을 물을지 모른다
    { n: 3, p: 2, vals: 4, show: 2000 },
    { n: 4, p: 2, vals: 4, show: 2000 },
    { n: 5, p: 2, vals: 4, show: 1900 },
    // 모양 다섯 가지 · 짧게 보여 준다
    { n: 5, p: 2, vals: 5, show: 1700 },
    { n: 6, p: 2, vals: 5, show: 1700 },
    { n: 7, p: 2, vals: 5, show: 1600 },
  ];
  static maxLevel = RecallGame.levels.length;
  static GAP_MS = 400;    // 그림과 그림 사이에 빈 카드를 보여 주는 시간
  static CARD = { w: 300, h: 180 }; // 카드 (판 단위)

  // 소개 그림: ① 하나씩 나오는 그림을 외우고 ② 물어본 것(여기서는 개수)을 차례대로 누른다
  static diagram() {
    const card = (x, y, inner) => `<rect class="rc-dg-card" x="${x}" y="${y}" width="66" height="50" rx="7"/>${inner}`;
    const fig = (shape, k, cx, cy) => RecallGame.objectSvg(shape, k, cx, cy, k > 1 ? 20 : 30, 22);
    const step1 = card(4, 22, fig('star', 2, 37, 47)) + '<path class="dg-bx-arrow" d="M76 47H96m-6 -5l6 5-6 5"/>' +
      card(104, 22, fig('circle', 1, 137, 47));
    const dots = (k, cx, cy) => Array.from({ length: k }, (_, i) => `<circle class="rc-dg-dot" cx="${cx + (i - (k - 1) / 2) * 7}" cy="${cy}" r="2.6"/>`).join('');
    const box = (x, y, k, cls = 'dg-cell') => Dg.rect(x, y, 40, 34, cls, 6) + (k ? dots(k, x + 20, y + 11) + Dg.text(x + 20, y + 24, COUNTS[k - 1].name, 11) : '');
    const step2 = box(46, 6, 2) + box(94, 6, 0, 'dg-slot active') +
      [1, 2, 3].map((k) => box(22 + (k - 1) * 46, 54, k)).join('') + Dg.tap(42, 71, 16);
    return [
      { svg: Dg.svg('0 0 174 96', step1), caption: '하나씩 나오는 그림을 외우고' },
      { svg: Dg.svg('0 0 180 96', step2), caption: '물어본 것을 차례대로 누르기' },
    ];
  }

  constructor(host) {
    this.h = host;
    this.spec = RecallGame.levels[host.level - 1];
    this.p = RecallGame.make(this.spec);
    this.phase = 'show';
    this.picked = [];
  }

  start() {
    const { stage, level } = this.h;
    const { p } = this;
    this.msg = U.el('div', 'stage-msg', '');
    this.body = U.frame(stage, `${RecallGame.title} · Lv.${level}`, this.msg).body;
    this.wrap = U.el('div', 'rc-wrap');
    // 보여 줄 때: 카드와 그 아래 몇 번째인지 알려 주는 점. 답할 때: 칸 줄과 보기 단추
    this.show = U.el('div', 'rc-show');
    const { w, h } = RecallGame.CARD;
    this.card = U.el('div', 'rc-card', `<svg viewBox="0 0 ${w} ${h}"></svg>`);
    this.cardSvg = this.card.firstChild;
    this.steps = U.el('div', 'rc-steps', p.items.map(() => '<span></span>').join(''));
    this.show.append(this.card, this.steps);
    this.slots = U.el('div', 'rc-slots');
    this.opts = U.el('div', 'ar-cands rc-opts');
    this.wrap.append(this.show);
    this.body.append(this.wrap);
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.body);
    this.layout();

    const banner = U.el('div', 'memorize-banner', '외우세요!');
    this.card.append(banner);
    // '모양·개수를 차례대로 외우세요' — 조사는 마지막 이름을 따른다
    const keys = PROP_ORDER.filter((k) => p.props.includes(k));
    const what = [...keys.slice(0, -1).map((k) => PROPS[k].name), PROPS[keys[keys.length - 1]].obj].join('·');
    this.h.after(1100, () => {
      banner.remove();
      U.say(this.msg, `${what} 차례대로 외우세요`, 'look');
      this.play(0);
    });
  }

  // i 번째 그림을 보여 주고, GAP_MS 쉰 뒤 다음 그림. 다 보여 주면 묻는다
  play(i) {
    const { p } = this;
    const dots = [...this.steps.children];
    if (i >= p.items.length) {
      dots.forEach((d) => d.classList.remove('on'));
      this.h.after(350, () => this.ask());
      return;
    }
    dots.forEach((d, j) => {
      d.classList.toggle('on', j === i);
      d.classList.toggle('past', j < i);
    });
    const it = p.items[i];
    const { w, h } = RecallGame.CARD;
    // 개수가 바뀌는 판은 셋이 한 줄에 들어가는 크기로, 아니면 하나를 크게 그린다 (한 판 안에서는 크기가 늘 같다)
    const size = p.props.includes('count') ? 84 : 130;
    this.cardSvg.innerHTML = `<g class="rc-fig">${RecallGame.objectSvg(it.shape, it.count, w / 2, h / 2, size, 94)}</g>`;
    this.h.sfx('blink');
    this.h.after(this.spec.show, () => {
      this.cardSvg.innerHTML = '';
      this.h.after(RecallGame.GAP_MS, () => this.play(i + 1));
    });
  }

  ask() {
    const { p } = this;
    this.phase = 'input';
    this.show.remove();
    this.wrap.append(this.slots, this.opts);
    this.slotEls = p.items.map((_, i) => {
      const s = U.el('div', 'rc-slot', `<span class="rc-num">${i + 1}</span>`);
      this.slots.append(s);
      return s;
    });
    this.slotEls[0].classList.add('active');
    this.btns = p.pool.map((v) => {
      const btn = U.el('button', `ar-cand rc-opt rc-${p.ask}`);
      RecallGame.fillValue(btn, p.ask, v);
      btn.addEventListener('pointerdown', () => this.pick(v, btn));
      this.opts.append(btn);
      return { v, btn };
    });
    U.say(this.msg, `${PROPS[p.ask].obj} 나온 차례대로 누르세요`, 'act');
    this.layout();
    this.h.question({
      props: p.props, ask: p.ask, pool: p.pool,
      items: p.items.map((it) => [it.shape, it.count]), // [모양, 개수] 나온 차례대로
      ans: p.ans,
    });
    // 일의 양 = 눌러야 할 칸 수
    this.h.timer(p.items.length, () => this.judge(true));
  }

  pick(v, btn) {
    if (this.phase !== 'input') return;
    const i = this.picked.length;
    this.picked.push(v);
    this.h.input({ slot: i, picked: v });
    const s = this.slotEls[i];
    s.classList.remove('active');
    s.classList.add('filled', `rc-${this.p.ask}`);
    RecallGame.fillValue(s, this.p.ask, v, true);
    btn.classList.remove('tapped');
    void btn.offsetWidth;
    btn.classList.add('tapped');
    if (this.picked.length >= this.p.items.length) this.judge(false);
    else this.slotEls[i + 1].classList.add('active');
  }

  // 다 채웠거나 시간이 다 됐다. 칸마다 맞았는지 보여 주고, 틀린 칸 아래에는 정답을 적는다
  judge(timedOut) {
    if (this.phase !== 'input') return;
    this.phase = 'end';
    this.h.stopTimer();
    const { p } = this;
    const n = p.items.length;
    this.btns.forEach((b) => (b.btn.disabled = true));
    this.hits = 0;
    this.slotEls.forEach((s, i) => {
      s.classList.remove('active');
      const ok = this.picked[i] === p.ans[i];
      s.classList.add(ok ? 'right' : 'wrong');
      s.append(U.el('span', 'mark', ok ? '✓' : '✕'));
      if (ok) {
        this.hits++;
      } else {
        const fix = U.el('div', `rc-fix rc-${p.ask}`);
        RecallGame.fillValue(fix, p.ask, p.ans[i], true);
        s.append(fix);
      }
    });
    const ok = this.hits === n;
    this.cleared = ok;
    // 맞힌 칸 수만큼 한 번에 준다 (칸마다 따로 띄우면 점수 글자가 겹친다)
    if (this.hits) this.h.award((this.h.base * this.h.mult * this.hits) / n, this.slots);
    this.h.answer({ picked: [...this.picked], hits: this.hits, of: n, correct: ok, timedOut });
    if (ok) {
      U.say(this.msg, '정답!', 'good');
      this.h.sfx('good');
    } else {
      U.say(this.msg, timedOut ? '시간 초과 · 아래가 정답이에요' : `${n}개 중 ${this.hits}개를 맞혔어요`, 'bad');
      this.h.sfx('bad');
    }
    this.layout();
    this.h.after(ok ? 1100 : 2400, () => this.finish());
  }

  layout() {
    const s = this.body;
    const W = s.clientWidth;
    const H = s.clientHeight;
    if (this.phase === 'show') {
      const ar = RecallGame.CARD.w / RecallGame.CARD.h;
      const w = Math.max(200, Math.min(W - 32, (H - 40) * ar, 520));
      this.card.style.width = `${w}px`;
      this.card.style.height = `${w / ar}px`;
      return;
    }
    // 칸: 한 줄에 n 칸. 높이는 너비의 1.15배이고, 아래에 틀린 칸의 정답을 적을 자리(너비의 0.55)를 둔다.
    // 좁은 화면(휴대폰)에서 칸이 너무 작아지면 두 줄로 나눈다
    const n = this.p.items.length;
    const optH = this.opts.offsetHeight || 104;
    const gap = Math.min(18, W * 0.03); // 맞음·틀림 고리(칸 밖 4px)가 옆 칸에 닿지 않게
    const fit = (cols, rows) => Math.min(
      (W - 24 - gap * (cols - 1)) / cols,
      (H - optH - U.gapOf(this.wrap, 28) - 20 - gap * (rows - 1)) / ((1.15 + 0.55) * rows),
      112);
    let cols = n;
    let sz = fit(n, 1);
    if (sz < 60 && n > 4 && fit(Math.ceil(n / 2), 2) > sz) {
      cols = Math.ceil(n / 2);
      sz = fit(cols, 2);
    }
    sz = Math.max(36, sz);
    this.wrap.style.setProperty('--ss', `${sz}px`);
    this.slots.style.gap = `${gap + sz * 0.55}px ${gap}px`;
    this.slots.style.width = `${cols * sz + (cols - 1) * gap + 2}px`;
  }

  finish() {
    this.ro.disconnect();
    this.h.done(this.result());
  }

  result() {
    return { cleared: !!this.cleared, correct: this.hits || 0, total: this.p.items.length };
  }

  // 점수는 채점할 때 주므로 중단될 때 따로 줄 것이 없다
  abort() {
    const answered = this.phase === 'end';
    this.phase = 'end';
    this.ro.disconnect();
    return { cleared: false, correct: this.hits || 0, total: answered ? this.p.items.length : 0 };
  }

  // ---- 그리기 ----

  static shape(id) { return SHAPES.find((s) => s.id === id); }

  // (cx, cy) 가운데에 모양 k 개를 한 줄로. size = 하나의 크기, step = 가운데 사이 거리. 그러데이션 정의도 함께 돌려준다
  static objectSvg(shape, k, cx, cy, size, step) {
    const { id, defs } = holoDefs();
    const body = paintShape(RecallGame.shape(shape), id);
    return defs + Array.from({ length: k }, (_, i) => Dg.glyph(body, cx + (i - (k - 1) / 2) * step, cy, size)).join('');
  }

  // 보기 단추·칸에 값 하나를 그린다: 모양은 그 모양(카드와 같은 무지갯빛)과 이름을, 개수는 점과 이름을.
  // keep = 칸 번호·표시(.rc-num, .mark, .rc-fix)는 남긴다
  static fillValue(el, prop, v, keep = false) {
    if (keep) [...el.children].forEach((c) => !c.matches('.rc-num, .mark, .rc-fix') && c.remove());
    else el.innerHTML = '';
    let ico;
    let name;
    if (prop === 'shape') {
      const s = RecallGame.shape(v);
      const { id, defs } = holoDefs();
      ico = `<svg class="rc-ico" viewBox="0 0 100 100">${defs}${paintShape(s, id, 6)}</svg>`;
      name = s.name;
    } else {
      ico = `<span class="rc-dots">${'<i></i>'.repeat(v)}</span>`;
      name = COUNTS.find((c) => c.id === v).name;
    }
    el.insertAdjacentHTML('beforeend', `<span class="rc-val">${ico}<span class="rc-name">${name}</span></span>`);
  }

  // ---- 문제 만들기 ----
  // 반환: { props: 바뀌는 성질, ask: 묻는 성질, pool: 묻는 성질의 보기 (단추 차례), items: [{ shape, count }], ans: 묻는 성질의 값 (차례대로) }
  static make(spec, rand = Math.random) {
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    const { n } = spec;
    const props = shuffle([...PROP_ORDER]).slice(0, spec.p);
    const ask = pick(props);
    // 성질마다 쓸 값: 바뀌는 성질은 모양 vals 가지 · 개수 셋 모두, 바뀌지 않는 성질은 하나 (개수는 하나)
    const shapes = SHAPES.map((s) => s.id);
    const pools = {
      shape: shuffle([...shapes]).slice(0, props.includes('shape') ? spec.vals : 1),
      count: props.includes('count') ? COUNTS.map((c) => c.id) : [1],
    };
    // 한 값이 나오는 횟수의 상한: 그림 수의 절반 (올림). 둘이면 서로 다르다
    const cap = Math.ceil(n / 2);
    for (let tries = 0; tries < 500; tries++) {
      const items = [];
      for (let i = 0; i < n; i++) items.push({ shape: pick(pools.shape), count: pick(pools.count) });
      if (items.some((it, i) => i && it.shape === items[i - 1].shape && it.count === items[i - 1].count)) continue;
      const okProp = (k) => {
        const tally = {};
        items.forEach((it) => (tally[it[k]] = (tally[it[k]] || 0) + 1));
        const counts = Object.values(tally);
        return counts.length >= 2 && Math.max(...counts) <= cap;
      };
      if (!props.every(okProp)) continue;
      // 보기 단추는 값의 정해진 차례로 (모양 표의 차례, 개수는 작은 것부터) — 단추 자리로 외우지 않게 늘 같은 차례다
      const order = PROPS[ask].values.map((v) => v.id);
      const pool = pools[ask].slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
      return { props, ask, pool, items, ans: items.map((it) => it[ask]) };
    }
    throw new Error('recall: 판을 못 만들었다');
  }
}
