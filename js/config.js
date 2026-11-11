// 조절 가능한 설정값. 테스트 화면(메뉴)의 설정 탭에서 바꾼 값은 localStorage에 저장된다.

// 난이도 단계. Lv1·Lv2 는 50~60대에게 원래의 첫 단계도 버겁다는 의견을 받고 그 아래에 더한 쉬운 단계다 (2026-10-21).
// 원래의 첫 단계는 Lv3(BASE_LEVEL)이 되었다 — 기본 시작 난이도가 3이다. 점수 배율은 Lv1 부터 오른다 (levelMult).
// 쉬운 단계는 문제를 줄이는 것과 함께 제한 시간도 EASY_TIME 배로 늘린다 (Lv1, Lv2 순).
// 2026-11-05: 1.5 · 1.25 → 2 · 1.6 (어르신이 처음 몇 판을 서두르지 않고 풀 수 있게)
const EASY_LEVELS = 2;
export const BASE_LEVEL = EASY_LEVELS + 1;
const TOP_LEVEL = 8; // 미니게임의 가장 높은 난이도. 점수 배율 곡선의 끝 (multiplierTop)
export const EASY_TIME = [2, 1.6];
// 저장해 둔 시작 난이도가 어느 번호 체계로 적힌 것인가. 1 = 쉬운 단계를 더하기 전 (그때의 Lv1 이 지금의 Lv3)
const LEVEL_SCHEME = 2;

