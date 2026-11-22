// 짝 없는 것 찾기
// 빨랫줄에 양말이 걸려 있다. 모두 똑같은 짝이 있는데 하나만 짝이 없다. 그 양말을 누른다. 한 게임에 3번.
// 양말 하나 = 무늬(pattern) · 발목(cuff: 흰 발목 / 같은 색 발목) · 색(color). 같은 판의 서로 다른 양말은 무늬나 발목이 꼭 다르다 —
// 색만 다른 양말은 두지 않는다 (색만으로 가리지 않는다). 색은 쉬운 단계에서 덤으로 돕는 단서다.
// 틀리면 누른 양말의 짝을 점선으로, 짝 없는 양말을 파란 테두리로 보여 준다 (왜 틀렸는지 보이게).
// 난이도:
//   count   — 양말 수 (짝 (count-1)/2 쌍 + 하나)
//   palette — 쓰는 색 수. 0 이면 양말 종류마다 다른 색 (색만 보고도 짝을 찾을 수 있다)
//   lure    — 짝 없는 양말이 어느 짝과 한 군데만 다를 확률 (같은 색에 발목이나 무늬 하나만 다르다)
//   subtle  — 그때 다른 곳이 비슷한 무늬(굵은 줄 ↔ 가는 줄, 하트 ↔ 별 …)다
//   flip    — 양말이 저마다 왼쪽·오른쪽을 본다 (한 짝도 서로 반대로 걸릴 수 있다)
import { Util } from '../config.js';
import { Diagram } from '../diagram.js';
import { Sfx } from '../sfx.js';
import { Tag } from './tags.js';
import { Phase, Progress, pointsPer, resultOf, abortedResult } from './kit.js';

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
    const angle = ((-90 + i * 36) * Math.PI) / 180;
    const radius = i % 2 ? 4.2 : 10;
    return `${(31 + Math.cos(angle) * radius).toFixed(1)},${(47 + Math.sin(angle) * radius).toFixed(1)}`;
  }).join(' ')}" fill="${ink}"/>`,
  vstripe: (ink) => [21, 29, 37].map((x) => `<rect x="${x}" y="20" width="4" height="46" fill="${ink}"/>`).join(''),
  toe: (ink) => `<path d="M56 74 L84 88 L84 112 L44 112 Z" fill="${ink}" opacity="0.9"/><circle cx="20" cy="84" r="9" fill="${ink}" opacity="0.9"/>`,
};
// 헷갈리기 쉬운 무늬 짝 (subtle 미끼에 쓴다)
const PAIR_SIMILAR = { stripes: 'thin', thin: 'stripes', heart: 'star', star: 'heart', dots: 'zigzag', zigzag: 'dots', vstripe: 'stripes', plain: 'toe', toe: 'plain' };

export class PairGame {
  static id = 'pair';
  static tags = [Tag.SEARCH];
  static title = '짝 없는 것 찾기';
  static hint = '빨랫줄의 양말은 모두 짝이 있는데<br>하나만 짝이 없어요. 그 양말을 누르세요';
  static levels = [
    // 쉬운 단계: 양말이 적고, 종류마다 색이 다르다
    { count: 5, palette: 0, lure: 0 },
    { count: 7, palette: 0, lure: 0 },
    { count: 7, palette: 4, lure: 0.3 },
    { count: 9, palette: 4, lure: 0.5, flip: true },
    { count: 9, palette: 3, lure: 0.7, flip: true },
    { count: 11, palette: 3, lure: 0.8, flip: true },
    // 색이 둘뿐이고, 짝 없는 양말은 늘 어느 짝과 비슷한 무늬 하나만 다르다
    { count: 13, palette: 2, lure: 1, subtle: true, flip: true },
    { count: 15, palette: 2, lure: 1, subtle: true, flip: true },
  ];
  static maxLevel = PairGame.levels.length;
  static QUESTIONS = 3;
  static CELL_WIDTH = 84;  // 양말 한 칸 (판 단위)
  static ROW_HEIGHT = 132; // 빨랫줄 한 줄

