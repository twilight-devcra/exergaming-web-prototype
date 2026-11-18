// 낱말 목록 (초안, 2026-11-18) — 언어 미니게임(다른 하나 찾기, 규칙 바뀌는 분류, 공통점 찾기 …)이 함께 쓴다.
//
// 낱말 하나에 범주 하나만 붙이면 '과일이냐 채소냐'처럼 사람마다 답이 갈리는 문제가 생긴다.
// 그래서 낱말마다 여러 갈래의 꼬리표를 붙이고, 갈리는 꼬리표는 비워 둔다(null). 빈 꼬리표로는 문제를 내지 않으므로
// 토마토·오리·고래처럼 애매한 낱말도 목록에 둘 수 있다 (애매하지 않은 꼬리표로만 나온다).
//
// 꼬리표는 두 가지다.
//   범주 (is · unsure) — 일상에서 쓰는 묶음. CATEGORIES 의 위 범주는 저절로 따라온다 (개무리 → 네발짐승 → 동물).
//     is     에 없고 unsure 에도 없는 범주는 '아니다'로 친다. 망치는 동물이 아니고, 칫솔은 부엌살림이 아니다.
//     unsure 는 사람마다 답이 갈리는 범주 — 고래는 물고기인가? 냉장고는 부엌살림인가? 이 범주로는 그 낱말을 묻지 않는다.
//     학술 분류가 아니라 대부분의 어르신이 같은 답을 할 묶음만 쓴다. 고래가 포유류인 것은 맞지만 '네발짐승'으로는 묻지 않는다.
//   성질 (FACETS) — 다리 수, 물에 사는지, 날카로운지처럼 보거나 겪어서 아는 것. 성질마다 쓰는 영역(동물·물건)이 정해져 있고,
//     그 영역의 낱말은 값을 모두 적어야 한다. null = 사람마다 답이 갈림 (예: 닭은 날 수 있나?).
//     영역 밖(물건의 다리 수)은 적지 않는다 — '해당 없음'이며, 동물과 물건을 섞은 문제에서는 그것도 하나의 값으로 본다.
//
// 낱말을 고르는 규칙:
//   - 소리가 같고 뜻이 다른 낱말(배, 눈, 말 …)은 넣지 않는다 — 글자만 보여 주므로 어느 뜻인지 알 수 없다.
//     '말'은 동물로 많이 쓰여 넣었지만, 검토에서 헷갈린다는 말이 나오면 뺀다.
//   - 2~3음절의 흔한 낱말. 국립국어원 「한국어 학습용 어휘 목록」(2003, 공공누리 제1유형)에 있는지 나중에 맞춰 본다.
//   - 꼬리표는 초안이다. 3~5명이 따로 표시해 보고, 모두 같은 답을 한 꼬리표만 남긴다. 하나라도 갈리면 null 로 바꾼다.
//
// 확인: node tools/words-check.js  — 형식 검사, 값별 낱말 수, '다른 하나 찾기' 예시 문제를 찍는다.

// 범주: 이름 → 위 범주 (null = 맨 위)
export const CATEGORIES = {
  동물: null,
  네발짐승: '동물', // 털 있는 네 발 짐승. 개구리·거북·악어처럼 네 발이어도 '짐승'인지 갈리는 것은 unsure
  개무리: '네발짐승', // 개·늑대·여우
  고양이무리: '네발짐승', // 고양이·호랑이·사자
  새: '동물',
  물고기: '동물',
  곤충: '동물',
  물건: null,
  부엌살림: '물건',
  욕실용품: '물건',
  가구: '물건',
  옷: '물건',
  탈것: '물건',
  도구: '물건', // 연장
  학용품: '물건',
  전자제품: '물건',
};

