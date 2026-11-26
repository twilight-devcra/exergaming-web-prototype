// 서버 시험: 빈 데이터 폴더로 서버를 띄우고 docs/SERVER.md 의 규칙을 하나씩 확인한다.
// 실행: node api/test.js   (끝나면 임시 폴더를 지운다. --keep 이면 남기고 서버도 계속 띄워 둔다 → 관리 화면 확인용)
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const { tmpdir } = require('os');
const path = require('path');
const assert = require('assert');
const { HISTORY_FIELDS } = require('../js/history-entry.js');

// 회원 기록 항목 하나가 HISTORY_FIELDS 를 정확히 지키는가 (필드가 같고, 값은 그 형이거나 null)
function assertEntry(entry) {
  assert.deepStrictEqual(Object.keys(entry).sort(), Object.keys(HISTORY_FIELDS).sort(), '필드가 HISTORY_FIELDS 와 같다');
  for (const [field, type] of Object.entries(HISTORY_FIELDS)) {
    const value = entry[field];
    if (value === null) { assert.notStrictEqual(field, 'at', 'at 은 필수'); continue; }
    const ok = type === 'number' ? typeof value === 'number' && isFinite(value)
      : type === 'string' ? typeof value === 'string'
      : type === 'date' ? typeof value === 'string' && !isNaN(Date.parse(value))
      : type === 'object' ? typeof value === 'object' && !Array.isArray(value)
      : type === 'games' ? typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([id, game]) =>
        /^[a-z][a-z0-9]{0,15}$/.test(id) && game.total > 0
        && ['correct', 'total', 'limitMs', 'spareMs'].every((key) => game[key] === null || (typeof game[key] === 'number' && game[key] >= 0)))
      : false;
    assert.ok(ok, `${field} 는 ${type} 이어야 한다: ${JSON.stringify(value)}`);
  }
}

const KEEP = process.argv.includes('--keep');
const PORT = 18787;
const BASE = `http://127.0.0.1:${PORT}`;
const KEY = 'test-upload-key';
const ADMIN = 'test-admin';
const ORIGIN = 'https://twilight-devcra.github.io';
const dir = fs.mkdtempSync(path.join(tmpdir(), 'exergame-api-'));

