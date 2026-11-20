// 세션 업로드 · 회원 기록 서버 (docs/SERVER.md) + 밸런스 시험용 관리 화면 (/admin).
// 의존성 없음: Node 22.13+ (node:sqlite 내장). 실행: node api/server.js   (설정은 환경 변수, api/README.md)
//
// 저장:
//   - 원본 세션 — DATA_DIR/raw/<env>/<device>/<id>.json.gz (받은 그대로, 다시 올라오면 덮어쓴다)
//   - 색인 — DATA_DIR/exergame.db (SQLite). sessions(세션 하나 한 줄) · games(게임 한 판) · questions(문제 하나)
//     색인은 원본에서 언제든 다시 만들 수 있다 (node api/server.js --reindex)
// env: 업로드·회원 기록 주소의 ?env= (없으면 'prod'). dev 브랜치 미리 보기(/dev/)가 운영 데이터와 섞이지 않게 쓴다.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
process.removeAllListeners('warning'); // node:sqlite 의 ExperimentalWarning 을 로그에 남기지 않는다
const { DatabaseSync } = require('node:sqlite');

const C = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '127.0.0.1', // 앞에 Caddy 를 두므로 바깥에는 열지 않는다
  dataDir: path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data')),
  uploadKey: process.env.UPLOAD_KEY || '', // 비어 있으면 업로드·회원 기록에 키를 묻지 않는다
  adminPassword: process.env.ADMIN_PASSWORD || '', // 비어 있으면 /admin 을 닫는다
  origins: (process.env.ALLOW_ORIGINS || 'https://twilight-devcra.github.io,http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  maxBody: 10 * 1024 * 1024, // 가장 긴 15분 판이 약 2 MB. 413 은 그 태블릿의 업로드를 멈추게 하므로 넉넉히
  historyPerMin: 30, // IP 하나가 1분에 회원 기록을 물을 수 있는 횟수 (번호를 차례로 넣어 보는 것 막기)
};

// ---------------- 저장소 ----------------

fs.mkdirSync(path.join(C.dataDir, 'raw'), { recursive: true });
const db = new DatabaseSync(path.join(C.dataDir, 'exergame.db'));
db.exec(`
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
`);

const safe = (s, fallback) => {
  const t = String(s ?? '').trim();
  if (/^[A-Za-z0-9_.-]{1,80}$/.test(t) && !/^\.+$/.test(t)) return t;
  return t ? `h-${crypto.createHash('sha1').update(t).digest('hex').slice(0, 16)}` : fallback;
};
const rawPath = (env, device, sid) => path.join(C.dataDir, 'raw', env, device || '_', `${sid}.json.gz`);
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
// 객체는 JSON 으로 (String() 은 {"toString": "x"} 같은 본문에서 던진다 → 500 이 되면 그 태블릿의 업로드가 멈춘다)
const str = (v) => (v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v));

// 세션 로그 하나 → 회원 기록 항목 하나 (형을 지킨 것, 또는 null). 태블릿(app/member-records.js)과 같은 파일을 쓴다 (docs/SERVER.md '회원 기록')
const { summarize, cleanEntry } = require('../js/history-entry.js');

// 이벤트에서 게임 한 판·문제 하나씩 뽑는다 (docs/SESSION_LOG.md 'events')
function extract(log) {
  const games = [];
  const qs = new Map();
  let cur = null;
  let lastQ = 0; // 문제 번호는 1씩 늘어난다. 로그 버전 5 까지는 상자 속 과일의 문제 내용(q)이 번호를 덮어써서, 그때는 앞 번호 + 1 로 메운다
  for (const e of Array.isArray(log.events) ? log.events : []) {
    if (!e || typeof e !== 'object') continue;
    if (e.type === 'game_start') {
      cur = { game: str(e.game), level: num(e.level), diff: num(e.diff), correct: null, total: null, cleared: null, aborted: 0, points: 0 };
      games.push(cur);
    } else if ((e.type === 'game_end' || e.type === 'game_abort') && cur) {
      Object.assign(cur, { correct: num(e.correct), total: num(e.total), cleared: e.cleared ? 1 : 0, aborted: e.type === 'game_abort' ? 1 : 0 });
      cur = null;
    } else if (e.type === 'points' && games.length) {
      games[games.length - 1].points += num(e.pts) || 0;
    } else if (e.type === 'question') {
      const n = Number.isInteger(e.q) ? e.q : lastQ + 1;
      lastQ = n;
      qs.set(n, { q: n, game: str(e.game), level: num(e.level), correct: null, timed_out: 0, answered: 0, ms: null, load: null, limit_ms: null });
    } else if (e.type === 'timer_start') {
      const q = [...qs.values()].pop();
      if (q && q.answered === 0) Object.assign(q, { load: num(e.load), limit_ms: num(e.limitMs) });
    } else if (e.type === 'answer' && qs.has(e.q)) {
      Object.assign(qs.get(e.q), { correct: e.correct ? 1 : 0, timed_out: e.timedOut ? 1 : 0, answered: 1, ms: num(e.ms) });
    }
  }
  return { games, questions: [...qs.values()].filter((q) => Number.isInteger(q.q)) };
}

