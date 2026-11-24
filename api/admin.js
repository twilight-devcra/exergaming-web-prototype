// 관리 화면 (/admin): 들어온 세션 보기와 게임 밸런스 집계. 비밀번호는 server.js 가 확인한다.
//   GET /admin                      화면 (admin.html)
//   GET /admin/api/options          거르기 칸의 보기 (env · edition · mode …)
//   GET /admin/api/games            게임 알아보기 카드: 이름 · 꼬리표 · 설명 · 소개 그림 (game-cards.mjs)
//   GET /admin/game.css             소개 그림을 그리는 게임 화면 css (그림자 DOM 안에서 쓰게 :root → :host)
//   GET /admin/api/overview?…       세션 수 · 날짜별 · 최근 세션
//   GET /admin/api/balance?…        게임 × 레벨: 문제 수 · 정답률 · 시간 초과율 · 걸린 시간
//   GET /admin/export/<표>.csv?…    sessions · games · questions 를 거른 그대로
//   GET /admin/raw/<env>/<device>/<sid>   원본 세션 (.json.gz)
//   GET /admin/replay?env=&device=&sid=   세션 재생 화면 (replay.html). 원본을 받아 브라우저에서 다시 그린다
// 거르기(쿼리): env(기본 prod) · edition · mode · track · difficulty · device · from · to(YYYY-MM-DD, 시작 시각 기준) · all=1(중단한 판도)
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PAGE = path.join(__dirname, 'admin.html');
const REPLAY = path.join(__dirname, 'replay.html');

// 게임 id → 이름 (js/games/*.js 의 static title). 서버는 같은 저장소에서 돌므로 그대로 읽는다
function titles() {
  const dir = path.join(__dirname, '..', 'js', 'games');
  const out = {};
  try {
    for (const fileName of fs.readdirSync(dir)) {
      const source = fs.readFileSync(path.join(dir, fileName), 'utf8');
      const id = /static id = '([^']+)'/.exec(source);
      const title = /static title = '([^']+)'/.exec(source);
      if (id && title) out[id[1]] = title[1];
    }
  } catch { }
  return out;
}

// 게임 알아보기 카드 (game-cards.mjs 가 만든다). 게임 코드는 배포 때만 바뀌므로 처음 한 번 만들어 둔다.
// 못 만들면 이름만 있는 카드로 (관리 화면은 그대로 열리게)
let cardCache = null;
function gameCards() {
  if (cardCache) return cardCache;
  try {
    cardCache = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'game-cards.mjs')], { encoding: 'utf8', timeout: 20000, maxBuffer: 16 << 20 }));
  } catch (error) {
    console.error(new Date().toISOString(), 'game cards', error.message);
    cardCache = Object.fromEntries(Object.entries(titles()).map(([id, title]) => [id, { title, tags: [], hint: '', steps: [] }]));
  }
  return cardCache;
}

