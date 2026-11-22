// 기념물: 세션마다 무엇을 세우는가, 그리고 저장하는 생김새(look)의 모양. 그리는 일은 js/band.js 가 한다.
// 생김새는 세울 때 정해 세션과 함께 저장하고(회원 기록 look, 세션 로그 meta.landmark), 다음 라운드부터는 저장한 그대로 그린다.
// 그래서 여기 표(종류·색)를 고쳐도 이미 세운 기념물은 바뀌지 않는다 — 색은 이름이 아니라 값으로 적는다.

export const Landmarks = {
  // 기념물 종류는 세션 난이도로, 크기는 세션 길이로 정한다 (5분 0 · 10분 1 · 15분 2).
  // village (기본): 집 · 가게 · 탑. 크기 = 층수 1~3. 같은 점수대에 여러 번 하면 마을이 생긴다. 벽·지붕 색은 세션마다 다르다
  // objects: 바람개비(페달 속도로 돈다) · 풍선(수 1~3, 흔들린다) · 돌탑(돌 3~5). 주소에 ?marks=objects 로 비교해 본다
  SETS: {
    village: {
      relax: { kind: 'cottage', verb: '집을 지었어요' },
      normal: { kind: 'shop', verb: '가게를 열었어요' },
      challenge: { kind: 'tower', verb: '탑을 세웠어요' },
    },
    objects: {
      relax: { kind: 'pinwheel', verb: '바람개비를 꽂았어요' },
      normal: { kind: 'balloon', verb: '풍선을 달았어요' },
      challenge: { kind: 'cairn', verb: '돌탑을 쌓았어요' },
    },
  },

  // 지금 쓰는 종류 표 (주소의 ?marks=)
  get current() {
    const set = new URLSearchParams(location.search).get('marks');
    return Landmarks.SETS[set] || Landmarks.SETS.village;
  },

  // 건물 벽·지붕 색 (seed 로 고른다)
  WALLS: ['#fff1d6', '#ffe0c7', '#f9d8df', '#dfeef8', '#e7f1d4'],
  ROOFS: ['#e2574c', '#4a7fd4', '#f09a2c', '#2fae94', '#9b62c9'],

  // 세션 난이도·길이(분)로 정하는 기념물 { kind, verb, size }
  forSession(difficulty, min) {
    const entry = Landmarks.current[difficulty] || Landmarks.current.normal;
    const size = !(min > 0) ? 1 : min <= 7 ? 0 : min <= 12 ? 1 : 2;
    return { ...entry, size };
  },

  // 저장하는 생김새 { v, kind, size, seed, wall, roof }. seed 는 색 말고도 창가 꽃 색, 탑 돌무늬,
  // 연기·깃발 박자 같은 작은 차이를 정한다
  look(kind, size, seed) {
    const { WALLS, ROOFS } = Landmarks;
    // eslint-disable-next-line id-length -- 저장된 기록 형식 (v = 생김새 형식 판)
    return { v: 1, kind, size, seed, wall: WALLS[seed % WALLS.length], roof: ROOFS[(seed * 3 + 1) % ROOFS.length] };
  },

  // 층을 쌓아 짓는 기념물인가 (그 밖의 기념물은 한 번에 선다)
  isBuilding(kind) {
    return kind === 'cottage' || kind === 'shop' || kind === 'tower';
  },

  // 지난 세션들 [{ score, key, at, difficulty, min, look }] → 풍경에 세울 기념물 목록 (점수 순).
  // look 이 있으면 그대로, 없으면(생김새를 저장하기 전 기록) 난이도·시간과 key(세션마다 다른 값)로 정한다.
  // at(날짜)은 팻말 글자(tag)가 된다. 가장 높은 점수의 기념물은 best
  fromHistory(sessions) {
    const landmarks = (sessions || []).filter((session) => session.score > 0).map((session) => {
      let look = session.look && session.look.kind ? session.look : null;
      if (!look) {
        const { kind, size } = Landmarks.forSession(session.difficulty, session.min);
        look = Landmarks.look(kind, size, seedOf(session.key));
      }
      const { kind, size, seed, wall, roof } = look;
      return { score: session.score, best: false, tag: dateTag(session.at), kind, size, seed: seed || 0, wall, roof };
    });
    landmarks.sort((a, b) => a.score - b.score);
    if (landmarks.length) landmarks[landmarks.length - 1].best = true;
    return landmarks;
  },
};

// 세션 key 에서 늘 같은 seed 를 뽑는다
function seedOf(key) {
  return [...String(key)].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) % 100003, 7);
}

// 팻말 글자: '11/20'. 날짜가 아니면 빈 글자
function dateTag(when) {
  const date = new Date(when);
  return isNaN(date) ? '' : `${date.getMonth() + 1}/${date.getDate()}`;
}
