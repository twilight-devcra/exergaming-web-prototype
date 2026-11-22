// 미니게임 난이도 설명서(docs/games/)를 게임 코드에서 만든다: 공통 규칙과 목차(README.md), 게임마다 한 쪽(<id>.md).
// 실행: node tools/manual.js   (Node 18+)
//
// 손으로 쓴 설명서는 레벨 값을 고칠 때마다 어긋나므로, 값과 설명을 모두 코드에서 읽어 온다:
//   - 레벨별 값      — 게임의 static levels (모듈을 불러와 실제 값을 읽는다)
//   - 손잡이 설명    — 게임 파일 머리 주석의 '//   이름 — 설명' 줄 (이어지는 줄은 더 들여 쓴다)
//   - 레벨 메모      — levels 배열 안의 주석 줄 (바로 다음 레벨에 붙인다)
//   - 고정값         — 'static 대문자_이름 = 값; // 설명' 줄
//   - 제한 시간      — js/config.js 의 questionTime 과 그 위 '일의 양' 주석
//   - 두뇌 그래프    — js/abilities.js 의 DOMAIN_GAMES (게임마다 쓰는 인지 영역)
//   - 노리는 능력    — tools/targets.js (이것으로 점검표 TARGETS.md 도 만든다: 아직 노리지 않은 능력 찾기)
// 그래서 설명서를 고치려면 게임 파일의 주석이나 값을 고친 뒤 이 스크립트를 다시 돌린다.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const { DOMAINS, GAME_TARGETS, PLANNED } = require('./targets.js');
const OUT = path.join(ROOT, 'docs/games');

// 게임 모듈은 브라우저용이라 불러오는 순간 몇 가지 전역을 찾는다. 읽기만 하므로 빈 껍데기로 충분하다
globalThis.document = { documentElement: { dataset: {} }, querySelector: () => null, createElement: () => ({}) };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.location = { pathname: '/', search: '', hash: '', hostname: 'localhost' }; // js/dev-storage.js · js/config.js 가 주소를 본다

const load = (relativePath) => import(pathToFileURL(path.join(ROOT, relativePath)).href);
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8').replace(/\r\n/g, '\n');

// ---- 게임 파일 읽기 ----

// 머리 주석 (첫 import 앞의 // 줄)
function header(source) {
  const out = [];
  for (const line of source.split('\n')) {
    if (line.startsWith('import')) break;
    if (line.startsWith('//')) out.push(line);
  }
  return out;
}

// 첫 줄은 이름, 그다음 줄부터 문장이 끝나는 줄까지가 한 줄 소개 (최대 3줄)
function summary(head) {
  const out = [];
  for (const line of head.slice(1, 4)) {
    const text = line.replace(/^\/\/\s*/, '');
    if (!text) break;
    out.push(text);
    if (/[.)]$/.test(text)) break;
  }
  return out.join(' ');
}

// '//   이름 — 설명' (들여쓰기 정확히 3칸, 이름은 영문 식별자. 'a · b · c — 설명' 처럼 여럿이 한 설명을 나눠 가질 수 있다).
// 다음 줄들이 더 깊이 들여 쓰여 있으면 설명에 잇는다. 한 줄에 '… · 다른이름 — 설명' 으로 이어 적은 것은 나눈다
function knobs(head) {
  const out = [];
  const START = /^\/\/ {3}([A-Za-z]\w*(?:\s*·\s*[A-Za-z]\w*)*)\s+—\s+(.*)$/;
  let current = null;
  for (const line of head) {
    const match = line.match(START);
    if (match) {
      current = { names: match[1].split(/\s*·\s*/), text: match[2] };
      out.push(current);
    } else if (current && /^\/\/ {4,}\S/.test(line)) {
      current.text += ` ${line.replace(/^\/\/\s+/, '')}`;
    } else {
      current = null;
    }
  }
  // 한 줄에 여럿: 'sw — … · steps — …', 'n — …,  lines — …'
  return out.flatMap((knob) => {
    const parts = knob.text.split(/\s*(?:·|,)\s+(?=[A-Za-z]\w*\s+—\s)/);
    if (parts.length === 1) return [knob];
    return [{ names: knob.names, text: parts[0] }, ...parts.slice(1).map((part) => {
      const [, name, text] = part.match(/^([A-Za-z]\w*)\s+—\s+(.*)$/);
      return { names: [name], text };
    })];
  });
}

