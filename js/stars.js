// 결과 화면의 '이번 세션 성과' 카드 (예전의 두뇌 그래프 자리, 2026-11-18).
// 운동(목표 속도를 지킨 비율 = 운동 점수 / 만점)과 인지(게임에서 맞힌 문제 / 낸 문제)를 별 5개(반 개 단위)로 나란히 보여 준다.
// 그 아래 상자는 늘 보인다: 게임 정확도가 RECOMMEND_UP 이상이면 한 단계 올리기(up), RECOMMEND_DOWN 아래면 한 단계 내리기(down),
// 그 사이이거나 오르내릴 난이도가 없으면 이대로 계속하기(keep).
// 운영 버전은 회원이 다음에 들어올 때 올리거나 내린 난이도를 미리 골라 둔다 (app/members.js). 서버도 같은 식으로 gameAcc 를 뽑는다 (api/server.js summarize)
import { SESSION_DIFFICULTIES, ROUND_PRESETS, U } from './config.js';

export const Stars = {
  MAX: 5,
  // 이 정확도 이상이면 다음엔 한 단계 위를 권한다. adaptive 난이도는 정답률이 난이도마다 정한 hold(55~80%) 근처에 머물도록
  // 오르내리므로, 그보다 넉넉히 높으면 그 난이도의 최고 레벨에 닿아서도 계속 맞혔다는 뜻이다
  RECOMMEND_UP: 0.90,
  // 이 정확도 아래면 다음엔 한 단계 아래를 권한다. 가장 쉬운 '편안하게'도 80% 근처에 머물도록 맞춘 것이라,
  // 절반도 못 맞혔다면 그 난이도의 가장 낮은 레벨에서도 버거웠다는 뜻이다
  RECOMMEND_DOWN: 0.65,

  // 정확도(0~1) → 별 0~5 (반 개 단위, 10% 에 반 개). 95% 이상이면 5개, 85% 면 4개 반
  of(acc) {
    return acc == null ? 0 : Math.round(U.clamp(acc, 0, 1) * this.MAX * 2) / 2;
  },

  // App.stats → 게임 정확도 0~1 (문제가 하나도 없으면 null)
  gameAcc(stats) {
    let c = 0, t = 0;
    for (const s of Object.values(stats || {})) {
      if (!s) continue;
      c += s.correct || 0;
      t += s.total || 0;
    }
    return t > 0 ? c / t : null;
  },

  // 다음 난이도 권하기. list = 쉬운 것부터 어려운 것 순서의 난이도 목록, id = 이번 난이도 (목록에 없으면 오르내리지 않는다)
  //   → { kind: 'up' | 'keep' | 'down', to: { id, label } (up·down 일 때), why }
  //   why (keep 일 때 까닭): 'fit' 알맞음 · 'top' 가장 높은 난이도에서 잘함 · 'bottom' 가장 쉬운 난이도에서 어려워함 · 'nodata' 푼 문제 없음
  advise(list, id, acc) {
    const i = list.findIndex((d) => d.id === id);
    const pick = (d) => ({ id: d.id, label: d.label });
    if (acc == null) return { kind: 'keep', why: 'nodata' };
    if (acc >= this.RECOMMEND_UP) {
      return i >= 0 && list[i + 1] ? { kind: 'up', to: pick(list[i + 1]) } : { kind: 'keep', why: i >= 0 ? 'top' : 'fit' };
    }
    if (acc < this.RECOMMEND_DOWN) {
      return i > 0 ? { kind: 'down', to: pick(list[i - 1]) } : { kind: 'keep', why: i === 0 ? 'bottom' : 'fit' };
    }
    return { kind: 'keep', why: 'fit' };
  },
  // 운영 버전의 세션 난이도 (SESSION_DIFFICULTIES)
  nextSession(id, acc) {
    return this.advise(SESSION_DIFFICULTIES, id, acc);
  },
  // 테스트 화면의 라운드 난이도 프리셋 (ROUND_PRESETS). 'custom' 이면 오르내리지 않고 이대로 계속하기만 권한다
  nextPreset(id, acc) {
    return this.advise(ROUND_PRESETS, id, acc);
  },

  // 별 다섯 개 SVG. 칠한 별을 안쪽 svg 로 잘라 반 개를 그린다 (그라디언트 id 를 쓰지 않아 결과 카드가 두 벌 있어도 괜찮다)
  STEP: 26,
  star(cx, cy, r) {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.46 : r;
      d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
    }
    return d + 'Z';
  },
  svg(stars) {
    const S = this.STEP;
    const w = S * this.MAX;
    const row = Array.from({ length: this.MAX }, (_, i) => this.star(S * i + S / 2, S / 2 + 1, S / 2 - 1)).join('');
    const on = S * stars;
    return `<svg class="st-svg" viewBox="0 0 ${w} ${S + 2}" role="img" aria-label="별 ${stars}개">` +
      `<path class="st-off" d="${row}"/>` +
      (on > 0 ? `<svg width="${on}" height="${S + 2}" viewBox="0 0 ${on} ${S + 2}"><path class="st-on" d="${row}"/></svg>` : '') +
      '</svg>';
  },
};
