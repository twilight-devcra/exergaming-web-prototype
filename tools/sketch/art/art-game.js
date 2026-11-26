// 그림 조각 기억하기 (3단계 스케치). 설계: docs/games/drafts/art.md
// 추상화 한 장을 잠깐 보여 준 뒤 칸이 왼쪽 위부터 대각선 차례로 뒤집힌다. 노란 칸에 있던 조각을 보기에서 고른다.
// 한 판에 문제 2개, 같은 그림. 첫 답 뒤에는 모든 칸이 다시 덮이고 다른 칸을 묻는다 (그림을 다시 보여 주지 않는다).
// 그림은 generate.js 가 판마다 새로 만든다 (바로 앞 판과 다른 색 묶음). 묻는 칸과 오답 고르기는 아래 규칙대로:
//   far = 묻는 칸과 붙어 있지 않은 칸 · near = 붙어 있는 칸(대각선 포함) · any = 아무 칸
//   altered = 오답 하나는 정답 조각에서 작은 무늬 하나의 모양을 바꾼 것 (하나만: 둘이면 '나머지가 닮은 하나'가 정답으로 드러난다)
// 진짜 게임과 같은 모양이라 js/games/art.js 로 옮길 때 그대로 쓴다.
// 스케치 전용 주소: ?seed=N 이면 그림을 고정한다.
import { Util } from '../../../js/config.js';
import { Diagram } from '../../../js/diagram.js';
import { Sfx } from '../../../js/sfx.js';
import { Tag } from '../../../js/games/tags.js';
import { Phase, Progress, pointsPer, resultOf, abortedResult } from '../../../js/games/kit.js';
import { drawBoard, pictureSvg, choiceOf } from './board.js';
import { makePicture } from './generate.js';

const PHONE = '(max-width: 600px)'; // 앱의 휴대폰 규칙과 같은 기준
const FLIP_STEP = 90;  // 대각선 하나마다 늦게 뒤집히는 시간 (art.css 의 90ms 와 같다)
const FLIP_MS = 320;   // 칸 하나가 도는 시간 (art.css)
const RIGHT_MS = 900;  // 맞힌 뒤 다음으로 넘어가기까지
const WRONG_MS = 1400; // 틀렸을 때 정답을 보여 주는 시간

export class ArtGame {
  static id = 'art';
  static tags = [Tag.MEMORY];
  static title = '그림 조각 기억하기';
  static hint = '그림을 잘 봐 두었다가<br>칸이 뒤집히면 노란 칸에 있던 조각을 고르세요';
  // cols × rows 칸 (가로 × 세로), show = 그림을 보여 주는 시간(ms), choices = 보기 수
  // calm = 차분한 그림 (큰 모양 몇 개만, generate.js 의 calmAttempt). Lv1~3. Lv4 는 같은 2×3 의 보통 그림이라 그림 모양만 한 단계 오른다
  static levels = [
    { cols: 2, rows: 1, show: 5000, choices: 2, pick: 'any', calm: true },
    { cols: 2, rows: 2, show: 4500, choices: 2, pick: 'far', calm: true },
    { cols: 3, rows: 2, show: 4000, choices: 3, pick: 'any', calm: true },
    { cols: 3, rows: 2, show: 4000, choices: 3, pick: 'far' }, // Lv3 과 같은 2×3, 그림만 보통 그림 (3×3 이던 때 Lv3 → Lv4 가 너무 가팔랐다)
    { cols: 3, rows: 3, show: 3500, choices: 4, pick: 'near' },
    { cols: 3, rows: 3, show: 3500, choices: 4, pick: 'near', altered: true },
    { cols: 4, rows: 3, show: 4000, choices: 4, pick: 'near' },
    { cols: 4, rows: 3, show: 3500, choices: 4, pick: 'near', altered: true },
  ];
  static maxLevel = ArtGame.levels.length;
  static ROUNDS = 2;
  // 일의 양 = 보기 수. Lv3 (3개) 4.8초, Lv8 (4개) 5.4초. Lv1·2 는 host 가 EASY_TIME 을 곱한다
  static questionTime = { base: 3, per: 0.6 };
  static lastPalette = null;

