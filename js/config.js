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
  difficulty: 'adaptive',    // 난이도 방식: adaptive 정답·오답으로 오르내림 | cycle 게임을 한 바퀴 돌 때마다 +1
  // adaptive: 모든 게임이 함께 쓰는 난이도 계기판. 정답마다 diffUp 만큼 오르고 오답(시간 초과 포함)마다 diffDown 만큼 내려간다.
  // 다음 게임의 레벨 = 계기판의 정수 부분. 세 문제를 다 맞히면 한 단계 넘게 오르고, 2/3 면 조금 오르고, 1/3 이하면 내려간다
  // (맞히는 비율이 diffDown / (diffUp + diffDown) = 60% 근처에서 머문다). 5분 라운드는 답이 20개 남짓이라 빨리 올라야 한다.
  // 길 따라 그리기는 길 하나가 답 하나다.
  diffUp: 0.4,
  diffDown: 0.6,
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

// 시연 행사 스테이션 모드(index.html?demo)의 설정. 테스트 화면의 localStorage 값은 쓰지 않고 DEFAULT_CONFIG 위에 이것을 덮는다.
// 그 위에 운영 메뉴의 '시간·점수 설정'(DEMO_SETTINGS 의 항목만)을 태블릿마다 저장해 덮는다.
// 상품을 걸고 점수를 비교하므로 모든 스테이션이 같은 설정이어야 한다 — 운영 메뉴의 설정 코드(Config.demoCode)로 맞춰 본다.
const DEMO_CONFIG = {
  durationSec: 300,
  games: null,
  startLevel: 1,
  difficulty: 'adaptive',
  sound: true,
  rpmSource: 'zc',
};
// 운영 메뉴에서 바꿀 수 있는 항목 (라운드 시간과 점수에 관한 것만). scale = 화면에 보일 때 곱하는 값
const DEMO_SETTINGS = [
  { key: 'durationSec', label: '라운드 길이 (초)', min: 60, max: 900, step: 15 },
  { key: 'tolerance', label: '허용 구역 (±%)', min: 3, max: 40, step: 1, scale: 100 },
  { key: 'tickMaxPoints', label: '운동 점수 (초당 최대)', min: 1, max: 100, step: 1 },
  { key: 'cogBasePoints', label: '인지 게임 기본 점수 (한 판 다 맞히면)', min: 10, max: 1000, step: 10 },
  { key: 'multiplierStep', label: '난이도 1단계당 점수 배율 증가', min: 0, max: 1, step: 0.05 },
  { key: 'difficulty', label: '난이도 방식', options: [['adaptive', '정답·오답에 따라 오르내림'], ['cycle', '한 바퀴 돌 때마다 +1']] },
  { key: 'startLevel', label: '시작 난이도', min: 1, max: 6, step: 1 },
  { key: 'diffUp', label: '정답 하나에 난이도 + (오르내림 방식)', min: 0.05, max: 2, step: 0.05 },
  { key: 'diffDown', label: '오답 하나에 난이도 − (오르내림 방식)', min: 0.05, max: 2, step: 0.05 },
];
const DEMO_SETTINGS_KEY = 'exergame.demo.cfg';

// 스테이션 모드에서 운영 메뉴를 여는 PIN (왼쪽 위 모서리를 2초 길게 누른 뒤 입력)
const DEMO_OPERATOR_PIN = '2580';

const Config = {
  // 스테이션 모드: 테스트 화면의 저장값과 무관하다. 운영 메뉴에서 바꾼 DEMO_SETTINGS 항목만 덮는다
  demo() {
    return Object.assign({}, DEFAULT_CONFIG, DEMO_CONFIG, this.demoSaved());
  },
  demoDefaults() {
    const c = Object.assign({}, DEFAULT_CONFIG, DEMO_CONFIG);
    return Object.fromEntries(DEMO_SETTINGS.map((s) => [s.key, c[s.key]]));
  },
  demoSaved() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(DEMO_SETTINGS_KEY) || '{}'); } catch (e) {}
    return Object.fromEntries(DEMO_SETTINGS.filter((s) => s.key in saved).map((s) => [s.key, saved[s.key]]));
  },
  // 기본값과 같은 항목은 저장하지 않는다 (DEMO_CONFIG 를 고쳐 배포하면 바꾸지 않은 항목은 새 값을 따른다)
  demoSave(values) {
    const def = this.demoDefaults();
    const diff = Object.fromEntries(Object.entries(values).filter(([k, v]) => v !== def[k]));
    try {
      if (Object.keys(diff).length) localStorage.setItem(DEMO_SETTINGS_KEY, JSON.stringify(diff));
      else localStorage.removeItem(DEMO_SETTINGS_KEY);
    } catch (e) {}
  },
  // 스테이션끼리 설정이 같은지 맞춰 보는 4자리 코드 (DEMO_SETTINGS 값으로 만든 해시)
  demoCode(cfg) {
    const str = JSON.stringify(DEMO_SETTINGS.map((s) => cfg[s.key]));
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
    return ((h >>> 0) % 0x10000).toString(16).toUpperCase().padStart(4, '0');
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
