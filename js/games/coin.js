// 동전 세기
// 탁자 위에 동전이 흩어져 있고, 몇 개는 다른 동전 위에 겹쳐 얹혀 있다. 세 문제를 차례로 묻는다.
//   Lv1~3 — 구리 동전 한 가지뿐이고, 모두 몇 개인지 묻는다 (공간지각: 겹친 동전을 빠짐없이 세기)
//   Lv4~  — 에나멜 배지(옷깃에 다는 핀 모양) 동전이 섞여 있고, 값 표를 보고 모두 몇 점인지 묻는다 (암산)
// 값을 묻는 단계는 문제마다 나오는 배지와 그 값을 새로 뽑는다. 처음에는 구리·은·금(1·5·10)으로 했더니
// 값이 몸에 배어 있어 값 표를 보지 않게 되었다 (2026-11-12). 배지는 모두 같은 크기·같은 금빛 테두리다 —
// 크기나 금속이 값을 귀띔하지 않게. 판돈 칩처럼 보이는 줄무늬 원판도 써 봤으나 노름 칩 같아서 바꿨다.
// 난이도는 동전 수·종류와 겹치는 정도로 올린다:
//   kinds   — 한 문제에 나오는 동전 종류 수 (1 이면 구리 동전만). 종류마다 적어도 하나씩 놓는다
//   values  — 배지 값을 뽑는 범위 [최소, 최대]. 한 문제 안에서는 서로 다르다
//   n       — 동전 수 [최소, 최대]
//   overlap — 동전 하나를 이미 놓인 동전에 걸쳐 놓을 확률
//   stack   — 몇 층까지 쌓을 수 있나 (0 = 바닥에만)
//   minVis  — 동전마다 앞면이 이만큼은 보여야 한다. 가운데 무늬는 늘 다 보이게 둔다 — 무늬가 가려지면
//             한 닢인지 두 닢인지, 어느 동전인지 알아볼 수 없다
//   r       — 동전 반지름 (판 단위)
//   opts    — 숫자 보기 수 (기본 4)
//
// 그림: 동전은 두께가 있는 원판이고, 탁자를 비스듬히 내려다본다. 바닥 좌표 (X, Y) 와 높이 Z 의 점은
// 화면 (X, Y·K − Z) 에 그린다 (Y 는 바닥에서 안쪽으로). 그래서 바닥에 누운 동전 앞면은 가로 r · 세로 r·K 의 타원이다.
// 다른 동전에 걸친 동전은 무게 중심이 밑의 동전 밖으로 나가 있으면 기운다: 가까운 쪽 가장자리는 밑의 동전
// 테두리에 얹히고 먼 쪽 가장자리는 그 아래(탁자나 다른 동전)에 닿는다. 무게 중심이 밑의 동전 위에 있으면 평평하게 얹힌다.
// 기운 원판의 앞면은 단위 원을 아핀 변환한 타원이라 matrix() 하나로 그린다 (geom). 옆면은 앞면 타원을 두께만큼
// 밀어낸 자리까지 쓸어 만든 모양이다.
//
// 배치: 넓은 화면은 탁자 오른쪽에 값 표와 그 아래 보기를 세워 탁자가 위아래를 다 쓰게 하고,
// 좁은 화면(세로로 세운 휴대폰 등)은 탁자 · 값 표 · 보기를 위에서 아래로 쌓는다. 두 가지를 다 재 보고 탁자가 더 커지는 쪽을 고른다 (layout).
import { U } from '../config.js';
import { Dg } from '../diagram.js';

// 구리 동전: light·base·dark = 앞면 빛깔(밝은 쪽 → 어두운 쪽), edge = 옆면
// 배지: enamel = 에나멜 빛깔 [밝은 쪽, 가운데, 어두운 쪽]. 금속 부분은 모두 METAL. 색만으로 구분하지 않도록 색마다 무늬가 따로 있다
const TOKENS = [
  { id: 'bronze', coin: true, light: '#f3b88a', base: '#c7763f', dark: '#8c4a22', edge: '#7a3d18', mark: 'dot' },
  { id: 'red', enamel: ['#f2777b', '#d1343a', '#9e1f25'], mark: 'star' },
  { id: 'blue', enamel: ['#6b97f2', '#2557c9', '#173d94'], mark: 'square' },
  { id: 'green', enamel: ['#55c886', '#1d8a4c', '#125c32'], mark: 'triangle' },
  { id: 'black', enamel: ['#5a606c', '#2a2e36', '#121418'], mark: 'diamond' },
  { id: 'purple', enamel: ['#b884e4', '#7b3fb3', '#552a80'], mark: 'plus' },
];
const METAL = { light: '#fff4c4', base: '#e2b746', dark: '#a07818', edge: '#7a5a0e', line: '#86610f' };
const BADGES = TOKENS.filter((t) => !t.coin).map((t) => t.id);
const token = (id) => TOKENS.find((t) => t.id === id);

