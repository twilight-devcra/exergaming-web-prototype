// 라운드 난이도: 다음 인지 게임을 몇 레벨로 낼지 정한다 (cfg.difficulty).
//  adaptive — 계기판(value)이 맞히면 cfg.diffUp 만큼 오르고 틀리면 cfg.diffDown 만큼 내려간다. 레벨 = 계기판의 정수 부분
//  cycle    — 켜 둔 게임을 한 바퀴 돌 때마다 +1
import { U } from './config.js';
import { GAME_TYPES } from './games/index.js';

// 게임들 가운데 가장 높은 레벨 (설정 화면의 시작·최고 난이도 칸의 위 끝)
export function maxGameLevel() {
  return Math.max(...GAME_TYPES.map((T) => T.maxLevel));
}

// 이번 라운드에서 오를 수 있는 최고 난이도 (cfg.maxLevel, 라운드 난이도 프리셋이 정한다)
export function levelCapOf(cfg) {
  return Math.min(maxGameLevel(), cfg.maxLevel || Infinity);
}

export class Difficulty {
  // gameCount = 이번 라운드에 켜 둔 게임 수. cfg 는 라운드 중에 고쳐질 수 있으므로 그때그때 읽는다
  constructor(cfg, gameCount) {
    this.cfg = cfg;
    this.gameCount = gameCount;
    this.value = Math.min(cfg.startLevel, levelCapOf(cfg));
  }

  get adaptive() {
    return this.cfg.difficulty === 'adaptive';
  }

  // 계기판 한 걸음의 배율: 켜 둔 게임이 많을수록 작게 (cfg.diffGamesRef 참고)
  stepScale() {
    return Math.min(1, (this.cfg.diffGamesRef || Infinity) / this.gameCount);
  }

  // 문제 하나를 맞혔거나 틀렸다. 계기판의 위 끝은 최고 난이도 바로 아래까지 — 최고 레벨에서 한 번 틀려도 바로 내려가지 않는다.
  // 돌려주는 값 = 이번 걸음의 배율 (세션 로그용). adaptive 가 아니면 null
  answered(correct) {
    if (!this.adaptive) return null;
    const { diffUp, diffDown } = this.cfg;
    const scale = this.stepScale();
    this.value = U.clamp(this.value + (correct ? diffUp : -diffDown) * scale, 1, levelCapOf(this.cfg) + 0.99);
    return scale;
  }

  // 라운드의 gameIndex 번째(0부터) 게임 T 를 낼 레벨
  levelFor(T, gameIndex) {
    const top = Math.min(T.maxLevel, levelCapOf(this.cfg));
    if (this.adaptive) return U.clamp(Math.floor(this.value), 1, top);
    const cycle = Math.floor(gameIndex / this.gameCount);
    return Math.min(cycle + this.cfg.startLevel, top);
  }
}
