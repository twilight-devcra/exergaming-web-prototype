// 물고기 엿보기의 물고기와 문제 (js/games/slit.js). 설계와 검토 기록: docs/games/drafts/slit.md
// 물고기 = 몸 모양 · 꼬리 · 등지느러미 · 무늬(종류·개수) · 배지느러미 · 눈 · 입 · 아가미 선. 복잡도(1~3)가 높을수록 쓰는 특징과 값이 많다.
// 문제: 보이지 않는 바탕 물고기에서 저마다 다른 특징 하나씩을 바꾼 보기들. 그 가운데 하나가 틈으로 지나간다.
// 보기가 모두 바탕에서 한 군데씩만 다르므로, 보기끼리 견주어 '나머지와 가장 많이 닮은 것' 을 골라서는 정답을 알 수 없다.
// 스케치(tools/sketch/slit/fish.js)가 이 파일을 다시 내보낸다.

// ---------- 씨앗이 있는 난수 (같은 씨앗이면 같은 문제) ----------
export const makeRandom = (seed) => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let mixed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
};
const pickFrom = (random, list) => list[Math.floor(random() * list.length)];

// ---------- 특징 ----------
// 특징마다 복잡도별로 쓰는 값, 이름, 바꾸면 큰 차이(부분의 종류)인지 작은 차이(개수·작은 부분)인지
export const FEATURES = {
  body:    { name: '몸 모양', size: 'big', values: { 1: ['torpedo', 'round', 'box'], 2: ['torpedo', 'round', 'box', 'diamond'], 3: ['torpedo', 'round', 'box', 'diamond', 'hump'] } },
  tail:    { name: '꼬리', size: 'big', values: { 1: ['forked', 'fan', 'round'], 2: ['forked', 'fan', 'round', 'pointed'], 3: ['forked', 'fan', 'round', 'pointed'] } },
  dorsal:  { name: '등지느러미', size: 'big', values: { 1: ['none', 'sail'], 2: ['none', 'sail', 'spikes', 'ridge'], 3: ['none', 'sail', 'spikes', 'ridge'] } },
  pattern: { name: '무늬 종류', size: 'big', values: { 1: ['none', 'stripes'], 2: ['none', 'stripes', 'diamonds', 'band'], 3: ['none', 'stripes', 'diamonds', 'band', 'chevrons'] } },
  count:   { name: '무늬 개수', size: 'small', values: { 1: [1, 2], 2: [1, 2, 3], 3: [1, 2, 3, 4] } },
  ventral: { name: '배지느러미', size: 'small', values: { 1: ['none'], 2: ['none', 'one', 'two'], 3: ['none', 'one', 'two'] } },
  eye:     { name: '눈', size: 'small', values: { 1: ['dot'], 2: ['dot'], 3: ['dot', 'ring'] } },
  mouth:   { name: '입', size: 'small', values: { 1: ['closed'], 2: ['closed'], 3: ['closed', 'open'] } },
  gill:    { name: '아가미 선', size: 'small', values: { 1: ['none'], 2: ['none'], 3: ['none', 'line'] } },
};
const VALUE_NAMES = {
  torpedo: '날씬', round: '둥긂', box: '상자', diamond: '마름모', hump: '혹 머리', forked: '갈래', fan: '부채', pointed: '뾰족', sail: '돛', spikes: '가시', ridge: '긴 둔덕',
  none: '없음', stripes: '세로 줄', diamonds: '다이아', band: '가로 띠', chevrons: '꺾쇠', one: '하나', two: '둘', dot: '점 눈', ring: '큰 눈', closed: '다문 입', open: '벌린 입', line: '있음',
};
export const nameOf = (value) => VALUE_NAMES[value] ?? String(value);
const hasCount = (fish) => ['stripes', 'diamonds', 'chevrons'].includes(fish.pattern);