// 적응형 난이도가 머무는 정답률 = diffDown / (diffUp + diffDown) (js/config.js). 밸런스는 이것과 견준다
function targetAcc(cfg) {
  if (!cfg || (cfg.difficulty && cfg.difficulty !== 'adaptive')) return null;
  const up = num(cfg.diffUp), down = num(cfg.diffDown);
  return up > 0 && down > 0 ? down / (up + down) : null;
}

// 목표 속도 유지 비율 (samples 의 inZone, 측정 중인 null 은 뺀다)
function inZone(log) {
  const S = Array.isArray(log.samples) ? log.samples : [];
  let n = 0, k = 0;
  for (const s of S) if (Array.isArray(s) && (s[5] === 0 || s[5] === 1)) { n++; k += s[5]; }
  return n ? k / n : null;
}

const upsert = db.prepare(`INSERT OR REPLACE INTO sessions VALUES (
  :env, :device, :sid, :received_at, :bytes, :version, :edition, :mode, :track, :user, :guest, :station, :participant,
  :started_at, :ended, :duration_ms, :elapsed_sec, :min, :difficulty, :input, :theme, :music,
  :score, :ex_score, :cog_score, :baseline, :best_streak, :kcal, :dist_m, :avg_rpm, :in_zone, :target_acc, :summary, :history)`);
