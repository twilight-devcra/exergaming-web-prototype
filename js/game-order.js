// 라운드에서 인지 게임이 나오는 차례.
import { U } from './config.js';

// 라운드 첫 게임은 설명 없이도 바로 알아듣는 것 중에서 고른다 (켜 둔 게 없으면 아무거나)
export const OPENING_GAMES = ['count', 'ladder'];

// 한 바퀴 = 켜 둔 게임(types)을 한 번씩. 바퀴마다 순서를 섞되, 바로 앞 게임과 같거나 비슷한(tags 가 겹치는) 게임이
// 이어지지 않게 한다 (바퀴가 바뀌는 자리 포함 — prev = 지난 바퀴의 마지막 게임). 그런 순서가 없으면 같은 게임만 피한다.
// opening 이면 첫 게임을 OPENING_GAMES 중에서 고른다.
export function planPass(types, prev, opening) {
  return planOrder(types, prev, opening, true) || planOrder(types, prev, opening, false) || U.shuffle([...types]);
}

// 비슷한 게임끼리인가: 같은 게임이거나 꼬리표(js/games/tags.js)가 겹친다
function similar(a, b) {
  return a === b || a.tags.some((tag) => b.tags.includes(tag));
}

// 조건에 맞는 차례를 깊이 우선으로 찾는다. strict 면 비슷한 게임을, 아니면 같은 게임만 잇지 않는다. 못 찾으면 null
function planOrder(types, prev, opening, strict) {
  const order = [];
  const left = new Set(types);
  let budget = 5000; // 게임이 많고 조건이 빡빡할 때 오래 찾지 않게
  const canFollow = (last, T) => !last || types.length === 1 || (strict ? !similar(last, T) : last !== T);
  const search = () => {
    if (!left.size) return true;
    if (--budget < 0) return false;
    const last = order.length ? order[order.length - 1] : prev;
    let candidates = U.shuffle([...left]).filter((T) => canFollow(last, T));
    if (opening && !order.length) {
      const openers = candidates.filter((T) => OPENING_GAMES.includes(T.id));
      if (openers.length) candidates = openers;
    }
    for (const T of candidates) {
      order.push(T);
      left.delete(T);
      if (search()) return true;
      order.pop();
      left.add(T);
    }
    return false;
  };
  return search() ? order : null;
}
