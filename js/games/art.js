// 그림 조각 기억하기
// 추상화 한 장을 잠깐 보여 준 뒤 칸이 왼쪽 위부터 대각선 차례로 뒤집힌다. 노란 칸(?)에 있던 조각을 보기에서 고른다.
// 한 판에 문제 2개, 같은 그림. 첫 답 뒤에는 모든 칸이 다시 덮이고 다른 칸을 묻는다 (그림을 다시 보여 주지 않는다).
// 그림은 판마다 새로 만든다 (art-picture.js, 바로 앞 판과 다른 색 묶음). 설계와 검토 기록: docs/games/drafts/art.md
//   cols    — 그림의 가로 칸 수
//   rows    — 그림의 세로 칸 수
//   show    — 그림을 보여 주는 시간 (ms)
//   choices — 보기 수
//   pick    — 오답 칸 고르기: far = 묻는 칸과 붙어 있지 않은 칸 · near = 붙어 있는 칸 (대각선 포함) · any = 아무 칸.
//             모자라면 나머지 칸에서 채운다
//   calm    — 차분한 그림: 작은 무늬 없이 큰 모양 몇 개가 이웃한 두 칸에 반씩 걸친다 (낮은 단계)
//   altered — 오답 하나는 어느 조각의 작은 무늬 하나를 모양이 다른 짝으로 바꾼 것. 정답에서도 오답 칸에서도 만든다:
//             늘 정답에서 만들면 '닮은 두 조각 가운데 하나가 정답' 이라 기억 없이 반반으로 맞힌다
import { Util } from '../config.js';
import { Diagram } from '../diagram.js';
import { Sfx } from '../sfx.js';
import { Tag } from './tags.js';
import { Phase, Progress, pointsPer, resultOf, abortedResult } from './kit.js';
import { makePicture, pictureSvg, INTRO_PICTURE } from './art-picture.js';

const FLIP_STEP = 90;      // 대각선 하나마다 늦게 뒤집히는 시간 (style.css 의 .art-flip 과 같다)
const FLIP_MS = 320;       // 칸 하나가 도는 시간 (style.css)
const RIGHT_MS = 900;      // 맞힌 뒤 다음으로 넘어가기까지
const WRONG_MS = 1400;     // 틀렸을 때 정답을 보여 주는 시간
const STACK_RATIO = 1.5;   // 판 자리의 너비 ÷ 높이가 이보다 작으면 그림 아래에 보기를 한 줄로 (휴대폰)
const TILE_MAX = 200;      // 칸 크기의 끝 (px). 1×2 그림이 넓은 판에서 지나치게 커지지 않게
const CHOICE_GAP = 12;     // 보기 사이 간격 (style.css 의 .art-choices 와 같다)
const PHONE_CHOICE_MAX = 110;

// 보기: 칸 번호(수) 또는 '5*' (5번 칸에서 작은 무늬 하나를 바꾼 조각)
const choiceOf = (choice) => ({ tile: parseInt(choice, 10), alter: String(choice).endsWith('*') });
const backFace = (target) => `<div class="art-back${target ? ' target' : ''}">${target ? '<span>?</span>' : ''}</div>`;

// 묻는 칸과 보기를 고른다 (화면과 상관없음). asked = 앞 문제에서 물은 칸
export function artQuestion(spec, pic, asked = []) {
  const { cols, rows, choices, pick, altered } = spec;
  const below = Util.randomBelow;
  const shuffle = (list) => Util.shuffle([...list]);
  const tiles = [...Array(cols * rows).keys()];
  const pool = tiles.filter((tile) => !asked.includes(tile));
  const target = pool[below(pool.length)];
  const near = (tile) => Math.abs((tile % cols) - (target % cols)) <= 1 && Math.abs(Math.floor(tile / cols) - Math.floor(target / cols)) <= 1;
  const others = tiles.filter((tile) => tile !== target);
  const preferred = pick === 'near' ? others.filter(near) : pick === 'far' ? others.filter((tile) => !near(tile)) : others;
  const order = [...shuffle(preferred), ...shuffle(others.filter((tile) => !preferred.includes(tile)))];
  const wrong = order.slice(0, choices - 1 - (altered ? 1 : 0));
  // 작은 무늬가 있는 칸만 바꿀 수 있다. 정답과 오답 칸 가운데 바꿀 수 있는 것이 없으면 진짜 칸 하나를 더 넣는다
  let extra = [];
  if (altered) {
    const withAccent = new Set(pic.accents.map((accent) => accent.tile));
    const decoys = wrong.filter((tile) => withAccent.has(tile));
    const fromTarget = withAccent.has(target) && (!decoys.length || Math.random() < 0.5);
    if (fromTarget) extra = [`${target}*`];
    else if (decoys.length) extra = [`${decoys[below(decoys.length)]}*`];
    else extra = order.slice(wrong.length, wrong.length + 1);
  }
  return { target, choices: shuffle([target, ...wrong, ...extra]) };
}

