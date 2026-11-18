// 인지 능력 점수 (세션 로그·참가 기록용. 결과 화면에는 2026-11-18 부터 그리지 않고 별점(js/stars.js)을 보여 준다)
// 게임 하나가 축 하나가 아니라, 게임마다 여러 능력 축에 가중치를 나눠 준다 (docs/DEMO_BRIEF.md).
// 축마다 둘 이상의 게임이 들어가므로 짧은 라운드에서 어떤 게임을 못 해도 모든 축이 채워진다.
// 과학적으로 정확할 필요는 없다. 아래 표의 숫자는 플레이해 보며 감으로 다듬는다.
// 능력마다 만점 기준이 없으므로 '어느 난이도까지 해냈나' 를 별 1~5개(반 개 단위)로 보여 준다.
// 별 수 ≈ 해낸 레벨이라 짧은 라운드에서는 2~3개가 보통이고, 더 올라갈 자리가 남는다.
import { BASE_LEVEL, U } from './config.js';
import { GAME_TYPES } from './games/index.js';

export const ABILITIES = [
  { id: 'memory', name: '기억력', praise: '본 것을 오래 또렷하게 기억해요' },
  { id: 'spatial', name: '공간지각', praise: '모양과 위치를 한눈에 파악해요' },
  { id: 'attention', name: '주의집중', praise: '헷갈리는 것 속에서도 집중을 잃지 않아요' },
  { id: 'logic', name: '논리·수리', praise: '숫자와 규칙을 차근차근 풀어내요' },
  { id: 'speed', name: '처리속도', praise: '보고 판단하는 속도가 빨라요' },
];

// 아래 두 표는 미니게임 설명서(tools/manual.js)도 읽는다
export const ABILITY_WEIGHTS = {
  path: { memory: 0.5, spatial: 0.4, attention: 0.1 },
  symbol: { memory: 0.6, spatial: 0.3, attention: 0.1 },
  arith: { memory: 0.2, attention: 0.1, logic: 0.7 },
  count: { attention: 0.5, speed: 0.5 },
  fit: { spatial: 0.6, logic: 0.4 },
  seek: { spatial: 0.3, attention: 0.4, speed: 0.3 },
  cover: { memory: 0.6, attention: 0.1, logic: 0.3 },
  ladder: { spatial: 0.3, attention: 0.5, speed: 0.2 },
  novel: { memory: 0.6, attention: 0.4 },
  track: { attention: 0.6, spatial: 0.3, speed: 0.1 },
  follow: { attention: 0.5, logic: 0.3, memory: 0.2 },
  pair: { attention: 0.5, spatial: 0.2, speed: 0.3 },
  box: { memory: 0.5, attention: 0.3, logic: 0.2 },
  compare: { attention: 0.7, speed: 0.3 },
  coin: { spatial: 0.4, logic: 0.4, attention: 0.2 },
  recall: { memory: 0.7, attention: 0.3 },
  chain: { logic: 0.5, spatial: 0.3, attention: 0.2 },
  blank: { memory: 0.5, logic: 0.3, attention: 0.2 }, // 언어 축이 없어 낱말 인출(의미 기억)을 기억력에, 모든 낱말에 맞춰 보는 것을 논리에 둔다
};

// 처리속도 축에 들어가는 게임은 문제당 걸린 시간도 본다 (정답 피드백·연출 시간 포함, 초).
// fast 이하면 그대로, slow 이상이면 그 게임의 처리속도 몫을 PACE_MIN 배로 깎는다. 문제를 고르는 동안의 시간만 따로 재지 않으므로 대략값이다.
export const ABILITY_PACE = {
  count: { fast: 4, slow: 14 },
  seek: { fast: 5, slow: 18 },
  ladder: { fast: 5, slow: 15 },
  pair: { fast: 4, slow: 12 },
  compare: { fast: 4, slow: 10 },
};

export const Abilities = {
  MAX_STARS: 5,
  MIN_STARS: 1,    // 데이터가 있으면 적어도 별 하나
  STAR_BONUS: 0.5, // 별 = 해낸 레벨 + 이만큼
  PACE_MIN: 0.6,

  // 별은 원래의 단계 체계로 센다: 원래의 첫 단계 Lv3(BASE_LEVEL)이 1이고, 그 아래 쉬운 단계 Lv1·Lv2 는 1/3·2/3 이다.
  // (쉬운 단계를 더하기 전과 같은 판이면 같은 별이 나온다)
  effLevel(lv) {
    return lv >= BASE_LEVEL ? lv - BASE_LEVEL + 1 : lv / BASE_LEVEL;
  },

  // 판 하나에서 해낸 레벨 = (레벨 − 1) + 정확도 (레벨은 effLevel, 0 아래로는 내려가지 않는다): Lv5 를 다 맞히면 3, 절반이면 2.5, Lv3 을 다 틀리면 0.
  // 축 하나 = 관련 게임 판들의 가중 평균. 가중치 = 게임 가중치(ABILITY_WEIGHTS) × 레벨 — 높은 레벨에서 해낸(또는 놓친) 판이
  // 몸풀기 첫 단계보다 크게 친다. 라운드 앞쪽 게임은 늘 시작 단계라, 레벨로 가중하지 않으면 모두가 낮게 나온다.
  // stats: App.stats ({ id: { runs: [[레벨, 맞힌 수, 문제 수]…], total, ms } })
  // → [{ id, name, praise, stars(1~5, 0.5 단위), value(그래프용 0~100), raw(해낸 레벨, 데이터 없으면 null), hasData }]
  compute(stats) {
    const sum = {};
    const wsum = {};
    for (const T of GAME_TYPES) {
      const s = stats[T.id];
      const w = ABILITY_WEIGHTS[T.id];
      if (!s || !w || !s.runs) continue;
      // 처리속도 몫은 그 게임의 문제당 평균 시간으로 깎는다
      const pace = ABILITY_PACE[T.id];
      let paceK = 1;
      if (pace && s.ms > 0 && s.total > 0) {
        const per = s.ms / 1000 / s.total;
        const f = U.clamp((pace.slow - per) / (pace.slow - pace.fast), 0, 1);
        paceK = this.PACE_MIN + (1 - this.PACE_MIN) * f;
      }
      for (const [level, correct, total] of s.runs) {
        if (total <= 0) continue;
        const lv = this.effLevel(level);
        const d = Math.max(0, lv - 1 + correct / total);
        for (const [axis, k] of Object.entries(w)) {
          sum[axis] = (sum[axis] || 0) + k * lv * (axis === 'speed' ? d * paceK : d);
          wsum[axis] = (wsum[axis] || 0) + k * lv;
        }
      }
    }
    return ABILITIES.map((a) => {
      const has = wsum[a.id] > 0;
      const raw = has ? sum[a.id] / wsum[a.id] : null;
      const stars = has ? U.clamp(Math.round((raw + this.STAR_BONUS) * 2) / 2, this.MIN_STARS, this.MAX_STARS) : 0;
      // 데이터가 없는 축은 별 하나 자리에 흐리게 그린다
      const value = ((has ? stars : this.MIN_STARS) / this.MAX_STARS) * 100;
      return { ...a, stars, value, raw: has ? Math.round(raw * 100) / 100 : null, hasData: has };
    });
  },

  // 데이터가 있는 축 중 별이 가장 많은 것 (같으면 해낸 레벨이 높은 것)
  best(list) {
    const has = list.filter((a) => a.hasData);
    if (!has.length) return null;
    return has.reduce((b, a) => (a.stars > b.stars || (a.stars === b.stars && a.raw > b.raw) ? a : b));
  },
};