export const DEFAULT_CONFIG = {
  durationSec: 180,          // 라운드 길이 (인지 게임 진행과 무관하게 고정)
  calibrationSec: 15,        // 시작 전 편안한 속도 측정 시간
  calibrationIgnoreSec: 4,   // 측정 초반 가속 구간은 기준값 계산에서 제외
  tolerance: 0.12,           // 목표 RPM 대비 허용 구역 (±12%)
  maxDeviation: 0.45,        // 공이 화면 끝까지 밀려나는 편차
  tickSec: 1,                // 운동 점수 취득 간격
  // 틱당 최대 운동 점수. 2026-11-05: 10 → 15. 인지 게임 배율을 Lv1 x1 → Lv8 x5 로 바꾸며(multiplierTop) 인지 점수가 보통 1.5배쯤 늘어,
  // 운동 점수도 1.5배로 맞췄다. 보통 참가자의 인지 점수 비중이 예전처럼 40% 안팎이고, 높은 난이도에 오른 사람만 그보다 커진다
  tickMaxPoints: 15,
  rpmChange: true,           // 라운드 중 목표 RPM 변화 여부
  // 속도 전환 구간 사이의 간격: 이 둘 사이에서 매번 무작위로 (라운드 시작 → 첫 전환, 전환이 끝난 뒤 → 다음 전환).
  // 지나면 진행 중인 인지 게임이 끝난 뒤 전환한다. 전환 구간은 인지 게임이 없는 '두뇌 쉬는 시간'이기도 하다
  rpmChangeSegmentSec: 120,
  rpmChangeSegmentMaxSec: 180,
  rpmChangeAmount: 0.12,     // 목표 RPM 변화폭
  shiftSec: 30,              // 속도 전환 구간 길이. 이 동안은 인지 게임 없이 새 속도에 맞추기만 한다 (두뇌 쉬는 시간)
  shiftRampSec: 3,           // 그중 목표 RPM이 새 값까지 서서히 바뀌는 시간 (나머지는 적응 시간)
  sound: true,
  rpmSource: 'zc',           // 페달 센서 속도 측정 방식: zc 파형 영교차 | comb 파형 결합 | teo 파형 모양 | pedal 페달 avg_rpm
  games: null,               // 라운드에 넣을 인지 게임 id 목록 (null = 전체). 메뉴의 '사용할 게임'에서 바뀐다.
  cogBasePoints: 100,        // 인지 게임 1회를 완벽히 했을 때의 기본 점수 (모든 유형 동일)
  startLevel: BASE_LEVEL,    // 라운드를 시작할 난이도. 노년층은 1 (쉬운 단계부터). 올리면 쉬운 단계를 건너뛰고 바로 어려운 문제부터 나온다
  maxLevel: 8,               // 이 라운드에서 미니게임이 오를 수 있는 최고 난이도
  levelScheme: LEVEL_SCHEME,
  difficulty: 'adaptive',    // 난이도 방식: adaptive 정답·오답으로 오르내림 | cycle 게임을 한 바퀴 돌 때마다 +1
  // adaptive: 모든 게임이 함께 쓰는 난이도 계기판. 정답마다 diffUp 만큼 오르고 오답(시간 초과 포함)마다 diffDown 만큼 내려간다.
  // 다음 게임의 레벨 = 계기판의 정수 부분. 아래로는 Lv1 까지 내려가므로, Lv3 에서 시작해도 계속 틀리면 쉬운 단계가 나온다.
  // 세 문제를 다 맞히면 한 단계 넘게 오르고, 2/3 면 조금 오르고, 1/3 이하면 내려간다
  // (맞히는 비율이 diffDown / (diffUp + diffDown) = 60% 근처에서 머문다).
  // 게임 하나는 문제를 다 합쳐도 대개 10초 안에 끝나서, 5분 라운드는 게임 약 20판 · 답 50~60개다 (docs/DEMO_BRIEF.md 'Round pacing').
  // 길 따라 그리기는 길 하나가 답 하나다.
  diffUp: 0.4,
  diffDown: 0.6,
  // 켜 둔 게임이 이보다 많으면 diffUp·diffDown 을 diffGamesRef / 게임 수 로 줄인다 (둘 다 줄이므로 머무는 정답률은 같다).
  // 게임 하나가 문제를 3개씩 내므로, 줄이지 않으면 8종을 켰을 때 잘하는 사람은 몇 종을 보기도 전에 최고 난이도에 닿는다.
  // 2 이면 8종을 한 바퀴 다 맞혀도 약 2.4단계 오른다 — 5분 라운드(2~3바퀴) 끝 무렵에야 최고 난이도에 닿는다.
  diffGamesRef: 2,
  // 인지 게임 점수 배율: Lv1 x1.0 에서 Lv8 x(이 값)까지 레벨마다 같은 비율로 곱해 오른다 (levelMult).
  // 5 면 한 단계에 약 x1.26: Lv1 1.0 · Lv2 1.26 · Lv3 1.58 · Lv4 2.0 · Lv5 2.5 · Lv6 3.2 · Lv7 4.0 · Lv8 5.0
  // (2026-11-05 전: Lv3 까지 x1.0, 그 위로 +0.2 씩 · Lv8 x2.0 = multiplierStep)
  multiplierTop: 5,
  questionTimer: true,       // 문제마다 제한 시간. 시간이 다 되면 그 문제는 틀린 것으로 친다
  questionTimeScale: 1,      // 모든 문제 제한 시간에 곱하는 배율 (라운드 난이도 프리셋이 정한다). 게임 소개 시간에도 곱한다
  introMs: { first: 4500, again: 2200 }, // 게임 소개(설명 그림) 시간: 라운드에서 처음 나올 때 / 다시 나올 때. 누르면 바로 넘어간다
  // 문제 하나의 제한 시간(초) = base + per × 일의 양. 입력을 받기 시작한 때부터 잰다.
  // 쉬운 단계(Lv1·Lv2)는 여기에 EASY_TIME 을 곱한다. 아래 범위는 Lv3~8 의 값이다.
  // 일의 양 — path: 눌러야 할 칸 수 · arith: 빈칸 수 · symbol: 1 · count: 켜진 칸 수 · fit: 보기 조각 수 · seek: 판의 칸 수 · cover: 식에 들어간 덮인 숫자 수 · ladder: 구멍에 닿는 길들이 지나는 가로줄 수의 합 · novel: 판의 그림 수 · track: 고를 공 수 · follow: 지시의 양 (버튼 하나 1 · 스위치·차례 누를 수 · 바로 옆 2 · 램프 조건 3 · 이어진 지시 단계 수 + 1) · pair: 양말 수 · box: 세어 둬야 할 과일 종류 수 (상자가 둘이면 +1) · compare: 왼쪽 그림의 선 수
  questionTime: {
    path: { base: 3, per: 1.2 },     // 5칸 9초 ~ 14칸 20초
    symbol: { base: 6, per: 0 },     // 6초
    arith: { base: 6, per: 5 },      // 빈칸 2개 16초 ~ 3개 21초
    count: { base: 4, per: 0.42 },   // 12칸 9초 ~ 38칸 20초
    fit: { base: 5, per: 1.5 },      // 조각 3개 10초 ~ 6개 14초
    seek: { base: 6, per: 0.25 },    // 19칸 11초 ~ 61칸 21초
    cover: { base: 5, per: 2.5 },    // 덮인 숫자 하나 7.5초 · 둘 10초
    ladder: { base: 4, per: 0.7 },   // Lv3 약 6초 ~ Lv8 (구멍 4개) 약 20초
    novel: { base: 5, per: 0.5 },    // 그림 3개 6.5초 ~ 9개 9.5초
    track: { base: 4, per: 1.5 },    // 공이 멈춘 뒤부터: 1개 5.5초 ~ 4개 10초
    follow: { base: 4, per: 1.5 },
    box: { base: 4, per: 1.5 },      // 순서가 끝난 뒤부터: 한 종류 5.5초 ~ 세 종류 8.5초 (상자 둘 10초)
    pair: { base: 3, per: 0.6 },     // 양말 5개 6초 ~ 15개 12초   // 하나 5.5초 ~ 셋 8.5초
    compare: { base: 2.5, per: 0.35 }, // 선 6개 4.6초 · 20개 9.5초 · 35개 14.8초
  },
  fallbackRpm: 60,           // 측정 실패 시 사용할 기준 RPM. 두뇌 게임만 하는 판(brainOnly)은 음악을 이 속도의 박자로 튼다
  minRpm: 25,
  // 두뇌 게임만 (페달 없이). 속도 측정·운동 점수·속도 전환 구간이 없고, 위쪽 띠는 자리만 지키며 두뇌 게임 점수만큼 흘러간다.
  // 점수는 운동 점수 0 인 판과 같다. 세션 로그 meta.track 이 'brain' (페달과 함께 하면 'dual')
  brainOnly: false,
};