// 앞면 무늬. 반지름 1 인 단위 원 안에 그린다 (그릴 때 동전의 앞면 타원으로 늘린다)
const MARKS = {
  dot: '<circle r="0.3"/>',
  star: '<path d="M0-.46L.11-.15H.44L.17.06.27.38 0 .19-.27.38-.17.06-.44-.15H-.11Z"/>',
  square: '<rect x="-.31" y="-.31" width=".62" height=".62" rx=".06"/>',
  triangle: '<path d="M0-.42L.42.32H-.42Z"/>',
  diamond: '<path d="M0-.46L.36 0 0 .46-.36 0Z"/>',
  plus: '<path d="M-.13-.42H.13V-.13H.42V.13H.13V.42H-.13V.13H-.42V-.13H-.13Z"/>',
};
const UNIT = '점'; // 값의 단위. 개수가 아니라 값을 묻는다는 것을 보기·값 표·질문에 늘 붙여 알린다 ('원' 에서 바꿈, 2026-11-12)

let uid = 0;

export class CoinGame {
  static id = 'coin';
  static tags = ['number', 'search']; // 꼬리표가 겹치는 게임끼리는 연달아 나오지 않는다 (main.js planPass)
  static title = '동전 세기';
  static levels = [
    // 쉬운 단계·첫 단계: 구리 동전만, 몇 개인지
    { kinds: 1, n: [4, 6], overlap: 0.15, stack: 1, minVis: 0.8, r: 28, opts: 3 },
    { kinds: 1, n: [6, 8], overlap: 0.3, stack: 1, minVis: 0.7, r: 26, opts: 3 },
    { kinds: 1, n: [8, 11], overlap: 0.45, stack: 2, minVis: 0.55, r: 24 },
    // Lv4 부터: 값 표를 보고 모두 몇 점인지
    { kinds: 2, values: [1, 5], n: [6, 8], overlap: 0.25, stack: 1, minVis: 0.7, r: 26 },
    { kinds: 3, values: [1, 6], n: [7, 9], overlap: 0.35, stack: 1, minVis: 0.65, r: 25 },
    { kinds: 3, values: [1, 9], n: [9, 12], overlap: 0.45, stack: 2, minVis: 0.55, r: 23 },
    // 높은 단계: 동전을 늘리고 Lv8 은 다섯 종류를 다 쓴다 (2026-11-12: 예전 Lv7 4종 10~13개 · Lv8 4종 12~15개는 쉬웠다)
    { kinds: 4, values: [1, 9], n: [13, 16], overlap: 0.55, stack: 2, minVis: 0.5, r: 21 },
    { kinds: 5, values: [2, 9], n: [15, 18], overlap: 0.6, stack: 3, minVis: 0.45, r: 20 },
  ];
  static maxLevel = CoinGame.levels.length;
  static ROUNDS = 3;
  static VALUE_FROM = 4;  // 이 레벨부터 값을 더한다
  // 판 (판 단위): 나무 테두리를 두른 네모난 탁자, 그 안은 천을 깐 바닥. 넓은 화면에서는 값 표·보기가 옆에 서서
  // 탁자가 게임 자리의 위아래를 다 쓴다 (운영 버전 태블릿 1280×800 에서 약 370px).
  // 400×210 으로 옆으로 길게 둔 적도 있으나, 보기를 옆으로 옮겨 동전이 커지고 나니 탁자가 지나치게 넓어 보였다 (2026-11-12).
  // 탁자 높이(판 단위)를 그때와 비슷하게 두어 화면 위 동전 크기는 그대로다. 210 까지 줄여도 Lv8 판이 늘 만들어진다
  static W = 220;
  static H = 220;
  static RIM = 11;        // 나무 테두리 두께
  static K = 0.74;        // 바닥의 안쪽 방향이 화면에서 줄어드는 비율 (비스듬히 내려다본 정도)
  static THICK = 0.18;    // 두께 / 반지름
  static MAX_TILT = 0.5;  // 가장 많이 기우는 각도 (라디안, 약 29°)

  // 소개 문구·그림은 레벨에 따라 다르다 (Lv1~3 개수 · Lv4~ 값). main.js 가 레벨을 넘겨 준다
  static hint(level) {
    return level >= CoinGame.VALUE_FROM
      ? `동전 값은 문제마다 바뀝니다<br>값 표를 보고 모두 몇 ${UNIT}인지 더하세요`
      : '탁자 위의 동전을 빠짐없이 세어 보세요<br>다른 동전에 겹쳐 놓인 동전도 셉니다';
  }

