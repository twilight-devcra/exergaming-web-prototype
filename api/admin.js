// 관리 화면 (/admin): 들어온 세션 보기와 게임 밸런스 집계. 비밀번호는 server.js 가 확인한다.
//   GET /admin                      화면 (admin.html)
//   GET /admin/api/options          거르기 칸의 보기 (env · edition · mode …)
//   GET /admin/api/overview?…       세션 수 · 날짜별 · 최근 세션
//   GET /admin/api/balance?…        게임 × 레벨: 문제 수 · 정답률 · 시간 초과율 · 걸린 시간
//   GET /admin/export/<표>.csv?…    sessions · games · questions 를 거른 그대로
//   GET /admin/raw/<env>/<device>/<sid>   원본 세션 (.json.gz)
//   GET /admin/replay?env=&device=&sid=   세션 재생 화면 (replay.html). 원본을 받아 브라우저에서 다시 그린다
// 거르기(쿼리): env(기본 prod) · edition · mode · track · difficulty · device · from · to(YYYY-MM-DD, 시작 시각 기준) · all=1(중단한 판도)
'use strict';
const fs = require('fs');
const path = require('path');

const PAGE = path.join(__dirname, 'admin.html');
const REPLAY = path.join(__dirname, 'replay.html');

// 게임 id → 이름 (js/games/*.js 의 static title). 서버는 같은 저장소에서 돌므로 그대로 읽는다
function titles() {
  const dir = path.join(__dirname, '..', 'js', 'games');
  const out = {};
  try {
    for (const f of fs.readdirSync(dir)) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      const id = /static id = '([^']+)'/.exec(src);
      const title = /static title = '([^']+)'/.exec(src);
      if (id && title) out[id[1]] = title[1];
    }
  } catch (e) { }
  return out;
}

