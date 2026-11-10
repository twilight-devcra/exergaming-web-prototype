// 상단 1/4 영역: 평지를 구르는 공으로 페달링 속도를 시각화.
// 속도 전환 구간에는 같은 캔버스가 화면 전체로 커진다 (크기에 맞춰 공과 구역도 조금 커진다).
// 지면은 페달 속도가 아니라 점수만큼 흘러간다. 초록 구역 안에서는 꾸준히 나아가고, 벗어나면 느려지다 멈추며,
// 인지 게임을 맞히면 한꺼번에 쭉 나아간다. 일정 점수마다 깃발이 서 있어 점수가 '달린 거리'로 보인다.
import { U } from './config.js';

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
    // 기념물 (풍경 라이딩, 운영 버전의 회원): 지난 세션마다 그 최종 점수 자리에 하나씩 서 있다 (Band.LANDMARKS).
    // 점수가 오르면 자전거가 지난 기록들을 지나가고, 비슷한 점수로 여러 번 하면 그 자리에 모인다. 라운드가 끝나면 이번 점수 자리에 세운다
    this.landmarks = [];    // [{ score, seed, best, pop, tag, kind, size }] 점수 순. tag = 팻말 글자 (날짜)
    this.onLandmark = null; // (lm) 지난 기념물을 지나는 순간
    this.planting = null;   // 라운드 끝에 세우는 기념물 { score, t, label, seed, kind, size }
    this.endShift = 0;      // 나무를 심을 때 자전거가 앞으로 비켜 가는 정도 0~1
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
    this.landmarks.forEach((lm) => (lm.pop = 0));
  }

  // 기념물 종류는 세션 난이도로, 크기는 세션 길이로 정한다 (5분 0 · 10분 1 · 15분 2).
  // village (기본): 집 · 가게 · 탑. 크기 = 층수 1~3. 같은 점수대에 여러 번 하면 마을이 생긴다. 벽·지붕 색은 세션마다 다르다
  // objects: 바람개비(페달 속도로 돈다) · 풍선(수 1~3, 흔들린다) · 돌탑(돌 3~5). 주소에 ?marks=objects 로 비교해 본다
  static LANDMARK_SETS = {
    village: {
      relax: { kind: 'cottage', verb: '집을 지었어요' },
      normal: { kind: 'shop', verb: '가게를 열었어요' },
      challenge: { kind: 'tower', verb: '탑을 세웠어요' },
    },
    objects: {
      relax: { kind: 'pinwheel', verb: '바람개비를 꽂았어요' },
      normal: { kind: 'balloon', verb: '풍선을 달았어요' },
      challenge: { kind: 'cairn', verb: '돌탑을 쌓았어요' },
    },
  };
  static get LANDMARKS() {
    const q = new URLSearchParams(location.search).get('marks');
    return Band.LANDMARK_SETS[q] || Band.LANDMARK_SETS.village;
  }
  static LM_COLORS = ['#e5484d', '#f5b301', '#2f6fed', '#e93d82', '#12a594'];
  static WALLS = ['#fff1d6', '#ffe0c7', '#f9d8df', '#dfeef8', '#e7f1d4'];
  static ROOFS = ['#e2574c', '#4a7fd4', '#f09a2c', '#2fae94', '#9b62c9'];

  static landmarkOf(difficulty, min) {
    const L = Band.LANDMARKS[difficulty] || Band.LANDMARKS.normal;
    const size = !(min > 0) ? 1 : min <= 7 ? 0 : min <= 12 ? 1 : 2;
    return { ...L, size };
  }

  // 기념물의 생김새 { kind, size, seed, wall, roof }. 세울 때 정해 세션과 함께 저장하고(회원 기록 look, 세션 로그 meta.landmark),
  // 다음 라운드부터는 저장한 그대로 그린다 — 종류 표·색 목록을 나중에 고쳐도 이미 세운 건물은 바뀌지 않게 색은 값으로 적는다.
  // seed 는 색 말고도 창가 꽃 색, 탑 돌무늬, 연기·깃발 박자 같은 작은 차이를 정한다
  static lookOf(kind, size, seed) {
    return { v: 1, kind, size, seed, wall: Band.WALLS[seed % Band.WALLS.length], roof: Band.ROOFS[(seed * 3 + 1) % Band.ROOFS.length] };
  }

  // 지난 세션들 [{ score, key, at, difficulty, min, look }] (at = 날짜 → 팻말). look 이 있으면 그대로,
  // 없으면(생김새를 저장하기 전 기록) 난이도·시간과 key(세션마다 다른 값)로 정한다. 가장 높은 점수의 기념물에는 별을 단다
  setLandmarks(list) {
    const seedOf = (k) => [...String(k)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 100003, 7);
    const tagOf = (at) => {
      const d = new Date(at);
      return isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
    };
    const lms = (list || []).filter((x) => x.score > 0).map((x) => {
      let look = x.look && x.look.kind ? x.look : null;
      if (!look) {
        const { kind, size } = Band.landmarkOf(x.difficulty, x.min);
        look = Band.lookOf(kind, size, seedOf(x.key));
      }
      const { kind, size, seed, wall, roof } = look;
      return { score: x.score, best: false, pop: 0, tag: tagOf(x.at), kind, size, seed: seed || 0, wall, roof };
    });
    lms.sort((a, b) => a.score - b.score);
    if (lms.length) lms[lms.length - 1].best = true;
    this.landmarks = lms;
  }

  // 라운드 끝: 이번 점수 자리에 기념물을 세운다 (main.js 의 마무리 화면). 자전거는 앞으로 비켜 가며 멈춘다.
  // info = { n: 이 회원의 몇 번째 기록인가, difficulty, min }. 돌려주는 값 = 생김새 (main.js 가 세션 로그에 적는다)
  plant(score, { n = 1, difficulty, min } = {}) {
    const { kind, size, verb } = Band.landmarkOf(difficulty, min);
    const label = `${n === 1 ? '첫' : `${n}번째`} 기록 · ${verb}`;
    const look = Band.lookOf(kind, size, Math.floor(Math.random() * 100000));
    // 짓는 단계: 건물은 층마다 한 단계 + 지붕 (그 밖의 기념물은 한 번에)
    const steps = Band.isBuilding(kind) ? size + 2 : 1;
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
  static isBuilding(kind) {
    return kind === 'cottage' || kind === 'shop' || kind === 'tower';
  }

  // 기념물 전체 높이 어림 (밑동에서 지붕·깃발 끝까지). 짓는 동안 아래부터 보이게 자르고 이름표 자리를 미리 잡는 데 쓴다
  static heightOf(kind, size, h) {
    const f = size + 1;
    if (kind === 'cottage') return h * (0.44 * f + 0.55);
    if (kind === 'shop') return h * (0.44 * f + 0.24);
    if (kind === 'tower') return h * (0.44 * (f + 0.55) + 1.0);
    return h * 1.6;
  }

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

    // 허용 구역
    const red = this.outAmount;
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
  drawFloaters(trackHalf, baseY, r, glow = () => {}) {
    const { g, pal } = this;
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    for (const f of this.floaters) {
      const fx = f.x * trackHalf;
      // 처음에 튕겨 오르고 끝에서 느려지게. 일정한 속도로 올라가면 흘러가는 느낌이 난다.
      const fy = baseY - (1 - Math.pow(1 - f.t, 3)) * 26;
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
  static hash(i) {
    const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  // '#rrggbb' 두 색을 t 만큼 섞는다
  static mix(a, b, t) {
    const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const [x, y] = [p(a), p(b)];
    return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
  }

  // 라운드가 흐르는 동안 하루가 지나간다: 아침 → 한낮 → 늦은 오후 → 해 질 녘 (dayT 0~1).
  // 하늘은 위와 지평선 두 색. 파랑에서 주황으로 바로 섞으면 중간이 잿빛이 되어서, 위는 파랑 계열로 두고 지평선만 물든다
  skyAt(p) {
    const { pal } = this;
    const keys = [[0, pal.skyDawn, pal.skyDawnLow], [0.35, pal.sky, pal.skyLow], [0.72, pal.skyGolden, pal.skyGoldenLow], [1, pal.skyDusk, pal.skyDuskLow]];
    for (let i = 1; i < keys.length; i++) {
      if (p <= keys[i][0]) {
        const [p0, top0, low0] = keys[i - 1];
        const t = (p - p0) / (keys[i][0] - p0);
        return [Band.mix(top0, keys[i][1], t), Band.mix(low0, keys[i][2], t)];
      }
    }
    return [pal.skyDusk, pal.skyDuskLow];
  }

  // 가까운 언덕의 구간 (나무 칸 i 기준). 숲 → 과수원 → 마을 → 풍차 들판을 돈다.
  // 경계에서는 칸마다 조금씩 섞여서 다음 풍경이 오른쪽에서부터 차츰 들어온다
  static region(i) {
    const n = Math.floor((i + Band.hash(i + 3) * 8) / Band.REGION_SLOTS);
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
    g.fillStyle = Band.mix(pal.sun, pal.sunDusk, dusk);
    g.beginPath();
    g.arc(sx, Math.max(sunR + 6, sy), sunR, 0, Math.PI * 2);
    g.fill();
    // 구름: 바람에 천천히 흐르고, 달릴수록 조금 더 빨리 지나간다
    const cloud = Band.mix(pal.cloud, pal.cloudDusk, dusk);
    g.fillStyle = cloud;
    for (let k = 0; k < 4; k++) {
      const span = W + 360;
      const cxk = W + 180 - ((k * 397 + Band.hash(k) * 200 + this.time * 7 + scroll * 0.05) % span);
      const cyk = H * (0.1 + 0.16 * Band.hash(k + 11)) + roadTop * 0.1;
      const cs = U.clamp(H * 0.07, 12, 40) * (0.8 + 0.5 * Band.hash(k + 5));
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
      if (Band.hash(i) < [0.45, 0.22, 0.28, 0.35][reg]) continue; // 구간마다 빽빽한 정도가 다르다
      const x = i * sp - nearOff + Band.hash(i + 99) * 60;
      const th = size * (0.75 + 0.5 * Band.hash(i + 7));
      const y = near(x) + th * 0.15;
      const pick = Band.hash(i + 31);
      if (reg === 0) this.drawPine(x, y, th);
      else if (reg === 1) this.drawRoundTree(x, y, th, pick > 0.5);
      else if (reg === 2) pick > 0.35 ? this.drawHouse(x, y, th, pick) : this.drawRoundTree(x, y, th, false);
      else pick > 0.45 ? this.drawWindmill(x, y, th * 1.35, i) : this.drawFlowerPatch(x, y, th, i);
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

    const cx = W / 2;
    const ext = W;
    const trackHalf = Math.max(120, W / 2 - 230);
    const zoneHalf = trackHalf * (tolerance / maxDeviation);
    g.save();
    g.translate(cx, gy);
    g.rotate(-this.theta);

    // 길과 그 아래 풀밭 (기울어도 아래가 비지 않게 넉넉히)
    g.fillStyle = pal.grass;
    g.fillRect(-ext, roadH / 2, ext * 2, H);
    // 길 아래에 자리가 넉넉하면(속도 전환 구간) 길가의 꽃과 덤불이 가장 빨리 지나간다
    const below = H - gy - roadH / 2;
    if (below > 40) this.drawRoadside(ext, roadH / 2, below, scroll * 1.25, U.clamp((below - 40) / 80, 0, 1));
    // 길 건너편의 낮은 언덕 (길과 함께 기울고 점수만큼 흘러간다). 입체 언덕의 앞쪽 비탈을 보는 것으로 여긴다:
    // 기념물(마을)은 그 앞 비탈, 꼭대기보다 아래·길보다 위에 선다. 언덕을 먼저 그리고 기념물을 그 앞에 그려 가려지지 않는다.
    // 꼭대기는 길 윗선에서 verge × 0.9 ~ 2.0 위, 밑동은 verge × 0.45 위라 건물 아랫부분 뒤로 늘 언덕 비탈이 보인다
    const verge = U.clamp(r * 0.85, 10, 32);
    const crest = (x) => -roadH / 2 - verge * (1.45 + 0.35 * Math.sin((x + scroll) * 0.009) + 0.2 * Math.sin((x + scroll) * 0.023 + 1.7));
    this.drawRoadsideHill(ext, -roadH / 2, crest, verge);
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

    // 허용 구역: 길 위의 초록 구간과 양옆 점선 기둥
    const gateTop = -roadH / 2 - r * 1.3;
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


    // 자전거 배지 (정답 직후에는 잠깐 커지면서 초록으로 물든다). 나무를 심을 때는 앞으로 비켜 간다
    const shift = this.endShift * this.endShift * (3 - 2 * this.endShift);
    const bx = this.ballX * trackHalf + shift * Math.min(trackHalf * 0.6, W * 0.22);
    const br = r * (1 + 0.25 * this.pop);
    const by = -roadH * 0.12;
    this.drawRings(trackHalf, by, r);
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
    this.drawBike(bx, by, br);

    // 말풍선: RPM 과 할 일
    const fs = Math.round(U.clamp(r * 0.62, 13, 30));
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
    const px = U.clamp(bx, -W / 2 + pw / 2 + 12, W / 2 - pw / 2 - 12);
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
      const ly = pyTop - lh2 - 8;
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

    this.drawFloaters(trackHalf, pyTop - 4, r);
    g.restore();
  }

  // ----- 기념물 -----
  // 밑면 너비의 절반(body)과 팻말을 세울 자리(sign, 지붕 처마 바깥). h = 기념물 크기
  static footprint(kind, size, h) {
    if (kind === 'cottage') return { body: 0.4 * h, sign: 0.544 * h };
    if (kind === 'shop') return { body: 0.46 * h, sign: 0.51 * h };
    if (kind === 'tower') return { body: 0.28 * h, sign: 0.36 * h };
    if (kind === 'cairn') return { body: (0.26 + 0.03 * size) * h, sign: 0.32 * h };
    return { body: 0.08 * h, sign: 0.32 * h };
  }

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
      const fp = Band.footprint(lm.kind, lm.size, h);
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
    const tone = (c) => Band.mix(c, '#3a2a20', 0.3);
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

  // 길가 언덕 (길 윗선 roadTop 에서 꼭대기 crest(x) 까지). 기념물보다 먼저 그린다.
  // 꼭대기는 뒤 언덕(hillNear)에 가까운 밝은 풀색, 길 쪽으로 갈수록 풀밭색 — 앞으로 기운 비탈처럼 보이고 뒤 언덕과 길을 잇는다
  drawRoadsideHill(ext, roadTop, crest, verge) {
    const { g, pal } = this;
    const grad = g.createLinearGradient(0, roadTop - verge * 2, 0, roadTop);
    grad.addColorStop(0, Band.mix(pal.hillNear, pal.grass, 0.25));
    grad.addColorStop(1, pal.grass);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-ext, roadTop + 1);
    for (let x = -ext; x <= ext; x += 8) g.lineTo(x, crest(x));
    g.lineTo(ext, roadTop + 1);
    g.closePath();
    g.fill();
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
      this.drawLandmark(it.lm, it.x, baseY, h * (1 + 0.35 * it.lm.pop), '', r);
    }
    // 날짜 팻말은 모든 건물 위에 (이웃 건물에 가려지지 않게)
    for (const it of items) {
      if (!it.tag || it.planting || it.alpha <= 0) continue;
      g.globalAlpha = it.alpha * it.tagAlpha;
      const hh = h * (1 + 0.35 * it.lm.pop);
      g.save();
      g.translate(it.x, baseY);
      g.rotate(this.theta);
      this.drawSign(it.lm, hh, it.tag, r);
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
    const full = Band.heightOf(p.kind, p.size, h);
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
      if (Band.isBuilding(p.kind)) {
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
        this.drawLandmark(p, x, baseY, h, '', r);
        g.restore();
        if (done) {
          g.save();
          g.translate(x, baseY);
          g.rotate(this.theta);
          this.drawSign(p, h, '오늘', r);
          g.restore();
        }
      } else {
        // 바람개비·풍선·돌탑: 한 번에 톡 솟는다
        const grow = back(U.clamp(s, 0, 1));
        if (grow > 0.02) this.drawLandmark(p, x, baseY, h * grow, done ? '오늘' : '', r);
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
      g.globalAlpha = U.clamp(k / 0.3, 0, 1);
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

  // 기념물 하나 { kind, size, seed, best } 를 길 좌표 (x, y) 밑동에 h 크기로. tag = 오른쪽 작은 팻말의 글자 (날짜).
  // 오르막·내리막에서는 길이 기울지만(theta) 기념물은 똑바로 선다. 밑에는 언덕 비탈에 드리운 옅은 그림자를 깔아 땅에 붙어 보이게 한다.
  // 돌려주는 값 = 맨 위 높이 (밑동 기준, 똑바로 선 좌표. 별·이름표를 그 위에 둔다)
  drawLandmark(lm, x, y, h, tag = '', r = h / 1.8) {
    const { g, pal } = this;
    g.save();
    g.translate(x, y);
    g.rotate(this.theta);
    let top;
    const fp = Band.footprint(lm.kind, lm.size, h);
    g.fillStyle = 'rgba(30, 60, 35, 0.22)';
    g.beginPath();
    g.ellipse(h * 0.05, 0, fp.body * 1.25 + h * 0.05, h * 0.07, 0, 0, Math.PI * 2);
    g.fill();
    if (lm.kind === 'pinwheel') top = this.drawPinwheel(0, 0, h, lm.size, lm.seed);
    else if (lm.kind === 'cairn') top = this.drawCairn(0, 0, h, lm.size, lm.seed);
    else if (lm.kind === 'balloon') top = this.drawBalloons(0, 0, h, lm.size, lm.seed);
    else ({ top } = this.drawBuilding(lm.kind, 0, 0, h, lm.size, lm.seed, lm));
    if (lm.best) {
      this.drawStar(0, top - h * 0.2, h * 0.17);
      top -= h * 0.37;
    }
    if (tag) this.drawSign(lm, h, tag, r);
    g.restore();
    return top;
  }

  // 기념물 오른쪽(지붕 처마 바깥)의 작은 날짜 팻말. 밑동 기준, 똑바로 선 좌표에서 부른다
  drawSign(lm, h, tag, r) {
    const { g, pal } = this;
    const fs = Math.round(U.clamp(r * 0.42, 10, 18));
    g.font = `800 ${fs}px ${pal.font}`;
    const w = g.measureText(tag).width + fs * 0.7;
    const sh = fs * 1.35;
    const sx = Band.footprint(lm.kind, lm.size, h).sign + h * 0.06;
    const sy = -h * 0.3 - sh;
    g.fillStyle = pal.trunk;
    g.fillRect(sx + w * 0.5 - 1.5, sy + sh, 3, -sy - sh + 1);
    g.beginPath();
    g.roundRect(sx, sy, w, sh, 3);
    g.fill();
    g.fillStyle = pal.panel;
    g.beginPath();
    g.roundRect(sx + 1.5, sy + 1.5, w - 3, sh - 3, 2);
    g.fill();
    g.fillStyle = pal.ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(tag, sx + w / 2, sy + sh / 2 + 1);
  }

  // 마을 기념물 (동화책 풍): cottage(편안하게) 불룩한 박공지붕 집 · shop(보통) 줄무늬 차양 가게 · tower(도전) 깃발 단 탑.
  // size 0~2 = 층수 1~3. 벽·지붕 색은 colors(저장한 생김새의 wall · roof), 없으면 seed 로. 둥근 모서리, 아치 문·창, 창가 화분, 오른쪽 그늘.
  // 윤곽선은 검은 선이 아니라 칸마다 제 색을 조금 어둡게 한 선이다 (윤곽 없는 풍경 그림과 어울리게).
  // 길가 언덕의 앞 비탈에 선다. 돌려주는 값 = { top: 맨 위 높이, half: 몸체 너비의 절반 }
  drawBuilding(kind, x, y, h, size, seed, colors = {}) {
    const { g } = this;
    const floors = size + 1;
    const fh = h * 0.44;                 // 한 층 높이
    const wall = colors.wall || Band.WALLS[seed % Band.WALLS.length];
    const roof = colors.roof || Band.ROOFS[(seed * 3 + 1) % Band.ROOFS.length];
    const glass = '#ffe2a0', woodC = '#8a5a3a', stone = '#e6d6bb', brick = '#c0674a';
    const tone = (c) => Band.mix(c, '#3a2a20', 0.3);
    const lw = Math.max(1.2, h * 0.04);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.lineWidth = lw;
    const paint = (fill) => {
      g.fillStyle = fill;
      g.fill();
      g.strokeStyle = tone(fill);
      g.stroke();
    };
    const shade = (bx, by, bw, bh) => {
      g.fillStyle = 'rgba(80, 50, 30, 0.1)';
      g.fillRect(bx + bw * 0.72, by, bw * 0.28, bh);
    };
    const archWin = (cx, cy, s) => {
      g.beginPath();
      g.moveTo(cx - s / 2, cy + s * 0.55);
      g.lineTo(cx - s / 2, cy - s * 0.1);
      g.arc(cx, cy - s * 0.1, s / 2, Math.PI, 0);
      g.lineTo(cx + s / 2, cy + s * 0.55);
      g.closePath();
      g.fillStyle = glass;
      g.fill();
      g.strokeStyle = tone(wall);
      g.stroke();
      g.lineWidth = lw * 0.6;
      g.beginPath();
      g.moveTo(cx, cy - s * 0.55);
      g.lineTo(cx, cy + s * 0.55);
      g.moveTo(cx - s / 2, cy + s * 0.12);
      g.lineTo(cx + s / 2, cy + s * 0.12);
      g.stroke();
      g.lineWidth = lw;
      // 창가 화분
      g.beginPath();
      g.roundRect(cx - s * 0.6, cy + s * 0.55, s * 1.2, s * 0.22, s * 0.08);
      paint('#b8704a');
      for (let i = 0; i < 3; i++) {
        g.fillStyle = Band.LM_COLORS[(seed + i) % Band.LM_COLORS.length];
        g.beginPath();
        g.arc(cx - s * 0.35 + i * s * 0.35, cy + s * 0.52, s * 0.12, 0, Math.PI * 2);
        g.fill();
      }
    };
    const door = (cx, dw, dh) => {
      g.beginPath();
      g.moveTo(cx - dw / 2, y);
      g.lineTo(cx - dw / 2, y - dh + dw / 2);
      g.arc(cx, y - dh + dw / 2, dw / 2, Math.PI, 0);
      g.lineTo(cx + dw / 2, y);
      g.closePath();
      paint(woodC);
      g.fillStyle = '#f5d36b';
      g.beginPath();
      g.arc(cx + dw * 0.25, y - dh * 0.42, lw * 0.6, 0, Math.PI * 2);
      g.fill();
    };
    // 불룩한 지붕: 양 처마에서 꼭대기로 곡선
    const puffyRoof = (ry, hw, rh, bulge) => {
      g.beginPath();
      g.moveTo(x - hw, ry + h * 0.04);
      g.quadraticCurveTo(x - hw * 0.44, ry - rh * bulge, x, ry - rh);
      g.quadraticCurveTo(x + hw * 0.44, ry - rh * bulge, x + hw, ry + h * 0.04);
      g.closePath();
      paint(roof);
    };

    if (kind === 'tower') {
      const w = h * 0.5;
      const bh = fh * (floors + 0.55);
      g.beginPath();
      g.moveTo(x - w * 0.56, y);
      g.lineTo(x - w * 0.46, y - bh);
      g.lineTo(x + w * 0.46, y - bh);
      g.lineTo(x + w * 0.56, y);
      g.closePath();
      g.fillStyle = stone;
      g.fill();
      shade(x - w * 0.5, y - bh, w, bh);
      g.strokeStyle = tone(stone);
      g.stroke();
      // 돌 무늬
      g.fillStyle = 'rgba(120, 90, 60, 0.22)';
      for (let i = 0; i < floors * 3; i++) {
        g.beginPath();
        g.roundRect(x - w * 0.4 + Band.hash(seed + i) * w * 0.6, y - bh + Band.hash(seed + i * 7) * bh * 0.9, w * 0.16, h * 0.05, 2);
        g.fill();
      }
      for (let i = 1; i <= floors; i++) archWin(x, y - fh * (i + 0.15), h * 0.18);
      door(x, w * 0.36, fh * 0.6);
      const ry = y - bh;
      const rh = h * 0.7;
      puffyRoof(ry, w * 0.72, rh, 0.25);
      const pole = ry - rh;
      g.strokeStyle = tone(roof);
      g.beginPath();
      g.moveTo(x, pole);
      g.lineTo(x, pole - h * 0.3);
      g.stroke();
      const flutter = Math.sin(this.time * 4 + seed) * h * 0.03;
      g.beginPath();
      g.moveTo(x, pole - h * 0.3);
      g.quadraticCurveTo(x + h * 0.14, pole - h * 0.3 + flutter, x + h * 0.24, pole - h * 0.22 + flutter);
      g.lineTo(x, pole - h * 0.16);
      g.closePath();
      paint('#f5b301');
      return { top: pole - h * 0.3, half: w * 0.72 };
    }

    if (kind === 'shop') {
      const w = h * 0.92;
      const bh = fh * floors + h * 0.12;
      g.beginPath();
      g.roundRect(x - w / 2, y - bh, w, bh, h * 0.04);
      g.fillStyle = wall;
      g.fill();
      shade(x - w / 2, y - bh, w, bh);
      g.strokeStyle = tone(wall);
      g.stroke();
      g.beginPath();
      g.roundRect(x - w / 2 - h * 0.05, y - bh - h * 0.12, w + h * 0.1, h * 0.14, h * 0.05);
      paint(roof);
      // 1층: 큰 진열창과 문, 그 위 줄무늬 차양
      g.beginPath();
      g.roundRect(x - w * 0.42, y - fh * 0.74, w * 0.46, fh * 0.56, h * 0.04);
      g.fillStyle = glass;
      g.fill();
      g.strokeStyle = tone(wall);
      g.stroke();
      door(x + w * 0.26, w * 0.24, fh * 0.74);
      const aw = w + h * 0.1;
      const ay = y - fh * 0.98;
      const n = 5;
      for (let i = 0; i < n; i++) {
        const sx = x - aw / 2 + (aw / n) * i;
        g.beginPath();
        g.moveTo(sx, ay);
        g.lineTo(sx + aw / n, ay);
        g.lineTo(sx + aw / n, ay + h * 0.1);
        g.arc(sx + aw / n / 2, ay + h * 0.1, aw / n / 2, 0, Math.PI);
        g.closePath();
        g.fillStyle = i % 2 ? '#fffaf0' : roof;
        g.fill();
        g.strokeStyle = tone(roof);
        g.stroke();
      }
      for (let f = 1; f < floors; f++) {
        archWin(x - w * 0.22, y - fh * (f + 0.45), h * 0.17);
        archWin(x + w * 0.22, y - fh * (f + 0.45), h * 0.17);
      }
      return { top: y - bh - h * 0.12, half: w / 2 + h * 0.05 };
    }

    // cottage
    const w = h * 0.8;
    const bh = fh * floors;
    g.beginPath();
    g.roundRect(x - w / 2, y - bh, w, bh, h * 0.03);
    g.fillStyle = wall;
    g.fill();
    shade(x - w / 2, y - bh, w, bh);
    g.strokeStyle = tone(wall);
    g.stroke();
    door(x - w * 0.22, w * 0.26, fh * 0.7);
    archWin(x + w * 0.2, y - fh * 0.55, h * 0.17);
    for (let f = 1; f < floors; f++) {
      archWin(x - w * 0.2, y - fh * (f + 0.45), h * 0.17);
      archWin(x + w * 0.2, y - fh * (f + 0.45), h * 0.17);
    }
    const ry = y - bh;
    const rh = h * 0.5;
    // 굴뚝(지붕 뒤)과 피어오르는 연기
    g.beginPath();
    g.roundRect(x + w * 0.14, ry - rh * 0.95, w * 0.16, rh * 0.7, h * 0.02);
    paint(brick);
    g.fillStyle = 'rgba(255, 255, 255, 0.8)';
    const a0 = g.globalAlpha;
    for (let i = 0; i < 3; i++) {
      const t = (this.time * 0.35 + i / 3 + seed * 0.13) % 1;
      g.globalAlpha = a0 * (1 - t);
      g.beginPath();
      g.arc(x + w * 0.22 + t * h * 0.16, ry - rh - h * (0.04 + t * 0.32), h * (0.035 + t * 0.05), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = a0;
    puffyRoof(ry, w * 0.68, rh, 0.6);
    // 지붕 위 밝은 띠
    g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    g.beginPath();
    g.moveTo(x - w * 0.42, ry - rh * 0.22);
    g.quadraticCurveTo(x, ry - rh * 0.55, x + w * 0.42, ry - rh * 0.22);
    g.stroke();
    return { top: ry - rh, half: w * 0.68 };
  }

  // 바람개비 (편안하게): 막대 위의 네 날개. 페달을 밟는 만큼 돈다. size 0~2 = 크기
  drawPinwheel(x, y, h, size, seed) {
    const { g, pal } = this;
    const L = h * (0.8 + 0.18 * size);
    const R = h * (0.28 + 0.07 * size);
    const cy = y - L;
    g.strokeStyle = pal.trunk;
    g.lineWidth = Math.max(2, h * 0.06);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x, cy);
    g.stroke();
    const a0 = this.roll * 0.7 + seed;
    const C = Band.LM_COLORS;
    g.lineWidth = Math.max(1, h * 0.025);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let k = 0; k < 4; k++) {
      const a = a0 + (k * Math.PI) / 2;
      g.fillStyle = C[(seed + k) % C.length];
      g.beginPath();
      g.moveTo(x, cy);
      g.lineTo(x + Math.cos(a) * R, cy + Math.sin(a) * R);
      g.lineTo(x + Math.cos(a + 0.8) * R * 0.72, cy + Math.sin(a + 0.8) * R * 0.72);
      g.closePath();
      g.fill();
      g.stroke();
    }
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x, cy, Math.max(1.5, h * 0.045), 0, Math.PI * 2);
    g.fill();
    return cy - R;
  }

  // 풍선 (보통): 말뚝에 묶인 풍선 size+1 개. 천천히 흔들린다
  drawBalloons(x, y, h, size, seed) {
    const { g, pal } = this;
    const n = size + 1;
    const rx = h * 0.2;
    const ry = h * 0.25;
    const peg = y - h * 0.14;
    g.fillStyle = pal.trunk;
    g.fillRect(x - h * 0.03, peg, h * 0.06, y - peg);
    let top = y;
    const C = Band.LM_COLORS;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - (n - 1) / 2) * h * 0.34;
      const cx = x + off + Math.sin(this.time * 1.3 + seed + i * 2.1) * h * 0.05;
      const cy = y - h * (1.25 + (i % 2) * 0.14) + Math.sin(this.time * 1.7 + seed * 0.7 + i) * h * 0.04;
      g.strokeStyle = pal.ink;
      g.globalAlpha *= 0.55;
      g.lineWidth = Math.max(1, h * 0.02);
      g.beginPath();
      g.moveTo(x, peg);
      g.quadraticCurveTo(x + off * 0.3, (peg + cy) / 2, cx, cy + ry);
      g.stroke();
      g.globalAlpha /= 0.55;
      g.fillStyle = C[(seed + i * 2) % C.length];
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(cx, cy + ry - 1);
      g.lineTo(cx - rx * 0.22, cy + ry + rx * 0.3);
      g.lineTo(cx + rx * 0.22, cy + ry + rx * 0.3);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.beginPath();
      g.ellipse(cx - rx * 0.35, cy - ry * 0.35, rx * 0.22, ry * 0.3, -0.5, 0, Math.PI * 2);
      g.fill();
      top = Math.min(top, cy - ry);
    }
    return top;
  }

  // 돌탑 (도전): 납작한 돌을 위로 갈수록 작게 쌓는다. size 0~2 = 돌 3~5 개
  drawCairn(x, y, h, size, seed) {
    const { g } = this;
    const greys = ['#8d949b', '#aeb4ba', '#767d84', '#9da3a9'];
    let w = h * (0.52 + 0.06 * size);
    let cy = y;
    g.strokeStyle = '#4b5157';
    g.lineWidth = Math.max(1, h * 0.03);
    for (let i = 0; i < 3 + size; i++) {
      const sh = w * 0.5;
      const dx = (Band.hash(seed + i * 13) - 0.5) * w * 0.25;
      g.fillStyle = greys[(seed + i) % greys.length];
      g.beginPath();
      g.ellipse(x + dx, cy - sh / 2, w / 2, sh / 2, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      cy -= sh * 0.85;
      w *= 0.8;
    }
    return cy;
  }

  drawStar(x, y, s) {
    const { g, pal } = this;
    g.fillStyle = pal.sun;
    g.strokeStyle = pal.ink;
    g.lineWidth = Math.max(1, s * 0.15);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const d = i % 2 ? s * 0.45 : s;
      g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    g.closePath();
    g.fill();
    g.stroke();
  }

  // ----- 풍경 소품. (x, y) = 밑동, h = 크기 -----
  drawPine(x, y, h) {
    const { g, pal } = this;
    g.fillStyle = pal.tree;
    g.beginPath();
    g.moveTo(x - h * 0.32, y);
    g.lineTo(x, y - h);
    g.lineTo(x + h * 0.32, y);
    g.closePath();
    g.fill();
  }

  drawRoundTree(x, y, h, fruit) {
    const { g, pal } = this;
    g.fillStyle = pal.trunk;
    g.fillRect(x - h * 0.06, y - h * 0.5, h * 0.12, h * 0.5);
    g.fillStyle = pal.treeRound;
    g.beginPath();
    g.arc(x, y - h * 0.66, h * 0.34, 0, Math.PI * 2);
    g.fill();
    if (!fruit) return;
    g.fillStyle = pal.fruit;
    for (const [dx, dy] of [[-0.14, -0.7], [0.12, -0.6], [0.02, -0.82], [0.17, -0.8]]) {
      g.beginPath();
      g.arc(x + dx * h, y + dy * h, Math.max(1.5, h * 0.05), 0, Math.PI * 2);
      g.fill();
    }
  }

  drawHouse(x, y, h, pick) {
    const { g, pal } = this;
    const w = h * 0.95;
    const bh = h * 0.55;
    g.fillStyle = pal.wall;
    g.fillRect(x - w / 2, y - bh, w, bh);
    g.fillStyle = pick > 0.7 ? pal.roofAlt : pal.roof;
    g.beginPath();
    g.moveTo(x - w * 0.62, y - bh);
    g.lineTo(x, y - bh - h * 0.42);
    g.lineTo(x + w * 0.62, y - bh);
    g.closePath();
    g.fill();
    g.fillStyle = pal.window;
    g.fillRect(x - w * 0.3, y - bh * 0.72, w * 0.22, bh * 0.3);
    g.fillRect(x + w * 0.1, y - bh * 0.72, w * 0.22, bh * 0.3);
  }

  // 풍차 날개는 시간에 따라 돈다
  drawWindmill(x, y, h, i) {
    const { g, pal } = this;
    const top = y - h * 1.15;
    g.fillStyle = pal.mill;
    g.beginPath();
    g.moveTo(x - h * 0.2, y);
    g.lineTo(x - h * 0.09, top);
    g.lineTo(x + h * 0.09, top);
    g.lineTo(x + h * 0.2, y);
    g.closePath();
    g.fill();
    g.strokeStyle = pal.blade;
    g.lineWidth = Math.max(2, h * 0.07);
    g.lineCap = 'round';
    g.beginPath();
    const a0 = this.time * 1.4 + i;
    for (let k = 0; k < 4; k++) {
      const a = a0 + (k * Math.PI) / 2;
      g.moveTo(x, top);
      g.lineTo(x + Math.cos(a) * h * 0.6, top + Math.sin(a) * h * 0.6);
    }
    g.stroke();
    g.lineCap = 'butt';
    g.fillStyle = pal.blade;
    g.beginPath();
    g.arc(x, top, Math.max(2, h * 0.07), 0, Math.PI * 2);
    g.fill();
  }

  drawFlowerPatch(x, y, h, i) {
    const { g, pal } = this;
    const colors = [pal.flowerA, pal.flowerB, pal.flowerC, pal.flowerD];
    const c = colors[Math.floor(Band.hash(i + 17) * colors.length)];
    g.fillStyle = c;
    for (let k = 0; k < 7; k++) {
      g.beginPath();
      g.arc(x + (Band.hash(i * 7 + k) - 0.5) * h * 1.6, y - Band.hash(i * 5 + k) * h * 0.35, Math.max(2.5, h * 0.1), 0, Math.PI * 2);
      g.fill();
    }
  }

  // 길 아래 풀밭의 꽃과 덤불 (길과 같이 기운 좌표에서 그린다). off = 흘러간 거리, a = 보이는 정도
  drawRoadside(ext, top, below, off, a) {
    const { g, pal } = this;
    const sp = 64;
    const s = U.clamp(below * 0.12, 6, 26);
    const colors = [pal.flowerA, pal.flowerB, pal.flowerC, pal.flowerD];
    g.globalAlpha = a;
    for (let j = Math.floor((off - ext) / sp); j * sp - off < ext + sp; j++) {
      const h = Band.hash(j + 501);
      if (h < 0.35) continue;
      const x = j * sp - off + Band.hash(j + 77) * 30;
      const y = top + below * (0.22 + 0.45 * Band.hash(j + 13));
      if (h > 0.82) {
        g.fillStyle = pal.bush;
        g.beginPath();
        g.arc(x, y, s * 1.3, Math.PI, 0);
        g.arc(x + s * 1.2, y, s * 0.95, Math.PI, 0);
        g.closePath();
        g.fill();
        continue;
      }
      g.strokeStyle = pal.tree;
      g.lineWidth = Math.max(1.5, s * 0.14);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y - s * 1.1);
      g.stroke();
      g.fillStyle = colors[Math.floor(Band.hash(j + 9) * colors.length)];
      g.beginPath();
      g.arc(x, y - s * 1.2, s * 0.42, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  // 배지 안의 자전거 (s = 배지 반지름). 바퀴는 페달보다 빨리 돌고, 크랭크는 페달 속도 그대로 돈다
  drawBike(x, y, s) {
    const { g, pal } = this;
    const P = (px, py) => [x + px * s, y + py * s];
    const wr = s * 0.27;
    const R = P(-0.4, 0.22), F = P(0.4, 0.22), C = P(-0.02, 0.22), S = P(-0.15, -0.18), Hd = P(0.27, -0.18);
    g.strokeStyle = pal.ink;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = Math.max(2, s * 0.085);
    g.beginPath();
    g.arc(R[0], R[1], wr, 0, Math.PI * 2);
    g.moveTo(F[0] + wr, F[1]);
    g.arc(F[0], F[1], wr, 0, Math.PI * 2);
    g.moveTo(...R);
    g.lineTo(...S);
    g.lineTo(...C);
    g.lineTo(...R);
    g.moveTo(...S);
    g.lineTo(...Hd);
    g.lineTo(...C);
    g.moveTo(...Hd);
    g.lineTo(...F);
    const seat = P(-0.17, -0.31);
    g.moveTo(...S);
    g.lineTo(...seat);
    g.moveTo(seat[0] - s * 0.1, seat[1]);
    g.lineTo(seat[0] + s * 0.08, seat[1]);
    const bar = P(0.3, -0.33);
    g.moveTo(...Hd);
    g.lineTo(...bar);
    g.lineTo(bar[0] + s * 0.1, bar[1] + s * 0.02);
    g.stroke();
    g.lineWidth = Math.max(1.2, s * 0.045);
    g.beginPath();
    for (const wh of [R, F]) {
      for (let k = 0; k < 3; k++) {
        const a = this.roll * 2 + (k * Math.PI) / 3;
        g.moveTo(wh[0] + Math.cos(a) * wr, wh[1] + Math.sin(a) * wr);
        g.lineTo(wh[0] - Math.cos(a) * wr, wh[1] - Math.sin(a) * wr);
      }
    }
    g.stroke();
    g.lineWidth = Math.max(2, s * 0.07);
    g.beginPath();
    const ca = this.roll;
    g.moveTo(C[0] + Math.cos(ca) * s * 0.13, C[1] + Math.sin(ca) * s * 0.13);
    g.lineTo(C[0] - Math.cos(ca) * s * 0.13, C[1] - Math.sin(ca) * s * 0.13);
    g.stroke();
    g.lineCap = 'butt';
    g.lineJoin = 'miter';
  }
}
