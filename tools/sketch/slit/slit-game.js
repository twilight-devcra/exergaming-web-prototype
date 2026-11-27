// 물고기 엿보기 (스케치 3단계). 진짜 게임과 같은 모양이라 그대로 js/games/slit.js 로 옮길 수 있다. 설계 카드: docs/games/drafts/slit.md
// 남색 띠의 좁은 틈 뒤로 물고기 한 마리가 오른쪽에서 왼쪽으로 헤엄쳐 지나간다. 틈으로 보인 조각들을 이어 보고, 아래 보기에서 똑같은 물고기를 고른다.
// 보기는 처음부터 보인다. 물고기는 답할 때까지 되풀이해 지나간다 (다 지나가면 0.5초 쉬고 다시).
// 첫 번째로 다 지나간 뒤부터 제한 시간을 잰다. 그 전에 눌러도 된다.
// 한 판에 문제 2개, 문제마다 새 물고기.
// 물고기와 보기는 fish.js: 보이지 않는 바탕 물고기에서 저마다 다른 특징 하나씩을 바꾼 보기들 가운데 하나가 지나간다.
//   complexity — 물고기 복잡도 (1~3): 몸·꼬리·등지느러미·무늬 → 배지느러미·무늬 개수 → 눈·입·아가미
//   change     — 보기끼리 다른 곳: big 부분의 종류 · small 개수와 작은 부분 · mixed 둘 다
//   slit       — 틈 너비 (물고기 너비 대비)
//   pass       — 물고기가 틈을 다 지나가는 시간 (초)
//   choices    — 보기 수
//   looks      — 제한 시간 안에 물고기를 볼 수 있는 횟수 (처음 지나가는 것 포함)
import { Util, EASY_TIME } from '../../../js/config.js';
import { Diagram } from '../../../js/diagram.js';
import { Sfx } from '../../../js/sfx.js';
import { Tag } from '../../../js/games/tags.js';
import { Phase, Progress, pointsPer, resultOf, abortedResult } from '../../../js/games/kit.js';
import { drawBoard, moveFish, layoutFor } from './board.js';
import { LEVELS, levelQuestion, fishMarkup, FISH_WIDTH } from './fish.js';

const PAUSE_SECONDS = 0.5;  // 물고기가 다 지나간 뒤 다시 들어오기까지
const RIGHT_MS = 900;       // 맞힌 뒤 다음으로 넘어가기까지
const WRONG_MS = 1400;      // 틀렸을 때 정답을 보여 주는 시간
const DECIDE_SECONDS = 1;   // 마지막으로 다 지나간 뒤 고를 여유

export class SlitGame {
  static id = 'slit';
  static tags = [Tag.TRACK];
  static title = '물고기 엿보기';
  static hint = '틈 사이로 지나가는 물고기를 잘 보고<br>똑같은 물고기를 고르세요';
  static levels = LEVELS;
  static maxLevel = LEVELS.length;
  static ROUNDS = 2;
  // 제한 시간 (나중에 js/config.js 로): 첫 번째로 다 지나간 뒤부터, load = 초. 레벨의 looks 에서 셈한다 (timeLimit)
  static questionTime = { base: 0, per: 1 };

  // 첫 번째로 다 지나간 뒤 남은 (looks − 1) 번을 더 볼 시간 + 마지막에 고를 여유 (초).
  // Lv1 6번 18.5초 · Lv3 5번 13.4초 · Lv5 4번 9.7초 · Lv8 3번 6초
  static timeLimit({ looks, pass }) {
    return (looks - 1) * (pass + PAUSE_SECONDS) + DECIDE_SECONDS;
  }

  // 소개 그림 (모든 레벨 같음): ① 틈으로 지나가는 물고기 보기 → ② 똑같은 물고기 누르기
  static diagram() {
    const fish = { body: 'round', tail: 'forked', dorsal: 'sail', ventral: 'one', pattern: 'stripes', count: 2, eye: 'dot', mouth: 'closed', gill: 'none' };
    const placed = (one, x, y, height) =>
      `<svg x="${x}" y="${y}" width="${(height * FISH_WIDTH) / 100}" height="${height}" viewBox="0 0 ${FISH_WIDTH} 100" style="color:#1f2a36">${fishMarkup(one)}</svg>`;
    const card = (one, x, y, right) => `<rect x="${x}" y="${y}" width="76" height="40" rx="6" fill="#fff" stroke="${right ? '#22a06b' : '#c9c4b8'}" stroke-width="${right ? 4 : 2}"/>${placed(one, x + 5, y + 3, 34)}`;
    return [
      { caption: '틈으로 지나가는 물고기 보기',
        svg: Diagram.svg('0 0 176 140', `<rect x="10" y="30" width="156" height="80" rx="8" fill="#fff"/>${placed(fish, 46, 40, 60)}` +
          '<rect x="10" y="30" width="70" height="80" rx="8" fill="#34456b"/><rect x="100" y="30" width="66" height="80" rx="8" fill="#34456b"/>' +
          '<rect x="80" y="30" width="20" height="80" fill="none" stroke="#ffd23f" stroke-width="3"/>' +
          '<path d="M120 124 h-60 m10 -7 l-10 7 l10 7" fill="none" stroke="#34456b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>') },
      { caption: '똑같은 물고기 누르기',
        svg: Diagram.svg('0 0 176 140', card({ ...fish, tail: 'round' }, 8, 26) + card(fish, 92, 26, true) +
          card({ ...fish, dorsal: 'none' }, 8, 78) + card({ ...fish, pattern: 'none' }, 92, 78) + Diagram.tap(140, 50)) },
    ];
  }