module.exports = (db, { rawPath, safe }) => {
  // 거르기 → WHERE (sessions 를 s 로 부른다)
  function where(u) {
    const p = u.searchParams;
    const w = ['s.env = ?'];
    const a = [p.get('env') || 'prod'];
    for (const k of ['edition', 'mode', 'track', 'difficulty', 'device']) {
      if (p.get(k)) { w.push(`s.${k} = ?`); a.push(p.get(k)); }
    }
    if (p.get('from')) { w.push('s.started_at >= ?'); a.push(p.get('from')); }
    if (p.get('to')) { w.push('s.started_at < ?'); a.push(new Date(new Date(p.get('to')).getTime() + 864e5).toISOString().slice(0, 10)); }
    if (p.get('all') !== '1') w.push("(s.ended IS NULL OR s.ended != 'abandoned')");
    return { sql: w.join(' AND '), args: a };
  }
  const JOIN = 'JOIN sessions s ON s.env = t.env AND s.device = t.device AND s.sid = t.sid';

  const quantile = (sorted, q) => {
    if (!sorted.length) return null;
    const i = (sorted.length - 1) * q;
    const lo = Math.floor(i);
    return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo);
  };

  function options() {
    const col = (c) => db.prepare(`SELECT DISTINCT ${c} v FROM sessions WHERE ${c} IS NOT NULL ORDER BY 1`).all().map((r) => r.v);
    return { titles: titles(), env: col('env'), edition: col('edition'), mode: col('mode'), track: col('track'), difficulty: col('difficulty'), device: col('device') };
  }

  function overview(u) {
    const { sql, args } = where(u);
    const tot = db.prepare(`SELECT COUNT(*) n, COUNT(DISTINCT s.user) users, COUNT(DISTINCT s.device) devices,
      SUM(s.bytes) bytes, AVG(s.elapsed_sec) avg_sec, AVG(s.score) avg_score, AVG(s.in_zone) in_zone FROM sessions s WHERE ${sql}`).get(...args);
    const q = db.prepare(`SELECT COUNT(*) n, AVG(t.correct) acc FROM questions t ${JOIN} WHERE ${sql} AND t.answered = 1`).get(...args);
    const days = db.prepare(`SELECT substr(s.started_at, 1, 10) day, COUNT(*) n FROM sessions s WHERE ${sql} GROUP BY 1 ORDER BY 1`).all(...args);
    const ended = db.prepare(`SELECT s.ended k, COUNT(*) n FROM sessions s WHERE ${sql} GROUP BY 1 ORDER BY 2 DESC`).all(...args);
    const recent = db.prepare(`SELECT s.env, s.device, s.sid, s.started_at, s.received_at, s.edition, s.mode, s.track, s.difficulty, s.min,
      s.user, s.station, s.ended, s.elapsed_sec, s.score, s.ex_score, s.cog_score, s.in_zone, s.bytes,
      (SELECT COUNT(*) FROM games g WHERE g.env = s.env AND g.device = s.device AND g.sid = s.sid) games
      FROM sessions s WHERE ${sql} ORDER BY s.started_at DESC LIMIT 200`).all(...args);
    return { totals: { ...tot, questions: q.n, accuracy: q.acc }, days, ended, recent };
  }

  function balance(u) {
    const { sql, args } = where(u);
    const rows = db.prepare(`SELECT t.game, t.level, t.correct, t.timed_out, t.ms, t.limit_ms, s.target_acc FROM questions t ${JOIN}
      WHERE ${sql} AND t.answered = 1`).all(...args);
    const cells = new Map();
    for (const r of rows) {
      const k = `${r.game}|${r.level}`;
      if (!cells.has(k)) cells.set(k, { game: r.game, level: r.level, n: 0, correct: 0, timeouts: 0, ms: [], ratio: [], tsum: 0, tn: 0 });
      const c = cells.get(k);
      c.n++;
      c.correct += r.correct;
      c.timeouts += r.timed_out;
      if (r.target_acc != null) { c.tsum += r.target_acc; c.tn++; }
      if (r.ms != null) c.ms.push(r.ms);
      if (r.ms != null && r.limit_ms) c.ratio.push(r.ms / r.limit_ms);
    }
    const out = [...cells.values()].map((c) => {
      c.ms.sort((a, b) => a - b);
      c.ratio.sort((a, b) => a - b);
      return {
        game: c.game, level: c.level, n: c.n, accuracy: c.correct / c.n, target: c.tn ? c.tsum / c.tn : null, timeoutRate: c.timeouts / c.n,
        msMedian: quantile(c.ms, 0.5), msP90: quantile(c.ms, 0.9), limitUseMedian: quantile(c.ratio, 0.5),
      };
    });
    // 게임 한 판 단위: 몇 번 나왔나, 어느 레벨에서 시작했나, 라운드 끝에 잘린 비율
    const games = db.prepare(`SELECT t.game, COUNT(*) plays, AVG(t.level) avg_level, MAX(t.level) max_level,
      AVG(t.aborted) aborted, AVG(CASE WHEN t.total > 0 THEN 1.0 * t.correct / t.total END) acc, AVG(t.points) points
      FROM games t ${JOIN} WHERE ${sql} GROUP BY t.game ORDER BY plays DESC`).all(...args);
    return { cells: out, games };
  }

  // CSV: 거른 그대로 (원본 열 이름)
  function csv(table, u) {
    const { sql, args } = where(u);
    const q = table === 'sessions'
      ? `SELECT s.* FROM sessions s WHERE ${sql} ORDER BY s.started_at`
      : `SELECT t.*, s.started_at, s.edition, s.mode, s.track, s.difficulty, s.user FROM ${table} t ${JOIN} WHERE ${sql} ORDER BY s.started_at, t.${table === 'games' ? 'n' : 'q'}`;
    const rows = db.prepare(q).all(...args);
    const cols = rows.length ? Object.keys(rows[0]).filter((c) => c !== 'summary' && c !== 'history') : [];
    const cell = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
  }

  return (req, res, u, send) => {
    const p = u.pathname;
    if (p === '/admin' || p === '/admin/') return send(res, 200, fs.readFileSync(PAGE), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    if (p === '/admin/replay') return send(res, 200, fs.readFileSync(REPLAY), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    if (p === '/admin/api/options') return send(res, 200, options());
    if (p === '/admin/api/overview') return send(res, 200, overview(u));
    if (p === '/admin/api/balance') return send(res, 200, balance(u));
    const ex = /^\/admin\/export\/(sessions|games|questions)\.csv$/.exec(p);
    if (ex) {
      return send(res, 200, csv(ex[1], u), {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="exergame-${ex[1]}-${new Date().toISOString().slice(0, 10)}.csv"`,
      });
    }
    const raw = /^\/admin\/raw\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(p);
    if (raw) {
      const [env, device, sid] = raw.slice(1).map((s) => safe(decodeURIComponent(s), '_'));
      const file = rawPath(env, device, sid);
      if (!fs.existsSync(file)) return send(res, 404, { error: 'not found' });
      return send(res, 200, fs.readFileSync(file), {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="exergame-session-${device}-${sid}.json.gz"`,
      });
    }
    return send(res, 404, { error: 'not found' });
  };
};