// 성질: 쓰는 영역(그 범주에 드는 낱말만 값을 적는다)과 값별 문구.
// 문구는 문제와 해설에 쓴다: '나머지는 모두 ○○' / '△△만 ○○이 아니다'.
export const FACETS = {
  legs: { label: '다리 수', domain: '동물', values: { 0: '다리가 없다', 2: '다리가 2개', 4: '다리가 4개', 6: '다리가 6개', 8: '다리가 8개' } },
  water: { label: '물에 사나', domain: '동물', values: { true: '물에 산다', false: '물에 살지 않는다' } },
  fly: { label: '날 수 있나', domain: '동물', values: { true: '날 수 있다', false: '날지 못한다' } },
  raise: { label: '어디서 사나', domain: '동물', values: { pet: '집에서 기른다', farm: '농장에서 기른다', wild: '야생에 산다' } },
  room: { label: '쓰는 곳', domain: '물건', values: { kitchen: '부엌에서 쓴다', bath: '욕실에서 쓴다', bed: '침실에 둔다', living: '거실에 둔다', out: '집 밖에서 쓴다' } },
  power: { label: '전기', domain: '물건', values: { true: '전기로 움직인다', false: '전기가 필요 없다' } },
  sharp: { label: '날카롭나', domain: '물건', values: { true: '날카롭다', false: '날카롭지 않다' } },
  wheels: { label: '바퀴', domain: '물건', values: { true: '바퀴가 있다', false: '바퀴가 없다' } },
  // 크기는 사람·손바닥에 대어 본다. 길쭉한 것(뱀)이나 사람과 견주기 애매한 것(돼지)은 null
  size: { label: '크기', domain: null, values: { hand: '손바닥에 올라간다', mid: '손바닥보다 크고 사람보다 작다', big: '사람보다 크다' } },
};

