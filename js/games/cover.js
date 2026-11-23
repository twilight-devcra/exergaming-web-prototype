// 가린 숫자 더하기
// 작은 숫자 여러 개를 판에 늘어놓고 그중 몇 개를 표시가 다른 상자로 덮은 뒤, 두 숫자의 합을 묻는다.
// 묻는 두 숫자 가운데 적어도 하나는 덮인 숫자다. 판 하나에 문제 3개.
// 설명 없이도 '상자끼리의 식'이 아니라 '숫자 더하기'로 읽히도록:
//   - 숫자는 덮였든 아니든 늘 화면에 있다. 상자는 숫자가 보이게 열린 채로 나왔다가 눈앞에서 닫힌다.
//   - 묻는 두 숫자는 제자리에서 식의 빈칸으로 날아가고(빈 자리에는 테두리가 남는다), 답하면 식 안에서 상자가 열린다.
//   - 숫자는 위쪽에 한 줄로 늘어놓고 식과 보기는 바로 그 아래 가운데에 둔다. 숫자가 날아가는 거리가 짧고 눈이 오가는 폭도 좁다.
//     (식 둘레에 흩어 놓아 보았더니 숫자끼리 너무 떨어져 찾기 번거로웠다.)
// 숫자는 상자의 표시로 기억하므로 자리는 외울 거리가 아니다. 줄의 순서는 판마다 섞는다.
// 난이도는 다섯 가지로 조절한다.
//   count  — 숫자 수
//   hidden — 그중 덮는 수. 외워야 할 (표시, 숫자) 짝이 늘어난다
//   both   — 두 숫자가 모두 덮인 것일 확률. 머릿속에서 둘을 다 꺼내 더해야 한다
//   optionCount — 보기 수
//   show   — 외우는 시간의 기본 몫(ms). 쉬운 단계만 따로 정하고, 나머지는 SHOW_MS 다
import { Util } from '../config.js';
import { Diagram } from '../diagram.js';
import { Sfx } from '../sfx.js';
import { Tag } from './tags.js';
import { Phase, Progress, pointsPer, resultOf, abortedResult } from './kit.js';

const COVER_MARKS = (() => {
  const star = Array.from({ length: 10 }, (_, i) => {
    const angle = ((-90 + i * 36) * Math.PI) / 180;
    const radius = i % 2 ? 12 : 28;
    return `${(50 + Math.cos(angle) * radius).toFixed(1)},${(53 + Math.sin(angle) * radius).toFixed(1)}`;
  }).join(' ');
  // 색만으로 구분하지 않도록 상자마다 모양이 다르다 (색약 대응)
  return [
    { id: 'red', fill: '#e5484d', glyph: '<circle cx="50" cy="50" r="24"/>' },
    { id: 'blue', fill: '#2f6fed', glyph: '<rect x="28" y="28" width="44" height="44" rx="5"/>' },
    { id: 'green', fill: '#1f9d55', glyph: '<polygon points="50,24 76,72 24,72"/>' },
    { id: 'yellow', fill: '#e09b00', glyph: '<polygon points="50,22 78,50 50,78 22,50"/>' },
    { id: 'purple', fill: '#8e4ec6', glyph: '<path d="M43 24h14v19h19v14H57v19H43V57H24V43h19z"/>' },
    { id: 'cyan', fill: '#06a3c8', glyph: `<polygon points="${star}"/>` },
  ];
})();

