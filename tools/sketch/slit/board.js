// 물고기 엿보기 — 판 그리기. 목업(index.html)과 눌러 보는 스케치(slit-game.js)가 같이 쓴다. 설계 카드: docs/games/drafts/slit.md
// drawBoard(body, state) 가 상태 하나를 그리고 판(wrap)을 돌려준다. 물고기는 moveFish(wrap, progress) 로 옮긴다.
//   level     — 레벨 (fish.js LEVELS: 틈 너비)
//   question  — fish.js levelQuestion 의 문제 ({ choices: [{ school, change }], answerIndex })
//   layout    — below 넓은 판 (태블릿): 띠를 가운데 위에, 보기 한 줄을 아래에
//               phone 좁고 긴 판 (휴대폰): 띠는 판 너비를 다 쓰고, 보기 2×2 를 아래에
//   progress  — 물고기가 틈을 지나간 정도 (0 = 막 들어옴, 1 = 다 지나감)
//   mode      — watch 지나가는 중 · right 맞음 · wrong 틀림 (둘 다 가림막이 걷혀 물고기 전체가 띠 가운데에 보인다)
//   picked    — 누른 보기 번호 (wrong 일 때)
// 크기는 판 자리를 재어 정한다 (ResizeObserver): --f 띠 속 물고기 높이 · --c 보기 속 물고기 높이 (px)
import { Util } from '../sketch.js';
import { fishMarkup, FISH_WIDTH, LEVELS } from './fish.js';

const FISH_RATIO = FISH_WIDTH / 100;   // 물고기 그림의 너비 ÷ 높이
const BAND_PAD = 1.3;                  // 띠 = 물고기보다 1.3배 (위아래 여백, 양옆은 벽)
const CARD_PAD = 8;                    // 보기 안쪽 여백 (px, slit.css 의 .sl-choice padding)
const GAP = 12;                        // 보기 사이 (slit.css)
const BAND_GAP = { below: 24, phone: 16 }; // 띠와 보기 사이 (slit.css)
const FISH_MAX = 150;                  // 띠 속 물고기 높이의 끝 (px)
export const STACK_RATIO = 1.5;        // 판 자리의 너비 ÷ 높이가 이보다 작으면 휴대폰 배치

const fishSvg = (fish) => `<svg viewBox="0 0 ${FISH_WIDTH} 100">${fishMarkup(fish)}</svg>`;
export const layoutFor = (width, height) => (width / height < STACK_RATIO ? 'phone' : 'below');

export function drawBoard(body, state) {
  const { level, question, layout, progress = 0, mode = 'watch', picked = null } = state;
  const done = mode !== 'watch';
  const wrap = Util.element('div', `sl-board layout-${layout} mode-${mode}`);
  const answer = question.choices[question.answerIndex];

  const band = Util.element('div', 'sl-band');
  // 물고기는 띠 크기의 svg 안에서 움직인다 (띠 밖으로 나간 부분은 svg 가 자른다)
  band.innerHTML = `<svg class="sl-scene"><svg class="sl-fish" viewBox="0 0 ${FISH_WIDTH} 100">${fishMarkup(answer.school[0])}</svg></svg>` +
    '<div class="sl-wall left"></div><div class="sl-wall right"></div><div class="sl-slit"></div>';

  const choices = Util.element('div', 'sl-choices');
  question.choices.forEach((choice, i) => {
    const button = Util.element('button', 'sl-choice', fishSvg(choice.school[0]));
    button.dataset.choice = i;
    const right = i === question.answerIndex;
    const wrongPick = mode === 'wrong' && i === picked;
    if (done && right) button.classList.add('right');
    if (wrongPick) button.classList.add('wrong');
    if ((done && right) || wrongPick) button.append(Util.element('i', 'sl-mark', right ? '✓' : '✕'));
    choices.append(button);
  });
  wrap.append(band, choices);
  body.replaceChildren(wrap);

  wrap.slit = { slitFraction: LEVELS[level - 1].slit, progress: done ? null : progress, fish: 0 };
  const fit = () => {
    const width = body.clientWidth;
    const height = body.clientHeight;
    if (!width || !height) return;
    const { fish, card } = sizes(layout, width, height, question.choices.length);
    wrap.style.setProperty('--f', `${fish}px`);
    wrap.style.setProperty('--c', `${card}px`);
    wrap.slit.fish = fish;
    placeFish(wrap);
  };
  body.slFit?.disconnect();
  body.slFit = new ResizeObserver(fit);
  body.slFit.observe(body);
  fit();
  return wrap;
}