// 문서 형식의 세션 하나 (문제 정답률은 게임·레벨마다 다르게 해서 관리 화면 색이 보이게)
// 이벤트·통계의 짧은 속성 이름(t · q · ms · pts · v)은 세션 로그 형식이다 (docs/SESSION_LOG.md)
/* eslint-disable id-length -- 세션 로그 형식 */
const GAMES = ['path', 'symbol', 'arith', 'count', 'fit', 'seek', 'cover', 'pipe', 'novel', 'track', 'follow', 'pair', 'box', 'compare', 'coin', 'recall', 'chain'];
function fakeSession({ device, id, user = null, ended = 'complete', days = 0, difficulty = 'normal' }) {
  const startedAt = new Date(Date.now() - days * 864e5).toISOString();
  const events = [{ t: 0, clock: 0, type: 'calib_start' }, { t: 9000, clock: 0, type: 'play_start' }];
  const stats = {};
  let questionNumber = 0, clock = 0;
  for (let i = 0; i < 12; i++) {
    const game = GAMES[(Number(id) + i * 5) % GAMES.length];
    const level = 2 + ((Number(id) + i) % 5);
    events.push({ t: 9000 + clock, clock, type: 'game_start', game, level, mult: 1, diff: level + 0.2 });
    let correct = 0;
    for (let round = 0; round < 3; round++) {
      questionNumber++;
      const hard = (GAMES.indexOf(game) % 4) * 0.08 + level * 0.06;
      const isCorrect = Math.random() > hard;
      const timedOut = !isCorrect && Math.random() < 0.3;
      const answerMs = 1500 + Math.random() * 5000 + level * 300;
      events.push({ t: 9000 + clock, clock, type: 'question', game, level, q: questionNumber });
      events.push({ t: 9000 + clock, clock, type: 'timer_start', game, load: 3, limitMs: 9000 });
      events.push({ t: 9000 + clock + answerMs, clock: clock + answerMs, type: 'answer', game, q: questionNumber, ms: answerMs, correct: isCorrect, timedOut });
      clock += answerMs + 800;
      correct += isCorrect;
    }
    events.push({ t: 9000 + clock, clock, type: 'points', game, pts: correct * 40 });
    events.push({ t: 9000 + clock, clock, type: 'game_end', game, cleared: correct === 3, correct, total: 3 });
    stats[game] = { plays: 1, cleared: correct === 3 ? 1 : 0, correct, total: 3, points: correct * 40, level, runs: [[level, correct, 3]], ms: clock,
      think: { n: 3, ms: 6000, first: 3000, out: 0, outMs: 0, limitMs: 27000, spareMs: 9000 } };
  }
  events.push({ t: 9000 + clock, clock, type: 'session_end', ended });
  const stepUp = { relax: 0.3, normal: 0.4, challenge: 0.5 }[difficulty];
  const stepDown = { relax: 0.9, normal: 0.6, challenge: 0.5 }[difficulty];
  return {
    meta: {
      version: 4, id: String(id), device, edition: 'app', mode: 'demo', track: 'dual', user, guest: false,
      session: { min: 5, difficulty, track: 'dual' }, startedAt, endedAt: startedAt, durationMs: clock + 9000, ended,
      input: 'pedal', theme: 'meadow', music: 'beat', config: { difficulty: 'adaptive', diffUp: stepUp, diffDown: stepDown },
      landmark: { v: 1, kind: 'cottage', size: 1, seed: 7, wall: '#ffeecc', roof: '#aa3322' },
      summary: { score: 4000 + Number(id) % 900, exScore: 2500, cogScore: 1500, baseline: 60, bestStreak: 4, elapsedSec: clock / 1000, stats,
        exercise: { kcal: 30, distM: 900, revs: 150, avgRpm: 58, activeSec: 290 },
        accuracy: { exercise: 0.82, game: 0.67, recommend: 'keep', recommendTo: null } },
    },
    events,
    keys: [], capd: [], workout: [],
    samples: Array.from({ length: 50 }, (_, i) => [i * 100, i * 100, 60, 60, 0, i % 4 ? 1 : 0, i * 10]),
  };
}
/* eslint-enable id-length */

const request = (urlPath, { method = 'GET', body, headers = {} } = {}) => fetch(BASE + urlPath, {
  method, headers, body: body === undefined ? undefined : typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body),
});
const auth = { Authorization: `Bearer ${KEY}`, Origin: ORIGIN };
const post = (log, extra = '') => request(`/sessions${extra}`, { method: 'POST', body: log, headers: { ...auth, 'Content-Type': 'application/json' } });
const create = (id, extra = '') => request(`/users${extra}`, { method: 'POST', body: { id, device: 'tab-a' }, headers: { ...auth, 'Content-Type': 'application/json' } });
const adminAuth = { Authorization: 'Basic ' + Buffer.from(`x:${ADMIN}`).toString('base64') };

