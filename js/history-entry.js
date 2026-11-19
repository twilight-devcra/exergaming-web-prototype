// 회원 기록 항목 하나의 모양 (docs/SERVER.md '회원 기록'). 서버(api/server.js, require)와 태블릿(app/members.js, import)이 이 파일 하나를 함께 쓴다.
//
// 왜 형을 정해 두나: 회원 기록은 누구나 올릴 수 있는 세션(업로드 키는 공개)에서 뽑아 다른 태블릿 화면에 그린다.
// 숫자 칸에 글이 들어오면 화면에 HTML 로 박힐 수 있으므로(XSS), 서버는 저장할 때, 태블릿은 받을 때 cleanEntry 로 형을 맞춘다.
// 형이 맞지 않는 값은 null 이 되고, 아래 HISTORY_FIELDS 에 없는 필드는 버린다.
//
// 필드를 더하거나 형을 바꿀 때: 여기 HISTORY_FIELDS · summarize 와 docs/SERVER.md '회원 기록' 표(형 칸)를 함께 고친다.
// node api/test.js 가 셋이 맞는지, 서버가 돌려주는 항목이 이 형을 지키는지 확인한다.
// 의존성 없음 (서버가 require 로 읽으므로 다른 모듈을 import 하지 않는다)

// 필드 → 형. number: 유한한 수 · string: 글 (수는 글로 바꾼다, 200자까지) · date: Date 로 읽히는 글 · object: 배열 아닌 객체
export const HISTORY_FIELDS = Object.freeze({
  at: 'date', // 필수. 없거나 날짜가 아니면 항목을 버린다
  min: 'number',
  difficulty: 'string',
  track: 'string',
  score: 'number',
  device: 'string',
  sid: 'string',
  gameAcc: 'number',
  level: 'number',
  distM: 'number',
  kcal: 'number',
  look: 'object',
});

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

const COERCE = {
  number: num,
  string: (v) => (typeof v === 'string' ? v.slice(0, 200) : num(v) !== null ? String(v) : null),
  date: (v) => (typeof v === 'string' && !isNaN(Date.parse(v)) ? v : null),
  object: (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null),
};

// 아무 값 → 형을 지킨 회원 기록 항목, 또는 null (at 이 없을 때)
export function cleanEntry(x) {
  if (!x || typeof x !== 'object') return null;
  const out = {};
  for (const [k, type] of Object.entries(HISTORY_FIELDS)) out[k] = COERCE[type](x[k]);
  return out.at === null ? null : out;
}

// 세션 로그 하나 → 회원 기록 항목 하나 (또는 null)
export function summarize(log) {
  const m = (log && log.meta) || {};
  const sum = m.summary || {};
  const ex = sum.exercise || {};
  const stats = Object.values(sum.stats || {}).filter((s) => s && typeof s === 'object');
  // 게임 정확도 = 맞힌 문제 / 낸 문제 (js/stars.js Stars.gameAcc 와 같다). 0~1, 소수 둘째 자리
  let correct = 0, total = 0;
  for (const s of stats) {
    correct += num(s.correct) || 0;
    total += num(s.total) || 0;
  }
  const levels = stats.map((s) => num(s.level) || 0);
  return cleanEntry({
    at: m.startedAt,
    min: m.session && m.session.min,
    difficulty: m.session && m.session.difficulty,
    // 운동 방식: dual(페달 + 두뇌 게임) · brain(두뇌 게임만). meta.track 이 없는 예전 세션은 모두 dual
    track: m.track || 'dual',
    score: sum.score,
    device: m.device,
    sid: m.id,
    gameAcc: total > 0 ? Math.round((correct / total) * 100) / 100 : null,
    level: levels.length ? Math.max(...levels) : 0,
    distM: ex.distM,
    kcal: ex.kcal,
    look: m.landmark,
  });
}
