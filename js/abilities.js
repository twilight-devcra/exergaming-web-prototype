// 결과 화면의 두뇌 그래프: 인지 영역마다의 정답률 + 답하는 속도 + 운동을 방사형 그래프로 그린다 (js/radar.js).
// 2026-11-18 까지는 영역마다 '어느 난이도까지 해냈나'를 별로 그렸는데, 짧은 라운드에서는 처음 하는 사람의 그래프가
// 작게 나와 힘이 빠졌다. 그래서 별(js/stars.js)은 정답률로 바꾸고 그래프를 뺐다가, 2026-11-20 정답률로 다시 그린다.
// adaptive 난이도가 정답률을 55~80% 근처에 머물게 하므로 처음 하는 사람도 그래프가 꽤 찬다.
//
// 게임 하나가 영역 하나가 아니라, 게임마다 쓰는 영역을 적는다 (DOMAIN_GAMES). 영역마다 둘 이상의 게임이 들어가
// 짧은 라운드에서도 대개 모든 영역이 채워진다. 과학적으로 정확할 필요는 없다 — 분류는 기획 표를 따른다 (2026-11-20).
// 세션 로그·참가 기록·운영 메뉴의 CSV 에도 이 값(축마다 0~1)을 남긴다 (summary.domains, 축 id 가 열 이름).
import { GAME_TYPES } from './games/index.js';

// 인지 영역. 그래프에서 위부터 시계 방향으로 이 순서다
export const DOMAINS = [
  { id: 'memory', name: '기억력', praise: '본 것을 또렷하게 기억해요' },
  { id: 'spatial', name: '시공간', praise: '모양과 위치를 한눈에 파악해요' },
  { id: 'calc', name: '계산', praise: '숫자를 정확하게 다뤄요' },
  { id: 'executive', name: '전두엽', praise: '앞을 내다보고 차근차근 계획해요' },
  { id: 'attention', name: '주의집중', praise: '헷갈리는 것 속에서도 집중을 잃지 않아요' },
  { id: 'language', name: '언어', praise: '말과 글을 잘 알아들어요' },
];

// 영역 뒤에 붙는 두 축: 답하는 속도 (문제마다 제한 시간 가운데 남긴 몫) · 운동 (목표 속도를 지킨 비율)
export const EXTRA_AXES = [
  { id: 'speed', name: '답하는 속도', praise: '보고 판단하는 속도가 빨라요' },
  { id: 'exercise', name: '운동', praise: '목표 속도를 꾸준히 지켰어요' },
];

export const AXES = [...DOMAINS, ...EXTRA_AXES];

// 게임마다 쓰는 영역: 1 = 주 영역, 0.5 = 부분 (기획 표에서 괄호로 적은 것). 미니게임 설명서(tools/manual.js)도 읽는다
export const DOMAIN_GAMES = {
  path: { spatial: 1, memory: 1 },          // 길 따라 그리기
  symbol: { memory: 1 },                    // 심볼 위치 외우기
  arith: { calc: 1 },                       // 사칙연산 역산
  count: { spatial: 1, executive: 0.5 },    // 우세한 색 찾기
  fit: { executive: 1, spatial: 1 },        // 빈자리 채우기
  seek: { spatial: 1 },                     // 숨은 순서 찾기
  cover: { calc: 1, memory: 1 },            // 가린 숫자 더하기
  pipe: { spatial: 1, executive: 1 },       // 배관 타기
  novel: { memory: 1 },                     // 없던 그림 찾기
  track: { attention: 1 },                  // 공 따라가기
  follow: { language: 1, attention: 1 },    // 지시 따르기
  pair: { attention: 1 },                   // 짝없는 것 찾기
  box: { calc: 1, attention: 1, memory: 1 }, // 상자 속 과일 세기
  compare: { spatial: 1 },                  // 두 그림 비교하기
  coin: { calc: 1, attention: 0.5 },        // 동전 세기
  recall: { memory: 1, attention: 1 },      // 차례대로 외우기
  chain: { executive: 1, spatial: 1 },      // 조각 잇기
  blank: { language: 1 },                   // 같은 글자 넣기
  safe: { calc: 1, executive: 0.5, attention: 0.5 }, // 금고 열기
  art: { memory: 1, spatial: 0.5 },         // 그림 조각 기억하기
  slit: { spatial: 1, attention: 0.5 },     // 물고기 엿보기
};

