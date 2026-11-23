// 금고 열기 (3단계 스케치). 설계: docs/games/drafts/safe.md
// 그림마다 정해진 숫자를 열쇠 표에서 찾아 금고 암호(그림 줄)를 차례대로 누른다. 높은 단계는 표의 일부 그림이 숫자 대신 단서(식 · 사이 · 짝수/홀수)로 나온다.
// 한 판에 긴 암호 하나 (길 따라 그리기처럼 한 답이 긴 게임): 맞힌 자리마다 60% 를 나눠 주고, 다 맞혀 열면 40%.
// 진짜 게임과 같은 모양이라 js/games/safe.js 로 옮길 때 그대로 쓴다. 문제는 아직 손으로 쓴 것(puzzles.js)이고, 진짜 게임에서는 생성기가 만든다.
import { Util } from '../../../js/config.js';
import { Diagram } from '../../../js/diagram.js';
import { Sfx } from '../../../js/sfx.js';
import { Tag } from '../../../js/games/tags.js';
import { Phase, resultOf, abortedResult } from '../../../js/games/kit.js';
import { Sketch } from '../sketch.js';
import { drawBoard, digitFor } from './board.js';
import { LEVELS, PUZZLES } from './puzzles.js';

const PHONE = '(max-width: 600px)'; // 앱의 휴대폰 규칙과 같은 기준 (css '휴대폰' 묶음)
const DIGIT_SHARE = 0.6;            // 자리마다 나눠 주는 몫. 나머지 0.4 는 금고를 열면
const CLUE_LOAD = 3;                // 제한 시간: 단서 줄 하나 = 숫자 세 자리만큼의 일
const WRONG_MS = 900;               // 틀린 자리의 정답을 보여 주는 시간
const END_MS = 1400;                // 다 채운 뒤 결과를 보여 주는 시간

// 소개 그림 한 바퀴(DURATION 초). i번째 자리는 [i, i+1) 초 동안 켜지고, i + PRESS 초에 번호판을 눌러 그 숫자가 들어간다.
// 다 채운 뒤 잠깐 멈췄다가 되풀이. 모든 움직임이 같은 SVG 시계를 쓴다 (CSS 애니메이션은 따로 돌아 어긋난다)
const DURATION = 4.4;
const PRESS = 0.55;
const RIPPLE = 0.45; // 누른 자리에 퍼지는 고리가 사라지는 시간
const keyTime = (seconds) => (seconds / DURATION).toFixed(4);
// since~until 초에만 보이는 조각 (until 이 없으면 끝까지)
const during = (since, until, content) => {
  const times = until == null ? `0;${keyTime(since)}` : `0;${keyTime(since)};${keyTime(until)}`;
  const values = until == null ? '0;1' : '0;1;0';
  return `<g opacity="0">${content}<animate attributeName="opacity" dur="${DURATION}s" repeatCount="indefinite" calcMode="discrete" keyTimes="${times}" values="${values}"/></g>`;
};
// moment 초에 누른 자리: 고리가 작게 나타나 커지며 사라진다 (Diagram.tap 과 같은 모양, 시계만 소개 그림의 것)
const pulse = (x, y, radius, moment) => {
  const times = `0;${keyTime(moment)};${keyTime(moment + RIPPLE)};1`;
  const repeat = `dur="${DURATION}s" repeatCount="indefinite" keyTimes="${times}"`;
  return `<circle class="dg-tap" style="animation: none" cx="${x}" cy="${y}" r="${radius * 0.7}" opacity="0">` +
    `<animate attributeName="r" ${repeat} values="${radius * 0.7};${radius * 0.7};${radius * 1.4};${radius * 1.4}"/>` +
    `<animate attributeName="opacity" ${repeat} calcMode="discrete" values="0;1;0;0"/>` +
    `<animate attributeName="stroke-opacity" ${repeat} values="1;1;0;0"/></circle>`;
};

