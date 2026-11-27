// 물고기 엿보기
// 남색 띠의 좁은 틈 뒤로 물고기 한 마리가 오른쪽에서 왼쪽으로 헤엄쳐 지나간다. 틈으로 보인 조각을 이어 보고 아래 보기에서 똑같은 물고기를 고른다.
// 보기는 처음부터 보인다. 물고기는 답할 때까지 되풀이해 지나간다 (다 지나가면 0.5초 쉬고 다시).
// 첫 번째로 다 지나간 뒤부터 제한 시간을 잰다 (그 전에 눌러도 된다). 한 판에 문제 2개, 문제마다 새 물고기.
// 물고기와 보기는 slit-fish.js: 보이지 않는 바탕 물고기에서 저마다 다른 특징 하나씩을 바꾼 보기들 가운데 하나가 지나간다.
// 설계와 검토 기록: docs/games/drafts/slit.md
//   complexity — 물고기 복잡도 (1~3). 1: 몸 · 꼬리 · 등지느러미 · 세로 줄 무늬
//                2: 몸과 무늬가 늘고 배지느러미 · 무늬 개수 · 3: 눈 · 입 · 아가미 선까지
//   change     — 보기끼리 다른 곳: big 부분의 종류 (꼬리 갈래 → 둥긂) · small 개수와 작은 부분 (줄 2 → 3, 큰 눈) · mixed 둘 다
//   slit       — 틈 너비 (물고기 너비에 대한 몫)
//   pass       — 물고기가 틈을 다 지나가는 시간 (초)
//   choices    — 보기 수
//   looks      — 제한 시간 안에 물고기를 볼 수 있는 횟수 (처음 지나가는 것 포함). 제한 시간은 이것으로 셈한다 (timeLimit)
import { Util, EASY_TIME } from '../config.js';
import { Diagram } from '../diagram.js';
import { Sfx } from '../sfx.js';
import { Tag } from './tags.js';
import { Phase, Progress, pointsPer, resultOf, abortedResult } from './kit.js';
import { fishQuestion, fishMarkup, fishSvg, FISH_WIDTH } from './slit-fish.js';

const PAUSE_SECONDS = 0.5;  // 물고기가 다 지나간 뒤 다시 들어오기까지
const DECIDE_SECONDS = 1;   // 마지막으로 다 지나간 뒤 고를 여유
const RIGHT_MS = 900;       // 맞힌 뒤 다음으로 넘어가기까지
const WRONG_MS = 1400;      // 틀렸을 때 정답을 보여 주는 시간
const FISH_RATIO = FISH_WIDTH / 100; // 물고기 그림의 너비 ÷ 높이
const BAND_PAD = 1.3;       // 띠 = 물고기의 1.3배 (위아래 여백, 양옆은 벽)
const CARD_PAD = 8;         // 보기 안쪽 여백 (style.css 의 .sl-choice padding)
const CHOICE_GAP = 12;      // 보기 사이 (style.css 의 .sl-choices)
const FISH_MAX = 150;       // 띠 속 물고기 높이의 끝 (px)
const CARD_RATIO = 0.75;    // 넓은 판: 보기 속 물고기 = 띠 속의 0.75배
const PHONE_CARD_MIN = 0.6; // 좁은 판: 보기 속 물고기가 띠 속의 0.6배보다 작아지면 띠를 줄인다
const STACK_RATIO = 1.5;    // 판 자리의 너비 ÷ 높이가 이보다 작으면 휴대폰 배치 (보기 2×2)

export class SlitGame {
  static id = 'slit';
  static tags = [Tag.TRACK];
  static title = '물고기 엿보기';
  static hint = '틈 사이로 지나가는 물고기를 잘 보고<br>똑같은 물고기를 고르세요';
  static levels = [
    // 단순한 물고기, 크게 다른 보기. 틈이 넓고 느리다
    { complexity: 1, change: 'big', slit: 0.5, pass: 3.0, choices: 2, looks: 6 },
    { complexity: 1, change: 'big', slit: 0.4, pass: 2.8, choices: 3, looks: 6 },
    { complexity: 2, change: 'big', slit: 0.32, pass: 2.6, choices: 3, looks: 5 },
    // 작은 차이가 섞인다. Lv4 부터는 앱에서 해 보고 틈을 한 칸 좁히고 조금 빠르게 했다 (2026-11-27, 볼 횟수는 그대로)
    { complexity: 2, change: 'mixed', slit: 0.22, pass: 2.4, choices: 3, looks: 5 },
    { complexity: 2, change: 'mixed', slit: 0.17, pass: 2.3, choices: 4, looks: 4 },
    { complexity: 3, change: 'mixed', slit: 0.12, pass: 2.2, choices: 4, looks: 4 },
    // 작은 차이만. Lv8 은 처음에 정해 받은 값 (틈 8% · 2초 · 세 번)에서 한 칸 더 어렵게
    { complexity: 3, change: 'small', slit: 0.09, pass: 2.1, choices: 4, looks: 3 },
    { complexity: 3, change: 'small', slit: 0.07, pass: 1.9, choices: 4, looks: 3 },
  ];
  static maxLevel = SlitGame.levels.length;
  static ROUNDS = 2;