export const randomFish = (random, complexity) => {
  const fish = {};
  for (const [key, feature] of Object.entries(FEATURES)) fish[key] = pickFrom(random, feature.values[complexity]);
  return fish;
};

// 이 물고기에서 바꿀 수 있는 특징 (차이 크기에 맞는 것만). 값이 하나뿐인 특징은 바꿀 수 없다
export const changeableFeatures = (fish, complexity, changeSize) => Object.entries(FEATURES)
  .filter(([key, feature]) => feature.values[complexity].length > 1)
  .filter(([key]) => key !== 'count' || hasCount(fish))
  .filter(([key]) => key !== 'eye' || fish.body !== 'torpedo') // 날씬한 몸은 머리가 가늘어 큰 눈·점 눈이 잘 갈리지 않는다
  .filter(([, feature]) => changeSize === 'mixed' || feature.size === changeSize)
  .map(([key]) => key);

export const changedFish = (fish, key, random, complexity) => {
  const options = FEATURES[key].values[complexity].filter((value) => value !== fish[key]);
  return { ...fish, [key]: pickFrom(random, options) };
};

// ---------- 그리기 ----------
export const FISH_WIDTH = 240;
// 몸은 비율이 아니라 윤곽이 다르다 (타원만 여럿이면 잘 갈리지 않았다). 몸마다 주둥이가 left 에 올 때의 윤곽과
// 지느러미·눈·아가미 자리. halfLength · halfHeight 는 무늬를 놓는 데도 쓴다.
//   top · bottom — 등지느러미·배지느러미가 붙는 y      dorsalShift — 등지느러미를 몸 가운데에서 옮기는 만큼
//   eye          — [주둥이에서 x, y]                    gillHalf    — 아가미 선 높이의 반
export const BODIES = {
  torpedo: { halfLength: 94, halfHeight: 18, top: 32, bottom: 68, dorsalShift: 0, eye: [22, 45], gillHalf: 9,
    outline: (left, right, centerX) => `M${left},50 Q${centerX},14 ${right},50 Q${centerX},86 ${left},50 Z` },
  round: { halfLength: 44, halfHeight: 36, top: 14, bottom: 86, dorsalShift: 0, eye: [20, 40], gillHalf: 24,
    outline: (left, right, centerX) => `M${left},50 a44,36 0 1,0 88,0 a44,36 0 1,0 -88,0 Z` },
  diamond: { halfLength: 60, halfHeight: 36, top: 16, bottom: 84, dorsalShift: -6, eye: [24, 44], gillHalf: 16,
    outline: (left, right, centerX) => `M${left},50 Q${left + 4},46 ${centerX - 10},16 Q${centerX - 6},12 ${centerX - 2},16 Q${right - 8},44 ${right},50 Q${right - 8},56 ${centerX - 2},84 Q${centerX - 6},88 ${centerX - 10},84 Q${left + 4},54 ${left},50 Z` },
  box: { halfLength: 60, halfHeight: 26, top: 24, bottom: 76, dorsalShift: 0, eye: [18, 40], gillHalf: 18,
    outline: (left, right) => `M${left + 14},24 H${right - 14} Q${right},24 ${right},38 V62 Q${right},76 ${right - 14},76 H${left + 14} Q${left},76 ${left},62 V38 Q${left},24 ${left + 14},24 Z` },
  hump: { halfLength: 76, halfHeight: 26, top: 28, bottom: 76, dorsalShift: 14, eye: [20, 48], gillHalf: 20,
    outline: (left, right, centerX) => `M${left},60 C${left},30 ${left + 14},12 ${left + 40},12 C${centerX + 30},16 ${right - 12},40 ${right},50 C${right - 20},64 ${centerX},78 ${left + 30},76 C${left + 10},74 ${left},70 ${left},60 Z` },
};
// clipPath id 가 한 쪽 안에서 겹치지 않게: 쪽마다 다른 머리말 + 차례 번호 (관리 화면은 여러 문제의 svg 를 한 쪽에 늘어놓는다)
const CLIP_PREFIX = `sf${Math.random().toString(36).slice(2, 7)}`;
let clipCounter = 0;

