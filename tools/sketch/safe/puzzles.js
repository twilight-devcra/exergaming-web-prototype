// 금고 열기 — 손으로 쓴 문제 (3단계 스케치용: Lv1–4 는 3개, Lv5–8 은 단서 종류마다 하나씩 4–5개). 진짜 게임에서는 생성기가 만든다.
// LEVELS 는 레벨표 (docs/games/drafts/safe.md 와 같게). node tools/sketch/safe/check.js 로 모든 문제를 확인한다.
//   key     — 열쇠 표의 줄 수 (숫자 줄 + 단서 줄, 최대 6)
//   code    — 암호 자릿수
//   hidden  — 단서로 알아낼 그림 수
//   clues   — 단서의 종류
//   given   — 처음부터 정답으로 채워 둔 칸 수 (Lv1: 첫 칸을 채워 두어 할 일을 말없이 보여 준다)
// 문제의 kind = 단서의 종류 (확인용 이름). 같은 레벨에서도 판마다 다른 종류가 나온다

export const LEVELS = [
  { key: 3, code: 3, hidden: 0, clues: '–', given: 1 },
  { key: 4, code: 4, hidden: 0, clues: '–' },
  { key: 4, code: 5, hidden: 0, clues: '– (같은 그림이 되풀이된다)' },
  { key: 5, code: 5, hidden: 0, clues: '–' },
  { key: 5, code: 5, hidden: 1, clues: '계산 한 번: 더하기 · 빼기 · 거꾸로 · 두 배 · 두 그림 더하기' },
  { key: 5, code: 5, hidden: 1, clues: '한 번 더 생각: 사이 · 같은 그림 둘 · 빼서 맞추기 · 세 배 거꾸로' },
  { key: 6, code: 5, hidden: 2, clues: '계산 + 논리 (단서 2–3줄): 사이·짝홀 · 이어 풀기 · 경계·짝홀' },
  { key: 6, code: 5, hidden: 3, clues: '두 그림을 함께 (합과 두 배 · 합과 차 · 곱과 차) 또는 같은 그림 셋, 그 답으로 하나 더' },
];

