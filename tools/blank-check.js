// 같은 글자 넣기 문제 묶음(js/games/blank-bank.js) 점검 — 만든 스크립트(tools/blank-build.js)와 따로 다시 확인한다.
// 실행: node tools/blank-check.js   (tools/blank-build.js 를 한 번 돌려 tools/.cache/lexicon.txt 가 있어야 한다)
//   - 정답을 넣으면 모든 빈칸이 문제 낱말 목록의 명사가 된다
//   - 오답은 저마다 빈칸 하나 이상에서 거르는 사전에 없는 말이 된다 (답이 하나뿐)
//   - 보기에 같은 글자가 없고, 레벨의 낱말 수·보기 수와 맞는다
//   - 게임이 한 판에 쓰는 '답 글자가 서로 다른 문제 3개'를 레벨마다 고를 수 있다
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
globalThis.document = { documentElement: { dataset: {} }, querySelector: () => null, createElement: () => ({}) };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.location = { pathname: '/', search: '', hash: '', hostname: 'localhost' };

(async () => {
  const { BLANK_BANK } = await import(pathToFileURL(path.join(ROOT, 'js/games/blank-bank.js')));
  const { BlankGame } = await import(pathToFileURL(path.join(ROOT, 'js/games/blank.js')));
  const rows = fs.readFileSync(path.join(__dirname, 'data/nikl-vocab.tsv'), 'utf8').split(/\r?\n/).slice(1).map((line) => line.split('\t'));
  const nouns = new Set(rows.filter((row) => row[2] === '명').map((row) => (row[1] || '').replace(/\d+$/, '')));
  const lexicon = new Set(fs.readFileSync(path.join(__dirname, '.cache/lexicon.txt'), 'utf8').split('\n').filter(Boolean));
  for (const row of rows) if (row[1]) lexicon.add(row[1].replace(/\d+$/, ''));

  const fill = (word, position, letter) => word.slice(0, position) + letter + word.slice(position + 1);
  const errors = [];
  BLANK_BANK.forEach((levelQuestions, levelIndex) => {
    const level = BlankGame.levels[levelIndex];
    if (new Set(levelQuestions.map((question) => question[2])).size < BlankGame.ROUNDS) errors.push(`Lv${levelIndex + 1}: 답 글자가 ${BlankGame.ROUNDS}종보다 적다`);
    for (const [words, positions, answer, wrong] of levelQuestions) {
      const tag = `Lv${levelIndex + 1} ${words.join('·')}`;
      if (words.length !== level.words) errors.push(`${tag}: 낱말 수 ${words.length} ≠ ${level.words}`);
      if (wrong.length + 1 !== level.optionCount) errors.push(`${tag}: 보기 수 ${wrong.length + 1} ≠ ${level.optionCount}`);
      if (new Set([answer, ...wrong]).size !== wrong.length + 1) errors.push(`${tag}: 보기에 같은 글자`);
      words.forEach((word, i) => {
        if (word[positions[i]] !== answer) errors.push(`${tag}: ${word} 의 ${positions[i]}번 글자가 ${answer} 가 아니다`);
        if (!nouns.has(word)) errors.push(`${tag}: ${word} 는 문제 낱말 목록에 없다`);
      });
      for (const wrongLetter of wrong) {
        if (words.every((word, i) => lexicon.has(fill(word, positions[i], wrongLetter)))) errors.push(`${tag}: 오답 ${wrongLetter} 도 모든 빈칸에 맞는다 (${words.map((word, i) => fill(word, positions[i], wrongLetter)).join(' ')})`);
      }
    }
  });
  const total = BLANK_BANK.reduce((sum, levelQuestions) => sum + levelQuestions.length, 0);
  if (errors.length) { console.log(`문제 ${total}개 중 오류 ${errors.length}개`); errors.slice(0, 40).forEach((error) => console.log('  ' + error)); process.exitCode = 1; }
  else console.log(`문제 ${total}개 모두 통과 (레벨별 ${BLANK_BANK.map((levelQuestions) => levelQuestions.length).join(' · ')})`);
})();
