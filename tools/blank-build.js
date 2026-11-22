// '같은 글자 넣기'(js/games/blank.js)의 문제 묶음(js/games/blank-bank.js)을 만든다.
// 실행: node tools/blank-build.js [레벨마다 문제 수=160] [씨앗=1]   (Node 18+, 처음 한 번은 낱말 사전 약 210MB 를 내려받는다)
//
// 문제: 낱말 몇 개에서 같은 글자 하나씩을 빈칸으로 만들고, 보기 가운데 모든 빈칸에 들어맞는 글자를 고른다.
//   예) 바□ · □리 → 다 (바다, 다리)
//
// 낱말 목록은 두 가지다.
//   문제 낱말 — 국립국어원 「한국어 학습용 어휘 목록」(2003)의 명사. tools/data/nikl-vocab.tsv
//     공공누리 제1유형(출처 표시). 등급 A(가장 쉬움)·B·C 로 레벨을 나눈다.
//   거르는 사전 — 오답 보기가 우연히 모든 빈칸에 맞는 일(답이 둘)을 막는 데만 쓴다. 품사를 가리지 않는다
//     (가□ 에 '다'를 넣은 '가다'도 낱말로 볼 테니까). 게임에는 들어가지 않고, 만든 문제만 들어간다.
//     · hunspell-dict-ko (맞춤법 검사기 낱말 자료, GPL-3 / 낱말 자료 일부 CC BY-SA) — 약 5만 낱말
//     · 영어 위키낱말사전의 한국어 낱말 (kaikki.org 추출본, CC BY-SA) — 약 3만 낱말. 외래어(테이블 등)를 채운다
//     · 문제 낱말 목록의 모든 품사
//     내려받은 원본과 뽑아낸 목록은 tools/.cache/ 에 두고 저장소에는 넣지 않는다.
//
// 오답 보기는 흔한 글자 가운데서 고른다. 거르는 사전으로 보아 빈칸 하나 이상에 맞지 않아야 한다.
//   함정 — 빈칸 하나만 빼고 모두 아는 낱말(문제 낱말 목록의 모든 품사)이 되는 오답. 마지막 낱말까지 확인해야 걸러진다.
//   혼자 풀리는 빈칸 — 어느 오답도 아는 낱말로 맞지 않는 빈칸. 그 낱말 하나만 보고 답을 알 수 있다.
//
// 레벨 값은 게임 파일(js/games/blank.js)의 static levels 에서 읽는다. 레벨을 고치면 이 스크립트를 다시 돌린다.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Readable } = require('stream');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(__dirname, '.cache');
const PER_LEVEL = Number(process.argv[2] || 160);
let seed = Number(process.argv[3] || 1);
const USER_AGENT = 'exergame-blank-build/0.1';
const SOURCES = {
  hunspell: 'https://raw.githubusercontent.com/spellcheck-ko/hunspell-dict-ko/master/dict-ko-data.yaml',
  kaikki: 'https://kaikki.org/dictionary/Korean/kaikki.org-dictionary-Korean.jsonl',
};

// 레벨 값은 게임 파일의 static levels 를 읽는다 (설명은 그 파일 머리 주석). 게임 모듈은 브라우저용이라 전역 몇 개를 빈 껍데기로 채운다
globalThis.document = { documentElement: { dataset: {} }, querySelector: () => null, createElement: () => ({}) };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.location = { pathname: '/', search: '', hash: '', hostname: 'localhost' };
const BANK_FILE = path.join(ROOT, 'js/games/blank-bank.js');
async function loadLevels() {
  // 게임 파일이 묶음을 불러오므로, 묶음이 아직 없으면 빈 묶음을 먼저 둔다
  if (!fs.existsSync(BANK_FILE)) fs.writeFileSync(BANK_FILE, 'export const BLANK_BANK = [];\n');
  const { BlankGame } = await import(require('url').pathToFileURL(path.join(ROOT, 'js/games/blank.js')));
  return BlankGame.levels;
}

const HANGUL = /^[가-힣]+$/;
const random = () => { // mulberry32
  seed = (seed + 0x6d2b79f5) | 0;
  let state = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  state = (state + Math.imul(state ^ (state >>> 7), 61 | state)) ^ state;
  return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
};
const shuffle = (list) => {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
};