// 게임 화면 css 를 그림자 DOM 용으로 (색 변수를 :root 대신 그림자 뿌리에 단다)
let cssCache = null;
function gameCss() {
  if (cssCache == null) {
    try { cssCache = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8').replace(/^:root\s*\{/m, ':host {'); } catch { cssCache = ''; }
  }
  return cssCache;
}

// 'YYYY-MM-DD'(KST) 하루의 시작을 UTC ISO 문자열로 (addDays 만큼 뒤 날)
const KST_DAY = /^\d{4}-\d{2}-\d{2}$/;
const kstDayStart = (day, addDays = 0) => new Date(Date.parse(`${day}T00:00:00+09:00`) + addDays * 864e5).toISOString();

module.exports = (database, { rawPath, safe }) => {
  // 거르기 → WHERE (sessions 를 s 로 부른다)
  function where(url) {
    const params = url.searchParams;
    const conditions = ['s.env = ?'];
    const args = [params.get('env') || 'prod'];
    for (const column of ['edition', 'mode', 'track', 'difficulty', 'device']) {
      if (params.get(column)) { conditions.push(`s.${column} = ?`); args.push(params.get(column)); }
    }
    // 날짜 거르기는 한국 시간(KST) 하루 기준. 저장된 시각은 UTC 그대로라 경계만 UTC 로 바꿔 비교한다
    if (KST_DAY.test(params.get('from') || '')) { conditions.push('s.started_at >= ?'); args.push(kstDayStart(params.get('from'))); }
    if (KST_DAY.test(params.get('to') || '')) { conditions.push('s.started_at < ?'); args.push(kstDayStart(params.get('to'), 1)); }
    if (params.get('all') !== '1') conditions.push("(s.ended IS NULL OR s.ended != 'abandoned')");
    return { sql: conditions.join(' AND '), args };
  }
  const JOIN = 'JOIN sessions s ON s.env = t.env AND s.device = t.device AND s.sid = t.sid';

  const quantile = (sorted, fraction) => {
    if (!sorted.length) return null;
    const position = (sorted.length - 1) * fraction;
    const lower = Math.floor(position);
    return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * (position - lower);
  };

  function options() {
    const distinct = (column) => database.prepare(`SELECT DISTINCT ${column} v FROM sessions WHERE ${column} IS NOT NULL ORDER BY 1`).all().map((row) => row.v);
    return { titles: titles(), env: distinct('env'), edition: distinct('edition'), mode: distinct('mode'), track: distinct('track'), difficulty: distinct('difficulty'), device: distinct('device') };
  }

  function overview(url) {
    const { sql, args } = where(url);
    const totals = database.prepare(`SELECT COUNT(*) n, COUNT(DISTINCT s.user) users, COUNT(DISTINCT s.device) devices,
      SUM(s.bytes) bytes, AVG(s.elapsed_sec) avg_sec, AVG(s.score) avg_score, AVG(s.in_zone) in_zone FROM sessions s WHERE ${sql}`).get(...args);
    const answered = database.prepare(`SELECT COUNT(*) n, AVG(t.correct) acc FROM questions t ${JOIN} WHERE ${sql} AND t.answered = 1`).get(...args);
    const days = database.prepare(`SELECT substr(datetime(s.started_at, '+9 hours'), 1, 10) day, COUNT(*) n FROM sessions s WHERE ${sql} GROUP BY 1 ORDER BY 1`).all(...args);
    const ended = database.prepare(`SELECT s.ended k, COUNT(*) n FROM sessions s WHERE ${sql} GROUP BY 1 ORDER BY 2 DESC`).all(...args);
    const recent = database.prepare(`SELECT s.env, s.device, s.sid, s.started_at, s.received_at, s.edition, s.mode, s.track, s.difficulty, s.min,
      s.user, s.station, s.ended, s.elapsed_sec, s.score, s.ex_score, s.cog_score, s.in_zone, s.bytes,
      (SELECT COUNT(*) FROM games g WHERE g.env = s.env AND g.device = s.device AND g.sid = s.sid) games
      FROM sessions s WHERE ${sql} ORDER BY s.started_at DESC LIMIT 200`).all(...args);
    return { totals: { ...totals, questions: answered.n, accuracy: answered.acc }, days, ended, recent };
  }

  function balance(url) {
    const { sql, args } = where(url);
    const rows = database.prepare(`SELECT t.game, t.level, t.correct, t.timed_out, t.ms, t.limit_ms, s.target_acc FROM questions t ${JOIN}
      WHERE ${sql} AND t.answered = 1`).all(...args);
    const cells = new Map();
    for (const row of rows) {
      const key = `${row.game}|${row.level}`;
      if (!cells.has(key)) cells.set(key, { game: row.game, level: row.level, count: 0, correct: 0, timeouts: 0, answerTimes: [], limitRatios: [], targetSum: 0, targetCount: 0 });
      const cell = cells.get(key);
      cell.count++;
      cell.correct += row.correct;
      cell.timeouts += row.timed_out;
      if (row.target_acc != null) { cell.targetSum += row.target_acc; cell.targetCount++; }
      if (row.ms != null) cell.answerTimes.push(row.ms);
      if (row.ms != null && row.limit_ms) cell.limitRatios.push(row.ms / row.limit_ms);
    }
    const out = [...cells.values()].map((cell) => {
      cell.answerTimes.sort((a, b) => a - b);
      cell.limitRatios.sort((a, b) => a - b);
      return {
        // eslint-disable-next-line id-length -- 관리 화면(admin.html)이 읽는 응답 형식
        game: cell.game, level: cell.level, n: cell.count, accuracy: cell.correct / cell.count, target: cell.targetCount ? cell.targetSum / cell.targetCount : null, timeoutRate: cell.timeouts / cell.count,
        msMedian: quantile(cell.answerTimes, 0.5), msP90: quantile(cell.answerTimes, 0.9), limitUseMedian: quantile(cell.limitRatios, 0.5),
      };
    });
    // 게임 한 판 단위: 몇 번 나왔나, 어느 레벨에서 시작했나, 라운드 끝에 잘린 비율
    const games = database.prepare(`SELECT t.game, COUNT(*) plays, AVG(t.level) avg_level, MAX(t.level) max_level,
      AVG(t.aborted) aborted, AVG(CASE WHEN t.total > 0 THEN 1.0 * t.correct / t.total END) acc, AVG(t.points) points
      FROM games t ${JOIN} WHERE ${sql} GROUP BY t.game ORDER BY plays DESC`).all(...args);
    return { cells: out, games };
  }

  // CSV: 거른 그대로 (원본 열 이름)
  function csv(table, url) {
    const { sql, args } = where(url);
    const query = table === 'sessions'
      ? `SELECT s.* FROM sessions s WHERE ${sql} ORDER BY s.started_at`
      : `SELECT t.*, s.started_at, s.edition, s.mode, s.track, s.difficulty, s.user FROM ${table} t ${JOIN} WHERE ${sql} ORDER BY s.started_at, t.${table === 'games' ? 'n' : 'q'}`;
    const rows = database.prepare(query).all(...args);
    const columns = rows.length ? Object.keys(rows[0]).filter((column) => column !== 'summary' && column !== 'history') : [];
    const cell = (value) => (value == null ? '' : /[",\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value));
    return '﻿' + [columns.join(','), ...rows.map((row) => columns.map((column) => cell(row[column])).join(','))].join('\n');
  }

  return (request, response, url, send) => {
    const pathname = url.pathname;
    if (pathname === '/admin' || pathname === '/admin/') return send(response, 200, fs.readFileSync(PAGE), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    if (pathname === '/admin/replay') return send(response, 200, fs.readFileSync(REPLAY), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    if (pathname === '/admin/api/options') return send(response, 200, options());
    if (pathname === '/admin/api/games') return send(response, 200, gameCards());
    if (pathname === '/admin/game.css') return send(response, 200, gameCss(), { 'Content-Type': 'text/css; charset=utf-8' });
    if (pathname === '/admin/api/overview') return send(response, 200, overview(url));
    if (pathname === '/admin/api/balance') return send(response, 200, balance(url));
    const exportMatch = /^\/admin\/export\/(sessions|games|questions)\.csv$/.exec(pathname);
    if (exportMatch) {
      return send(response, 200, csv(exportMatch[1], url), {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="exergame-${exportMatch[1]}-${new Date().toISOString().slice(0, 10)}.csv"`,
      });
    }
    const rawMatch = /^\/admin\/raw\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(pathname);
    if (rawMatch) {
      const [env, device, sid] = rawMatch.slice(1).map((part) => safe(decodeURIComponent(part), '_'));
      const file = rawPath(env, device, sid);
      if (!fs.existsSync(file)) return send(response, 404, { error: 'not found' });
      return send(response, 200, fs.readFileSync(file), {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="exergame-session-${device}-${sid}.json.gz"`,
      });
    }
    return send(response, 404, { error: 'not found' });
  };
};