export const PUZZLES = {
  1: [
    { known: [['star', 4], ['circle', 7], ['triangle', 2]], code: ['triangle', 'star', 'circle'] },
    { known: [['heart', 3], ['moon', 8], ['square', 5]], code: ['moon', 'heart', 'square'] },
    { known: [['plus', 6], ['diamond', 1], ['circle', 9]], code: ['diamond', 'circle', 'plus'] },
  ],
  2: [
    { known: [['square', 2], ['heart', 7], ['star', 4], ['moon', 9]], code: ['heart', 'square', 'moon', 'star'] },
    { known: [['circle', 8], ['plus', 3], ['triangle', 6], ['diamond', 1]], code: ['triangle', 'circle', 'diamond', 'plus'] },
    { known: [['moon', 5], ['star', 9], ['heart', 2], ['square', 7]], code: ['star', 'heart', 'moon', 'square'] },
  ],
  3: [
    { known: [['heart', 8], ['square', 3], ['star', 6], ['circle', 1]], code: ['square', 'star', 'square', 'heart', 'circle'] },
    { known: [['plus', 4], ['moon', 9], ['triangle', 2], ['diamond', 7]], code: ['moon', 'plus', 'moon', 'diamond', 'triangle'] },
    { known: [['circle', 5], ['heart', 1], ['square', 8], ['star', 3]], code: ['star', 'circle', 'heart', 'star', 'square'] },
  ],
  4: [
    { known: [['diamond', 2], ['star', 7], ['circle', 4], ['moon', 9], ['plus', 6]], code: ['moon', 'diamond', 'plus', 'moon', 'circle'] },
    { known: [['triangle', 8], ['heart', 3], ['square', 6], ['plus', 1], ['star', 9]], code: ['heart', 'star', 'triangle', 'heart', 'square'] },
    { known: [['moon', 4], ['circle', 9], ['diamond', 6], ['triangle', 1], ['heart', 7]], code: ['circle', 'triangle', 'moon', 'heart', 'circle'] },
  ],
  // Lv5 (숨은 그림 1, 단서 1): 계산 한 번. 종류가 판마다 다르다
  5: [
    { kind: '더하기', known: [['moon', 5], ['plus', 9], ['triangle', 2], ['diamond', 4]], clues: [['heart', '=', 'moon', '+', 2]], hidden: { heart: 7 },
      code: ['heart', 'moon', 'triangle', 'heart', 'plus'] },
    { kind: '빼기', known: [['star', 3], ['circle', 8], ['square', 6], ['heart', 1]], clues: [['triangle', '=', 'circle', '−', 3]], hidden: { triangle: 5 },
      code: ['triangle', 'star', 'triangle', 'circle', 'heart'] },
    { kind: '거꾸로 (● + 3 = ✚)', known: [['diamond', 7], ['moon', 2], ['plus', 9], ['star', 4]], clues: [['circle', '+', 3, '=', 'plus']], hidden: { circle: 6 },
      code: ['circle', 'plus', 'diamond', 'circle', 'star'] },
    { kind: '두 배', known: [['heart', 2], ['diamond', 9], ['plus', 6], ['circle', 7]], clues: [['square', '=', 'heart', '×', 2]], hidden: { square: 4 },
      code: ['square', 'plus', 'heart', 'square', 'diamond'] },
    { kind: '두 그림 더하기', known: [['square', 2], ['star', 4], ['heart', 9], ['moon', 7]], clues: [['diamond', '=', 'square', '+', 'star']], hidden: { diamond: 6 },
      code: ['diamond', 'heart', 'square', 'diamond', 'moon'] },
  ],
  // Lv6 (숨은 그림 1, 단서 1): 한 번 더 생각해야 하는 단서
  6: [
    { kind: '사이', known: [['star', 3], ['square', 8], ['circle', 1], ['moon', 5]], clues: [['star', '<', 'triangle', '<', 'moon']], hidden: { triangle: 4 },
      code: ['triangle', 'circle', 'square', 'triangle', 'moon'] },
    { kind: '같은 그림 둘 (■ + ■ = ☾)', known: [['moon', 8], ['star', 1], ['heart', 5], ['triangle', 9]], clues: [['square', '+', 'square', '=', 'moon']], hidden: { square: 4 },
      code: ['square', 'heart', 'square', 'moon', 'star'] },
    { kind: '사이', known: [['moon', 8], ['triangle', 1], ['heart', 6], ['star', 3]], clues: [['heart', '<', 'plus', '<', 'moon']], hidden: { plus: 7 },
      code: ['plus', 'star', 'plus', 'moon', 'triangle'] },
    { kind: '빼서 맞추기 (● − ▲ = ★)', known: [['circle', 9], ['star', 3], ['diamond', 1], ['moon', 7]], clues: [['circle', '−', 'triangle', '=', 'star']], hidden: { triangle: 6 },
      code: ['triangle', 'diamond', 'triangle', 'circle', 'moon'] },
    { kind: '세 배 거꾸로 (▲ × 3 = ●)', known: [['circle', 6], ['heart', 9], ['square', 4], ['star', 8]], clues: [['triangle', '×', 3, '=', 'circle']], hidden: { triangle: 2 },
      code: ['triangle', 'heart', 'triangle', 'square', 'star'] },
  ],
  // Lv7 (숨은 그림 2, 표 6줄): 계산과 논리를 섞는다. 단서 2–3줄
  7: [
    { kind: '두 그림 더하기 + 사이·짝수', known: [['diamond', 8], ['star', 5], ['square', 1]],
      clues: [['moon', '=', 'diamond', '+', 'square'], ['star', '<', 'circle', '<', 'diamond'], ['circle', '=', '짝수']], hidden: { moon: 9, circle: 6 },
      code: ['circle', 'moon', 'diamond', 'circle', 'star'] },
    { kind: '두 그림 더하기 + 사이·홀수', known: [['heart', 3], ['plus', 6], ['moon', 1]],
      clues: [['triangle', '=', 'heart', '+', 'plus'], ['heart', '<', 'star', '<', 'plus'], ['star', '=', '홀수']], hidden: { triangle: 9, star: 5 },
      code: ['star', 'triangle', 'heart', 'star', 'plus'] },
    { kind: '이어 풀기 (★ → ■ → ●)', known: [['star', 2], ['heart', 7], ['diamond', 1], ['moon', 5]],
      clues: [['square', '=', 'star', '+', 2], ['circle', '=', 'square', '×', 2]], hidden: { square: 4, circle: 8 },
      code: ['circle', 'square', 'heart', 'circle', 'star'] },
    { kind: '같은 그림 둘 + 경계·홀수', known: [['diamond', 6], ['star', 7], ['moon', 2]],
      clues: [['triangle', '+', 'triangle', '=', 'diamond'], ['star', '<', 'heart'], ['heart', '=', '홀수']], hidden: { triangle: 3, heart: 9 },
      code: ['heart', 'triangle', 'moon', 'heart', 'diamond'] },
    { kind: '빼기 → 그 답으로 사이·짝수', known: [['circle', 9], ['square', 5], ['star', 2]],
      clues: [['moon', '−', 'square', '=', 3], ['square', '<', 'plus', '<', 'moon'], ['plus', '=', '짝수']], hidden: { moon: 8, plus: 6 },
      code: ['plus', 'moon', 'star', 'plus', 'circle'] },
  ],
  // Lv8 (숨은 그림 3, 표 6줄): 두 그림을 함께 정하거나 이어 풀고, 그 답으로 하나를 더 구한다
  8: [
    { kind: '합과 두 배 + 경계·짝수', known: [['star', 2], ['plus', 7]],
      clues: [['triangle', '+', 'square', '=', 9], ['triangle', '=', 'square', '×', 2], ['plus', '<', 'circle'], ['circle', '=', '짝수']], hidden: { triangle: 6, square: 3, circle: 8 },
      code: ['triangle', 'circle', 'square', 'triangle', 'star'] },
    { kind: '합과 차 + 사이·짝수', known: [['heart', 1], ['moon', 4]],
      clues: [['circle', '+', 'diamond', '=', 8], ['circle', '=', 'diamond', '+', 2], ['heart', '<', 'star', '<', 'moon'], ['star', '=', '짝수']], hidden: { circle: 5, diamond: 3, star: 2 },
      code: ['circle', 'star', 'diamond', 'moon', 'circle'] },
    { kind: '곱과 차 → 두 답 더하기', known: [['star', 9], ['heart', 1], ['moon', 6]],
      clues: [['triangle', '×', 'square', '=', 12], ['triangle', '=', 'square', '+', 1], ['circle', '=', 'triangle', '+', 'square']], hidden: { triangle: 4, square: 3, circle: 7 },
      code: ['circle', 'triangle', 'star', 'square', 'circle'] },
    { kind: '같은 그림 셋 → 이어 풀기', known: [['heart', 2], ['moon', 5], ['square', 8]],
      clues: [['star', '+', 'star', '+', 'star', '=', 9], ['triangle', '=', 'star', '×', 2], ['diamond', '=', 'triangle', '+', 'star']], hidden: { star: 3, triangle: 6, diamond: 9 },
      code: ['triangle', 'star', 'diamond', 'moon', 'triangle'] },
  ],
};