async function download(url, file) {
  if (fs.existsSync(file)) return;
  console.log(`내려받는 중: ${url}`);
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  await new Promise((resolve, reject) => Readable.fromWeb(response.body).pipe(fs.createWriteStream(file)).on('finish', resolve).on('error', reject));
}

// 거르는 사전: 낱말 한 줄에 하나 (tools/.cache/lexicon.txt). 없으면 원본을 내려받아 만든다
async function lexicon(niklAll) {
  const out = path.join(CACHE, 'lexicon.txt');
  if (!fs.existsSync(out)) {
    fs.mkdirSync(CACHE, { recursive: true });
    const hunspellFile = path.join(CACHE, 'hunspell-dict-ko-data.yaml');
    const kaikkiFile = path.join(CACHE, 'kaikki-korean.jsonl');
    await download(SOURCES.hunspell, hunspellFile);
    await download(SOURCES.kaikki, kaikkiFile);
    const words = new Set();
    // hunspell: '- pos: 명사' 다음 줄 '  word: 바다'. 조사·특수 항목은 낱말이 아니므로 뺀다
    let partOfSpeech = null;
    for (const line of fs.readFileSync(hunspellFile, 'utf8').split('\n')) {
      let match = line.match(/pos: (\S+)/);
      if (match) partOfSpeech = match[1];
      match = line.match(/word: (\S+)/);
      if (match && partOfSpeech !== '조사' && !partOfSpeech.startsWith('특수') && HANGUL.test(match[1])) words.add(match[1]);
    }
    // kaikki: 낱말 조각(음절·접사·어근·조사)은 뺀다
    const SKIP = new Set(['syllable', 'suffix', 'prefix', 'root', 'particle', 'affix', 'character', 'symbol', 'postp']);
    const lines = readline.createInterface({ input: fs.createReadStream(kaikkiFile, 'utf8'), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      if (entry.lang_code === 'ko' && HANGUL.test(entry.word || '') && !SKIP.has(entry.pos)) words.add(entry.word);
    }
    fs.writeFileSync(out, [...words].sort().join('\n') + '\n');
  }
  const dictionary = new Set(fs.readFileSync(out, 'utf8').split('\n').filter(Boolean));
  for (const word of niklAll) dictionary.add(word);
  return dictionary;
}

// 문제 낱말 목록: 순위 · 단어(뒤의 숫자는 동음이의어 번호) · 품사 · 풀이(한자) · 등급
function readNikl() {
  const rows = fs.readFileSync(path.join(__dirname, 'data/nikl-vocab.tsv'), 'utf8').split(/\r?\n/).slice(1)
    .map((line) => line.split('\t')).filter((row) => row.length >= 5 && row[1]);
  const all = new Set();
  const nouns = new Map(); // 낱말 → 가장 쉬운 등급
  const rank = new Map(); // 낱말 → 빈도 순위 (작을수록 자주 쓰는 말. 동음이의어는 가장 높은 순위)
  for (const row of rows) {
    const word = row[1].replace(/\d+$/, '');
    if (!HANGUL.test(word)) continue;
    all.add(word);
    const grade = row[4].trim();
    if (row[2] !== '명' || !'ABC'.includes(grade) || !grade) continue;
    // 외래어는 풀이 칸에 원어가 적혀 있다. 커피·버스처럼 흔한 것은 두고, 영문 약자(PC, PD)만 뺀다
    if (/^[A-Z]{2,}$/.test(row[3].trim()) && word !== '티브이') continue;
    if (!nouns.has(word) || grade < nouns.get(word)) nouns.set(word, grade);
    if (!rank.has(word) || +row[0] < rank.get(word)) rank.set(word, +row[0]);
  }
  return { all, nouns, rank };
}

// 게임에 내지 않을 낱말 (어르신 대상 게임에 어울리지 않는 것). 검토하며 늘린다
// 줄여 쓴 외래어(미스, 프로, 타입)도 여기에 둔다
const BLOCK = new Set(['미스', '프로', '타입', '죽음', '시체', '자살', '살인', '범죄', '범인', '전쟁', '폭력', '사망', '장례', '장례식', '암', '병', '환자', '술집', '도둑', '거짓말', '쓰레기', '똥', '오줌', '이혼']);

// 낱말 하나만 내는 단계(Lv1)에서 뺄 낱말: 자주 쓰지만 가리키는 것이 없는 말이라 빈칸 하나만 보고 떠올리기 어렵다
const ABSTRACT = new Set(['다음', '이번', '사이', '그때', '동안', '필요', '이제', '한번', '얼마', '이때', '모두', '조금', '그날', '제일', '나중', '보통', '지금', '처음', '얘기']);

(async () => {
  const LEVELS = await loadLevels();
  const { all: known, nouns, rank } = readNikl();
  const dictionary = await lexicon(known);
  console.log(`문제 낱말 ${nouns.size}개 · 거르는 사전 ${dictionary.size}개`);

  // 오답 보기 후보: 문제 낱말에 자주 나오는 글자
  const syllableCount = new Map();
  for (const word of nouns.keys()) for (const syllable of new Set(word)) syllableCount.set(syllable, (syllableCount.get(syllable) || 0) + 1);
  const common = [...syllableCount].filter(([, count]) => count >= 6).map(([syllable]) => syllable);

  const fill = (word, position, syllable) => word.slice(0, position) + syllable + word.slice(position + 1);
  const bank = [];
  const report = [];
  for (const [levelIndex, level] of LEVELS.entries()) {
    // 글자 → 그 글자가 한 번만 들어 있는 문제 낱말들 [{ word, position }]
    const bySyllable = new Map();
    for (const [word, grade] of nouns) {
      if (!level.grades.includes(grade) || !level.lengths.includes(word.length) || BLOCK.has(word)) continue;
      if (level.top && rank.get(word) > level.top) continue;
      if (level.words === 1 && ABSTRACT.has(word)) continue;
      for (let i = 0; i < word.length; i++) {
        const syllable = word[i];
        if (word.indexOf(syllable) !== word.lastIndexOf(syllable)) continue;
        if (!bySyllable.has(syllable)) bySyllable.set(syllable, []);
        bySyllable.get(syllable).push({ word, position: i });
      }
    }
    // 낱말 여럿을 고를 때는 서로 겹치지 않는 낱말을 찾을 여유가 있게 후보가 둘 더 있는 글자만 답으로 쓴다
    const answers = [...bySyllable].filter(([, list]) => list.length >= (level.words === 1 ? 1 : level.words + 2)).map(([syllable]) => syllable);
    const out = [];
    const seen = new Set();
    const answerUses = new Map(); // 같은 답 글자가 몰리지 않게: 답 글자 하나가 묶음에 나오는 횟수의 상한
    const cap = Math.max(3, Math.ceil((PER_LEVEL / answers.length) * 1.5));
    let tries = 0;
    while (out.length < PER_LEVEL && tries < PER_LEVEL * 400) {
      tries++;
      const answer = answers[Math.floor(random() * answers.length)];
      if ((answerUses.get(answer) || 0) >= cap) continue;
      // 서로 너무 닮지 않은 낱말: 빈칸 밖의 글자가 겹치지 않게 (학교 · 학생 처럼 같은 글자로 시작하는 둘은 피한다)
      const picks = [];
      for (const candidate of shuffle(bySyllable.get(answer))) {
        const rest = candidate.word.slice(0, candidate.position) + candidate.word.slice(candidate.position + 1);
        if (picks.some((pick) => [...rest].some((char) => pick.word.includes(char)))) continue;
        picks.push(candidate);
        if (picks.length === level.words) break;
      }
      if (picks.length < level.words) continue;
      const key = picks.map((pick) => `${pick.word}${pick.position}`).sort().join(); // 같은 낱말이라도 빈칸 자리가 다르면 다른 문제
      if (seen.has(key)) continue;

      // 오답 후보마다: 거르는 사전으로 맞는 빈칸 수(inDictionary), 아는 낱말로 맞는 빈칸 수(known)와 그 빈칸들
      const wrongOptions = [];
      for (const letter of common) {
        if (letter === answer) continue;
        const forms = picks.map((pick) => fill(pick.word, pick.position, letter));
        const inDictionary = forms.filter((form) => dictionary.has(form)).length;
        if (inDictionary >= level.words) continue; // 모든 빈칸에 맞으면 답이 둘
        if (level.clean && inDictionary > 0) continue; // 아주 쉬운 단계: 오답은 어느 빈칸에서도 사전에 있는 말이 되지 않는다
        const hits = forms.map((form) => known.has(form));
        wrongOptions.push({ letter, known: hits.filter(Boolean).length, hits });
      }
      const traps = shuffle(wrongOptions.filter((option) => option.known >= level.words - 1));
      if (traps.length < level.traps) continue;
      // 함정 다음으로는 빈칸 하나 이상에 맞는 그럴듯한 오답을, 그다음은 아무 흔한 글자를 쓴다
      // 함정이 없는 단계(Lv1)는 어느 빈칸에도 맞지 않는 오답만 쓴다 — 낱말 하나만 보고도 풀린다
      const plausible = level.traps ? shuffle(wrongOptions.filter((option) => option.known >= 1 && option.known < level.words - 1)) : [];
      if (!level.traps) traps.length = 0;
      const rest = shuffle(wrongOptions.filter((option) => option.known === 0));
      const chosen = [];
      const take = (list, limit) => { for (const option of list) { if (chosen.length >= limit) break; if (!chosen.includes(option)) chosen.push(option); } };
      take(traps, level.traps);
      // 혼자 풀리는 빈칸을 줄이도록: 아직 아무 오답도 맞지 않는 빈칸을 맞추는 후보를 먼저
      while (chosen.length < level.optionCount - 1) {
        const unmatched = picks.map((_, i) => !chosen.some((option) => option.hits[i]));
        const pool = [...plausible, ...traps].filter((option) => !chosen.includes(option));
        const best = pool.find((option) => option.hits.some((hit, i) => hit && unmatched[i]));
        if (best) chosen.push(best);
        else if (pool.length) chosen.push(pool[0]);
        else if (rest.length) chosen.push(rest.shift());
        else break;
      }
      if (chosen.length < level.optionCount - 1) continue;
      const solo = picks.filter((_, i) => !chosen.some((option) => option.hits[i])).length;
      if (solo > level.solo) continue;
      seen.add(key);
      answerUses.set(answer, (answerUses.get(answer) || 0) + 1);
      out.push({
        words: picks.map((pick) => pick.word), positions: picks.map((pick) => pick.position), answer, wrong: chosen.map((option) => option.letter), solo,
        traps: level.words > 1 ? chosen.filter((option) => option.known >= level.words - 1).length : 0, // 낱말이 하나면 함정이 없다
      });
    }
    report.push(`Lv${levelIndex + 1}: ${out.length}문제 (시도 ${tries}, 답 글자 ${answers.length}종)`);
    bank.push(out);
  }

  // 게임용 묶음: 레벨마다 [낱말들, 빈칸 자리, 답, 오답들]
  const rows = bank.map((levelQuestions) => '  [\n' + levelQuestions.map((question) => `    [${JSON.stringify(question.words)}, ${JSON.stringify(question.positions)}, '${question.answer}', ${JSON.stringify(question.wrong)}],`).join('\n') + '\n  ],').join('\n');
  const head = `// 이 파일은 node tools/blank-build.js 가 만듭니다. 직접 고치지 마세요.
// 같은 글자 넣기(js/games/blank.js)의 문제 묶음. 레벨마다 [낱말들, 빈칸 자리(음절 번호), 답 글자, 오답 글자들].
// 문제 낱말: 국립국어원 「한국어 학습용 어휘 목록」(2003), 공공누리 제1유형.
`;
  fs.writeFileSync(BANK_FILE, `${head}export const BLANK_BANK = [\n${rows}\n];\n`);
  console.log(report.join('\n'));

  // 레벨마다 예시 몇 개
  for (const [levelIndex, levelQuestions] of bank.entries()) {
    console.log(`\nLv${levelIndex + 1} 예시`);
    for (const question of levelQuestions.slice(0, 5)) {
      const shown = question.words.map((word, i) => word.slice(0, question.positions[i]) + '□' + word.slice(question.positions[i] + 1)).join(' · ');
      console.log(`  ${shown.padEnd(28)} 답 ${question.answer} · 오답 ${question.wrong.join(' ')}   (${question.words.join(' ')} · 함정 ${question.traps} · 혼자 풀림 ${question.solo})`);
    }
  }
})().catch((error) => { console.error(error); process.exit(1); });