  // 소개 그림: ① 겹친 동전까지 세어 (값 표를 보고 더해) ② 아래 보기에서 고른다. 그림 속 동전과 정답 보기가 맞아야 한다
  //   개수: 구리 4개 → 4개 (하나는 다른 동전에 기대어 기울어 있다) · 값: 빨강(2점) 둘 + 파랑(5점) 하나 → 9점.
  //   값을 물을 때는 게임 화면처럼 탁자 오른쪽에 '동전 값' 표를 둔다
  static diagram(level = 1) {
    const value = level >= CoinGame.VALUE_FROM;
    const ids = `cnd${uid++}`;
    const { THICK, K } = CoinGame;
    const c = (kind, x, gy, r) => CoinGame.tokenSvg(token(kind), CoinGame.flat(x, gy, r, r * THICK), ids);
    let first;
    const table = (x, y, s) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="9" fill="#8a5a33"/><rect x="${x + 6}" y="${y + 6}" width="${s - 12}" height="${s - 12}" rx="5" fill="#2a4560"/>`;
    if (value) {
      const legend = Dg.rect(116, 12, 60, 100, 'dg-cell', 8) + Dg.text(146, 26, '동전 값', 11, 'dg-txt') +
        c('red', 130, 54, 10) + Dg.text(158, 50, `2${UNIT}`, 15) +
        c('blue', 130, 90, 10) + Dg.text(158, 86, `5${UNIT}`, 15);
      first = table(4, 10, 104) + c('red', 32, 50, 15) + c('blue', 80, 46, 15) + c('red', 54, 88, 15) + legend;
    } else {
      // 셋째 동전은 첫째 동전 쪽(왼쪽 위)으로 기대어 기울어 있다
      const len = Math.hypot(-18, -18 / K);
      const lean = CoinGame.geom({ x: 82, gy: 76, r: 17, h: 17 * THICK, zc: 1.6, w: [-18 / len, -18 / K / len], tilt: 0.2 });
      first = table(34, 6, 112) + c('bronze', 64, 54, 17) + c('bronze', 116, 44, 17) + CoinGame.tokenSvg(token('bronze'), lean, ids) + c('bronze', 112, 98, 17);
    }
    const [ask, vals, unit] = value ? [`모두 몇 ${UNIT}?`, [7, 9, 12], UNIT] : ['모두 몇 개?', [3, 4, 5], '개'];
    const opts = vals.map((v, i) => Dg.rect(24 + i * 46, 44, 42, 38) + Dg.text(45 + i * 46, 63, `${v}${unit}`, 14)).join('');
    return [
      { svg: Dg.svg('0 0 180 124', CoinGame.defs(ids) + first), caption: value ? '값 표를 보고 더해' : '겹친 동전까지 세어' },
      { svg: Dg.svg('0 0 180 124', Dg.text(90, 24, ask, 15, 'dg-txt') + opts + Dg.tap(91, 63, 22)), caption: '보기에서 고르기' },
    ];
  }

  constructor(host) {
    this.h = host;
    this.spec = CoinGame.levels[host.level - 1];
    this.valueMode = host.level >= CoinGame.VALUE_FROM;
    this.ids = `cn${uid++}`;
    this.round = 0;
    this.correct = 0;
    this.phase = 'wait';
  }

  start() {
    const { stage, level } = this.h;
    const { W, H, RIM } = CoinGame;
    this.msg = U.el('div', 'stage-msg', '');
    const { body, dots } = U.frame(stage, `${CoinGame.title} · Lv.${level}`, this.msg, CoinGame.ROUNDS);
    this.body = body;
    this.progress = dots;
    this.wrap = U.el('div', 'cn-wrap');
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'cn-arena');
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.svg.innerHTML = CoinGame.defs(this.ids) +
      `<radialGradient id="${this.ids}-felt" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#36597a"/><stop offset="1" stop-color="#1f3449"/></radialGradient>` +
      `<linearGradient id="${this.ids}-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8723f"/><stop offset="1" stop-color="#6f4522"/></linearGradient>` +
      `<clipPath id="${this.ids}-table"><rect width="${W}" height="${H}" rx="16"/></clipPath>` +
      `<rect width="${W}" height="${H}" rx="16" fill="url(#${this.ids}-wood)"/>` +
      `<g clip-path="url(#${this.ids}-table)">${CoinGame.grain(W, H)}</g>` +
      `<rect class="cn-felt" x="${RIM}" y="${RIM}" width="${W - 2 * RIM}" height="${H - 2 * RIM}" rx="8" fill="url(#${this.ids}-felt)"/>` +
      '<g class="cn-coins"></g>';
    this.coinsEl = this.svg.querySelector('.cn-coins');
    // 옆 칸: 값 표(값을 물을 때) 위, 보기 아래
    this.side = U.el('div', 'cn-side');
    if (this.valueMode) {
      this.legend = U.el('div', 'cn-legend', '<div class="cn-legend-title">동전 값</div><div class="cn-rows"></div>');
      this.rows = this.legend.querySelector('.cn-rows');
      this.side.append(this.legend);
    }
    this.opts = U.el('div', 'ar-cands cn-opts');
    this.side.append(this.opts);
    this.wrap.append(this.svg, this.side);
    body.append(this.wrap);
    // 판 자리 크기만 지켜본다. 보기·값 표가 바뀔 때는 next() 가 직접 layout() 을 부른다
    // (layout 이 가로·세로 배치를 바꿔 보며 재므로, 그 요소들을 지켜보면 스스로를 다시 부르게 된다)
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(body);
    this.next();
  }