export class CoverGame {
  static id = 'cover';
  static tags = [Tag.MEMORY, Tag.NUMBER];
  static title = '가린 숫자 더하기';
  static hint = '상자가 닫히기 전에 속에 든 숫자를 외워 두었다가<br>두 숫자를 더한 값을 고르세요';
  static levels = [
    // 쉬운 단계: 숫자 셋, 덮는 것도 한두 개, 외울 시간을 넉넉히
    { count: 3, hidden: 1, both: 0, optionCount: 3, show: 3000 },
    { count: 3, hidden: 2, both: 0, optionCount: 3, show: 2500 },
    { count: 4, hidden: 2, both: 0, optionCount: 3 },
    { count: 5, hidden: 2, both: 0.35, optionCount: 4 },
    { count: 5, hidden: 3, both: 0.35, optionCount: 4 },
    { count: 6, hidden: 3, both: 0.5, optionCount: 4 },
    { count: 6, hidden: 4, both: 0.6, optionCount: 5 },
    { count: 7, hidden: 5, both: 0.7, optionCount: 5 },
  ];
  static maxLevel = CoverGame.levels.length;
  static ROUNDS = 3;
  static HEIGHT_IN_TILES = 4.8; // 판 높이가 숫자 크기의 몇 배인지 (layout, 조금 여유를 둔 값)
  static MIN_VALUE = 2;   // 1 은 더해도 거의 생각할 게 없어서 뺀다
  static MAX_VALUE = 9;   // 숫자는 모두 서로 다르다 (상자 속 숫자가 겹치면 섞어 기억한 것을 가려낼 수 없다)
  static SHOW_MS = 1500;  // 외우는 시간 = SHOW_MS + SHOW_PER × 덮을 수
  static SHOW_PER = 550;
  static LID_GAP = 130;   // 상자가 하나씩 닫히는 간격
  static FLY_MS = 520;    // css .cv-tok 의 transition 과 같게

  // 소개 그림: ① 상자 속 숫자를 외워 두었다가 ② 두 수를 더한 값을 고른다
  static diagram() {
    const firstMark = COVER_MARKS[0];
    const numberTile = (x, y, size, value) => Diagram.rect(x, y, size, size, 'dg-slot') + Diagram.text(x + size / 2, y + size / 2, value, size * 0.55);
    const box = (x, y, size) => `<rect fill="${firstMark.fill}" x="${x}" y="${y}" width="${size}" height="${size}" rx="8"/>` +
      Diagram.glyph(firstMark.glyph, x + size / 2, y + size / 2, size, 'fill="rgba(255,255,255,0.92)"');
    // 열린 상자: 숫자가 보이고, 표시가 찍힌 뚜껑이 왼쪽 위 모서리를 축으로 젖혀져 있다
    const open = (x, y, size, value) => `<rect class="dg-slot" style="stroke:${firstMark.fill}" x="${x}" y="${y}" width="${size}" height="${size}" rx="7"/>` +
      Diagram.text(x + size / 2, y + size / 2, value, size * 0.55) +
      `<g transform="rotate(-38 ${x} ${y})">${box(x, y - size * 0.62, size).replace(`height="${size}"`, `height="${size * 0.62}"`)}</g>`;
    const optionsSvg = [[11, 40], [12, 82], [13, 124]].map(([value, x]) => Diagram.rect(x, 82, 38, 38) + Diagram.text(x + 19, 101, value, 19)).join('');
    return [
      { svg: Diagram.svg('0 0 200 136', numberTile(22, 66, 44, 3) + open(78, 66, 44, 7) + numberTile(134, 66, 44, 5)), caption: '상자 속 숫자를 외워 두었다가' },
      {
        svg: Diagram.svg('0 0 200 136', box(18, 10, 36) + Diagram.text(70, 28, '+', 22) + numberTile(86, 10, 36, 5) + Diagram.text(138, 28, '=', 22) +
          Diagram.text(170, 28, '?', 24, 'dg-txt num') + optionsSvg + Diagram.tap(101, 101)),
        caption: '두 수를 더한 값 고르기',
      },
    ];
  }

  /** @param {import('./host.js').GameHost} host */

  constructor(host) {
    this.host = host;
    this.spec = CoverGame.levels[host.level - 1];
    this.round = 0;
    this.correct = 0;
    this.phase = Phase.SHOW;
    this.lastPair = null; // 지난 문제의 두 숫자 (같은 짝을 연달아 묻지 않게)
  }

