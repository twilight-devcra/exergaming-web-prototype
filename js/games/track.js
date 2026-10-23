// 공 따라가기
// 똑같은 공 여러 개 가운데 몇 개에 ★ 이 잠깐 떴다가 사라지고, 공들이 이리저리 움직인 뒤 멈춘다. ★ 이 있던 공을 고른다.
// ★ 수만큼 누를 수 있고, 누르는 공마다 바로 채점한다: 맞으면 그 자리에서 ★ 을 보여 주고 점수(1/t)를 준다.
// 고른 공을 다시 눌러 무르는 방식은 알아채기 어려워서 쓰지 않는다 — 한 번 누르면 끝이다. 공 하나가 답 하나다 (난이도 계기판·연속 정답).
//
// 움직임은 판을 만들 때 미리 계산해 둔다 (simulate). 그리는 쪽은 게임 시계(host.now)로 몇 번째 장면인지만 찾는다 —
// 그래서 일시정지·운영 메뉴 중에는 공도 멈춘다. 계산은 씨앗(seed)을 받는 난수로 하므로 기록에는 씨앗만 남겨도 판을 그대로 다시 만들 수 있다.
// 공은 벽에서 튕긴다. 낮은 단계에서는 공끼리도 튕겨 겹치지 않고, 높은 단계에서는 서로 겹쳐 지나가 헷갈리게 한다.
// 멈췄을 때는 어느 공도 겹쳐 있지 않다 (누를 공이 가려지지 않게).
// 난이도:
//   n      — 공 수
//   t      — 고를 공(★) 수
//   speed  — 빠르기 (판 단위/초. 판은 가로 160 · 세로 100)
//   move   — 움직이는 시간(ms)
//   pass   — 공끼리 겹쳐 지나간다 (아니면 서로 튕긴다)
//   cue    — ★ 을 보여 주는 시간(ms)
//   wander — 공이 곧게만 가지 않고 휘어 가는 정도 (초당 최대 회전 각도). 가던 방향으로 짐작해서는 못 찾게 한다
class TrackGame {
  static id = 'track';
  static tags = ['track']; // 꼬리표가 겹치는 게임끼리는 연달아 나오지 않는다 (main.js planPass)
  static title = '공 따라가기';
  static hint = '★ 이 뜬 공을 눈으로 따라가다가<br>공이 멈추면 그 공을 누르세요';
  // 높은 단계가 너무 쉬웠다 (2026-10-22): Lv5 부터 공·★·빠르기를 늘리고 휘어 가게 하고, Lv6 부터 겹쳐 지나간다
  static levels = [
    // 쉬운 단계: 공 하나만 느리게 따라간다
    { n: 4, t: 1, speed: 22, move: 2000, cue: 2000 },
    { n: 5, t: 1, speed: 26, move: 2500, cue: 2000 },
    { n: 5, t: 2, speed: 30, move: 2500, cue: 1800 },
    { n: 6, t: 2, speed: 34, move: 3000, cue: 1600 },
    // 공이 조금씩 휘어 간다
    { n: 7, t: 3, speed: 42, move: 3000, cue: 1500, wander: 30 },
    // 공끼리 겹쳐 지나간다
    { n: 8, t: 3, speed: 50, move: 3500, cue: 1500, pass: true, wander: 50 },
    { n: 9, t: 4, speed: 62, move: 4000, cue: 1400, pass: true, wander: 75 },
    { n: 10, t: 4, speed: 70, move: 4000, cue: 1300, pass: true, wander: 100 },
  ];
  static maxLevel = TrackGame.levels.length;
  static W = 160;
  static H = 100;
  static R = 7;           // 공 반지름
  static DT = 1 / 120;    // 미리 계산하는 장면 간격(초)

