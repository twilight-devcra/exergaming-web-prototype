// 새 미니게임을 기획할 때 쓰는 인지 영역 목록과, 기존 게임이 어느 영역을 다루는지의 표.
// node tools/manual.js 가 이 파일을 읽어 docs/games/TARGETS.md (인지 영역 점검표)를 만든다. 앱은 이 파일을 읽지 않는다.
//
// 목록은 DSM-5 의 신경인지 영역 6개와 세부 영역을 바탕으로 한다 (Sachdev et al. 2014, Nature Reviews Neurology).
// 국내 노인 신경심리검사(SNSB)가 따로 보는 계산, 엑서게임에서 중요한 일상생활 과제·이중 과제를 추가했다.
// 결과 화면의 두뇌 그래프(js/abilities.js DOMAIN_GAMES)와는 별개다: 그래프는 보여 주기용 인지 영역 6개이고, 이 목록은 빈 영역을 찾기 위한 세부 영역이다.
//
// 게임을 추가하거나 바꾸면 GAME_TARGETS 에 그 게임이 주로 다루는 세부 영역을 적는다.
// 앞에 ~ 를 붙이면 '부분' (일부 레벨·문제에서만 쓰거나 부수적으로 쓰는 영역).
// 점검표 표시: ☑ 주 영역으로 다루는 게임 2종 이상 · △ 1종뿐이거나 부분적으로만 · ☐ 없음.
// 기획만 된 게임은 PLANNED 에 적는다. 같은 id 의 게임이 생기면 PLANNED 항목은 자동으로 빠진다.

