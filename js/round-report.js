// 세션 성과·운동량 카드 (#tpl-report). 테스트 결과 화면(js/test-results.js)과 스테이션 결과 화면(js/demo.js)이 함께 쓴다.
import { $, U } from './config.js';
import { Abilities } from './abilities.js';
import { Stars } from './stars.js';
import { Exercise } from './exercise.js';

export const RoundReport = {
  // 빈 카드 하나 (결과 화면에 붙인 뒤 fill 로 채운다)
  card() {
    return $('#tpl-report').content.cloneNode(true);
  },

  // root 안의 카드를 이번 라운드로 채운다. 능력 점수(abil)는 화면에 그리지 않지만 세션 로그·참가 기록에 남긴다 (js/abilities.js)
  // 반환: { abil(능력 점수), keep(속도 유지율 %), kcal, gameAcc(게임 정확도 0~1 또는 null), rec(권하는 다음 난이도, js/stars.js) }
  fill(app, root) {
    const { cfg, meter } = app;
    const field = (cls) => root.querySelector(`.rp-${cls}`);
    const games = app.roundStats.games;
    const abil = Abilities.compute(games);
    const exMax = Math.floor(cfg.durationSec / cfg.tickSec) * cfg.tickMaxPoints;
    const keep = U.clamp(Math.round((app.exScore / exMax) * 100), 0, 100);
    const kcal = meter.kcal;
    const gameAcc = Stars.gameAcc(games);
    const rec = fillStars(app, root, keep, gameAcc);
    const dist = Exercise.fmtDist(meter.distM);
    field('dist').textContent = dist.value;
    field('dist-unit').textContent = dist.unit;
    field('kcal').textContent = kcal < 10 ? kcal.toFixed(1) : String(Math.round(kcal));
    field('revs').textContent = `${Math.round(meter.revs).toLocaleString('ko-KR')}바퀴`;
    field('time').textContent = U.fmtTime(meter.activeSec);
    field('rpm').textContent = `${Math.round(meter.avgRpm)} RPM`;
    field('keep').textContent = `${keep}%`;
    // 두뇌 게임만 한 판: 운동량 대신 안내 한 줄 (app.css · style.css 의 .dr-ex.brain-only)
    root.querySelector('.dr-ex').classList.toggle('brain-only', !!app.brainOnly);
    return { abil, keep, kcal, gameAcc, rec };
  },
};

// 세션 성과 카드: 운동(속도 유지율 %) · 인지(게임 정답률) 별을 나란히, 그리고 게임 정답률이 높으면 다음 난이도 권하기
// 운영 버전은 고른 세션 난이도(SESSION_DIFFICULTIES)로, 테스트 화면은 라운드 난이도 프리셋(ROUND_PRESETS)으로 다음 단계를 찾는다
function fillStars(app, root, keep, gameAcc) {
  const row = (cls, acc) => {
    const el = root.querySelector(`.rp-${cls}`);
    el.classList.toggle('nodata', acc == null);
    el.querySelector('.st-pct').textContent = acc == null ? '–' : `${Math.round(acc * 100)}%`;
    el.querySelector('.st-stars').innerHTML = Stars.svg(Stars.of(acc));
  };
  row('st-ex', app.brainOnly ? null : keep / 100); // 두뇌 게임만 한 판은 '–' 와 흐린 별
  row('st-game', gameAcc);

  // 세션 설정 화면에서 고른 세션 (운영 버전만 고른다)
  const session = app.log && app.log.meta.session;
  // 세션 난이도를 고르지 않은 판(시연 프로토타입)은 목록이 없으니 오르내리지 않고 이대로 계속하기만 권한다
  const rec = session ? Stars.nextSession(session.difficulty, gameAcc)
    : Stars.nextPreset(app.edition.roundPreset(app), gameAcc);
  const el = root.querySelector('.rp-rec');
  el.className = `st-rec rp-rec ${rec.kind}`;
  // 운영 버전의 회원(손님도 결과에서 번호를 받는다)은 다음 세션 설정에 이 난이도가 미리 골라져 있다 (app/members.js)
  const keepsIt = session && app.edition.remembersSetup(app);
  // up·down: '다음엔 <b>보통</b>으로 …' (회원이면 미리 골라 둔다고, 아니면 골라 보라고)
  const to = rec.to && `다음엔 <b>${rec.to.label}</b>${particleRo(rec.to.label)}`;
  el.innerHTML = rec.kind === 'up' ? `실력이 늘었어요! ${to} 한 단계 ${keepsIt ? '올려 둘게요' : '올려 보세요'}`
    : rec.kind === 'down' ? `무리하지 않아도 괜찮아요. ${to} 편하게 ${keepsIt ? '해 볼게요' : '해 보세요'}`
    : {
      top: '가장 높은 난이도에서도 아주 잘하셨어요! <b>이대로 계속</b>해요',
      bottom: '처음엔 누구나 어려워요. <b>천천히 꾸준히</b> 해 봐요',
      nodata: '다음에도 <b>꾸준히</b> 함께해요',
      fit: '지금 난이도가 딱 알맞아요. <b>이대로 꾸준히</b> 해 봐요',
    }[rec.why];
  return rec;
}

// 조사 '(으)로': 받침이 있으면(ㄹ 받침 빼고) '으로', 없으면 '로' (도전으로 · 보통으로 · 편안하게로)
function particleRo(word) {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  return c >= 0 && c < 11172 && c % 28 && c % 28 !== 8 ? '으로' : '로';
}