// 라운드 난이도 프리셋 (미니게임 난이도가 아니라 라운드 전체의 난이도). 고르면 PRESET_KEYS 값을 한꺼번에 채운다.
// 그 뒤에 하나씩 고쳐도 되고, 그러면 화면에는 '직접 설정'으로 보인다 (Config.presetOf).
//   startLevel·maxLevel — 미니게임 시작·최고 난이도
//   diffUp·diffDown     — 정답·오답마다 계기판이 오르내리는 폭. 머무는 정답률 ≈ diffDown / (diffUp + diffDown)
//   questionTimeScale   — 문제 제한 시간 배율 (쉬운 단계의 EASY_TIME 과 겹쳐 곱한다)
//   tolerance·maxDeviation — 페달 속도 허용 구역, 공이 화면 끝까지 밀려나는 편차
//   rpmChangeAmount     — 오르막·내리막에서 목표 속도가 바뀌는 폭
// '보통'은 DEFAULT_CONFIG 의 값 그대로다. 나머지 둘은 첫 추정값이라 플레이해 보며 다듬는다.
const PRESET_NOTE = '칠한 칸은 이 프리셋이 정한 값입니다. 하나라도 바꾸면 직접 설정이 됩니다.';
const PRESET_CUSTOM_NOTE = '프리셋 값에서 하나 이상을 직접 바꾼 상태입니다.';
export const PRESET_KEYS = ['startLevel', 'maxLevel', 'diffUp', 'diffDown', 'questionTimeScale', 'tolerance', 'maxDeviation', 'rpmChangeAmount'];
export const ROUND_PRESETS = [
  {
    id: 'elderly', label: '가볍게',
    desc: '쉬운 단계(Lv1)부터 Lv5까지. 정답률 75% 근처에 머물고, 제한 시간이 1.3배, 페달 허용 구역이 ±20%로 넓고, 오르막·내리막이 완만합니다.',
    values: { startLevel: 1, maxLevel: 5, diffUp: 0.3, diffDown: 0.9, questionTimeScale: 1.3, tolerance: 0.2, maxDeviation: 0.6, rpmChangeAmount: 0.08 },
  },
  {
    id: 'normal', label: '보통',
    desc: 'Lv3부터 Lv8까지. 정답률 60% 근처에 머물고, 페달 허용 구역 ±12%.',
    values: Object.fromEntries(PRESET_KEYS.map((k) => [k, DEFAULT_CONFIG[k]])),
  },
  {
    id: 'challenge', label: '도전',
    desc: 'Lv4부터 Lv8까지. 정답률 50% 근처까지 밀어붙이고, 제한 시간이 0.8배, 페달 허용 구역이 ±8%로 좁고, 오르막·내리막이 가파릅니다.',
    values: { startLevel: 4, maxLevel: 8, diffUp: 0.5, diffDown: 0.5, questionTimeScale: 0.8, tolerance: 0.08, maxDeviation: 0.35, rpmChangeAmount: 0.16 },
  },
];

