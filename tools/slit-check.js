// 물고기 엿보기 문제 확인: node tools/slit-check.js [문제 수]
// 레벨마다 여러 문제를 만들어 본다:
//   보기 수가 레벨표와 같은지, 보기 물고기가 모두 다른지 (그린 svg 로 견준다)
//   보기마다 바탕에서 바꾼 특징이 하나뿐이고 보기끼리 서로 다른 특징인지 — 그래서 보기끼리는 꼭 두 군데가 다르고,
//     '나머지와 가장 많이 닮은 보기' 로 정답을 짐작할 수 없다
//   바꾼 특징이 레벨의 차이 크기(big · small · mixed)에 맞는지, 날씬한 몸에서 눈을 바꾸지 않았는지
//   모든 특징 값이 레벨의 복잡도에서 쓰는 값인지
// 그리고 레벨마다 제한 시간(볼 횟수에서 셈한 초)과 정답 자리가 고르게 나오는지 적는다.
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
globalThis.document = { documentElement: { dataset: {} }, querySelector: () => null, createElement: () => ({}) };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.location = { pathname: '/', search: '', hash: '', hostname: 'localhost' };

(async () => {
  const { SlitGame } = await import(pathToFileURL(path.join(ROOT, 'js/games/slit.js')));
  const { fishQuestion, fishMarkup, FEATURES } = await import(pathToFileURL(path.join(ROOT, 'js/games/slit-fish.js')));
  const plain = (svg) => svg.replace(/id="[^"]+"/g, 'id="c"').replace(/url\(#[^)]+\)/g, 'url(#c)'); // clipPath id 는 그릴 때마다 달라서 지우고 견준다
  const count = Number(process.argv[2]) || 2000;
  let bad = 0;
  const fail = (level, seed, message) => {
    if (bad++ < 20) console.log(`  ✗ Lv${level} seed ${seed}: ${message}`);
  };
  SlitGame.levels.forEach((spec, index) => {
    const level = index + 1;
    const answerSpots = Array(spec.choices).fill(0);
    for (let seed = 1; seed <= count; seed++) {
      const question = fishQuestion(seed * 104729, spec);
      const { choices, answerIndex } = question;
      if (choices.length !== spec.choices) fail(level, seed, `보기 ${choices.length}개`);
      answerSpots[answerIndex]++;
      const drawings = choices.map((choice) => plain(fishMarkup(choice.fish)));
      if (new Set(drawings).size !== drawings.length) fail(level, seed, '같은 그림의 보기가 있다');
      for (const choice of choices) {
        for (const [key, feature] of Object.entries(FEATURES)) {
          if (!feature.values[spec.complexity].includes(choice.fish[key])) fail(level, seed, `${key}=${choice.fish[key]} 은 복잡도 ${spec.complexity} 의 값이 아니다`);
        }
      }
      // 보기끼리 다른 특징: 둘씩 견주면 꼭 두 군데 (저마다 바탕에서 한 군데씩).
      // 한 보기가 다른 모든 보기와 공통으로 다른 특징 = 그 보기가 바꾼 특징 (보기가 셋 이상일 때 하나로 정해진다)
      const differing = (i, j) => Object.keys(FEATURES).filter((key) => choices[i].fish[key] !== choices[j].fish[key]);
      const own = choices.map(() => null);
      for (let i = 0; i < choices.length; i++) {
        let common = null;
        for (let j = 0; j < choices.length; j++) {
          if (i === j) continue;
          const keys = differing(i, j);
          if (i < j && keys.length !== 2) fail(level, seed, `보기 ${i}·${j} 가 ${keys.length} 군데 다르다 (${keys})`);
          common = common ? common.filter((key) => keys.includes(key)) : keys;
        }
        own[i] = common;
      }
      choices.forEach((choice, i) => {
        const key = Object.keys(FEATURES).find((one) => choice.change.startsWith(`${FEATURES[one].name}:`));
        if (!key) return fail(level, seed, `바꾼 곳을 모른다: ${choice.change}`);
        if (choices.length > 2 && !(own[i].length === 1 && own[i][0] === key)) fail(level, seed, `보기 ${i} 의 바꾼 곳이 맞지 않다 (${own[i]} ≠ ${key})`);
        if (spec.change !== 'mixed' && FEATURES[key].size !== spec.change) fail(level, seed, `${spec.change} 레벨에서 ${key} 를 바꿨다`);
        if (key === 'eye' && choice.fish.body === 'torpedo') fail(level, seed, '날씬한 몸에서 눈을 바꿨다');
      });
    }
    const spread = answerSpots.map((spot) => `${Math.round((spot / count) * 100)}%`).join(' ');
    console.log(`Lv${level}: 문제 ${count} · 보기 ${spec.choices} · 제한 시간 ${SlitGame.timeLimit(spec).toFixed(1)}초 (${spec.looks}번) · 정답 자리 ${spread}`);
  });
  console.log(bad ? `잘못 ${bad}건` : '잘못 없음');
  process.exit(bad ? 1 : 0);
})();