export class ArtGame {
  static id = 'art';
  static tags = [Tag.MEMORY];
  static title = '그림 조각 기억하기';
  static hint = '그림을 잘 봐 두었다가<br>칸이 뒤집히면 노란 칸에 있던 조각을 고르세요';
  static levels = [
    // 차분한 그림: 1×2 → 2×2 → 2×3
    { cols: 2, rows: 1, show: 5000, choices: 2, pick: 'any', calm: true },
    { cols: 2, rows: 2, show: 4500, choices: 2, pick: 'far', calm: true },
    { cols: 3, rows: 2, show: 4000, choices: 3, pick: 'any', calm: true },
    // 같은 2×3 에 보통 그림 (색종이 여러 장, 가로지르는 선, 작은 무늬). 스케치에서 차분한 2×3 다음 바로 3×3 은 너무 가팔랐다
    { cols: 3, rows: 2, show: 4000, choices: 3, pick: 'far' },
    { cols: 3, rows: 3, show: 3500, choices: 4, pick: 'near' },
    { cols: 3, rows: 3, show: 3500, choices: 4, pick: 'near', altered: true },
    { cols: 4, rows: 3, show: 4000, choices: 4, pick: 'near' },
    { cols: 4, rows: 3, show: 3500, choices: 4, pick: 'near', altered: true },
  ];
  static maxLevel = ArtGame.levels.length;
  static ROUNDS = 2;
  static lastPalette = null;

  // 소개 그림 (모든 레벨 같음): ① 그림을 잘 봐 두기 → ② 노란 칸에 있던 조각 고르기 (1×2 손 그림)
  static diagram() {
    const place = (svg, x, y, width, height) => svg.replace('<svg ', `<svg x="${x}" y="${y}" width="${width}" height="${height}" `);
    const back = (x, y, size, target) => (target
      ? `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="3" fill="#ffd23f" stroke="#b8860b" stroke-width="3"/>` +
        `<text x="${x + size / 2}" y="${y + size / 2 + 1}" text-anchor="middle" dominant-baseline="middle" font-family="Nunito" font-weight="900" font-size="30" fill="#5a4000">?</text>`
      : `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="3" fill="#34456b"/>`);
    // 보기 조각: 회색 테두리, 정답(right)은 초록 테두리
    const choice = (tile, x, y, right) => place(pictureSvg(INTRO_PICTURE, tile), x, y, 44, 44) +
      `<rect x="${x - 2}" y="${y - 2}" width="48" height="48" rx="5" fill="none" stroke="${right ? '#22a06b' : '#c9c4b8'}" stroke-width="${right ? 4 : 2}"/>`;
    return [
      { svg: Diagram.svg('0 0 176 140', place(pictureSvg(INTRO_PICTURE), 18, 30, 140, 70)), caption: '그림을 잘 봐 두기' },
      { svg: Diagram.svg('0 0 176 140', back(40, 8, 46, true) + back(90, 8, 46) + choice(1, 36, 82) + choice(0, 96, 82, true) + Diagram.tap(118, 104)), caption: '노란 칸에 있던 조각 고르기' },
    ];
  }

  /** @param {import('./host.js').GameHost} host */
  constructor(host) {
    this.host = host;
    this.spec = ArtGame.levels[host.level - 1];
    this.answered = 0;
    this.correct = 0;
    this.phase = Phase.SHOW;
    this.pic = ArtGame.newPicture(this.spec);
    this.asked = [];
  }