  // 소개 그림: ① ★ 공을 보고 ② 공들이 움직인 뒤 그 공을 누른다 (②는 움직였다 멈추는 모습을 되풀이한다)
  static diagram() {
    const from = [[40, 34], [90, 70], [130, 30], [60, 80]];
    const to = [[110, 72], [40, 40], [80, 26], [140, 80]];
    const ball = (x, y) => `<circle class="tr-ball" cx="${x}" cy="${y}" r="13"/>`;
    const starAt = (x, y) => Dg.text(x, y + 1, '★', 18, 'dg-txt on');
    const step1 = from.map(([x, y]) => ball(x, y)).join('') + `<circle class="tr-halo on" cx="${from[0][0]}" cy="${from[0][1]}" r="19"/>` + starAt(...from[0]);
    const D = 3;   // 한 바퀴(초): 0~55% 움직이고, 그 뒤 멈춘 채로 누르는 표시
    const moving = from.map(([x, y], i) => `<circle class="tr-ball" cx="${x}" cy="${y}" r="13">` +
      `<animate attributeName="cx" values="${x};${to[i][0]};${to[i][0]}" keyTimes="0;0.55;1" dur="${D}s" repeatCount="indefinite"/>` +
      `<animate attributeName="cy" values="${y};${to[i][1]};${to[i][1]}" keyTimes="0;0.55;1" dur="${D}s" repeatCount="indefinite"/></circle>`).join('');
    const tap = `<g opacity="0">${Dg.tap(to[0][0], to[0][1], 19)}<animate attributeName="opacity" values="0;0;1;1" keyTimes="0;0.6;0.62;1" dur="${D}s" repeatCount="indefinite"/></g>`;
    return [
      { svg: Dg.svg('0 0 180 110', step1), caption: '★ 공을 잘 보고' },
      { svg: Dg.svg('0 0 180 110', moving + tap), caption: '멈추면 그 공 누르기' },
    ];
  }

  constructor(host) {
    this.h = host;
    this.spec = TrackGame.levels[host.level - 1];
    this.phase = 'cue';
    this.picked = new Set();
    this.hits = 0;
    this.misses = 0;
    this.seed = U.rand(2 ** 31);
    this.sim = TrackGame.simulate(this.spec, this.seed);
    this.targets = U.shuffle([...Array(this.spec.n).keys()]).slice(0, this.spec.t);
  }