  // 양말 하나의 svg 조각 (84×110 칸, 원점 왼쪽 위). flip 이면 좌우를 뒤집어 발끝이 왼쪽을 본다.
  // 발목(빨래집게 자리)의 가운데: 그대로면 x 31, 뒤집으면 x 53 (PairGame.leg)
  static sock({ pattern, cuff, color }, flip, clip, className = '') {
    const { fill, ink } = PAIR_COLORS[color];
    const cuffBand = cuff
      ? `<rect x="0" y="0" width="80" height="20" fill="#f7f8fa"/><path d="M22 9 V19 M28 9 V19 M34 9 V19 M40 9 V19" stroke="#c9ced6" stroke-width="1.6"/>`
      : `<rect x="0" y="18" width="80" height="2.5" fill="rgba(0,0,0,0.22)"/>`;
    const body = `<path d="${PAIR_SOCK}" fill="${fill}"/>` +
      `<g clip-path="url(#${clip})">${PAIR_PATTERNS[pattern](ink)}${cuffBand}</g>` +
      `<path class="pr-edge" d="${PAIR_SOCK}" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="2" stroke-linejoin="round"/>`;
    return `<g class="${className}" ${flip ? 'transform="translate(84 0) scale(-1 1)"' : ''}>${body}</g>`;
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
    const socks = [{ pattern: 'stripes', cuff: 1, color: 1 }, { pattern: 'dots', cuff: 0, color: 0 }, { pattern: 'heart', cuff: 1, color: 2 }];
    const row = [0, 1, 0, 2, 1];
    const line = '<path d="M2 14 Q90 22 178 14" fill="none" stroke="currentColor" stroke-width="2" opacity="0.55"/>';
    const hang = (tap) => {
      const clip = PairGame.defs();
      return clip.html + line + row.map((kind, i) => `<g transform="translate(${8 + i * 34} 12) scale(0.36)">${PairGame.sock(socks[kind], false, clip.id)}<rect x="24" y="-6" width="10" height="16" rx="2" fill="#c08a4a"/></g>`).join('') +
        (tap ? Diagram.tap(8 + 3 * 34 + 12, 34, 18) : '');
    };
    return [
      { svg: Diagram.svg('0 0 180 64', hang(false)), caption: '양말 짝을 맞춰 보고' },
      { svg: Diagram.svg('0 0 180 64', hang(true)), caption: '짝 없는 하나 누르기' },
    ];
  }

  /** @param {import('./host.js').GameHost} host */

  constructor(host) {
    this.host = host;
    this.spec = PairGame.levels[host.level - 1];
    this.answered = 0;
    this.correct = 0;
    this.phase = Phase.WAIT;
    const count = this.spec.count;
    this.rows = count <= 6 ? 1 : count <= 12 ? 2 : 3;
    this.columns = Math.ceil(count / this.rows);
  }

