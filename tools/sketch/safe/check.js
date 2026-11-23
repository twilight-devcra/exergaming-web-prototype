// 금고 열기 — 손으로 쓴 문제를 모두 확인한다: node tools/sketch/safe/check.js
// 단서의 답이 꼭 하나인지(0–9 를 모두 넣어 봄), 숫자가 겹치지 않는지, 암호 표가 6줄을 넘지 않는지, 암호 자릿수가 레벨표와 같은지.
import { problemsOf, statementsOf } from './logic.js';
import { LEVELS, PUZZLES } from './puzzles.js';

let bad = 0;
for (const [level, puzzles] of Object.entries(PUZZLES)) {
  const spec = LEVELS[level - 1];
  puzzles.forEach((puzzle, i) => {
    const problems = problemsOf(puzzle, { codeLength: spec.code });
    const hidden = Object.keys(puzzle.hidden || {}).length;
    if (statementsOf(puzzle).length !== spec.key) problems.push(`암호 표 ${statementsOf(puzzle).length}줄 (레벨은 ${spec.key}줄)`);
    if (hidden !== spec.hidden) problems.push(`숨은 그림 ${hidden}개 (레벨은 ${spec.hidden}개)`);
    bad += problems.length ? 1 : 0;
    console.log(`Lv${level} #${i + 1}  ${problems.length ? `✗ ${problems.join(' · ')}` : '✓'}${puzzle.kind ? `  ${puzzle.kind}` : ''}`);
  });
}
console.log(bad ? `\n문제 ${bad}개에 잘못이 있습니다` : '\n모든 문제가 맞습니다');
process.exit(bad ? 1 : 0);
