// 미니게임 난이도 설명서(docs/games/)를 게임 코드에서 만든다: 공통 규칙과 목차(README.md), 게임마다 한 쪽(<id>.md).
// 실행: node tools/manual.js   (Node 18+)
//
// 손으로 쓴 설명서는 레벨 값을 고칠 때마다 어긋나므로, 값과 설명을 모두 코드에서 읽어 온다:
//   - 레벨별 값      — 게임의 static levels (모듈을 불러와 실제 값을 읽는다)
//   - 손잡이 설명    — 게임 파일 머리 주석의 '//   이름 — 설명' 줄 (이어지는 줄은 더 들여 쓴다)
//   - 레벨 메모      — levels 배열 안의 주석 줄 (바로 다음 레벨에 붙인다)
//   - 고정값         — 'static 대문자_이름 = 값; // 설명' 줄
//   - 제한 시간      — js/config.js 의 questionTime 과 그 위 '일의 양' 주석
//   - 능력 그래프    — js/abilities.js 의 ABILITY_WEIGHTS · ABILITY_PACE
// 그래서 설명서를 고치려면 게임 파일의 주석이나 값을 고친 뒤 이 스크립트를 다시 돌린다.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/games');

// 게임 모듈은 브라우저용이라 불러오는 순간 몇 가지 전역을 찾는다. 읽기만 하므로 빈 껍데기로 충분하다
globalThis.document = { documentElement: { dataset: {} }, querySelector: () => null, createElement: () => ({}) };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });

const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

// ---- 게임 파일 읽기 ----

// 머리 주석 (첫 import 앞의 // 줄)
function header(src) {
  const out = [];
  for (const line of src.split('\n')) {
    if (line.startsWith('import')) break;
    if (line.startsWith('//')) out.push(line);
  }
  return out;
}

// 첫 줄은 이름, 그다음 줄부터 문장이 끝나는 줄까지가 한 줄 소개 (최대 3줄)
function summary(head) {
  const out = [];
  for (const line of head.slice(1, 4)) {
    const t = line.replace(/^\/\/\s*/, '');
    if (!t) break;
    out.push(t);
    if (/[.)]$/.test(t)) break;
  }
  return out.join(' ');
}

// '//   이름 — 설명' (들여쓰기 정확히 3칸, 이름은 영문 식별자. 'a · b · c — 설명' 처럼 여럿이 한 설명을 나눠 가질 수 있다).
// 다음 줄들이 더 깊이 들여 쓰여 있으면 설명에 잇는다. 한 줄에 '… · 다른이름 — 설명' 으로 이어 적은 것은 나눈다
function knobs(head) {
  const out = [];
  const START = /^\/\/ {3}([A-Za-z]\w*(?:\s*·\s*[A-Za-z]\w*)*)\s+—\s+(.*)$/;
  let cur = null;
  for (const line of head) {
    const m = line.match(START);
    if (m) {
      cur = { names: m[1].split(/\s*·\s*/), text: m[2] };
      out.push(cur);
    } else if (cur && /^\/\/ {4,}\S/.test(line)) {
      cur.text += ` ${line.replace(/^\/\/\s+/, '')}`;
    } else {
      cur = null;
    }
  }
  // 한 줄에 여럿: 'sw — … · steps — …', 'n — …,  lines — …'
  return out.flatMap((k) => {
    const parts = k.text.split(/\s*(?:·|,)\s+(?=[A-Za-z]\w*\s+—\s)/);
    if (parts.length === 1) return [k];
    return [{ names: k.names, text: parts[0] }, ...parts.slice(1).map((p) => {
      const [, name, text] = p.match(/^([A-Za-z]\w*)\s+—\s+(.*)$/);
      return { names: [name], text };
    })];
  });
}

// levels 배열 안의 주석 줄 → 바로 다음 레벨(0 부터)의 메모
function levelNotes(src) {
  const notes = {};
  const start = src.indexOf('static levels = [');
  if (start < 0) return notes;
  const lines = src.slice(start).split('\n').slice(1);
  let i = 0;
  let pending = [];
  for (const line of lines) {
    if (/^ {2}\];/.test(line)) break;
    const t = line.trim();
    if (t.startsWith('//')) {
      pending.push(t.replace(/^\/\/\s*/, ''));
      continue;
    }
    const n = (t.match(/\{/g) || []).length;
    if (n && pending.length) notes[i] = pending.join(' ');
    if (n) pending = [];
    i += n;
  }
  return notes;
}

// 'static 대문자_이름 = 값; // 설명' — 난이도와 상관없이 고정된 값 가운데 설명이 붙은 것
function constants(src) {
  const out = [];
  for (const line of src.split('\n')) {
    const m = line.match(/^\s+static ([A-Z][A-Z0-9_]*) = (.+?);\s*\/\/\s*(.+)$/);
    if (m) out.push({ name: m[1], value: m[2], text: m[3] });
  }
  return out;
}

