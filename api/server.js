// 세션 업로드 · 회원 기록 서버 (docs/SERVER.md) + 밸런스 시험용 관리 화면 (/admin).
// 의존성 없음: Node 22.13+ (node:sqlite 내장). 실행: node api/server.js   (설정은 환경 변수, api/README.md)
//
// 저장:
//   - 원본 세션 — DATA_DIR/raw/<env>/<device>/<id>.json.gz (받은 그대로, 다시 올라오면 덮어쓴다)
//   - 색인 — DATA_DIR/exergame.db (SQLite). sessions(세션 하나 한 줄) · games(게임 한 판) · questions(문제 하나)
//     색인은 원본에서 언제든 다시 만들 수 있다 (node api/server.js --reindex)
//   - 아이디 — 같은 DB 의 users (태블릿에서 만든 글 아이디). 원본에서 다시 만들 수 없으므로 --reindex 가 건드리지 않는다
// env: 업로드·회원 기록 주소의 ?env= (없으면 'prod'). dev 브랜치 미리 보기(/dev/)가 운영 데이터와 섞이지 않게 쓴다.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
process.removeAllListeners('warning'); // node:sqlite 의 ExperimentalWarning 을 로그에 남기지 않는다
const { DatabaseSync } = require('node:sqlite');

const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '127.0.0.1', // 앞에 Caddy 를 두므로 바깥에는 열지 않는다
  dataDir: path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data')),
  uploadKey: process.env.UPLOAD_KEY || '', // 비어 있으면 업로드·회원 기록에 키를 묻지 않는다
  adminPassword: process.env.ADMIN_PASSWORD || '', // 비어 있으면 /admin 을 닫는다
  origins: (process.env.ALLOW_ORIGINS || 'https://twilight-devcra.github.io,http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean),
  maxBody: 10 * 1024 * 1024, // 가장 긴 15분 판이 약 2 MB. 413 은 그 태블릿의 업로드를 멈추게 하므로 넉넉히
  historyPerMin: 30, // IP 하나가 1분에 회원 기록을 물을 수 있는 횟수 (번호를 차례로 넣어 보는 것 막기)
  usersPerMin: 60, // IP 하나가 1분에 아이디 목록을 받을 수 있는 횟수
  usersNewPerMin: Number(process.env.USERS_NEW_PER_MIN || 20), // IP 하나가 1분에 아이디를 만들 수 있는 횟수 (만들기 시도 모두, 틀린 꼴 포함)
};

// ---------------- 저장소 ----------------

