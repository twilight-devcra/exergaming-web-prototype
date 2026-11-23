// 금고 열기 생성기 확인: node tools/safe-check.js [판 수]
// 레벨마다 여러 판을 만들어, 단서를 만족하는 답이 꼭 하나인지(0–9 를 모두 넣어 봄), 표의 줄 수·숨은 그림 수·암호 자릿수가 레벨표와 같은지,
// 숫자 줄의 위아래 숫자가 이어지지 않는지, 같은 그림이 붙어 나오지 않는지 보고, 단서 종류가 고루 나오는지와 한 판을 만드는 데 걸린 시간을 적는다.
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
globalThis.document = { documentElement: { dataset: {} }, querySelector: () => null, createElement: () => ({}) };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.location = { pathname: '/', search: '', hash: '', hostname: 'localhost' };

(async () => {
  const { SafeGame, SafeRules } = await import(pathToFileURL(path.join(ROOT, 'js/games/safe.js')));
  const count = Number(process.argv[2]) || 500;
  let bad = 0;
  SafeGame.levels.forEach((spec, index) => {
    const kinds = {};
    let slowest = 0;
    for (let i = 0; i < count; i++) {
      const started = performance.now();
      const puzzle = SafeGame.generate(spec);
      slowest = Math.max(slowest, performance.now() - started);
      const problems = SafeRules.problemsOf(puzzle);
      const rows = SafeRules.rowsOf(puzzle).length;
      if (rows !== spec.key) problems.push(`표 ${rows}줄`);
      if (Object.keys(puzzle.hidden).length !== spec.hidden) problems.push('숨은 그림 수');
      if (puzzle.code.length !== spec.code) problems.push('암호 자릿수');
      if (puzzle.code.some((id, slot) => slot > 0 && puzzle.code[slot - 1] === id)) problems.push('같은 그림이 붙음');
      if (puzzle.known.some(([, digit], row) => row > 0 && Math.abs(puzzle.known[row - 1][1] - digit) === 1)) problems.push('위아래 숫자가 이어짐');
      if (problems.length) {
        bad++;
        if (bad <= 5) console.log(`Lv${index + 1} ✗ ${problems.join(' · ')}`, JSON.stringify(puzzle));
      }
      if (puzzle.kind) kinds[puzzle.kind] = (kinds[puzzle.kind] || 0) + 1;
    }
    const spread = Object.entries(kinds).map(([kind, times]) => `${kind} ${times}`).join(' · ');
    console.log(`Lv${index + 1}  ${count}판  가장 오래 ${slowest.toFixed(1)}ms${spread ? `  ${spread}` : ''}`);
  });
  console.log(bad ? `\n잘못된 판 ${bad}` : '\n모든 판이 맞습니다');
  process.exit(bad ? 1 : 0);
})();
