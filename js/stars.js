// 결과 화면 '이번 세션 성과' 카드의 다음 난이도 권하기 (게임 정확도 = 게임에서 맞힌 문제 / 낸 문제).
// 운동·인지를 별 5개로 보여 주던 칸은 2026-11-20 에 뺐다 (두뇌 그래프를 크게 그리려고, js/radar.js). 상자는 늘 보인다: 게임 정확도가 RECOMMEND_UP 이상이면 한 단계 올리기(up), RECOMMEND_DOWN 아래면 한 단계 내리기(down),
// 그 사이이거나 오르내릴 난이도가 없으면 이대로 계속하기(keep).
// 운영 버전은 회원이 다음에 들어올 때 올리거나 내린 난이도를 미리 골라 둔다 (app/members.js). 서버도 같은 식으로 gameAcc 를 뽑는다 (js/history-entry.js summarize, 서버와 태블릿이 함께 쓴다)
import { SESSION_DIFFICULTIES, ROUND_PRESETS } from './config.js';

export const Stars = {
  // 이 정확도 이상이면 다음엔 한 단계 위를 권한다. adaptive 난이도는 정답률이 난이도마다 정한 hold(55~80%) 근처에 머물도록
  // 오르내리므로, 그보다 넉넉히 높으면 그 난이도의 최고 레벨에 닿아서도 계속 맞혔다는 뜻이다
  RECOMMEND_UP: 0.90,
  // 이 정확도 아래면 다음엔 한 단계 아래를 권한다. 가장 쉬운 '편안하게'도 80% 근처에 머물도록 맞춘 것이라,
  // 절반도 못 맞혔다면 그 난이도의 가장 낮은 레벨에서도 버거웠다는 뜻이다
  RECOMMEND_DOWN: 0.65,

  // App.roundStats.games → 게임 정확도 0~1 (문제가 하나도 없으면 null)
  gameAccuracy(stats) {
    let correct = 0, total = 0;
    for (const gameStats of Object.values(stats || {})) {
      if (!gameStats) continue;
      correct += gameStats.correct || 0;
      total += gameStats.total || 0;
    }
    return total > 0 ? correct / total : null;
  },

  // 다음 난이도 권하기. list = 쉬운 것부터 어려운 것 순서의 난이도 목록, id = 이번 난이도 (목록에 없으면 오르내리지 않는다),
  // accuracy = 게임 정확도 0~1
  //   → { kind: 'up' | 'keep' | 'down', to: { id, label } (up·down 일 때), why }
  //   why (keep 일 때 까닭): 'fit' 알맞음 · 'top' 가장 높은 난이도에서 잘함 · 'bottom' 가장 쉬운 난이도에서 어려워함 · 'nodata' 푼 문제 없음
  advise(list, id, accuracy) {
    const i = list.findIndex((difficulty) => difficulty.id === id);
    const pick = (difficulty) => ({ id: difficulty.id, label: difficulty.label });
    if (accuracy == null) return { kind: 'keep', why: 'nodata' };
    if (accuracy >= this.RECOMMEND_UP) {
      return i >= 0 && list[i + 1] ? { kind: 'up', target: pick(list[i + 1]) } : { kind: 'keep', why: i >= 0 ? 'top' : 'fit' };
    }
    if (accuracy < this.RECOMMEND_DOWN) {
      return i > 0 ? { kind: 'down', target: pick(list[i - 1]) } : { kind: 'keep', why: i === 0 ? 'bottom' : 'fit' };
    }
    return { kind: 'keep', why: 'fit' };
  },
  // 운영 버전의 세션 난이도 (SESSION_DIFFICULTIES)
  nextSession(id, accuracy) {
    return this.advise(SESSION_DIFFICULTIES, id, accuracy);
  },
  // 테스트 화면의 라운드 난이도 프리셋 (ROUND_PRESETS). 'custom' 이면 오르내리지 않고 이대로 계속하기만 권한다
  nextPreset(id, accuracy) {
    return this.advise(ROUND_PRESETS, id, accuracy);
  },
};