fs.mkdirSync(path.join(config.dataDir, 'raw'), { recursive: true });
const database = new DatabaseSync(path.join(config.dataDir, 'exergame.db'));
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS sessions (
    env TEXT NOT NULL, device TEXT NOT NULL, sid TEXT NOT NULL,
    received_at TEXT NOT NULL, bytes INTEGER,
    version INTEGER, edition TEXT, mode TEXT, track TEXT,
    user TEXT, guest INTEGER, station TEXT, participant TEXT,
    started_at TEXT, ended TEXT, duration_ms INTEGER, elapsed_sec REAL,
    min INTEGER, difficulty TEXT, input TEXT, theme TEXT, music TEXT,
    score REAL, ex_score REAL, cog_score REAL, baseline REAL, best_streak INTEGER,
    kcal REAL, dist_m REAL, avg_rpm REAL, in_zone REAL, target_acc REAL,
    summary TEXT, history TEXT,
    PRIMARY KEY (env, device, sid)
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions (env, user);
  CREATE INDEX IF NOT EXISTS sessions_started ON sessions (started_at);
  CREATE TABLE IF NOT EXISTS games (
    env TEXT NOT NULL, device TEXT NOT NULL, sid TEXT NOT NULL, n INTEGER NOT NULL,
    game TEXT, level INTEGER, diff REAL, correct INTEGER, total INTEGER, cleared INTEGER, aborted INTEGER, points REAL,
    PRIMARY KEY (env, device, sid, n)
  );
  CREATE INDEX IF NOT EXISTS games_game ON games (game, level);
  CREATE TABLE IF NOT EXISTS questions (
    env TEXT NOT NULL, device TEXT NOT NULL, sid TEXT NOT NULL, q INTEGER NOT NULL,
    game TEXT, level INTEGER, correct INTEGER, timed_out INTEGER, answered INTEGER, ms REAL, load REAL, limit_ms REAL,
    PRIMARY KEY (env, device, sid, q)
  );
  CREATE INDEX IF NOT EXISTS questions_game ON questions (game, level);
  CREATE TABLE IF NOT EXISTS users (
    env TEXT NOT NULL, id TEXT NOT NULL COLLATE NOCASE, created_at TEXT NOT NULL, device TEXT,
    PRIMARY KEY (env, id)
  );
`);

const safe = (text, fallback) => {
  const trimmed = String(text ?? '').trim();
  if (/^[A-Za-z0-9_.-]{1,80}$/.test(trimmed) && !/^\.+$/.test(trimmed)) return trimmed;
  return trimmed ? `h-${crypto.createHash('sha1').update(trimmed).digest('hex').slice(0, 16)}` : fallback;
};
const rawPath = (env, device, sid) => path.join(config.dataDir, 'raw', env, device || '_', `${sid}.json.gz`);
const numberOrNull = (value) => (typeof value === 'number' && isFinite(value) ? value : null);
// 객체는 JSON 으로 (String() 은 {"toString": "x"} 같은 본문에서 던진다 → 500 이 되면 그 태블릿의 업로드가 멈춘다)
const textOrNull = (value) => (value === undefined || value === null ? null : typeof value === 'object' ? JSON.stringify(value) : String(value));

// 세션 로그 하나 → 회원 기록 항목 하나 (형을 지킨 것, 또는 null). 태블릿(app/member-records.js)과 같은 파일을 쓴다 (docs/SERVER.md '회원 기록')
const { summarize, cleanEntry } = require('../js/history-entry.js');
// 글 아이디 규칙 ('<시설 접두어>_<아이디>'). 태블릿(app/member-records.js)과 같은 파일을 쓴다 (docs/SERVER.md '아이디')
const { MemberId } = require('../js/member-id.js');
// 회원 기록을 물을 수 있는 회원: 8자리 회원 번호 또는 글 아이디
const memberOk = (user) => /^\d{8}$/.test(user) || MemberId.isNamed(user);

// 이벤트에서 게임 한 판·문제 하나씩 뽑는다 (docs/SESSION_LOG.md 'events')
function extract(log) {
  const games = [];
  const questionsByNumber = new Map();
  let currentGame = null;
  let lastNumber = 0; // 문제 번호는 1씩 늘어난다. 로그 버전 5 까지는 상자 속 과일의 문제 내용(q)이 번호를 덮어써서, 그때는 앞 번호 + 1 로 메운다
  for (const event of Array.isArray(log.events) ? log.events : []) {
    if (!event || typeof event !== 'object') continue;
    if (event.type === 'game_start') {
      currentGame = { game: textOrNull(event.game), level: numberOrNull(event.level), diff: numberOrNull(event.diff), correct: null, total: null, cleared: null, aborted: 0, points: 0 };
      games.push(currentGame);
    } else if ((event.type === 'game_end' || event.type === 'game_abort') && currentGame) {
      Object.assign(currentGame, { correct: numberOrNull(event.correct), total: numberOrNull(event.total), cleared: event.cleared ? 1 : 0, aborted: event.type === 'game_abort' ? 1 : 0 });
      currentGame = null;
    } else if (event.type === 'points' && games.length) {
      games[games.length - 1].points += numberOrNull(event.pts) || 0;
    } else if (event.type === 'question') {
      const number = Number.isInteger(event.q) ? event.q : lastNumber + 1;
      lastNumber = number;
      questionsByNumber.set(number, { number, game: textOrNull(event.game), level: numberOrNull(event.level), correct: null, timed_out: 0, answered: 0, answerMs: null, load: null, limit_ms: null });
    } else if (event.type === 'timer_start') {
      const question = [...questionsByNumber.values()].pop();
      if (question && question.answered === 0) Object.assign(question, { load: numberOrNull(event.load), limit_ms: numberOrNull(event.limitMs) });
    } else if (event.type === 'answer' && questionsByNumber.has(event.q)) {
      Object.assign(questionsByNumber.get(event.q), { correct: event.correct ? 1 : 0, timed_out: event.timedOut ? 1 : 0, answered: 1, answerMs: numberOrNull(event.ms) });
    }
  }
  return { games, questions: [...questionsByNumber.values()].filter((question) => Number.isInteger(question.number)) };
}

// 적응형 난이도가 머무는 정답률 = diffDown / (diffUp + diffDown) (js/config.js). 밸런스는 이것과 견준다
function targetAccuracy(sessionConfig) {
  if (!sessionConfig || (sessionConfig.difficulty && sessionConfig.difficulty !== 'adaptive')) return null;
  const stepUp = numberOrNull(sessionConfig.diffUp), stepDown = numberOrNull(sessionConfig.diffDown);
  return stepUp > 0 && stepDown > 0 ? stepDown / (stepUp + stepDown) : null;
}

// 목표 속도 유지 비율 (samples 의 inZone, 측정 중인 null 은 뺀다)
function inZone(log) {
  const samples = Array.isArray(log.samples) ? log.samples : [];
  let measured = 0, inZoneCount = 0;
  for (const sample of samples) if (Array.isArray(sample) && (sample[5] === 0 || sample[5] === 1)) { measured++; inZoneCount += sample[5]; }
  return measured ? inZoneCount / measured : null;
}

const upsertSession = database.prepare(`INSERT OR REPLACE INTO sessions VALUES (
  :env, :device, :sid, :received_at, :bytes, :version, :edition, :mode, :track, :user, :guest, :station, :participant,
  :started_at, :ended, :duration_ms, :elapsed_sec, :min, :difficulty, :input, :theme, :music,
  :score, :ex_score, :cog_score, :baseline, :best_streak, :kcal, :dist_m, :avg_rpm, :in_zone, :target_acc, :summary, :history)`);
const deleteGames = database.prepare('DELETE FROM games WHERE env = ? AND device = ? AND sid = ?');
const deleteQuestions = database.prepare('DELETE FROM questions WHERE env = ? AND device = ? AND sid = ?');
const insertGame = database.prepare('INSERT INTO games VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
const insertQuestion = database.prepare('INSERT INTO questions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

function index(env, device, sid, log, bytes, receivedAt) {
  const meta = log.meta || {};
  const summary = meta.summary || {};
  const exercise = summary.exercise || {};
  const { games, questions } = extract(log);
  database.exec('BEGIN');
  try {
    upsertSession.run({
      env, device, sid, received_at: receivedAt, bytes,
      version: numberOrNull(meta.version), edition: textOrNull(meta.edition), mode: textOrNull(meta.mode), track: textOrNull(meta.track || 'dual'),
      user: textOrNull(meta.user), guest: meta.guest ? 1 : 0, station: textOrNull(meta.station), participant: textOrNull(meta.participant),
      started_at: textOrNull(meta.startedAt), ended: textOrNull(meta.ended), duration_ms: numberOrNull(meta.durationMs), elapsed_sec: numberOrNull(summary.elapsedSec),
      min: meta.session ? numberOrNull(meta.session.min) : null, difficulty: meta.session ? textOrNull(meta.session.difficulty) : null,
      input: textOrNull(meta.input), theme: textOrNull(meta.theme), music: textOrNull(meta.music),
      score: numberOrNull(summary.score), ex_score: numberOrNull(summary.exScore), cog_score: numberOrNull(summary.cogScore), baseline: numberOrNull(summary.baseline), best_streak: numberOrNull(summary.bestStreak),
      kcal: numberOrNull(exercise.kcal), dist_m: numberOrNull(exercise.distM), avg_rpm: numberOrNull(exercise.avgRpm), in_zone: inZone(log), target_acc: targetAccuracy(meta.config),
      summary: JSON.stringify(summary), history: JSON.stringify(summarize(log)),
    });
    deleteGames.run(env, device, sid);
    deleteQuestions.run(env, device, sid);
    games.forEach((game, i) => insertGame.run(env, device, sid, i, game.game, game.level, game.diff, game.correct, game.total, game.cleared, game.aborted, game.points));
    for (const question of questions) {
      insertQuestion.run(env, device, sid, question.number, question.game, question.level, question.correct, question.timed_out, question.answered, question.answerMs, question.load, question.limit_ms);
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

// 받은 본문 하나를 저장한다. 형식이 이상해도 거절하지 않는다 (거절하면 그 태블릿의 업로드가 멈춘다, docs/SERVER.md)
function store(env, body) {
  const receivedAt = new Date().toISOString();
  let log;
  try {
    log = JSON.parse(body.toString('utf8'));
  } catch {
    log = null;
  }
  if (!log || typeof log !== 'object' || Array.isArray(log)) {
    const dir = path.join(config.dataDir, 'raw', '_invalid');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}.gz`), zlib.gzipSync(body));
    return { stored: 'invalid' };
  }
  const meta = log.meta || {};
  // device 가 없는 예전 세션은 '_' 로 묶는다. id 가 없으면 내용으로 정한다 (같은 본문이 다시 와도 한 건)
  const device = safe(meta.device, '_');
  const sid = safe(meta.id, `c-${crypto.createHash('sha1').update(body).digest('hex').slice(0, 16)}`);
  const file = rawPath(env, device, sid);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', zlib.gzipSync(body));
  fs.renameSync(file + '.tmp', file);
  index(env, device, sid, log, body.length, receivedAt);
  return { stored: `${device}/${sid}` };
}