const tailShape = (kind, tailBase) => {
  if (kind === 'forked') return `<polygon points="${tailBase},50 ${tailBase + 42},20 ${tailBase + 30},50 ${tailBase + 42},80"/>`;
  if (kind === 'fan') return `<polygon points="${tailBase},50 ${tailBase + 38},24 ${tailBase + 38},76"/>`;
  if (kind === 'round') return `<ellipse cx="${tailBase + 20}" cy="50" halfLength="22" halfHeight="20"/>`;
  return `<polygon points="${tailBase},40 ${tailBase + 46},50 ${tailBase},60"/>`;
};

const dorsalShape = (kind, centerX, top) => {
  if (kind === 'sail') return `<polygon points="${centerX - 22},${top + 4} ${centerX + 10},${top - 14} ${centerX + 24},${top + 4}"/>`;
  if (kind === 'spikes') return Array.from({ length: 4 }, (_, i) => {
    const spikeLeft = centerX - 30 + i * 15;
    return `<polygon points="${spikeLeft},${top + 4} ${spikeLeft + 7},${top - 12} ${spikeLeft + 14},${top + 4}"/>`;
  }).join('');
  if (kind === 'ridge') return `<path d="M${centerX - 44},${top + 6} Q${centerX},${top - 22} ${centerX + 44},${top + 6} Z"/>`;
  return '';
};

const ventralShape = (kind, centerX, bottom) => {
  const fin = (finX) => `<polygon points="${finX - 6},${bottom - 4} ${finX + 14},${bottom + 12} ${finX + 18},${bottom - 4}"/>`;
  if (kind === 'one') return fin(centerX);
  if (kind === 'two') return fin(centerX - 26) + fin(centerX + 14);
  return '';
};

// 무늬는 아가미 뒤(patternStartX)부터, 눈 옆에는 두지 않는다. 동그란 점 대신 다이아:
// 짙은 물고기 위의 흰 점은 눈이 하나 더 있는 것처럼 보였다
const patternMarks = (fish, centerX, halfLength, halfHeight, patternStartX) => {
  const count = fish.count;
  if (fish.pattern === 'stripes') return Array.from({ length: count }, (_, i) => `<rect x="${centerX - 8 + i * 18}" y="0" width="8" height="100"/>`).join('');
  if (fish.pattern === 'diamonds') return Array.from({ length: count }, (_, i) => {
    // 보기 크기에서도 무늬로 읽히게. 날씬한 몸은 조금 작게, 한 줄로
    const diamondHalfHeight = Math.min(9, halfHeight * 0.45); const diamondHalfWidth = diamondHalfHeight * 0.75;
    const diamondX = patternStartX + diamondHalfWidth + i * (diamondHalfWidth * 2 + 5);
    const diamondY = halfHeight < 24 ? 50 : 50 + (i % 2 ? halfHeight * 0.3 : -halfHeight * 0.3);
    return `<polygon points="${diamondX},${diamondY - diamondHalfHeight} ${diamondX + diamondHalfWidth},${diamondY} ${diamondX},${diamondY + diamondHalfHeight} ${diamondX - diamondHalfWidth},${diamondY}"/>`;
  }).join('');
  if (fish.pattern === 'band') return `<rect x="${centerX - halfLength * 0.55}" y="47" width="${halfLength * 1.6}" height="6"/>`;
  if (fish.pattern === 'chevrons') return Array.from({ length: count }, (_, i) => {
    const chevronX = centerX - 6 + i * 17;
    return `<path d="M${chevronX + 8},${50 - halfHeight * 0.6} L${chevronX},50 L${chevronX + 8},${50 + halfHeight * 0.6}" fill="none" stroke="#fff" stroke-width="4"/>`;
  }).join('');
  return '';
};

