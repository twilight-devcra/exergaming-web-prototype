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
  const rows = fs.readFileSync(path.join(__dirname, 'data/nikl-vocab.tsv'), 'utf8').split(/\r?\n/).slice(1).map((l) => l.split('\t'));
  const nouns = new Set(rows.filter((r) => r[2] === '명').map((r) => (r[1] || '').replace(/\d+$/, '')));
  const lex = new Set(fs.readFileSync(path.join(__dirname, '.cache/lexicon.txt'), 'utf8').split('\n').filter(Boolean));
  for (const r of rows) if (r[1]) lex.add(r[1].replace(/\d+$/, ''));

  const fill = (w, at, s) => w.slice(0, at) + s + w.slice(at + 1);
  const errs = [];
  BLANK_BANK.forEach((lv, li) => {
    const L = BlankGame.levels[li];
    if (new Set(lv.map((q) => q[2])).size < BlankGame.ROUNDS) errs.push(`Lv${li + 1}: 답 글자가 ${BlankGame.ROUNDS}종보다 적다`);
    for (const [words, at, a, wrong] of lv) {
      const tag = `Lv${li + 1} ${words.join('·')}`;
      if (words.length !== L.words) errs.push(`${tag}: 낱말 수 ${words.length} ≠ ${L.words}`);
      if (wrong.length + 1 !== L.opts) errs.push(`${tag}: 보기 수 ${wrong.length + 1} ≠ ${L.opts}`);
      if (new Set([a, ...wrong]).size !== wrong.length + 1) errs.push(`${tag}: 보기에 같은 글자`);
      words.forEach((w, i) => {
        if (w[at[i]] !== a) errs.push(`${tag}: ${w} 의 ${at[i]}번 글자가 ${a} 가 아니다`);
        if (!nouns.has(w)) errs.push(`${tag}: ${w} 는 문제 낱말 목록에 없다`);
      });
      for (const d of wrong) {
        if (words.every((w, i) => lex.has(fill(w, at[i], d)))) errs.push(`${tag}: 오답 ${d} 도 모든 빈칸에 맞는다 (${words.map((w, i) => fill(w, at[i], d)).join(' ')})`);
      }
    }
  });
  const n = BLANK_BANK.reduce((s, lv) => s + lv.length, 0);
  if (errs.length) { console.log(`문제 ${n}개 중 오류 ${errs.length}개`); errs.slice(0, 40).forEach((e) => console.log('  ' + e)); process.exitCode = 1; }
  else console.log(`문제 ${n}개 모두 통과 (레벨별 ${BLANK_BANK.map((lv) => lv.length).join(' · ')})`);
})();