// 원본에서 색인을 다시 만든다 (색인 형식을 바꾼 뒤)
function reindex() {
  const root = path.join(config.dataDir, 'raw');
  let count = 0;
  for (const env of fs.readdirSync(root)) {
    if (env.startsWith('_')) continue;
    for (const device of fs.readdirSync(path.join(root, env))) {
      for (const fileName of fs.readdirSync(path.join(root, env, device))) {
        if (!fileName.endsWith('.json.gz')) continue;
        const file = path.join(root, env, device, fileName);
        const body = zlib.gunzipSync(fs.readFileSync(file));
        index(env, device, fileName.slice(0, -'.json.gz'.length), JSON.parse(body.toString('utf8')), body.length, fs.statSync(file).mtime.toISOString());
        count++;
      }
    }
  }
  return count;
}

// ---------------- HTTP ----------------

const send = (response, status, body, headers = {}) => {
  const isBuffer = Buffer.isBuffer(body);
  const data = body === undefined ? '' : isBuffer || typeof body === 'string' ? body : JSON.stringify(body);
  response.writeHead(status, {
    ...(body !== undefined && !isBuffer && typeof body !== 'string' ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
    ...headers,
  });
  response.end(data);
};

function cors(request, response) {
  const origin = request.headers.origin;
  if (origin && config.origins.includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Methods', 'POST, GET');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.setHeader('Access-Control-Max-Age', '86400');
  }
}

// 길이가 같으면 걸리는 시간이 내용과 상관없는 비교 (비밀번호·키를 한 글자씩 맞혀 보지 못하게)
const sameSecret = (given, expected) => {
  const givenBytes = Buffer.from(String(given));
  const expectedBytes = Buffer.from(String(expected));
  return givenBytes.length === expectedBytes.length && crypto.timingSafeEqual(givenBytes, expectedBytes);
};
const keyOk = (request) => !config.uploadKey || sameSecret(request.headers.authorization || '', `Bearer ${config.uploadKey}`);

// 관리 화면: HTTP Basic (사용자 이름은 아무거나, 비밀번호 = ADMIN_PASSWORD)
function adminOk(request) {
  if (!config.adminPassword) return false;
  const match = /^Basic (.+)$/.exec(request.headers.authorization || '');
  if (!match) return false;
  const password = Buffer.from(match[1], 'base64').toString('utf8').split(':').slice(1).join(':');
  return sameSecret(password, config.adminPassword);
}

// IP 마다 1분 창의 요청 수
const hits = new Map();
function limited(address, bucket, perMin) {
  const key = `${bucket}:${address}`;
  const now = Date.now();
  const minuteHits = hits.get(key);
  if (!minuteHits || now - minuteHits.startedAt > 60000) {
    hits.set(key, { startedAt: now, count: 1 });
    return false;
  }
  return ++minuteHits.count > perMin;
}
setInterval(() => {
  const now = Date.now();
  for (const [key, minuteHits] of hits) if (now - minuteHits.startedAt > 60000) hits.delete(key);
}, 60000).unref();

const clientAddress = (request) => String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || '').split(',')[0].trim();
const envOf = (url) => safe(url.searchParams.get('env') || 'prod', 'prod');