  next() {
    const p = CoinGame.make(this.spec, this.valueMode);
    this.p = p;
    U.say(this.msg, this.valueMode ? `동전 값을 모두 더하면 몇 ${UNIT}일까요?` : '동전이 모두 몇 개일까요?', 'act');
    [...this.progress.children].forEach((d, i) => d.classList.toggle('cur', i === this.round));

    // 놓은 차례대로 그린다 — 나중에 놓은 동전이 위에 온다. 떨어지는 연출도 그 차례로 조금씩 늦춘다
    this.coinsEl.innerHTML = p.coins.map((c, i) =>
      `<g class="cn-coin" style="animation-delay:${i * 28}ms">${CoinGame.tokenSvg(token(c.kind), c.g, this.ids)}</g>`).join('');

    // 값 표: 이번 문제의 배지와 값 (값이 작은 것부터). 값이 문제마다 바뀌므로 새 문제마다 표를 한 번 반짝인다
    if (this.legend) {
      this.rows.innerHTML = p.kinds.map((k, i) => {
        const ids = `${this.ids}l${k}`;
        return `<div class="cn-row" data-k="${k}"><svg class="cn-ico" viewBox="-30 -26 60 50">${CoinGame.defs(ids, [k])}${CoinGame.tokenSvg(token(k), CoinGame.flat(0, 6, 22, 22 * CoinGame.THICK), ids, false)}</svg>` +
          `<span class="cn-val">${p.values[i]}<small>${UNIT}</small></span><span class="cn-n"></span></div>`;
      }).join('');
      this.legend.classList.remove('flash');
      void this.legend.offsetWidth;
      this.legend.classList.add('flash');
    }

    this.opts.innerHTML = '';
    const unit = this.valueMode ? UNIT : '개';
    this.btns = p.opts.map((v) => {
      const b = U.el('button', 'ar-cand cn-opt', `${v}<small>${unit}</small>`);
      b.addEventListener('pointerdown', () => this.pick(v, b));
      this.opts.append(b);
      return { v, b };
    });
    this.layout();
    this.phase = 'input';
    const r1 = (v) => Math.round(v * 10) / 10;
    this.h.question({
      mode: this.valueMode ? 'value' : 'count',
      kinds: p.kinds,
      values: p.values,
      coins: p.coins.map((c) => [c.kind, Math.round(c.x), Math.round(c.gy), r1(c.zc), Math.round((c.tilt * 180) / Math.PI)]),
      counts: p.counts,
      ans: p.ans,
      opts: p.opts,
    });
    // 일의 양 = 동전 수. 값을 더할 때는 더하는 일만큼(동전 수의 0.3배 + 종류 수) 더 준다
    const n = p.coins.length;
    this.h.timer(this.valueMode ? Math.round(n * 1.3) + p.kinds.length : n, () => this.pick(null, null));
  }

  // 가로 배치([탁자 | 값 표·보기])와 세로 배치(위에서 아래로)를 둘 다 재 보고 탁자가 더 커지는 쪽을 쓴다
  layout() {
    const s = this.body;
    if (!this.btns) return;
    const ar = CoinGame.W / CoinGame.H;
    const bw = s.clientWidth - 40;
    const bh = s.clientHeight - 10;
    const gap = U.gapOf(this.wrap, 22);
    const fit = (side) => {
      this.wrap.classList.toggle('side', side);
      if (side) return Math.min(bw - this.side.offsetWidth - gap, bh * ar);
      return Math.min(bw, (bh - this.side.offsetHeight - gap) * ar);
    };
    const across = fit(true);
    const stacked = fit(false);
    const side = across >= stacked;
    this.wrap.classList.toggle('side', side);
    const w = Math.max(200, Math.min(side ? across : stacked, 1100));
    this.svg.style.width = `${w}px`;
    this.svg.style.height = `${w / ar}px`;
  }

  // v = 고른 값. null 이면 시간이 다 된 것
  pick(v, btn) {
    if (this.phase !== 'input') return;
    this.phase = 'wait';
    this.h.stopTimer();
    const { p } = this;
    const ok = v === p.ans;
    this.h.answer({ picked: v, correct: ok, timedOut: !btn });
    this.btns.forEach(({ v: x, b }) => {
      b.disabled = true;
      if (x === p.ans) b.classList.add(ok ? 'right' : 'answer');
    });
    if (!ok && btn) btn.classList.add('wrong');
    this.reveal();

    const d = this.progress.children[this.round];
    d.classList.remove('cur');
    d.classList.add(ok ? 'right' : 'wrong');
    if (ok) {
      this.correct++;
      U.say(this.msg, '정답!', 'good');
      this.h.award((this.h.base * this.h.mult) / CoinGame.ROUNDS, btn);
      this.h.sfx('good');
    } else {
      U.say(this.msg, `${btn ? '' : '시간 초과 · '}${this.explain()}`, 'bad');
      this.h.sfx('bad');
    }
    this.h.after(ok ? 1100 : 2200, () => this.advance());
  }

  // 답한 뒤: 동전마다 번호(개수를 물을 때)나 값(값을 물을 때)을 적고, 값 표에 종류마다 개수를 적는다
  reveal() {
    const { p } = this;
    // 번호는 왼쪽부터 매긴다 (눈으로 따라가며 어디를 빠뜨렸는지 보기 쉽게)
    const order = p.coins.map((c, i) => i).sort((a, b) => p.coins[a].x - p.coins[b].x);
    const num = new Map(order.map((i, k) => [i, k + 1]));
    [...this.coinsEl.children].forEach((g, i) => {
      const c = p.coins[i];
      const label = this.valueMode ? p.values[p.kinds.indexOf(c.kind)] : num.get(i);
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('class', 'cn-label');
      t.setAttribute('x', c.g.c[0].toFixed(2));
      t.setAttribute('y', c.g.c[1].toFixed(2));
      t.setAttribute('font-size', (c.r * 0.9).toFixed(1));
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('dominant-baseline', 'central');
      t.textContent = String(label);
      g.append(t);
    });
    if (this.legend) {
      p.kinds.forEach((k, i) => {
        this.rows.querySelector(`[data-k="${k}"] .cn-n`).textContent = `× ${p.counts[i]}`;
      });
    }
  }