// ---------------- 운영 버전(app/): 참가자가 고르는 세션 설정 ----------------
// 대기 화면 다음의 '세션 설정' 화면에서 운동 시간과 난이도를 고른다. 모두 Lv1 에서 시작하고,
// 정답 하나에 오르는 폭(diffUp)은 고른 시간과 난이도로 정한다:
//   다 맞히는 사람이 세션의 climb 비율만큼 지났을 때 그 난이도의 최고 레벨(maxLevel)에 닿도록
//   diffUp = (maxLevel - 1) / (분당 답 수 × 분 × climb)
// 그래서 15분 세션은 5분 세션보다 한 단계씩 천천히 오른다 (긴 세션이 앞부분에서 최고 난이도에 닿아 버리지 않게).
// hold = 레벨이 제자리에 머무는 정답률. 이보다 잘 맞히면 오르고 못 맞히면 내려간다 (diffDown 을 여기서 정한다).
// 다른 값(페달 허용 구역, 점수 등)은 운영 메뉴의 '라운드 설정'을 따른다.
export const SESSION_LENGTHS = [
  { min: 5, label: '5분', desc: '가볍게 한 번' },
  { min: 10, label: '10분', desc: '꾸준한 운동' },
  { min: 15, label: '15분', desc: '충분한 운동' },
];
export const SESSION_DIFFICULTIES = [
  { id: 'relax', label: '편안하게', desc: '난이도가 천천히 올라요', maxLevel: 5, climb: 0.9, hold: 0.8, questionTimeScale: 1.3 },
  { id: 'normal', label: '보통', desc: '알맞은 속도로 올라요', maxLevel: 7, climb: 0.7, hold: 0.67, questionTimeScale: 1.1 },
  { id: 'challenge', label: '도전', desc: '난이도가 빠르게 올라요', maxLevel: 8, climb: 0.5, hold: 0.55, questionTimeScale: 1 },
];
// 운동 방식: 페달을 밟으며 두뇌 게임 (dual) · 두뇌 게임만 (brain, 페달 없이). 페달이 연결돼 있지 않으면 두뇌 게임만 고를 수 있다
export const SESSION_TRACKS = [
  { id: 'dual', label: '페달 + 두뇌 게임', desc: '페달을 밟으며 풀어요' },
  { id: 'brain', label: '두뇌 게임만', desc: '페달 없이 풀어요' },
];
export const SESSION_DEFAULT = { min: 10, difficulty: 'normal', track: 'dual' }; // 화면을 열 때 미리 골라 둔 것
const SESSION_ANSWERS_PER_MIN = 10; // 분당 답 수 어림값 (게임 하나에 문제 3개, 대개 10초 안팎 — docs/DEMO_BRIEF.md 'Round pacing')

