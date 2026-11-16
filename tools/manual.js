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
globalThis.location = { pathname: '/', search: '', hash: '' }; // js/dev-storage.js 가 /dev/ 인지 본다

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

  // ---- 노리는 능력 (tools/targets.js) ----
  // '~id' 는 일부. 없는 id 를 적으면 멈춘다 (오타가 점검표에서 조용히 빠지지 않게)
  const SUBS = new Map(DOMAINS.flatMap((d) => d.subs.map((s) => [s.id, { ...s, domain: d }])));
  const parseTargets = (list, who) => (list || []).map((t) => {
    const part = t.startsWith('~');
    const id = part ? t.slice(1) : t;
    if (!SUBS.has(id)) throw new Error(`tools/targets.js: ${who} 의 '${t}' — 없는 세부 영역`);
    return { id, part };
  });
  const gameTargets = Object.fromEntries(GAME_TYPES.map((T) => [T.id, parseTargets(GAME_TARGETS[T.id], T.id)]));
  const unclassified = GAME_TYPES.filter((T) => !GAME_TARGETS[T.id]);
  const builtIds = new Set(GAME_TYPES.map((T) => T.id));
  const planned = Object.entries(PLANNED).filter(([id]) => !builtIds.has(id))
    .map(([id, p]) => ({ id, ...p, targets: parseTargets(p.targets, id) }));
  const targetText = (ts) => ts.map((t) => `${SUBS.get(t.id).name}${t.part ? ' (부분)' : ''}`).join(' · ');

  const LEGEND = '레벨 표의 `–`는 해당 레벨에서 값을 지정하지 않았다는 뜻입니다 (변수 설명의 기본값을 쓰거나 기능이 꺼짐). `a~b`는 그 범위에서 무작위로 정한다는 뜻입니다.';
  const md = [];
  const GENERATED = [
    '> 이 문서는 `node tools/manual.js`가 게임 코드에서 자동으로 생성합니다. 직접 수정하지 마세요.',
    '> 내용을 바꾸려면 게임 파일(`js/games/*.js`)의 상단 주석, `levels`, 상수 주석을 수정한 뒤 스크립트를 다시 실행하세요.',
  ];
  md.push('# 미니게임 난이도 문서');
  md.push('');
  md.push(...GENERATED);
  md.push('');
  md.push('모든 미니게임은 Lv1~8의 난이도가 있으며, 레벨마다 몇 가지 **난이도 변수** 값이 달라집니다.');
  md.push('게임별로 난이도 변수의 의미와 레벨별 값, 문제 수, 제한 시간, 능력 그래프 가중치를 정리했습니다.');
  md.push('');

  // ---- 공통 ----
  md.push('## 공통 규칙');
  md.push('');
  md.push(`- **레벨**: Lv1·Lv2는 고령자용으로 추가한 쉬운 단계이고, 기본 시작 레벨은 **Lv${BASE_LEVEL}**입니다. 쉬운 단계에서는 문제 제한 시간이 늘어납니다 (Lv1 ×${EASY_TIME[0]}, Lv2 ×${EASY_TIME[1]}).`);
  md.push(`- **제한 시간** = (기본 시간 + 단위 시간 × N)초 × 쉬운 단계 배율 × 라운드 난이도의 \`questionTimeScale\`. N은 게임마다 정한 문제 크기(빈칸 수, 조각 수 등)이며, 게임별 문서에 적었습니다. 입력을 받기 시작한 시점부터 게임 시계 기준으로 잽니다 (\`js/config.js\`의 \`questionTime\`).`);
  const mults = Array.from({ length: LV }, (_, i) => `Lv${i + 1} ×${Config.levelMult(DEFAULT_CONFIG, i + 1).toFixed(2)}`);
  md.push(`- **점수 배율** (기본 설정): ${mults.join(' · ')}`);
  md.push(`- **난이도 자동 조절** (기본 \`adaptive\`): 모든 게임이 하나의 난이도 값을 공유합니다. 정답이면 +${DEFAULT_CONFIG.diffUp}, 오답·시간 초과면 −${DEFAULT_CONFIG.diffDown}이고, 다음 게임의 레벨은 이 값의 정수 부분입니다. 활성화된 게임이 ${DEFAULT_CONFIG.diffGamesRef}종보다 많으면 두 증감 폭에 (${DEFAULT_CONFIG.diffGamesRef} / 게임 수)를 곱합니다. 운영 버전에서는 세션 길이와 난이도 설정에 따라 이 값을 따로 정합니다 (\`Config.session\`).`);
  md.push(`- **능력 그래프**: 각 게임의 결과를 능력 축(${ABILITIES.map((a) => a.name).join(' · ')})에 가중치를 나눠 반영합니다. 처리속도 가중치가 있는 게임 중 일부는 문제당 소요 시간에 따라 그 가중치를 줄입니다 (느리면 최대 ×${Abilities.PACE_MIN}).`);
  md.push(`- ${LEGEND}`);
  md.push('');

  // ---- 목차 ----
  md.push('## 게임 목록');
  md.push('');
  GAME_TYPES.forEach((T, i) => md.push(`${i + 1}. [${T.title}](${T.id}.md) — \`${T.id}\``));
  md.push('');
  md.push('새 게임을 기획할 때는 [인지 영역 점검표](TARGETS.md)에서 아직 다루지 않은 영역을 확인하세요.');
  md.push('');

  // ---- 게임마다 한 쪽 ----
  // 예전에 만든 쪽 가운데 지금 게임 목록에 없는 것(이름을 바꾸거나 뺀 게임)은 지운다. 이 폴더는 통째로 이 스크립트 것이다
  fs.mkdirSync(OUT, { recursive: true });
  const pages = new Set(['README.md', 'TARGETS.md', ...GAME_TYPES.map((T) => `${T.id}.md`)]);
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
    md.push(`[← 목차·공통 규칙](README.md)${prev ? ` · [← ${prev.title}](${prev.id}.md)` : ''}${next ? ` · [${next.title} →](${next.id}.md)` : ''}`);
    md.push('');
    md.push(`# ${T.title} (\`${T.id}\`)`);
    md.push('');
    md.push(...GENERATED);
    md.push('');
    md.push(summary(head));
    md.push('');
    md.push(`- 파일: [${file}](../../${file}) — 설계 의도는 파일 상단 주석에 더 자세히 있습니다`);
    md.push(`- 문제 수: 게임당 ${questions}개`);
    if (T.tags) md.push(`- 태그: ${T.tags.join(', ')} (태그가 겹치는 게임은 연달아 나오지 않음)`);
    if (qt) md.push(`- 제한 시간: ${qt.base}초 + ${qt.per}초 × N${loadText[T.id] ? `, N = ${loadText[T.id]}` : ''}`);
    md.push(`- 능력 그래프 가중치: ${Object.entries(w).map(([k, v]) => `${abilityName[k]} ${v}`).join(' · ') || '없음'}` +
      (pace ? ` (처리속도: 문제당 ${pace.fast}초 이하면 그대로, ${pace.slow}초 이상이면 ×${Abilities.PACE_MIN})` : ''));
    md.push(`- 인지 영역: ${targetText(gameTargets[T.id]) || '*지정하지 않음 — tools/targets.js*'} ([점검표](TARGETS.md))`);
    md.push('');

    // 손잡이 설명: 레벨에 실제로 쓰인 것 + 설명만 있는 것. 쓰인 순서는 설명 순서를 따르고, 설명이 없는 것은 뒤에
    const used = [];
    T.levels.forEach((l) => Object.keys(l).forEach((k) => !used.includes(k) && used.push(k)));
    const described = ks.flatMap((k) => k.names);
    const cols = [...described.filter((k) => used.includes(k)), ...used.filter((k) => !described.includes(k))];

    md.push('## 난이도 변수');
    md.push('');
    md.push('| 변수 | 설명 |');
    md.push('|---|---|');
    ks.forEach((k) => md.push(`| ${k.names.map((n) => `\`${n}\``).join(' · ')} | ${esc(k.text)}${k.names.some((n) => used.includes(n)) ? '' : ' *(현재 어느 레벨에서도 쓰지 않음)*'} |`));
    used.filter((k) => !described.includes(k)).forEach((k) => md.push(`| \`${k}\` | *(상단 주석에 설명 없음 — 소스 참고)* |`));
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
      md.push('## 상수 (모든 레벨 공통)');
      md.push('');
      md.push('| 이름 | 값 | 설명 |');
      md.push('|---|---|---|');
      consts.forEach((c) => md.push(`| \`${c.name}\` | \`${esc(c.value)}\` | ${esc(c.text)} |`));
      md.push('');
    }
    md.push(LEGEND);
    md.push('');
    fs.writeFileSync(path.join(OUT, `${T.id}.md`), md.join('\n'));
  }
  writeTargets();
  console.log(`${path.relative(ROOT, OUT)}: README.md + TARGETS.md + 게임 ${GAME_TYPES.length}쪽`);
  if (unclassified.length) console.warn(`인지 영역을 지정하지 않은 게임: ${unclassified.map((T) => T.id).join(', ')} (tools/targets.js)`);

  // ---- 노릴 능력 점검표 ----
  function writeTargets() {
    const md = [];
    const link = (T) => `[${T.title}](${T.id}.md)`;
    const cover = (id) => {
      const main = GAME_TYPES.filter((T) => gameTargets[T.id].some((t) => t.id === id && !t.part));
      const part = GAME_TYPES.filter((T) => gameTargets[T.id].some((t) => t.id === id && t.part));
      const plan = planned.filter((p) => p.targets.some((t) => t.id === id));
      const mark = main.length >= 2 ? '☑' : main.length || part.length ? '△' : '☐';
      return { main, part, plan, mark };
    };
    const PRI = ['높음', '중간', '낮음'];
    const all = DOMAINS.flatMap((d) => d.subs.map((s) => ({ s, d, c: cover(s.id) })));

    md.push('[← 목차·공통 규칙](README.md)');
    md.push('');
    md.push('# 인지 영역 점검표');
    md.push('');
    md.push('> 이 문서는 `node tools/manual.js`가 `tools/targets.js`와 게임 목록에서 자동으로 생성합니다. 직접 수정하지 마세요.');
    md.push('> 게임을 추가하면 `tools/targets.js`의 `GAME_TARGETS`에 그 게임이 다루는 세부 영역을 적은 뒤 스크립트를 다시 실행하세요.');
    md.push('');
    md.push('새 미니게임을 기획할 때, 기존 게임이 아직 다루지 않는 인지 영역을 찾기 위한 표입니다.');
    md.push('DSM-5의 신경인지 영역과 세부 영역을 바탕으로 계산, 일상생활 과제, 이중 과제를 추가했습니다. 결과 화면의 능력 그래프(5개 축)와는 별개입니다.');
    md.push('');
    md.push('**☑** 주 영역으로 다루는 게임 2종 이상 · **△** 1종뿐이거나 부분적으로만 다룸 · **☐** 없음 · *계획*: [NEW_GAMES_BRIEF.md](../NEW_GAMES_BRIEF.md)에만 있는 게임');
    md.push('');

    const n = (m) => all.filter((x) => x.c.mark === m).length;
    md.push(`## 요약: ☑ ${n('☑')} · △ ${n('△')} · ☐ ${n('☐')} (세부 영역 ${all.length}개, 게임 ${GAME_TYPES.length}종)`);
    md.push('');
    if (unclassified.length) {
      md.push(`**영역을 지정하지 않은 게임:** ${unclassified.map(link).join(', ')} — 이 표에 반영되지 않았습니다.`);
      md.push('');
    }
    const gaps = all.filter((x) => x.c.mark !== '☑').sort((a, b) => PRI.indexOf(a.s.priority) - PRI.indexOf(b.s.priority) || (a.c.mark === '☐' ? -1 : 1) - (b.c.mark === '☐' ? -1 : 1));
    md.push('### 보완이 필요한 영역 (우선순위순)');
    md.push('');
    md.push('| | 세부 영역 | 영역 | 우선순위 | 현재 게임 |');
    md.push('|---|---|---|---|---|');
    gaps.forEach(({ s, d, c }) => {
      const now = [...c.main.map(link), ...c.part.map((T) => `${link(T)} (부분)`), ...c.plan.map((p) => `*계획: ${p.title}*`)].join(', ') || '–';
      md.push(`| ${c.mark} | [${s.name}](#${s.id}) | ${d.name} | ${s.priority} | ${esc(now)} |`);
    });
    md.push('');
    const crowded = all.filter((x) => x.c.main.length >= 4);
    if (crowded.length) {
      md.push(`**편중된 영역** (주 영역으로 다루는 게임 4종 이상): ${crowded.map(({ s, c }) => `${s.name} ${c.main.length}종`).join(' · ')}. 이 영역의 게임을 더 만들기보다 빈 영역을 먼저 채우는 편이 좋습니다.`);
      md.push('');
    }

    for (const d of DOMAINS) {
      md.push(`## ${d.name} (${d.en})`);
      md.push('');
      for (const s of d.subs) {
        const c = cover(s.id);
        md.push(`- ${c.mark} <a id="${s.id}"></a>**${s.name}** — ${s.what}. 대표 검사: ${s.test}`);
        if (c.main.length) md.push(`  - 주 영역: ${c.main.map(link).join(', ')}`);
        if (c.part.length) md.push(`  - 부분: ${c.part.map(link).join(', ')}`);
        if (c.plan.length) md.push(`  - 계획: ${c.plan.map((p) => `[${p.title}](${p.doc}) (\`${p.id}\`)`).join(', ')}`);
        if (s.note) md.push(`  - 참고: ${s.note}`);
        if (s.idea && c.mark !== '☑') md.push(`  - 게임 아이디어 (우선순위 ${s.priority}): ${s.idea}`);
      }
      md.push('');
    }
    fs.writeFileSync(path.join(OUT, 'TARGETS.md'), md.join('\n'));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