// 한 줄에 낱말 하나. 성질 값을 비운 것(null)은 사람마다 답이 갈릴 것 같은 곳 — 이유를 뒤에 적었다.
export const WORDS = [
  // ── 동물: 네발짐승 ──
  { w: '개', is: ['개무리'], legs: 4, water: false, fly: false, raise: 'pet', size: 'mid' },
  { w: '늑대', is: ['개무리'], legs: 4, water: false, fly: false, raise: 'wild', size: 'mid' },
  { w: '여우', is: ['개무리'], legs: 4, water: false, fly: false, raise: 'wild', size: 'mid' },
  { w: '고양이', is: ['고양이무리'], legs: 4, water: false, fly: false, raise: 'pet', size: 'mid' },
  { w: '호랑이', is: ['고양이무리'], legs: 4, water: false, fly: false, raise: 'wild', size: 'big' },
  { w: '사자', is: ['고양이무리'], legs: 4, water: false, fly: false, raise: 'wild', size: 'big' },
  { w: '소', is: ['네발짐승'], legs: 4, water: false, fly: false, raise: 'farm', size: 'big' },
  { w: '말', is: ['네발짐승'], legs: 4, water: false, fly: false, raise: 'farm', size: 'big' }, // 소리가 같은 '말(言)' — 검토 대상
  { w: '돼지', is: ['네발짐승'], legs: 4, water: false, fly: false, raise: 'farm', size: null }, // 사람보다 무겁지만 키는 작다
  { w: '염소', is: ['네발짐승'], legs: 4, water: false, fly: false, raise: 'farm', size: 'mid' },
  { w: '양', is: ['네발짐승'], legs: 4, water: false, fly: false, raise: 'farm', size: 'mid' },
  { w: '토끼', is: ['네발짐승'], legs: 4, water: false, fly: false, raise: null, size: 'mid' }, // 집·농장·산 모두
  { w: '쥐', is: ['네발짐승'], legs: 4, water: false, fly: false, raise: 'wild', size: 'hand' },
  { w: '다람쥐', is: ['네발짐승'], legs: 4, water: false, fly: false, raise: 'wild', size: 'hand' },
  { w: '코끼리', is: ['네발짐승'], legs: 4, water: false, fly: false, raise: 'wild', size: 'big' },
  { w: '기린', is: ['네발짐승'], legs: 4, water: false, fly: false, raise: 'wild', size: 'big' },
  { w: '곰', is: ['네발짐승'], legs: 4, water: false, fly: false, raise: 'wild', size: 'big' },
  { w: '원숭이', is: ['동물'], unsure: ['네발짐승'], legs: null, water: false, fly: false, raise: 'wild', size: 'mid' }, // 두 발로도 걷는다
  // ── 동물: 새 ──
  { w: '닭', is: ['새'], legs: 2, water: false, fly: null, raise: 'farm', size: 'mid' }, // 푸드덕 날기는 한다
  { w: '오리', is: ['새'], legs: 2, water: null, fly: null, raise: null, size: 'mid' }, // 물·땅 모두, 집오리와 들오리
  { w: '참새', is: ['새'], legs: 2, water: false, fly: true, raise: 'wild', size: 'hand' },
  { w: '비둘기', is: ['새'], legs: 2, water: false, fly: true, raise: 'wild', size: null }, // 손바닥에 올라가나?
  { w: '독수리', is: ['새'], legs: 2, water: false, fly: true, raise: 'wild', size: 'mid' },
  { w: '펭귄', is: ['새'], legs: 2, water: null, fly: false, raise: 'wild', size: 'mid' }, // 얼음 위·바닷속 모두
  { w: '타조', is: ['새'], legs: 2, water: false, fly: false, raise: 'wild', size: 'big' }, // '날지 못하는 새' 함정용
  // ── 동물: 물고기 ──
  { w: '붕어', is: ['물고기'], legs: 0, water: true, fly: false, raise: null, size: 'hand' }, // 어항에서도 기른다
  { w: '상어', is: ['물고기'], legs: 0, water: true, fly: false, raise: 'wild', size: 'big' },
  { w: '고등어', is: ['물고기'], legs: 0, water: true, fly: false, raise: null, size: 'mid' }, // 양식
  // ── 동물: 곤충 ──
  { w: '개미', is: ['곤충'], legs: 6, water: false, fly: false, raise: 'wild', size: 'hand' },
  { w: '나비', is: ['곤충'], legs: 6, water: false, fly: true, raise: 'wild', size: 'hand' },
  { w: '벌', is: ['곤충'], legs: 6, water: false, fly: true, raise: null, size: 'hand' }, // 양봉
  { w: '모기', is: ['곤충'], legs: 6, water: false, fly: true, raise: 'wild', size: 'hand' },
  // ── 동물: 어느 무리인지 갈리는 것 ──
  { w: '고래', is: ['동물'], unsure: ['물고기', '네발짐승'], legs: 0, water: true, fly: false, raise: 'wild', size: 'big' },
  { w: '문어', is: ['동물'], unsure: ['물고기'], legs: 8, water: true, fly: false, raise: 'wild', size: null },
  { w: '거미', is: ['동물'], unsure: ['곤충'], legs: 8, water: false, fly: false, raise: 'wild', size: 'hand' },
  { w: '뱀', is: ['동물'], legs: 0, water: false, fly: false, raise: 'wild', size: null }, // 길쭉하다
  { w: '개구리', is: ['동물'], unsure: ['네발짐승'], legs: 4, water: null, fly: false, raise: 'wild', size: 'hand' },
  { w: '거북', is: ['동물'], unsure: ['네발짐승'], legs: 4, water: null, fly: false, raise: null, size: null },

  // ── 물건: 부엌살림 ──
  { w: '냄비', is: ['부엌살림'], room: 'kitchen', power: false, sharp: false, wheels: false, size: 'mid' },
  { w: '국자', is: ['부엌살림'], room: 'kitchen', power: false, sharp: false, wheels: false, size: 'mid' },
  { w: '숟가락', is: ['부엌살림'], room: 'kitchen', power: false, sharp: false, wheels: false, size: 'hand' },
  { w: '젓가락', is: ['부엌살림'], room: 'kitchen', power: false, sharp: false, wheels: false, size: 'hand' },
  { w: '식칼', is: ['부엌살림'], room: 'kitchen', power: false, sharp: true, wheels: false, size: 'mid' },
  { w: '도마', is: ['부엌살림'], room: 'kitchen', power: false, sharp: false, wheels: false, size: 'mid' },
  { w: '밥솥', is: ['부엌살림', '전자제품'], room: 'kitchen', power: true, sharp: false, wheels: false, size: 'mid' },
  { w: '냉장고', is: ['전자제품'], unsure: ['부엌살림'], room: 'kitchen', power: true, sharp: false, wheels: false, size: 'big' },
  // ── 물건: 욕실용품 ──
  { w: '칫솔', is: ['욕실용품'], room: 'bath', power: false, sharp: false, wheels: false, size: 'hand' }, // 전동 칫솔도 있지만 '칫솔'은 보통 손으로
  { w: '비누', is: ['욕실용품'], room: 'bath', power: false, sharp: false, wheels: false, size: 'hand' },
  { w: '수건', is: ['욕실용품'], room: 'bath', power: false, sharp: false, wheels: false, size: 'mid' },
  { w: '변기', is: ['욕실용품'], room: 'bath', power: false, sharp: false, wheels: false, size: 'mid' },
  // ── 물건: 가구 ──
  { w: '침대', is: ['가구'], room: 'bed', power: false, sharp: false, wheels: false, size: 'big' },
  { w: '옷장', is: ['가구'], room: 'bed', power: false, sharp: false, wheels: false, size: 'big' },
  { w: '소파', is: ['가구'], room: 'living', power: false, sharp: false, wheels: false, size: 'big' },
  { w: '의자', is: ['가구'], room: null, power: false, sharp: false, wheels: null, size: 'mid' }, // 어느 방에나, 바퀴 달린 의자
  { w: '책상', is: ['가구'], room: null, power: false, sharp: false, wheels: false, size: 'mid' },
  // ── 물건: 전자제품 ──
  { w: '텔레비전', is: ['전자제품'], room: 'living', power: true, sharp: false, wheels: false, size: 'mid' },
  { w: '선풍기', is: ['전자제품'], room: null, power: true, sharp: false, wheels: false, size: 'mid' },
  { w: '세탁기', is: ['전자제품'], room: null, power: true, sharp: false, wheels: false, size: 'mid' }, // 욕실·베란다
  { w: '전화기', is: ['전자제품'], room: null, power: true, sharp: false, wheels: false, size: 'hand' },
  // ── 물건: 옷 ──
  { w: '치마', is: ['옷'], room: null, power: false, sharp: false, wheels: false, size: 'mid' },
  { w: '바지', is: ['옷'], room: null, power: false, sharp: false, wheels: false, size: 'mid' },
  { w: '외투', is: ['옷'], room: 'out', power: false, sharp: false, wheels: false, size: 'mid' },
  { w: '양말', is: ['물건'], unsure: ['옷'], room: null, power: false, sharp: false, wheels: false, size: 'hand' },
  { w: '모자', is: ['물건'], unsure: ['옷'], room: 'out', power: false, sharp: false, wheels: false, size: 'mid' },
  // ── 물건: 탈것 ──
  { w: '자전거', is: ['탈것'], room: 'out', power: false, sharp: false, wheels: true, size: 'big' }, // 사람보다 크나? 검토 대상
  { w: '자동차', is: ['탈것'], room: 'out', power: null, sharp: false, wheels: true, size: 'big' }, // 휘발유·전기
  { w: '버스', is: ['탈것'], room: 'out', power: null, sharp: false, wheels: true, size: 'big' },
  { w: '기차', is: ['탈것'], room: 'out', power: null, sharp: false, wheels: true, size: 'big' },
  { w: '오토바이', is: ['탈것'], room: 'out', power: null, sharp: false, wheels: true, size: 'big' },
  { w: '비행기', is: ['탈것'], room: 'out', power: null, sharp: false, wheels: null, size: 'big' }, // 바퀴가 있지만 떠올리지 않는다
  // ── 물건: 도구 ──
  { w: '망치', is: ['도구'], room: null, power: false, sharp: false, wheels: false, size: 'mid' },
  { w: '톱', is: ['도구'], room: null, power: false, sharp: true, wheels: false, size: 'mid' },
  { w: '삽', is: ['도구'], room: 'out', power: false, sharp: null, wheels: false, size: null },
  { w: '바늘', is: ['도구'], room: null, power: false, sharp: true, wheels: false, size: 'hand' },
  { w: '가위', is: ['도구'], unsure: ['학용품', '부엌살림'], room: null, power: false, sharp: true, wheels: false, size: 'hand' },
  // ── 물건: 학용품 ──
  { w: '연필', is: ['학용품'], room: null, power: false, sharp: null, wheels: false, size: 'hand' }, // 깎은 끝은 뾰족하다
  { w: '지우개', is: ['학용품'], room: null, power: false, sharp: false, wheels: false, size: 'hand' },
  { w: '공책', is: ['학용품'], room: null, power: false, sharp: false, wheels: false, size: 'mid' },
  { w: '크레파스', is: ['학용품'], room: null, power: false, sharp: false, wheels: false, size: 'hand' },
];
