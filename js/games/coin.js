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
//   count   — 동전 수 [최소, 최대]
//   overlap — 동전 하나를 이미 놓인 동전에 걸쳐 놓을 확률
//   stack   — 몇 층까지 쌓을 수 있나 (0 = 바닥에만)
//   minVisible — 동전마다 앞면이 이만큼은 보여야 한다. 가운데 무늬는 늘 다 보이게 둔다 — 무늬가 가려지면
//             한 닢인지 두 닢인지, 어느 동전인지 알아볼 수 없다
//   radius  — 동전 반지름 (판 단위)
//   optionCount — 숫자 보기 수 (기본 4)
//
// 그림: 동전은 두께가 있는 원판이고, 탁자를 비스듬히 내려다본다. 바닥 좌표 (X, Y) 와 높이 Z 의 점은
// 화면 (X, Y·DEPTH_SCALE − Z) 에 그린다 (Y 는 바닥에서 안쪽으로). 그래서 바닥에 누운 동전 앞면은
// 가로 radius · 세로 radius·DEPTH_SCALE 의 타원이다.
// 다른 동전에 걸친 동전은 무게 중심이 밑의 동전 밖으로 나가 있으면 기운다: 가까운 쪽 가장자리는 밑의 동전
// 테두리에 얹히고 먼 쪽 가장자리는 그 아래(탁자나 다른 동전)에 닿는다. 무게 중심이 밑의 동전 위에 있으면 평평하게 얹힌다.
// 기운 원판의 앞면은 단위 원을 아핀 변환한 타원이라 matrix() 하나로 그린다 (geom). 옆면은 앞면 타원을 두께만큼
// 밀어낸 자리까지 쓸어 만든 모양이다.
//
// 배치: 넓은 화면은 탁자 오른쪽에 값 표와 그 아래 보기를 세워 탁자가 위아래를 다 쓰게 하고,
// 좁은 화면(세로로 세운 휴대폰 등)은 탁자 · 값 표 · 보기를 위에서 아래로 쌓거나, 값 표만 탁자 옆에 둔다. 모두 재 보고 탁자가 가장 커지는 쪽을 고른다 (layout).
import { Util } from '../config.js';
import { Diagram } from '../diagram.js';
import { Sfx } from '../sfx.js';
import { Tag } from './tags.js';
import { Phase, Progress, pointsPer, resultOf, abortedResult } from './kit.js';

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
const BADGES = TOKENS.filter((tokenType) => !tokenType.coin).map((tokenType) => tokenType.id);
const token = (id) => TOKENS.find((tokenType) => tokenType.id === id);

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
  static tags = [Tag.NUMBER, Tag.SEARCH];
  static title = '동전 세기';
  static levels = [
    // 쉬운 단계·첫 단계: 구리 동전만, 몇 개인지
    { kinds: 1, count: [4, 6], overlap: 0.15, stack: 1, minVisible: 0.8, radius: 28, optionCount: 3 },
    { kinds: 1, count: [6, 8], overlap: 0.3, stack: 1, minVisible: 0.7, radius: 26, optionCount: 3 },
    { kinds: 1, count: [8, 11], overlap: 0.45, stack: 2, minVisible: 0.55, radius: 24 },
    // Lv4 부터: 값 표를 보고 모두 몇 점인지
    { kinds: 2, values: [1, 5], count: [6, 8], overlap: 0.25, stack: 1, minVisible: 0.7, radius: 26 },
    { kinds: 3, values: [1, 6], count: [7, 9], overlap: 0.35, stack: 1, minVisible: 0.65, radius: 25 },
    { kinds: 3, values: [1, 9], count: [9, 12], overlap: 0.45, stack: 2, minVisible: 0.55, radius: 23 },
    // 높은 단계: 동전을 늘리고 Lv8 은 다섯 종류를 다 쓴다 (2026-11-12: 예전 Lv7 4종 10~13개 · Lv8 4종 12~15개는 쉬웠다)
    { kinds: 4, values: [1, 9], count: [13, 16], overlap: 0.55, stack: 2, minVisible: 0.5, radius: 21 },
    { kinds: 5, values: [2, 9], count: [15, 18], overlap: 0.6, stack: 3, minVisible: 0.45, radius: 20 },
  ];
  static maxLevel = CoinGame.levels.length;
  static ROUNDS = 3;
  static VALUE_FROM = 4;  // 이 레벨부터 값을 더한다
  // 판 (판 단위): 나무 테두리를 두른 네모난 탁자, 그 안은 천을 깐 바닥. 넓은 화면에서는 값 표·보기가 옆에 서서
  // 탁자가 게임 자리의 위아래를 다 쓴다 (운영 버전 태블릿 1280×800 에서 약 370px).
  // 400×210 으로 옆으로 길게 둔 적도 있으나, 보기를 옆으로 옮겨 동전이 커지고 나니 탁자가 지나치게 넓어 보였다 (2026-11-12).
  // 탁자 높이(판 단위)를 그때와 비슷하게 두어 화면 위 동전 크기는 그대로다. 210 까지 줄여도 Lv8 판이 늘 만들어진다
  static WIDTH = 220;
  static HEIGHT = 220;
  static RIM = 11;        // 나무 테두리 두께
  static DEPTH_SCALE = 0.74; // 바닥의 안쪽 방향이 화면에서 줄어드는 비율 (비스듬히 내려다본 정도)
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
    const idPrefix = `cnd${uid++}`;
    const { THICK, DEPTH_SCALE } = CoinGame;
    const drawCoin = (kind, x, groundY, radius) => CoinGame.tokenSvg(token(kind), CoinGame.flat(x, groundY, radius, radius * THICK), idPrefix);
    let first;
    const table = (x, y, size) => `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="9" fill="#8a5a33"/><rect x="${x + 6}" y="${y + 6}" width="${size - 12}" height="${size - 12}" rx="5" fill="#2a4560"/>`;
    if (value) {
      const legend = Diagram.rect(116, 12, 60, 100, 'dg-cell', 8) + Diagram.text(146, 26, '동전 값', 11, 'dg-txt') +
        drawCoin('red', 130, 54, 10) + Diagram.text(158, 50, `2${UNIT}`, 15) +
        drawCoin('blue', 130, 90, 10) + Diagram.text(158, 86, `5${UNIT}`, 15);
      first = table(4, 10, 104) + drawCoin('red', 32, 50, 15) + drawCoin('blue', 80, 46, 15) + drawCoin('red', 54, 88, 15) + legend;
    } else {
      // 셋째 동전은 첫째 동전 쪽(왼쪽 위)으로 기대어 기울어 있다
      const leanLength = Math.hypot(-18, -18 / DEPTH_SCALE);
      const lean = CoinGame.geom({
        x: 82, groundY: 76, radius: 17, thickness: 17 * THICK, baseHeight: 1.6,
        leanDirection: [-18 / leanLength, -18 / DEPTH_SCALE / leanLength], tilt: 0.2,
      });
      first = table(34, 6, 112) + drawCoin('bronze', 64, 54, 17) + drawCoin('bronze', 116, 44, 17) + CoinGame.tokenSvg(token('bronze'), lean, idPrefix) + drawCoin('bronze', 112, 98, 17);
    }
    const [ask, shownValues, unit] = value ? [`모두 몇 ${UNIT}?`, [7, 9, 12], UNIT] : ['모두 몇 개?', [3, 4, 5], '개'];
    const optionsSvg = shownValues.map((shownValue, i) => Diagram.rect(24 + i * 46, 44, 42, 38) + Diagram.text(45 + i * 46, 63, `${shownValue}${unit}`, 14)).join('');
    return [
      { svg: Diagram.svg('0 0 180 124', CoinGame.defs(idPrefix) + first), caption: value ? '값 표를 보고 더해' : '겹친 동전까지 세어' },
      { svg: Diagram.svg('0 0 180 124', Diagram.text(90, 24, ask, 15, 'dg-txt') + optionsSvg + Diagram.tap(91, 63, 22)), caption: '보기에서 고르기' },
    ];
  }

  /** @param {import('./host.js').GameHost} host */

  constructor(host) {
    this.host = host;
    this.spec = CoinGame.levels[host.level - 1];
    this.valueMode = host.level >= CoinGame.VALUE_FROM;
    this.idPrefix = `cn${uid++}`;
    this.round = 0;
    this.correct = 0;
    this.phase = Phase.WAIT;
  }

  start() {
    const { stage, level } = this.host;
    const { WIDTH, HEIGHT, RIM } = CoinGame;
    this.message = Util.element('div', 'stage-msg', '');
    const { body, dots } = Util.frame(stage, `${CoinGame.title} · Lv.${level}`, this.message, CoinGame.ROUNDS);
    this.body = body;
    this.progress = dots;
    this.wrap = Util.element('div', 'cn-wrap');
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'cn-arena');
    this.svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
    this.svg.innerHTML = CoinGame.defs(this.idPrefix) +
      `<radialGradient id="${this.idPrefix}-felt" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#36597a"/><stop offset="1" stop-color="#1f3449"/></radialGradient>` +
      `<linearGradient id="${this.idPrefix}-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8723f"/><stop offset="1" stop-color="#6f4522"/></linearGradient>` +
      `<clipPath id="${this.idPrefix}-table"><rect width="${WIDTH}" height="${HEIGHT}" rx="16"/></clipPath>` +
      `<rect width="${WIDTH}" height="${HEIGHT}" rx="16" fill="url(#${this.idPrefix}-wood)"/>` +
      `<g clip-path="url(#${this.idPrefix}-table)">${CoinGame.grain(WIDTH, HEIGHT)}</g>` +
      `<rect class="cn-felt" x="${RIM}" y="${RIM}" width="${WIDTH - 2 * RIM}" height="${HEIGHT - 2 * RIM}" rx="8" fill="url(#${this.idPrefix}-felt)"/>` +
      '<g class="cn-coins"></g>';
    this.coinsGroup = this.svg.querySelector('.cn-coins');
    // 옆 칸: 값 표(값을 물을 때) 위, 보기 아래. 값 표에는 제목이 없다 (동전 = 'N점' 만으로 뜻이 통한다)
    this.side = Util.element('div', 'cn-side');
    if (this.valueMode) {
      this.legend = Util.element('div', 'cn-legend', '<div class="cn-rows"></div>');
      this.rows = this.legend.querySelector('.cn-rows');
      this.side.append(this.legend);
    }
    this.optionRow = Util.element('div', 'ar-cands cn-opts');
    this.side.append(this.optionRow);
    this.wrap.append(this.svg, this.side);
    body.append(this.wrap);
    // 판 자리 크기만 지켜본다. 보기·값 표가 바뀔 때는 next() 가 직접 layout() 을 부른다
    // (layout 이 가로·세로 배치를 바꿔 보며 재므로, 그 요소들을 지켜보면 스스로를 다시 부르게 된다)
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(body);
    this.next();
  }

  next() {
    const puzzle = CoinGame.make(this.spec, this.valueMode);
    this.puzzle = puzzle;
    Util.say(this.message, this.valueMode ? `동전 값을 모두 더하면 몇 ${UNIT}일까요?` : '동전이 모두 몇 개일까요?', 'act');
    Progress.current(this.progress, this.round);

    // 놓은 차례대로 그린다 — 나중에 놓은 동전이 위에 온다. 떨어지는 연출도 그 차례로 조금씩 늦춘다
    this.coinsGroup.innerHTML = puzzle.coins.map((coin, i) =>
      `<g class="cn-coin" style="animation-delay:${i * 28}ms">${CoinGame.tokenSvg(token(coin.kind), coin.shape, this.idPrefix)}</g>`).join('');

    // 값 표: 이번 문제의 배지와 값 (값이 작은 것부터). 값이 문제마다 바뀌므로 새 문제마다 표를 한 번 반짝인다
    if (this.legend) {
      this.rows.innerHTML = puzzle.kinds.map((kind, i) => {
        const idPrefix = `${this.idPrefix}l${kind}`;
        return `<div class="cn-row" data-k="${kind}"><svg class="cn-ico" viewBox="-30 -26 60 50">${CoinGame.defs(idPrefix, [kind])}${CoinGame.tokenSvg(token(kind), CoinGame.flat(0, 6, 22, 22 * CoinGame.THICK), idPrefix, false)}</svg>` +
          `<span class="cn-val">${puzzle.values[i]}<small>${UNIT}</small></span><span class="cn-n"></span></div>`;
      }).join('');
      this.legend.classList.remove('flash');
      void this.legend.offsetWidth;
      this.legend.classList.add('flash');
    }

    this.optionRow.replaceChildren();
    const unit = this.valueMode ? UNIT : '개';
    this.optionButtons = puzzle.options.map((value) => {
      const button = Util.element('button', 'ar-cand cn-opt', `${value}<small>${unit}</small>`);
      button.addEventListener('pointerdown', () => this.pick(value, button));
      this.optionRow.append(button);
      return { value, button };
    });
    this.layout();
    this.phase = Phase.INPUT;
    const roundTenth = (value) => Math.round(value * 10) / 10;
    this.host.question({
      mode: this.valueMode ? 'value' : 'count',
      kinds: puzzle.kinds,
      values: puzzle.values,
      coins: puzzle.coins.map((coin) => [coin.kind, Math.round(coin.x), Math.round(coin.groundY), roundTenth(coin.baseHeight), Math.round((coin.tilt * 180) / Math.PI)]),
      counts: puzzle.counts,
      ans: puzzle.answer,
      opts: puzzle.options,
    });
    // 일의 양 = 동전 수. 값을 더할 때는 더하는 일만큼(동전 수의 0.3배 + 종류 수) 더 준다
    const coinCount = puzzle.coins.length;
    this.host.timer(this.valueMode ? Math.round(coinCount * 1.3) + puzzle.kinds.length : coinCount, () => this.pick(null, null));
  }

  // 세 가지 배치를 재 보고 탁자가 가장 커지는 쪽을 쓴다
  //   side : [탁자 | 값 표·보기]          (가로로 넓은 화면)
  //   stack: 탁자 / 값 표 / 보기         (세로로 긴 화면)
  //   mix  : [탁자 | 값 표] / 보기        (좁고 낮은 화면. 휴대폰 세로 화면처럼 쌓으면 탁자 자리가 모자랄 때)
  layout() {
    const body = this.body;
    if (!this.optionButtons) return;
    const aspect = CoinGame.WIDTH / CoinGame.HEIGHT;
    const roomWidth = body.clientWidth - 40;
    const roomHeight = body.clientHeight - 10;
    const gap = Util.gapOf(this.wrap, 22);
    const applyMode = (mode) => {
      this.wrap.classList.toggle('side', mode === 'side');
      this.wrap.classList.toggle('mix', mode === 'mix');
    };
    const tableWidthIn = (mode) => {
      applyMode(mode);
      if (mode === 'side') return Math.min(roomWidth - this.side.offsetWidth - gap, roomHeight * aspect);
      if (mode === 'mix') return Math.min(roomWidth - this.legend.offsetWidth - gap, (roomHeight - this.optionRow.offsetHeight - gap) * aspect);
      return Math.min(roomWidth, (roomHeight - this.side.offsetHeight - gap) * aspect);
    };
    let best = null;
    for (const mode of this.legend ? ['side', 'stack', 'mix'] : ['side', 'stack']) {
      const width = tableWidthIn(mode);
      if (!best || width > best.width) best = { mode, width };
    }
    applyMode(best.mode);
    const tableWidth = Math.max(120, Math.min(best.width, 1100));
    this.svg.style.width = `${tableWidth}px`;
    this.svg.style.height = `${tableWidth / aspect}px`;
  }

  // value = 고른 값. null 이면 시간이 다 된 것
  pick(value, button) {
    if (this.phase !== Phase.INPUT) return;
    this.phase = Phase.WAIT;
    this.host.stopTimer();
    const { puzzle } = this;
    const ok = value === puzzle.answer;
    this.host.answer({ picked: value, correct: ok, timedOut: !button });
    this.optionButtons.forEach((option) => {
      option.button.disabled = true;
      if (option.value === puzzle.answer) option.button.classList.add(ok ? 'right' : 'answer');
    });
    if (!ok && button) button.classList.add('wrong');
    this.reveal();

    Progress.mark(this.progress, this.round, ok);
    if (ok) {
      this.correct++;
      Util.say(this.message, '정답!', 'good');
      this.host.award(pointsPer(this.host, CoinGame.ROUNDS), button);
      this.host.sfx(Sfx.GOOD);
    } else {
      Util.say(this.message, `${button ? '' : '시간 초과 · '}${this.explain()}`, 'bad');
      this.host.sfx(Sfx.BAD);
    }
    this.host.after(ok ? 1100 : 2200, () => this.advance());
  }

  // 답한 뒤: 동전마다 번호(개수를 물을 때)나 값(값을 물을 때)을 적고, 값 표에 종류마다 개수를 적는다
  reveal() {
    const { puzzle } = this;
    // 번호는 왼쪽부터 매긴다 (눈으로 따라가며 어디를 빠뜨렸는지 보기 쉽게)
    const order = puzzle.coins.map((coin, i) => i).sort((a, b) => puzzle.coins[a].x - puzzle.coins[b].x);
    const numberOf = new Map(order.map((coinIndex, rank) => [coinIndex, rank + 1]));
    [...this.coinsGroup.children].forEach((coinElement, i) => {
      const coin = puzzle.coins[i];
      const label = this.valueMode ? puzzle.values[puzzle.kinds.indexOf(coin.kind)] : numberOf.get(i);
      const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      labelText.setAttribute('class', 'cn-label');
      labelText.setAttribute('x', coin.shape.center[0].toFixed(2));
      labelText.setAttribute('y', coin.shape.center[1].toFixed(2));
      labelText.setAttribute('font-size', (coin.radius * 0.9).toFixed(1));
      labelText.setAttribute('text-anchor', 'middle');
      labelText.setAttribute('dominant-baseline', 'central');
      labelText.textContent = String(label);
      coinElement.append(labelText);
    });
    if (this.legend) {
      puzzle.kinds.forEach((kind, i) => {
        this.rows.querySelector(`[data-k="${kind}"] .cn-n`).textContent = `× ${puzzle.counts[i]}`;
      });
    }
  }

  explain() {
    const { puzzle } = this;
    if (!this.valueMode) return `동전은 모두 ${puzzle.answer}개`;
    const parts = puzzle.kinds.map((kind, i) => `${puzzle.values[i]}${UNIT}×${puzzle.counts[i]}`);
    return `${parts.join(' + ')} = ${puzzle.answer}${UNIT}`;
  }

  advance() {
    this.round++;
    if (this.round < CoinGame.ROUNDS) return this.next();
    this.resizeObserver.disconnect();
    this.host.done(this.result());
  }

  result() {
    return resultOf(this.correct, CoinGame.ROUNDS);
  }

  // 점수는 맞힐 때마다 바로 지급하므로 중단될 때 따로 줄 것이 없다
  abort() {
    this.phase = Phase.WAIT;
    this.resizeObserver.disconnect();
    return abortedResult(this.correct, this.round);
  }

  // ---- 모양 ----
  // 원판 하나의 화면 위 모양 (shape):
  //   { center: 앞면 가운데, axisX·axisY: 앞면 타원의 두 축 (단위 원의 x·y 축이 가는 곳), toBottom: 앞면 → 밑면 }
  // 바닥 자리 (x, groundY) 는 화면 좌표 (groundY = Y·DEPTH_SCALE), baseHeight = 밑면 가운데의 높이,
  // leanDirection = 기울어 올라가는 쪽 (바닥 방향, 단위 벡터), tilt = 기운 각도.
  // 앞면의 두 축은 바닥에 누운 원판의 x·y 축을 leanDirection 에 수직인 축으로 tilt 만큼 돌린 것이다
  static geom({ x, groundY, radius, thickness, baseHeight, leanDirection = [1, 0], tilt = 0 }) {
    const { DEPTH_SCALE } = CoinGame;
    const [leanX, leanY] = leanDirection;
    const tiltCos = Math.cos(tilt);
    const tiltSin = Math.sin(tilt);
    const upAxis = [leanX * tiltCos, leanY * tiltCos, tiltSin];        // 원판 위에서 leanDirection 쪽 (올라간다)
    const sideAxis = [-leanY, leanX, 0];                                // 원판 위에서 leanDirection 에 수직 (수평)
    const faceNormal = [-leanX * tiltSin, -leanY * tiltSin, tiltCos];   // 앞면이 보는 쪽
    const project = (vector, scale = 1) => [vector[0] * scale, (vector[1] * DEPTH_SCALE - vector[2]) * scale];
    // 바닥의 x 축 = leanX·lean − leanY·(lean 의 수직), y 축 = leanY·lean + leanX·(lean 의 수직).
    // 그 둘을 돌리면 lean → upAxis, 수직 → sideAxis
    const faceAxisX = [0, 1, 2].map((i) => leanX * upAxis[i] - leanY * sideAxis[i]);
    const faceAxisY = [0, 1, 2].map((i) => leanY * upAxis[i] + leanX * sideAxis[i]);
    const bottom = [x, groundY - baseHeight];
    const top = project(faceNormal, thickness);
    return {
      center: [bottom[0] + top[0], bottom[1] + top[1]],
      axisX: project(faceAxisX, radius),
      axisY: project(faceAxisY, radius),
      toBottom: [-top[0], -top[1]],
    };
  }

  static flat(x, groundY, radius, thickness) {
    return CoinGame.geom({ x, groundY, radius, thickness, baseHeight: 0 });
  }

  // 타원 위의 점: 단위 원 위의 (unitX, unitY) 를 화면으로
  static pointOn(shape, unitX, unitY) {
    return [
      shape.center[0] + shape.axisX[0] * unitX + shape.axisY[0] * unitY,
      shape.center[1] + shape.axisX[1] * unitX + shape.axisY[1] * unitY,
    ];
  }

  // ---- 그리기 ----
  // 구리 동전·배지 금속(옆면은 양 끝이 어두운 원통 빛, 앞면은 왼쪽 위가 밝은 빛)과 배지마다 에나멜 그러데이션.
  // idPrefix = 이 그림에서만 쓰는 id 앞머리, only = 이 종류의 것만
  static defs(idPrefix, only = null) {
    // diagonal = 왼쪽 위 → 오른쪽 아래로 비스듬히 (앞면), 아니면 왼쪽 → 오른쪽 (옆면)
    const gradient = (id, diagonal, stops) => `<linearGradient id="${id}" x1="${diagonal ? 0.15 : 0}" y1="0" x2="${diagonal ? 0.85 : 1}" y2="${diagonal}">` +
      stops.map(([stopAt, color]) => `<stop offset="${stopAt}" stop-color="${color}"/>`).join('') + '</linearGradient>';
    const list = TOKENS.filter((tokenType) => !only || only.includes(tokenType.id));
    let svg = '<defs>';
    if (list.some((tokenType) => !tokenType.coin)) {
      svg += gradient(`${idPrefix}-metal-f`, 1, [[0, METAL.light], [0.45, METAL.base], [1, METAL.dark]]) +
        gradient(`${idPrefix}-metal-e`, 0, [[0, METAL.edge], [0.35, METAL.light], [1, METAL.edge]]);
    }
    list.forEach((tokenType) => {
      if (tokenType.coin) {
        svg += gradient(`${idPrefix}-${tokenType.id}-f`, 1, [[0, tokenType.light], [0.45, tokenType.base], [1, tokenType.dark]]) +
          gradient(`${idPrefix}-${tokenType.id}-e`, 0, [[0, tokenType.edge], [0.35, tokenType.base], [1, tokenType.edge]]);
      } else {
        svg += gradient(`${idPrefix}-${tokenType.id}-f`, 1, [[0, tokenType.enamel[0]], [0.5, tokenType.enamel[1]], [1, tokenType.enamel[2]]]);
      }
    });
    return svg + '</defs>';
  }

  // 동전 하나: 그림자 → 옆면 → 앞면 → 무늬. shape = geom() 의 모양
  //   구리 동전: 테두리 고리와 새긴 점
  //   배지(에나멜 핀): 금빛 금속 원판에 도드라진 테두리, 그 안에 에나멜을 채우고, 가운데에 금빛 무늬, 에나멜 위의 윤기
  static tokenSvg(tokenType, shape, idPrefix, shadow = true) {
    const fixed = (value) => value.toFixed(2);
    const { axisX, axisY, toBottom } = shape;
    const [centerX, centerY] = shape.center;
    const [bottomX, bottomY] = toBottom;
    const faceTransform = (offsetX = 0, offsetY = 0) =>
      `transform="matrix(${fixed(axisX[0])} ${fixed(axisX[1])} ${fixed(axisY[0])} ${fixed(axisY[1])} ${fixed(centerX + offsetX)} ${fixed(centerY + offsetY)})"`;
    const radius = Math.hypot(axisX[0], axisX[1]);
    let svg = '';
    if (shadow) svg += `<ellipse ${faceTransform(bottomX + radius * 0.1, bottomY + radius * 0.1)} rx="1.02" ry="1.02" fill="rgba(0,0,0,0.3)"/>`;
    // 옆면: 앞면 타원 가운데 toBottom 쪽을 향한 반 바퀴와, 그것을 toBottom 만큼 민 밑면의 반 바퀴를 이은 모양.
    // 반 바퀴의 끝은 타원의 접선이 toBottom 과 나란한 곳이다
    const cross = (vecA, vecB) => vecA[0] * vecB[1] - vecA[1] * vecB[0];
    const startAngle = Math.atan2(cross(axisY, toBottom), cross(axisX, toBottom));
    const middle = CoinGame.pointOn(shape, Math.cos(startAngle + Math.PI / 2), Math.sin(startAngle + Math.PI / 2));
    const turn = (middle[0] - centerX) * bottomX + (middle[1] - centerY) * bottomY >= 0 ? 1 : -1;
    const STEPS = 18;
    const half = Array.from({ length: STEPS + 1 }, (_, i) => {
      const angle = startAngle + (turn * Math.PI * i) / STEPS;
      return CoinGame.pointOn(shape, Math.cos(angle), Math.sin(angle));
    });
    const outline = [...half, ...half.reverse().map(([pointX, pointY]) => [pointX + bottomX, pointY + bottomY])];
    const edge = tokenType.coin ? `${idPrefix}-${tokenType.id}-e` : `${idPrefix}-metal-e`;
    svg += `<path d="M${outline.map(([pointX, pointY]) => `${fixed(pointX)} ${fixed(pointY)}`).join('L')}Z" fill="url(#${edge})" stroke="rgba(0,0,0,0.35)" stroke-width="0.6" stroke-linejoin="round"/>`;
    const mark = MARKS[tokenType.mark];
    if (tokenType.coin) {
      svg += `<g ${faceTransform()}><circle r="1" fill="url(#${idPrefix}-${tokenType.id}-f)" stroke="rgba(0,0,0,0.3)" stroke-width="0.03"/>` +
        `<g fill="none"><circle r="0.8" stroke="${tokenType.dark}" stroke-opacity="0.55" stroke-width="0.07"/>` +
        `<circle r="0.8" stroke="#fff" stroke-opacity="0.3" stroke-width="0.04" transform="translate(0.04 0.05)"/></g>` +
        // 새긴 무늬: 밝은 그림자를 오른쪽 아래로 살짝 비켜 깔고 그 위에 어두운 무늬
        `<g fill="#fff" fill-opacity="0.35" transform="translate(0.05 0.06)">${mark}</g>` +
        `<g fill="${tokenType.dark}" fill-opacity="0.75">${mark}</g></g>`;
    } else {
      svg += `<g ${faceTransform()}><circle r="1" fill="url(#${idPrefix}-metal-f)" stroke="rgba(0,0,0,0.3)" stroke-width="0.03"/>` +
        `<circle r="0.9" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="0.035"/>` +
        `<circle r="0.79" fill="url(#${idPrefix}-${tokenType.id}-f)" stroke="${METAL.line}" stroke-width="0.06"/>` +
        `<g fill="url(#${idPrefix}-metal-f)" stroke="${METAL.line}" stroke-width="0.045" stroke-linejoin="round">${mark}</g>` +
        '<ellipse cx="-.3" cy="-.4" rx=".36" ry=".13" transform="rotate(-30 -.3 -.4)" fill="#fff" fill-opacity="0.38"/>' +
        '<ellipse cx=".42" cy=".38" rx=".1" ry=".05" transform="rotate(-30 .42 .38)" fill="#fff" fill-opacity="0.2"/></g>';
    }
    return svg;
  }

  // 나무 테두리의 결: 옅은 가로 물결선 몇 줄 (안쪽 천이 덮으므로 테두리에만 보인다)
  static grain(width, height) {
    let svg = '';
    for (let y = 4; y < height; y += 7 + Math.random() * 6) {
      const wobble = (Math.random() - 0.5) * 3;
      svg += `<path d="M0 ${y.toFixed(1)}Q${width / 3} ${(y + wobble).toFixed(1)} ${width / 2} ${y.toFixed(1)}T${width} ${y.toFixed(1)}" stroke="rgba(0,0,0,0.13)" stroke-width="${(0.6 + Math.random()).toFixed(2)}" fill="none"/>`;
    }
    return svg;
  }

  // ---- 문제 만들기 ----
  // 반환: { kinds, values (kinds 순서, 값이 작은 것부터), coins (놓은 차례, 나중 것이 위), counts (kinds 순서), answer, options }
  //   coin = { kind, x, groundY (바닥에 닿는 자리, 화면 좌표), radius, thickness, level (몇 층),
  //            baseHeight (밑면 가운데 높이), leanDirection·tilt (기운 쪽·각도), shape (geom) }
  static make(spec, valueMode) {
    let kinds = ['bronze'];
    let values = [1];
    if (valueMode) {
      const [lowest, highest] = spec.values;
      values = Util.shuffle(Array.from({ length: highest - lowest + 1 }, (_, i) => lowest + i)).slice(0, spec.kinds).sort((a, b) => a - b);
      kinds = Util.shuffle([...BADGES]).slice(0, spec.kinds);
    }
    for (let tries = 0; tries < 300; tries++) {
      const list = CoinGame.pickKinds(kinds, spec);
      const coins = CoinGame.place(list, spec);
      if (!coins) continue;
      const counts = kinds.map((kind) => list.filter((listed) => listed === kind).length);
      const answer = valueMode ? counts.reduce((sum, count, i) => sum + count * values[i], 0) : list.length;
      return { kinds, values, coins, counts, answer, options: CoinGame.options(answer, values, counts, valueMode, spec.optionCount || 4) };
    }
    throw new Error('coin: 판을 만들지 못했습니다');
  }

  // 동전 종류 목록 (놓을 차례대로). 종류마다 하나씩은 넣고 나머지는 고르게 뽑는다
  static pickKinds(kinds, spec) {
    const coinCount = Util.randomInt(spec.count[0], spec.count[1]);
    const list = [...kinds];
    while (list.length < coinCount) list.push(kinds[Util.randomBelow(kinds.length)]);
    return Util.shuffle(list);
  }

  // 하나씩 놓는다. overlap 확률로 이미 놓인 동전에 걸쳐 놓고, 아니면 다른 동전에 닿지 않는 빈자리에 놓는다.
  // 하나를 놓을 때마다 그 밑에 깔린 동전들이 아직 충분히 보이는지 확인한다 (visibleEnough)
  static place(kinds, spec) {
    const { WIDTH, HEIGHT, RIM, DEPTH_SCALE, THICK } = CoinGame;
    const padding = RIM + 4;
    const coins = [];
    for (const kind of kinds) {
      const radius = spec.radius;
      const thickness = radius * THICK;
      let placed = null;
      // 걸칠지 말지는 동전마다 한 번 정한다 (시도마다 다시 뽑으면 놓기 쉬운 빈자리 쪽으로 쏠린다). 80번 안에 못 놓으면 반대로
      const wantTop = coins.length > 0 && Math.random() < spec.overlap;
      for (let attempt = 0; attempt < 140 && !placed; attempt++) {
        let x;
        let groundY;
        const onTop = coins.length > 0 && (attempt < 80 ? wantTop : !wantTop);
        if (onTop) {
          // 걸친 동전: 밑의 동전 가운데에서 두 반지름 합의 45~85% 떨어진 곳 (바닥 모양이 납작하므로 세로는 DEPTH_SCALE 배).
          // 밑의 동전은 바닥에 놓인 것을 주로 고른다 — 아무 동전이나 고르면 이미 쌓인 더미에 계속 얹혀 큰 더미 하나만 생긴다
          const floor = coins.filter((other) => other.level === 0);
          const base = floor.length && Math.random() < 0.75 ? floor[Util.randomBelow(floor.length)] : coins[Util.randomBelow(coins.length)];
          const angle = Math.random() * Math.PI * 2;
          const distance = (radius + base.radius) * (0.45 + Math.random() * 0.4);
          x = base.x + Math.cos(angle) * distance;
          groundY = base.groundY + Math.sin(angle) * distance * DEPTH_SCALE;
        } else {
          x = padding + radius + Math.random() * (WIDTH - 2 * (padding + radius));
          groundY = padding + radius * DEPTH_SCALE + thickness * (spec.stack + 1) +
            Math.random() * (HEIGHT - 2 * padding - 2 * radius * DEPTH_SCALE - thickness * (spec.stack + 1));
        }
        const under = coins.filter((other) => CoinGame.touch(x, groundY, radius, other));
        if (!onTop && under.length) continue;
        if (onTop && !under.length) continue;
        const level = under.length ? Math.max(...under.map((other) => other.level)) + 1 : 0;
        if (level > spec.stack) continue;
        const coin = { kind, x, groundY, radius, thickness, level, ...CoinGame.rest(x, groundY, radius, under, coins) };
        coin.shape = CoinGame.geom(coin);
        if (!CoinGame.inside(coin.shape, padding, WIDTH - padding, padding, HEIGHT - padding)) continue;
        coins.push(coin);
        if (coins.every((other, i) => CoinGame.visibleEnough(coins, i, spec.minVisible))) placed = coin;
        else coins.pop();
      }
      if (!placed) return null;
    }
    return coins;
  }

  // 동전이 어떻게 놓이나: { baseHeight, leanDirection, tilt }.
  // 가장 높은 밑의 동전(받침)에 기댄다. 동전 가운데가 받침 테두리 안에 있으면 받침 위에 평평하게 얹히고,
  // 밖에 있으면 기운다: 받침 테두리(높이 supportTop)에 걸린 곳과,
  // 반대쪽 가장자리가 닿는 곳(높이 floorTop: 그 자리의 동전 윗면이나 탁자)을 잇는 비탈
  static rest(x, groundY, radius, under, coins) {
    if (!under.length) return { baseHeight: 0, leanDirection: [1, 0], tilt: 0 };
    const { DEPTH_SCALE } = CoinGame;
    const top = (other) => other.baseHeight + other.thickness;
    const support = under.reduce((best, other) => (top(other) > top(best) ? other : best));
    const supportTop = top(support);
    const toSupportX = support.x - x;
    const toSupportY = (support.groundY - groundY) / DEPTH_SCALE;
    const distance = Math.hypot(toSupportX, toSupportY) || 1e-6;
    const leanDirection = [toSupportX / distance, toSupportY / distance];
    const hang = distance - support.radius; // 동전 가운데에서 받침 테두리까지 (양수면 가운데가 받침 밖)
    if (hang <= 0.05 * radius) return { baseHeight: supportTop, leanDirection, tilt: 0 };
    // 먼 쪽 가장자리 아래: 그 자리를 덮는 동전들의 윗면 가운데 가장 높은 것, 없으면 탁자
    const farX = x - leanDirection[0] * radius;
    const farY = groundY / DEPTH_SCALE - leanDirection[1] * radius;
    const floorTop = coins.reduce((best, other) =>
      (Math.hypot(other.x - farX, other.groundY / DEPTH_SCALE - farY) < other.radius ? Math.max(best, top(other)) : best), 0);
    if (floorTop >= supportTop) return { baseHeight: floorTop, leanDirection, tilt: 0 };
    const tilt = Math.min(CoinGame.MAX_TILT, Math.atan((supportTop - floorTop) / (hang + radius)));
    return { baseHeight: floorTop + Math.tan(tilt) * radius, leanDirection, tilt };
  }

  // 동전의 앞면·밑면 타원이 모두 [left, right] × [top, bottom] 안에 드는가
  static inside(shape, left, right, top, bottom) {
    const halfWidth = Math.hypot(shape.axisX[0], shape.axisY[0]);
    const halfHeight = Math.hypot(shape.axisX[1], shape.axisY[1]);
    const { center, toBottom } = shape;
    return [center, [center[0] + toBottom[0], center[1] + toBottom[1]]].every(([centerX, centerY]) =>
      centerX - halfWidth >= left && centerX + halfWidth <= right && centerY - halfHeight >= top && centerY + halfHeight <= bottom);
  }

  // 바닥에서 두 동전이 겹치는가 (세로를 DEPTH_SCALE 로 나눠 원으로 펴서 잰다)
  static touch(x, groundY, radius, other) {
    const offsetX = x - other.x;
    const offsetY = (groundY - other.groundY) / CoinGame.DEPTH_SCALE;
    return offsetX * offsetX + offsetY * offsetY < (radius + other.radius) * (radius + other.radius) * 0.96;
  }

  // 그린 모양(앞면 타원을 toBottom 만큼 쓸어 만든 모양)이 점 (pointX, pointY) 를 덮는가.
  // 앞면 타원의 단위 원 좌표로 옮기면 '단위 원을 0 → sweep 선분을 따라 민 모양' 이 되므로,
  // 점에서 선분까지의 거리가 1 이하인지 본다
  static covers(coin, pointX, pointY) {
    const { axisX, axisY, center, toBottom } = coin.shape;
    const determinant = axisX[0] * axisY[1] - axisX[1] * axisY[0];
    const toUnit = (screenX, screenY) => [
      (axisY[1] * screenX - axisY[0] * screenY) / determinant,
      (-axisX[1] * screenX + axisX[0] * screenY) / determinant,
    ];
    const [unitX, unitY] = toUnit(pointX - center[0], pointY - center[1]);
    const [sweepX, sweepY] = toUnit(toBottom[0], toBottom[1]);
    const along = Util.clamp((unitX * sweepX + unitY * sweepY) / (sweepX * sweepX + sweepY * sweepY || 1), 0, 1);
    return Math.hypot(unitX - along * sweepX, unitY - along * sweepY) <= 1;
  }

  // 앞면 위의 점들 (단위 원 위 격자) 가운데 뒤에 놓인 동전에 가리지 않은 비율이 minVisible 이상이고,
  // 가운데 무늬 자리(반지름 0.45 안)는 하나도 가리지 않았는가
  static visibleEnough(coins, i, minVisible) {
    const coin = coins[i];
    const above = coins.slice(i + 1);
    if (!above.length) return true;
    let all = 0;
    let seen = 0;
    for (let unitX = -0.9; unitX <= 0.91; unitX += 0.2) {
      for (let unitY = -0.9; unitY <= 0.91; unitY += 0.2) {
        const distanceSquared = unitX * unitX + unitY * unitY;
        if (distanceSquared > 1) continue;
        const [pointX, pointY] = CoinGame.pointOn(coin.shape, unitX, unitY);
        const hit = above.some((other) => CoinGame.covers(other, pointX, pointY));
        if (hit && distanceSquared < 0.45 * 0.45) return false;
        all++;
        if (!hit) seen++;
      }
    }
    return seen / all >= minVisible;
  }

  // 보기: 정답과, 하기 쉬운 실수로 나오는 값들.
  //   개수 — 가린 동전 하나·둘을 빠뜨리거나 하나를 두 번 센 값
  //   값   — 동전 하나를 빠뜨리거나(− 값) 두 번 센 값(+ 값), 한 종류를 다른 종류로 잘못 본 값(+ 두 값의 차)
  // 보기는 작은 값부터 늘어놓으므로, 정답이 몇 번째 자리에 올지를 먼저 고르게 뽑고 그만큼을 정답 아래에서 채운다
  // (실수 값만으로 채우면 정답이 늘 가운데쯤에 와서 양 끝 보기는 버리면 된다)
  static options(answer, values, counts, valueMode, optionCount) {
    const miss = [];
    if (!valueMode) {
      miss.push(answer - 1, answer - 2, answer + 1);
    } else {
      values.forEach((value) => miss.push(answer - value, answer + value));
      values.forEach((seenValue, i) => values.forEach((realValue, j) => i !== j && counts[j] > 0 && miss.push(answer + seenValue - realValue)));
    }
    const near = (sign) => Array.from({ length: 12 }, (_, i) => answer + sign * (i + 1));
    const pool = (sign) => {
      const misses = Util.shuffle([...new Set(miss)].filter((value) => value >= 1 && Math.sign(value - answer) === sign));
      return [...misses, ...near(sign).filter((value) => value >= 1 && !misses.includes(value))];
    };
    const lower = pool(-1);
    const higher = pool(1);
    const below = Math.min(Util.randomBelow(optionCount), lower.length);
    return [...lower.slice(0, below), answer, ...higher.slice(0, optionCount - 1 - below)].sort((a, b) => a - b);
  }
}
