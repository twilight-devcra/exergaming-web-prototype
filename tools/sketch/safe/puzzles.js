// 금고 열기 — 손으로 쓴 문제 (3단계 스케치용, 레벨마다 3개). 진짜 게임에서는 생성기가 만든다.
// LEVELS 는 레벨표 (docs/games/drafts/safe.md 와 같게). node tools/sketch/safe/check.js 로 모든 문제를 확인한다.
//   key     — 열쇠 표의 줄 수 (숫자 줄 + 단서 줄, 최대 6)
//   code    — 암호 자릿수
//   hidden  — 단서로 알아낼 그림 수
//   clues   — 단서의 종류
//   given   — 처음부터 정답으로 채워 둔 칸 수 (Lv1: 첫 칸을 채워 두어 할 일을 말없이 보여 준다)

export const LEVELS = [
  { key: 3, code: 3, hidden: 0, clues: '–', given: 1 },
  { key: 4, code: 4, hidden: 0, clues: '–' },
  { key: 4, code: 5, hidden: 0, clues: '– (같은 그림이 되풀이된다)' },
  { key: 5, code: 5, hidden: 0, clues: '–' },
  { key: 5, code: 5, hidden: 1, clues: '식: 표의 숫자 ± 1–3' },
  { key: 5, code: 5, hidden: 1, clues: '사이 (★ < ▲ < ☾) 또는 × 2' },
  { key: 6, code: 5, hidden: 2, clues: '두 그림 더하기 + 사이와 짝수·홀수' },
  { key: 6, code: 5, hidden: 3, clues: '두 그림을 함께 정하는 두 줄 + 한쪽 경계와 짝수·홀수' },
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
  // 식: 표의 숫자에 작은 수를 더하거나 뺀다
  5: [
    { known: [['moon', 5], ['plus', 9], ['triangle', 2], ['diamond', 4]], clues: [['heart', '=', 'moon', '+', 2]], hidden: { heart: 7 },
      code: ['heart', 'moon', 'triangle', 'heart', 'plus'] },
    { known: [['star', 3], ['circle', 8], ['square', 6], ['heart', 1]], clues: [['triangle', '=', 'circle', '−', 3]], hidden: { triangle: 5 },
      code: ['triangle', 'star', 'triangle', 'circle', 'heart'] },
    { known: [['diamond', 7], ['moon', 2], ['plus', 9], ['star', 4]], clues: [['circle', '=', 'moon', '+', 1]], hidden: { circle: 3 },
      code: ['circle', 'plus', 'diamond', 'circle', 'star'] },
  ],
  // 사이 (두 숫자 사이에 수가 하나뿐) 또는 × 2
  6: [
    { known: [['star', 3], ['square', 8], ['circle', 1], ['moon', 5]], clues: [['star', '<', 'triangle', '<', 'moon']], hidden: { triangle: 4 },
      code: ['triangle', 'circle', 'square', 'triangle', 'moon'] },
    { known: [['heart', 2], ['diamond', 9], ['plus', 6], ['circle', 7]], clues: [['square', '=', 'heart', '×', 2]], hidden: { square: 4 },
      code: ['square', 'plus', 'heart', 'square', 'diamond'] },
    { known: [['moon', 8], ['triangle', 1], ['heart', 6], ['star', 3]], clues: [['heart', '<', 'plus', '<', 'moon']], hidden: { plus: 7 },
      code: ['plus', 'star', 'plus', 'moon', 'triangle'] },
  ],
  // 두 그림 더하기 + 사이(후보 둘)와 짝수·홀수. 숫자 줄 3 + 단서 줄 3
  7: [
    { known: [['diamond', 8], ['star', 5], ['square', 1]],
      clues: [['moon', '=', 'diamond', '+', 'square'], ['star', '<', 'circle', '<', 'diamond'], ['circle', '=', '짝수']], hidden: { moon: 9, circle: 6 },
      code: ['circle', 'moon', 'diamond', 'circle', 'star'] },
    { known: [['heart', 3], ['plus', 6], ['moon', 1]],
      clues: [['triangle', '=', 'heart', '+', 'plus'], ['heart', '<', 'star', '<', 'plus'], ['star', '=', '홀수']], hidden: { triangle: 9, star: 5 },
      code: ['star', 'triangle', 'heart', 'star', 'plus'] },
    { known: [['circle', 7], ['diamond', 2], ['square', 4]],
      clues: [['heart', '=', 'circle', '+', 'diamond'], ['square', '<', 'moon', '<', 'circle'], ['moon', '=', '짝수']], hidden: { heart: 9, moon: 6 },
      code: ['moon', 'heart', 'square', 'moon', 'diamond'] },
  ],
  // 두 그림을 함께 정하는 두 줄 + 한쪽 경계(후보 둘)와 짝수·홀수. 숫자 줄 2 + 단서 줄 4
  8: [
    { known: [['star', 2], ['plus', 7]],
      clues: [['triangle', '+', 'square', '=', 9], ['triangle', '=', 'square', '×', 2], ['plus', '<', 'circle'], ['circle', '=', '짝수']], hidden: { triangle: 6, square: 3, circle: 8 },
      code: ['triangle', 'circle', 'square', 'triangle', 'star'] },
    { known: [['heart', 1], ['moon', 4]],
      clues: [['circle', '+', 'diamond', '=', 8], ['circle', '=', 'diamond', '+', 2], ['heart', '<', 'star', '<', 'moon'], ['star', '=', '짝수']], hidden: { circle: 5, diamond: 3, star: 2 },
      code: ['circle', 'star', 'diamond', 'moon', 'circle'] },
    { known: [['square', 9], ['triangle', 2]],
      clues: [['heart', '+', 'star', '=', 10], ['heart', '=', 'star', '+', 4], ['heart', '<', 'moon'], ['moon', '=', '짝수']], hidden: { heart: 7, star: 3, moon: 8 },
      code: ['heart', 'moon', 'star', 'triangle', 'heart'] },
  ],
};