  start() {
    const { stage, level } = this.h;
    const { W, H, R } = TrackGame;
    this.msg = U.el('div', 'stage-msg look', '★ 공을 잘 보세요');
    this.body = U.frame(stage, `${TrackGame.title} · Lv.${level}`, this.msg).body;
    this.wrap = U.el('div', 'tr-wrap');
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'tr-arena');
    this.svg.setAttribute('viewBox', `${-R} ${-R} ${W + 2 * R} ${H + 2 * R}`);
    this.svg.innerHTML = `<rect class="tr-floor" x="${-R}" y="${-R}" width="${W + 2 * R}" height="${H + 2 * R}" rx="${R}"/>` +
      this.sim.frames[0].map(() => `<g class="tr-g"><circle class="tr-halo" r="${R + 3}"/><circle class="tr-ball" r="${R}"/><text class="tr-star" text-anchor="middle" dominant-baseline="central">★</text></g>`).join('');
    this.balls = [...this.svg.querySelectorAll('.tr-g')];
    this.svg.addEventListener('pointerdown', (e) => this.tap(e));
    this.wrap.append(this.svg);
    this.body.append(this.wrap);
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.body);
    this.layout();

    this.place(this.sim.frames[0]);
    this.targets.forEach((i) => this.balls[i].classList.add('cue'));
    this.h.sfx('blink');
    this.h.after(this.spec.cue, () => this.go());
  }

  layout() {
    const s = this.body;
    const ar = (TrackGame.W + 2 * TrackGame.R) / (TrackGame.H + 2 * TrackGame.R);
    const w = Math.max(240, Math.min(s.clientWidth - 40, (s.clientHeight - 16) * ar, 1000));
    this.svg.style.width = `${w}px`;
    this.svg.style.height = `${w / ar}px`;
  }

  place(frame) {
    frame.forEach(([x, y], i) => this.balls[i].setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`));
  }

  // ★ 을 지우고 움직이기 시작한다. 장면은 게임 시계로 고른다 (멈춰 있는 동안 시계가 서 있으면 공도 선다)
  go() {
    this.balls.forEach((b) => b.classList.remove('cue'));
    U.say(this.msg, '눈으로 따라가세요', 'look');
    this.phase = 'move';
    const t0 = this.h.now();
    const { frames } = this.sim;
    const step = () => {
      if (this.phase !== 'move') return;
      const k = Math.min(frames.length - 1, Math.floor((this.h.now() - t0) / 1000 / TrackGame.DT));
      this.place(frames[k]);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    this.h.after(this.spec.move, () => this.stop());
  }

  stop() {
    this.phase = 'pick';
    this.place(this.sim.frames[this.sim.frames.length - 1]);
    const { t } = this.spec;
    this.prompt();
    this.svg.classList.add('picking');
    const end = this.sim.frames[this.sim.frames.length - 1];
    this.h.question({
      n: this.spec.n, t, targets: this.targets, speed: this.spec.speed, move: this.spec.move, pass: !!this.spec.pass,
      wander: this.spec.wander || 0, seed: this.seed,   // TrackGame.simulate(spec, seed) 로 판을 그대로 다시 만들 수 있다
      start: this.sim.frames[0].map((p) => p.map((v) => Math.round(v * 10) / 10)),
      vel: this.sim.vel.map((v) => v.map((x) => Math.round(x * 100) / 100)),
      end: end.map((p) => p.map((v) => Math.round(v * 10) / 10)),
    });
    this.h.timer(t, () => this.judge(true));
  }

  prompt() {
    const left = this.spec.t - this.picked.size;
    U.say(this.msg, this.spec.t === 1 ? '★ 이 있던 공을 고르세요'
      : this.picked.size ? `${left}개 더 고르세요` : `★ 이 있던 공 ${left}개를 고르세요`, 'act');
  }

  // 누른 자리에서 가장 가까운 공 (반지름의 1.5배 안). 이미 고른 공은 무시한다. 고르는 즉시 채점한다
  tap(e) {
    if (this.phase !== 'pick') return;
    const pt = this.svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(this.svg.getScreenCTM().inverse());
    const end = this.sim.frames[this.sim.frames.length - 1];
    let best = -1;
    let bestD = TrackGame.R * 1.5;
    end.forEach(([x, y], i) => {
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bestD) [best, bestD] = [i, d];
    });
    if (best < 0 || this.picked.has(best)) return;
    this.picked.add(best);
    const ok = this.targets.includes(best);
    this.h.input({ ball: best, correct: ok });
    if (ok) {
      this.hits++;
      this.balls[best].classList.add('cue', 'right');
      this.h.award((this.h.base * this.h.mult) / this.spec.t, this.balls[best]);
      this.h.sfx('good');
    } else {
      this.misses++;
      this.balls[best].classList.add('wrong');
      this.h.sfx('bad');
    }
    if (this.picked.size >= this.spec.t) this.judge(false);
    else this.prompt();
  }

  // 다 골랐거나 시간이 다 됐다. 놓친 ★ 공을 보여 준다. 시간 초과면 남은 고르기를 모두 틀린 것으로 친다 (오답 한 번만 울린다)
  judge(timedOut) {
    if (this.phase !== 'pick') return;
    this.phase = 'end';
    this.h.stopTimer();
    this.svg.classList.remove('picking');
    const { t } = this.spec;
    const ok = this.hits === t;
    this.h.answer({ picked: [...this.picked], hits: this.hits, of: t, correct: ok, timedOut });
    this.targets.forEach((i) => !this.picked.has(i) && this.balls[i].classList.add('cue', 'missed'));
    if (timedOut) this.h.sfx('bad');
    if (ok) {
      U.say(this.msg, '정답!', 'good');
    } else {
      U.say(this.msg, timedOut ? '시간 초과 · ★ 공은 여기였어요' : `${t}개 중 ${this.hits}개를 맞혔어요`, 'bad');
    }
    this.h.after(ok ? 900 : 1600, () => this.finish());
  }

  finish() {
    this.ro.disconnect();
    this.h.done(this.result());
  }

  result() {
    return { cleared: this.hits === this.spec.t, correct: this.hits, total: this.spec.t };
  }

  abort() {
    this.phase = 'end';
    this.ro.disconnect();
    return { cleared: false, correct: this.hits, total: this.spec.t };
  }

  // ---- 움직임 미리 계산 ----
  // 공을 서로 떨어뜨려 놓고 저마다 아무 방향(축에 너무 가깝지 않게)으로 비슷한 빠르기를 준 뒤 DT 간격으로 움직인다.
  // 벽에서는 튕기고, pass 가 아니면 공끼리도 튕긴다 (같은 무게의 탄성 충돌: 부딪친 방향의 속도를 맞바꾼다).
  // wander 가 있으면 공마다 도는 빠르기를 0.6초쯤마다 새로 정해 휘어 가게 한다.
  // 멈췄을 때 겹친 공이 있으면 처음부터 다시 만든다. 난수는 모두 seed 에서 나온다 (같은 seed = 같은 판).
  // 반환: { frames: [장면마다 [[x, y], ...]], vel: 처음 속도 [[vx, vy], ...] }
  static simulate({ n, speed, move, pass, wander = 0 }, seed = 1) {
    const { W, H, R, DT } = TrackGame;
    // mulberry32
    let st = seed >>> 0;
    const rnd = () => {
      st = (st + 0x6d2b79f5) >>> 0;
      let z = st;
      z = Math.imul(z ^ (z >>> 15), z | 1);
      z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
      return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    };
    const turnEvery = Math.round(0.6 / DT);
    const steps = Math.ceil(move / 1000 / DT);
    const apart = (ps, gap) => ps.every(([x, y], i) => ps.every(([x2, y2], j) => j <= i || Math.hypot(x - x2, y - y2) >= gap));
    let last = null;
    for (let tries = 0; tries < 200; tries++) {
      const pos = [];
      for (let k = 0; pos.length < n && k < 2000; k++) {
        const p = [R + rnd() * (W - 2 * R), R + rnd() * (H - 2 * R)];
        if (apart([...pos, p], 2 * R + 8)) pos.push(p);
      }
      if (pos.length < n) continue;
      const vel = pos.map(() => {
        const a = (Math.PI / 2) * Math.floor(rnd() * 4) + (Math.PI / 12) + rnd() * (Math.PI / 3); // 각 사분면 안, 축에서 15° 이상
        const v = speed * (0.85 + rnd() * 0.3);
        return [Math.cos(a) * v, Math.sin(a) * v];
      });
      const v0 = vel.map((v) => v.slice());
      const frames = [pos.map((p) => p.slice())];
      const spin = pos.map(() => 0); // 공마다 지금 도는 빠르기 (라디안/초)
      for (let s = 0; s < steps; s++) {
        if (wander) {
          if (s % turnEvery === 0) spin.forEach((_, i) => (spin[i] = ((rnd() * 2 - 1) * wander * Math.PI) / 180));
          vel.forEach((v, i) => {
            const c = Math.cos(spin[i] * DT);
            const sn = Math.sin(spin[i] * DT);
            [v[0], v[1]] = [v[0] * c - v[1] * sn, v[0] * sn + v[1] * c];
          });
        }
        pos.forEach((p, i) => {
          p[0] += vel[i][0] * DT;
          p[1] += vel[i][1] * DT;
          if (p[0] < R) { p[0] = 2 * R - p[0]; vel[i][0] = Math.abs(vel[i][0]); }
          if (p[0] > W - R) { p[0] = 2 * (W - R) - p[0]; vel[i][0] = -Math.abs(vel[i][0]); }
          if (p[1] < R) { p[1] = 2 * R - p[1]; vel[i][1] = Math.abs(vel[i][1]); }
          if (p[1] > H - R) { p[1] = 2 * (H - R) - p[1]; vel[i][1] = -Math.abs(vel[i][1]); }
        });
        if (!pass) {
          for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
              const dx = pos[j][0] - pos[i][0];
              const dy = pos[j][1] - pos[i][1];
              const d = Math.hypot(dx, dy);
              if (d >= 2 * R || d === 0) continue;
              const nx = dx / d;
              const ny = dy / d;
              const rel = (vel[i][0] - vel[j][0]) * nx + (vel[i][1] - vel[j][1]) * ny;
              if (rel > 0) {
                vel[i][0] -= rel * nx; vel[i][1] -= rel * ny;
                vel[j][0] += rel * nx; vel[j][1] += rel * ny;
              }
              const push = (2 * R - d) / 2;
              pos[i][0] -= nx * push; pos[i][1] -= ny * push;
              pos[j][0] += nx * push; pos[j][1] += ny * push;
            }
          }
        }
        // 공끼리 밀어낸 뒤 벽 밖으로 나간 공은 안으로 들인다
        pos.forEach((p) => {
          p[0] = U.clamp(p[0], R, W - R);
          p[1] = U.clamp(p[1], R, H - R);
        });
        frames.push(pos.map((p) => p.slice()));
      }
      last = { frames, vel: v0 };
      if (apart(frames[frames.length - 1], 2 * R + 4)) return last;
    }
    return last;
  }
}