  start() {
    const { stage, level } = this.host;
    this.message = Util.element('div', 'stage-msg act', '짝 없는 양말을 누르세요');
    const { body, dots } = Util.frame(stage, `${PairGame.title} · Lv.${level}`, this.message, PairGame.QUESTIONS);
    this.body = body;
    this.progress = dots;
    this.wrap = Util.element('div', 'pr-wrap');
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'pr-board');
    this.boardWidth = this.columns * PairGame.CELL_WIDTH + 24;
    this.boardHeight = this.rows * PairGame.ROW_HEIGHT + 8;
    this.svg.setAttribute('viewBox', `0 0 ${this.boardWidth} ${this.boardHeight}`);
    this.wrap.append(this.svg);
    body.append(this.wrap);
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(body);
    this.layout();
    this.host.after(200, () => this.ask());
  }

  layout() {
    const body = this.body;
    const aspect = this.boardWidth / this.boardHeight;
    const width = Math.max(240, Math.min(body.clientWidth - 40, (body.clientHeight - 12) * aspect, 1100));
    this.svg.style.width = `${width}px`;
    this.svg.style.height = `${width / aspect}px`;
  }

  ask() {
    const puzzle = PairGame.make(this.spec);
    this.question = puzzle;
    const { CELL_WIDTH, ROW_HEIGHT } = PairGame;
    // 줄마다 양말을 고르게 나눠 건다. 줄은 가운데가 살짝 처지고, 양말은 조금씩 기울어 걸린다
    const perRow = Array.from({ length: this.rows }, (_, rowIndex) => Math.floor(puzzle.socks.length / this.rows) + (rowIndex < puzzle.socks.length % this.rows ? 1 : 0));
    let sockIndex = 0;
    const clip = PairGame.defs();
    let html = clip.html;
    const lines = [];
    const socks = [];
    perRow.forEach((countInRow, rowIndex) => {
      const y = 14 + rowIndex * ROW_HEIGHT;
      lines.push(`<path class="pr-line" d="M4 ${y} Q${this.boardWidth / 2} ${y + 14} ${this.boardWidth - 4} ${y}"/>`);
      const rowLeft = (this.boardWidth - countInRow * CELL_WIDTH) / 2;
      for (let i = 0; i < countInRow; i++, sockIndex++) {
        const sock = puzzle.socks[sockIndex];
        const x = rowLeft + i * CELL_WIDTH;
        const leg = PairGame.leg(sock.flip);
        const along = (x + leg) / this.boardWidth;
        const sag = 14 * 4 * along * (1 - along);   // 줄이 처진 만큼 내려 건다 (2차 곡선의 높이)
        const tilt = (Util.randomBelow(9) - 4) * 1.2;
        // 자리는 바깥 g 의 transform 속성으로, 걸리는 움직임(css pr-hang)은 안쪽 g 에 준다.
        // 한 요소에 둘 다 주면 Safari 는 애니메이션의 transform 이 속성을 덮어써 양말이 모두 한 자리에 겹친다
        socks.push(`<g transform="translate(${x.toFixed(1)} ${(y + sag - 4).toFixed(1)}) rotate(${tilt} ${leg} 0)"><g class="pr-sock" data-k="${sockIndex}">` +
          `<rect class="pr-hit" x="0" y="0" width="${CELL_WIDTH}" height="112" fill="transparent"/>` +
          PairGame.sock(sock.design, sock.flip, clip.id) +
          `<rect class="pr-pin" x="${leg - 5.5}" y="-8" width="11" height="18" rx="2.5"/>` +
          `<g class="pr-mark" transform="translate(${sock.flip ? 6 : 50} 2)"><circle r="13" cx="13" cy="13"/><text x="13" y="14" text-anchor="middle" dominant-baseline="central"></text></g></g></g>`);
      }
    });
    html += lines.join('') + socks.join('');
    this.svg.innerHTML = html;
    this.sockGroups = [...this.svg.querySelectorAll('.pr-sock')];
    this.sockGroups.forEach((sockGroup, i) => sockGroup.addEventListener('pointerdown', () => this.pick(i)));
    this.svg.classList.add('picking');
    Util.say(this.message, '짝 없는 양말을 누르세요', 'act');
    Progress.current(this.progress, this.answered);
    this.phase = Phase.INPUT;
    this.host.sfx(Sfx.BLINK);
    this.host.question({
      // eslint-disable-next-line id-length -- 세션 기록의 키 (바꾸면 기록 형식이 바뀐다)
      n: this.answered + 1, odd: puzzle.odd, lure: puzzle.lure,
      socks: puzzle.socks.map(({ design, flip }) => [design.pattern, design.cuff, design.color, flip ? 1 : 0]),
    });
    this.host.timer(puzzle.socks.length, () => this.pick(-1));
  }

  // i = 누른 양말 (-1 이면 시간 초과)
  pick(i) {
    if (this.phase !== Phase.INPUT) return;
    this.phase = Phase.WAIT;
    this.host.stopTimer();
    this.svg.classList.remove('picking');
    const { odd, socks } = this.question;
    const ok = i === odd;
    this.host.answer({ picked: i >= 0 ? i : null, correct: ok, timedOut: i < 0 });
    const mark = (index, className, text) => {
      this.sockGroups[index].classList.add(className);
      this.sockGroups[index].querySelector('.pr-mark text').textContent = text;
    };
    if (ok) {
      this.correct++;
      mark(odd, 'right', '✓');
      Util.say(this.message, '정답!', 'good');
      this.host.award(pointsPer(this.host, PairGame.QUESTIONS), this.sockGroups[odd]);
      this.host.sfx(Sfx.GOOD);
    } else {
      if (i >= 0) {
        mark(i, 'wrong', '✕');
        // 누른 양말의 짝을 보여 준다
        const twin = socks.findIndex((sock, index) => index !== i && PairGame.same(sock.design, socks[i].design));
        if (twin >= 0) this.sockGroups[twin].classList.add('twin');
      }
      mark(odd, 'reveal', '!');
      Util.say(this.message, i >= 0 ? '그 양말은 짝이 있어요 · 짝 없는 건 이것' : '시간 초과 · 짝 없는 건 이것', 'bad');
      this.host.sfx(Sfx.BAD);
    }
    Progress.mark(this.progress, this.answered, ok);
    this.answered++;
    this.host.after(ok ? 800 : 1700, () => {
      if (this.answered >= PairGame.QUESTIONS) return this.finish();
      this.ask();
    });
  }

  finish() {
    this.phase = Phase.END;
    this.resizeObserver.disconnect();
    this.host.done(this.result());
  }

  result() {
    return resultOf(this.correct, PairGame.QUESTIONS);
  }

  // 점수는 맞힐 때마다 바로 지급하므로 중단될 때 따로 줄 것이 없다
  abort() {
    this.phase = Phase.END;
    this.resizeObserver.disconnect();
    return abortedResult(this.correct, this.answered);
  }

  // ---- 판 만들기 ----
  static same(a, b) {
    return a.pattern === b.pattern && a.cuff === b.cuff && a.color === b.color;
  }

  // 반환: { socks([{ design: { pattern, cuff, color }, flip }]), odd(짝 없는 양말의 자리), lure(미끼 종류: 'cuff' | 'pattern' | null) }
  static make({ count, palette, lure, subtle, flip }) {
    const pairCount = (count - 1) / 2;
    const designKey = (design) => `${design.pattern}.${design.cuff}`;
    for (;;) {
      // 무늬·발목이 서로 다른 짝 pairCount 종류
      const shapes = Util.shuffle(Object.keys(PAIR_PATTERNS).flatMap((pattern) => [{ pattern, cuff: 0 }, { pattern, cuff: 1 }]));
      const pairs = [];
      for (const shape of shapes) {
        if (pairs.length === pairCount) break;
        if (!pairs.some((pair) => designKey(pair) === designKey(shape))) pairs.push({ ...shape });
      }
      // 색: palette 0 이면 종류마다 다른 색, 아니면 palette 가지 색 안에서 고른다
      const colors = Util.shuffle([...PAIR_COLORS.keys()]);
      const pool = palette ? colors.slice(0, palette) : colors;
      pairs.forEach((design, i) => (design.color = palette ? pool[Util.randomBelow(pool.length)] : pool[i % pool.length]));

      // 짝 없는 양말
      const used = new Set(pairs.map(designKey));
      let odd = null;
      let lureKind = null;
      if (Math.random() < lure) {
        const base = pairs[Util.randomBelow(pairCount)];
        const swap = { ...base, pattern: PAIR_SIMILAR[base.pattern] };
        const toggle = { ...base, cuff: 1 - base.cuff };
        const candidates = subtle ? [swap, toggle] : [toggle, swap];
        odd = candidates.find((design) => !used.has(designKey(design)));
        if (odd) lureKind = odd.pattern === base.pattern ? 'cuff' : 'pattern';
      }
      if (!odd) {
        const free = shapes.filter((shape) => !used.has(designKey(shape)));
        if (!free.length) continue;   // 무늬 9 × 발목 2 = 18 가지라 실제로는 일어나지 않는다
        odd = { ...free[0], color: palette ? pool[Util.randomBelow(pool.length)] : pool[pairCount % pool.length] };
      }
      const socks = Util.shuffle([...pairs.flatMap((design) => [design, design]), odd]).map((design) => ({ design, flip: !!flip && Math.random() < 0.5 }));
      return { socks, odd: socks.findIndex((sock) => sock.design === odd), lure: lureKind };
    }
  }
}