function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    request.on('data', (chunk) => {
      received += chunk.length;
      if (received > limit) {
        reject(Object.assign(new Error('too large'), { status: 413 }));
        request.destroy();
      } else chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

const selectHistory = database.prepare(`SELECT history FROM sessions
  WHERE env = ? AND user = ? AND ended IS NOT NULL AND ended NOT IN ('abandoned', 'user') AND started_at >= ?`);

// ---------------- 아이디 (docs/SERVER.md '아이디') ----------------
// 만든 아이디는 users 표에, 그 아이디로 올라온 세션은 sessions 표에 있다. 목록과 겹침 확인은 둘을 함께 본다
// (서버에 연결하지 못한 채 태블릿에서만 만든 아이디도 세션이 올라오면 보이게)
// 접두어 'abc' 의 아이디는 'abc_' 이상 'abc`' 미만이다 ('`' 는 '_' 바로 다음 글자) → 색인을 탄다
const selectUsers = database.prepare('SELECT id, created_at AS last FROM users WHERE env = ? AND id >= ? AND id < ?');
const selectSessionUsers = database.prepare('SELECT user AS id, MAX(started_at) AS last FROM sessions WHERE env = ? AND user >= ? AND user < ? GROUP BY user');
const findUser = database.prepare('SELECT 1 FROM users WHERE env = ? AND id = ? LIMIT 1');
const findSessionUser = database.prepare('SELECT 1 FROM sessions WHERE env = ? AND user = ? COLLATE NOCASE LIMIT 1');
const insertUser = database.prepare('INSERT INTO users VALUES (?, ?, ?, ?)');

// 접두어 하나의 아이디 목록 [{ id, last }]. 영문 대소문자만 다른 것은 한 줄로. last 는 만든 때와 마지막 세션 중 늦은 것
function listUsers(env, prefix) {
  const range = [env, `${prefix}_`, `${prefix}\``];
  const byKey = new Map();
  for (const row of [...selectUsers.all(...range), ...selectSessionUsers.all(...range)]) {
    // 세션의 user 는 누구나 올릴 수 있는 값이다. 아이디 꼴이 아닌 것은 태블릿 화면에 그려지지 않게 뺀다
    if (!MemberId.isNamed(row.id)) continue;
    const key = MemberId.keyOf(row.id);
    const known = byKey.get(key);
    if (!known) byKey.set(key, { id: row.id, last: row.last || null });
    else if (row.last && (!known.last || row.last > known.last)) known.last = row.last;
  }
  return [...byKey.values()];
}

// 새 아이디를 적어 둔다. 이미 있으면(영문 대소문자만 달라도) false
function createUser(env, id, device) {
  if (findUser.get(env, id) || findSessionUser.get(env, id)) return false;
  try {
    insertUser.run(env, id, new Date().toISOString(), device);
  } catch (error) {
    if (/UNIQUE|PRIMARY KEY/i.test(error.message)) return false; // 두 태블릿이 같은 아이디를 거의 함께 만들었다
    throw error;
  }
  return true;
}

const handleAdmin = require('./admin.js')(database, { rawPath, safe });

async function handle(request, response) {
  const url = new URL(request.url, 'http://x');
  cors(request, response);
  if (request.method === 'OPTIONS') return send(response, 204);

  if (url.pathname === '/health') return send(response, 200, { ok: true });

  if (url.pathname === '/sessions' && request.method === 'POST') {
    if (!keyOk(request)) return send(response, 401, { error: 'key' });
    const body = await readBody(request, config.maxBody);
    const result = store(envOf(url), body);
    return send(response, 200, { ok: true, ...result });
  }

  if (url.pathname === '/history' && request.method === 'GET') {
    if (!keyOk(request)) return send(response, 401, { error: 'key' });
    if (limited(clientAddress(request), 'history', config.historyPerMin)) return send(response, 429, { error: 'rate' });
    const user = url.searchParams.get('user') || '';
    if (!memberOk(user)) return send(response, 200, { sessions: [] });
    const since = new Date(Date.now() - 2 * 366 * 864e5).toISOString(); // 달력은 최근 2년까지만 넘겨 본다
    // 저장할 때 이미 형을 맞췄지만, 고치기 전에 저장된 줄(--reindex 전)도 있을 수 있으므로 내보낼 때 한 번 더 맞춘다
    const sessions = selectHistory.all(envOf(url), user, since).map((row) => cleanEntry(JSON.parse(row.history))).filter(Boolean);
    return send(response, 200, { sessions });
  }

  if (url.pathname === '/users' && request.method === 'GET') {
    if (!keyOk(request)) return send(response, 401, { error: 'key' });
    if (limited(clientAddress(request), 'users', config.usersPerMin)) return send(response, 429, { error: 'rate' });
    const prefix = url.searchParams.get('prefix') || '';
    if (!MemberId.validPrefix(prefix)) return send(response, 400, { error: 'prefix' });
    return send(response, 200, { users: listUsers(envOf(url), prefix) });
  }

  if (url.pathname === '/users' && request.method === 'POST') {
    if (!keyOk(request)) return send(response, 401, { error: 'key' });
    if (limited(clientAddress(request), 'users-new', config.usersNewPerMin)) return send(response, 429, { error: 'rate' });
    let body = null;
    try { body = JSON.parse((await readBody(request, 4096)).toString('utf8')); } catch { /* 아래에서 400 */ }
    const id = body && typeof body.id === 'string' ? body.id.normalize('NFC') : '';
    if (!MemberId.isNamed(id)) return send(response, 400, { error: 'id' });
    if (!createUser(envOf(url), id, safe(body.device, null))) return send(response, 409, { error: 'exists' });
    return send(response, 201, { ok: true, id });
  }

  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
    if (limited(clientAddress(request), 'admin', 600)) return send(response, 429, 'too many requests');
    if (!adminOk(request)) {
      return send(response, 401, config.adminPassword ? 'login required' : 'admin disabled (set ADMIN_PASSWORD)', {
        ...(config.adminPassword ? { 'WWW-Authenticate': 'Basic realm="exergame admin", charset="UTF-8"' } : {}),
        'Content-Type': 'text/plain; charset=utf-8',
      });
    }
    return handleAdmin(request, response, url, send);
  }

  return send(response, 404, { error: 'not found' });
}

if (process.argv.includes('--reindex')) {
  console.log(`reindexed ${reindex()} sessions`);
  process.exit(0);
}

http.createServer((request, response) => {
  handle(request, response).catch((error) => {
    if (error.status !== 413) console.error(new Date().toISOString(), request.method, request.url, error);
    if (!response.headersSent) send(response, error.status || 500, { error: error.status === 413 ? 'too large' : 'server error' });
  });
}).listen(config.port, config.host, () => {
  console.log(`exergame api on http://${config.host}:${config.port} · data ${config.dataDir} · upload key ${config.uploadKey ? 'on' : 'off'} · admin ${config.adminPassword ? 'on' : 'off'}`);
});
