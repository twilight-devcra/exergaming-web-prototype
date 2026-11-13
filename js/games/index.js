// 인지 게임 목록. 메뉴·라운드·능력 그래프가 이 순서를 쓴다
import { PathGame } from './path.js';
import { SymbolGame } from './symbol.js';
import { ArithGame } from './arith.js';
import { CountGame } from './count.js';
import { FitGame } from './fit.js';
import { SeekGame } from './seek.js';
import { CoverGame } from './cover.js';
import { LadderGame } from './ladder.js';
import { NovelGame } from './novel.js';
import { TrackGame } from './track.js';
import { FollowGame } from './follow.js';
import { PairGame } from './pair.js';
import { BoxGame } from './box.js';
import { CompareGame } from './compare.js';
import { CoinGame } from './coin.js';
import { RecallGame } from './recall.js';

export const GAME_TYPES = [PathGame, SymbolGame, ArithGame, CountGame, FitGame, SeekGame, CoverGame, LadderGame, NovelGame, TrackGame, FollowGame, PairGame, BoxGame, CompareGame, CoinGame, RecallGame];
