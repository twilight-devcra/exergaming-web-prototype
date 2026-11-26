// 라운드에서 인지 게임이 나오는 차례.
import { Util } from './config.js';

// 라운드 첫 게임은 설명 없이도 바로 알아듣는 것 중에서 고른다 (켜 둔 게 없으면 아무거나)
export const OPENING_GAMES = ['count', 'pipe'];

// 한 바퀴 = 켜 둔 게임(types)을 한 번씩. 바퀴마다 순서를 섞되, 바로 앞 게임과 같거나 비슷한(tags 가 겹치는) 게임이
// 이어지지 않게 한다 (바퀴가 바뀌는 자리 포함 — previous = 지난 바퀴의 마지막 게임). 그런 순서가 없으면 같은 게임만 피한다.
// opening 이면 첫 게임을 OPENING_GAMES 중에서 고른다.
// 섞은 차례로 깊이 우선 찾기는 처음 몇 수가 나쁘면 예산 안에 빠져나오지 못한다. 그래서 짧은 예산으로 몇 번 새로 섞어 다시 찾는다
// (기억 게임이 20개 가운데 7개가 된 뒤로, 한 번에 긴 예산을 쓰는 것보다 훨씬 잘 찾는다)
const RESTARTS = 12;
export function planPass(types, previous, opening) {
  for (let i = 0; i < RESTARTS; i++) {
    const order = planOrder(types, previous, opening, true);
    if (order) return order;
  }
  return planOrder(types, previous, opening, false) || Util.shuffle([...types]);
}

// 비슷한 게임끼리인가: 같은 게임이거나 꼬리표(js/games/tags.js)가 겹친다
function similar(a, b) {
  return a === b || a.tags.some((tag) => b.tags.includes(tag));
}

// 조건에 맞는 차례를 깊이 우선으로 찾는다. strict 면 비슷한 게임을, 아니면 같은 게임만 잇지 않는다. 못 찾으면 null
function planOrder(types, previous, opening, strict) {
  const order = [];
  const left = new Set(types);
  let budget = 1500; // 게임이 많고 조건이 빡빡할 때 오래 찾지 않게 (못 찾으면 planPass 가 새로 섞어 다시 찾는다)
  const canFollow = (last, gameType) => !last || types.length === 1 || (strict ? !similar(last, gameType) : last !== gameType);
  const search = () => {
    if (!left.size) return true;
    if (--budget < 0) return false;
    const last = order.length ? order[order.length - 1] : previous;
    let candidates = Util.shuffle([...left]).filter((gameType) => canFollow(last, gameType));
    if (opening && !order.length) {
      const openers = candidates.filter((gameType) => OPENING_GAMES.includes(gameType.id));
      if (openers.length) candidates = openers;
    }
    for (const gameType of candidates) {
      order.push(gameType);
      left.delete(gameType);
      if (search()) return true;
      order.pop();
      left.add(gameType);
    }
    return false;
  };
  return search() ? order : null;
}
