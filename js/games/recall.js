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
//   itemCount  — 그림 수 (보여 주고 눌러야 할 차례 수)
//   propCount  — 바뀌는 성질 수 (1~2). 1 이면 모양이나 개수 가운데 하나만 바뀌고 다른 하나는 모든 그림이 같다
//   shapeCount — 모양 수 (모양을 물을 때의 보기 단추 수). 개수는 늘 하나·둘·셋 세 가지다
//   show — 그림 하나를 보여 주는 시간(ms). 그림 사이에는 GAP_MS 동안 빈 카드가 보인다
import { Util } from '../config.js';
import { Diagram } from '../diagram.js';
import { Sfx } from '../sfx.js';
import { Tag } from './tags.js';
import { Phase } from './kit.js';

const STAR = Array.from({ length: 10 }, (_, i) => {
  const angle = ((-90 + i * 36) * Math.PI) / 180;
  const radius = i % 2 ? 19 : 46;
  return `${(50 + Math.cos(angle) * radius).toFixed(1)},${(54 + Math.sin(angle) * radius).toFixed(1)}`;
}).join(' ');

// 모양 (100×100). draw 는 칠하는 속성(attrs)을 받아 그린다
const SHAPES = [
  { id: 'circle', name: '동그라미', draw: (attrs) => `<circle cx="50" cy="50" r="40" ${attrs}/>` },
  { id: 'triangle', name: '세모', draw: (attrs) => `<polygon points="50,10 92,86 8,86" ${attrs}/>` },
  { id: 'square', name: '네모', draw: (attrs) => `<rect x="13" y="13" width="74" height="74" rx="9" ${attrs}/>` },
  { id: 'star', name: '별', draw: (attrs) => `<polygon points="${STAR}" ${attrs}/>` },
  { id: 'heart', name: '하트', draw: (attrs) => `<path d="M50 89 L13 53 A21 21 0 0 1 50 22 A21 21 0 0 1 87 53 Z" ${attrs}/>` },
];
const COUNTS = [
  { id: 1, name: '하나' },
  { id: 2, name: '둘' },
  { id: 3, name: '셋' },
];
// 성질. withParticle = 조사('을/를')를 붙인 이름. 안내 문구에 늘어놓는 차례는 말로 할 때의 차례다 ('별 둘': 모양 → 개수)
const PROPS = {
  shape: { name: '모양', withParticle: '모양을', values: SHAPES },
  count: { name: '개수', withParticle: '개수를', values: COUNTS },
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
  const stops = HOLO.map((hue, i) => `<stop offset="${i / (HOLO.length - 1)}" stop-color="${hue}"/>`).join('');
  return {
    id,
    defs: `<defs><linearGradient id="${id}-h" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>` +
      `<radialGradient id="${id}-g" cx="0.32" cy="0.22" r="0.62"><stop offset="0" stop-color="#fff" stop-opacity="0.8"/>` +
      '<stop offset="0.55" stop-color="#fff" stop-opacity="0.15"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>',
  };
}
// 모양 하나: 무지갯빛 바탕 + 테두리, 그 위에 윤기
const paintShape = (shape, id, strokeWidth = 4.5) =>
  shape.draw(`fill="url(#${id}-h)" stroke="${EDGE}" stroke-width="${strokeWidth}" stroke-linejoin="round"`) + shape.draw(`fill="url(#${id}-g)"`);