async function main() {
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, UPLOAD_KEY: KEY, ADMIN_PASSWORD: ADMIN, USERS_NEW_PER_MIN: '200' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve) => server.stdout.once('data', resolve));
  const check = async (name, testBody) => {
    await testBody();
    console.log(`  ok  ${name}`);
  };
  try {
    await check('health', async () => assert.strictEqual((await request('/health')).status, 200));

    await check('CORS 사전 요청: 허락한 출처만', async () => {
      const response = await request('/sessions', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' } });
      assert.strictEqual(response.status, 204);
      assert.strictEqual(response.headers.get('access-control-allow-origin'), ORIGIN);
      assert.match(response.headers.get('access-control-allow-headers'), /Authorization/);
      const other = await request('/sessions', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
      assert.strictEqual(other.headers.get('access-control-allow-origin'), null);
    });

    await check('키가 틀리면 401', async () => {
      const response = await request('/sessions', { method: 'POST', body: '{}', headers: { Authorization: 'Bearer nope' } });
      assert.strictEqual(response.status, 401);
    });

    await check('업로드 2xx + 실제 응답에도 CORS', async () => {
      const response = await post(fakeSession({ device: 'tab-a', id: 1000, user: '12345674' }));
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.headers.get('access-control-allow-origin'), ORIGIN);
    });

    await check('같은 세션을 두 번 보내도 한 건', async () => {
      await post(fakeSession({ device: 'tab-a', id: 1000, user: '12345674' }));
      const history = await (await request('/history?user=12345674', { headers: auth })).json();
      assert.strictEqual(history.sessions.length, 1);
    });

    await check('형식이 이상해도 2xx (예전 세션, 깨진 JSON)', async () => {
      assert.strictEqual((await post({ meta: { version: 1, id: '5' }, events: 'x' })).status, 200);
      assert.strictEqual((await post('{not json')).status, 200);
      assert.strictEqual((await post('[]')).status, 200);
    });

    await check('2 MB 세션도 받는다', async () => {
      const big = fakeSession({ device: 'tab-b', id: 2000 });
      big.capd = Array.from({ length: 15000 }, (_, i) => [i * 50, i, ...Array(20).fill(12345)]);
      const body = JSON.stringify(big);
      assert.ok(body.length > 1.5e6, `size ${body.length}`);
      assert.strictEqual((await post(body)).status, 200);
    });

    await check('회원 기록: 결과까지 간 판만, 필드와 형은 js/history-entry.js 대로', async () => {
      await post(fakeSession({ device: 'tab-b', id: 1001, user: '12345674', days: 1 }));
      await post(fakeSession({ device: 'tab-b', id: 1002, user: '12345674', ended: 'abandoned' }));
      await post(fakeSession({ device: 'tab-b', id: 1003, user: '12345674', ended: 'user' }));
      const history = await (await request('/history?user=12345674', { headers: auth })).json();
      assert.strictEqual(history.sessions.length, 2);
      history.sessions.forEach(assertEntry);
      const entry = history.sessions.find((session) => session.sid === '1001');
      assert.strictEqual(entry.device, 'tab-b');
      assert.strictEqual(entry.min, 5);
      assert.strictEqual(typeof entry.score, 'number');
      assert.strictEqual(typeof entry.gameAcc, 'number');
      assert.strictEqual(entry.look.kind, 'cottage');
      assert.strictEqual(entry.exAcc, 0.82);
      const games = Object.values(entry.games);
      assert.ok(games.length > 0, '게임별 성적이 있다');
      for (const game of games) assert.deepStrictEqual([game.total, game.limitMs, game.spareMs], [3, 27000, 9000]);
    });

    await check('회원 기록: 형이 다른 값은 null, 없는 필드는 버린다 (XSS 막기)', async () => {
      const bad = fakeSession({ device: 'tab-x', id: 7000, user: '76543214' });
      const html = '<img src=x onerror=alert(1)>';
      Object.assign(bad.meta, { track: [html], landmark: html, extra: html });
      bad.meta.session.min = html;
      bad.meta.session.difficulty = { toString: html };
      Object.assign(bad.meta.summary, { score: html });
      bad.meta.summary.exercise.kcal = '30';
      bad.meta.summary.stats = { a: { level: html, correct: '9', total: 3, think: { limitMs: html, spareMs: -5 } }, b: null, [html]: { correct: 0, total: 1 } };
      bad.meta.summary.accuracy = { exercise: html };
      await post(bad);
      await post(fakeSession({ device: 'tab-x', id: 7001, user: '76543214', ended: 'complete' }));
      const noDate = fakeSession({ device: 'tab-x', id: 7002, user: '76543214' });
      noDate.meta.startedAt = html;
      await post(noDate);
      const history = await (await request('/history?user=76543214', { headers: auth })).json();
      assert.strictEqual(history.sessions.length, 2, '날짜가 아닌 at 은 버린다');
      history.sessions.forEach(assertEntry);
      const entry = history.sessions.find((session) => session.sid === '7000');
      for (const field of ['min', 'difficulty', 'track', 'score', 'kcal', 'look']) assert.strictEqual(entry[field], null, field);
      assert.strictEqual(entry.level, 0);
      assert.strictEqual(entry.gameAcc, 0); // 글 '9' 는 맞힌 수로 세지 않는다
      assert.deepStrictEqual(entry.games, { a: { correct: null, total: 3, limitMs: null, spareMs: null } }, '이상한 게임 id 와 값은 버린다');
      assert.strictEqual(entry.exAcc, null);
      assert.ok(!JSON.stringify(history).includes('<'), 'HTML 이 응답에 남지 않는다');
    });

    await check('docs/SERVER.md 회원 기록 표 = js/history-entry.js HISTORY_FIELDS', async () => {
      const serverDoc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'SERVER.md'), 'utf8');
      const section = serverDoc.split(/^## /m).find((part) => part.startsWith('회원 기록'));
      const table = section.split(/\r?\n/).filter((line) => /^\| `/.test(line));
      const documented = {};
      for (const row of table) {
        const [names, type] = row.split('|').slice(1, 3);
        const typeName = (/`(\w+)`/.exec(type) || [])[1];
        for (const [, field] of names.matchAll(/`(\w+)`/g)) documented[field] = typeName;
      }
      assert.deepStrictEqual(documented, { ...HISTORY_FIELDS }, '필드나 형을 바꿨으면 문서 표의 형 칸도 함께 고친다');
    });

    await check('기록이 없는 번호·이상한 번호는 빈 목록', async () => {
      assert.deepStrictEqual(await (await request('/history?user=99999997', { headers: auth })).json(), { sessions: [] });
      assert.deepStrictEqual(await (await request('/history?user=abc', { headers: auth })).json(), { sessions: [] });
    });

    await check('env 로 나뉜다 (dev 미리 보기가 운영 기록에 안 섞임)', async () => {
      await post(fakeSession({ device: 'tab-c', id: 3000, user: '12345674' }), '?env=dev');
      const prod = await (await request('/history?user=12345674', { headers: auth })).json();
      const dev = await (await request('/history?user=12345674&env=dev', { headers: auth })).json();
      assert.strictEqual(prod.sessions.length, 2);
      assert.strictEqual(dev.sessions.length, 1);
    });

    await check('아이디: 만들기 · 겹치면 409 (대소문자 무시) · 이상한 꼴은 400', async () => {
      const created = await create('gym-a_철수');
      assert.strictEqual(created.status, 201);
      assert.strictEqual(created.headers.get('access-control-allow-origin'), ORIGIN);
      assert.strictEqual((await create('gym-a_철수')).status, 409);
      assert.strictEqual((await create('gym-a_Kim')).status, 201);
      assert.strictEqual((await create('gym-a_kim')).status, 409, '영문 대소문자만 다르면 같은 아이디');
      assert.strictEqual((await create('gym-b_철수')).status, 201, '접두어가 다르면 다른 아이디');
      assert.strictEqual((await create('gym-a_철수', '?env=dev')).status, 201, 'env 가 다르면 따로');
      for (const bad of ['철수', 'gym-a_', 'gym-a_철 수', 'gym-a_<b>', 'GYM_철수', 'gym-a_ㅊ', 'gym-a_열세글자가넘는아이디입니다요']) {
        assert.strictEqual((await create(bad)).status, 400, bad);
      }
      const noKey = await request('/users', { method: 'POST', body: { id: 'gym-a_영희' }, headers: { 'Content-Type': 'application/json' } });
      assert.strictEqual(noKey.status, 401);
    });

    await check('아이디 목록: 접두어별, 세션으로만 아는 아이디도, 아이디 꼴이 아닌 user 는 빼고', async () => {
      await post(fakeSession({ device: 'tab-a', id: 8000, user: 'gym-a_영희', days: 2 }));
      await post(fakeSession({ device: 'tab-a', id: 8001, user: 'gym-a_철수' }));
      await post(fakeSession({ device: 'tab-a', id: 8002, user: 'gym-a_<img src=x>' }));
      const list = await (await request('/users?prefix=gym-a', { headers: auth })).json();
      const byId = Object.fromEntries(list.users.map((user) => [user.id, user]));
      assert.deepStrictEqual(Object.keys(byId).sort(), ['gym-a_Kim', 'gym-a_영희', 'gym-a_철수'].sort());
      assert.ok(Date.parse(byId['gym-a_철수'].last) > Date.parse(byId['gym-a_영희'].last), 'last 는 마지막 세션');
      assert.deepStrictEqual((await (await request('/users?prefix=gym-b', { headers: auth })).json()).users.map((user) => user.id), ['gym-b_철수']);
      assert.strictEqual((await request('/users?prefix=Bad_Prefix', { headers: auth })).status, 400);
      assert.strictEqual((await create('gym-a_영희')).status, 409, '세션으로만 아는 아이디도 겹침');
      const history = await (await request(`/history?user=${encodeURIComponent('gym-a_철수')}`, { headers: auth })).json();
      assert.strictEqual(history.sessions.length, 1, '글 아이디로도 회원 기록을 받는다');
    });

    await check('한글 접두어: 만들기 · 목록 (앞이 같은 다른 접두어는 안 섞임) · 회원 기록', async () => {
      assert.strictEqual((await create('강남_철수')).status, 201);
      assert.strictEqual((await create('강남_철수')).status, 409);
      assert.strictEqual((await create('강남구_영희')).status, 201);
      assert.strictEqual((await create('강남-2관_민수')).status, 201);
      for (const bad of ['ㄱ남_철수', '강 남_철수', '강남_ㅊ', 'Gangnam_철수']) assert.strictEqual((await create(bad)).status, 400, bad);
      await post(fakeSession({ device: 'tab-k', id: 8100, user: '강남_철수' }));
      const list = await (await request(`/users?prefix=${encodeURIComponent('강남')}`, { headers: auth })).json();
      assert.deepStrictEqual(list.users.map((user) => user.id), ['강남_철수'], "'강남구' · '강남-2관' 의 아이디는 '강남' 목록에 없다");
      const otherList = await (await request(`/users?prefix=${encodeURIComponent('강남구')}`, { headers: auth })).json();
      assert.deepStrictEqual(otherList.users.map((user) => user.id), ['강남구_영희']);
      const history = await (await request(`/history?user=${encodeURIComponent('강남_철수')}`, { headers: auth })).json();
      assert.strictEqual(history.sessions.length, 1);
    });

    await check('관리 화면: 비밀번호 없으면 401, 있으면 열림', async () => {
      assert.strictEqual((await request('/admin')).status, 401);
      assert.strictEqual((await request('/admin', { headers: { Authorization: 'Basic ' + Buffer.from('x:wrong').toString('base64') } })).status, 401);
      assert.strictEqual((await request('/admin', { headers: adminAuth })).status, 200);
      assert.strictEqual((await request('/admin/api/overview', { headers: { Authorization: `Bearer ${KEY}` } })).status, 401);
    });

    await check('로그 버전 5 까지: 상자 속 과일의 문제 내용(q)이 번호를 덮어쓴 문제도 색인에 들어간다', async () => {
      const log = fakeSession({ device: 'tab-box', id: 9100 });
      /* eslint-disable id-length -- 세션 로그 이벤트 형식 (t · q · ms) */
      const makeEvent = (type, fields) => ({ t: 0, clock: 0, type, ...fields });
      log.events = [
        makeEvent('question', { game: 'count', level: 3, q: 1 }), makeEvent('answer', { game: 'count', q: 1, ms: 2000, correct: true, timedOut: false }),
        makeEvent('question', { game: 'box', level: 3, q: { type: 'total', box: 'A', kinds: [] } }), makeEvent('answer', { game: 'box', q: 2, ms: 3000, correct: true, timedOut: false }),
        makeEvent('question', { game: 'count', level: 3, q: 3 }), makeEvent('answer', { game: 'count', q: 3, ms: 2500, correct: false, timedOut: false }),
        makeEvent('session_end', { ended: 'complete' }),
      ];
      /* eslint-enable id-length */
      await post(log);
      const rows = (await (await request('/admin/export/questions.csv?device=tab-box', { headers: adminAuth })).text()).trim().split('\n');
      const head = rows[0].replace(/^﻿/, '').split(',');
      const got = rows.slice(1).map((row) => Object.fromEntries(row.split(',').map((value, i) => [head[i], value])));
      assert.deepStrictEqual(got.map((row) => [row.q, row.game, row.answered]), [['1', 'count', '1'], ['2', 'box', '1'], ['3', 'count', '1']]);
    });

    await check('관리 집계 · CSV · 원본 내려받기', async () => {
      for (let i = 0; i < 40; i++) await post(fakeSession({ device: `tab-${i % 3}`, id: 5000 + i, user: '12345674', days: i % 9, difficulty: ['relax', 'normal', 'challenge'][i % 3] }));
      const overview = await (await request('/admin/api/overview', { headers: adminAuth })).json();
      assert.ok(overview.totals.n >= 40 && overview.totals.questions > 1000);
      const balance = await (await request('/admin/api/balance?difficulty=relax', { headers: adminAuth })).json();
      assert.ok(balance.cells.length > 10);
      assert.ok(balance.cells.every((cell) => Math.abs(cell.target - 0.75) < 1e-9), 'relax 기준 75%');
      const csv = await (await request('/admin/export/questions.csv', { headers: adminAuth })).text();
      assert.match(csv.split('\n')[0], /game,level,correct/);
      const raw = await request('/admin/raw/prod/tab-a/1000', { headers: adminAuth });
      assert.strictEqual(raw.status, 200);
      assert.strictEqual(raw.headers.get('content-type'), 'application/gzip');
      assert.strictEqual((await request('/admin/raw/prod/..%2F..%2Fetc/passwd', { headers: adminAuth })).status, 404);
      assert.strictEqual((await request('/admin/replay?env=prod&device=tab-a&sid=1000')).status, 401);
      const replay = await request('/admin/replay?env=prod&device=tab-a&sid=1000', { headers: adminAuth });
      assert.strictEqual(replay.status, 200);
      assert.match(await replay.text(), /세션 재생/);
      const options = await (await request('/admin/api/options', { headers: adminAuth })).json();
      assert.strictEqual(options.titles.coin, '동전 세기');
      const cards = await (await request('/admin/api/games', { headers: adminAuth })).json();
      assert.strictEqual(cards.coin.title, '동전 세기');
      assert.ok(Object.keys(cards).length >= 19, '게임마다 카드');
      assert.ok(Object.values(cards).every((card) => card.steps.length && card.steps.every((step) => step.svg.startsWith('<svg') && step.caption)), '카드마다 소개 그림');
      assert.ok(cards.coin.tags.includes('찾기') && cards.coin.hint);
      const gameCss = await (await request('/admin/game.css', { headers: adminAuth })).text();
      assert.match(gameCss, /^:host \{/, '그림자 DOM 용 색 변수');
      assert.match(gameCss, /\.dg-svg/);
    });

    await check('관리 날짜는 한국 시간(KST) 하루 기준', async () => {
      const late = fakeSession({ device: 'tab-k', id: 9100 });
      late.meta.startedAt = '2026-01-01T16:30:00.000Z'; // KST 1월 2일 01:30
      assert.ok((await post(late, '?env=kst')).ok);
      const overviewOf = async (extra) => (await request(`/admin/api/overview?env=kst${extra}`, { headers: adminAuth })).json();
      assert.deepStrictEqual((await overviewOf('')).days, [{ day: '2026-01-02', n: 1 }]);
      assert.strictEqual((await overviewOf('&from=2026-01-02&to=2026-01-02')).totals.n, 1);
      assert.strictEqual((await overviewOf('&from=2026-01-01&to=2026-01-01')).totals.n, 0);
      assert.strictEqual((await overviewOf('&from=bad')).totals.n, 1, '잘못된 날짜는 무시');
    });

    await check('회원 기록 요청 수 제한 (429)', async () => {
      let last;
      for (let i = 0; i < 35; i++) last = await request('/history?user=12345674', { headers: auth });
      assert.strictEqual(last.status, 429);
    });

    await check('색인 다시 만들기', async () => {
      const reindex = spawn(process.execPath, [path.join(__dirname, 'server.js'), '--reindex'], { env: { ...process.env, DATA_DIR: dir } });
      let out = '';
      reindex.stdout.on('data', (chunk) => (out += chunk));
      await new Promise((resolve) => reindex.on('exit', resolve));
      assert.match(out, /reindexed \d+ sessions/);
    });

    console.log('all passed');
    if (KEEP) {
      console.log(`\n관리 화면: ${BASE}/admin  (비밀번호 ${ADMIN}) · 데이터 ${dir} · Ctrl+C 로 끝`);
      return;
    }
  } catch (error) {
    console.error('FAILED:', error);
    process.exitCode = 1;
  }
  server.kill();
  await new Promise((resolve) => server.on("exit", resolve));
  fs.rmSync(dir, { recursive: true, force: true });
}
main();