  // 첫 번째로 다 지나간 뒤의 제한 시간 (초): 남은 (looks − 1) 번을 더 볼 시간 + 마지막에 고를 여유.
  // Lv1 18.5초 · Lv3 13.4초 · Lv5 9.4초 · Lv8 5.8초
  static timeLimit({ looks, pass }) {
    return (looks - 1) * (pass + PAUSE_SECONDS) + DECIDE_SECONDS;
  }

  // 소개 그림 (모든 레벨 같음): ① 틈으로 지나가는 물고기 보기 → ② 똑같은 물고기 누르기
  static diagram() {
    const fish = { body: 'round', tail: 'forked', dorsal: 'sail', ventral: 'one', pattern: 'stripes', count: 2, eye: 'dot', mouth: 'closed', gill: 'none' };
    const placed = (one, x, y, height) =>
      `<svg x="${x}" y="${y}" width="${(height * FISH_WIDTH) / 100}" height="${height}" viewBox="0 0 ${FISH_WIDTH} 100" style="color:#1f2a36">${fishMarkup(one)}</svg>`;
    const card = (one, x, y, right) =>
      `<rect x="${x}" y="${y}" width="76" height="40" rx="6" fill="#fff" stroke="${right ? '#22a06b' : '#c9c4b8'}" stroke-width="${right ? 4 : 2}"/>${placed(one, x + 5, y + 3, 34)}`;
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

  /** @param {import('./host.js').GameHost} host */
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
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.body);
    this.ask();
  }

  ask() {
    if (this.phase === Phase.END) return;
    const question = fishQuestion(1 + Util.randomBelow(1e6), this.spec);
    this.state = { question, mode: 'watch', picked: null };
    this.fishProgress = 0;
    this.render();
    Util.say(this.message, '틈으로 물고기를 보세요', 'look');
    Progress.current(this.progress, this.answered);
    this.opened = false;
    this.phase = Phase.INPUT; // 첫 번째로 지나가는 동안에도 누를 수 있다
    // 다시 그리기용으로 보기마다 특징과 svg 를 함께 남긴다
    this.host.question({
      nth: this.answered + 1, answer: question.answerIndex, seed: question.seed,
      choices: question.choices.map((choice) => choice.fish),
      changes: question.choices.map((choice) => choice.change),
      svgs: question.choices.map((choice) => fishSvg(choice.fish)),
    }, false);
    this.swim();
  }

  // state.mode — watch 지나가는 중 · right · wrong (둘 다 벽이 걷혀 물고기 전체가 띠 가운데에 보인다)
  render() {
    const { question, mode, picked } = this.state;
    const done = mode !== 'watch';
    this.wrap = Util.element('div', `sl-board mode-${mode}`);
    const band = Util.element('div', 'sl-band');
    // 물고기는 띠 크기의 svg 안에서 움직인다 (띠 밖으로 나간 부분은 svg 가 자른다)
    band.innerHTML = `<svg class="sl-scene"><svg class="sl-fish" viewBox="0 0 ${FISH_WIDTH} 100">${fishMarkup(question.choices[question.answerIndex].fish)}</svg></svg>` +
      '<div class="sl-wall left"></div><div class="sl-wall right"></div><div class="sl-slit"></div>';
    const choices = Util.element('div', 'sl-choices');
    question.choices.forEach((choice, i) => {
      const button = Util.element('button', 'sl-choice', fishSvg(choice.fish));
      button.dataset.choice = i;
      const right = i === question.answerIndex;
      const wrongPick = mode === 'wrong' && i === picked;
      if (done && right) button.classList.add('right');
      if (wrongPick) button.classList.add('wrong');
      if ((done && right) || wrongPick) button.append(Util.element('i', 'sl-mark', right ? '✓' : '✕'));
      choices.append(button);
    });
    this.wrap.append(band, choices);
    this.body.replaceChildren(this.wrap);
    this.layout();
  }

  // 판 자리를 재어 띠 속 물고기 높이(--f)와 보기 속 물고기 높이(--c)를 정한다.
  // 넓은 판: 띠를 가운데 위에, 보기 한 줄을 아래에. 좁고 긴 판(휴대폰): 띠는 판 너비를 다 쓰고 보기 2×2.
  // 앱은 띠와 보기에 흰 판 바탕(--mat-pad 만큼 둘레)을 깔고 둘 사이를 넓히므로 (app.css) 둘 다 읽어 뺀다
  layout() {
    if (!this.wrap) return;
    const count = this.state.question.choices.length;
    const stacked = this.body.clientWidth / this.body.clientHeight < STACK_RATIO;
    this.wrap.classList.toggle('stacked', stacked);
    const matPad = parseFloat(getComputedStyle(this.wrap).getPropertyValue('--mat-pad')) || 0;
    const width = this.body.clientWidth - 2 * matPad;
    const height = this.body.clientHeight - 2 * matPad;
    if (width <= 0 || height <= 0) return;
    const gap = Util.gapOf(this.wrap, stacked ? 16 : 24);
    const cardWidthFor = (columns) => (width - (columns - 1) * CHOICE_GAP) / columns / FISH_RATIO - (2 * CARD_PAD) / FISH_RATIO;
    let fish;
    let card;
    if (!stacked) {
      const byWidth = (width - (count - 1) * CHOICE_GAP - count * 2 * CARD_PAD) / (count * FISH_RATIO * CARD_RATIO);
      const byHeight = (height - gap - 2 * CARD_PAD) / (BAND_PAD + CARD_RATIO);
      fish = Math.floor(Math.min(FISH_MAX, byWidth, byHeight, width / (FISH_RATIO * BAND_PAD)));
      card = Math.floor(fish * CARD_RATIO);
    } else {
      const columns = Math.min(2, count);
      const rows = Math.ceil(count / columns);
      const cardFor = (bandFish) => Math.floor(Math.min(cardWidthFor(columns), (height - bandFish * BAND_PAD - gap - (rows - 1) * CHOICE_GAP) / rows - 2 * CARD_PAD));
      fish = Math.floor(Math.min(FISH_MAX, width / (FISH_RATIO * BAND_PAD)));
      while (cardFor(fish) < fish * PHONE_CARD_MIN && fish > 40) fish -= 2;
      card = cardFor(fish);
    }
    this.fishHeight = fish;
    this.wrap.style.setProperty('--f', `${fish}px`);
    this.wrap.style.setProperty('--c', `${card}px`);
    this.placeFish();
  }

  // 띠 안에서 물고기와 틈의 자리 (px). 답한 뒤에는 물고기를 띠 가운데에
  placeFish() {
    const fish = this.fishHeight;
    if (!fish || !this.wrap) return;
    const bandWidth = fish * FISH_RATIO * BAND_PAD;
    const fishWidth = fish * FISH_RATIO;
    const slitWidth = Math.max(6, this.spec.slit * fishWidth);
    const slitLeft = (bandWidth - slitWidth) / 2;
    const fishLeft = this.state.mode === 'watch'
      ? slitLeft + slitWidth - this.fishProgress * (slitWidth + fishWidth)
      : (bandWidth - fishWidth) / 2;
    const fishElement = this.wrap.querySelector('.sl-fish');
    fishElement.setAttribute('x', fishLeft.toFixed(1));
    fishElement.setAttribute('y', (fish * 0.15).toFixed(1));
    fishElement.setAttribute('width', fishWidth);
    fishElement.setAttribute('height', fish);
    this.wrap.querySelector('.sl-wall.left').style.width = `${slitLeft}px`;
    this.wrap.querySelector('.sl-wall.right').style.left = `${slitLeft + slitWidth}px`;
    const slit = this.wrap.querySelector('.sl-slit');
    slit.style.left = `${slitLeft}px`;
    slit.style.width = `${slitWidth}px`;
  }

  // 물고기를 게임 시계로 옮긴다 (멈춰 있는 동안 시계가 서 있으면 물고기도 선다). 첫 번째로 다 지나가면 '누르세요' 와 제한 시간
  swim() {
    const startedAt = this.host.now();
    const { pass } = this.spec;
    const step = () => {
      if (this.phase !== Phase.INPUT) return;
      const elapsed = (this.host.now() - startedAt) / 1000;
      this.fishProgress = Math.min(1, (elapsed % (pass + PAUSE_SECONDS)) / pass);
      this.placeFish();
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
    const ok = choice === this.state.question.answerIndex;
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
