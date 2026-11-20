// 게임 꼬리표. 게임마다 static tags = [Tag.…] 로 단다.
// 꼬리표가 겹치는 게임끼리는 한 바퀴 안에서 연달아 나오지 않는다 (main.js planPass) —
// 비슷한 머리 쓰기가 이어지면 지루하고 지친다.
export const Tag = Object.freeze({
  MEMORY: 'memory', // 보고 기억해 두었다가 답한다
  NUMBER: 'number', // 수를 세거나 셈한다
  SEARCH: 'search', // 여럿 가운데서 찾는다
  SHAPE: 'shape',   // 모양을 맞추거나 잇는다
  TRACE: 'trace',   // 길을 따라간다
  ORDER: 'order',   // 차례를 따른다
  TRACK: 'track',   // 움직이는 것을 눈으로 좇는다
  WORD: 'word',     // 낱말
});