// 스테이션 흐름(운영 버전, js/demo.js)의 설정. 테스트 화면의 localStorage 값은 쓰지 않고 DEFAULT_CONFIG 위에 이것을 덮는다.
// 그 위에 운영 메뉴의 '라운드 설정'(DEMO_SETTINGS 의 항목만)을 태블릿마다 저장해 덮는다.
// 상품을 걸고 점수를 비교하므로 모든 스테이션이 같은 설정이어야 한다 — 운영 메뉴의 설정 코드(Config.demoCode)로 맞춰 본다.
const DEMO_CONFIG = {
  durationSec: 300,
  games: null,
  startLevel: BASE_LEVEL,
  difficulty: 'adaptive',
  sound: true,
  rpmSource: 'zc',
};
// 운영 메뉴에서 바꿀 수 있는 항목 (라운드 시간과 점수에 관한 것만). scale = 화면에 보일 때 곱하는 값
export const DEMO_SETTINGS = [
  { key: 'durationSec', label: '라운드 길이 (초)', min: 60, max: 900, step: 15 },
  { key: 'tolerance', label: '허용 구역 (±%)', min: 3, max: 40, step: 1, scale: 100 },
  { key: 'tickMaxPoints', label: '운동 점수 (초당 최대)', min: 1, max: 100, step: 1 },
  { key: 'cogBasePoints', label: '인지 게임 기본 점수 (한 판 다 맞히면)', min: 10, max: 1000, step: 10 },
  { key: 'multiplierTop', label: '최고 난이도(Lv8) 점수 배율 (Lv1 은 x1)', min: 1, max: 10, step: 0.5 },
  { key: 'difficulty', label: '난이도 방식', options: [['adaptive', '정답·오답에 따라 오르내림'], ['cycle', '한 바퀴 돌 때마다 +1']] },
  { key: 'startLevel', label: '시작 난이도', min: 1, max: 8, step: 1 },
  { key: 'diffUp', label: '정답 하나에 난이도 + (오르내림 방식)', min: 0.05, max: 2, step: 0.05 },
  { key: 'diffDown', label: '오답 하나에 난이도 − (오르내림 방식)', min: 0.05, max: 2, step: 0.05 },
  { key: 'maxLevel', label: '최고 난이도', min: 1, max: 8, step: 1 },
  { key: 'questionTimeScale', label: '문제 제한 시간 배율', min: 0.5, max: 3, step: 0.05 },
  { key: 'maxDeviation', label: '편차 한계 (±%, 공이 끝에 닿고 운동 점수 0)', min: 10, max: 100, step: 1, scale: 100 },
  { key: 'rpmChangeAmount', label: '오르막·내리막 목표 속도 변화 (%)', min: 0, max: 40, step: 1, scale: 100 },
];
const DEMO_SETTINGS_KEY = 'exergame.demo.cfg';

// 게임 중 음악 스타일 (js/audio.js 의 BeatAudio.STYLES). 모두 비트 하나 = 페달 반 바퀴로 박자를 이끈다.
// 태블릿마다 운영 메뉴(테스트 화면은 '화면·소리' 탭)의 '음악'에서 고르고, 주소에 ?music=trot 처럼 붙여도 된다.
export const MUSIC_STYLES = [
  { id: 'disco', label: '신나는 댄스' },
  { id: 'acoustic', label: '산책 기타 (가볍고 밝게)' },
  { id: 'trot', label: '트로트 (쿵짝 + 아코디언)' },
  { id: 'calm', label: '잔잔하게 (드럼 없음)' },
  { id: 'beat', label: '기본 비트 (프로토타입)' },
];
const MUSIC_DEFAULT = { app: 'disco', prototype: 'beat' };
const MUSIC_KEY = 'exergame.music';

// 끝난 세션을 보낼 서버 (js/session-upload.js). 여기에 적으면 모든 태블릿의 기본값이 되고,
// 운영 메뉴의 '자동 업로드'에 적은 값이 칸마다 이것을 덮는다 (운영 메뉴 칸이 비어 있으면 여기 값). 둘 다 url 이 없으면 업로드하지 않는다.
// 주의: 이 파일은 누구나 볼 수 있으므로 key 에는 '업로드만 할 수 있는' 키를 넣는다.
// historyUrl: 회원 기록을 받아 오는 주소 (운영 버전, app/members.js). 비어 있으면 이 태블릿의 기록만 보여 준다.
//   GET <historyUrl>?user=<회원 번호> 에 그 회원의 세션 요약 목록으로 답해야 한다 (docs/SERVER.md)
// localHistory: 시험용. true 면 historyUrl 대신 이 태블릿의 세션 로그가 회원 기록 서버 노릇을 한다 (app/members.js 의 Members.localServer).
//   주소 칸이 비었다고 저절로 켜지지 않는다. 운영 메뉴의 체크 칸이나 여기서 일부러 켜야 한다
export const SESSION_UPLOAD = { url: '', key: '', historyUrl: '', localHistory: false };