// levels 배열 안의 주석 줄 → 바로 다음 레벨(0 부터)의 메모
function levelNotes(source) {
  const notes = {};
  const start = source.indexOf('static levels = [');
  if (start < 0) return notes;
  const lines = source.slice(start).split('\n').slice(1);
  let i = 0;
  let pending = [];
  for (const line of lines) {
    if (/^ {2}\];/.test(line)) break;
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) {
      pending.push(trimmed.replace(/^\/\/\s*/, ''));
      continue;
    }
    const opened = (trimmed.match(/\{/g) || []).length; // 이 줄에서 시작한 레벨 수
    if (opened && pending.length) notes[i] = pending.join(' ');
    if (opened) pending = [];
    i += opened;
  }
  return notes;
}

// 'static 대문자_이름 = 값; // 설명' — 난이도와 상관없이 고정된 값 가운데 설명이 붙은 것
function constants(source) {
  const out = [];
  for (const line of source.split('\n')) {
    const match = line.match(/^\s+static ([A-Z][A-Z0-9_]*) = (.+?);\s*\/\/\s*(.+)$/);
    if (match) out.push({ name: match[1], value: match[2], text: match[3] });
  }
  return out;
}

// js/config.js 의 '일의 양 — path: … · arith: … ' 주석 → { id: 설명 }
function loads(configSource) {
  const line = configSource.split('\n').find((candidate) => candidate.includes('일의 양 —'));
  if (!line) return {};
  const body = line.slice(line.indexOf('일의 양 —') + '일의 양 —'.length).trim();
  return Object.fromEntries(body.split(/\s·\s(?=[a-z]+: )/).map((part) => {
    const colon = part.indexOf(':');
    return [part.slice(0, colon).trim(), part.slice(colon + 1).trim()];
  }));
}

// ---- 값 적기 ----

const escapeCell = (text) => String(text).replace(/\|/g, '\\|');
function formatValue(key, value) {
  if (value === undefined) return '–';
  if (value === true) return '✓';
  if (value === false) return '–';
  if (Array.isArray(value)) {
    if (key === 'grid' && value.length === 2) return `${value[0]}×${value[1]}`;
    if (value.length === 2 && value.every((item) => typeof item === 'number')) return value[0] === value[1] ? String(value[0]) : `${value[0]}~${value[1]}`;
    return value.join(', ');
  }
  return String(value);
}

