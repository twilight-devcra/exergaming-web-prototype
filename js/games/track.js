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
import { Util } from '../config.js';
import { Diagram } from '../diagram.js';
import { Sfx } from '../sfx.js';
import { Tag } from './tags.js';
import { pointsPer } from './kit.js';

// 진행 단계
const TrackPhase = Object.freeze({
  CUE: 'cue',   // 따라갈 공에 ★ 을 보여 준다
  MOVE: 'move', // 공이 움직인다
  PICK: 'pick', // 멈춘 공 가운데 따라간 공을 고른다
  END: 'end',
});

export class TrackGame {
  static id = 'track';
  static tags = [Tag.TRACK];
  static title = '공 따라가기';
  static hint = '★ 이 뜬 공을 눈으로 따라가다가<br>공이 멈추면 그 공을 누르세요';
  // 높은 단계가 너무 쉬웠다 (2026-10-22): Lv5 부터 공·★·빠르기를 늘리고 휘어 가게 하고, Lv6 부터 겹쳐 지나간다
  // Lv3 부터는 공이 너무 느려서 빠르기를 1.5배로 올렸다 (2026-10-23: 30·34·42·50·62·70 → 지금 값)
  // n·t 는 기록에 같은 이름으로 남고, 기록을 simulate 에 그대로 넘겨 판을 다시 만들므로 이름을 바꾸지 않는다
  /* eslint-disable id-length */
  static levels = [
    // 쉬운 단계: 공 하나만 느리게 따라간다
    { n: 4, t: 1, speed: 22, move: 2000, cue: 2000 },
    { n: 5, t: 1, speed: 26, move: 2500, cue: 2000 },
    { n: 5, t: 2, speed: 45, move: 2500, cue: 1800 },
    { n: 6, t: 2, speed: 51, move: 3000, cue: 1600 },
    // 공이 조금씩 휘어 간다
    { n: 7, t: 3, speed: 63, move: 3000, cue: 1500, wander: 30 },
    // 공끼리 겹쳐 지나간다
    { n: 8, t: 3, speed: 75, move: 3500, cue: 1500, pass: true, wander: 50 },
    { n: 9, t: 4, speed: 93, move: 4000, cue: 1400, pass: true, wander: 75 },
    { n: 10, t: 4, speed: 105, move: 4000, cue: 1300, pass: true, wander: 100 },
  ];
  /* eslint-enable id-length */
  static maxLevel = TrackGame.levels.length;
  static ARENA_WIDTH = 160;      // 판 너비
  static ARENA_HEIGHT = 100;     // 판 높이
  static BALL_RADIUS = 7;        // 공 반지름
  static FRAME_SECONDS = 1 / 120; // 미리 계산하는 장면 간격(초)
  static ACCEL = 0.5;     // 출발할 때 제 빠르기까지 붙는 시간(초). 처음부터 제 빠르기로 튀어 나가면 ★ 공을 놓치기 쉽다

  // 소개 그림: ① ★ 공을 보고 ② 공들이 움직인 뒤 그 공을 누른다 (②는 움직였다 멈추는 모습을 되풀이한다)
  static diagram() {
    const startPoints = [[40, 34], [90, 70], [130, 30], [60, 80]];
    const endPoints = [[110, 72], [40, 40], [80, 26], [140, 80]];
    const ball = (x, y) => `<circle class="tr-ball" cx="${x}" cy="${y}" r="13"/>`;
    const starAt = (x, y) => Diagram.text(x, y + 1, '★', 18, 'dg-txt on');
    const step1 = startPoints.map(([x, y]) => ball(x, y)).join('') + `<circle class="tr-halo on" cx="${startPoints[0][0]}" cy="${startPoints[0][1]}" r="19"/>` + starAt(...startPoints[0]);
    const CYCLE = 3;   // 한 바퀴(초): 0~55% 움직이고, 그 뒤 멈춘 채로 누르는 표시
    const moving = startPoints.map(([x, y], i) => `<circle class="tr-ball" cx="${x}" cy="${y}" r="13">` +
      `<animate attributeName="cx" values="${x};${endPoints[i][0]};${endPoints[i][0]}" keyTimes="0;0.55;1" dur="${CYCLE}s" repeatCount="indefinite"/>` +
      `<animate attributeName="cy" values="${y};${endPoints[i][1]};${endPoints[i][1]}" keyTimes="0;0.55;1" dur="${CYCLE}s" repeatCount="indefinite"/></circle>`).join('');
    const tap = `<g opacity="0">${Diagram.tap(endPoints[0][0], endPoints[0][1], 19)}<animate attributeName="opacity" values="0;0;1;1" keyTimes="0;0.6;0.62;1" dur="${CYCLE}s" repeatCount="indefinite"/></g>`;
    return [
      { svg: Diagram.svg('0 0 180 110', step1), caption: '★ 공을 잘 보고' },
      { svg: Diagram.svg('0 0 180 110', moving + tap), caption: '멈추면 그 공 누르기' },
    ];
  }

