// 그림 조각 기억하기 생성기 확인: node tools/art-check.js [판 수]
// 레벨마다 여러 판의 그림과 문제 두 개를 만들어 본다:
//   그림 — 칸이 저마다 다른 그림이 나왔는지 (만들기에 실패해 대신 쓴 그림이 아닌지), 칸 수가 레벨표와 같은지
//   문제 — 보기 수가 레벨표와 같은지, 같은 보기가 둘이 아닌지, 정답 칸이 보기에 있는지, 둘째 문제가 첫째와 다른 칸을 묻는지
//   바꾼 조각 — altered 레벨에만 꼭 하나, 작은 무늬가 있는 칸에서 만들고, 바꾼 그림이 그 칸의 원래 그림과 다른지.
//               정답에서 만든 몫도 적는다 (늘 정답에서 만들면 닮은 두 조각 가운데 하나가 정답이라는 지름길이 생긴다)
// 그리고 그림 하나를 만드는 데 걸린 가장 긴 시간을 적는다.
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
globalThis.document = { documentElement: { dataset: {} }, querySelector: () => null, createElement: () => ({}) };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.location = { pathname: '/', search: '', hash: '', hostname: 'localhost' };

(async () => {
  const { ArtGame, artQuestion } = await import(pathToFileURL(path.join(ROOT, 'js/games/art.js')));
  const { pictureSvg } = await import(pathToFileURL(path.join(ROOT, 'js/games/art-picture.js')));
  const plain = (svg) => svg.replace(/art\d+-/g, 'p-'); // 무늬 id 머리말은 svg 마다 달라서 지우고 비교한다
  const count = Number(process.argv[2]) || 500;
  let bad = 0;
  ArtGame.levels.forEach((spec, index) => {
    let slowest = 0;
    let altered = 0;
    let fromTarget = 0;
    for (let i = 0; i < count; i++) {
      const started = performance.now();
      const pic = ArtGame.newPicture(spec);
      slowest = Math.max(slowest, performance.now() - started);
      const problems = [];
      if (pic.failed) problems.push('칸이 겹치는 그림');
      if (pic.cols !== spec.cols || pic.rows !== spec.rows) problems.push('칸 수');
      const asked = [];
      for (let round = 0; round < ArtGame.ROUNDS; round++) {
        const { target, choices } = artQuestion(spec, pic, asked);
        const keys = choices.map(String);
        if (asked.includes(target)) problems.push('같은 칸을 다시 물음');
        asked.push(target);
        if (choices.length !== spec.choices) problems.push(`보기 ${choices.length}개`);
        if (new Set(keys).size !== keys.length) problems.push('같은 보기');
        if (!choices.includes(target)) problems.push('정답이 보기에 없음');
        const marked = keys.filter((key) => key.endsWith('*'));
        if (!spec.altered && marked.length) problems.push('바꾼 조각이 나옴');
        if (marked.length > 1) problems.push('바꾼 조각이 둘');
        for (const key of marked) {
          const tile = parseInt(key, 10);
          altered++;
          if (tile === target) fromTarget++;
          if (!pic.accents.some((accent) => accent.tile === tile)) problems.push('무늬 없는 칸을 바꿈');
          if (plain(pictureSvg(pic, tile, true)) === plain(pictureSvg(pic, tile))) problems.push('바꾼 그림이 같음');
        }
      }
      if (problems.length) {
        bad++;
        if (bad <= 5) console.log(`Lv${index + 1} ✗ ${[...new Set(problems)].join(' · ')} (씨앗 ${pic.seed})`);
      }
    }
    const share = altered ? `  바꾼 조각 ${altered}번 · 정답에서 ${Math.round((100 * fromTarget) / altered)}%` : '';
    console.log(`Lv${index + 1}  ${spec.cols}×${spec.rows}${spec.calm ? ' 차분한 그림' : ''}  ${count}판  가장 오래 ${slowest.toFixed(1)}ms${share}`);
  });
  console.log(bad ? `\n잘못된 판 ${bad}` : '\n모든 판이 맞습니다');
  process.exit(bad ? 1 : 0);
})();