  // 소개 그림: ① 그림을 잘 봐 두기 → ② 노란 칸에 있던 조각 고르기 (Lv1 의 1×2 손 그림)
  static diagram() {
    const at = (svg, x, y, w, h) => svg.replace('<svg ', `<svg x="${x}" y="${y}" width="${w}" height="${h}" `);
    const backRect = (x, y, size, target) => (target
      ? `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="3" fill="#ffd23f" stroke="#b8860b" stroke-width="3"/><text x="${x + size / 2}" y="${y + size / 2 + 1}" text-anchor="middle" dominant-baseline="middle" font-family="Nunito" font-weight="900" font-size="30" fill="#5a4000">?</text>`
      : `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="3" fill="#34456b"/>`);
    // 보기 조각: 회색 테두리, 정답(right)은 초록 테두리
    const choice = (tile, x, y, right) => at(pictureSvg('p12', tile), x, y, 44, 44) +
      `<rect x="${x - 2}" y="${y - 2}" width="48" height="48" rx="5" fill="none" stroke="${right ? '#22a06b' : '#c9c4b8'}" stroke-width="${right ? 4 : 2}"/>`;
    return [
      { svg: Diagram.svg('0 0 176 140', at(pictureSvg('p12'), 18, 30, 140, 70)), caption: '그림을 잘 봐 두기' },
      { svg: Diagram.svg('0 0 176 140', backRect(40, 8, 46, true) + backRect(90, 8, 46) + choice(1, 36, 82) + choice(0, 96, 82, true) + Diagram.tap(118, 104)), caption: '노란 칸에 있던 조각 고르기' },
    ];
  }

  /** @param {import('../../../js/games/host.js').GameHost} host */
  constructor(host) {
    this.host = host;
    this.spec = ArtGame.levels[host.level - 1];
    this.answered = 0;
    this.correct = 0;
    this.phase = Phase.SHOW;
    this.pic = ArtGame.newPicture(this.spec);
    this.asked = [];
  }

  // 바로 앞 판과 색 묶음이 다른 그림 (?seed=N 이면 그 그림)
  static newPicture({ cols, rows, calm }) {
    const forced = Number(new URLSearchParams(location.search).get('seed'));
    if (forced) return makePicture(cols, rows, forced, { calm });
    let pic;
    for (let tries = 0; tries < 10; tries++) {
      pic = makePicture(cols, rows, 1 + Util.randomBelow(1e6), { calm });
      if (pic.palette !== ArtGame.lastPalette) break;
    }
    ArtGame.lastPalette = pic.palette;
    return pic;
  }

  start() {
    const { stage, level } = this.host;
    this.message = Util.element('div', 'stage-msg', '');
    const { body, dots } = Util.frame(stage, `${ArtGame.title} · Lv.${level}`, this.message, ArtGame.ROUNDS);
    this.body = body;
    this.progress = dots;
    this.media = matchMedia(PHONE);
    this.onMedia = () => this.render();
    this.media.addEventListener('change', this.onMedia);
    this.body.addEventListener('pointerdown', (event) => {
      const button = event.target.closest('.art-choice');
      if (button) this.pick(button.dataset.choice);
    });
    // 그림 보기: 보기 자리는 점선 칸으로 비워 둔다
    this.state = { pic: this.pic, mode: 'study', choices: Array(this.spec.choices).fill(0) };
    this.render();
    Util.say(this.message, '그림을 잘 보세요', 'look');
    Progress.current(this.progress, 0);
    this.host.sfx(Sfx.BLINK);
    this.host.after(this.spec.show, () => this.flip());
  }

  render() {
    this.body.innerHTML = '';
    this.state.layout = this.media.matches ? 'phone' : 'same';
    this.wrap = drawBoard(this.body, this.state);
  }

  // 칸을 왼쪽 위부터 대각선 차례로 뒤집고, 다 뒤집히면 첫 문제
  flip() {
    this.wrap.classList.add('flipped');
    const diagonals = this.spec.cols + this.spec.rows - 1;
    this.host.after((diagonals - 1) * FLIP_STEP + FLIP_MS + 120, () => this.ask());
  }

