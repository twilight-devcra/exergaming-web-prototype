// 세션 성과·운동량 카드 (#tpl-report). 테스트 결과 화면(js/test-results.js)과 스테이션 결과 화면(js/demo.js)이 함께 쓴다.
import { $, Util } from './config.js';
import { Abilities } from './abilities.js';
import { Radar } from './radar.js';
import { Stars } from './stars.js';
import { Exercise } from './exercise.js';

export const RoundReport = {
  // 빈 카드 하나 (결과 화면에 붙인 뒤 fill 로 채운다)
  card() {
    return $('#tpl-report').content.cloneNode(true);
  },

  // root 안의 카드를 이번 라운드로 채운다. 두뇌 그래프(영역별 정답률 · 답하는 속도 · 운동, js/abilities.js)도 그린다
  // 반환: { abilityAxes(두뇌 그래프의 축들), keep(속도 유지율 %), kcal, gameAccuracy(게임 정확도 0~1 또는 null), recommendation(권하는 다음 난이도, js/stars.js) }
  // 속도 유지율 (%, 0~100): 운동 점수 ÷ 이 라운드에서 받을 수 있던 운동 점수. 회원 기록(app/members.js)에도 남긴다
  keep(app) {
    const { config } = app;
    const exerciseMax = Math.floor(config.durationSec / config.tickSec) * config.tickMaxPoints;
    return Util.clamp(Math.round((app.exScore / exerciseMax) * 100), 0, 100);
  },

  fill(app, root) {
    const { meter } = app;
    const field = (name) => root.querySelector(`.rp-${name}`);
    const games = app.roundStats.games;
    const keep = this.keep(app);
    const abilityAxes = Abilities.compute(games, app.brainOnly ? null : keep / 100);
    Radar.render(field('radar'), abilityAxes);
    // 가장 잘한 영역을 칭찬한다. 칭찬할 만큼 잘한 영역이 없으면 북돋는 말 한 줄 (푼 문제가 하나도 없으면 비운다)
    const best = Abilities.best(abilityAxes);
    const played = abilityAxes.some((axis) => axis.hasData && axis.id !== 'exercise');
    field('best').innerHTML = best ? `오늘 가장 돋보인 능력 <b>${best.name}</b><small>${best.praise}</small>`
      : played ? '처음엔 누구나 어려워요<small>꾸준히 하면 그래프가 점점 넓어져요</small>' : '';
    const kcal = meter.kcal;
    const gameAccuracy = Stars.gameAccuracy(games);
    const recommendation = fillRecommendation(app, root, gameAccuracy);
    const distance = Exercise.formatDistance(meter.distM);
    field('dist').textContent = distance.value;
    field('dist-unit').textContent = distance.unit;
    field('kcal').textContent = kcal < 10 ? kcal.toFixed(1) : String(Math.round(kcal));
    field('revs').textContent = `${Math.round(meter.revs).toLocaleString('ko-KR')}바퀴`;
    field('time').textContent = Util.formatTime(meter.activeSec);
    field('rpm').textContent = `${Math.round(meter.avgRpm)} RPM`;
    field('keep').textContent = `${keep}%`;
    // 두뇌 게임만 한 판: 운동량 대신 안내 한 줄 (app.css · style.css 의 .dr-ex.brain-only)
    root.querySelector('.dr-ex').classList.toggle('brain-only', !!app.brainOnly);
    return { abilityAxes, keep, kcal, gameAccuracy, recommendation };
  },
};

// 세션 성과 카드의 다음 난이도 상자: 게임 정답률이 높으면 올리기, 낮으면 내리기, 그 사이면 이대로 (js/stars.js)
// 운영 버전은 고른 세션 난이도(SESSION_DIFFICULTIES)로, 테스트 화면은 라운드 난이도 프리셋(ROUND_PRESETS)으로 다음 단계를 찾는다
function fillRecommendation(app, root, gameAccuracy) {
  // 세션 설정 화면에서 고른 세션 (운영 버전만 고른다)
  const session = app.log && app.log.meta.session;
  // 세션 난이도를 고르지 않은 판(시연 프로토타입)은 목록이 없으니 오르내리지 않고 이대로 계속하기만 권한다
  const recommendation = session ? Stars.nextSession(session.difficulty, gameAccuracy)
    : Stars.nextPreset(app.edition.roundPreset(app), gameAccuracy);
  const box = root.querySelector('.rp-rec');
  box.className = `st-rec rp-rec ${recommendation.kind}`;
  // 운영 버전의 회원(손님도 결과에서 번호를 받는다)은 다음 세션 설정에 이 난이도가 미리 골라져 있다 (app/members.js)
  const keepsIt = session && app.edition.remembersSetup(app);
  // up·down: '다음엔 <b>보통</b>으로 …' (회원이면 미리 골라 둔다고, 아니면 골라 보라고)
  const nextLevelText = recommendation.target && `다음엔 <b>${recommendation.target.label}</b>${particleRo(recommendation.target.label)}`;
  box.innerHTML = recommendation.kind === 'up' ? `실력이 늘었어요! ${nextLevelText} 한 단계 ${keepsIt ? '올려 둘게요' : '올려 보세요'}`
    : recommendation.kind === 'down' ? `무리하지 않아도 괜찮아요. ${nextLevelText} 편하게 ${keepsIt ? '해 볼게요' : '해 보세요'}`
    : {
      top: '가장 높은 난이도에서도 아주 잘하셨어요! <b>이대로 계속</b>해요',
      bottom: '처음엔 누구나 어려워요. <b>천천히 꾸준히</b> 해 봐요',
      nodata: '다음에도 <b>꾸준히</b> 함께해요',
      fit: '지금 난이도가 딱 알맞아요. <b>이대로 꾸준히</b> 해 봐요',
    }[recommendation.why];
  return recommendation;
}

// 조사 '(으)로': 받침이 있으면(ㄹ 받침 빼고) '으로', 없으면 '로' (도전으로 · 보통으로 · 편안하게로)
function particleRo(word) {
  const syllable = word.charCodeAt(word.length - 1) - 0xac00;
  return syllable >= 0 && syllable < 11172 && syllable % 28 && syllable % 28 !== 8 ? '으로' : '로';
}