// 물고기 한 마리를 FISH_WIDTH × 100 상자 안에. 머리가 왼쪽 (왼쪽으로 헤엄친다)
export const fishMarkup = (fish) => {
  const shape = BODIES[fish.body];
  const { halfLength, halfHeight } = shape;
  const fishLength = halfLength * 2 - 4 + 46;
  const left = (FISH_WIDTH - fishLength) / 2;
  const centerX = left + halfLength;
  const tailBase = centerX + halfLength - 4;
  const body = shape.outline(left, left + halfLength * 2, centerX);
  const clipId = `${CLIP_PREFIX}-${clipCounter++}`;
  const eyeX = left + shape.eye[0]; const eyeY = shape.eye[1];
  // 눈에는 늘 짙은 눈동자가 있어, 몸의 흰 무늬가 눈으로 보이지 않는다
  const eye = fish.eye === 'ring'
    ? `<circle cx="${eyeX}" cy="${eyeY}" r="8.5" fill="#fff"/><circle cx="${eyeX - 1.5}" cy="${eyeY}" r="4" fill="currentColor"/>`
    : `<circle cx="${eyeX}" cy="${eyeY}" r="5.5" fill="#fff"/><circle cx="${eyeX - 1}" cy="${eyeY}" r="2.4" fill="currentColor"/>`;
  const patternStartX = Math.max(centerX - 14, eyeX + 24);
  const mouthY = fish.body === 'hump' ? 60 : 50;
  const mouth = fish.mouth === 'open' ? `<polygon points="${left - 2},${mouthY - 5} ${left + 14},${mouthY} ${left - 2},${mouthY + 5}" fill="#fff"/>` : '';
  const gillX = eyeX + 16;
  const gill = fish.gill === 'line' ? `<path d="M${gillX},${50 - shape.gillHalf} q10,${shape.gillHalf} 0,${shape.gillHalf * 2}" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>` : '';
  const dorsalX = centerX + shape.dorsalShift;
  return `<defs><clipPath id="${clipId}"><path d="${body}"/></clipPath></defs>` +
    `<g fill="currentColor">${tailShape(fish.tail, tailBase)}${dorsalShape(fish.dorsal, dorsalX, shape.top)}${ventralShape(fish.ventral, centerX, shape.bottom)}<path d="${body}"/></g>` +
    `<g clip-path="url(#${clipId})" fill="#fff">${patternMarks(fish, centerX, halfLength, halfHeight, patternStartX)}</g>${eye}${mouth}${gill}`;
};

// 보기에 쓰는 svg 하나 (물고기 하나, 크기는 css 가 정한다)
export const fishSvg = (fish) => `<svg viewBox="0 0 ${FISH_WIDTH} 100">${fishMarkup(fish)}</svg>`;

// 문제 하나: { choices: [{ fish, change }], answerIndex, seed }. change = 바탕에서 바꾼 곳 (기록용 글)
// 바꿀 특징이 보기 수보다 적은 바탕이면 다음 씨앗으로 다시 만든다 (모든 레벨에서 2,000번에 한 번도 모자라지 않았다)
export function fishQuestion(seed, { complexity, change, choices: choiceCount }) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const attemptSeed = seed + attempt * 7919;
    const random = makeRandom(attemptSeed);
    const base = randomFish(random, complexity);
    const keys = changeableFeatures(base, complexity, change);
    if (keys.length < choiceCount) continue;
    for (let i = keys.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    const choices = keys.slice(0, choiceCount).map((key) => {
      const fish = changedFish(base, key, random, complexity);
      return { fish, change: `${FEATURES[key].name}: ${nameOf(base[key])} → ${nameOf(fish[key])}` };
    });
    return { choices, answerIndex: Math.floor(random() * choices.length), seed: attemptSeed };
  }
  throw new Error(`바꿀 특징이 모자란다: 복잡도 ${complexity}, ${change}, 보기 ${choiceCount}`);
}