// 운영 메뉴를 여는 PIN (왼쪽 위 모서리를 2초 길게 누른 뒤 입력). 비워 두면 PIN 없이 바로 열린다 (2026-11-05: 지금은 필요 없음). 다시 쓰려면 네 자리 숫자를 넣는다
export const APP_OPERATOR_PIN = '';

export const Config = {
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
    try { saved = JSON.parse(localStorage.getItem(DEMO_SETTINGS_KEY) || '{}'); } catch (e) { }
    this.migrateLevel(saved);
    return Object.fromEntries(DEMO_SETTINGS.filter((s) => s.key in saved).map((s) => [s.key, saved[s.key]]));
  },
  // 기본값과 같은 항목은 저장하지 않는다 (DEMO_CONFIG 를 고쳐 배포하면 바꾸지 않은 항목은 새 값을 따른다)
  demoSave(values) {
    const def = this.demoDefaults();
    const diff = Object.fromEntries(Object.entries(values).filter(([k, v]) => v !== def[k]));
    try {
      if (Object.keys(diff).length) localStorage.setItem(DEMO_SETTINGS_KEY, JSON.stringify({ ...diff, levelScheme: LEVEL_SCHEME }));
      else localStorage.removeItem(DEMO_SETTINGS_KEY);
    } catch (e) { }
  },
  // 인지 게임 점수 배율. Lv1 x1 → TOP_LEVEL x multiplierTop, 레벨마다 같은 비율로 곱한다 (높은 단계일수록 한 단계에 더 많이 오른다)
  levelMult(cfg, level) {
    const top = cfg.multiplierTop > 0 ? cfg.multiplierTop : 1;
    const k = Math.min(Math.max(level, 1), TOP_LEVEL) - 1;
    return top ** (k / (TOP_LEVEL - 1));
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
    try { saved = JSON.parse(localStorage.getItem('exergame.config') || '{}'); } catch (e) { }
    this.migrateLevel(saved);
    // 제한 시간 표는 화면에서 바꾸지 않으므로 늘 코드의 값을 쓴다 (예전에 저장된 표가 고친 값을 덮지 않게)
    return Object.assign({}, DEFAULT_CONFIG, saved, { questionTime: DEFAULT_CONFIG.questionTime, levelScheme: LEVEL_SCHEME });
  },
  // cfg 의 값이 어느 라운드 난이도 프리셋과 꼭 맞는가. 하나라도 다르면 'custom'
  presetOf(cfg) {
    const p = ROUND_PRESETS.find((x) => PRESET_KEYS.every((k) => cfg[k] === x.values[k]));
    return p ? p.id : 'custom';
  },
  preset(id) {
    return ROUND_PRESETS.find((x) => x.id === id) || null;
  },
  // 프리셋 고르기 아래의 설명 문구 (id 가 'custom' 이면 직접 바꾼 상태라는 안내)
  presetNote(id) {
    const p = this.preset(id);
    return p ? `${p.desc} ${PRESET_NOTE}` : PRESET_CUSTOM_NOTE;
  },
  presetNotes() {
    return [...ROUND_PRESETS.map((p) => this.presetNote(p.id)), PRESET_CUSTOM_NOTE];
  },
  // 게임 중 음악 스타일: 주소의 ?music= → 이 태블릿에서 고른 것 → 판(edition)별 기본값
  music() {
    const ok = (id) => MUSIC_STYLES.some((m) => m.id === id);
    const q = new URLSearchParams(location.search).get('music');
    if (ok(q)) return q;
    let saved = null;
    try { saved = localStorage.getItem(MUSIC_KEY); } catch (e) { }
    if (ok(saved)) return saved;
    return MUSIC_DEFAULT[EDITION] || 'beat';
  },
  setMusic(id) {
    try { localStorage.setItem(MUSIC_KEY, id); } catch (e) { }
  },
  // 운영 버전의 세션 설정(시간·난이도)으로 바뀌는 값. 운영 메뉴의 라운드 설정 위에 덮는다
  session(min, difficultyId) {
    const d = SESSION_DIFFICULTIES.find((x) => x.id === difficultyId) || SESSION_DIFFICULTIES[1];
    const r4 = (v) => Math.round(v * 10000) / 10000;
    const diffUp = r4((d.maxLevel - 1) / (SESSION_ANSWERS_PER_MIN * min * d.climb));
    return {
      durationSec: min * 60,
      difficulty: 'adaptive',
      startLevel: 1,
      maxLevel: d.maxLevel,
      diffUp,
      diffDown: r4((diffUp * d.hold) / (1 - d.hold)),
      diffGamesRef: 0, // 켜 둔 게임 수로 폭을 줄이지 않는다 (오르는 빠르기를 위 식이 이미 정한다)
      questionTimeScale: d.questionTimeScale,
    };
  },
  // 쉬운 단계를 더하기 전에 저장한 시작 난이도는 같은 문제가 나오도록 번호를 옮긴다
  migrateLevel(saved) {
    if (saved.startLevel != null && saved.levelScheme !== LEVEL_SCHEME) saved.startLevel += EASY_LEVELS;
  },
  save(cfg) {
    try { localStorage.setItem('exergame.config', JSON.stringify(cfg)); } catch (e) { }
  },
};

