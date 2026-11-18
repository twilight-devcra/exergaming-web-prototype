// 낱말 목록(js/words.js) 점검: 형식 검사, 값별 낱말 수, '다른 하나 찾기' 예시 문제.
// 실행: node tools/words-check.js [문제 수=30] [씨앗=1] [cat|facet]
//
// 다른 하나 찾기: 꼬리표 하나(범주 또는 성질 값)를 정해 그 값을 가진 낱말 3개와 값이 다른 낱말 1개를 고른다.
// 그다음 모든 꼬리표를 다시 훑어, 다른 낱말이 '혼자 다른 것'이 되는 꼬리표가 하나라도 있으면 버린다.
// 갈리는 값(null)은 가능한 모든 값을 넣어 보고, 그중 하나라도 답을 둘로 만들면 버린다 — 사람마다 다르게 볼 수 있으므로.
// 답을 뒷받침하는 꼬리표가 여럿이면 함께 찍는다 (많을수록 쉬운 문제).
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const N = Number(process.argv[2] || 30);
const ONLY = process.argv[4]; // 'cat' 또는 'facet' — 그 갈래의 꼬리표로 낸 문제만 찍는다
let seed = Number(process.argv[3] || 1);
const rand = () => { // mulberry32 — 같은 씨앗이면 같은 문제
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const batchim = (w) => { const k = w.charCodeAt(w.length - 1) - 0xac00; return k >= 0 && k < 11172 && k % 28 > 0; }; // 받침이 있으면 '이다' · '이 아니다'
const pick = (a) => a[Math.floor(rand() * a.length)];
const sample = (a, k) => { const c = a.slice(), out = []; while (out.length < k && c.length) out.push(c.splice(Math.floor(rand() * c.length), 1)[0]); return out; };

(async () => {
  const { CATEGORIES, FACETS, WORDS } = await import(pathToFileURL(path.join(ROOT, 'js/words.js')));
  const errors = [];

  // ── 범주 닫기: 위 범주를 따라 올라간다 ──
  const up = (c) => { const out = []; for (let x = c; x; x = CATEGORIES[x]) out.push(x); return out; };
  const closure = (list) => new Set((list || []).flatMap(up));
  for (const wd of WORDS) {
    for (const c of [...(wd.is || []), ...(wd.unsure || [])]) if (!(c in CATEGORIES)) errors.push(`${wd.w}: 없는 범주 '${c}'`);
    wd._is = closure(wd.is);
    wd._unsure = new Set([...closure(wd.unsure)].filter((c) => !wd._is.has(c)));
    if (!wd.is || !wd.is.length) errors.push(`${wd.w}: is 가 비었다`);
    for (const c of wd.unsure || []) if (wd._is.has(c)) errors.push(`${wd.w}: '${c}'가 is 와 unsure 에 모두 있다`);
  }
  const dup = WORDS.map((x) => x.w).filter((w, i, a) => a.indexOf(w) !== i);
  if (dup.length) errors.push(`같은 낱말이 두 번: ${dup.join(', ')}`);

  // ── 꼬리표 하나 = { name, value(word) → 값 | null(갈림) | 'na'(해당 없음), text(값) } ──
  const features = [];
  for (const c of Object.keys(CATEGORIES)) {
    features.push({
      name: `범주:${c}`, kind: 'cat', cat: c, options: ['yes', 'no'],
      value: (wd) => (wd._is.has(c) ? 'yes' : wd._unsure.has(c) ? null : 'no'),
      text: (v) => (v === 'yes' ? `${c}${batchim(c) ? '이다' : '다'}` : `${c}${batchim(c) ? '이' : '가'} 아니다`),
    });
  }
  for (const [key, f] of Object.entries(FACETS)) {
    const opts = Object.keys(f.values);
    features.push({
      name: `성질:${key}`, kind: 'facet', key, options: opts,
      value: (wd) => {
        if (f.domain && !wd._is.has(f.domain)) return 'na';
        if (!(key in wd)) { errors.push(`${wd.w}: '${key}' 값이 없다 (갈리면 null)`); return null; }
        const v = wd[key] === null ? null : String(wd[key]);
        if (v !== null && !opts.includes(v)) errors.push(`${wd.w}: '${key}'에 없는 값 ${v}`);
        return v;
      },
      text: (v) => (v === 'na' ? `${f.label} 해당 없음` : f.values[v]),
    });
  }
  // 영역 밖 성질을 적었으면 알린다 (물건의 다리 수 등)
  for (const wd of WORDS) for (const [key, f] of Object.entries(FACETS))
    if (f.domain && !wd._is.has(f.domain) && key in wd) errors.push(`${wd.w}: '${key}'는 ${f.domain}에만 쓴다`);

  const vals = new Map(features.map((f) => [f.name, new Map(WORDS.map((wd) => [wd.w, f.value(wd)]))]));
  const V = (f, wd) => vals.get(f.name).get(wd.w);

  if (errors.length) { console.log(`형식 오류 ${errors.length}개`); for (const e of [...new Set(errors)]) console.log('  ' + e); process.exitCode = 1; }
  else console.log(`형식 오류 없음 — 낱말 ${WORDS.length}개, 범주 ${Object.keys(CATEGORIES).length}개, 성질 ${Object.keys(FACETS).length}개`);

  // ── 값별 낱말 수 ──
  console.log('\n값별 낱말 수 (갈림 = null, 문제에 쓰지 않음)');
  for (const f of features) {
    const count = {};
    for (const wd of WORDS) { const v = V(f, wd); if (v !== 'na') count[v ?? '갈림'] = (count[v ?? '갈림'] || 0) + 1; }
    const s = Object.entries(count).map(([v, n]) => `${v === '갈림' ? '갈림' : f.kind === 'cat' ? v : FACETS[f.key].values[v]} ${n}`).join(' · ');
    console.log(`  ${f.name.padEnd(14)} ${s}`);
  }

  // ── 다른 하나 찾기 ──
  // 낱말 넷에서 '혼자 다른 낱말'을 찾는다. null 은 가능한 값을 모두 넣어 본다. 돌려주는 것: 혼자 다를 수 있는 낱말들의 집합
  const loners = (f, four) => {
    const base = four.map((wd) => V(f, wd));
    const holes = base.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
    const out = new Set();
    const tryAll = (k, cur) => {
      if (k === holes.length) {
        for (let i = 0; i < 4; i++) {
          const others = cur.filter((_, j) => j !== i);
          if (others.every((v) => v === others[0]) && cur[i] !== others[0]) out.add(four[i].w);
        }
        return;
      }
      for (const o of f.options) { const nx = cur.slice(); nx[holes[k]] = o; tryAll(k + 1, nx); }
    };
    tryAll(0, base);
    return out;
  };

  const makeOdd = () => {
    const f = pick(ONLY ? features.filter((x) => x.kind === ONLY) : features);
    const byVal = {};
    for (const wd of WORDS) { const v = V(f, wd); if (v !== null && v !== 'na') (byVal[v] ||= []).push(wd); }
    const v = pick(Object.keys(byVal).filter((k) => byVal[k].length >= 3));
    if (v === undefined) return null;
    const three = sample(byVal[v], 3);
    // 다른 하나는 같은 바탕에서 고른다: 범주 문제는 위 범주 안에서 (개무리 문제의 답은 다른 네발짐승), 성질 문제는 같은 영역에서
    const parent = f.kind === 'cat' ? CATEGORIES[f.cat] : null;
    const pool = WORDS.filter((wd) => {
      const x = V(f, wd);
      if (x === null || x === 'na' || x === v) return false;
      if (parent && !wd._is.has(parent)) return false;
      if (f.kind === 'facet' && !FACETS[f.key].domain) return three.every((t) => [...t._is].some((c) => !CATEGORIES[c] && wd._is.has(c))); // 크기: 같은 맨 위 범주끼리
      return true;
    });
    if (!pool.length) return null;
    const odd = pick(pool);
    const four = sample([...three, odd], 4);
    const support = [];
    for (const g of features) {
      const l = loners(g, four);
      if ([...l].some((w) => w !== odd.w)) return { rejected: g.name };
      if (l.has(odd.w) && four.every((wd) => V(g, wd) !== null && V(g, wd) !== 'na')) support.push(g); // '해당 없음'은 맨 위 범주와 같은 말이라 뺀다
    }
    return { four, odd, main: f, v, support };
  };

  console.log(`\n다른 하나 찾기 예시 ${N}개 (씨앗 ${process.argv[3] || 1})`);
  let tries = 0, rejected = {}, made = 0;
  const seen = new Set();
  while (made < N && tries < N * 200) {
    tries++;
    const q = makeOdd();
    if (!q) continue;
    if (q.rejected) { rejected[q.rejected] = (rejected[q.rejected] || 0) + 1; continue; }
    const key = q.four.map((x) => x.w).sort().join();
    if (seen.has(key)) continue;
    seen.add(key);
    made++;
    const rest = q.four.filter((x) => x !== q.odd);
    const why = q.support.map((g) => `${g.text(V(g, rest[0]))} ↔ ${q.odd.w}: ${g.text(V(g, q.odd))}`);
    console.log(`  ${String(made).padStart(2)}. ${q.four.map((x) => x.w).join(' · ').padEnd(24)} → ${q.odd.w}   [${q.main.name}] 근거 ${q.support.length}: ${why.join(' / ')}`);
  }
  const rej = Object.entries(rejected).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ${n}`).join(', ');
  console.log(`\n시도 ${tries}번 중 ${made}개 채택. 답이 둘이 될 수 있어 버린 문제를 만든 꼬리표 (많은 순): ${rej || '없음'}`);
})();