  // 바로 앞 판과 색 묶음이 다른 그림
  static newPicture({ cols, rows, calm }) {
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
    this.body.addEventListener('pointerdown', (event) => {
      const button = event.target.closest('.art-choice');
      if (button) this.pick(button.dataset.choice);
    });
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.body);
    // 그림 보기: 보기 자리는 점선 칸으로 비워 둔다 (보기가 나올 때 그림이 옮겨 다니지 않고, 어디에 나올지 미리 보인다)
    this.state = { mode: 'study', choices: Array(this.spec.choices).fill(0) };
    this.render();
    Util.say(this.message, '그림을 잘 보세요', 'look');
    Progress.current(this.progress, 0);
    this.host.sfx(Sfx.BLINK);
    this.host.after(this.spec.show, () => this.flip());
  }

  // state.mode — study 그림 보기 (칸마다 앞면·뒷면을 겹쳐 두고 flipped 로 뒤집는다) · ask 노란 칸 + 보기 · right · wrong (정답 표시)
  render() {
    const { pic } = this;
    const { cols, rows } = pic;
    const { mode, target, choices, picked } = this.state;
    const done = mode === 'right' || mode === 'wrong';
    this.wrap = Util.element('div', `art-board mode-${mode}`);
    const picture = Util.element('div', 'art-pic');
    picture.style.setProperty('--cols', cols);
    picture.style.setProperty('--rows', rows);
    for (let i = 0; i < cols * rows; i++) {
      const cell = Util.element('div', 'art-tile');
      if (mode === 'study') {
        const diagonal = (i % cols) + Math.floor(i / cols);
        cell.innerHTML = `<div class="art-flip" style="--d: ${diagonal}"><div class="art-front">${pictureSvg(pic, i)}</div>${backFace()}</div>`;
      } else if (done && i === target) {
        cell.innerHTML = pictureSvg(pic, i); // 맞든 틀리든 노란 칸이 도로 뒤집혀 제 조각을 보여 준다
        cell.classList.add('shown', mode);
      } else cell.innerHTML = backFace(i === target);
      picture.append(cell);
    }
    const row = Util.element('div', 'art-choices');
    row.style.setProperty('--k', choices.length);
    if (mode === 'study') for (let i = 0; i < choices.length; i++) row.append(Util.element('div', 'art-slot'));
    else {
      for (const choice of choices) {
        const { tile, alter } = choiceOf(choice);
        const button = Util.element('button', 'art-choice', pictureSvg(pic, tile, alter));
        button.dataset.choice = choice;
        const right = tile === target && !alter;
        if (done && right) button.classList.add('right');
        if (done && choice === picked && !right) button.classList.add('wrong');
        if (done && (right || choice === picked)) button.append(Util.element('i', 'art-mark', right ? '✓' : '✕'));
        row.append(button);
      }
    }
    this.wrap.append(picture, row);
    this.body.replaceChildren(this.wrap);
    this.layout();
  }

  // 판 자리를 재어 칸(--t)과 보기(--c) 크기를 정한다.
  // 넓은 판: 그림 | 칸과 같은 크기의 보기 (2개까지 한 줄, 3~4개는 2×2). 좁고 긴 판(휴대폰): 그림 아래에 보기 한 줄
  layout() {
    const width = this.body.clientWidth;
    const height = this.body.clientHeight;
    if (!width || !height || !this.wrap) return;
    const { cols, rows } = this.pic;
    const count = this.state.choices.length;
    const stacked = width / height < STACK_RATIO;
    this.wrap.classList.toggle('stacked', stacked);
    const gap = Util.gapOf(this.wrap, stacked ? 20 : 48);
    let tile;
    let choice;
    if (stacked) {
      choice = Math.min(PHONE_CHOICE_MAX, Math.floor((width - (count - 1) * CHOICE_GAP) / count));
      tile = Math.min(TILE_MAX, Math.floor(width / cols), Math.floor((height - choice - gap) / rows));
    } else {
      const perRow = count <= 2 ? count : 2;
      const lines = Math.ceil(count / perRow);
      tile = Math.min(TILE_MAX, Math.floor(height / rows), Math.floor((height - (lines - 1) * CHOICE_GAP) / lines),
        Math.floor((width - gap - (perRow - 1) * CHOICE_GAP) / (cols + perRow)));
      choice = tile;
    }
    this.wrap.style.setProperty('--t', `${tile}px`);
    this.wrap.style.setProperty('--c', `${choice}px`);
  }

  // 칸을 왼쪽 위부터 대각선 차례로 뒤집고, 다 뒤집히면 첫 문제
  flip() {
    if (this.phase === Phase.END) return;
    this.wrap.classList.add('flipped');
    const diagonals = this.spec.cols + this.spec.rows - 1;
    this.host.after((diagonals - 1) * FLIP_STEP + FLIP_MS + 120, () => this.ask());
  }

  ask() {
    if (this.phase === Phase.END) return;
    const { target, choices } = artQuestion(this.spec, this.pic, this.asked);
    this.asked.push(target);
    this.state = { mode: 'ask', target, choices };
    this.render();
    Util.say(this.message, '노란 칸에 있던 조각을 고르세요', 'act');
    Progress.current(this.progress, this.answered);
    this.phase = Phase.INPUT;
    // 다시 그리기용으로 그림 전체(svg)와 바꾼 조각(svg)을 함께 남긴다
    const altered = choices.find((choice) => choiceOf(choice).alter);
    this.host.question({
      grid: [this.spec.cols, this.spec.rows], nth: this.answered + 1, target, choices,
      seed: this.pic.seed, calm: !!this.spec.calm, picture: pictureSvg(this.pic),
      ...(altered ? { alteredSvg: pictureSvg(this.pic, choiceOf(altered).tile, true) } : {}),
    });
    this.host.timer(choices.length, () => this.pick(null));
  }

  // choice = 누른 보기 ('5' 또는 '5*'), null 이면 시간 초과
  pick(choice) {
    if (this.phase !== Phase.INPUT) return;
    this.phase = Phase.WAIT;
    this.host.stopTimer();
    const { target, choices } = this.state;
    const picked = choice == null ? null : choiceOf(choice);
    const ok = picked != null && picked.tile === target && !picked.alter;
    const original = choices.find((one) => String(one) === choice); // 보기는 수 또는 '5*' 문자열 (render 가 같은지 비교한다)
    this.host.answer({ choice: original ?? null, correct: ok, timedOut: choice == null, altered: picked?.alter || false });
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
    this.resizeObserver.disconnect();
    this.host.done(this.result());
  }

  result() {
    return resultOf(this.correct, ArtGame.ROUNDS);
  }

  // 점수는 맞힐 때마다 바로 주므로 중단될 때 따로 줄 것이 없다
  abort() {
    this.phase = Phase.END;
    this.resizeObserver?.disconnect();
    return abortedResult(this.correct, this.answered);
  }
}
