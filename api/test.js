// 서버 시험: 빈 데이터 폴더로 서버를 띄우고 docs/SERVER.md 의 규칙을 하나씩 확인한다.
// 실행: node api/test.js   (끝나면 임시 폴더를 지운다. --keep 이면 남기고 서버도 계속 띄워 둔다 → 관리 화면 확인용)
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { HISTORY_FIELDS } = require('../js/history-entry.js');

// 회원 기록 항목 하나가 HISTORY_FIELDS 를 정확히 지키는가 (필드가 같고, 값은 그 형이거나 null)
function assertEntry(x) {
  assert.deepStrictEqual(Object.keys(x).sort(), Object.keys(HISTORY_FIELDS).sort(), '필드가 HISTORY_FIELDS 와 같다');
  for (const [k, type] of Object.entries(HISTORY_FIELDS)) {
    const v = x[k];
    if (v === null) { assert.notStrictEqual(k, 'at', 'at 은 필수'); continue; }
    const ok = type === 'number' ? typeof v === 'number' && isFinite(v)
      : type === 'string' ? typeof v === 'string'
      : type === 'date' ? typeof v === 'string' && !isNaN(Date.parse(v))
      : type === 'object' ? typeof v === 'object' && !Array.isArray(v)
      : false;
    assert.ok(ok, `${k} 는 ${type} 이어야 한다: ${JSON.stringify(v)}`);
  }
}

const KEEP = process.argv.includes('--keep');
const PORT = 18787;
const BASE = `http://127.0.0.1:${PORT}`;
const KEY = 'test-upload-key';
const ADMIN = 'test-admin';
const ORIGIN = 'https://twilight-devcra.github.io';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exergame-api-'));

// 문서 형식의 세션 하나 (문제 정답률은 게임·레벨마다 다르게 해서 관리 화면 색이 보이게)
const GAMES = ['path', 'symbol', 'arith', 'count', 'fit', 'seek', 'cover', 'pipe', 'novel', 'track', 'follow', 'pair', 'box', 'compare', 'coin', 'recall', 'chain'];
function fakeSession({ device, id, user = null, ended = 'complete', days = 0, difficulty = 'normal' }) {
  const startedAt = new Date(Date.now() - days * 864e5).toISOString();
  const events = [{ t: 0, clock: 0, type: 'calib_start' }, { t: 9000, clock: 0, type: 'play_start' }];
  const stats = {};
  let q = 0, clock = 0;
  for (let i = 0; i < 12; i++) {
    const game = GAMES[(Number(id) + i * 5) % GAMES.length];
    const level = 2 + ((Number(id) + i) % 5);
    events.push({ t: 9000 + clock, clock, type: 'game_start', game, level, mult: 1, diff: level + 0.2 });
    let correct = 0;
    for (let k = 0; k < 3; k++) {
      q++;
      const hard = (GAMES.indexOf(game) % 4) * 0.08 + level * 0.06;
      const ok = Math.random() > hard;
      const timedOut = !ok && Math.random() < 0.3;
      const ms = 1500 + Math.random() * 5000 + level * 300;
      events.push({ t: 9000 + clock, clock, type: 'question', game, level, q });
      events.push({ t: 9000 + clock, clock, type: 'timer_start', game, load: 3, limitMs: 9000 });
      events.push({ t: 9000 + clock + ms, clock: clock + ms, type: 'answer', game, q, ms, correct: ok, timedOut });
      clock += ms + 800;
      correct += ok;
    }
    events.push({ t: 9000 + clock, clock, type: 'points', game, pts: correct * 40 });
    events.push({ t: 9000 + clock, clock, type: 'game_end', game, cleared: correct === 3, correct, total: 3 });
    stats[game] = { plays: 1, cleared: correct === 3 ? 1 : 0, correct, total: 3, points: correct * 40, level, runs: [[level, correct, 3]], ms: clock };
  }
  events.push({ t: 9000 + clock, clock, type: 'session_end', ended });
  const up = { relax: 0.3, normal: 0.4, challenge: 0.5 }[difficulty];
  const down = { relax: 0.9, normal: 0.6, challenge: 0.5 }[difficulty];
  return {
    meta: {
      version: 4, id: String(id), device, edition: 'app', mode: 'demo', track: 'dual', user, guest: false,
      session: { min: 5, difficulty, track: 'dual' }, startedAt, endedAt: startedAt, durationMs: clock + 9000, ended,
      input: 'pedal', theme: 'meadow', music: 'beat', config: { difficulty: 'adaptive', diffUp: up, diffDown: down },
      landmark: { v: 1, kind: 'cottage', size: 1, seed: 7, wall: '#ffeecc', roof: '#aa3322' },
      summary: { score: 4000 + Number(id) % 900, exScore: 2500, cogScore: 1500, baseline: 60, bestStreak: 4, elapsedSec: clock / 1000, stats,
        exercise: { kcal: 30, distM: 900, revs: 150, avgRpm: 58, activeSec: 290 } },
    },
    events,
    keys: [], capd: [], workout: [],
    samples: Array.from({ length: 50 }, (_, i) => [i * 100, i * 100, 60, 60, 0, i % 4 ? 1 : 0, i * 10]),
  };
}