  start() {
    const { stage, level } = this.host;
    this.message = Util.element('div', 'stage-msg look', '상자 속 숫자를 외우세요');
    const { body, dots } = Util.frame(stage, `${CoverGame.title} · Lv.${level}`, this.message, CoverGame.ROUNDS);
    this.progress = dots;
    this.board = Util.element('div', 'cv-board');
    this.row = Util.element('div', 'cv-row');
    this.center = Util.element('div', 'cv-center');
    // 처음부터 빈 식을 흐리게 보여 줘서 '두 숫자를 더하는 게임'이라는 것이 먼저 보이게 한다
    this.equation = Util.element('div', 'cv-eq idle');
    this.slots = [Util.element('div', 'cv-slot'), Util.element('div', 'cv-slot')];
    this.answerBox = Util.element('div', 'cv-ans', '?');
    this.equation.append(this.slots[0], Util.element('div', '', '+'), this.slots[1], Util.element('div', '', '='), this.answerBox);
    this.optionRow = Util.element('div', 'cv-opts');
    this.center.append(this.equation, this.optionRow);
    this.board.append(this.row, this.center);
    body.append(this.board);

    this.tokens = CoverGame.deal(this.spec);
    this.tokens.forEach((token) => {
      token.home = Util.element('div', 'cv-home');
      token.element = Util.element('div', 'cv-tok', `<div class="cv-face">${token.value}</div>`);
      if (token.mark) {
        const lid = Util.element('div', 'cv-lid', `<svg viewBox="0 0 100 100">${token.mark.glyph}</svg>`);
        lid.style.background = token.mark.fill;
        token.element.append(lid);
        token.element.classList.add('open');
      }
      this.row.append(token.home);
      this.board.append(token.element);
    });
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(stage);
    this.layout();
    this.host.sfx(Sfx.BLINK);

    const covered = this.tokens.filter((token) => token.mark);
    const show = (this.spec.show || CoverGame.SHOW_MS) + CoverGame.SHOW_PER * covered.length;
    covered.forEach((token, i) => this.host.after(show + i * CoverGame.LID_GAP, () => {
      token.element.classList.remove('open');
      this.host.sfx(Sfx.BLINK);
    }));
    this.host.after(show + covered.length * CoverGame.LID_GAP + 450, () => this.ask());
  }

  // 숫자 크기는 판 높이(줄 + 식 + 보기)와 너비(숫자 count 개) 둘 다에 맞춘다. 숫자는 줄의 제자리(.cv-home) 또는 식의 빈칸 위에 놓인다.
  layout() {
    const board = this.board;
    const width = board.clientWidth;
    const height = board.clientHeight;
    if (!width || !height) return;
    // 판 높이 = 숫자 크기의 약 4.7배 (줄: 뚜껑 자리 0.75 + 숫자 1, 식: 위 여백 0.75 + 1, 식과 보기 사이 0.3, 보기 0.9 — css .cv-*).
    // 안내 문구는 판 밖(.stage-head)이라 따로 빼지 않는다. 운영 버전은 식과 보기 사이를 더 띄우므로(--answer-gap) 그만큼 뺀다
    if (!board.style.getPropertyValue('--tk')) board.style.setProperty('--tk', '50px');
    const currentTileSize = parseFloat(board.style.getPropertyValue('--tk'));
    const extra = Math.max(0, Util.gapOf(this.center, currentTileSize * 0.3) - currentTileSize * 0.3);
    const tileSize = Math.round(Util.clamp(Math.min((height - 8 - extra) / CoverGame.HEIGHT_IN_TILES, width / (this.tokens.length * 1.3 + 0.5)), 36, 110));
    board.style.setProperty('--tk', `${tileSize}px`);
    const boardRect = board.getBoundingClientRect();
    // 숫자 줄과 식을 함께 감싼 자리 (문제): 운영 버전은 여기에 판 바탕을 깐다 (app/app.css .cv-board::before). 보기는 따로 감싼다
    const rowRect = this.row.getBoundingClientRect();
    const equationRect = this.equation.getBoundingClientRect();
    const matLeft = Math.min(rowRect.left, equationRect.left) - boardRect.left;
    const matTop = Math.min(rowRect.top, equationRect.top) - boardRect.top;
    board.style.setProperty('--mat-x', `${matLeft}px`);
    board.style.setProperty('--mat-y', `${matTop}px`);
    board.style.setProperty('--mat-w', `${Math.max(rowRect.right, equationRect.right) - boardRect.left - matLeft}px`);
    board.style.setProperty('--mat-h', `${Math.max(rowRect.bottom, equationRect.bottom) - boardRect.top - matTop}px`);
    const slotRects = this.slots.map((slot) => slot.getBoundingClientRect());
    this.tokens.forEach((token) => {
      const rect = token.slot != null ? slotRects[token.slot] : token.home.getBoundingClientRect();
      token.element.style.left = `${rect.left - boardRect.left}px`;
      token.element.style.top = `${rect.top - boardRect.top}px`;
    });
  }