export class RecallGame {
  static id = 'recall';
  static tags = [Tag.MEMORY];
  static title = '차례대로 외우기';
  static hint(level) {
    return RecallGame.levels[(level || 1) - 1].propCount > 1
      ? "'별 둘'처럼 속으로 말하며 외운 뒤<br>물어본 것을 나온 차례대로 누르세요"
      : '하나씩 나오는 그림을 외운 뒤<br>나온 차례대로 누르세요';
  }
  // 2026-11-20: 단계를 하나씩 뒤로 미뤘다 (예전 Lv7 → Lv8). 맨 앞에 더 쉬운 Lv1 을 넣고, 예전 Lv8 (7장 · 1.6초)은 뺐다
  static levels = [
    // 쉬운 단계: 모양이나 개수 하나만 바뀐다. Lv1 은 모양이 두 가지뿐이고 오래 보여 준다
    { itemCount: 2, propCount: 1, shapeCount: 2, show: 2200 },
    { itemCount: 2, propCount: 1, shapeCount: 3, show: 1800 },
    { itemCount: 3, propCount: 1, shapeCount: 3, show: 1800 },
    // 모양과 개수가 함께 바뀐다: 어느 것을 물을지 모른다
    { itemCount: 3, propCount: 2, shapeCount: 4, show: 2000 },
    { itemCount: 4, propCount: 2, shapeCount: 4, show: 2000 },
    { itemCount: 5, propCount: 2, shapeCount: 4, show: 1900 },
    // 모양 다섯 가지 · 짧게 보여 준다
    { itemCount: 5, propCount: 2, shapeCount: 5, show: 1700 },
    { itemCount: 6, propCount: 2, shapeCount: 5, show: 1700 },
  ];
  static maxLevel = RecallGame.levels.length;
  static GAP_MS = 400;    // 그림과 그림 사이에 빈 카드를 보여 주는 시간
  static CARD = { width: 300, height: 180 }; // 카드 (판 단위)

  // 소개 그림: ① 하나씩 나오는 그림을 외우고 ② 물어본 것(여기서는 개수)을 차례대로 누른다
  static diagram() {
    const card = (x, y, inner) => `<rect class="rc-dg-card" x="${x}" y="${y}" width="66" height="50" rx="7"/>${inner}`;
    const figure = (shape, count, centerX, centerY) => RecallGame.objectSvg(shape, count, centerX, centerY, count > 1 ? 20 : 30, 22);
    const step1 = card(4, 22, figure('star', 2, 37, 47)) + '<path class="dg-bx-arrow" d="M76 47H96m-6 -5l6 5-6 5"/>' +
      card(104, 22, figure('circle', 1, 137, 47));
    const dots = (count, centerX, centerY) => Array.from({ length: count }, (_, i) => `<circle class="rc-dg-dot" cx="${centerX + (i - (count - 1) / 2) * 7}" cy="${centerY}" r="2.6"/>`).join('');
    const box = (x, y, count, className = 'dg-cell') => Diagram.rect(x, y, 40, 34, className, 6) + (count ? dots(count, x + 20, y + 11) + Diagram.text(x + 20, y + 24, COUNTS[count - 1].name, 11) : '');
    const step2 = box(46, 6, 2) + box(94, 6, 0, 'dg-slot active') +
      [1, 2, 3].map((count) => box(22 + (count - 1) * 46, 54, count)).join('') + Diagram.tap(42, 71, 16);
    return [
      { svg: Diagram.svg('0 0 174 96', step1), caption: '하나씩 나오는 그림을 외우고' },
      { svg: Diagram.svg('0 0 180 96', step2), caption: '물어본 것을 차례대로 누르기' },
    ];
  }

  /** @param {import('./host.js').GameHost} host */

  constructor(host) {
    this.host = host;
    this.spec = RecallGame.levels[host.level - 1];
    this.puzzle = RecallGame.make(this.spec);
    this.phase = Phase.SHOW;
    this.picked = [];
  }

  start() {
    const { stage, level } = this.host;
    const { puzzle } = this;
    this.message = Util.element('div', 'stage-msg', '');
    this.body = Util.frame(stage, `${RecallGame.title} · Lv.${level}`, this.message).body;
    this.wrap = Util.element('div', 'rc-wrap');
    // 보여 줄 때: 카드와 그 아래 몇 번째인지 알려 주는 점. 답할 때: 칸 줄과 보기 단추
    this.show = Util.element('div', 'rc-show');
    const { width: cardWidth, height: cardHeight } = RecallGame.CARD;
    this.card = Util.element('div', 'rc-card', `<svg viewBox="0 0 ${cardWidth} ${cardHeight}"></svg>`);
    this.cardSvg = this.card.firstChild;
    this.steps = Util.element('div', 'rc-steps', puzzle.items.map(() => '<span></span>').join(''));
    this.show.append(this.card, this.steps);
    this.slots = Util.element('div', 'rc-slots');
    this.optionRow = Util.element('div', 'ar-cands rc-opts');
    this.wrap.append(this.show);
    this.body.append(this.wrap);
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.body);
    this.layout();