// js/config.js 의 '일의 양 — path: … · arith: … ' 주석 → { id: 설명 }
function loads(configSrc) {
  const line = configSrc.split('\n').find((l) => l.includes('일의 양 —'));
  if (!line) return {};
  const body = line.slice(line.indexOf('일의 양 —') + '일의 양 —'.length).trim();
  return Object.fromEntries(body.split(/\s·\s(?=[a-z]+: )/).map((p) => {
    const i = p.indexOf(':');
    return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
  }));
}

// ---- 값 적기 ----

const esc = (s) => String(s).replace(/\|/g, '\\|');
function fmt(key, v) {
  if (v === undefined) return '–';
  if (v === true) return '✓';
  if (v === false) return '–';
  if (Array.isArray(v)) {
    if (key === 'grid' && v.length === 2) return `${v[0]}×${v[1]}`;
    if (v.length === 2 && v.every((x) => typeof x === 'number')) return v[0] === v[1] ? String(v[0]) : `${v[0]}~${v[1]}`;
    return v.join(', ');
  }
  return String(v);
}

(async () => {
  const { GAME_TYPES } = await load('js/games/index.js');
  const { DEFAULT_CONFIG, EASY_TIME, BASE_LEVEL, Config } = await load('js/config.js');
  const { ABILITIES, ABILITY_WEIGHTS, ABILITY_PACE, Abilities } = await load('js/abilities.js');
  const configSrc = read('js/config.js');
  const loadText = loads(configSrc);
  const abilityName = Object.fromEntries(ABILITIES.map((a) => [a.id, a.name]));
  const LV = GAME_TYPES[0].levels.length;

  const md = [];
  const GENERATED = [
    '> 이 폴더의 문서는 `node tools/manual.js` 가 게임 코드에서 만듭니다. 직접 고치지 마세요.',
    '> 바꾸려면 게임 파일(`js/games/*.js`)의 머리 주석·`levels`·고정값 주석을 고친 뒤 스크립트를 다시 돌립니다.',
  ];
  md.push('# 미니게임 난이도 설명서');
  md.push('');
  md.push(...GENERATED);
  md.push('');
  md.push('모든 미니게임은 Lv1~8 의 난이도가 있고, 레벨마다 몇 가지 **손잡이**(난이도를 정하는 값)를 다르게 둡니다.');
  md.push('게임마다 손잡이의 뜻과 레벨별 값, 문제 수, 제한 시간, 능력 그래프에 들어가는 몫을 적었습니다.');
  md.push('');

  // ---- 공통 ----
  md.push('## 공통');
  md.push('');
  md.push(`- **레벨**: Lv1·Lv2 는 쉬운 단계(어르신용으로 나중에 더함), **Lv${BASE_LEVEL}** 가 기본 시작 레벨입니다. 쉬운 단계는 문제 제한 시간을 Lv1 ×${EASY_TIME[0]}, Lv2 ×${EASY_TIME[1]} 로 늘립니다.`);
  md.push(`- **제한 시간** = (base + per × 일의 양) 초 × 쉬운 단계 배율 × 라운드 난이도의 \`questionTimeScale\`. 입력을 받기 시작한 때부터 게임 시계로 잽니다. 게임마다 base·per 와 '일의 양' 이 무엇인지 게임 쪽에 적었습니다 (\`js/config.js\` 의 \`questionTime\`).`);
  const mults = Array.from({ length: LV }, (_, i) => `Lv${i + 1} ×${Config.levelMult(DEFAULT_CONFIG, i + 1).toFixed(2)}`);
  md.push(`- **점수 배율** (기본 설정): ${mults.join(' · ')}`);
  md.push(`- **난이도 계기판** (기본 \`adaptive\`): 모든 게임이 같이 씁니다. 정답마다 +${DEFAULT_CONFIG.diffUp}, 오답·시간 초과마다 −${DEFAULT_CONFIG.diffDown}, 다음 게임 레벨은 계기판의 정수 부분입니다. 켠 게임이 ${DEFAULT_CONFIG.diffGamesRef}종보다 많으면 두 값을 ${DEFAULT_CONFIG.diffGamesRef} / 게임 수 로 줄입니다. 운영 버전은 세션 길이·난이도로 이 값을 따로 정합니다 (\`Config.session\`).`);
  md.push(`- **능력 그래프**: 게임마다 능력 축(${ABILITIES.map((a) => a.name).join(' · ')})에 몫을 나눠 줍니다. 처리속도 몫이 있는 게임 가운데 몇은 문제당 걸린 시간으로 그 몫을 깎습니다 (느리면 최대 ×${Abilities.PACE_MIN}).`);
  md.push('- 레벨 표에서 `–` 는 그 레벨에 값을 두지 않았다는 뜻입니다 (손잡이 설명에 적힌 기본값이나 꺼짐). `a~b` 는 그 범위에서 무작위로 고른다는 뜻입니다.');
  md.push('');

  // ---- 목차 ----
  md.push('## 게임');
  md.push('');
  GAME_TYPES.forEach((T, i) => md.push(`${i + 1}. [${T.title}](${T.id}.md) — \`${T.id}\``));
  md.push('');

  // ---- 게임마다 한 쪽 ----
  // 예전에 만든 쪽 가운데 지금 게임 목록에 없는 것(이름을 바꾸거나 뺀 게임)은 지운다. 이 폴더는 통째로 이 스크립트 것이다
  fs.mkdirSync(OUT, { recursive: true });
  const pages = new Set(['README.md', ...GAME_TYPES.map((T) => `${T.id}.md`)]);
  fs.readdirSync(OUT).filter((f) => f.endsWith('.md') && !pages.has(f)).forEach((f) => fs.unlinkSync(path.join(OUT, f)));
  fs.writeFileSync(path.join(OUT, 'README.md'), md.join('\n'));

  for (const [gi, T] of GAME_TYPES.entries()) {
    const md = [];
    const file = `js/games/${T.id}.js`;
    const src = read(file);
    const head = header(src);
    const ks = knobs(head);
    const notes = levelNotes(src);
    const consts = constants(src).filter((c) => !['ROUNDS', 'QUESTIONS'].includes(c.name));
    const questions = T.ROUNDS ?? T.QUESTIONS ?? 1;
    const qt = DEFAULT_CONFIG.questionTime[T.id];
    const w = ABILITY_WEIGHTS[T.id] || {};
    const pace = ABILITY_PACE[T.id];

    const prev = GAME_TYPES[gi - 1];
    const next = GAME_TYPES[gi + 1];
    md.push(`[← 설명서 목차·공통 규칙](README.md)${prev ? ` · [← ${prev.title}](${prev.id}.md)` : ''}${next ? ` · [${next.title} →](${next.id}.md)` : ''}`);
    md.push('');
    md.push(`# ${T.title} (\`${T.id}\`)`);
    md.push('');
    md.push(...GENERATED);
    md.push('');
    md.push(summary(head));
    md.push('');
    md.push(`- 파일: [${file}](../../${file}) — 머리 주석에 왜 그렇게 정했는지가 더 있습니다`);
    md.push(`- 한 게임: 문제 ${questions}개${T.tags ? ` · 꼬리표: ${T.tags.join(', ')} (꼬리표가 겹치는 게임은 연달아 나오지 않음)` : ''}`);
    if (qt) md.push(`- 제한 시간: ${qt.base}초 + ${qt.per}초 × 일의 양${loadText[T.id] ? ` — 일의 양: ${loadText[T.id]}` : ''}`);
    md.push(`- 능력 그래프: ${Object.entries(w).map(([k, v]) => `${abilityName[k]} ${v}`).join(' · ') || '없음'}` +
      (pace ? ` (처리속도: 문제당 ${pace.fast}초 이하면 그대로, ${pace.slow}초 이상이면 ×${Abilities.PACE_MIN})` : ''));
    md.push('');

    // 손잡이 설명: 레벨에 실제로 쓰인 것 + 설명만 있는 것. 쓰인 순서는 설명 순서를 따르고, 설명이 없는 것은 뒤에
    const used = [];
    T.levels.forEach((l) => Object.keys(l).forEach((k) => !used.includes(k) && used.push(k)));
    const described = ks.flatMap((k) => k.names);
    const cols = [...described.filter((k) => used.includes(k)), ...used.filter((k) => !described.includes(k))];

    md.push('## 손잡이');
    md.push('');
    md.push('| 손잡이 | 뜻 |');
    md.push('|---|---|');
    ks.forEach((k) => md.push(`| ${k.names.map((n) => `\`${n}\``).join(' · ')} | ${esc(k.text)}${k.names.some((n) => used.includes(n)) ? '' : ' *(지금은 어느 레벨에도 두지 않음)*'} |`));
    used.filter((k) => !described.includes(k)).forEach((k) => md.push(`| \`${k}\` | *(머리 주석에 설명 없음 — 소스 참고)* |`));
    md.push('');

    md.push('## 레벨별 값');
    md.push('');
    md.push(`| Lv | ${cols.map((c) => `\`${c}\``).join(' | ')} | 메모 |`);
    md.push(`|---|${cols.map(() => '---').join('|')}|---|`);
    T.levels.forEach((l, i) => {
      const lv = i + 1 < BASE_LEVEL ? `${i + 1} (쉬움)` : String(i + 1);
      md.push(`| ${lv} | ${cols.map((c) => esc(fmt(c, l[c]))).join(' | ')} | ${esc(notes[i] || '')} |`);
    });
    md.push('');

    if (consts.length) {
      md.push('## 고정값 (모든 레벨 공통)');
      md.push('');
      md.push('| 이름 | 값 | 뜻 |');
      md.push('|---|---|---|');
      consts.forEach((c) => md.push(`| \`${c.name}\` | \`${esc(c.value)}\` | ${esc(c.text)} |`));
      md.push('');
    }
    md.push('레벨 표의 `–` 는 그 레벨에 값을 두지 않았다는 뜻(손잡이 설명에 적힌 기본값이나 꺼짐), `a~b` 는 그 범위에서 무작위로 고른다는 뜻입니다.');
    md.push('');
    fs.writeFileSync(path.join(OUT, `${T.id}.md`), md.join('\n'));
  }
  console.log(`${path.relative(ROOT, OUT)}: README.md + 게임 ${GAME_TYPES.length}쪽`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
