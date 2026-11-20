// 여러 게임이 함께 쓰는 작은 조각: 진행 단계 이름, 진행 점, 점수 나누기, 결과 모양.
// 게임마다 따로 쓰던 같은 코드를 모았다. 게임에만 있는 단계(예: track 의 cue·move)는 그 게임 파일에서 더한다.

// 게임 진행 단계. 입력은 INPUT 일 때만 받는다
export const Phase = Object.freeze({
  SHOW: 'show',   // 외울 것·움직임을 보여 주는 중
  INPUT: 'input', // 답을 기다린다
  WAIT: 'wait',   // 채점 뒤 다음 문제를 기다린다
  END: 'end',     // 끝났다
});

// U.frame 이 만든 진행 점 (문제마다 하나)
export const Progress = {
  // 지금 푸는 문제의 점을 표시한다
  current(dots, index) {
    [...dots.children].forEach((dot, i) => dot.classList.toggle('cur', i === index));
  },
  // 다 푼 문제의 점을 맞음·틀림으로 칠한다
  mark(dots, index, correct) {
    const dot = dots.children[index];
    dot.classList.remove('cur');
    dot.classList.add(correct ? 'right' : 'wrong');
  },
};

/**
 * 게임 한 판의 점수를 parts 개 문제로 나눈 몫 (문제를 맞힐 때마다 이만큼 준다)
 * @param {import('./host.js').GameHost} host
 * @param {number} parts
 */
export function pointsPer(host, parts) {
  return (host.base * host.mult) / parts;
}

/**
 * 끝까지 푼 게임의 결과
 * @returns {import('./host.js').GameResult}
 */
export function resultOf(correct, total) {
  return { cleared: correct === total, correct, total };
}

/**
 * 중간에 그만둔 게임의 결과 (answered = 그때까지 푼 문제 수)
 * @returns {import('./host.js').GameResult}
 */
export function abortedResult(correct, answered) {
  return { cleared: false, correct, total: answered };
}