  ask() {
    const [first, second] = this.pickPair();
    const answer = first.value + second.value;
    this.question = { first, second, answer };
    Util.say(this.message, '두 수를 더한 값을 고르세요', 'act');
    Progress.current(this.progress, this.round);
    this.equation.classList.remove('idle');
    this.answerBox.className = 'cv-ans';
    this.answerBox.textContent = '?';

    [first, second].forEach((token, i) => {
      token.slot = i;
      token.element.classList.add('away');
      token.home.classList.add('empty');
    });
    this.layout();
    this.host.sfx(Sfx.TAP);

    this.host.after(CoverGame.FLY_MS, () => {
      const options = CoverGame.options(first, second, this.tokens, this.spec.optionCount);
      this.optionRow.innerHTML = '';
      this.optionButtons = options.map((value) => {
        const button = Util.element('button', 'ar-cand cv-opt', String(value));
        button.addEventListener('pointerdown', () => this.pick(value, button));
        this.optionRow.append(button);
        return button;
      });
      this.answerBox.classList.add('active');
      this.layout();
      this.phase = Phase.INPUT;
      const indexOf = (token) => this.tokens.indexOf(token);
      this.host.question({
        values: this.tokens.map((token) => token.value),
        marks: this.tokens.map((token) => (token.mark ? token.mark.id : null)),
        terms: [indexOf(first), indexOf(second)],
        ans: answer,
        opts: options,
      });
      this.host.timer([first, second].filter((token) => token.mark).length, () => this.pick(null, null));
    });
  }

  // 덮인 숫자 가운데 덜 물어본 것부터 쓴다. 한 번 묻고 나면 답할 때 상자를 열어 보여 주므로,
  // 같은 상자를 다시 물으면 방금 본 숫자를 떠올리기만 하면 된다.
  // 바로 앞 문제와 같은 식(좌우만 바꾼 것 포함)은 내지 않는다. 덮인 것이 둘뿐인 판에서 둘 다 덮인 식을 뽑으면
  // 그런 식이 하나뿐이므로, 그때는 하나만 덮인 식으로 넘어간다.
  pickPair() {
    const covered = Util.shuffle(this.tokens.filter((token) => token.mark)).sort((a, b) => a.asks - b.asks);
    const uncovered = Util.shuffle(this.tokens.filter((token) => !token.mark));
    const wantBoth = covered.length >= 2 && (!uncovered.length || Math.random() < this.spec.both);
    const same = (candidate) => this.lastPair && candidate.every((token) => this.lastPair.includes(token));
    // 후보는 덜 물어본 덮인 숫자가 앞에 오도록 늘어놓고, 원하는 종류(둘 다 덮인 식 / 하나만 덮인 식)를 먼저 본다
    const both = [];
    const one = [];
    covered.forEach((hidden, i) => {
      covered.slice(i + 1).forEach((other) => both.push([hidden, other]));
      uncovered.forEach((shown) => one.push([hidden, shown]));
    });
    const pair = (wantBoth ? [...both, ...one] : [...one, ...both]).find((candidate) => !same(candidate));
    pair.forEach((token) => token.mark && token.asks++);
    this.lastPair = pair;
    return Util.shuffle(pair);
  }

