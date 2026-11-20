// 상단 1/4 영역: 평지를 구르는 공으로 페달링 속도를 시각화.
// 속도 전환 구간에는 같은 캔버스가 화면 전체로 커진다 (크기에 맞춰 공과 구역도 조금 커진다).
// 지면은 페달 속도가 아니라 점수만큼 흘러간다. 초록 구역 안에서는 꾸준히 나아가고, 벗어나면 느려지다 멈추며,
// 인지 게임을 맞히면 한꺼번에 쭉 나아간다. 일정 점수마다 깃발이 서 있어 점수가 '달린 거리'로 보인다.
import { U } from './config.js';
import { Landmarks } from './landmarks.js';
import { hash, mix } from './paint.js';
import { footprint, heightOf, drawLandmark, drawSign } from './landmark-art.js';
import { drawPine, drawRoundTree, drawHouse, drawWindmill, drawFlowerPatch, drawRoadside, drawRoadsideHill, drawBrainBadge, drawBike } from './scenery-art.js';

export class Band {
  static RING_SEC = 0.7;
  static PX_PER_POINT = 8;   // 1점에 지면이 움직이는 거리
  static MARK_EVERY = 200;   // 깃발 간격 (점)
  static MARK_BIG = 1000;     // 큰 깃발 간격 (점)
  static POP_SEC = 0.5;      // 깃발을 지난 직후 깃발이 커졌다 돌아오는 시간
  static REGION_SLOTS = 24;  // 풍경 라이딩: 한 풍경 구간의 나무 칸 수 (한 라운드에 서너 구간을 지난다)