// priority: 빈 영역일 때의 우선순위 (높음 · 중간 · 낮음). idea: 터치만으로, 페달을 밟으면서 할 수 있는 게임 아이디어
const DOMAINS = [
  {
    id: 'attention', name: '복합 주의', english: 'Complex attention',
    subs: [
      { id: 'selective', name: '선택적 주의', what: '방해 자극 속에서 목표만 골라 보는 능력', test: '시각 탐색 과제, 지우기 검사', priority: '중간' },
      { id: 'tracking', name: '지속적 주의 · 시각 추적', what: '움직이거나 이어지는 대상을 놓치지 않고 계속 따라가는 능력', test: 'CPT(연속 수행 검사), 다중 대상 추적(MOT)', priority: '중간' },
      { id: 'divided', name: '분할 주의 · 이중 과제', what: '두 가지 일을 동시에 처리하는 능력', test: '이중 과제 보행 검사', priority: '높음',
        idea: '페달과 게임을 연동한다. 예: 빨간 신호가 나오면 페달을 빠르게 밟기처럼 응답 하나를 페달로 받는다. 이중 과제 수행 능력은 노인 낙상 위험과 관련이 깊어 연구가 많다.' },
      { id: 'speed', name: '처리 속도', what: '보고 판단하는 속도', test: '기호 바꾸기 검사(WAIS 기호 쓰기, SDMT)', priority: '중간',
        note: '현재는 다른 게임의 문제당 소요 시간으로만 측정한다. 속도 자체를 목표로 하는 게임(예: 그림-숫자 짝 바꾸기)은 없다.' },
    ],
  },
  {
    id: 'executive', name: '실행 기능', english: 'Executive function',
    subs: [
      { id: 'wm', name: '작업 기억', what: '머릿속에 정보를 유지하면서 갱신하거나 계산하는 능력', test: '숫자 거꾸로 따라 하기, n-back', priority: '중간' },
      { id: 'inhibition', name: '억제', what: '자동으로 나오는 반응을 참는 능력', test: 'Stroop 검사, go/no-go', priority: '높음',
        idea: 'go/no-go: 그림이 나올 때마다 누르되 특정 그림 하나만은 누르지 않기. 또는 Stroop 변형: 글자 뜻이 아니라 글자 색 고르기 (색각 이상을 고려해 모양도 함께 쓴다).' },
      { id: 'flexibility', name: '인지적 유연성 · 전환', what: '규칙을 바꿔 가며 적용하는 능력', test: '선로 잇기 검사 B형(1-가-2-나…), 위스콘신 카드 분류 검사', priority: '높음',
        idea: '선로 잇기 B형처럼 숫자와 글자를 번갈아 순서대로 누르기. 또는 위 칸에 나오면 모양으로, 아래 칸에 나오면 개수로 분류하기.' },
      { id: 'planning', name: '계획', what: '몇 단계 앞을 내다보고 순서를 정하는 능력', test: '런던 탑 검사', priority: '중간',
        idea: '최소 횟수로 원판 옮기기, 여러 가게를 가장 짧은 경로로 도는 순서 정하기.' },
      { id: 'reasoning', name: '추론 · 규칙 찾기', what: '주어진 예에서 규칙을 찾아 다음을 예측하는 능력', test: '행렬 추론, 수열 완성', priority: '높음',
        idea: '"다음에 올 그림은?": 모양·개수·방향이 한 가지 규칙에 따라 바뀌는 줄에서 다음 칸 고르기.' },
    ],
  },
  {
    id: 'numeracy', name: '계산', english: 'Numeracy · SNSB 계산, CHC Gq',
    subs: [
      { id: 'calc', name: '계산 · 수 감각', what: '수를 세고 더하고 빼는 능력', test: 'MMSE 100-7, SNSB 계산', priority: '중간' },
    ],
  },
  {
    id: 'memory', name: '학습 및 기억', english: 'Learning & memory',
    subs: [
      { id: 'stm', name: '즉시 기억 (시각·위치)', what: '방금 본 것을 바로 떠올리는 능력', test: '공간 폭 검사, 그림 재인', priority: '낮음' },
      { id: 'sequence', name: '순서 기억', what: '본 순서대로 떠올리는 능력', test: '숫자 따라 하기, 코르시 블록', priority: '낮음' },
      { id: 'verbal', name: '언어적 기억', what: '이름을 붙여 되뇌며 외우는 능력', test: 'CERAD 단어 목록 기억', priority: '중간' },
      { id: 'assoc', name: '연합 기억', what: '두 정보를 짝지어 기억하는 능력 (얼굴-이름, 물건-위치)', test: '얼굴-이름 연합 검사, 물건-위치 기억', priority: '중간',
        idea: '물건과 놓인 위치, 사람 그림과 이름을 짝지어 보여 준 뒤 한쪽을 주고 짝 고르기.' },
      { id: 'delayed', name: '지연 회상', what: '몇 분이 지난 뒤 다시 떠올리는 능력', test: 'CERAD·MMSE 지연 회상', priority: '높음',
        idea: '세션 초반에 그림 3개를 보여 주고 세션 끝에 묻기. 치매 초기에 가장 먼저 저하되는 능력이고, 세션이 몇 분 단위라 구조에도 잘 맞는다.' },
      { id: 'prospective', name: '미래 기억', what: '해야 할 일을 적절한 때에 떠올리는 능력', test: '미래 기억 과제 ("이 그림이 나오면 …")', priority: '중간',
        idea: '세션 초반에 "별이 보이면 ★ 버튼을 누르세요"라고 알려 주고, 다른 게임 도중에 별을 띄우기.' },
    ],
  },
  {
    id: 'language', name: '언어', english: 'Language',
    subs: [
      { id: 'comprehension', name: '언어 이해', what: '읽거나 들은 말을 이해하고 따르는 능력', test: '토큰 검사, 지시 따르기', priority: '중간' },
      { id: 'fluency', name: '낱말 인출 · 유창성', what: '단서(첫 글자 등)에 맞는 낱말을 머릿속에서 찾아 꺼내는 능력', test: '음소 유창성 검사(COWAT: ㄱ으로 시작하는 낱말 말하기)', priority: '중간',
        idea: '빈칸 낱말 여러 개에 공통으로 들어갈 글자 고르기. 말하기 대신 보기에서 고른다.' },
      { id: 'naming', name: '이름 대기', what: '그림을 보고 이름을 떠올리는 능력', test: '보스턴 이름 대기 검사(K-BNT)', priority: '중간',
        idea: '그림 하나를 보여 주고 낱말 3개 중 맞는 이름 고르기, 또는 초성을 보고 맞는 그림 고르기. 음성 입력이 없으므로 보기에서 고르는 방식으로 한다.' },
      { id: 'semantic', name: '의미 기억 · 범주화', what: '낱말과 사물의 뜻을 알고 같은 범주끼리 묶는 능력', test: '범주 유창성 검사, 의미 연합 검사', priority: '중간',
        idea: '과일·채소·옷 등으로 분류하기, 4개 중 범주가 다른 하나 고르기.' },
    ],
  },
  {
    id: 'visuospatial', name: '지각-운동 기능', english: 'Perceptual-motor',
    subs: [
      { id: 'discrim', name: '시각 변별', what: '비슷한 모양의 작은 차이를 알아보는 능력', test: '시각 변별 검사', priority: '낮음' },
      { id: 'rotation', name: '심상 회전', what: '모양을 머릿속에서 돌려 보는 능력', test: '심상 회전 과제(Shepard-Metzler)', priority: '중간',
        idea: '회전한 그림 중 같은 것 고르기, 거울상과 회전한 것 구별하기.' },
      { id: 'construct', name: '시각 구성', what: '부분을 조합해 전체 모양을 만드는 능력', test: '토막 짜기, 시계 그리기 검사', priority: '중간',
        idea: '두 조각을 합치면 되는 모양 고르기, 칠교 그림에서 빠진 조각 고르기.' },
      { id: 'orientation', name: '공간 지남력 · 길찾기', what: '자기 기준의 왼쪽·오른쪽을 구분하고 지도를 읽는 능력', test: '길찾기 과제, 지남력 검사', priority: '중간' },
    ],
  },
  {
    id: 'social', name: '사회 인지', english: 'Social cognition',
    subs: [
      { id: 'emotion', name: '정서 인식', what: '얼굴 표정에서 감정을 읽는 능력', test: '표정 인식 검사', priority: '낮음',
        idea: '표정 그림 4개 중 "기뻐하는 사람" 고르기. 그림 자원이 많이 필요해 우선순위를 낮춘다.' },
    ],
  },
  {
    id: 'everyday', name: '일상생활 기능', english: 'Everyday function · IADL',
    subs: [
      { id: 'iadl', name: '도구적 일상생활 과제', what: '돈 계산, 장보기, 시계·달력 보기처럼 일상에서 하는 인지 과제', test: 'K-IADL', priority: '중간',
        idea: '시곗바늘을 보고 시각 고르기, 달력에서 "다음 주 화요일" 찾기, 약 봉투의 복용 시간 맞추기.' },
    ],
  },
];

