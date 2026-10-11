// 시연 환경에 맞춰 조절 가능한 설정값. 메뉴 화면의 '시연 설정'에서 바꾼 값은 localStorage에 저장된다.
const DEFAULT_CONFIG = {
  durationSec: 180,          // 라운드 길이 (인지 게임 진행과 무관하게 고정)
  calibrationSec: 15,        // 시작 전 편안한 속도 측정 시간
  calibrationIgnoreSec: 4,   // 측정 초반 가속 구간은 기준값 계산에서 제외
  tolerance: 0.12,           // 목표 RPM 대비 허용 구역 (±12%)
  maxDeviation: 0.45,        // 공이 화면 끝까지 밀려나는 편차
  tickSec: 1,                // 운동 점수 취득 간격
  tickMaxPoints: 10,         // 틱당 최대 운동 점수
  rpmChange: true,           // 라운드 중 목표 RPM 변화 여부
  rpmChangeSegmentSec: 40,   // 목표 RPM 변화 주기
  rpmChangeAmount: 0.12,     // 목표 RPM 변화폭
  rpmRampSec: 12,            // 목표 RPM이 다음 값까지 서서히 바뀌는 데 걸리는 시간
  sound: true,
  cogBasePoints: 100,        // 인지 게임 1회를 완벽히 했을 때의 기본 점수 (모든 유형 동일)
  multiplierStep: 0.2,       // 난이도 1단계당 배율 증가 (Lv1 x1.0, Lv2 x1.2 ...)
  fallbackRpm: 60,           // 측정 실패 시 사용할 기준 RPM
  minRpm: 25,
};

const Config = {
  load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('exergame.config') || '{}'); } catch (e) {}
    return Object.assign({}, DEFAULT_CONFIG, saved);
  },
  save(cfg) {
    try { localStorage.setItem('exergame.config', JSON.stringify(cfg)); } catch (e) {}
  },
};

// 공용 유틸
const U = {
  rand: (n) => Math.floor(Math.random() * n),
  randInt: (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1)),
  clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },
  el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  },
  fmtTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  },
};