const delGames = db.prepare('DELETE FROM games WHERE env = ? AND device = ? AND sid = ?');
const delQs = db.prepare('DELETE FROM questions WHERE env = ? AND device = ? AND sid = ?');
const insGame = db.prepare('INSERT INTO games VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
const insQ = db.prepare('INSERT INTO questions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

function index(env, device, sid, log, bytes, receivedAt) {
  const m = log.meta || {};
  const sum = m.summary || {};
  const ex = sum.exercise || {};
  const { games, questions } = extract(log);
  db.exec('BEGIN');
  try {
    upsert.run({
      env, device, sid, received_at: receivedAt, bytes,
      version: num(m.version), edition: str(m.edition), mode: str(m.mode), track: str(m.track || 'dual'),
      user: str(m.user), guest: m.guest ? 1 : 0, station: str(m.station), participant: str(m.participant),
      started_at: str(m.startedAt), ended: str(m.ended), duration_ms: num(m.durationMs), elapsed_sec: num(sum.elapsedSec),
      min: m.session ? num(m.session.min) : null, difficulty: m.session ? str(m.session.difficulty) : null,
      input: str(m.input), theme: str(m.theme), music: str(m.music),
      score: num(sum.score), ex_score: num(sum.exScore), cog_score: num(sum.cogScore), baseline: num(sum.baseline), best_streak: num(sum.bestStreak),
      kcal: num(ex.kcal), dist_m: num(ex.distM), avg_rpm: num(ex.avgRpm), in_zone: inZone(log), target_acc: targetAcc(m.config),
      summary: JSON.stringify(sum), history: JSON.stringify(summarize(log)),
    });
    delGames.run(env, device, sid);
    delQs.run(env, device, sid);
    games.forEach((g, i) => insGame.run(env, device, sid, i, g.game, g.level, g.diff, g.correct, g.total, g.cleared, g.aborted, g.points));
    for (const q of questions) insQ.run(env, device, sid, q.q, q.game, q.level, q.correct, q.timed_out, q.answered, q.ms, q.load, q.limit_ms);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// 받은 본문 하나를 저장한다. 형식이 이상해도 거절하지 않는다 (거절하면 그 태블릿의 업로드가 멈춘다, docs/SERVER.md)
function store(env, body) {
  const receivedAt = new Date().toISOString();
  let log;
  try {
    log = JSON.parse(body.toString('utf8'));
  } catch (e) {
    log = null;
  }
  if (!log || typeof log !== 'object' || Array.isArray(log)) {
    const dir = path.join(C.dataDir, 'raw', '_invalid');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}.gz`), zlib.gzipSync(body));
    return { stored: 'invalid' };
  }
  const m = log.meta || {};
  // device 가 없는 예전 세션은 '_' 로 묶는다. id 가 없으면 내용으로 정한다 (같은 본문이 다시 와도 한 건)
  const device = safe(m.device, '_');
  const sid = safe(m.id, `c-${crypto.createHash('sha1').update(body).digest('hex').slice(0, 16)}`);
  const file = rawPath(env, device, sid);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', zlib.gzipSync(body));
  fs.renameSync(file + '.tmp', file);
  index(env, device, sid, log, body.length, receivedAt);
  return { stored: `${device}/${sid}` };
}

// 원본에서 색인을 다시 만든다 (색인 형식을 바꾼 뒤)
function reindex() {
  const root = path.join(C.dataDir, 'raw');
  let n = 0;
  for (const env of fs.readdirSync(root)) {
    if (env.startsWith('_')) continue;
    for (const device of fs.readdirSync(path.join(root, env))) {
      for (const f of fs.readdirSync(path.join(root, env, device))) {
        if (!f.endsWith('.json.gz')) continue;
        const file = path.join(root, env, device, f);
        const body = zlib.gunzipSync(fs.readFileSync(file));
        index(env, device, f.slice(0, -'.json.gz'.length), JSON.parse(body.toString('utf8')), body.length, fs.statSync(file).mtime.toISOString());
        n++;
      }
    }
  }
  return n;
}

// ---------------- HTTP ----------------

const send = (res, status, body, headers = {}) => {
  const isBuf = Buffer.isBuffer(body);
  const data = body === undefined ? '' : isBuf || typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    ...(body !== undefined && !isBuf && typeof body !== 'string' ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
    ...headers,
  });
  res.end(data);
};

function cors(req, res) {
  const o = req.headers.origin;
  if (o && C.origins.includes(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

const eq = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const keyOk = (req) => !C.uploadKey || eq(req.headers.authorization || '', `Bearer ${C.uploadKey}`);

// 관리 화면: HTTP Basic (사용자 이름은 아무거나, 비밀번호 = ADMIN_PASSWORD)
function adminOk(req) {
  if (!C.adminPassword) return false;
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
  if (!m) return false;
  const pass = Buffer.from(m[1], 'base64').toString('utf8').split(':').slice(1).join(':');
  return eq(pass, C.adminPassword);
}

// IP 마다 1분 창의 요청 수
const hits = new Map();
function limited(ip, bucket, perMin) {
  const k = `${bucket}:${ip}`;
  const now = Date.now();
  const h = hits.get(k);
  if (!h || now - h.at > 60000) {
    hits.set(k, { at: now, n: 1 });
    return false;
  }
  return ++h.n > perMin;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, h] of hits) if (now - h.at > 60000) hits.delete(k);
}, 60000).unref();

const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const envOf = (u) => safe(u.searchParams.get('env') || 'prod', 'prod');

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) {
        reject(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const history = db.prepare(`SELECT history FROM sessions
  WHERE env = ? AND user = ? AND ended IS NOT NULL AND ended NOT IN ('abandoned', 'user') AND started_at >= ?`);

const admin = require('./admin.js')(db, { rawPath, safe });

async function handle(req, res) {
  const u = new URL(req.url, 'http://x');
  cors(req, res);
  if (req.method === 'OPTIONS') return send(res, 204);

  if (u.pathname === '/health') return send(res, 200, { ok: true });

  if (u.pathname === '/sessions' && req.method === 'POST') {
    if (!keyOk(req)) return send(res, 401, { error: 'key' });
    const body = await readBody(req, C.maxBody);
    const r = store(envOf(u), body);
    return send(res, 200, { ok: true, ...r });
  }

  if (u.pathname === '/history' && req.method === 'GET') {
    if (!keyOk(req)) return send(res, 401, { error: 'key' });
    if (limited(clientIp(req), 'history', C.historyPerMin)) return send(res, 429, { error: 'rate' });
    const user = u.searchParams.get('user') || '';
    if (!/^\d{8}$/.test(user)) return send(res, 200, { sessions: [] });
    const since = new Date(Date.now() - 2 * 366 * 864e5).toISOString(); // 달력은 최근 2년까지만 넘겨 본다
    // 저장할 때 이미 형을 맞췄지만, 고치기 전에 저장된 줄(--reindex 전)도 있을 수 있으므로 내보낼 때 한 번 더 맞춘다
    const sessions = history.all(envOf(u), user, since).map((r) => cleanEntry(JSON.parse(r.history))).filter(Boolean);
    return send(res, 200, { sessions });
  }

  if (u.pathname === '/admin' || u.pathname.startsWith('/admin/')) {
    if (limited(clientIp(req), 'admin', 600)) return send(res, 429, 'too many requests');
    if (!adminOk(req)) {
      return send(res, 401, C.adminPassword ? 'login required' : 'admin disabled (set ADMIN_PASSWORD)', {
        ...(C.adminPassword ? { 'WWW-Authenticate': 'Basic realm="exergame admin", charset="UTF-8"' } : {}),
        'Content-Type': 'text/plain; charset=utf-8',
      });
    }
    return admin(req, res, u, send);
  }

  return send(res, 404, { error: 'not found' });
}

if (process.argv.includes('--reindex')) {
  console.log(`reindexed ${reindex()} sessions`);
  process.exit(0);
}

http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    if (e.status !== 413) console.error(new Date().toISOString(), req.method, req.url, e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status === 413 ? 'too large' : 'server error' });
  });
}).listen(C.port, C.host, () => {
  console.log(`exergame api on http://${C.host}:${C.port} · data ${C.dataDir} · upload key ${C.uploadKey ? 'on' : 'off'} · admin ${C.adminPassword ? 'on' : 'off'}`);
});