const GAME_TARGETS = {
  path: ['stm', 'sequence'],
  symbol: ['stm', '~assoc'],
  arith: ['calc', '~wm', '~reasoning'],
  count: ['selective', 'speed'],
  fit: ['rotation', 'construct'],
  seek: ['selective', 'speed'],
  cover: ['stm', 'wm', 'calc'],
  pipe: ['tracking', 'speed'],
  novel: ['stm'],
  track: ['tracking', '~divided'],
  follow: ['comprehension', 'wm', '~inhibition', '~reasoning', '~sequence'],
  pair: ['selective', 'discrim', 'speed'],
  box: ['wm', 'calc', '~stm'],
  compare: ['discrim', 'speed'],
  coin: ['calc', 'selective', 'iadl'],
  recall: ['sequence', 'verbal'],
  chain: ['planning'],
  blank: ['fluency', '~naming', '~wm'],
  safe: ['speed', 'reasoning', '~calc', '~wm'],
  art: ['stm', 'assoc', '~discrim'],
};

// 기획만 된 게임 (아직 js/games 에 없다)
const PLANNED = {
  shop: { title: '장보기', doc: '../NEW_GAMES_BRIEF.md', targets: ['verbal', 'stm', '~iadl'] },
  map: { title: '집 찾아가기', doc: '../NEW_GAMES_BRIEF.md', targets: ['orientation', '~iadl'] },
};

module.exports = { DOMAINS, GAME_TARGETS, PLANNED };