// 물고기를 옮긴다 (지나가는 동안 프레임마다). progress = null 이면 띠 가운데
export function moveFish(wrap, progress) {
  wrap.slit.progress = progress;
  placeFish(wrap);
}

// 판 자리 width × height 에 들어가는 가장 큰 크기. fish = 띠 속 물고기 높이, card = 보기 속 물고기 높이 (px)
function sizes(layout, width, height, count) {
  if (layout === 'below') {
    // 보기 속 물고기 = 띠 속의 0.75배. 높이: 띠 + 간격 + 보기 · 너비: 보기 count 개 한 줄, 그리고 띠
    const ratio = 0.75;
    const byWidth = (width - (count - 1) * GAP - count * 2 * CARD_PAD) / (count * FISH_RATIO * ratio);
    const byHeight = (height - BAND_GAP.below - 2 * CARD_PAD) / (BAND_PAD + ratio);
    const fish = Math.floor(Math.min(FISH_MAX, byWidth, byHeight, width / (FISH_RATIO * BAND_PAD)));
    return { fish, card: Math.floor(fish * ratio) };
  }
  // 휴대폰: 띠는 판 너비를 다 쓰고 남은 높이에 보기 2열 (2개면 1줄, 3~4개면 2줄)
  const columns = Math.min(2, count);
  const rows = Math.ceil(count / columns);
  const cardFor = (bandFish) => Math.floor(Math.min(
    (width - (columns - 1) * GAP) / columns / FISH_RATIO - (2 * CARD_PAD) / FISH_RATIO,
    (height - bandFish * BAND_PAD - BAND_GAP.phone - (rows - 1) * GAP) / rows - 2 * CARD_PAD,
  ));
  let fish = Math.floor(Math.min(FISH_MAX, width / (FISH_RATIO * BAND_PAD)));
  // 보기가 띠 속 물고기의 0.6배보다 작아지면 띠를 줄여 보기에 높이를 넘긴다
  while (cardFor(fish) < fish * 0.6 && fish > 40) fish -= 2;
  return { fish, card: cardFor(fish) };
}

// 띠 안에서 물고기와 틈의 자리 (px)
function placeFish(wrap) {
  const { fish, slitFraction, progress } = wrap.slit;
  if (!fish) return;
  const band = wrap.querySelector('.sl-band');
  const bandWidth = fish * FISH_RATIO * BAND_PAD;
  const fishWidth = fish * FISH_RATIO;
  const slitWidth = Math.max(6, slitFraction * fishWidth);
  const slitLeft = (bandWidth - slitWidth) / 2;
  const fishLeft = progress == null ? (bandWidth - fishWidth) / 2 : slitLeft + slitWidth - progress * (slitWidth + fishWidth);
  const fishElement = band.querySelector('.sl-fish');
  fishElement.setAttribute('x', fishLeft.toFixed(1));
  fishElement.setAttribute('y', (fish * 0.15).toFixed(1));
  fishElement.setAttribute('width', fishWidth);
  fishElement.setAttribute('height', fish);
  band.querySelector('.sl-wall.left').style.width = `${slitLeft}px`;
  band.querySelector('.sl-wall.right').style.left = `${slitLeft + slitWidth}px`;
  const slit = band.querySelector('.sl-slit');
  slit.style.left = `${slitLeft}px`;
  slit.style.width = `${slitWidth}px`;
}

// 목업용: 멈춰 있는 제한 시간 막대 (left = 남은 몫)
export function staticTimer(message, left) {
  message.append(Util.element('div', `qtimer on${left < 0.4 ? ' warn' : ''}`, `<i style="transform: scaleX(${left})"></i>`));
}
