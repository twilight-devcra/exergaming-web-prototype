// 심볼 위치 외우기
// 2x4 판의 몇 칸에 서로 다른 심볼을 잠깐 보여준 뒤, 위쪽 칸에 뜬 심볼이 어디 있었는지 3번 맞힌다
// (심볼이 둘뿐인 가장 쉬운 단계는 2번).
// 난이도:
//   symbolCount — 보여 주는 심볼 수 (판 8칸 가운데 몇 칸에 놓나)
//   show — 심볼을 보여 주는 시간(ms). 쉬운 단계(Lv1·Lv2)만 따로 정하고, 나머지는 SHOW_MS 로 고정이다
import { Util } from '../config.js';
import { Diagram } from '../diagram.js';
import { Sfx } from '../sfx.js';
import { Tag } from './tags.js';
import { Phase, pointsPer, resultOf, abortedResult } from './kit.js';

export const SYMBOLS = (() => {
  const star = Array.from({ length: 10 }, (_, i) => {
    const angle = ((-90 + i * 36) * Math.PI) / 180;
    const radius = i % 2 ? 20 : 47;
    return `${(50 + Math.cos(angle) * radius).toFixed(1)},${(54 + Math.sin(angle) * radius).toFixed(1)}`;
  }).join(' ');
  // 모양과 색이 모두 확실히 구분되도록 구성
  return [
    { id: 'circle', svg: '<circle cx="50" cy="50" r="42" fill="#e5484d"/>' },
    { id: 'square', svg: '<rect x="10" y="10" width="80" height="80" rx="6" fill="#2f6fed"/>' },
    { id: 'triangle', svg: '<polygon points="50,7 95,90 5,90" fill="#1f9d55"/>' },
    { id: 'star', svg: `<polygon points="${star}" fill="#f5b301"/>` },
    { id: 'plus', svg: '<path d="M37 6h26v31h31v26H63v31H37V63H6V37h31z" fill="#f76808"/>' },
    { id: 'diamond', svg: '<polygon points="50,3 93,50 50,97 7,50" fill="#8e4ec6"/>' },
    // 달은 어두운 색이라 어두운 스타일에서는 밝게 바꾼다 (css: --sym-ink)
    { id: 'moon', svg: '<path class="sym-ink" d="M64 6 A45 45 0 1 0 94 72 A37 37 0 1 1 64 6 Z"/>' },
    { id: 'heart', svg: '<path d="M50 92 L12 54 A22 22 0 0 1 50 20 A22 22 0 0 1 88 54 Z" fill="#06aed5"/>' },
  ];
})();

function symbolElement(symbol) {
  return Util.element('div', 'sym', `<svg viewBox="0 0 100 100">${symbol.svg}</svg>`);
}

export class SymbolGame {
  static id = 'symbol';
  static tags = [Tag.MEMORY];
  static title = '심볼 위치 외우기';
  static hint = '잠깐 보이는 그림들의 위치를 외운 뒤<br>위에 나온 그림이 어디 있었는지 고르세요';
  // symbolCount = 심볼 수, show = 심볼 노출 시간(ms). 쉬운 단계(Lv1·Lv2)만 따로 정하고, 나머지는 SHOW_MS 로 고정이다.
  static levels = [
    { symbolCount: 2, show: 4500 },
    { symbolCount: 3, show: 4500 },
    { symbolCount: 3 }, { symbolCount: 4 }, { symbolCount: 5 }, { symbolCount: 6 }, { symbolCount: 7 }, { symbolCount: 8 },
  ];
  static maxLevel = SymbolGame.levels.length;
  static SHOW_MS = 3200;
  static QUESTIONS = 3;    // 심볼이 이보다 적으면 심볼 수만큼 묻는다

  // 소개 그림: ① 그림 자리를 외우고 ② 위에 나온 그림이 있던 칸을 누른다
  static diagram() {
    const CELL = 34, GAP = 8;
    const cellCorner = (slot, gridTop) => [8 + (slot % 4) * (CELL + GAP), gridTop + Math.floor(slot / 4) * (CELL + GAP)];
    const symbolSvg = (id) => SYMBOLS.find((symbol) => symbol.id === id).svg;
    const placed = [[1, 'star'], [4, 'circle'], [6, 'triangle']];
    const grid = (gridTop) => [...Array(8).keys()].map((i) => Diagram.rect(...cellCorner(i, gridTop), CELL, CELL)).join('');
    const center = (slot, gridTop) => cellCorner(slot, gridTop).map((coord) => coord + CELL / 2);
    return [
      { svg: Diagram.svg('0 0 176 140', grid(32) + placed.map(([slot, id]) => Diagram.glyph(symbolSvg(id), ...center(slot, 32), 26)).join('')), caption: '그림 자리를 외우고' },
      {
        svg: Diagram.svg('0 0 176 140', Diagram.rect(66, 2, 44, 44, 'dg-slot active', 9) + Diagram.glyph(symbolSvg('star'), 88, 24, 30) + grid(58) + Diagram.tap(...center(1, 58))),
        caption: '위 그림이 있던 칸 누르기',
      },
    ];
  }

  /** @param {import('./host.js').GameHost} host */

  constructor(host) {
    this.host = host;
    this.spec = SymbolGame.levels[host.level - 1];
    this.symbolCount = this.spec.symbolCount;
    this.questions = Math.min(SymbolGame.QUESTIONS, this.symbolCount);
    this.phase = Phase.SHOW;
    this.correct = 0;
    this.answered = 0;
  }

