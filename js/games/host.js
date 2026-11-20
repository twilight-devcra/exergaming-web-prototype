// 게임이 main.js 에게서 받는 host 의 모양 (main.js makeHost 가 만든다). 실행 코드는 없고 타입만 적는다.
// 게임 파일에서는  /** @param {import('./host.js').GameHost} host */  처럼 가져다 쓴다.

/**
 * @typedef {object} GameHost
 * @property {HTMLElement} stage   게임을 그릴 자리
 * @property {number} level        이번 판의 난이도 (1부터)
 * @property {number} mult         점수 배율
 * @property {number} t0           게임을 시작한 게임 시계 시각 (ms)
 * @property {number} base         게임 1회를 완벽히 했을 때의 기본 점수
 * @property {(ms: number, fn: () => void) => void} after  게임 시계로 ms 뒤에 fn. 게임이 끝나면 부르지 않는다
 * @property {() => number} now    게임 시계 (ms). 일시정지·운영 메뉴·소개 중에는 멈춘다
 * @property {(load: number, onOut: () => void) => void} timer  문제 하나의 제한 시간. load = 일의 양 (config.questionTime)
 * @property {() => void} stopTimer
 * @property {(data: object, open?: boolean) => void} question  세션 기록: 입력을 받기 시작한 문제
 * @property {() => void} open     question(data, false) 로 띄운 문제의 입력이 열리는 순간
 * @property {(data: object) => void} input   세션 기록: 답 도중의 입력
 * @property {(data: { picked?: unknown, correct: boolean, timedOut?: boolean } & object) => void} answer  세션 기록: 최종 답
 * @property {(name: string) => void} sfx     효과음 (js/sfx.js 의 Sfx). GOOD·BAD 는 연속 정답 신호이기도 하다
 * @property {(pts: number, anchor?: Element | null, prefix?: string) => void} award  점수를 준다
 * @property {(result: GameResult) => void} done  게임이 끝났다
 */

/**
 * @typedef {object} GameResult
 * @property {boolean} cleared  다 맞혔는가
 * @property {number} correct   맞힌 문제 수
 * @property {number} total     푼 문제 수
 */

export {};
