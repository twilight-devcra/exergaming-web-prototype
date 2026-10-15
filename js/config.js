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
  rpmChangeSegmentSec: 40,   // 속도 전환 구간 사이의 최소 간격. 지나면 진행 중인 인지 게임이 끝난 뒤 전환한다
  rpmChangeAmount: 0.12,     // 목표 RPM 변화폭
  shiftSec: 8,               // 속도 전환 구간 길이. 이 동안은 인지 게임 없이 새 속도에 맞추기만 한다
  shiftRampSec: 3,           // 그중 목표 RPM이 새 값까지 서서히 바뀌는 시간 (나머지는 적응 시간)
  sound: true,
  rpmSource: 'zc',           // 페달 센서 속도 측정 방식: zc 파형 영교차 | comb 파형 결합 | teo 파형 모양 | pedal 페달 avg_rpm
  games: null,               // 라운드에 넣을 인지 게임 id 목록 (null = 전체). 메뉴의 '사용할 게임'에서 바뀐다.
  cogBasePoints: 100,        // 인지 게임 1회를 완벽히 했을 때의 기본 점수 (모든 유형 동일)
  startLevel: 1,             // 라운드를 시작할 난이도. 올리면 쉬운 단계를 건너뛰고 바로 어려운 문제부터 나온다
  multiplierStep: 0.2,       // 난이도 1단계당 배율 증가 (Lv1 x1.0, Lv2 x1.2 ...)
  questionTimer: true,       // 문제마다 제한 시간. 시간이 다 되면 그 문제는 틀린 것으로 친다
  // 문제 하나의 제한 시간(초) = base + per × 일의 양. 입력을 받기 시작한 때부터 잰다.
  // 일의 양 — path: 눌러야 할 칸 수 · arith: 빈칸 수 · symbol: 1 · count: 켜진 칸 수 · fit: 보기 조각 수 · seek: 판의 칸 수
  questionTime: {
    path: { base: 3, per: 1.2 },     // 5칸 9초 ~ 14칸 20초
    symbol: { base: 6, per: 0 },     // 6초
    arith: { base: 6, per: 5 },      // 빈칸 2개 16초 ~ 3개 21초
    count: { base: 5, per: 0.3 },    // 12칸 9초 ~ 25칸 13초
    fit: { base: 5, per: 1.5 },      // 조각 3개 10초 ~ 6개 14초
    seek: { base: 6, per: 0.25 },    // 19칸 11초 ~ 61칸 21초
  },
  fallbackRpm: 60,           // 측정 실패 시 사용할 기준 RPM
  minRpm: 25,
};

// 시연 행사 스테이션 모드(index.html?demo)의 고정 설정. localStorage 값은 쓰지 않고 DEFAULT_CONFIG 위에 이것만 덮는다.
// 상품을 걸고 점수를 비교하므로 모든 스테이션이 같은 설정이어야 한다. 바꾸려면 여기를 고쳐서 배포한다.
const DEMO_CONFIG = {
  durationSec: 300,
  games: null,
  startLevel: 1,
  sound: true,
  rpmSource: 'zc',
};
// 스테이션 모드에서 운영 메뉴를 여는 PIN (왼쪽 위 모서리를 2초 길게 누른 뒤 입력)
const DEMO_OPERATOR_PIN = '2580';

const Config = {
  // 스테이션 모드: 저장된 값과 무관하게 언제나 같은 설정
  demo() {
    return Object.assign({}, DEFAULT_CONFIG, DEMO_CONFIG);
  },
  load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('exergame.config') || '{}'); } catch (e) {}
    // 제한 시간 표는 화면에서 바꾸지 않으므로 늘 코드의 값을 쓴다 (예전에 저장된 표가 고친 값을 덮지 않게)
    return Object.assign({}, DEFAULT_CONFIG, saved, { questionTime: DEFAULT_CONFIG.questionTime });
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