export class SafeGame {
  static id = 'safe';
  static tags = [Tag.NUMBER];
  static title = '금고 열기';
  static hint = '그림마다 정해진 숫자를 표에서 찾아<br>금고 암호를 차례대로 누르세요';
  static levels = LEVELS;
  static maxLevel = LEVELS.length;
  // 제한 시간(초) = base + per × (암호 자릿수 + 3 × 단서 줄 수). Lv3 9.5초, Lv5 13초, Lv8 25초. 나중에 js/config.js 로 옮긴다
  static questionTime = { base: 3, per: 1.3 };
  static lastPick = {}; // 레벨마다 지난번 문제 (같은 문제가 연달아 나오지 않게)

  // 소개 그림 (모든 레벨 같음): ① 표에서 그림의 숫자 찾기 → ② 차례대로 누르기. 두 그림이 함께 움직인다:
  // ① 에서 ▲ → ★ → ● 줄이 차례로 켜지는 동안 ② 에서 그 자리가 켜지고, 번호판의 2 → 4 → 7 을 누르면 숫자가 들어간다
  static diagram() {
    const glyph = (id, x, y, size) => Diagram.glyph(Sketch.symbol(id).svg, x, y, size);
    const key = [['star', 4], ['circle', 7], ['triangle', 2]];
    const code = ['triangle', 'star', 'circle'];
    const rowY = (row) => 34 + row * 36;
    // 켜진 줄의 테두리를 먼저 그려야 그 줄의 그림과 숫자를 가리지 않는다
    const table = code.map((id, i) => during(i, i + 1, Diagram.rect(40, rowY(key.findIndex(([shape]) => shape === id)) - 16, 96, 32, 'dg-slot active', 7))).join('') +
      key.map(([id, digit], row) => glyph(id, 62, rowY(row), 24) + Diagram.text(88, rowY(row), '=', 18) + Diagram.text(112, rowY(row), digit, 22)).join('');
    const pad = (digit) => 4 + (digit - 1) * 19;
    const digitOf = (id) => key.find(([shape]) => shape === id)[1];
    const windows = code.map((id, i) => {
      const x = 30 + i * 42;
      return Diagram.rect(x, 6, 34, 34, 'dg-cell', 7) + glyph(id, x + 17, 23, 24) + Diagram.rect(x, 46, 34, 30, 'dg-slot', 6) +
        during(i, i + 1, Diagram.rect(x, 46, 34, 30, 'dg-slot active', 6)) +
        during(i + PRESS, null, Diagram.text(x + 17, 61, digitOf(id), 20)); // 누르는 순간 숫자가 들어간다
    }).join('');
    const keypad = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => Diagram.rect(pad(digit), 104, 16, 22, 'dg-cell', 4) + Diagram.text(pad(digit) + 8, 115, digit, 13)).join('');
    // 누른 고리는 번호판 위에 그린다 (아래에 두면 단추에 가린다)
    const taps = code.map((id, i) => pulse(pad(digitOf(id)) + 8, 115, 12, i + PRESS)).join('');
    const press = windows + keypad + taps;
    return [
      { svg: Diagram.svg('0 0 176 140', table), caption: '표에서 그림의 숫자 찾기' },
      { svg: Diagram.svg('0 0 176 140', press), caption: '차례대로 누르기' },
    ];
  }

  /** @param {import('../../../js/games/host.js').GameHost} host */
  constructor(host) {
    this.host = host;
    this.spec = LEVELS[host.level - 1];
    const choices = PUZZLES[host.level];
    // 스케치 전용: ?puzzle=N 이면 그 레벨의 N번째 문제만 (단서 종류를 하나씩 보려고)
    const forced = Number(new URLSearchParams(location.search).get('puzzle'));
    let index = forced >= 1 && forced <= choices.length ? forced - 1 : Math.floor(Math.random() * choices.length);
    if (!forced && choices.length > 1 && index === SafeGame.lastPick[host.level]) index = (index + 1) % choices.length;
    SafeGame.lastPick[host.level] = index;
    this.puzzle = choices[index];
    this.phase = Phase.SHOW;
    this.flash = 0;
  }

  start() {
    const { stage, level } = this.host;
    this.message = Util.element('div', 'stage-msg', '');
    this.body = Util.frame(stage, `${SafeGame.title} · Lv.${level}`, this.message).body;
    const given = this.spec.given || 0;
    this.state = { ...this.puzzle, level, typed: this.puzzle.code.slice(0, given).map((id) => digitFor(this.puzzle, id)), wrong: [] };
    this.given = given;
    this.media = matchMedia(PHONE);
    this.onMedia = () => this.render();
    this.media.addEventListener('change', this.onMedia);
    this.body.addEventListener('pointerdown', (event) => {
      const button = event.target.closest('.sf-num');
      if (button) this.press(Number(button.dataset.digit), button);
    });
    this.render();
    Util.say(this.message, '암호를 누르세요', 'act');
    this.phase = Phase.INPUT;
    this.host.question({ known: this.puzzle.known, clues: this.puzzle.clues || [], code: this.puzzle.code, given });
    this.host.timer(this.puzzle.code.length + CLUE_LOAD * (this.puzzle.clues || []).length, () => this.timeOut());
  }

  render() {
    this.body.innerHTML = '';
    this.state.layout = this.media.matches ? 'phone' : 'below';
    drawBoard(this.body, this.state);
  }

  digitPoints() {
    return (this.host.base * DIGIT_SHARE * this.host.multiplier) / (this.puzzle.code.length - this.given);
  }

  press(digit, button) {
    if (this.phase !== Phase.INPUT) return;
    const { state } = this;
    const slot = state.typed.length;
    const expected = digitFor(state, state.code[slot]);
    const ok = digit === expected;
    this.host.input({ slot, digit, ok });
    state.typed.push(expected);
    state.pressed = digit;
    state.answer = ok ? null : expected;
    if (ok) {
      this.host.award(this.digitPoints(), button);
      this.host.sfx(Sfx.TAP);
    } else {
      state.wrong.push({ slot, tapped: digit });
      Util.say(this.message, `정답은 ${expected}`, 'bad');
    }
    this.render();
    // 누른 단추 표시(맞으면 잠깐 초록, 틀리면 빨강 + 정답 테두리)를 지운다
    const mine = ++this.flash;
    this.host.after(ok ? 250 : WRONG_MS, () => {
      if (mine !== this.flash) return;
      state.pressed = null;
      state.answer = null;
      if (this.phase === Phase.INPUT) Util.say(this.message, '암호를 누르세요', 'act');
      this.render();
    });
    if (state.typed.length === state.code.length) this.finish(false);
  }

  // 시간 초과: 남은 자리를 정답으로 채워 보여 주고 끝낸다
  timeOut() {
    if (this.phase !== Phase.INPUT) return;
    const { state } = this;
    for (let slot = state.typed.length; slot < state.code.length; slot++) {
      state.typed.push(digitFor(state, state.code[slot]));
      state.wrong.push({ slot, tapped: null });
    }
    this.finish(true);
  }

  finish(timedOut) {
    this.phase = Phase.END;
    this.host.stopTimer();
    const { state } = this;
    this.cleared = state.wrong.length === 0;
    state.result = this.cleared ? 'open' : 'shut';
    this.host.answer({ correct: this.cleared, timedOut, typed: state.typed, wrong: state.wrong });
    if (this.cleared) {
      this.host.after(200, () => this.host.award(this.host.base * (1 - DIGIT_SHARE) * this.host.multiplier, this.body.querySelector('.sf-lockplate'), '열림 '));
      this.host.sfx(Sfx.GOOD);
      Util.say(this.message, '금고가 열렸어요!', 'good');
    } else {
      this.host.sfx(Sfx.BAD);
      Util.say(this.message, timedOut ? '시간 초과' : `아쉬워요, ${state.wrong.length}칸이 틀렸어요`, 'bad');
    }
    this.render();
    this.host.after(END_MS, () => {
      this.cleanup();
      this.host.done(this.result());
    });
  }

  cleanup() {
    this.media.removeEventListener('change', this.onMedia);
    this.body.skFit?.disconnect();
  }

  result() {
    return resultOf(this.cleared ? 1 : 0, 1);
  }

  abort() {
    this.phase = Phase.END;
    this.cleanup();
    return abortedResult(0, 0);
  }
}