  /** @param {import('../../../js/games/host.js').GameHost} host */
  constructor(host) {
    this.host = host;
    this.spec = SlitGame.levels[host.level - 1];
    this.answered = 0;
    this.correct = 0;
    this.phase = Phase.SHOW;
  }

  start() {
    const { stage, level } = this.host;
    this.message = Util.element('div', 'stage-msg', '');
    const { body, dots } = Util.frame(stage, `${SlitGame.title} · Lv.${level}`, this.message, SlitGame.ROUNDS);
    this.body = body;
    this.progress = dots;
    this.body.addEventListener('pointerdown', (event) => {
      const button = event.target.closest('.sl-choice');
      if (button) this.pick(Number(button.dataset.choice));
    });
    // 판 모양이 바뀌어 배치가 달라지면 (휴대폰을 돌리거나 창을 줄이면) 다시 그린다. 크기만 바뀌면 board.js 가 맞춘다
    this.resizeObserver = new ResizeObserver(() => {
      if (this.state && this.board && layoutFor(this.body.clientWidth, this.body.clientHeight) !== this.state.layout) this.render();
    });
    this.resizeObserver.observe(this.body);
    this.ask();
  }

  render() {
    const layout = layoutFor(this.body.clientWidth || 1, this.body.clientHeight || 1);
    this.state = { ...this.state, layout };
    this.board = drawBoard(this.body, { level: this.host.level, ...this.state });
  }

  ask() {
    if (this.phase === Phase.END) return;
    const question = levelQuestion(this.host.level, 1 + Util.randomBelow(1e6));
    this.state = { question, mode: 'watch', progress: 0 };
    this.render();
    Util.say(this.message, '틈으로 물고기를 보세요', 'look');
    Progress.current(this.progress, this.answered);
    this.opened = false;
    this.phase = Phase.INPUT; // 첫 번째로 지나가는 동안에도 누를 수 있다
    this.host.question({
      nth: this.answered + 1, answer: question.answerIndex,
      choices: question.choices.map((choice) => choice.school[0]), changes: question.choices.map((choice) => choice.change),
    }, false);
    this.swim();
  }

  // 물고기를 게임 시계로 옮긴다. 첫 번째로 다 지나가면 '누르세요' 와 제한 시간
  swim() {
    const startedAt = this.host.now();
    const { pass } = this.spec;
    const step = () => {
      if (this.phase !== Phase.INPUT) return;
      const elapsed = (this.host.now() - startedAt) / 1000;
      const progress = Math.min(1, (elapsed % (pass + PAUSE_SECONDS)) / pass);
      moveFish(this.board, progress);
      if (!this.opened && elapsed >= pass) this.open();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  open() {
    this.opened = true;
    Util.say(this.message, '똑같은 물고기를 누르세요', 'act');
    this.host.open();
    // host 는 쉬운 단계(Lv1·2)의 제한 시간을 EASY_TIME 배로 늘린다. 볼 횟수가 이미 넉넉하므로 그만큼 나눠 둔다
    const easy = EASY_TIME[this.host.level - 1] || 1;
    this.host.timer(SlitGame.timeLimit(this.spec) / easy, () => this.pick(null));
  }

  // choice = 누른 보기 번호, null 이면 시간 초과
  pick(choice) {
    if (this.phase !== Phase.INPUT) return;
    this.phase = Phase.WAIT;
    if (this.opened) this.host.stopTimer();
    else this.host.open(); // 첫 번째로 지나가는 중에 눌렀다
    const { answerIndex } = this.state.question;
    const ok = choice === answerIndex;
    this.host.answer({ choice, correct: ok, timedOut: choice == null, early: !this.opened });
    this.state = { ...this.state, mode: ok ? 'right' : 'wrong', picked: choice };
    this.render();
    if (ok) {
      this.correct++;
      Util.say(this.message, '맞았어요!', 'good');
      this.host.award(pointsPer(this.host, SlitGame.ROUNDS), this.body.querySelector('.sl-choice.right'));
      this.host.sfx(Sfx.GOOD);
    } else {
      Util.say(this.message, choice == null ? '시간 초과 · 이 물고기였어요' : '이 물고기였어요', 'bad');
      this.host.sfx(Sfx.BAD);
    }
    Progress.mark(this.progress, this.answered, ok);
    this.answered++;
    this.host.after(ok ? RIGHT_MS : WRONG_MS, () => (this.answered >= SlitGame.ROUNDS ? this.finish() : this.ask()));
  }

  finish() {
    this.phase = Phase.END;
    this.resizeObserver.disconnect();
    this.host.done(this.result());
  }

  result() {
    return resultOf(this.correct, SlitGame.ROUNDS);
  }

  // 점수는 맞힐 때마다 바로 주므로 중단될 때 따로 줄 것이 없다
  abort() {
    this.phase = Phase.END;
    this.resizeObserver?.disconnect();
    return abortedResult(this.correct, this.answered);
  }
}