export const Abilities = {
  // stats = App.roundStats.games ({ id: { correct, total, think: { limitMs, spareMs } } }), exercise = 속도 유지율 0~1 (두뇌 게임만 한 판은 null)
  // → AXES 순서로 [{ id, name, praise, acc (0~1, 데이터가 없으면 null), hasData }]
  //   영역의 정답률 = 그 영역을 쓰는 게임들의 맞힌 수 / 낸 문제 수 (게임마다 영역 가중치를 곱해 더한다)
  //   답하는 속도 = 모든 문제의 제한 시간 가운데 남긴 시간의 몫 (시간 초과는 0). 제한 시간 막대를 끈 판에도 잰다 (main.js startQuestionTimer)
  compute(stats, exercise = null) {
    const correct = {};
    const total = {};
    let limitMs = 0;
    let spareMs = 0;
    for (const gameType of GAME_TYPES) {
      const gameStats = stats[gameType.id];
      if (!gameStats || !(gameStats.total > 0)) continue;
      for (const [domain, weight] of Object.entries(DOMAIN_GAMES[gameType.id] || {})) {
        correct[domain] = (correct[domain] || 0) + weight * gameStats.correct;
        total[domain] = (total[domain] || 0) + weight * gameStats.total;
      }
      if (gameStats.think && gameStats.think.limitMs > 0) {
        limitMs += gameStats.think.limitMs;
        spareMs += gameStats.think.spareMs;
      }
    }
    // 0~1 로 묶는다. 게임이 센 맞힌 수가 문제 수를 넘으면(예전에 피드백 중에 끝난 판) 100% 넘는 값이 그래프에 나왔다
    const share = (part, whole) => (whole > 0 ? Math.min(1, Math.max(0, part / whole)) : null);
    const acc = {
      ...Object.fromEntries(DOMAINS.map((domain) => [domain.id, share(correct[domain.id], total[domain.id])])),
      speed: share(spareMs, limitMs),
      exercise: exercise == null ? null : Math.min(1, Math.max(0, exercise)),
    };
    return AXES.map((axis) => ({ ...axis, acc: acc[axis.id], hasData: acc[axis.id] != null }));
  },

  // 회원 기록 항목 하나(js/history-entry.js 의 games · exAcc)로 그때의 두뇌 그래프를 지금 규칙으로 다시 계산한다.
  // games 가 없는 항목(이 필드를 더하기 전 태블릿 기록)은 null. 답하는 속도는 limitMs 를 잰 판(2026-11-20 부터)만 채워진다
  fromEntry(entry) {
    if (!entry || !entry.games) return null;
    const stats = {};
    for (const [id, game] of Object.entries(entry.games)) {
      stats[id] = { correct: game.correct || 0, total: game.total, think: game.limitMs > 0 ? { limitMs: game.limitMs, spareMs: game.spareMs || 0 } : null };
    }
    return this.compute(stats, entry.exAcc);
  },

  // 칭찬할 축: 데이터가 있는 인지 영역·답하는 속도 가운데 정답률이 가장 높은 것 (운동은 운동량 카드에서 따로 보여 준다).
  // PRAISE_MIN 에 못 미치면 칭찬하지 않는다 — 0% 인 영역을 '가장 돋보인 능력'이라 하면 오히려 힘이 빠진다
  PRAISE_MIN: 0.4,
  best(list) {
    const has = list.filter((axis) => axis.hasData && axis.id !== 'exercise' && axis.acc >= this.PRAISE_MIN);
    if (!has.length) return null;
    return has.reduce((best, axis) => (axis.acc > best.acc ? axis : best));
  },

  // 기록용: { 축 id: 0~1 (소수 둘째 자리) 또는 null }
  record(list) {
    return Object.fromEntries(list.map((axis) => [axis.id, axis.hasData ? Math.round(axis.acc * 100) / 100 : null]));
  },
};