    const banner = Util.element('div', 'memorize-banner', '외우세요!');
    this.card.append(banner);
    // '모양·개수를 차례대로 외우세요' — 조사는 마지막 이름을 따른다
    const keys = PROP_ORDER.filter((prop) => puzzle.props.includes(prop));
    const what = [...keys.slice(0, -1).map((prop) => PROPS[prop].name), PROPS[keys[keys.length - 1]].withParticle].join('·');
    this.host.after(1100, () => {
      banner.remove();
      Util.say(this.message, `${what} 차례대로 외우세요`, 'look');
      this.play(0);
    });
  }

  // i 번째 그림을 보여 주고, GAP_MS 쉰 뒤 다음 그림. 다 보여 주면 묻는다
  play(i) {
    const { puzzle } = this;
    const dots = [...this.steps.children];
    if (i >= puzzle.items.length) {
      dots.forEach((dot) => dot.classList.remove('on'));
      this.host.after(350, () => this.ask());
      return;
    }
    dots.forEach((dot, j) => {
      dot.classList.toggle('on', j === i);
      dot.classList.toggle('past', j < i);
    });
    const item = puzzle.items[i];
    const { width: cardWidth, height: cardHeight } = RecallGame.CARD;
    // 개수가 바뀌는 판은 셋이 한 줄에 들어가는 크기로, 아니면 하나를 크게 그린다 (한 판 안에서는 크기가 늘 같다)
    const size = puzzle.props.includes('count') ? 84 : 130;
    this.cardSvg.innerHTML = `<g class="rc-fig">${RecallGame.objectSvg(item.shape, item.count, cardWidth / 2, cardHeight / 2, size, 94)}</g>`;
    this.host.sfx(Sfx.BLINK);
    this.host.after(this.spec.show, () => {
      this.cardSvg.innerHTML = '';
      this.host.after(RecallGame.GAP_MS, () => this.play(i + 1));
    });
  }

  ask() {
    const { puzzle } = this;
    this.phase = Phase.INPUT;
    this.show.remove();
    this.wrap.append(this.slots, this.optionRow);
    this.slotCells = puzzle.items.map((_, i) => {
      const slot = Util.element('div', 'rc-slot', `<span class="rc-num">${i + 1}</span>`);
      this.slots.append(slot);
      return slot;
    });
    this.slotCells[0].classList.add('active');
    this.optionButtons = puzzle.pool.map((value) => {
      const button = Util.element('button', `ar-cand rc-opt rc-${puzzle.ask}`);
      RecallGame.fillValue(button, puzzle.ask, value);
      button.addEventListener('pointerdown', () => this.pick(value, button));
      this.optionRow.append(button);
      return { value, button };
    });
    Util.say(this.message, `${PROPS[puzzle.ask].withParticle} 나온 차례대로 누르세요`, 'act');
    this.layout();
    this.host.question({
      props: puzzle.props, ask: puzzle.ask, pool: puzzle.pool,
      items: puzzle.items.map((item) => [item.shape, item.count]), // [모양, 개수] 나온 차례대로
      ans: puzzle.answers,
    });
    // 일의 양 = 눌러야 할 칸 수
    this.host.timer(puzzle.items.length, () => this.judge(true));
  }

  pick(value, button) {
    if (this.phase !== Phase.INPUT) return;
    const i = this.picked.length;
    this.picked.push(value);
    this.host.input({ slot: i, picked: value });
    const slotCell = this.slotCells[i];
    slotCell.classList.remove('active');
    slotCell.classList.add('filled', `rc-${this.puzzle.ask}`);
    RecallGame.fillValue(slotCell, this.puzzle.ask, value, true);
    button.classList.remove('tapped');
    void button.offsetWidth;
    button.classList.add('tapped');
    if (this.picked.length >= this.puzzle.items.length) this.judge(false);
    else this.slotCells[i + 1].classList.add('active');
  }

  // 다 채웠거나 시간이 다 됐다. 칸마다 맞았는지 보여 주고, 틀린 칸 아래에는 정답을 적는다
  judge(timedOut) {
    if (this.phase !== Phase.INPUT) return;
    this.phase = Phase.END;
    this.host.stopTimer();
    const { puzzle } = this;
    const slotCount = puzzle.items.length;
    this.optionButtons.forEach((option) => (option.button.disabled = true));
    this.hits = 0;
    this.slotCells.forEach((slotCell, i) => {
      slotCell.classList.remove('active');
      const ok = this.picked[i] === puzzle.answers[i];
      slotCell.classList.add(ok ? 'right' : 'wrong');
      slotCell.append(Util.element('span', 'mark', ok ? '✓' : '✕'));
      if (ok) {
        this.hits++;
      } else {
        const fix = Util.element('div', `rc-fix rc-${puzzle.ask}`);
        RecallGame.fillValue(fix, puzzle.ask, puzzle.answers[i], true);
        slotCell.append(fix);
      }
    });
    const ok = this.hits === slotCount;
    this.cleared = ok;
    // 맞힌 칸 수만큼 한 번에 준다 (칸마다 따로 띄우면 점수 글자가 겹친다)
    if (this.hits) this.host.award((this.host.base * this.host.multiplier * this.hits) / slotCount, this.slots);
    // eslint-disable-next-line id-length -- 세션 기록의 키 (바꾸면 기록 형식이 바뀐다)
    this.host.answer({ picked: [...this.picked], hits: this.hits, of: slotCount, correct: ok, timedOut });
    if (ok) {
      Util.say(this.message, '정답!', 'good');
      this.host.sfx(Sfx.GOOD);
    } else {
      Util.say(this.message, timedOut ? '시간 초과 · 아래가 정답이에요' : `${slotCount}개 중 ${this.hits}개를 맞혔어요`, 'bad');
      this.host.sfx(Sfx.BAD);
    }
    this.layout();
    this.host.after(ok ? 1100 : 2400, () => this.finish());
  }

  layout() {
    const body = this.body;
    const availableWidth = body.clientWidth;
    const availableHeight = body.clientHeight;
    if (this.phase === Phase.SHOW) {
      const aspect = RecallGame.CARD.width / RecallGame.CARD.height;
      const cardWidth = Math.max(200, Math.min(availableWidth - 32, (availableHeight - 40) * aspect, 520));
      this.card.style.width = `${cardWidth}px`;
      this.card.style.height = `${cardWidth / aspect}px`;
      return;
    }
    // 칸: 한 줄에 slotCount 칸. 높이는 너비의 1.15배이고, 아래에 틀린 칸의 정답을 적을 자리(너비의 0.55)를 둔다.
    // 좁은 화면(휴대폰)에서 칸이 너무 작아지면 두 줄로 나눈다
    const slotCount = this.puzzle.items.length;
    const optionsHeight = this.optionRow.offsetHeight || 104;
    const gap = Math.min(18, availableWidth * 0.03); // 맞음·틀림 고리(칸 밖 4px)가 옆 칸에 닿지 않게
    const slotSizeFor = (columns, rows) => Math.min(
      (availableWidth - 24 - gap * (columns - 1)) / columns,
      (availableHeight - optionsHeight - Util.gapOf(this.wrap, 28) - 20 - gap * (rows - 1)) / ((1.15 + 0.55) * rows),
      112);
    let columns = slotCount;
    let slotSize = slotSizeFor(slotCount, 1);
    if (slotSize < 60 && slotCount > 4 && slotSizeFor(Math.ceil(slotCount / 2), 2) > slotSize) {
      columns = Math.ceil(slotCount / 2);
      slotSize = slotSizeFor(columns, 2);
    }
    slotSize = Math.max(36, slotSize);
    this.wrap.style.setProperty('--ss', `${slotSize}px`);
    this.slots.style.gap = `${gap + slotSize * 0.55}px ${gap}px`;
    this.slots.style.width = `${columns * slotSize + (columns - 1) * gap + 2}px`;
  }

  finish() {
    this.resizeObserver.disconnect();
    this.host.done(this.result());
  }

  result() {
    return { cleared: !!this.cleared, correct: this.hits || 0, total: this.puzzle.items.length };
  }

  // 점수는 채점할 때 주므로 중단될 때 따로 줄 것이 없다
  abort() {
    const answered = this.phase === Phase.END;
    this.phase = Phase.END;
    this.resizeObserver.disconnect();
    return { cleared: false, correct: this.hits || 0, total: answered ? this.puzzle.items.length : 0 };
  }

  // ---- 그리기 ----

  static shape(id) { return SHAPES.find((entry) => entry.id === id); }

  // (centerX, centerY) 가운데에 모양 count 개를 한 줄로. size = 하나의 크기, step = 가운데 사이 거리. 그러데이션 정의도 함께 돌려준다
  static objectSvg(shape, count, centerX, centerY, size, step) {
    const { id, defs } = holoDefs();
    const body = paintShape(RecallGame.shape(shape), id);
    return defs + Array.from({ length: count }, (_, i) => Diagram.glyph(body, centerX + (i - (count - 1) / 2) * step, centerY, size)).join('');
  }

  // 보기 단추·칸에 값 하나를 그린다: 모양은 그 모양(카드와 같은 무지갯빛)과 이름을, 개수는 점과 이름을.
  // keep = 칸 번호·표시(.rc-num, .mark, .rc-fix)는 남긴다
  static fillValue(target, prop, value, keep = false) {
    if (keep) [...target.children].forEach((child) => !child.matches('.rc-num, .mark, .rc-fix') && child.remove());
    else target.innerHTML = '';
    let icon;
    let name;
    if (prop === 'shape') {
      const shape = RecallGame.shape(value);
      const { id, defs } = holoDefs();
      icon = `<svg class="rc-ico" viewBox="0 0 100 100">${defs}${paintShape(shape, id, 6)}</svg>`;
      name = shape.name;
    } else {
      icon = `<span class="rc-dots">${'<i></i>'.repeat(value)}</span>`;
      name = COUNTS.find((count) => count.id === value).name;
    }
    target.insertAdjacentHTML('beforeend', `<span class="rc-val">${icon}<span class="rc-name">${name}</span></span>`);
  }

  // ---- 문제 만들기 ----
  // 반환: { props: 바뀌는 성질, ask: 묻는 성질, pool: 묻는 성질의 보기 (단추 차례), items: [{ shape, count }], answers: 묻는 성질의 값 (차례대로) }
  static make(spec, rand = Math.random) {
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const shuffle = (list) => {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    };
    const { itemCount } = spec;
    const props = shuffle([...PROP_ORDER]).slice(0, spec.propCount);
    const ask = pick(props);
    // 성질마다 쓸 값: 바뀌는 성질은 모양 shapeCount 가지 · 개수 셋 모두, 바뀌지 않는 성질은 하나 (개수는 하나)
    const shapes = SHAPES.map((shape) => shape.id);
    const pools = {
      shape: shuffle([...shapes]).slice(0, props.includes('shape') ? spec.shapeCount : 1),
      count: props.includes('count') ? COUNTS.map((count) => count.id) : [1],
    };
    // 한 값이 나오는 횟수의 상한: 그림 수의 절반 (올림). 둘이면 서로 다르다
    const cap = Math.ceil(itemCount / 2);
    for (let tries = 0; tries < 500; tries++) {
      const items = [];
      for (let i = 0; i < itemCount; i++) items.push({ shape: pick(pools.shape), count: pick(pools.count) });
      if (items.some((item, i) => i && item.shape === items[i - 1].shape && item.count === items[i - 1].count)) continue;
      const okProp = (prop) => {
        const tally = {};
        items.forEach((item) => (tally[item[prop]] = (tally[item[prop]] || 0) + 1));
        const counts = Object.values(tally);
        return counts.length >= 2 && Math.max(...counts) <= cap;
      };
      if (!props.every(okProp)) continue;
      // 보기 단추는 값의 정해진 차례로 (모양 표의 차례, 개수는 작은 것부터) — 단추 자리로 외우지 않게 늘 같은 차례다
      const order = PROPS[ask].values.map((option) => option.id);
      const pool = pools[ask].slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
      return { props, ask, pool, items, answers: items.map((item) => item[ask]) };
    }
    throw new Error('recall: 판을 못 만들었다');
  }
}
