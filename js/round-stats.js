// 라운드 기록: 게임별 성적과 연속 정답.
// 결과 화면 · 능력 점수(js/abilities.js) · 별(js/stars.js) · 세션 로그(main.js summary 의 stats)가 games 를 읽는다.

export class RoundStats {
  constructor(gameTypes) {
    // 게임 id → 성적. level = 도달한 최고 난이도, runs = 판마다 [레벨, 맞힌 수, 문제 수],
    // ms = 게임을 푸는 데 쓴 시간 (피드백 포함), think = 문제별 생각한 시간 (think()). runs · think 는 능력 점수에 쓴다
    this.games = Object.fromEntries(gameTypes.map((T) => [T.id, {
      plays: 0, cleared: 0, correct: 0, total: 0, points: 0, level: 0, runs: [], ms: 0,
      think: { n: 0, ms: 0, first: 0, out: 0, outMs: 0 },
    }]));
    this.streak = 0;     // 지금 이어지는 연속 정답
    this.bestStreak = 0;
  }

  // 문제 하나를 맞혔거나 틀렸다. 돌려주는 값 = 이 답 전까지 이어 온 연속 정답 수
  answered(correct) {
    const before = this.streak;
    if (correct) {
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
    } else {
      this.streak = 0;
    }
    return before;
  }

  addPoints(gameId, points) {
    this.games[gameId].points += points;
  }

  // 게임 한 판이 끝났다. result = 게임의 { cleared, correct, total }, ms = 그 판에 쓴 게임 시계 시간
  record(gameId, result, level, ms) {
    const game = this.games[gameId];
    game.plays++;
    game.level = Math.max(game.level, level);
    game.runs.push([level, result.correct, result.total]);
    game.ms += ms;
    if (result.cleared) game.cleared++;
    game.correct += result.correct;
    game.total += result.total;
  }

  // 문제 하나의 생각한 시간 (게임 시계 ms, 입력이 열린 뒤부터. js/session-log.js 의 answer).
  // 제때 답한 문제: n 개, ms = 답이 정해질 때까지의 합, first = 처음 입력할 때까지의 합.
  // 시간 초과: out 개, outMs = 그 문제들에 쓴 시간 합. 입력이 열리기 전에 누른 답(지시 따르기의 램프 전에 누름)은 시간이 없어 세지 않는다
  think(gameId, ms, first, timedOut) {
    if (ms == null) return;
    const think = this.games[gameId].think;
    if (timedOut) {
      think.out++;
      think.outMs += ms;
      return;
    }
    think.n++;
    think.ms += ms;
    think.first += first ?? ms;
  }
}