const req = (p, { method = 'GET', body, headers = {} } = {}) => fetch(BASE + p, {
  method, headers, body: body === undefined ? undefined : typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body),
});
const auth = { Authorization: `Bearer ${KEY}`, Origin: ORIGIN };
const post = (log, extra = '') => req(`/sessions${extra}`, { method: 'POST', body: log, headers: { ...auth, 'Content-Type': 'application/json' } });
const adminAuth = { Authorization: 'Basic ' + Buffer.from(`x:${ADMIN}`).toString('base64') };

async function main() {
  const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, UPLOAD_KEY: KEY, ADMIN_PASSWORD: ADMIN },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((ok) => srv.stdout.once('data', ok));
  const check = async (name, fn) => {
    await fn();
    console.log(`  ok  ${name}`);
  };
  try {
    await check('health', async () => assert.strictEqual((await req('/health')).status, 200));

    await check('CORS 사전 요청: 허락한 출처만', async () => {
      const r = await req('/sessions', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' } });
      assert.strictEqual(r.status, 204);
      assert.strictEqual(r.headers.get('access-control-allow-origin'), ORIGIN);
      assert.match(r.headers.get('access-control-allow-headers'), /Authorization/);
      const other = await req('/sessions', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
      assert.strictEqual(other.headers.get('access-control-allow-origin'), null);
    });

    await check('키가 틀리면 401', async () => {
      const r = await req('/sessions', { method: 'POST', body: '{}', headers: { Authorization: 'Bearer nope' } });
      assert.strictEqual(r.status, 401);
    });

    await check('업로드 2xx + 실제 응답에도 CORS', async () => {
      const r = await post(fakeSession({ device: 'tab-a', id: 1000, user: '12345674' }));
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.headers.get('access-control-allow-origin'), ORIGIN);
    });

    await check('같은 세션을 두 번 보내도 한 건', async () => {
      await post(fakeSession({ device: 'tab-a', id: 1000, user: '12345674' }));
      const h = await (await req('/history?user=12345674', { headers: auth })).json();
      assert.strictEqual(h.sessions.length, 1);
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
      const h = await (await req('/history?user=12345674', { headers: auth })).json();
      assert.strictEqual(h.sessions.length, 2);
      h.sessions.forEach(assertEntry);
      const s = h.sessions.find((x) => x.sid === '1001');
      assert.strictEqual(s.device, 'tab-b');
      assert.strictEqual(s.min, 5);
      assert.strictEqual(typeof s.score, 'number');
      assert.strictEqual(typeof s.gameAcc, 'number');
      assert.strictEqual(s.look.kind, 'cottage');
    });

    await check('회원 기록: 형이 다른 값은 null, 없는 필드는 버린다 (XSS 막기)', async () => {
      const bad = fakeSession({ device: 'tab-x', id: 7000, user: '76543214' });
      const html = '<img src=x onerror=alert(1)>';
      Object.assign(bad.meta, { track: [html], landmark: html, extra: html });
      bad.meta.session.min = html;
      bad.meta.session.difficulty = { toString: html };
      Object.assign(bad.meta.summary, { score: html });
      bad.meta.summary.exercise.kcal = '30';
      bad.meta.summary.stats = { a: { level: html, correct: '9', total: 3 }, b: null };
      await post(bad);
      await post(fakeSession({ device: 'tab-x', id: 7001, user: '76543214', ended: 'complete' }));
      const noDate = fakeSession({ device: 'tab-x', id: 7002, user: '76543214' });
      noDate.meta.startedAt = html;
      await post(noDate);
      const h = await (await req('/history?user=76543214', { headers: auth })).json();
      assert.strictEqual(h.sessions.length, 2, '날짜가 아닌 at 은 버린다');
      h.sessions.forEach(assertEntry);
      const s = h.sessions.find((x) => x.sid === '7000');
      for (const k of ['min', 'difficulty', 'track', 'score', 'kcal', 'look']) assert.strictEqual(s[k], null, k);
      assert.strictEqual(s.level, 0);
      assert.strictEqual(s.gameAcc, 0); // 글 '9' 는 맞힌 수로 세지 않는다
      assert.ok(!JSON.stringify(h).includes('<'), 'HTML 이 응답에 남지 않는다');
    });

    await check('docs/SERVER.md 회원 기록 표 = js/history-entry.js HISTORY_FIELDS', async () => {
      const md = fs.readFileSync(path.join(__dirname, '..', 'docs', 'SERVER.md'), 'utf8');
      const sec = md.split(/^## /m).find((s) => s.startsWith('회원 기록'));
      const table = sec.split(/\r?\n/).filter((l) => /^\| `/.test(l));
      const doc = {};
      for (const row of table) {
        const [names, type] = row.split('|').slice(1, 3);
        const t = (/`(\w+)`/.exec(type) || [])[1];
        for (const [, f] of names.matchAll(/`(\w+)`/g)) doc[f] = t;
      }
      assert.deepStrictEqual(doc, { ...HISTORY_FIELDS }, '필드나 형을 바꿨으면 문서 표의 형 칸도 함께 고친다');
    });

    await check('기록이 없는 번호·이상한 번호는 빈 목록', async () => {
      assert.deepStrictEqual(await (await req('/history?user=99999997', { headers: auth })).json(), { sessions: [] });
      assert.deepStrictEqual(await (await req('/history?user=abc', { headers: auth })).json(), { sessions: [] });
    });

    await check('env 로 나뉜다 (dev 미리 보기가 운영 기록에 안 섞임)', async () => {
      await post(fakeSession({ device: 'tab-c', id: 3000, user: '12345674' }), '?env=dev');
      const prod = await (await req('/history?user=12345674', { headers: auth })).json();
      const dev = await (await req('/history?user=12345674&env=dev', { headers: auth })).json();
      assert.strictEqual(prod.sessions.length, 2);
      assert.strictEqual(dev.sessions.length, 1);
    });

    await check('관리 화면: 비밀번호 없으면 401, 있으면 열림', async () => {
      assert.strictEqual((await req('/admin')).status, 401);
      assert.strictEqual((await req('/admin', { headers: { Authorization: 'Basic ' + Buffer.from('x:wrong').toString('base64') } })).status, 401);
      assert.strictEqual((await req('/admin', { headers: adminAuth })).status, 200);
      assert.strictEqual((await req('/admin/api/overview', { headers: { Authorization: `Bearer ${KEY}` } })).status, 401);
    });

    await check('로그 버전 5 까지: 상자 속 과일의 문제 내용(q)이 번호를 덮어쓴 문제도 색인에 들어간다', async () => {
      const log = fakeSession({ device: 'tab-box', id: 9100 });
      const ev = (type, x) => ({ t: 0, clock: 0, type, ...x });
      log.events = [
        ev('question', { game: 'count', level: 3, q: 1 }), ev('answer', { game: 'count', q: 1, ms: 2000, correct: true, timedOut: false }),
        ev('question', { game: 'box', level: 3, q: { type: 'total', box: 'A', kinds: [] } }), ev('answer', { game: 'box', q: 2, ms: 3000, correct: true, timedOut: false }),
        ev('question', { game: 'count', level: 3, q: 3 }), ev('answer', { game: 'count', q: 3, ms: 2500, correct: false, timedOut: false }),
        ev('session_end', { ended: 'complete' }),
      ];
      await post(log);
      const rows = (await (await req('/admin/export/questions.csv?device=tab-box', { headers: adminAuth })).text()).trim().split('\n');
      const head = rows[0].replace(/^﻿/, '').split(',');
      const got = rows.slice(1).map((r) => Object.fromEntries(r.split(',').map((v, i) => [head[i], v])));
      assert.deepStrictEqual(got.map((r) => [r.q, r.game, r.answered]), [['1', 'count', '1'], ['2', 'box', '1'], ['3', 'count', '1']]);
    });

    await check('관리 집계 · CSV · 원본 내려받기', async () => {
      for (let i = 0; i < 40; i++) await post(fakeSession({ device: `tab-${i % 3}`, id: 5000 + i, user: '12345674', days: i % 9, difficulty: ['relax', 'normal', 'challenge'][i % 3] }));
      const o = await (await req('/admin/api/overview', { headers: adminAuth })).json();
      assert.ok(o.totals.n >= 40 && o.totals.questions > 1000);
      const b = await (await req('/admin/api/balance?difficulty=relax', { headers: adminAuth })).json();
      assert.ok(b.cells.length > 10);
      assert.ok(b.cells.every((c) => Math.abs(c.target - 0.75) < 1e-9), 'relax 기준 75%');
      const csv = await (await req('/admin/export/questions.csv', { headers: adminAuth })).text();
      assert.match(csv.split('\n')[0], /game,level,correct/);
      const raw = await req('/admin/raw/prod/tab-a/1000', { headers: adminAuth });
      assert.strictEqual(raw.status, 200);
      assert.strictEqual(raw.headers.get('content-type'), 'application/gzip');
      assert.strictEqual((await req('/admin/raw/prod/..%2F..%2Fetc/passwd', { headers: adminAuth })).status, 404);
      assert.strictEqual((await req('/admin/replay?env=prod&device=tab-a&sid=1000')).status, 401);
      const replay = await req('/admin/replay?env=prod&device=tab-a&sid=1000', { headers: adminAuth });
      assert.strictEqual(replay.status, 200);
      assert.match(await replay.text(), /세션 재생/);
      const opts = await (await req('/admin/api/options', { headers: adminAuth })).json();
      assert.strictEqual(opts.titles.coin, '동전 세기');
    });

    await check('회원 기록 요청 수 제한 (429)', async () => {
      let last;
      for (let i = 0; i < 35; i++) last = await req('/history?user=12345674', { headers: auth });
      assert.strictEqual(last.status, 429);
    });

    await check('색인 다시 만들기', async () => {
      const r = spawn(process.execPath, [path.join(__dirname, 'server.js'), '--reindex'], { env: { ...process.env, DATA_DIR: dir } });
      let out = '';
      r.stdout.on('data', (d) => (out += d));
      await new Promise((ok) => r.on('exit', ok));
      assert.match(out, /reindexed \d+ sessions/);
    });

    console.log('all passed');
    if (KEEP) {
      console.log(`\n관리 화면: ${BASE}/admin  (비밀번호 ${ADMIN}) · 데이터 ${dir} · Ctrl+C 로 끝`);
      return;
    }
  } catch (e) {
    console.error('FAILED:', e);
    process.exitCode = 1;
  }
  srv.kill();
  await new Promise((ok) => srv.on("exit", ok));
  fs.rmSync(dir, { recursive: true, force: true });
}
main();