  /** @param {import('./host.js').GameHost} host */

  constructor(host) {
    this.host = host;
    this.spec = TrackGame.levels[host.level - 1];
    this.phase = TrackPhase.CUE;
    this.picked = new Set();
    this.hits = 0;
    this.misses = 0;
    this.seed = Util.randomBelow(2 ** 31);
    this.sim = TrackGame.simulate(this.spec, this.seed);
    this.targets = Util.shuffle([...Array(this.spec.n).keys()]).slice(0, this.spec.t);
  }

  start() {
    const { stage, level } = this.host;
    const { ARENA_WIDTH, ARENA_HEIGHT, BALL_RADIUS } = TrackGame;
    this.message = Util.element('div', 'stage-msg look', '★ 공을 잘 보세요');
    this.body = Util.frame(stage, `${TrackGame.title} · Lv.${level}`, this.message).body;
    this.wrap = Util.element('div', 'tr-wrap');
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'tr-arena');
    this.svg.setAttribute('viewBox', `${-BALL_RADIUS} ${-BALL_RADIUS} ${ARENA_WIDTH + 2 * BALL_RADIUS} ${ARENA_HEIGHT + 2 * BALL_RADIUS}`);
    this.svg.innerHTML = `<rect class="tr-floor" x="${-BALL_RADIUS}" y="${-BALL_RADIUS}" width="${ARENA_WIDTH + 2 * BALL_RADIUS}" height="${ARENA_HEIGHT + 2 * BALL_RADIUS}" rx="${BALL_RADIUS}"/>` +
      this.sim.frames[0].map(() => `<g class="tr-g"><circle class="tr-halo" r="${BALL_RADIUS + 3}"/><circle class="tr-ball" r="${BALL_RADIUS}"/><text class="tr-star" text-anchor="middle" dominant-baseline="central">★</text></g>`).join('');
    this.balls = [...this.svg.querySelectorAll('.tr-g')];
    this.svg.addEventListener('pointerdown', (event) => this.tap(event));
    this.wrap.append(this.svg);
    this.body.append(this.wrap);
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.body);
    this.layout();

    this.place(this.sim.frames[0]);
    this.targets.forEach((i) => this.balls[i].classList.add('cue'));
    this.host.sfx(Sfx.BLINK);
    this.host.after(this.spec.cue, () => this.startMoving());
  }

  layout() {
    const body = this.body;
    const aspectRatio = (TrackGame.ARENA_WIDTH + 2 * TrackGame.BALL_RADIUS) / (TrackGame.ARENA_HEIGHT + 2 * TrackGame.BALL_RADIUS);
    const width = Math.max(240, Math.min(body.clientWidth - 40, (body.clientHeight - 16) * aspectRatio, 1000));
    this.svg.style.width = `${width}px`;
    this.svg.style.height = `${width / aspectRatio}px`;
  }

  place(frame) {
    frame.forEach(([x, y], i) => this.balls[i].setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`));
  }

  // ★ 을 지우고 움직이기 시작한다. 장면은 게임 시계로 고른다 (멈춰 있는 동안 시계가 서 있으면 공도 선다)
  startMoving() {
    this.balls.forEach((ball) => ball.classList.remove('cue'));
    Util.say(this.message, '눈으로 따라가세요', 'look');
    this.phase = TrackPhase.MOVE;
    const moveStartedAt = this.host.now();
    const { frames } = this.sim;
    const step = () => {
      if (this.phase !== TrackPhase.MOVE) return;
      const frameIndex = Math.min(frames.length - 1, Math.floor((this.host.now() - moveStartedAt) / 1000 / TrackGame.FRAME_SECONDS));
      this.place(frames[frameIndex]);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    this.host.after(this.spec.move, () => this.stop());
  }

  stop() {
    this.phase = TrackPhase.PICK;
    this.place(this.sim.frames[this.sim.frames.length - 1]);
    const targetCount = this.spec.t;
    this.prompt();
    this.svg.classList.add('picking');
    const end = this.sim.frames[this.sim.frames.length - 1];
    this.host.question({
      // eslint-disable-next-line id-length -- 기록 형식 (단계 표와 같은 이름이라 simulate 에 그대로 넘겨 판을 다시 만든다)
      n: this.spec.n, t: targetCount, targets: this.targets, speed: this.spec.speed, move: this.spec.move, pass: !!this.spec.pass,
      wander: this.spec.wander || 0, seed: this.seed,   // TrackGame.simulate(spec, seed) 로 판을 그대로 다시 만들 수 있다
      start: this.sim.frames[0].map((ball) => ball.map((coord) => Math.round(coord * 10) / 10)),
      vel: this.sim.initialVelocities.map((velocity) => velocity.map((x) => Math.round(x * 100) / 100)),
      end: end.map((ball) => ball.map((coord) => Math.round(coord * 10) / 10)),
    });
    this.host.timer(targetCount, () => this.judge(true));
  }

  prompt() {
    const left = this.spec.t - this.picked.size;
    Util.say(this.message, this.spec.t === 1 ? '★ 이 있던 공을 고르세요'
      : this.picked.size ? `${left}개 더 고르세요` : `★ 이 있던 공 ${left}개를 고르세요`, 'act');
  }

  // 누른 자리에서 가장 가까운 공 (반지름의 1.5배 안). 이미 고른 공은 무시한다. 고르는 즉시 채점한다
  tap(event) {
    if (this.phase !== TrackPhase.PICK) return;
    const screenPoint = this.svg.createSVGPoint();
    screenPoint.x = event.clientX;
    screenPoint.y = event.clientY;
    const point = screenPoint.matrixTransform(this.svg.getScreenCTM().inverse());
    const end = this.sim.frames[this.sim.frames.length - 1];
    let best = -1;
    let bestDistance = TrackGame.BALL_RADIUS * 1.5;
    end.forEach(([x, y], i) => {
      const dist = Math.hypot(x - point.x, y - point.y);
      if (dist < bestDistance) [best, bestDistance] = [i, dist];
    });
    if (best < 0 || this.picked.has(best)) return;
    this.picked.add(best);
    const ok = this.targets.includes(best);
    this.host.input({ ball: best, correct: ok });
    if (ok) {
      this.hits++;
      this.balls[best].classList.add('cue', 'right');
      this.host.award(pointsPer(this.host, this.spec.t), this.balls[best]);
      this.host.sfx(Sfx.GOOD);
    } else {
      this.misses++;
      this.balls[best].classList.add('wrong');
      this.host.sfx(Sfx.BAD);
    }
    if (this.picked.size >= this.spec.t) this.judge(false);
    else this.prompt();
  }

  // 다 골랐거나 시간이 다 됐다. 놓친 ★ 공을 보여 준다. 시간 초과면 남은 고르기를 모두 틀린 것으로 친다 (오답 한 번만 울린다)
  judge(timedOut) {
    if (this.phase !== TrackPhase.PICK) return;
    this.phase = TrackPhase.END;
    this.host.stopTimer();
    this.svg.classList.remove('picking');
    const targetCount = this.spec.t;
    const ok = this.hits === targetCount;
    // eslint-disable-next-line id-length -- 기록 형식
    this.host.answer({ picked: [...this.picked], hits: this.hits, of: targetCount, correct: ok, timedOut });
    this.targets.forEach((i) => !this.picked.has(i) && this.balls[i].classList.add('cue', 'missed'));
    if (timedOut) this.host.sfx(Sfx.BAD);
    if (ok) {
      Util.say(this.message, '정답!', 'good');
    } else {
      Util.say(this.message, timedOut ? '시간 초과 · ★ 공은 여기였어요' : `${targetCount}개 중 ${this.hits}개를 맞혔어요`, 'bad');
    }
    this.host.after(ok ? 900 : 1600, () => this.finish());
  }

  finish() {
    this.resizeObserver.disconnect();
    this.host.done(this.result());
  }

  result() {
    return { cleared: this.hits === this.spec.t, correct: this.hits, total: this.spec.t };
  }

  abort() {
    this.phase = TrackPhase.END;
    this.resizeObserver.disconnect();
    return { cleared: false, correct: this.hits, total: this.spec.t };
  }

  // ---- 움직임 미리 계산 ----
  // 공을 서로 떨어뜨려 놓고 저마다 아무 방향(축에 너무 가깝지 않게)으로 비슷한 빠르기를 준 뒤 FRAME_SECONDS 간격으로 움직인다.
  // 벽에서는 튕기고, pass 가 아니면 공끼리도 튕긴다 (같은 무게의 탄성 충돌: 부딪친 방향의 속도를 맞바꾼다).
  // wander 가 있으면 공마다 도는 빠르기를 0.6초쯤마다 새로 정해 휘어 가게 한다. 처음 ACCEL 초는 서서히 빨라진다.
  // 멈췄을 때 겹친 공이 있으면 처음부터 다시 만든다. 난수는 모두 seed 에서 나온다 (같은 seed = 같은 판).
  // 반환: { frames: [장면마다 [[x, y], ...]], initialVelocities: 처음 속도 [[vx, vy], ...] }
  static simulate({ n: ballCount, speed, move, pass, wander = 0 }, seed = 1) {
    const { ARENA_WIDTH, ARENA_HEIGHT, BALL_RADIUS, FRAME_SECONDS } = TrackGame;
    // mulberry32
    let rngState = seed >>> 0;
    const random = () => {
      rngState = (rngState + 0x6d2b79f5) >>> 0;
      let mixed = rngState;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
    const turnEvery = Math.round(0.6 / FRAME_SECONDS);
    const steps = Math.ceil(move / 1000 / FRAME_SECONDS);
    const apart = (points, gap) => points.every(([x, y], i) => points.every(([otherX, otherY], j) => j <= i || Math.hypot(x - otherX, y - otherY) >= gap));
    let last = null;
    for (let tries = 0; tries < 200; tries++) {
      const positions = [];
      for (let attempt = 0; positions.length < ballCount && attempt < 2000; attempt++) {
        const ball = [BALL_RADIUS + random() * (ARENA_WIDTH - 2 * BALL_RADIUS), BALL_RADIUS + random() * (ARENA_HEIGHT - 2 * BALL_RADIUS)];
        if (apart([...positions, ball], 2 * BALL_RADIUS + 8)) positions.push(ball);
      }
      if (positions.length < ballCount) continue;
      const velocities = positions.map(() => {
        const angle = (Math.PI / 2) * Math.floor(random() * 4) + (Math.PI / 12) + random() * (Math.PI / 3); // 각 사분면 안, 축에서 15° 이상
        const speedNow = speed * (0.85 + random() * 0.3);
        return [Math.cos(angle) * speedNow, Math.sin(angle) * speedNow];
      });
      const initialVelocities = velocities.map((velocity) => velocity.slice());
      const frames = [positions.map((ball) => ball.slice())];
      const spin = positions.map(() => 0); // 공마다 지금 도는 빠르기 (라디안/초)
      for (let step = 0; step < steps; step++) {
        if (wander) {
          if (step % turnEvery === 0) spin.forEach((_, i) => (spin[i] = ((random() * 2 - 1) * wander * Math.PI) / 180));
          velocities.forEach((velocity, i) => {
            const cos = Math.cos(spin[i] * FRAME_SECONDS);
            const sin = Math.sin(spin[i] * FRAME_SECONDS);
            [velocity[0], velocity[1]] = [velocity[0] * cos - velocity[1] * sin, velocity[0] * sin + velocity[1] * cos];
          });
        }
        // 출발 가속: 처음 ACCEL 초 동안 0 에서 제 빠르기까지 부드럽게 (smoothstep). 방향·튕김은 velocities 그대로 쓴다
        const rampProgress = Math.min(1, ((step + 0.5) * FRAME_SECONDS) / TrackGame.ACCEL);
        const ramp = rampProgress * rampProgress * (3 - 2 * rampProgress);
        positions.forEach((ball, i) => {
          ball[0] += velocities[i][0] * ramp * FRAME_SECONDS;
          ball[1] += velocities[i][1] * ramp * FRAME_SECONDS;
          if (ball[0] < BALL_RADIUS) { ball[0] = 2 * BALL_RADIUS - ball[0]; velocities[i][0] = Math.abs(velocities[i][0]); }
          if (ball[0] > ARENA_WIDTH - BALL_RADIUS) { ball[0] = 2 * (ARENA_WIDTH - BALL_RADIUS) - ball[0]; velocities[i][0] = -Math.abs(velocities[i][0]); }
          if (ball[1] < BALL_RADIUS) { ball[1] = 2 * BALL_RADIUS - ball[1]; velocities[i][1] = Math.abs(velocities[i][1]); }
          if (ball[1] > ARENA_HEIGHT - BALL_RADIUS) { ball[1] = 2 * (ARENA_HEIGHT - BALL_RADIUS) - ball[1]; velocities[i][1] = -Math.abs(velocities[i][1]); }
        });
        if (!pass) {
          for (let i = 0; i < ballCount; i++) {
            for (let j = i + 1; j < ballCount; j++) {
              const deltaX = positions[j][0] - positions[i][0];
              const deltaY = positions[j][1] - positions[i][1];
              const dist = Math.hypot(deltaX, deltaY);
              if (dist >= 2 * BALL_RADIUS || dist === 0) continue;
              const normalX = deltaX / dist;
              const normalY = deltaY / dist;
              const approachSpeed = (velocities[i][0] - velocities[j][0]) * normalX + (velocities[i][1] - velocities[j][1]) * normalY;
              if (approachSpeed > 0) {
                velocities[i][0] -= approachSpeed * normalX; velocities[i][1] -= approachSpeed * normalY;
                velocities[j][0] += approachSpeed * normalX; velocities[j][1] += approachSpeed * normalY;
              }
              const push = (2 * BALL_RADIUS - dist) / 2;
              positions[i][0] -= normalX * push; positions[i][1] -= normalY * push;
              positions[j][0] += normalX * push; positions[j][1] += normalY * push;
            }
          }
        }
        // 공끼리 밀어낸 뒤 벽 밖으로 나간 공은 안으로 들인다
        positions.forEach((ball) => {
          ball[0] = Util.clamp(ball[0], BALL_RADIUS, ARENA_WIDTH - BALL_RADIUS);
          ball[1] = Util.clamp(ball[1], BALL_RADIUS, ARENA_HEIGHT - BALL_RADIUS);
        });
        frames.push(positions.map((ball) => ball.slice()));
      }
      last = { frames, initialVelocities };
      if (apart(frames[frames.length - 1], 2 * BALL_RADIUS + 4)) return last;
    }
    return last;
  }
}