  start() {
    const { stage, level } = this.host;
    this.message = Util.element('div', 'stage-msg', '');
    this.body = Util.frame(stage, `${SymbolGame.title} · Lv.${level}`, this.message).body;
    this.wrap = Util.element('div', 'sym-wrap');
    this.target = Util.element('div', 'sym-target');
    this.grid = Util.element('div', 'sym-grid');
    this.wrap.append(this.target, this.grid);
    this.body.append(this.wrap);

    this.cells = [];
    for (let i = 0; i < 8; i++) {
      const cell = Util.element('div', 'scell');
      cell.addEventListener('pointerdown', () => this.pick(i));
      this.grid.append(cell);
      this.cells.push(cell);
    }
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.body);
    this.layout();

    const slots = Util.shuffle([...Array(8).keys()]).slice(0, this.symbolCount);
    const symbols = Util.shuffle([...SYMBOLS]).slice(0, this.symbolCount);
    this.placed = slots.map((slot, i) => ({ slot, symbol: symbols[i] }));
    this.asks = Util.shuffle([...this.placed]).slice(0, this.questions);

    const banner = Util.element('div', 'memorize-banner', '외우세요!');
    this.grid.append(banner);
    this.host.after(1100, () => {
      banner.remove();
      Util.say(this.message, '그림 자리를 외우세요', 'look');
      this.placed.forEach(({ slot, symbol }) => this.cells[slot].append(symbolElement(symbol)));
      this.host.sfx(Sfx.BLINK);
    });
    this.host.after(1100 + (this.spec.show || SymbolGame.SHOW_MS), () => {
      this.cells.forEach((cell) => cell.replaceChildren());
      Util.say(this.message, '');
      this.host.after(350, () => this.ask());
    });
  }

  layout() {
    const body = this.body;
    // 물어보는 칸 + 격자 두 줄 = 세 칸 높이. 빼는 것: 물어보는 칸과 격자 사이 간격(css gap) + 격자 줄 사이 14px
    const availableHeight = body.clientHeight - Util.gapOf(this.wrap, 14) - 14;
    const cellSize = Math.max(48, Math.min(availableHeight / 3, body.clientWidth / 4.5, 140));
    this.wrap.style.setProperty('--sz', `${cellSize}px`);
  }

  ask() {
    const ask = this.asks[this.answered];
    this.current = ask;
    this.target.replaceChildren();
    this.target.append(symbolElement(ask.symbol));
    this.target.classList.add('active');
    Util.say(this.message, '이 그림은 어디 있었나요?', 'act');
    // 앞 질문의 ✓/✕ 표시를 지운다. 고른 칸을 막아 두면 한 번 틀린 칸이 다음 질문의 정답일 때 고를 수 없었다
    this.cells.forEach((cell) => {
      cell.classList.remove('closed', 'right', 'wrong');
      cell.querySelectorAll('.mark').forEach((mark) => mark.remove());
      cell.classList.add('clickable');
    });
    this.phase = Phase.INPUT;
    this.host.question({
      // eslint-disable-next-line id-length -- 세션 기록의 키 (바꾸면 기록 형식이 바뀐다)
      target: ask.symbol.id, slot: ask.slot, n: this.answered + 1,
      board: this.placed.map((entry) => [entry.slot, entry.symbol.id]), // 외울 때 보여 준 [칸, 심볼]
    });
    this.host.timer(1, () => this.pick(-1));
  }

  // i = 고른 칸. -1 이면 시간이 다 된 것 (틀린 것으로 치고 정답 칸만 보여준다)
  pick(i) {
    if (this.phase !== Phase.INPUT) return;
    const cell = this.cells[i] || null;
    this.phase = Phase.WAIT;
    this.host.stopTimer();
    this.cells.forEach((other) => other.classList.remove('clickable'));
    const ok = i === this.current.slot;
    this.host.answer({ picked: cell ? i : null, correct: ok, timedOut: !cell });
    if (cell) {
      cell.classList.add('closed', ok ? 'right' : 'wrong');
      cell.append(Util.element('span', 'mark', ok ? '✓' : '✕'));
    } else {
      Util.say(this.message, '시간 초과', 'bad');
    }
    if (ok) {
      this.correct++;
      // 점수는 맞힐 때마다 바로 지급한다
      this.host.award(pointsPer(this.host, this.questions), cell);
      this.host.sfx(Sfx.GOOD);
    } else {
      this.host.sfx(Sfx.BAD);
      const answer = this.cells[this.current.slot];
      answer.classList.add('reveal');
      const ghost = symbolElement(this.current.symbol);
      ghost.style.opacity = '0.45';
      answer.append(ghost);
      this.host.after(800, () => {
        answer.classList.remove('reveal');
        ghost.remove();
      });
    }
    this.answered++;
    this.host.after(ok ? 550 : 900, () => {
      if (this.answered < this.questions) this.ask();
      else this.complete();
    });
  }

  complete() {
    this.phase = Phase.END;
    this.target.classList.remove('active');
    this.target.replaceChildren();
    Util.say(this.message, `${this.questions}개 중 ${this.correct}개 정답`, this.correct === this.questions ? 'good' : '');
    // 문제마다 이미 정답/오답 소리를 들려줬다. 다 맞혔을 때의 축하음은 host가 울린다.
    this.host.after(1200, () => {
      this.resizeObserver.disconnect();
      this.host.done(this.result());
    });
  }

  result() {
    return resultOf(this.correct, this.questions);
  }

  // 점수는 맞힐 때마다 바로 지급하므로 중단될 때 따로 줄 것이 없다
  abort() {
    this.resizeObserver.disconnect();
    return abortedResult(this.correct, this.answered);
  }
}
