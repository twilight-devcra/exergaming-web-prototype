// 물고기 엿보기 — 스케치가 쓰는 물고기와 문제. 생성기는 앱의 js/games/slit-fish.js 를 그대로 다시 내보낸다
// (옮기기 전의 스케치 생성기와 8,000문제를 견주어 같았다). 설계 카드: docs/games/drafts/slit.md
// 여기에만 있는 것: 물고기 떼(fish.html 의 '물고기 수') · 스케치 모양의 문제 ({ choices: [{ school, change }], answerIndex })
import { FEATURES, FISH_WIDTH, nameOf, makeRandom, randomFish, changeableFeatures, changedFish, fishMarkup, fishQuestion } from '../../../js/games/slit-fish.js';
import { SlitGame } from '../../../js/games/slit.js';

export { FEATURES, FISH_WIDTH, BODIES, nameOf, makeRandom, randomFish, fishMarkup } from '../../../js/games/slit-fish.js';

export const LEVELS = SlitGame.levels;

// ---------- 물고기 떼 (fish.html) ----------
const SCHOOL_GAP = 16;
export const schoolWidth = (school) => school.length * FISH_WIDTH + (school.length - 1) * SCHOOL_GAP;
export const schoolSvg = (school, heightPx) => {
  const width = schoolWidth(school);
  const fishGroups = school.map((fish, i) => `<g transform="translate(${i * (FISH_WIDTH + SCHOOL_GAP)},0)">${fishMarkup(fish)}</g>`).join('');
  return `<svg viewBox="0 0 ${width} 100" width="${(width * heightPx) / 100}" height="${heightPx}">${fishGroups}</svg>`;
};

// 바탕 떼 (보이지 않는다). 보기마다 물고기 하나의 특징 하나를 바꾸고, (물고기, 특징) 짝은 보기끼리 모두 다르다
export const makeQuestion = (seed, complexity, changeSize, schoolSize, choiceCount) => {
  const random = makeRandom(seed);
  const base = Array.from({ length: schoolSize }, () => randomFish(random, complexity));
  const slots = [];
  base.forEach((fish, fishIndex) => {
    for (const key of changeableFeatures(fish, complexity, changeSize)) slots.push({ fishIndex, key });
  });
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const choices = slots.slice(0, choiceCount).map(({ fishIndex, key }) => {
    const school = base.map((fish) => ({ ...fish }));
    const before = school[fishIndex][key];
    school[fishIndex] = changedFish(school[fishIndex], key, random, complexity);
    const fishLabel = schoolSize > 1 ? `${fishIndex + 1}번째 물고기 ` : '';
    return { school, change: `${fishLabel}${FEATURES[key].name}: ${nameOf(before)} → ${nameOf(school[fishIndex][key])}` };
  });
  return { choices, answerIndex: Math.floor(random() * choices.length) };
};

// 레벨의 문제 하나 (물고기 한 마리), 스케치 모양으로
export const levelQuestion = (level, seed) => {
  const question = fishQuestion(seed, LEVELS[level - 1]);
  return { answerIndex: question.answerIndex, choices: question.choices.map(({ fish, change }) => ({ school: [fish], change })) };
};