  constructor(canvas, cfg) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.cfg = cfg;
    this.ballX = 0;       // -1 ~ 1 (트랙 기준 정규화 위치)
    this.roll = 0;        // 공 회전각
    this.dist = 0;        // 지금까지 나아간 거리 (점수 단위). 점수를 조금 늦게 부드럽게 따라간다
    this.passed = null;   // 방금 지난 깃발 { m, t }
    this.onMilestone = null; // (m) 깃발을 지나는 순간
    this.theta = 0;       // 현재 지면 각도 (rad)
    this.thetaTarget = 0;
    this.floaters = [];
    this.rings = [];      // 인지 게임 정답 때 공에서 퍼지는 고리
    this.pop = 0;         // 정답 직후 공이 커졌다 돌아오는 정도 1→0
    this.outAmount = 0;   // 구역 이탈 정도 0~1
    this.rpm = 0;
    this.time = 0;        // 흐른 시간 (s). 구름·풍차처럼 점수와 상관없이 움직이는 것에 쓴다
    this.dayT = 0;        // 라운드 진행 0~1. 풍경 라이딩에서 아침 → 해 질 녘 (main.js 가 넣는다)
    // 기념물 (풍경 라이딩, 운영 버전의 회원): 지난 세션마다 그 최종 점수 자리에 하나씩 서 있다 (js/landmarks.js).
    // 점수가 오르면 자전거가 지난 기록들을 지나가고, 비슷한 점수로 여러 번 하면 그 자리에 모인다. 라운드가 끝나면 이번 점수 자리에 세운다
    this.landmarks = [];    // [{ score, seed, best, pop, tag, kind, size }] 점수 순. tag = 팻말 글자 (날짜)
    this.onLandmark = null; // (lm) 지난 기념물을 지나는 순간
    this.planting = null;   // 라운드 끝에 세우는 기념물 { score, t, label, seed, kind, size }
    this.endShift = 0;      // 나무를 심을 때 자전거가 앞으로 비켜 가는 정도 0~1
    // 풍경 라이딩: 캔버스 위에 덮이는 화면 요소 (캔버스 좌표, measureUi). 휴대폰처럼 좁으면 그림이 그 밑으로 들어가기 쉽다
    this.hudRects = [];     // 위쪽 칩(남은 시간·거리·점수)
    this.endRect = null;    // 오른쪽 아래 '그만하기' 단추
    this.dodge = null;      // 트랙이 '그만하기' 단추를 비켜 왼쪽으로 옮겨 간 정도 0~1 (dodgeTo 로 미끄러진다)
    this.dodgeTo = 0;
    // 두뇌 게임만 하는 판 (페달 없이, main.js 가 넣는다): 띠는 자리를 지키며 점수만큼 흘러가지만, 허용 구역·RPM 말풍선이 없고
    // 공·자전거 대신 두뇌 배지가 가운데에서 달린다
    this.brainOnly = false;
    // 화면 스타일(js/themes.js)에 따른 색과 그리는 방식. glow = 빛 번짐, pixel = 픽셀 크기, outline = 테두리 두께, speedLines = 공 뒤 속도선
    this.look = {};
    this.pal = Band.readPalette();
    this.resize();
    // 높이가 바뀌는 동안(전환 애니메이션) 매번 다시 맞춘다. 캔버스 크기를 바꾸면 내용이 지워지므로 바로 다시 그린다.
    new ResizeObserver(() => {
      this.resize();
      this.draw();
    }).observe(canvas);
  }

  // 색은 CSS 변수에서 읽는다 (스타일을 바꾸면 setLook 으로 다시 읽는다)
  static readPalette() {
    const cs = getComputedStyle(document.body);
    const v = (n) => cs.getPropertyValue(n).trim();
    return {
      good: v('--good'), goodSoft: v('--good-soft'), bad: v('--bad'), badSoft: v('--bad-soft'), warn: v('--warn'),
      accent: v('--accent'), ink: v('--ink'), font: v('--font-num') || 'system-ui, sans-serif', onAccent: v('--on-accent'), ground: v('--ground'), groundMark: v('--ground-mark'),
      panel: v('--panel'), fontText: v('--font') || 'system-ui, sans-serif',
      // 풍경 라이딩(look.scenic)에서만 쓴다
      sky: v('--sky'), sun: v('--sun'), hillFar: v('--hill-far'), hillNear: v('--hill-near'), tree: v('--tree'), grass: v('--grass'),
      skyDawn: v('--sky-dawn'), skyGolden: v('--sky-golden'), skyDusk: v('--sky-dusk'),
      skyLow: v('--sky-low'), skyDawnLow: v('--sky-dawn-low'), skyGoldenLow: v('--sky-golden-low'), skyDuskLow: v('--sky-dusk-low'), sunDusk: v('--sun-dusk'), duskTint: v('--dusk-tint'),
      cloud: v('--cloud'), cloudDusk: v('--cloud-dusk'), trunk: v('--trunk'), treeRound: v('--tree-round'), fruit: v('--fruit'),
      wall: v('--wall'), roof: v('--roof'), roofAlt: v('--roof-alt'), window: v('--window'), mill: v('--mill'), blade: v('--blade'), bush: v('--bush'),
      flowerA: v('--flower-a'), flowerB: v('--flower-b'), flowerC: v('--flower-c'), flowerD: v('--flower-d'),
      zone: v('--zone') || v('--good'), road: v('--road'), roadEdge: v('--road-edge'), roadMark: v('--road-mark'), tipGood: v('--tip-good'), tipWarn: v('--tip-warn'),
    };
  }

  setLook(look) {
    this.look = look || {};
    this.pal = Band.readPalette();
    this.canvas.style.imageRendering = this.look.pixel ? 'pixelated' : '';
    this.resize();
    this.draw();
  }

  resize() {
    // 픽셀 스타일은 일부러 낮은 해상도로 그리고 늘려서 계단을 보이게 한다
    const dpr = this.look.pixel ? 1 / this.look.pixel : window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.W = r.width;
    this.H = r.height;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dpr = dpr;
    this.measureUi(r);
  }

  // 캔버스 위에 덮이는 화면 요소들을 캔버스 좌표로 잰다 (풍경 라이딩만 쓴다). 캔버스 크기가 바뀔 때마다 다시 잰다.
  //   hudRects — 위쪽 칩들. 점수 알림·'여기에 맞춰 달려요'·건물 이름표를 그 밑으로 숨기지 않는다 (휴대폰에서는 칩이 가로를 다 차지한다)
  //   endRect — '그만하기' 단추. 자전거가 그 밑으로 들어가지 않게 트랙을 비킨다. 단추가 숨어 있으면(라운드 밖) 비킬 것이 없다
  measureUi(c) {
    if (!c.width) return;
    const local = (el) => {
      const b = el.getBoundingClientRect();
      return b.width && b.height ? { left: b.left - c.left, right: b.right - c.left, top: b.top - c.top, bottom: b.bottom - c.top } : null;
    };
    this.hudRects = [...document.querySelectorAll('#band-ui .hud')].map(local).filter(Boolean);
    const end = this.canvas.parentElement.querySelector('.end-btn');
    this.endRect = end && !end.hidden ? local(end) : null;
  }

  // 지금 그리는 좌표계(g 의 변환)에서 사각형 (x0, y0) ~ (x1, y1) 이 HUD 칩 밑으로 얼마나 들어가는가 (px, 겹치지 않으면 0)
  hudDepth(x0, y0, x1, y1) {
    if (!this.hudRects.length) return 0;
    const m = this.g.getTransform();
    const d = this.dpr;
    const xs = [], ys = [];
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      xs.push((m.a * x + m.c * y + m.e) / d);
      ys.push((m.b * x + m.d * y + m.f) / d);
    }
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    let depth = 0;
    for (const h of this.hudRects) {
      if (right <= h.left || left >= h.right || bottom <= h.top || top >= h.bottom) continue;
      depth = Math.max(depth, h.bottom - top);
    }
    return depth;
  }

  setSlope(dir) {
    // dir: +1 오르막(더 빠르게), -1 내리막(더 천천히), 0 평지
    this.thetaTarget = dir * (7 * Math.PI / 180);
  }

  addFloater(text, color) {
    this.floaters.push({ text, color, t: 0, x: this.ballX });
  }

  // 아래쪽 인지 게임을 맞혔을 때 위쪽 공도 같이 반응한다.
  // 화면 위아래가 따로 노는 두 화면이 아니라 한 게임으로 느껴지게 하려는 것.
  celebrate() {
    this.rings.push({ t: 0, x: this.ballX });
    this.pop = 1;
  }

  // 새 라운드: 출발선으로 되돌린다
  restart() {
    this.dist = 0;
    this.passed = null;
    this.floaters = [];
    this.rings = [];
    this.planting = null;
    this.endShift = 0;
    this.dodge = null;
    this.landmarks.forEach((lm) => (lm.pop = 0));
  }

  // 지난 세션들 → 풍경의 기념물 (무엇을 세우는가는 js/landmarks.js). pop = 지나갈 때 커졌다 돌아오는 연출
  setLandmarks(sessions) {
    this.landmarks = Landmarks.fromHistory(sessions).map((landmark) => ({ ...landmark, pop: 0 }));
  }

  // 라운드 끝: 이번 점수 자리에 기념물을 세운다 (main.js 의 마무리 화면). 자전거는 앞으로 비켜 가며 멈춘다.
  // info = { n: 이 회원의 몇 번째 기록인가, difficulty, min }. 돌려주는 값 = 생김새 (main.js 가 세션 로그에 적는다)
  plant(score, { n = 1, difficulty, min } = {}) {
    const { kind, size, verb } = Landmarks.forSession(difficulty, min);
    const label = `${n === 1 ? '첫' : `${n}번째`} 기록 · ${verb}`;
    const look = Landmarks.look(kind, size, Math.floor(Math.random() * 100000));
    // 짓는 단계: 건물은 층마다 한 단계 + 지붕 (그 밖의 기념물은 한 번에)
    const steps = Landmarks.isBuilding(kind) ? size + 2 : 1;
    this.planting = {
      score: Math.max(score, this.dist), t: 0, label, ...look,
      steps, step: -1, done: false, doneAt: Band.BUILD_DELAY + Band.BUILD_LEAD + steps * Band.BUILD_STEP,
    };
    return look;
  }

  // 라운드 끝의 짓기 연출 시간 (초): 풍경 카드가 커지고 자전거가 비켜 갈 동안 기다린 뒤(BUILD_DELAY) 터를 고르고(BUILD_LEAD)
  // 한 단계(층·지붕)씩 BUILD_STEP 마다 올린다. 다 지으면 반짝이고 이름표가 바뀐다 (planting.doneAt)
  static BUILD_DELAY = 0.9;
  static BUILD_LEAD = 0.35;
  static BUILD_STEP = 0.5;

  // deviation: (rpm - target) / target
  // score: 지금까지의 점수 (틱 사이에도 이어지도록 진행 중인 틱의 몫까지 더한 값)
  update(dt, rpm, deviation, score = 0) {
    const { tolerance, maxDeviation } = this.cfg;
    const target = U.clamp(deviation / maxDeviation, -1, 1);
    this.ballX = U.lerp(this.ballX, target, 1 - Math.exp(-dt / 0.18));
    this.theta = U.lerp(this.theta, this.thetaTarget, 1 - Math.exp(-dt / 0.6));
    this.rpm = rpm;
    const speed = rpm / 60; // 초당 회전 수
    this.roll += speed * Math.PI * 2 * dt;
    // 점수를 따라간다. 인지 게임 점수처럼 한 번에 크게 오르면 잠깐 사이에 쭉 달려가는 것으로 보인다.
    const before = this.dist;
    // (틱이 끝날 때 반올림으로 점수가 살짝 내려앉을 수 있다. 그렇다고 지면이 뒤로 가지는 않게 한다)
    this.dist = Math.max(this.dist, U.lerp(this.dist, score, 1 - Math.exp(-dt / 0.25)));
    const m = Math.floor(this.dist / Band.MARK_EVERY) * Band.MARK_EVERY;
    if (m > 0 && before < m) {
      this.passed = { m, t: 0 };
      if (this.onMilestone) this.onMilestone(m);
    }
    if (this.passed) this.passed.t += dt;
    for (const lm of this.landmarks) {
      lm.pop = Math.max(0, lm.pop - dt / 0.6);
      if (before < lm.score && this.dist >= lm.score) {
        lm.pop = 1;
        if (this.onLandmark) this.onLandmark(lm);
      }
    }
    if (this.planting) {
      const p = this.planting;
      p.t += dt;
      this.endShift = Math.min(1, this.endShift + dt / 0.9);
      // 한 단계 올릴 때마다, 다 지었을 때 main.js 가 소리를 낸다
      const step = Math.floor((p.t - Band.BUILD_DELAY - Band.BUILD_LEAD) / Band.BUILD_STEP);
      if (step >= 0 && step < p.steps && step > p.step) {
        p.step = step;
        if (this.onBuildStep) this.onBuildStep(step, p.steps);
      }
      if (!p.done && p.t >= p.doneAt) {
        p.done = true;
        if (this.onBuilt) this.onBuilt();
      }
    }
    // 색과 점수는 실제 편차가 아니라 화면에 보이는 공 위치를 기준으로 한다 (보이는 대로 채점)
    const out = Math.max(0, Math.abs(this.deviation) - tolerance) / (maxDeviation - tolerance);
    this.outAmount = U.lerp(this.outAmount, U.clamp(out * 1.5 + (out > 0 ? 0.35 : 0), 0, 1), 1 - Math.exp(-dt / 0.12));
    this.slowSide = this.ballX < 0;
    this.floaters.forEach((f) => (f.t += dt));
    this.floaters = this.floaters.filter((f) => f.t < 1);
    this.rings.forEach((r) => (r.t += dt));
    this.rings = this.rings.filter((r) => r.t < Band.RING_SEC);
    this.pop = Math.max(0, this.pop - dt / 0.4);
    if (this.dodge != null) this.dodge = U.lerp(this.dodge, this.dodgeTo, 1 - Math.exp(-dt / 0.25));
    this.time += dt;
  }

  // 화면에 그려진 공 위치에 해당하는 편차
  get deviation() {
    return this.ballX * this.cfg.maxDeviation;
  }

  // 공의 중심이 허용 구역 점선 안에 있는가
  get inZone() {
    return Math.abs(this.deviation) <= this.cfg.tolerance;
  }

  draw() {
    if (this.look.scenic) return this.drawScenic();
    const { g, W, H, pal, look } = this;
    const { tolerance, maxDeviation } = this.cfg;
    g.clearRect(0, 0, W, H);
    // 네온 스타일: 선과 공에 빛 번짐
    const glow = (c) => {
      if (!look.glow) return;
      g.shadowColor = c;
      g.shadowBlur = look.glow;
    };
    const noGlow = () => (g.shadowBlur = 0);

    const cx = W / 2;
    const gy = H * 0.72;
    const trackHalf = Math.max(120, W / 2 - 230);
    const zoneHalf = trackHalf * (tolerance / maxDeviation);
    // 띠 높이에서는 반지름이 30에서 멈추고, 화면 전체로 커지면 그만큼 더 커진다
    const r = U.clamp(H * 0.14, 14, 30 + Math.max(0, H - 320) * 0.035);
    const zoneH = r * 2 + Math.min(H * 0.14, r * 1.6);

    g.save();
    g.translate(cx, gy);
    g.rotate(-this.theta);

    // 허용 구역 (두뇌 게임만 하는 판에는 없다)
    const red = this.outAmount;
    if (!this.brainOnly) {
      g.fillStyle = pal.goodSoft;
      g.fillRect(-zoneHalf, -zoneH, zoneHalf * 2, zoneH);
      if (red > 0) {
        g.globalAlpha = red;
        g.fillStyle = pal.badSoft;
        g.fillRect(-zoneHalf, -zoneH, zoneHalf * 2, zoneH);
      }
      g.globalAlpha = this.inZone ? 1 : 0.4 + red * 0.6;
      g.strokeStyle = this.inZone ? pal.good : pal.bad;
      glow(g.strokeStyle);
      g.lineWidth = 3;
      g.setLineDash([6, 6]);
      g.beginPath();
      g.moveTo(-zoneHalf, -zoneH);
      g.lineTo(-zoneHalf, 0);
      g.moveTo(zoneHalf, -zoneH);
      g.lineTo(zoneHalf, 0);
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
      noGlow();
    }

    // 지면
    const ext = W;
    g.strokeStyle = pal.ground;
    glow(pal.ground);
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(-ext, 0);
    g.lineTo(ext, 0);
    g.stroke();
    noGlow();
    // 지면 무늬 (공이 굴러가는 느낌)
    g.strokeStyle = pal.groundMark;
    g.lineWidth = 3;
    const spacing = 36;
    const off = -((this.dist * Band.PX_PER_POINT) % spacing);
    g.beginPath();
    for (let x = -ext + off; x < ext; x += spacing) {
      g.moveTo(x, 10);
      g.lineTo(x - 12, 22);
    }
    g.stroke();

    this.drawFlags(ext, r, 0, (big) => -(zoneH + (big ? r * 0.75 : r * 0.3)), glow, noGlow);

    // 정답 고리 — 공 뒤에서 퍼져 나간다
    this.drawRings(trackHalf, -r - 2, r);

    // 공 (정답 직후에는 잠깐 커지면서 초록으로 물든다)
    const bx = this.ballX * trackHalf;
    const br = r * (1 + 0.25 * this.pop);
    const by = -br - 2;
    if (this.brainOnly) {
      drawBrainBadge(this, bx, by, br);
      this.drawFloaters(trackHalf, -r * 2 - 6, r, glow);
      noGlow();
      g.globalAlpha = 1;
      g.restore();
      return;
    }
    // 스포츠 스타일: 공 뒤로 속도선 (빠를수록 길다)
    if (look.speedLines && this.rpm > 5) {
      g.strokeStyle = pal.ground;
      g.lineWidth = Math.max(2, r * 0.12);
      g.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const len = r * (0.8 + this.rpm / 45) * (k === 1 ? 1.3 : 0.9);
        const ly = by + (k - 1) * br * 0.55;
        const x0 = bx - br - 8 - ((this.roll * 6 + k * 7) % 6);
        g.globalAlpha = 0.55;
        g.beginPath();
        g.moveTo(x0, ly);
        g.lineTo(x0 - len, ly);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.lineCap = 'butt';
    }
    // 공은 바퀴 모양: 진한 타이어 안에 색 바퀴통. 게임 판의 색 동그라미(공 따라가기의 공, 길 칸)와 헷갈리지 않게 한다.
    // 바퀴통 색이 구역 안/밖을 알리고, 정답 직후에는 초록을 위에 겹쳐 물들인다
    const ballColor = this.inZone ? pal.accent : pal.bad;
    const hub = br * 0.72;
    glow(ballColor);
    g.fillStyle = pal.ink;
    g.beginPath();
    g.arc(bx, by, br, 0, Math.PI * 2);
    g.fill();
    noGlow();
    if (look.outline) {
      g.strokeStyle = pal.ink;
      g.lineWidth = look.outline;
      g.stroke();
    }
    // 타이어 무늬 — 바퀴살과 함께 돌아서 굴러가는 것이 보인다
    g.strokeStyle = pal.ground;
    g.lineWidth = Math.max(1.5, br * 0.07);
    g.lineCap = 'round';
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = this.roll + (k * Math.PI) / 5;
      g.moveTo(bx + Math.cos(a) * br * 0.8, by + Math.sin(a) * br * 0.8);
      g.lineTo(bx + Math.cos(a) * br * 0.92, by + Math.sin(a) * br * 0.92);
    }
    g.stroke();
    g.lineCap = 'butt';
    g.fillStyle = ballColor;
    g.beginPath();
    g.arc(bx, by, hub, 0, Math.PI * 2);
    g.fill();
    if (this.pop > 0) {
      g.globalAlpha = this.pop;
      g.fillStyle = pal.good;
      g.fill();
      g.globalAlpha = 1;
    }
    g.strokeStyle = pal.onAccent;
    g.lineWidth = Math.max(2, br * 0.13);
    g.beginPath();
    for (let k = 0; k < 2; k++) {
      const a = this.roll + (k * Math.PI) / 2;
      g.moveTo(bx + Math.cos(a) * hub * 0.78, by + Math.sin(a) * hub * 0.78);
      g.lineTo(bx - Math.cos(a) * hub * 0.78, by - Math.sin(a) * hub * 0.78);
    }
    g.stroke();

    // 이탈 시 방향 힌트
    if (!this.inZone && red > 0.25) {
      g.globalAlpha = Math.min(1, red);
      g.fillStyle = pal.bad;
      g.font = `800 ${Math.round(r * 0.9)}px ${pal.font}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const dir = this.slowSide ? 1 : -1;
      g.fillText(this.slowSide ? '›››' : '‹‹‹', bx + dir * (r * 2.1), by);
      g.globalAlpha = 1;
    }

    // 점수 피드백
    this.drawFloaters(trackHalf, -r * 2 - 6, r, glow);
    noGlow();
    g.globalAlpha = 1;
    g.restore();
  }

  // 점수 깃발 — 구역 한가운데를 지나는 순간이 그 점수에 닿은 때다. baseY = 깃대 아래 끝, topFor(big) = 깃대 위 끝
  drawFlags(ext, r, baseY, topFor, glow = () => {}, noGlow = () => {}) {
    const { g, W, pal } = this;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const first = Math.max(Band.MARK_EVERY, Math.ceil((this.dist - ext / Band.PX_PER_POINT) / Band.MARK_EVERY) * Band.MARK_EVERY);
    for (let m = first; (m - this.dist) * Band.PX_PER_POINT < ext; m += Band.MARK_EVERY) {
      const x = (m - this.dist) * Band.PX_PER_POINT;
      // 양옆의 시간·점수 표시와 겹치지 않게 가장자리에서는 사라진다
      const alpha = U.clamp((W / 2 - 170 - Math.abs(x)) / 100, 0, 1);
      if (alpha <= 0) continue;
      const big = m % Band.MARK_BIG === 0;
      const done = m <= this.dist;
      const pop = this.passed && this.passed.m === m ? Math.max(0, 1 - this.passed.t / Band.POP_SEC) : 0;
      const top = topFor(big);
      const fw = r * (big ? 1.25 : 0.9) * (1 + 0.5 * pop);
      const fh = fw * 0.8;
      g.globalAlpha = alpha;
      g.strokeStyle = g.fillStyle = done ? pal.good : big ? pal.accent : pal.ground;
      glow(g.fillStyle);
      g.lineWidth = big ? 4 : 3;
      g.beginPath();
      g.moveTo(x, baseY);
      g.lineTo(x, top);
      g.stroke();
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x + fw, top + fh / 2);
      g.lineTo(x, top + fh);
      g.fill();
      g.font = `800 ${Math.round(r * (big ? 0.7 : 0.55))}px ${pal.font}`;
      g.fillText(String(m), x + fw + 5, top + fh / 2);
    }
    g.globalAlpha = 1;
    noGlow();
  }

  // 정답 고리 — 공 뒤에서 퍼져 나간다 (y = 고리 중심 높이)
  drawRings(trackHalf, y, r) {
    const { g, pal } = this;
    for (const ring of this.rings) {
      const p = ring.t / Band.RING_SEC;
      g.globalAlpha = (1 - p) * 0.6;
      g.strokeStyle = pal.good;
      g.lineWidth = Math.max(1.5, r * 0.2 * (1 - p));
      g.beginPath();
      g.arc(ring.x * trackHalf, y, r * (1 + p * 2.8), 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  // 점수 피드백 — baseY 에서 튀어 올랐다가 사라진다
  // beside = { left, right, y, maxX }: 풍경 라이딩의 말풍선 양 끝과 가운데 높이. 그 위로 올라갈 자리가 위쪽 칩에 막히면(휴대폰)
  // 말풍선 옆에 띄운다 (오른쪽, 넘치면 왼쪽)
  drawFloaters(trackHalf, baseY, r, glow = () => {}, beside = null) {
    const { g, pal } = this;
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    const fontPx = Math.round(r * 0.95);
    const rise = 26;
    const cramped = beside && this.hudDepth(-fontPx, baseY - rise - fontPx * 1.3, fontPx, baseY) > 0;
    for (const f of this.floaters) {
      let fx = f.x * trackHalf;
      // 처음에 튕겨 오르고 끝에서 느려지게. 일정한 속도로 올라가면 흘러가는 느낌이 난다.
      const ease = 1 - Math.pow(1 - f.t, 3);
      let fy = baseY - ease * rise;
      if (cramped) {
        g.font = `800 ${fontPx}px ${pal.font}`;
        const w = g.measureText(f.text).width * 1.3;
        fx = beside.right + 10 + w / 2 + w / 2 <= beside.maxX ? beside.right + 10 + w / 2 : beside.left - 10 - w / 2;
        fy = beside.y + fontPx * 0.5 - ease * 8;
      }
      g.globalAlpha = f.t < 0.1 ? f.t / 0.1 : f.t < 0.5 ? 1 : 1 - (f.t - 0.5) / 0.5;
      g.fillStyle = pal[f.color] || f.color; // 'good' | 'warn' | 'bad' 또는 색 값
      glow(g.fillStyle);
      // 톡 튀어나왔다가 제 크기로 (만점 틱은 조금 더 크게)
      const s = (f.t < 0.1 ? 0.5 + 0.8 * (f.t / 0.1) : 1 + 0.3 * Math.max(0, 1 - (f.t - 0.1) / 0.15)) * (f.color === 'good' ? 1.05 : 0.9);
      g.font = `800 ${Math.round(r * 0.95)}px ${pal.font}`;
      g.save();
      g.translate(fx, fy);
      g.scale(s, s);
      g.fillText(f.text, 0, 0);
      g.restore();
    }
    g.shadowBlur = 0;
    g.globalAlpha = 1;
  }

  // ---------- 풍경 라이딩 (운영 버전 app/ 의 화면 스타일, look.scenic) ----------
  // 하늘과 언덕이 점수만큼 흘러가고(먼 것일수록 느리게) 길 위에서 자전거가 달린다. 공 대신 자전거 배지,
  // 허용 구역은 길 위의 초록 구간이다. 배지 위 말풍선이 RPM 과 할 일을 글로 알려 준다 (색만으로 알리지 않는다).
  // 라운드가 흐르는 동안 하루가 지나간다: 아침 → 한낮 → 늦은 오후 → 해 질 녘 (dayT 0~1).
  // 하늘은 위와 지평선 두 색. 파랑에서 주황으로 바로 섞으면 중간이 잿빛이 되어서, 위는 파랑 계열로 두고 지평선만 물든다
  skyAt(p) {
    const { pal } = this;
    const keys = [[0, pal.skyDawn, pal.skyDawnLow], [0.35, pal.sky, pal.skyLow], [0.72, pal.skyGolden, pal.skyGoldenLow], [1, pal.skyDusk, pal.skyDuskLow]];
    for (let i = 1; i < keys.length; i++) {
      if (p <= keys[i][0]) {
        const [p0, top0, low0] = keys[i - 1];
        const t = (p - p0) / (keys[i][0] - p0);
        return [mix(top0, keys[i][1], t), mix(low0, keys[i][2], t)];
      }
    }
    return [pal.skyDusk, pal.skyDuskLow];
  }

  // 가까운 언덕의 구간 (나무 칸 i 기준). 숲 → 과수원 → 마을 → 풍차 들판을 돈다.
  // 경계에서는 칸마다 조금씩 섞여서 다음 풍경이 오른쪽에서부터 차츰 들어온다
  static region(i) {
    const n = Math.floor((i + hash(i + 3) * 8) / Band.REGION_SLOTS);
    return ((n % 4) + 4) % 4;
  }

  drawScenic() {
    const { g, W, H, pal } = this;
    const { tolerance, maxDeviation } = this.cfg;
    g.clearRect(0, 0, W, H);
    const scroll = this.dist * Band.PX_PER_POINT;
    // tall: 속도 전환 구간에 카드가 화면 전체로 커지면 1. 카메라를 낮춰 길을 넓고 높게, 길 아래 풀밭을 보여 준다
    const tall = U.clamp((H - 340) / 320, 0, 1);
    const roadH = U.lerp(U.clamp(H * 0.2, 44, 96), H * 0.17, tall);
    const gy = U.lerp(H - roadH / 2 - Math.min(10, H * 0.03), H * 0.68, tall); // 길 한가운데 높이
    const roadTop = gy - roadH / 2;
    const r = U.clamp(H * 0.12, 14, 30 + Math.max(0, H - 320) * 0.035);
    const day = U.clamp(this.dayT || 0, 0, 1);
    const dusk = U.clamp((day - 0.6) / 0.4, 0, 1);

    // 하늘
    const [skyTop, skyLow] = this.skyAt(day);
    const sky = g.createLinearGradient(0, 0, 0, roadTop - H * 0.08);
    sky.addColorStop(0, skyTop);
    sky.addColorStop(1, skyLow);
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // 해: 낮은 곳에서 떠서 높이 지나 오른쪽 언덕 뒤로 진다. 왼쪽 위 시간 칩과 오른쪽 위 점수 칩 사이로 다닌다
    const sunR = U.clamp(H * 0.11, 18, 64) * (1 + 0.3 * dusk);
    const sx = W * U.lerp(0.46, 0.84, day);
    const sy = roadTop - U.lerp(H * 0.2, H * 0.62, Math.sin(Math.PI * U.lerp(0.12, 0.92, day)));
    g.fillStyle = mix(pal.sun, pal.sunDusk, dusk);
    g.beginPath();
    g.arc(sx, Math.max(sunR + 6, sy), sunR, 0, Math.PI * 2);
    g.fill();
    // 구름: 바람에 천천히 흐르고, 달릴수록 조금 더 빨리 지나간다
    const cloud = mix(pal.cloud, pal.cloudDusk, dusk);
    g.fillStyle = cloud;
    for (let k = 0; k < 4; k++) {
      const span = W + 360;
      const cxk = W + 180 - ((k * 397 + hash(k) * 200 + this.time * 7 + scroll * 0.05) % span);
      const cyk = H * (0.1 + 0.16 * hash(k + 11)) + roadTop * 0.1;
      const cs = U.clamp(H * 0.07, 12, 40) * (0.8 + 0.5 * hash(k + 5));
      g.globalAlpha = 0.85;
      g.beginPath();
      g.arc(cxk - cs, cyk, cs * 0.7, 0, Math.PI * 2);
      g.arc(cxk, cyk - cs * 0.35, cs, 0, Math.PI * 2);
      g.arc(cxk + cs * 1.1, cyk, cs * 0.75, 0, Math.PI * 2);
      g.roundRect(cxk - cs * 1.7, cyk - cs * 0.1, cs * 3.6, cs * 0.75, cs * 0.37);
      g.fill();
    }
    g.globalAlpha = 1;

    // 언덕: 사인 둘을 겹친 능선. off 만큼 흘러간다 (먼 것일수록 느리게)
    const ridge = (base, amp, off, k1, k2) => (x) => base + amp * (0.6 * Math.sin((x + off) * k1) + 0.4 * Math.sin((x + off) * k2 + 1.3));
    const hill = (fy, color) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, fy(x));
      g.lineTo(W + 8, H);
      g.closePath();
      g.fill();
    };
    hill(ridge(roadTop - H * 0.24, H * 0.07, scroll * 0.12, 0.0042, 0.011), pal.hillFar);
    const nearOff = scroll * 0.35;
    const near = ridge(roadTop - H * 0.08, H * 0.045, nearOff, 0.006, 0.017);
    hill(near, pal.hillNear);
    // 가까운 언덕 위의 풍경 (칸마다 정해진 무작위로 있거나 없고, 구간에 따라 종류가 바뀐다)
    const sp = 150;
    const size = U.clamp(H * 0.1, 14, 60);
    for (let i = Math.floor((nearOff - 160) / sp); i * sp - nearOff < W + 100; i++) {
      const reg = Band.region(i);
      if (hash(i) < [0.45, 0.22, 0.28, 0.35][reg]) continue; // 구간마다 빽빽한 정도가 다르다
      const x = i * sp - nearOff + hash(i + 99) * 60;
      const th = size * (0.75 + 0.5 * hash(i + 7));
      const y = near(x) + th * 0.15;
      const pick = hash(i + 31);
      if (reg === 0) drawPine(this, x, y, th);
      else if (reg === 1) drawRoundTree(this, x, y, th, pick > 0.5);
      else if (reg === 2) pick > 0.35 ? drawHouse(this, x, y, th, pick) : drawRoundTree(this, x, y, th, false);
      else pick > 0.45 ? drawWindmill(this, x, y, th * 1.35, i) : drawFlowerPatch(this, x, y, th, i);
    }
    // 해 질 녘에는 풍경 전체가 노을빛으로 물든다 (길과 자전거는 그대로 또렷하게)
    if (dusk > 0) {
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = 0.4 * dusk;
      g.fillStyle = pal.duskTint;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }

    let cx = W / 2;
    const ext = W;
    let trackHalf = Math.max(120, W / 2 - 230);
    // 좁은 화면(휴대폰)에서는 트랙 끝이 오른쪽 아래 '그만하기' 단추 밑으로 들어간다. 자전거가 단추 높이에 있으면
    // 트랙을 단추 왼쪽 자리에 맞게 줄이고 옮긴다 (카드가 커져 길이 단추보다 위로 가거나 단추가 숨으면 제자리로 미끄러져 돌아온다)
    const end = this.endRect;
    const reach = r + 6;
    const bikeY = gy - roadH * 0.12;
    this.dodgeTo = end && !this.brainOnly && bikeY + reach > end.top && bikeY - reach < end.bottom && cx + trackHalf + reach > end.left ? 1 : 0;
    if (this.dodge == null) this.dodge = this.dodgeTo;
    if (end && this.dodge > 0.001) {
      const half = Math.min(trackHalf, Math.max(60, (end.left - 2 * reach) / 2));
      trackHalf = U.lerp(trackHalf, half, this.dodge);
      cx = U.lerp(cx, Math.min(cx, reach + half), this.dodge);
    }
    const zoneHalf = trackHalf * (tolerance / maxDeviation);
    g.save();
    g.translate(cx, gy);
    g.rotate(-this.theta);

    // 길과 그 아래 풀밭 (기울어도 아래가 비지 않게 넉넉히)
    g.fillStyle = pal.grass;
    g.fillRect(-ext, roadH / 2, ext * 2, H);
    // 길 아래에 자리가 넉넉하면(속도 전환 구간) 길가의 꽃과 덤불이 가장 빨리 지나간다
    const below = H - gy - roadH / 2;
    if (below > 40) drawRoadside(this, ext, roadH / 2, below, scroll * 1.25, U.clamp((below - 40) / 80, 0, 1));
    // 길 건너편의 낮은 언덕 (길과 함께 기울고 점수만큼 흘러간다). 입체 언덕의 앞쪽 비탈을 보는 것으로 여긴다:
    // 기념물(마을)은 그 앞 비탈, 꼭대기보다 아래·길보다 위에 선다. 언덕을 먼저 그리고 기념물을 그 앞에 그려 가려지지 않는다.
    // 꼭대기는 길 윗선에서 verge × 0.9 ~ 2.0 위, 밑동은 verge × 0.45 위라 건물 아랫부분 뒤로 늘 언덕 비탈이 보인다
    const verge = U.clamp(r * 0.85, 10, 32);
    const crest = (x) => -roadH / 2 - verge * (1.45 + 0.35 * Math.sin((x + scroll) * 0.009) + 0.2 * Math.sin((x + scroll) * 0.023 + 1.7));
    drawRoadsideHill(this, ext, -roadH / 2, crest, verge);
    this.drawLandmarks(this.landmarkItems(r, ext), r, -roadH / 2 - verge * 0.45);
    // 점수 깃발도 같은 비탈에 똑바로 (기념물 앞에 그려 가려지지 않게)
    this.drawScenicFlags(ext, r, -roadH / 2 - verge * 0.45);
    g.fillStyle = pal.road;
    g.fillRect(-ext, -roadH / 2, ext * 2, roadH);
    g.fillStyle = pal.roadEdge;
    g.fillRect(-ext, -roadH / 2, ext * 2, Math.max(2, roadH * 0.06));
    g.fillRect(-ext, roadH / 2 - Math.max(2, roadH * 0.06), ext * 2, Math.max(2, roadH * 0.06) * tall);
    // 흘러가는 차선
    const dash = U.clamp(roadH * 0.6, 24, 44);
    const period = dash * 1.7;
    const lh = Math.max(3, roadH * 0.07);
    g.fillStyle = pal.roadMark;
    for (let x = -ext - (scroll % period); x < ext; x += period) g.fillRect(x, roadH * 0.24 - lh / 2, dash, lh);

    // 허용 구역: 길 위의 초록 구간과 양옆 점선 기둥 (두뇌 게임만 하는 판에는 없다)
    const gateTop = -roadH / 2 - r * 1.3;
    if (!this.brainOnly) {
      g.globalAlpha = 0.6;
      g.fillStyle = pal.zone;
      g.fillRect(-zoneHalf, -roadH / 2, zoneHalf * 2, roadH);
      g.globalAlpha = 1;
      g.strokeStyle = pal.panel;
      g.lineWidth = Math.max(3, r * 0.12);
      g.setLineDash([8, 6]);
      g.beginPath();
      g.moveTo(-zoneHalf, gateTop);
      g.lineTo(-zoneHalf, roadH / 2);
      g.moveTo(zoneHalf, gateTop);
      g.lineTo(zoneHalf, roadH / 2);
      g.stroke();
      g.setLineDash([]);
    }

    // 자전거 배지 (정답 직후에는 잠깐 커지면서 초록으로 물든다). 나무를 심을 때는 앞으로 비켜 간다
    const shift = this.endShift * this.endShift * (3 - 2 * this.endShift);
    const bx = this.ballX * trackHalf + shift * Math.min(trackHalf * 0.6, W * 0.22);
    const br = r * (1 + 0.25 * this.pop);
    const by = -roadH * 0.12;
    this.drawRings(trackHalf, by, r);
    const fs = Math.round(U.clamp(r * 0.62, 13, 30));
    if (this.brainOnly) {
      // 두뇌 배지만. 말풍선(RPM)과 '여기에 맞춰 달려요' 없이, 알림(최고 기록 등)은 말풍선이 있던 자리 위에 뜬다
      drawBrainBadge(this, bx, by, br);
      this.drawFloaters(trackHalf, by - r - fs * 0.6 - Math.round(fs * 1.9) - 4, r);
      g.restore();
      return;
    }
    g.fillStyle = pal.panel;
    g.beginPath();
    g.arc(bx, by, br, 0, Math.PI * 2);
    g.fill();
    if (this.pop > 0) {
      g.globalAlpha = this.pop;
      g.fillStyle = pal.goodSoft;
      g.fill();
      g.globalAlpha = 1;
    }
    g.lineWidth = Math.max(3, br * 0.15);
    g.strokeStyle = this.inZone ? pal.accent : pal.warn;
    g.stroke();
    drawBike(this, bx, by, br);

    // 말풍선: RPM 과 할 일
    const tip = this.inZone ? '좋아요' : this.slowSide ? '더 빠르게 ›' : '‹ 조금 천천히';
    const t1 = `${Math.round(this.rpm)} rpm`;
    g.font = `900 ${fs}px ${pal.font}`;
    const w1 = g.measureText(t1).width;
    g.font = `700 ${fs}px ${pal.fontText}`;
    const w2 = g.measureText(tip).width;
    const padX = fs * 0.8;
    const gapX = fs * 0.55;
    const ph = Math.round(fs * 1.9);
    const pw = padX * 2 + w1 + gapX + w2;
    const px = U.clamp(bx, -cx + pw / 2 + 12, W - cx - pw / 2 - 12);
    const pyTop = by - r - fs * 0.6 - ph; // 배지가 커져도 말풍선은 제자리
    g.globalAlpha = 1 - this.endShift;
    g.fillStyle = pal.ink;
    g.beginPath();
    g.roundRect(px - pw / 2, pyTop, pw, ph, ph / 2);
    g.fill();
    const tx = U.clamp(bx, px - pw / 2 + ph / 2, px + pw / 2 - ph / 2);
    g.beginPath();
    g.moveTo(tx - fs * 0.45, pyTop + ph - 1);
    g.lineTo(tx, pyTop + ph + fs * 0.45);
    g.lineTo(tx + fs * 0.45, pyTop + ph - 1);
    g.fill();
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = pal.onAccent;
    g.font = `900 ${fs}px ${pal.font}`;
    g.fillText(t1, px - pw / 2 + padX, pyTop + ph / 2 + 1);
    g.fillStyle = this.inZone ? pal.tipGood : pal.tipWarn;
    g.font = `700 ${fs}px ${pal.fontText}`;
    g.fillText(tip, px - pw / 2 + padX + w1 + gapX, pyTop + ph / 2 + 1);
    g.globalAlpha = 1;

    // 구역 밖에 있을 때만 구역 위에 '여기에 맞춰 달려요' 표지 (말풍선보다 위에 두어 겹치지 않게).
    // 속도 전환 구간에는 안내 카드가 같은 말을 하므로 숨긴다
    const la = U.clamp(this.outAmount * 2, 0, 1) * (1 - tall);
    if (la > 0) {
      const text = '여기에 맞춰 달려요';
      g.font = `700 ${fs}px ${pal.fontText}`;
      const lw = g.measureText(text).width + fs * 1.4;
      const lh2 = Math.round(fs * 1.7);
      // 위쪽 칩 밑으로 들어가면 그만큼 내린다 (휴대폰: 칩과 말풍선 사이가 좁다)
      let ly = pyTop - lh2 - 8;
      ly += this.hudDepth(-lw / 2, ly, lw / 2, ly + lh2) + (this.hudDepth(-lw / 2, ly, lw / 2, ly + lh2) ? 2 : 0);
      g.globalAlpha = la;
      g.fillStyle = pal.panel;
      g.beginPath();
      g.roundRect(-lw / 2, ly, lw, lh2, lh2 / 2);
      g.fill();
      g.fillStyle = pal.ink;
      g.textAlign = 'center';
      g.fillText(text, 0, ly + lh2 / 2 + 1);
      g.globalAlpha = 1;
    }

    this.drawFloaters(trackHalf, pyTop - 4, r, undefined, { left: px - pw / 2, right: px + pw / 2, y: pyTop + ph / 2, maxX: W - cx - 8 });
    g.restore();
  }

  // ----- 기념물 -----
  // 화면 근처의 기념물과 그 터 [L, R] (밑면 + 팻말). 길가 언덕 앞 비탈에 그린다
  landmarkItems(r, ext) {
    const { g, W, pal } = this;
    const h = r * 1.8;
    const at = (score) => (score - this.dist) * Band.PX_PER_POINT;
    // 양옆의 시간·점수 표시와 겹치지 않게 가장자리에서는 사라진다 (깃발과 같은 규칙)
    const fade = (x) => U.clamp((W / 2 - 170 - Math.abs(x)) / 100, 0, 1);
    // 날짜 팻말은 곧 지나갈 기념물 하나에만: 자전거 조금 앞(ahead, 가운데 말풍선에 가리지 않는 자리)에 가장 가까운 것.
    // 다가오면 나타났다가 자전거에 닿기 전에 사라진다.
    // 비슷한 점수가 모여 마을이 되면 팻말이 건물 사이에 빽빽하게 끼어 어수선했다 (2026-11-05)
    const ahead = Math.max(120, W / 2 - 230) * 0.55;
    let near = null;
    for (const lm of this.landmarks) {
      const d = Math.abs(at(lm.score) - ahead);
      if (lm.tag && (!near || d < near.d)) near = { lm, d };
    }
    const tagAlpha = near ? U.clamp(1 - (near.d - h * 0.6) / (h * 1.2), 0, 1) : 0;
    const fs = Math.round(U.clamp(r * 0.42, 10, 18));
    g.font = `800 ${fs}px ${pal.font}`;
    const items = [];
    const add = (lm, x, tag, extra) => {
      const fp = footprint(lm.kind, lm.size, h);
      const tw = tag ? g.measureText(tag).width + fs * 0.7 : 0;
      const R = tag ? fp.sign + h * 0.06 + tw : fp.body;
      items.push({ lm, x, tag, L: x - fp.body - h * 0.12, R: x + R + h * 0.12, ...extra });
    };
    for (const lm of this.landmarks) {
      const x = at(lm.score);
      if (Math.abs(x) > ext + h * 2) continue;
      const alpha = fade(x);
      const showTag = alpha > 0 && tagAlpha > 0 && near.lm === lm;
      add(lm, x, showTag ? lm.tag : '', { alpha, tagAlpha: showTag ? tagAlpha : 0 });
    }
    if (this.planting) add(this.planting, at(this.planting.score), '오늘', { planting: true, alpha: 1 });
    return items;
  }

  // 풍경 라이딩의 점수 깃발: 기념물처럼 길가 언덕 앞 비탈(baseY)에 똑바로 선 동화책 풍 깃발.
  // 나무 깃대 + 금색 꼭지, 바람에 흔들리는 천(제 색을 조금 어둡게 한 윤곽), 밑에 옅은 그림자, 옆에 점수 (밝은 테두리로 언덕 위에서도 읽힌다).
  // 색: 아직 안 지난 깃발은 크림색, 1000점마다 큰 깃발은 강조색, 지난 깃발은 금색 (초록은 언덕에 묻힌다). 지나는 순간 커졌다 돌아온다
  drawScenicFlags(ext, r, baseY) {
    const { g, W, pal } = this;
    const tone = (c) => mix(c, '#3a2a20', 0.3);
    const first = Math.max(Band.MARK_EVERY, Math.ceil((this.dist - ext / Band.PX_PER_POINT) / Band.MARK_EVERY) * Band.MARK_EVERY);
    for (let m = first; (m - this.dist) * Band.PX_PER_POINT < ext; m += Band.MARK_EVERY) {
      const x = (m - this.dist) * Band.PX_PER_POINT;
      // 양옆의 시간·점수 표시와 겹치지 않게 가장자리에서는 사라진다
      const alpha = U.clamp((W / 2 - 170 - Math.abs(x)) / 100, 0, 1);
      if (alpha <= 0) continue;
      const big = m % Band.MARK_BIG === 0;
      const done = m <= this.dist;
      const pop = this.passed && this.passed.m === m ? Math.max(0, 1 - this.passed.t / Band.POP_SEC) : 0;
      const s = 1 + 0.35 * pop;
      const ph = r * (big ? 2.2 : 1.65) * s;          // 깃대 높이
      const fw = r * (big ? 1.25 : 0.9) * s;           // 천 너비
      const fh = fw * 0.72;
      const cloth = done ? '#f5b301' : big ? pal.accent : '#fff4dc';
      const lw = Math.max(1.2, r * 0.07);
      g.save();
      g.globalAlpha = alpha;
      g.translate(x, baseY);
      g.rotate(this.theta);
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.fillStyle = 'rgba(30, 60, 35, 0.22)';
      g.beginPath();
      g.ellipse(r * 0.08, 0, r * 0.32, r * 0.09, 0, 0, Math.PI * 2);
      g.fill();
      // 깃대
      g.strokeStyle = tone(pal.trunk);
      g.lineWidth = lw * 2.4;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -ph);
      g.stroke();
      g.strokeStyle = pal.trunk;
      g.lineWidth = lw * 1.3;
      g.stroke();
      // 천: 깃대에서 펄럭이며 끝이 두 갈래
      const top = -ph + r * 0.12;
      const wv = Math.sin(this.time * 3 + m * 0.01) * fh * 0.12;
      g.beginPath();
      g.moveTo(0, top);
      g.quadraticCurveTo(fw * 0.5, top - fh * 0.12 + wv, fw, top + wv);
      g.lineTo(fw * 0.78, top + fh * 0.5 + wv);
      g.lineTo(fw, top + fh + wv);
      g.quadraticCurveTo(fw * 0.5, top + fh * 0.88 + wv, 0, top + fh);
      g.closePath();
      g.fillStyle = cloth;
      g.fill();
      g.strokeStyle = tone(cloth);
      g.lineWidth = lw;
      g.stroke();
      // 꼭지
      g.fillStyle = '#f5d36b';
      g.beginPath();
      g.arc(0, -ph, lw * 1.6, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = tone('#f5d36b');
      g.stroke();
      // 점수
      g.font = `800 ${Math.round(r * (big ? 0.7 : 0.55) * s)}px ${pal.font}`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      const tx = fw + r * 0.18;
      const ty = top + fh / 2 + wv;
      g.lineWidth = Math.max(2.5, r * 0.14);
      g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      g.strokeText(String(m), tx, ty);
      g.fillStyle = done ? tone('#f5b301') : big ? pal.accent : pal.ink;
      g.fillText(String(m), tx, ty);
      g.restore();
    }
  }

  // items = landmarkItems, baseY = 밑동 높이 (길가 언덕의 앞 비탈, 길 윗선에서 조금 위). 화면 가운데가 지금 점수 자리다
  drawLandmarks(items, r, baseY) {
    const { g, pal } = this;
    const h = r * 1.8;
    let p = null;
    for (const it of items) {
      if (it.planting) {
        p = it;
        continue;
      }
      if (it.alpha <= 0) continue;
      g.globalAlpha = it.alpha;
      drawLandmark(this, it.lm, it.x, baseY, h * (1 + 0.35 * it.lm.pop), '', r);
    }
    // 날짜 팻말은 모든 건물 위에 (이웃 건물에 가려지지 않게)
    for (const it of items) {
      if (!it.tag || it.planting || it.alpha <= 0) continue;
      g.globalAlpha = it.alpha * it.tagAlpha;
      const hh = h * (1 + 0.35 * it.lm.pop);
      g.save();
      g.translate(it.x, baseY);
      g.rotate(this.theta);
      drawSign(this, it.lm, hh, it.tag, r);
      g.restore();
    }
    g.globalAlpha = 1;
    if (!p) return;
    const x = p.x;
    p = this.planting;
    // 짓기 연출 (Band.BUILD_*): 풍경이 커지고 자전거가 비켜 간 뒤 → 터(흙)를 고르고 → 층마다 한 단계씩 아래부터 쌓아 올리고
    // (단계마다 통통 튀며 흙먼지) → 지붕까지 올리면 반짝이며 '오늘' 팻말과 이름표가 바뀐다
    const k = p.t - Band.BUILD_DELAY;
    if (k <= 0) return;
    const full = heightOf(p.kind, p.size, h);
    // 터: 흙 둔덕
    const m = U.clamp(k / 0.3, 0, 1);
    g.fillStyle = pal.trunk;
    g.beginPath();
    g.ellipse(x, baseY, h * 0.5 * m, h * 0.1 * m, 0, Math.PI, 0);
    g.fill();
    const s = (k - Band.BUILD_LEAD) / Band.BUILD_STEP; // 지금 몇 번째 단계인가 (소수)
    const c1 = 1.70158;
    const back = (u) => 1 + (c1 + 1) * (u - 1) ** 3 + c1 * (u - 1) ** 2; // 살짝 넘쳤다 돌아오는 증가
    // 단계가 시작할 때마다 밑동에서 흙먼지
    if (s > 0 && s < p.steps + 0.6) {
      const dk = s - Math.floor(s);
      g.fillStyle = '#d8d2c4';
      g.globalAlpha = 0.75 * (1 - dk);
      for (const sd of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.arc(x + sd * h * (0.4 + dk * 0.45 + i * 0.12), baseY - h * (0.04 + i * 0.07 + dk * 0.1), h * (0.06 + dk * 0.06), 0, Math.PI * 2);
          g.fill();
        }
      }
      g.globalAlpha = 1;
    }
    const done = p.t >= p.doneAt;
    if (s > 0) {
      if (Landmarks.isBuilding(p.kind)) {
        // 아래부터 단계만큼 드러낸다 (단계마다 톡 튀어 오른다)
        const step = Math.min(Math.floor(s), p.steps - 1);
        const u = U.clamp((s - step) / 0.75, 0, 1); // 한 단계의 앞 3/4 동안 올라간다
        const reveal = done ? 1 : (step + back(u)) / p.steps;
        g.save();
        g.translate(x, baseY);
        g.rotate(this.theta);
        g.beginPath();
        g.rect(-h * 3, -full * Math.min(1.08, reveal) - h * 0.05, h * 6, full * Math.min(1.08, reveal) + h * 0.3);
        g.restore();
        g.save();
        g.clip();
        drawLandmark(this, p, x, baseY, h, '', r);
        g.restore();
        if (done) {
          g.save();
          g.translate(x, baseY);
          g.rotate(this.theta);
          drawSign(this, p, h, '오늘', r);
          g.restore();
        }
      } else {
        // 바람개비·풍선·돌탑: 한 번에 톡 솟는다
        const grow = back(U.clamp(s, 0, 1));
        if (grow > 0.02) drawLandmark(this, p, x, baseY, h * grow, done ? '오늘' : '', r);
      }
    }
    // 다 지은 순간 반짝임
    const sk = (p.t - p.doneAt) / 1.25;
    if (sk > 0 && sk < 1) {
      g.fillStyle = pal.sun;
      for (let i = 0; i < 8; i++) {
        const ang = -Math.PI / 2 + (i - 3.5) * 0.42;
        const d = h * (0.6 + sk * 1.0);
        g.globalAlpha = 1 - sk;
        g.beginPath();
        g.arc(x + Math.cos(ang) * d, baseY - full * 0.55 + Math.sin(ang) * d * 0.7, Math.max(2, r * 0.12) * (1 - sk * 0.5), 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
    // 이름표: 짓는 동안 '오늘 기록으로 짓는 중…', 다 지으면 'N번째 기록 · 집을 지었어요'. 다 지은 높이 위에 미리 자리를 잡아 움직이지 않는다
    if (p.label) {
      const text = done ? p.label : '오늘 기록으로 짓는 중…';
      const fs = Math.round(U.clamp(r * 0.6, 13, 26));
      g.font = `700 ${fs}px ${pal.fontText}`;
      const tw = g.measureText(text).width + fs * 1.4;
      const th = Math.round(fs * 1.75);
      const ty = -full - th - 10;
      const pop = done ? Math.max(0, 1 - (p.t - p.doneAt) / 0.35) : 0;
      g.save();
      g.translate(x, baseY);
      g.rotate(this.theta);
      // 카드가 다시 줄어 이름표가 위쪽 칩 밑으로 들어가면 흐려 지운다 (휴대폰: 칩이 가로를 다 차지한다)
      const hidden = U.clamp(this.hudDepth(-tw / 2, ty, tw / 2, ty + th) / 16, 0, 1);
      g.globalAlpha = U.clamp(k / 0.3, 0, 1) * (1 - hidden);
      g.translate(0, ty + th / 2);
      g.scale(1 + 0.15 * pop, 1 + 0.15 * pop);
      g.fillStyle = done ? pal.ink : 'rgba(29, 43, 36, 0.78)';
      g.beginPath();
      g.roundRect(-tw / 2, -th / 2, tw, th, th / 2);
      g.fill();
      g.fillStyle = pal.onAccent;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 0, 1);
      g.restore();
    }
  }

  // ----- 풍경 소품. (x, y) = 밑동, h = 크기 -----
}