  explain() {
    const { p } = this;
    if (!this.valueMode) return `동전은 모두 ${p.ans}개`;
    const parts = p.kinds.map((k, i) => `${p.values[i]}${UNIT}×${p.counts[i]}`);
    return `${parts.join(' + ')} = ${p.ans}${UNIT}`;
  }

  advance() {
    this.round++;
    if (this.round < CoinGame.ROUNDS) return this.next();
    this.ro.disconnect();
    this.h.done(this.result());
  }

  result() {
    return { cleared: this.correct === CoinGame.ROUNDS, correct: this.correct, total: CoinGame.ROUNDS };
  }

  // 점수는 맞힐 때마다 바로 지급하므로 중단될 때 따로 줄 것이 없다
  abort() {
    this.phase = 'wait';
    this.ro.disconnect();
    return { cleared: false, correct: this.correct, total: this.round };
  }

  // ---- 모양 ----
  // 원판 하나의 화면 위 모양: { c: 앞면 가운데, a·b: 앞면 타원의 두 축 (단위 원의 x·y 축이 가는 곳), d: 앞면 → 밑면 }
  // 바닥 자리 (x, gy) 는 화면 좌표 (gy = Y·K), zc = 밑면 가운데의 높이, w = 기울어 올라가는 쪽 (바닥 방향, 단위 벡터),
  // tilt = 기운 각도. 앞면의 두 축은 바닥에 누운 원판의 x·y 축을 w 에 수직인 축으로 tilt 만큼 돌린 것이다
  static geom({ x, gy, r, h, zc, w = [1, 0], tilt = 0 }) {
    const { K } = CoinGame;
    const [wx, wy] = w;
    const cs = Math.cos(tilt);
    const sn = Math.sin(tilt);
    const ew = [wx * cs, wy * cs, sn];     // 원판 위에서 w 쪽 (올라간다)
    const ep = [-wy, wx, 0];               // 원판 위에서 w 에 수직 (수평)
    const n = [-wx * sn, -wy * sn, cs];    // 앞면이 보는 쪽
    const proj = (v, k = 1) => [v[0] * k, (v[1] * K - v[2]) * k];
    // 바닥의 x 축 = wx·w − wy·(w 의 수직), y 축 = wy·w + wx·(w 의 수직). 그 둘을 돌리면 w → ew, 수직 → ep
    const ux = [0, 1, 2].map((i) => wx * ew[i] - wy * ep[i]);
    const uy = [0, 1, 2].map((i) => wy * ew[i] + wx * ep[i]);
    const bottom = [x, gy - zc];
    const top = proj(n, h);
    return { c: [bottom[0] + top[0], bottom[1] + top[1]], a: proj(ux, r), b: proj(uy, r), d: [-top[0], -top[1]] };
  }

  static flat(x, gy, r, h) {
    return CoinGame.geom({ x, gy, r, h, zc: 0 });
  }

  // 타원 위의 점: 단위 원 위의 (u, v) 를 화면으로
  static at(g, u, v) {
    return [g.c[0] + g.a[0] * u + g.b[0] * v, g.c[1] + g.a[1] * u + g.b[1] * v];
  }

  // ---- 그리기 ----
  // 구리 동전·배지 금속(옆면은 양 끝이 어두운 원통 빛, 앞면은 왼쪽 위가 밝은 빛)과 배지마다 에나멜 그러데이션.
  // ids = 이 그림에서만 쓰는 id 앞머리, only = 이 종류의 것만
  static defs(ids, only = null) {
    const lin = (id, x2, y2, stops) => `<linearGradient id="${id}" x1="${x2 ? 0.15 : 0}" y1="0" x2="${x2 ? 0.85 : 1}" y2="${y2}">` +
      stops.map(([o, col]) => `<stop offset="${o}" stop-color="${col}"/>`).join('') + '</linearGradient>';
    const list = TOKENS.filter((t) => !only || only.includes(t.id));
    let s = '<defs>';
    if (list.some((t) => !t.coin)) {
      s += lin(`${ids}-metal-f`, 1, 1, [[0, METAL.light], [0.45, METAL.base], [1, METAL.dark]]) +
        lin(`${ids}-metal-e`, 0, 0, [[0, METAL.edge], [0.35, METAL.light], [1, METAL.edge]]);
    }
    list.forEach((t) => {
      if (t.coin) {
        s += lin(`${ids}-${t.id}-f`, 1, 1, [[0, t.light], [0.45, t.base], [1, t.dark]]) +
          lin(`${ids}-${t.id}-e`, 0, 0, [[0, t.edge], [0.35, t.base], [1, t.edge]]);
      } else {
        s += lin(`${ids}-${t.id}-f`, 1, 1, [[0, t.enamel[0]], [0.5, t.enamel[1]], [1, t.enamel[2]]]);
      }
    });
    return s + '</defs>';
  }

