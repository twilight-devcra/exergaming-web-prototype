// 효과음 이름. 게임은 host.sfx(Sfx.…) 로, 그 밖에는 audio.sfx(Sfx.…) 로 울린다 (소리는 audio.js sfx).
// GOOD·BAD 는 소리만이 아니라 신호이기도 하다: main.js 가 이 둘을 가로채 연속 정답을 세고 보상을 키운다.
export const Sfx = Object.freeze({
  TAP: 'tap',
  GOOD: 'good',          // 정답
  BAD: 'bad',            // 오답 · 시간 초과
  DROP: 'drop',          // 길게 이어 온 연속 정답이 끊길 때
  CLEAR: 'clear',        // 한 게임을 다 맞혔을 때
  BLINK: 'blink',        // 짧은 알림 (판이 바뀌거나 차례가 시작될 때)
  BUILD: 'build',        // 라운드 끝에 건물을 한 층 올릴 때
  BUILD_TOP: 'buildTop', // 지붕을 얹을 때
  TICK: 'tick',
  COUNT: 'count',        // 시작 전 셋·둘·하나
  START: 'go',
  END: 'end',            // 라운드 끝
});