  // 묻는 칸과 보기를 고른다. 앞 문제의 칸은 다시 묻지 않는다
  question() {
    const { cols, rows, choices, pick, altered } = this.spec;
    const tiles = [...Array(cols * rows).keys()];
    const pool = tiles.filter((tile) => !this.asked.includes(tile));
    const target = pool[Util.randomBelow(pool.length)];
    const near = (tile) => Math.abs((tile % cols) - (target % cols)) <= 1 && Math.abs(Math.floor(tile / cols) - Math.floor(target / cols)) <= 1;
    const others = tiles.filter((tile) => tile !== target);
    const preferred = pick === 'near' ? others.filter(near) : pick === 'far' ? others.filter((tile) => !near(tile)) : others;
    const order = [...Util.shuffle(preferred), ...Util.shuffle(others.filter((tile) => !preferred.includes(tile)))];
    const wrong = order.slice(0, choices - 1 - (altered ? 1 : 0));
    // 바꾼 조각(작은 무늬 하나의 모양을 바꾼 것)은 반은 정답에서, 반은 오답 칸에서 만든다. 늘 정답에서 만들면
    // '닮은 두 조각 가운데 하나가 정답'이라 기억 없이도 반반으로 맞힌다. 오답에서도 만들면 닮은 쌍이 정답을 알려 주지 않는다.
    // 작은 무늬가 있는 칸만 바꿀 수 있다. 바꿀 칸이 없으면 진짜 칸 하나를 더 넣는다
    let extra = [];
    if (altered) {
      const withAccent = new Set(this.pic.accents.map((accent) => accent.tile));
      const decoys = wrong.filter((tile) => withAccent.has(tile));
      const fromTarget = withAccent.has(target) && (!decoys.length || Math.random() < 0.5);
      if (fromTarget) extra = [`${target}*`];
      else if (decoys.length) extra = [`${decoys[Util.randomBelow(decoys.length)]}*`];
      else extra = order.slice(wrong.length, wrong.length + 1);
    }
    return { target, choices: Util.shuffle([target, ...wrong, ...extra]) };
  }

  ask() {
    const { target, choices } = this.question();
    this.asked.push(target);
    this.state = { pic: this.pic, mode: 'ask', target, choices };
    this.render();
    Util.say(this.message, '노란 칸에 있던 조각을 고르세요', 'act');
    Progress.current(this.progress, this.answered);
    this.phase = Phase.INPUT;
    this.host.question({ seed: this.pic.seed, grid: [this.spec.cols, this.spec.rows], n: this.answered + 1, target, choices });
    this.host.timer(choices.length, () => this.pick(null));
  }

  // choice = 누른 보기 ('5' 또는 '5*'), null 이면 시간 초과
  pick(choice) {
    if (this.phase !== Phase.INPUT) return;
    this.phase = Phase.WAIT;
    this.host.stopTimer();
    const { target } = this.state;
    const picked = choice == null ? null : choiceOf(choice);
    const ok = picked != null && picked.tile === target && !picked.alter;
    // 보기는 숫자 칸 번호 또는 '5*' 문자열이다 (board.js 가 picked 와 같은지 비교한다)
    const original = this.state.choices.find((one) => String(one) === choice);
    this.host.answer({ choice, correct: ok, timedOut: choice == null, altered: picked?.alter || false });
    this.state = { ...this.state, mode: ok ? 'right' : 'wrong', picked: original };
    this.render();
    if (ok) {
      this.correct++;
      Util.say(this.message, '맞았어요!', 'good');
      this.host.award(pointsPer(this.host, ArtGame.ROUNDS), this.body.querySelector('.art-choice.right'));
      this.host.sfx(Sfx.GOOD);
    } else {
      Util.say(this.message, choice == null ? '시간 초과 · 이 조각이었어요' : '이 조각이었어요', 'bad');
      this.host.sfx(Sfx.BAD);
    }
    Progress.mark(this.progress, this.answered, ok);
    this.answered++;
    this.host.after(ok ? RIGHT_MS : WRONG_MS, () => (this.answered >= ArtGame.ROUNDS ? this.finish() : this.ask()));
  }

  finish() {
    this.phase = Phase.END;
    this.cleanup();
    this.host.done(this.result());
  }

  cleanup() {
    this.media?.removeEventListener('change', this.onMedia);
    this.body?.artFit?.disconnect();
  }

  result() {
    return resultOf(this.correct, ArtGame.ROUNDS);
  }

  // 점수는 맞힐 때마다 바로 주므로 중단될 때 따로 줄 것이 없다
  abort() {
    this.phase = Phase.END;
    this.cleanup();
    return abortedResult(this.correct, this.answered);
  }
}