  // 동전 하나: 그림자 → 옆면 → 앞면 → 무늬. g = geom() 의 모양
  //   구리 동전: 테두리 고리와 새긴 점
  //   배지(에나멜 핀): 금빛 금속 원판에 도드라진 테두리, 그 안에 에나멜을 채우고, 가운데에 금빛 무늬, 에나멜 위의 윤기
  static tokenSvg(t, g, ids, shadow = true) {
    const f = (v) => v.toFixed(2);
    const [cx, cy] = g.c;
    const [dx, dy] = g.d;
    const mat = (ox = 0, oy = 0) => `transform="matrix(${f(g.a[0])} ${f(g.a[1])} ${f(g.b[0])} ${f(g.b[1])} ${f(cx + ox)} ${f(cy + oy)})"`;
    const r = Math.hypot(g.a[0], g.a[1]);
    let s = '';
    if (shadow) s += `<ellipse ${mat(dx + r * 0.1, dy + r * 0.1)} rx="1.02" ry="1.02" fill="rgba(0,0,0,0.3)"/>`;
    // 옆면: 앞면 타원 가운데 d 쪽을 향한 반 바퀴와, 그것을 d 만큼 민 밑면의 반 바퀴를 이은 모양.
    // 반 바퀴의 끝은 타원의 접선이 d 와 나란한 곳이다
    const cr = (p, q) => p[0] * q[1] - p[1] * q[0];
    let t0 = Math.atan2(cr(g.b, g.d), cr(g.a, g.d));
    const mid = CoinGame.at(g, Math.cos(t0 + Math.PI / 2), Math.sin(t0 + Math.PI / 2));
    const dir = (mid[0] - cx) * dx + (mid[1] - cy) * dy >= 0 ? 1 : -1;
    const N = 18;
    const half = Array.from({ length: N + 1 }, (_, i) => {
      const th = t0 + (dir * Math.PI * i) / N;
      return CoinGame.at(g, Math.cos(th), Math.sin(th));
    });
    const pts = [...half, ...half.reverse().map(([px, py]) => [px + dx, py + dy])];
    const edge = t.coin ? `${ids}-${t.id}-e` : `${ids}-metal-e`;
    s += `<path d="M${pts.map(([px, py]) => `${f(px)} ${f(py)}`).join('L')}Z" fill="url(#${edge})" stroke="rgba(0,0,0,0.35)" stroke-width="0.6" stroke-linejoin="round"/>`;
    if (t.coin) {
      s += `<g ${mat()}><circle r="1" fill="url(#${ids}-${t.id}-f)" stroke="rgba(0,0,0,0.3)" stroke-width="0.03"/>` +
        `<g fill="none"><circle r="0.8" stroke="${t.dark}" stroke-opacity="0.55" stroke-width="0.07"/>` +
        `<circle r="0.8" stroke="#fff" stroke-opacity="0.3" stroke-width="0.04" transform="translate(0.04 0.05)"/></g>` +
        // 새긴 무늬: 밝은 그림자를 오른쪽 아래로 살짝 비켜 깔고 그 위에 어두운 무늬
        `<g fill="#fff" fill-opacity="0.35" transform="translate(0.05 0.06)">${MARKS[t.mark]}</g>` +
        `<g fill="${t.dark}" fill-opacity="0.75">${MARKS[t.mark]}</g></g>`;
    } else {
      s += `<g ${mat()}><circle r="1" fill="url(#${ids}-metal-f)" stroke="rgba(0,0,0,0.3)" stroke-width="0.03"/>` +
        `<circle r="0.9" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="0.035"/>` +
        `<circle r="0.79" fill="url(#${ids}-${t.id}-f)" stroke="${METAL.line}" stroke-width="0.06"/>` +
        `<g fill="url(#${ids}-metal-f)" stroke="${METAL.line}" stroke-width="0.045" stroke-linejoin="round">${MARKS[t.mark]}</g>` +
        '<ellipse cx="-.3" cy="-.4" rx=".36" ry=".13" transform="rotate(-30 -.3 -.4)" fill="#fff" fill-opacity="0.38"/>' +
        '<ellipse cx=".42" cy=".38" rx=".1" ry=".05" transform="rotate(-30 .42 .38)" fill="#fff" fill-opacity="0.2"/></g>';
    }
    return s;
  }

  // 나무 테두리의 결: 옅은 가로 물결선 몇 줄 (안쪽 천이 덮으므로 테두리에만 보인다)
  static grain(W, H) {
    let s = '';
    for (let y = 4; y < H; y += 7 + Math.random() * 6) {
      const a = (Math.random() - 0.5) * 3;
      s += `<path d="M0 ${y.toFixed(1)}Q${W / 3} ${(y + a).toFixed(1)} ${W / 2} ${y.toFixed(1)}T${W} ${y.toFixed(1)}" stroke="rgba(0,0,0,0.13)" stroke-width="${(0.6 + Math.random()).toFixed(2)}" fill="none"/>`;
    }
    return s;
  }