// 프로토타입(index.html)은 테스트 화면, 운영 버전(app/index.html, <html data-edition="app">)은 스테이션 흐름 (js/demo.js).
// 스테이션 흐름은 같은 라운드에 대기·결과·운영 화면만 바꿔 끼운다. DEMO(App.demo) 가 이 흐름인지를 뜻한다 (세션 로그의 mode: 'demo')
export const EDITION = document.documentElement.dataset.edition || 'prototype';
export const DEMO = EDITION === 'app';

// 공용 유틸
export const $ = (s) => document.querySelector(s);
export const U = {
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
  // 글이 바뀌어도 아래 칸들이 밀리지 않도록, 들어갈 수 있는 글 가운데 가장 긴 것의 높이를 미리 잡아 둔다.
  // 화면에 보이는 동안에만 잴 수 있다 (안 보이면 아무것도 하지 않는다)
  reserveHeight(el, texts) {
    if (!el.offsetParent) return;
    const keep = el.textContent;
    el.style.minHeight = '';
    let h = 0;
    for (const t of texts) {
      el.textContent = t;
      h = Math.max(h, el.offsetHeight);
    }
    el.textContent = keep;
    el.style.minHeight = `${h}px`;
  },
  // 게임 안내 문구를 바꾼다. kind 에 따라 문구 앞 아이콘과 색이 정해진다 (css .stage-msg):
  //   look 보기 · act 누르기 · good 맞음 · bad 틀림 · '' 아이콘 없음
  // 문구 안에 붙은 제한 시간 막대(.qtimer)는 문구를 바꿔도 그대로 둔다
  say(el, text, kind = '') {
    const bar = el.querySelector('.qtimer');
    el.textContent = text;
    if (bar) el.append(bar);
    el.className = `stage-msg${kind ? ` ${kind}` : ''}`;
  },
  // 게임 영역의 머리 (모든 게임 공용): 게임 이름·레벨과 진행 점, 그 아래 안내 문구. 게임이 바뀌어도 같은 자리에 두어
  // 속도 띠를 보다가 돌아온 눈이 늘 같은 곳에서 할 일을 찾게 한다. 판은 돌려준 body (머리 아래 남은 자리의 가운데)에 넣는다.
  // rounds = 진행 점 개수 (0 이면 점 없음)
  frame(stage, title, msg, rounds = 0) {
    const meta = U.el('div', 'stage-meta');
    const dots = U.el('div', 'dots');
    for (let i = 0; i < rounds; i++) dots.append(U.el('span'));
    meta.append(U.el('span', 'stage-title', title), dots);
    const head = U.el('div', 'stage-head');
    head.append(meta, msg);
    const body = U.el('div', 'stage-body');
    stage.append(head, body);
    return { body, dots };
  },
  // 문제와 보기 사이 간격 (css gap). 운영 버전은 문제와 보기를 따로 감싸느라 더 넓다 (app/app.css '문제와 보기를 나눈다').
  // 게임은 판 크기를 셈할 때 이 값을 쓴다. 못 읽으면 fallback
  gapOf(el, fallback) {
    const v = parseFloat(getComputedStyle(el).rowGap);
    return Number.isFinite(v) ? v : fallback;
  },
  fmtTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  },
};