  // value = 고른 값. null 이면 시간이 다 된 것
  pick(value, button) {
    if (this.phase !== Phase.INPUT) return;
    this.phase = Phase.WAIT;
    this.host.stopTimer();
    const { first, second, answer } = this.question;
    const ok = value === answer;
    this.host.answer({ picked: value, correct: ok, timedOut: !button });

    // 식 안에서 상자를 열어 무엇이 들어 있었는지 보여 준다
    [first, second].forEach((token) => token.mark && token.element.classList.add('open'));
    this.answerBox.classList.remove('active');
    this.answerBox.classList.add(ok ? 'right' : 'wrong');
    this.answerBox.textContent = button ? String(value) : '?';
    this.optionButtons.forEach((optionButton) => {
      optionButton.disabled = true;
      if (Number(optionButton.textContent) === answer) optionButton.classList.add(ok ? 'right' : 'answer');
    });
    if (!ok && button) button.classList.add('wrong');
    Progress.mark(this.progress, this.round, ok);

    if (ok) {
      this.correct++;
      Util.say(this.message, '정답!', 'good');
      this.host.award(pointsPer(this.host, CoverGame.ROUNDS), this.answerBox);
      this.host.sfx(Sfx.GOOD);
    } else {
      Util.say(this.message, `${button ? '' : '시간 초과 · '}${first.value} + ${second.value} = ${answer}`, 'bad');
      this.host.sfx(Sfx.BAD);
    }
    this.round++;
    // 마지막 문제는 숫자를 제자리로 돌려보내지 않고 바로 끝낸다
    if (this.round >= CoverGame.ROUNDS) return this.host.after(ok ? 700 : 1300, () => this.finish());
    this.host.after(ok ? 650 : 1300, () => this.putBack());
  }

  // 상자를 닫으며 두 숫자를 제자리로 돌려보낸다
  putBack() {
    const { first, second } = this.question;
    this.optionRow.innerHTML = '';
    this.answerBox.className = 'cv-ans';
    this.answerBox.textContent = '?';
    Util.say(this.message, '', '');
    [first, second].forEach((token) => {
      token.slot = null;
      token.element.classList.remove('open');
    });
    this.layout();
    this.host.after(CoverGame.FLY_MS, () => {
      [first, second].forEach((token) => {
        token.element.classList.remove('away');
        token.home.classList.remove('empty');
      });
      this.host.after(120, () => this.ask());
    });
  }

  finish() {
    this.resizeObserver.disconnect();
    this.host.done(this.result());
  }

  result() {
    return resultOf(this.correct, CoverGame.ROUNDS);
  }

  // 점수는 맞힐 때마다 바로 지급하므로 중단될 때 따로 줄 것이 없다
  abort() {
    this.resizeObserver.disconnect();
    return abortedResult(this.correct, this.round);
  }

  // ---- 판 만들기 ----
  // 반환: [{ value, mark(덮이지 않았으면 null), asks }]. 놓은 뒤 home·element(화면 요소)·slot(식의 몇 번째 칸, 없으면 null)이 붙는다. 화면의 줄은 이 순서다 — 덮인 숫자가 앞에 몰리지 않게 섞는다
  static deal({ count, hidden }) {
    const values = Util.shuffle(Array.from({ length: CoverGame.MAX_VALUE - CoverGame.MIN_VALUE + 1 }, (_, i) => CoverGame.MIN_VALUE + i)).slice(0, count);
    const marks = Util.shuffle([...COVER_MARKS]);
    return Util.shuffle(values.map((value, i) => ({ value, mark: i < hidden ? marks[i] : null, asks: 0 })));
  }

  // ---- 보기 ----
  // 오답 보기는 실제로 하기 쉬운 실수에서 먼저 고른다: 상자 속 숫자를 다른 상자의 숫자와 바꿔 기억했을 때의 합.
  // 나머지는 정답 가까이의 값으로 채운다. ±1 을 늘 같이 넣으면 '가운데 것'만 고르면 되므로 거리를 섞어 뽑는다.
  // 화면에는 작은 값부터 늘어놓는다.
  static options(first, second, tokens, optionCount) {
    const answer = first.value + second.value;
    const coveredValues = tokens.filter((token) => token.mark).map((token) => token.value);
    const out = new Set([answer]);
    const mixups = [];
    for (const [misremembered, partner] of [[first, second], [second, first]]) {
      if (misremembered.mark) coveredValues.forEach((other) => other !== misremembered.value && other !== partner.value && mixups.push(other + partner.value));
    }
    for (const mixup of Util.shuffle(mixups)) {
      if (out.size >= optionCount - 1) break; // 가까운 값 하나는 남겨 둔다
      out.add(mixup);
    }
    for (const delta of Util.shuffle([-3, -2, -1, 1, 2, 3])) {
      if (out.size >= optionCount) break;
      if (answer + delta >= CoverGame.MIN_VALUE) out.add(answer + delta);
    }
    return [...out].sort((a, b) => a - b);
  }
}