  // ---- 문제 만들기 ----
  // 반환: { kinds, values (kinds 순서, 값이 작은 것부터), coins (놓은 차례, 나중 것이 위), counts (kinds 순서), ans, opts }
  //   coin = { kind, x, gy (바닥에 닿는 자리, 화면 좌표), r, h, level (몇 층), zc (밑면 가운데 높이), w·tilt (기운 쪽·각도), g (geom) }
  static make(spec, valueMode) {
    let kinds = ['bronze'];
    let values = [1];
    if (valueMode) {
      const [lo, hi] = spec.values;
      values = U.shuffle(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)).slice(0, spec.kinds).sort((a, b) => a - b);
      kinds = U.shuffle([...BADGES]).slice(0, spec.kinds);
    }
    for (let tries = 0; tries < 300; tries++) {
      const list = CoinGame.pickKinds(kinds, spec);
      const coins = CoinGame.place(list, spec);
      if (!coins) continue;
      const counts = kinds.map((k) => list.filter((x) => x === k).length);
      const ans = valueMode ? counts.reduce((s, c, i) => s + c * values[i], 0) : list.length;
      return { kinds, values, coins, counts, ans, opts: CoinGame.options(ans, values, counts, valueMode, spec.opts || 4) };
    }
    throw new Error('coin: 판을 만들지 못했습니다');
  }

  // 동전 종류 목록 (놓을 차례대로). 종류마다 하나씩은 넣고 나머지는 고르게 뽑는다
  static pickKinds(kinds, spec) {
    const n = U.randInt(spec.n[0], spec.n[1]);
    const list = [...kinds];
    while (list.length < n) list.push(kinds[U.rand(kinds.length)]);
    return U.shuffle(list);
  }

  // 하나씩 놓는다. overlap 확률로 이미 놓인 동전에 걸쳐 놓고, 아니면 다른 동전에 닿지 않는 빈자리에 놓는다.
  // 하나를 놓을 때마다 그 밑에 깔린 동전들이 아직 충분히 보이는지 확인한다 (visibleEnough)
  static place(kinds, spec) {
    const { W, H, RIM, K, THICK } = CoinGame;
    const pad = RIM + 4;
    const coins = [];
    for (const kind of kinds) {
      const r = spec.r;
      const h = r * THICK;
      let placed = null;
      // 걸칠지 말지는 동전마다 한 번 정한다 (시도마다 다시 뽑으면 놓기 쉬운 빈자리 쪽으로 쏠린다). 80번 안에 못 놓으면 반대로
      const wantTop = coins.length > 0 && Math.random() < spec.overlap;
      for (let t = 0; t < 140 && !placed; t++) {
        let x;
        let gy;
        const onTop = coins.length > 0 && (t < 80 ? wantTop : !wantTop);
        if (onTop) {
          // 걸친 동전: 밑의 동전 가운데에서 두 반지름 합의 45~85% 떨어진 곳 (바닥 모양이 납작하므로 세로는 K 배).
          // 밑의 동전은 바닥에 놓인 것을 주로 고른다 — 아무 동전이나 고르면 이미 쌓인 더미에 계속 얹혀 큰 더미 하나만 생긴다
          const floor = coins.filter((o) => o.level === 0);
          const b = floor.length && Math.random() < 0.75 ? floor[U.rand(floor.length)] : coins[U.rand(coins.length)];
          const a = Math.random() * Math.PI * 2;
          const d = (r + b.r) * (0.45 + Math.random() * 0.4);
          x = b.x + Math.cos(a) * d;
          gy = b.gy + Math.sin(a) * d * K;
        } else {
          x = pad + r + Math.random() * (W - 2 * (pad + r));
          gy = pad + r * K + h * (spec.stack + 1) + Math.random() * (H - 2 * pad - 2 * r * K - h * (spec.stack + 1));
        }
        const under = coins.filter((o) => CoinGame.touch(x, gy, r, o));
        if (!onTop && under.length) continue;
        if (onTop && !under.length) continue;
        const level = under.length ? Math.max(...under.map((o) => o.level)) + 1 : 0;
        if (level > spec.stack) continue;
        const c = { kind, x, gy, r, h, level, ...CoinGame.rest(x, gy, r, under, coins) };
        c.g = CoinGame.geom(c);
        if (!CoinGame.inside(c.g, pad, W - pad, pad, H - pad)) continue;
        coins.push(c);
        if (coins.every((o, i) => CoinGame.visibleEnough(coins, i, spec.minVis))) placed = c;
        else coins.pop();
      }
      if (!placed) return null;
    }
    return coins;
  }

  // 동전이 어떻게 놓이나: { zc, w, tilt }.
  // 가장 높은 밑의 동전(받침)에 기댄다. 동전 가운데가 받침 테두리 안에 있으면 받침 위에 평평하게 얹히고,
  // 밖에 있으면 기운다: 받침 테두리(높이 S)에 걸린 곳과, 반대쪽 가장자리가 닿는 곳(높이 F: 그 자리의 동전 윗면이나 탁자)을 잇는 비탈
  static rest(x, gy, r, under, coins) {
    if (!under.length) return { zc: 0, w: [1, 0], tilt: 0 };
    const { K } = CoinGame;
    const top = (o) => o.zc + o.h;
    const s = under.reduce((m, o) => (top(o) > top(m) ? o : m));
    const S = top(s);
    const dX = s.x - x;
    const dY = (s.gy - gy) / K;
    const dist = Math.hypot(dX, dY) || 1e-6;
    const w = [dX / dist, dY / dist];
    const hang = dist - s.r; // 동전 가운데에서 받침 테두리까지 (양수면 가운데가 받침 밖)
    if (hang <= 0.05 * r) return { zc: S, w, tilt: 0 };
    // 먼 쪽 가장자리 아래: 그 자리를 덮는 동전들의 윗면 가운데 가장 높은 것, 없으면 탁자
    const fx = x - w[0] * r;
    const fY = gy / K - w[1] * r;
    const F = coins.reduce((m, o) => (Math.hypot(o.x - fx, o.gy / K - fY) < o.r ? Math.max(m, top(o)) : m), 0);
    if (F >= S) return { zc: F, w, tilt: 0 };
    const tilt = Math.min(CoinGame.MAX_TILT, Math.atan((S - F) / (hang + r)));
    return { zc: F + Math.tan(tilt) * r, w, tilt };
  }

  // 동전의 앞면·밑면 타원이 모두 [x0, x1] × [y0, y1] 안에 드는가
  static inside(g, x0, x1, y0, y1) {
    const hw = Math.hypot(g.a[0], g.b[0]);
    const hh = Math.hypot(g.a[1], g.b[1]);
    return [g.c, [g.c[0] + g.d[0], g.c[1] + g.d[1]]].every(([cx, cy]) =>
      cx - hw >= x0 && cx + hw <= x1 && cy - hh >= y0 && cy + hh <= y1);
  }

  // 바닥에서 두 동전이 겹치는가 (세로를 K 로 나눠 원으로 펴서 잰다)
  static touch(x, gy, r, o) {
    const dx = x - o.x;
    const dy = (gy - o.gy) / CoinGame.K;
    return dx * dx + dy * dy < (r + o.r) * (r + o.r) * 0.96;
  }

  // 그린 모양(앞면 타원을 d 만큼 쓸어 만든 모양)이 점 (px, py) 를 덮는가.
  // 앞면 타원의 단위 원 좌표로 옮기면 '단위 원을 0 → e 선분을 따라 민 모양' 이 되므로, 점에서 선분까지의 거리가 1 이하인지 본다
  static covers(c, px, py) {
    const { a, b, c: o, d } = c.g;
    const det = a[0] * b[1] - a[1] * b[0];
    const inv = (vx, vy) => [(b[1] * vx - b[0] * vy) / det, (-a[1] * vx + a[0] * vy) / det];
    const [qx, qy] = inv(px - o[0], py - o[1]);
    const [ex, ey] = inv(d[0], d[1]);
    const t = U.clamp((qx * ex + qy * ey) / (ex * ex + ey * ey || 1), 0, 1);
    return Math.hypot(qx - t * ex, qy - t * ey) <= 1;
  }

  // 앞면 위의 점들 (단위 원 위 격자) 가운데 뒤에 놓인 동전에 가리지 않은 비율이 minVis 이상이고,
  // 가운데 무늬 자리(반지름 0.45 안)는 하나도 가리지 않았는가
  static visibleEnough(coins, i, minVis) {
    const c = coins[i];
    const above = coins.slice(i + 1);
    if (!above.length) return true;
    let all = 0;
    let seen = 0;
    for (let u = -0.9; u <= 0.91; u += 0.2) {
      for (let v = -0.9; v <= 0.91; v += 0.2) {
        const d = u * u + v * v;
        if (d > 1) continue;
        const [px, py] = CoinGame.at(c.g, u, v);
        const hit = above.some((o) => CoinGame.covers(o, px, py));
        if (hit && d < 0.45 * 0.45) return false;
        all++;
        if (!hit) seen++;
      }
    }
    return seen / all >= minVis;
  }

  // 보기: 정답과, 하기 쉬운 실수로 나오는 값들.
  //   개수 — 가린 동전 하나·둘을 빠뜨리거나 하나를 두 번 센 값
  //   값   — 동전 하나를 빠뜨리거나(− 값) 두 번 센 값(+ 값), 한 종류를 다른 종류로 잘못 본 값(+ 두 값의 차)
  // 보기는 작은 값부터 늘어놓으므로, 정답이 몇 번째 자리에 올지를 먼저 고르게 뽑고 그만큼을 정답 아래에서 채운다
  // (실수 값만으로 채우면 정답이 늘 가운데쯤에 와서 양 끝 보기는 버리면 된다)
  static options(ans, values, counts, valueMode, k) {
    const miss = [];
    if (!valueMode) {
      miss.push(ans - 1, ans - 2, ans + 1);
    } else {
      values.forEach((v) => miss.push(ans - v, ans + v));
      values.forEach((a, i) => values.forEach((b, j) => i !== j && counts[j] > 0 && miss.push(ans + a - b)));
    }
    const near = (sign) => Array.from({ length: 12 }, (_, i) => ans + sign * (i + 1));
    const pool = (sign) => {
      const m = U.shuffle([...new Set(miss)].filter((v) => v >= 1 && Math.sign(v - ans) === sign));
      return [...m, ...near(sign).filter((v) => v >= 1 && !m.includes(v))];
    };
    const lo = pool(-1);
    const hi = pool(1);
    const below = Math.min(U.rand(k), lo.length);
    return [...lo.slice(0, below), ans, ...hi.slice(0, k - 1 - below)].sort((a, b) => a - b);
  }
}
