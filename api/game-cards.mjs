// 관리 화면의 게임 알아보기 카드: js/games 의 게임마다 이름 · 꼬리표 · 설명(hint) · 소개 그림(diagram)을 JSON 으로 찍는다.
// admin.js 가 따로 된 node 로 한 번 돌려 받아 둔다 (게임 모듈이 브라우저 전역을 읽어서, 서버 쪽 전역을 흐리지 않게 떼어 둔다).
// 실행: node api/game-cards.mjs
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

// 게임 모듈이 불러올 때 읽는 브라우저 전역만 흉내 낸다 (그림은 글자열만 만든다)
const store = new Map();
globalThis.location = { pathname: '/', search: '', hash: '', hostname: 'localhost', origin: 'http://localhost', href: 'http://localhost/' };
globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) };
globalThis.window = globalThis;
globalThis.document = { documentElement: { dataset: {} }, addEventListener() {}, createElement: () => ({ style: {}, dataset: {} }) };
globalThis.addEventListener = () => {};

// js/games/tags.js 의 꼬리표 → 관리 화면에 쓰는 말
const TAG_LABELS = { memory: '기억', number: '수 세기·셈', search: '찾기', shape: '모양 맞추기', trace: '길 따라가기', order: '차례 따르기', track: '눈으로 좇기', word: '낱말' };

const here = path.dirname(fileURLToPath(import.meta.url));
const { GAME_TYPES } = await import(pathToFileURL(path.join(here, '..', 'js', 'games', 'index.js')).href);
const cards = {};
for (const GameType of GAME_TYPES) {
  const card = { title: GameType.title, tags: (GameType.tags || []).map((tag) => TAG_LABELS[tag] || tag), hint: '', steps: [] };
  try { card.hint = typeof GameType.hint === 'function' ? GameType.hint(1) : GameType.hint || ''; } catch { }
  try { card.steps = GameType.diagram ? GameType.diagram(1).map(({ svg, caption }) => ({ svg, caption })) : []; } catch { }
  cards[GameType.id] = card;
}
process.stdout.write(JSON.stringify(cards));