(async () => {
  const { GAME_TYPES } = await load('js/games/index.js');
  const { DEFAULT_CONFIG, EASY_TIME, BASE_LEVEL, Config } = await load('js/config.js');
  // 결과 화면 두뇌 그래프의 영역 (tools/targets.js 의 DOMAINS 와는 다른 목록)
  const { DOMAINS: GRAPH_DOMAINS, DOMAIN_GAMES } = await load('js/abilities.js');
  const configSource = read('js/config.js');
  const loadText = loads(configSource);
  const domainName = Object.fromEntries(GRAPH_DOMAINS.map((domain) => [domain.id, domain.name]));
  const LEVEL_COUNT = GAME_TYPES[0].levels.length;

  // ---- 노리는 능력 (tools/targets.js) ----
  // '~id' 는 일부. 없는 id 를 적으면 멈춘다 (오타가 점검표에서 조용히 빠지지 않게)
  const SUBS = new Map(DOMAINS.flatMap((domain) => domain.subs.map((sub) => [sub.id, { ...sub, domain }])));
  const parseTargets = (list, who) => (list || []).map((target) => {
    const part = target.startsWith('~');
    const id = part ? target.slice(1) : target;
    if (!SUBS.has(id)) throw new Error(`tools/targets.js: ${who} 의 '${target}' — 없는 세부 영역`);
    return { id, part };
  });
  const gameTargets = Object.fromEntries(GAME_TYPES.map((Game) => [Game.id, parseTargets(GAME_TARGETS[Game.id], Game.id)]));
  const unclassified = GAME_TYPES.filter((Game) => !GAME_TARGETS[Game.id]);
  const builtIds = new Set(GAME_TYPES.map((Game) => Game.id));
  const planned = Object.entries(PLANNED).filter(([id]) => !builtIds.has(id))
    .map(([id, plan]) => ({ id, ...plan, targets: parseTargets(plan.targets, id) }));
  const targetText = (targets) => targets.map((target) => `${SUBS.get(target.id).name}${target.part ? ' (부분)' : ''}`).join(' · ');

  const LEGEND = '레벨 표의 `–`는 해당 레벨에서 값을 지정하지 않았다는 뜻입니다 (변수 설명의 기본값을 쓰거나 기능이 꺼짐). `a~b`는 그 범위에서 무작위로 정한다는 뜻입니다.';
  const readme = [];
  const GENERATED = [
    '> 이 문서는 `node tools/manual.js`가 게임 코드에서 자동으로 생성합니다. 직접 수정하지 마세요.',
    '> 내용을 바꾸려면 게임 파일(`js/games/*.js`)의 상단 주석, `levels`, 상수 주석을 수정한 뒤 스크립트를 다시 실행하세요.',
  ];
  readme.push('# 미니게임 난이도 문서');
  readme.push('');
  readme.push(...GENERATED);
  readme.push('');
  readme.push('모든 미니게임은 Lv1~8의 난이도가 있으며, 레벨마다 몇 가지 **난이도 변수** 값이 달라집니다.');
  readme.push('게임별로 난이도 변수의 의미와 레벨별 값, 문제 수, 제한 시간, 능력 그래프 가중치를 정리했습니다.');
  readme.push('');

  // ---- 공통 ----
  readme.push('## 공통 규칙');
  readme.push('');
  readme.push(`- **레벨**: Lv1·Lv2는 고령자용으로 추가한 쉬운 단계이고, 기본 시작 레벨은 **Lv${BASE_LEVEL}**입니다. 쉬운 단계에서는 문제 제한 시간이 늘어납니다 (Lv1 ×${EASY_TIME[0]}, Lv2 ×${EASY_TIME[1]}).`);
  readme.push(`- **제한 시간** = (기본 시간 + 단위 시간 × N)초 × 쉬운 단계 배율 × 라운드 난이도의 \`questionTimeScale\`. N은 게임마다 정한 문제 크기(빈칸 수, 조각 수 등)이며, 게임별 문서에 적었습니다. 입력을 받기 시작한 시점부터 게임 시계 기준으로 잽니다 (\`js/config.js\`의 \`questionTime\`).`);
  const multipliers = Array.from({ length: LEVEL_COUNT }, (_, i) => `Lv${i + 1} ×${Config.levelMultiplier(DEFAULT_CONFIG, i + 1).toFixed(2)}`);
  readme.push(`- **점수 배율** (기본 설정): ${multipliers.join(' · ')}`);
  readme.push(`- **난이도 자동 조절** (기본 \`adaptive\`): 모든 게임이 하나의 난이도 값을 공유합니다. 정답이면 +${DEFAULT_CONFIG.diffUp}, 오답·시간 초과면 −${DEFAULT_CONFIG.diffDown}이고, 다음 게임의 레벨은 이 값의 정수 부분입니다. 활성화된 게임이 ${DEFAULT_CONFIG.diffGamesRef}종보다 많으면 두 증감 폭에 (${DEFAULT_CONFIG.diffGamesRef} / 게임 수)를 곱합니다. 운영 버전에서는 세션 길이와 난이도 설정에 따라 이 값을 따로 정합니다 (\`Config.session\`).`);
  readme.push(`- **두뇌 그래프** (결과 화면): 인지 영역(${GRAPH_DOMAINS.map((domain) => domain.name).join(' · ')})마다 그 영역을 쓰는 게임들의 정답률을 보여 줍니다. 게임마다 주 영역은 1, 부분 영역은 0.5 의 비중으로 셉니다. 영역 축 뒤에 답하는 속도(문제마다 제한 시간 가운데 남긴 몫)와 운동(목표 속도를 지킨 비율) 축이 붙습니다.`);
  readme.push(`- ${LEGEND}`);
  readme.push('');

  // ---- 목차 ----
  readme.push('## 게임 목록');
  readme.push('');
  GAME_TYPES.forEach((Game, i) => readme.push(`${i + 1}. [${Game.title}](${Game.id}.md) — \`${Game.id}\``));
  readme.push('');
  readme.push('새 게임을 기획할 때는 [인지 영역 점검표](TARGETS.md)에서 아직 다루지 않은 영역을 확인하세요.');
  readme.push('');

  // ---- 게임마다 한 쪽 ----
  // 예전에 만든 쪽 가운데 지금 게임 목록에 없는 것(이름을 바꾸거나 뺀 게임)은 지운다. 이 폴더는 통째로 이 스크립트 것이다
  fs.mkdirSync(OUT, { recursive: true });
  const pages = new Set(['README.md', 'TARGETS.md', ...GAME_TYPES.map((Game) => `${Game.id}.md`)]);
  fs.readdirSync(OUT).filter((fileName) => fileName.endsWith('.md') && !pages.has(fileName)).forEach((fileName) => fs.unlinkSync(path.join(OUT, fileName)));
  fs.writeFileSync(path.join(OUT, 'README.md'), readme.join('\n'));

  for (const [gameIndex, Game] of GAME_TYPES.entries()) {
    const page = [];
    const file = `js/games/${Game.id}.js`;
    const source = read(file);
    const head = header(source);
    const knobList = knobs(head);
    const notes = levelNotes(source);
    const fixedValues = constants(source).filter((constant) => !['ROUNDS', 'QUESTIONS'].includes(constant.name));
    const questions = Game.ROUNDS ?? Game.QUESTIONS ?? 1;
    const questionTime = DEFAULT_CONFIG.questionTime[Game.id];
    const domains = DOMAIN_GAMES[Game.id] || {};

    const previous = GAME_TYPES[gameIndex - 1];
    const next = GAME_TYPES[gameIndex + 1];
    page.push(`[← 목차·공통 규칙](README.md)${previous ? ` · [← ${previous.title}](${previous.id}.md)` : ''}${next ? ` · [${next.title} →](${next.id}.md)` : ''}`);
    page.push('');
    page.push(`# ${Game.title} (\`${Game.id}\`)`);
    page.push('');
    page.push(...GENERATED);
    page.push('');
    page.push(summary(head));
    page.push('');
    page.push(`- 파일: [${file}](../../${file}) — 설계 의도는 파일 상단 주석에 더 자세히 있습니다`);
    page.push(`- 문제 수: 게임당 ${questions}개`);
    if (Game.tags) page.push(`- 태그: ${Game.tags.join(', ')} (태그가 겹치는 게임은 연달아 나오지 않음)`);
    if (questionTime) page.push(`- 제한 시간: ${questionTime.base}초 + ${questionTime.per}초 × N${loadText[Game.id] ? `, N = ${loadText[Game.id]}` : ''}`);
    page.push(`- 두뇌 그래프 영역: ${Object.entries(domains).map(([domain, weight]) => `${domainName[domain]}${weight < 1 ? ' (부분)' : ''}`).join(' · ') || '없음'}`);
    page.push(`- 세부 인지 영역: ${targetText(gameTargets[Game.id]) || '*지정하지 않음 — tools/targets.js*'} ([점검표](TARGETS.md))`);
    page.push('');

    // 손잡이 설명: 레벨에 실제로 쓰인 것 + 설명만 있는 것. 쓰인 순서는 설명 순서를 따르고, 설명이 없는 것은 뒤에
    const used = [];
    Game.levels.forEach((level) => Object.keys(level).forEach((key) => !used.includes(key) && used.push(key)));
    const described = knobList.flatMap((knob) => knob.names);
    const columns = [...described.filter((key) => used.includes(key)), ...used.filter((key) => !described.includes(key))];

    page.push('## 난이도 변수');
    page.push('');
    page.push('| 변수 | 설명 |');
    page.push('|---|---|');
    knobList.forEach((knob) => page.push(`| ${knob.names.map((name) => `\`${name}\``).join(' · ')} | ${escapeCell(knob.text)}${knob.names.some((name) => used.includes(name)) ? '' : ' *(현재 어느 레벨에서도 쓰지 않음)*'} |`));
    used.filter((key) => !described.includes(key)).forEach((key) => page.push(`| \`${key}\` | *(상단 주석에 설명 없음 — 소스 참고)* |`));
    page.push('');

    page.push('## 레벨별 값');
    page.push('');
    page.push(`| Lv | ${columns.map((column) => `\`${column}\``).join(' | ')} | 메모 |`);
    page.push(`|---|${columns.map(() => '---').join('|')}|---|`);
    Game.levels.forEach((level, i) => {
      const levelLabel = i + 1 < BASE_LEVEL ? `${i + 1} (쉬움)` : String(i + 1);
      page.push(`| ${levelLabel} | ${columns.map((column) => escapeCell(formatValue(column, level[column]))).join(' | ')} | ${escapeCell(notes[i] || '')} |`);
    });
    page.push('');

    if (fixedValues.length) {
      page.push('## 상수 (모든 레벨 공통)');
      page.push('');
      page.push('| 이름 | 값 | 설명 |');
      page.push('|---|---|---|');
      fixedValues.forEach((constant) => page.push(`| \`${constant.name}\` | \`${escapeCell(constant.value)}\` | ${escapeCell(constant.text)} |`));
      page.push('');
    }
    page.push(LEGEND);
    page.push('');
    fs.writeFileSync(path.join(OUT, `${Game.id}.md`), page.join('\n'));
  }
  writeTargets();
  console.log(`${path.relative(ROOT, OUT)}: README.md + TARGETS.md + 게임 ${GAME_TYPES.length}쪽`);
  if (unclassified.length) console.warn(`인지 영역을 지정하지 않은 게임: ${unclassified.map((Game) => Game.id).join(', ')} (tools/targets.js)`);

  // ---- 노릴 능력 점검표 ----
  function writeTargets() {
    const page = [];
    const link = (Game) => `[${Game.title}](${Game.id}.md)`;
    const coverageOf = (id) => {
      const main = GAME_TYPES.filter((Game) => gameTargets[Game.id].some((target) => target.id === id && !target.part));
      const part = GAME_TYPES.filter((Game) => gameTargets[Game.id].some((target) => target.id === id && target.part));
      const plan = planned.filter((plannedGame) => plannedGame.targets.some((target) => target.id === id));
      const mark = main.length >= 2 ? '☑' : main.length || part.length ? '△' : '☐';
      return { main, part, plan, mark };
    };
    const PRIORITIES = ['높음', '중간', '낮음'];
    const all = DOMAINS.flatMap((domain) => domain.subs.map((sub) => ({ sub, domain, coverage: coverageOf(sub.id) })));

    page.push('[← 목차·공통 규칙](README.md)');
    page.push('');
    page.push('# 인지 영역 점검표');
    page.push('');
    page.push('> 이 문서는 `node tools/manual.js`가 `tools/targets.js`와 게임 목록에서 자동으로 생성합니다. 직접 수정하지 마세요.');
    page.push('> 게임을 추가하면 `tools/targets.js`의 `GAME_TARGETS`에 그 게임이 다루는 세부 영역을 적은 뒤 스크립트를 다시 실행하세요.');
    page.push('');
    page.push('새 미니게임을 기획할 때, 기존 게임이 아직 다루지 않는 인지 영역을 찾기 위한 표입니다.');
    page.push('DSM-5의 신경인지 영역과 세부 영역을 바탕으로 계산, 일상생활 과제, 이중 과제를 추가했습니다. 결과 화면의 능력 그래프(5개 축)와는 별개입니다.');
    page.push('');
    page.push('**☑** 주 영역으로 다루는 게임 2종 이상 · **△** 1종뿐이거나 부분적으로만 다룸 · **☐** 없음 · *계획*: [NEW_GAMES_BRIEF.md](../NEW_GAMES_BRIEF.md)에만 있는 게임');
    page.push('');

    const countMarked = (mark) => all.filter((item) => item.coverage.mark === mark).length;
    page.push(`## 요약: ☑ ${countMarked('☑')} · △ ${countMarked('△')} · ☐ ${countMarked('☐')} (세부 영역 ${all.length}개, 게임 ${GAME_TYPES.length}종)`);
    page.push('');
    if (unclassified.length) {
      page.push(`**영역을 지정하지 않은 게임:** ${unclassified.map(link).join(', ')} — 이 표에 반영되지 않았습니다.`);
      page.push('');
    }
    const gaps = all.filter((item) => item.coverage.mark !== '☑')
      .sort((a, b) => PRIORITIES.indexOf(a.sub.priority) - PRIORITIES.indexOf(b.sub.priority) || (a.coverage.mark === '☐' ? -1 : 1) - (b.coverage.mark === '☐' ? -1 : 1));
    page.push('### 보완이 필요한 영역 (우선순위순)');
    page.push('');
    page.push('| | 세부 영역 | 영역 | 우선순위 | 현재 게임 |');
    page.push('|---|---|---|---|---|');
    gaps.forEach(({ sub, domain, coverage }) => {
      const games = [...coverage.main.map(link), ...coverage.part.map((Game) => `${link(Game)} (부분)`), ...coverage.plan.map((plan) => `*계획: ${plan.title}*`)].join(', ') || '–';
      page.push(`| ${coverage.mark} | [${sub.name}](#${sub.id}) | ${domain.name} | ${sub.priority} | ${escapeCell(games)} |`);
    });
    page.push('');
    const crowded = all.filter((item) => item.coverage.main.length >= 4);
    if (crowded.length) {
      page.push(`**편중된 영역** (주 영역으로 다루는 게임 4종 이상): ${crowded.map(({ sub, coverage }) => `${sub.name} ${coverage.main.length}종`).join(' · ')}. 이 영역의 게임을 더 만들기보다 빈 영역을 먼저 채우는 편이 좋습니다.`);
      page.push('');
    }

    for (const domain of DOMAINS) {
      page.push(`## ${domain.name} (${domain.english})`);
      page.push('');
      for (const sub of domain.subs) {
        const coverage = coverageOf(sub.id);
        page.push(`- ${coverage.mark} <a id="${sub.id}"></a>**${sub.name}** — ${sub.what}. 대표 검사: ${sub.test}`);
        if (coverage.main.length) page.push(`  - 주 영역: ${coverage.main.map(link).join(', ')}`);
        if (coverage.part.length) page.push(`  - 부분: ${coverage.part.map(link).join(', ')}`);
        if (coverage.plan.length) page.push(`  - 계획: ${coverage.plan.map((plan) => `[${plan.title}](${plan.doc}) (\`${plan.id}\`)`).join(', ')}`);
        if (sub.note) page.push(`  - 참고: ${sub.note}`);
        if (sub.idea && coverage.mark !== '☑') page.push(`  - 게임 아이디어 (우선순위 ${sub.priority}): ${sub.idea}`);
      }
      page.push('');
    }
    fs.writeFileSync(path.join(OUT, 'TARGETS.md'), page.join('\n'));
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
