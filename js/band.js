// 상단 1/4 영역: 평지를 구르는 공으로 페달링 속도를 시각화.
// 속도 전환 구간에는 같은 캔버스가 화면 전체로 커진다 (크기에 맞춰 공과 구역도 조금 커진다).
// 지면은 페달 속도가 아니라 점수만큼 흘러간다. 초록 구역 안에서는 꾸준히 나아가고, 벗어나면 느려지다 멈추며,
// 인지 게임을 맞히면 한꺼번에 쭉 나아간다. 일정 점수마다 깃발이 서 있어 점수가 '달린 거리'로 보인다.
import { Util } from './config.js';
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

  constructor(canvas, config) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.config = config;
    this.ballX = 0;       // -1 ~ 1 (트랙 기준 정규화 위치)
    this.roll = 0;        // 공 회전각
    this.travelled = 0;        // 지금까지 나아간 거리 (점수 단위). 점수를 조금 늦게 부드럽게 따라간다
    this.passed = null;   // 방금 지난 깃발 { milestone, age }
    this.onMilestone = null; // (milestone) 깃발을 지나는 순간
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
    this.onLandmark = null; // (landmark) 지난 기념물을 지나는 순간
    this.planting = null;   // 라운드 끝에 세우는 기념물 { score, elapsed, label, seed, kind, size }
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
    this.palette = Band.readPalette();
    this.resize();
    // 높이가 바뀌는 동안(전환 애니메이션) 매번 다시 맞춘다. 캔버스 크기를 바꾸면 내용이 지워지므로 바로 다시 그린다.
    new ResizeObserver(() => {
      this.resize();
      this.draw();
    }).observe(canvas);
  }

  // 색은 CSS 변수에서 읽는다 (스타일을 바꾸면 setLook 으로 다시 읽는다)
  static readPalette() {
    const style = getComputedStyle(document.body);
    const cssVar = (name) => style.getPropertyValue(name).trim();
    return {
      good: cssVar('--good'), goodSoft: cssVar('--good-soft'), bad: cssVar('--bad'), badSoft: cssVar('--bad-soft'), warn: cssVar('--warn'),
      accent: cssVar('--accent'), ink: cssVar('--ink'), font: cssVar('--font-num') || 'system-ui, sans-serif', onAccent: cssVar('--on-accent'), ground: cssVar('--ground'), groundMark: cssVar('--ground-mark'),
      panel: cssVar('--panel'), fontText: cssVar('--font') || 'system-ui, sans-serif',
      // 풍경 라이딩(look.scenic)에서만 쓴다
      sky: cssVar('--sky'), sun: cssVar('--sun'), hillFar: cssVar('--hill-far'), hillNear: cssVar('--hill-near'), tree: cssVar('--tree'), grass: cssVar('--grass'),
      skyDawn: cssVar('--sky-dawn'), skyGolden: cssVar('--sky-golden'), skyDusk: cssVar('--sky-dusk'),
      skyLow: cssVar('--sky-low'), skyDawnLow: cssVar('--sky-dawn-low'), skyGoldenLow: cssVar('--sky-golden-low'), skyDuskLow: cssVar('--sky-dusk-low'), sunDusk: cssVar('--sun-dusk'), duskTint: cssVar('--dusk-tint'),
      cloud: cssVar('--cloud'), cloudDusk: cssVar('--cloud-dusk'), trunk: cssVar('--trunk'), treeRound: cssVar('--tree-round'), fruit: cssVar('--fruit'),
      wall: cssVar('--wall'), roof: cssVar('--roof'), roofAlt: cssVar('--roof-alt'), window: cssVar('--window'), mill: cssVar('--mill'), blade: cssVar('--blade'), bush: cssVar('--bush'),
      flowerA: cssVar('--flower-a'), flowerB: cssVar('--flower-b'), flowerC: cssVar('--flower-c'), flowerD: cssVar('--flower-d'),
      zone: cssVar('--zone') || cssVar('--good'), road: cssVar('--road'), roadEdge: cssVar('--road-edge'), roadMark: cssVar('--road-mark'), tipGood: cssVar('--tip-good'), tipWarn: cssVar('--tip-warn'),
    };
  }

  setLook(look) {
    this.look = look || {};
    this.palette = Band.readPalette();
    this.canvas.style.imageRendering = this.look.pixel ? 'pixelated' : '';
    this.resize();
    this.draw();
  }

  resize() {
    // 픽셀 스타일은 일부러 낮은 해상도로 그리고 늘려서 계단을 보이게 한다
    const pixelRatio = this.look.pixel ? 1 / this.look.pixel : window.devicePixelRatio || 1;
    const bounds = this.canvas.getBoundingClientRect();
    this.viewWidth = bounds.width;
    this.viewHeight = bounds.height;
    this.canvas.width = Math.round(bounds.width * pixelRatio);
    this.canvas.height = Math.round(bounds.height * pixelRatio);
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.pixelRatio = pixelRatio;
    this.measureUi(bounds);
  }

  // 캔버스 위에 덮이는 화면 요소들을 캔버스 좌표로 잰다 (풍경 라이딩만 쓴다). 캔버스 크기가 바뀔 때마다 다시 잰다.
  //   hudRects — 위쪽 칩들. 점수 알림·'여기에 맞춰 달려요'·건물 이름표를 그 밑으로 숨기지 않는다 (휴대폰에서는 칩이 가로를 다 차지한다)
  //   endRect — '그만하기' 단추. 자전거가 그 밑으로 들어가지 않게 트랙을 비킨다. 단추가 숨어 있으면(라운드 밖) 비킬 것이 없다
  measureUi(canvasBounds) {
    if (!canvasBounds.width) return;
    const local = (element) => {
      const box = element.getBoundingClientRect();
      return box.width && box.height ? { left: box.left - canvasBounds.left, right: box.right - canvasBounds.left, top: box.top - canvasBounds.top, bottom: box.bottom - canvasBounds.top } : null;
    };
    this.hudRects = [...document.querySelectorAll('#band-ui .hud')].map(local).filter(Boolean);
    const end = this.canvas.parentElement.querySelector('.end-btn');
    this.endRect = end && !end.hidden ? local(end) : null;
  }

  // 지금 그리는 좌표계(캔버스 context 의 변환)에서 사각형 (fromX, fromY) ~ (toX, toY) 이 HUD 칩 밑으로 얼마나 들어가는가 (px, 겹치지 않으면 0)
  hudDepth(fromX, fromY, toX, toY) {
    if (!this.hudRects.length) return 0;
    const transform = this.context.getTransform();
    const { pixelRatio } = this;
    const screenXs = [], screenYs = [];
    for (const [x, y] of [[fromX, fromY], [toX, fromY], [fromX, toY], [toX, toY]]) {
      screenXs.push((transform.a * x + transform.c * y + transform.e) / pixelRatio);
      screenYs.push((transform.b * x + transform.d * y + transform.f) / pixelRatio);
    }
    const left = Math.min(...screenXs), right = Math.max(...screenXs), top = Math.min(...screenYs), bottom = Math.max(...screenYs);
    let depth = 0;
    for (const hudRect of this.hudRects) {
      if (right <= hudRect.left || left >= hudRect.right || bottom <= hudRect.top || top >= hudRect.bottom) continue;
      depth = Math.max(depth, hudRect.bottom - top);
    }
    return depth;
  }

  setSlope(direction) {
    // dir: +1 오르막(더 빠르게), -1 내리막(더 천천히), 0 평지
    this.thetaTarget = direction * (7 * Math.PI / 180);
  }

  addFloater(text, color) {
    this.floaters.push({ text, color, age: 0, x: this.ballX });
  }

  // 아래쪽 인지 게임을 맞혔을 때 위쪽 공도 같이 반응한다.
  // 화면 위아래가 따로 노는 두 화면이 아니라 한 게임으로 느껴지게 하려는 것.
  celebrate() {
    this.rings.push({ age: 0, x: this.ballX });
    this.pop = 1;
  }

  // 새 라운드: 출발선으로 되돌린다
  restart() {
    this.travelled = 0;
    this.passed = null;
    this.floaters = [];
    this.rings = [];
    this.planting = null;
    this.endShift = 0;
    this.dodge = null;
    this.landmarks.forEach((landmark) => (landmark.pop = 0));
  }

  // 지난 세션들 → 풍경의 기념물 (무엇을 세우는가는 js/landmarks.js). pop = 지나갈 때 커졌다 돌아오는 연출
  setLandmarks(sessions) {
    this.landmarks = Landmarks.fromHistory(sessions).map((landmark) => ({ ...landmark, pop: 0 }));
  }

  // 라운드 끝: 이번 점수 자리에 기념물을 세운다 (main.js 의 마무리 화면). 자전거는 앞으로 비켜 가며 멈춘다.
  // info = { recordNumber: 이 회원의 몇 번째 기록인가, difficulty, min }. 돌려주는 값 = 생김새 (main.js 가 세션 로그에 적는다)
  plant(score, { recordNumber = 1, difficulty, min } = {}) {
    const { kind, size, verb } = Landmarks.forSession(difficulty, min);
    const label = `${recordNumber === 1 ? '첫' : `${recordNumber}번째`} 기록 · ${verb}`;
    const look = Landmarks.look(kind, size, Math.floor(Math.random() * 100000));
    // 짓는 단계: 건물은 층마다 한 단계 + 지붕 (그 밖의 기념물은 한 번에)
    const steps = Landmarks.isBuilding(kind) ? size + 2 : 1;
    this.planting = {
      score: Math.max(score, this.travelled), elapsed: 0, label, ...look,
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
  update(deltaSeconds, rpm, deviation, score = 0) {
    const { tolerance, maxDeviation } = this.config;
    const target = Util.clamp(deviation / maxDeviation, -1, 1);
    this.ballX = Util.lerp(this.ballX, target, 1 - Math.exp(-deltaSeconds / 0.18));
    this.theta = Util.lerp(this.theta, this.thetaTarget, 1 - Math.exp(-deltaSeconds / 0.6));
    this.rpm = rpm;
    const speed = rpm / 60; // 초당 회전 수
    this.roll += speed * Math.PI * 2 * deltaSeconds;
    // 점수를 따라간다. 인지 게임 점수처럼 한 번에 크게 오르면 잠깐 사이에 쭉 달려가는 것으로 보인다.
    const before = this.travelled;
    // (틱이 끝날 때 반올림으로 점수가 살짝 내려앉을 수 있다. 그렇다고 지면이 뒤로 가지는 않게 한다)
    this.travelled = Math.max(this.travelled, Util.lerp(this.travelled, score, 1 - Math.exp(-deltaSeconds / 0.25)));
    const milestone = Math.floor(this.travelled / Band.MARK_EVERY) * Band.MARK_EVERY;
    if (milestone > 0 && before < milestone) {
      this.passed = { milestone, age: 0 };
      if (this.onMilestone) this.onMilestone(milestone);
    }
    if (this.passed) this.passed.age += deltaSeconds;
    for (const landmark of this.landmarks) {
      landmark.pop = Math.max(0, landmark.pop - deltaSeconds / 0.6);
      if (before < landmark.score && this.travelled >= landmark.score) {
        landmark.pop = 1;
        if (this.onLandmark) this.onLandmark(landmark);
      }
    }
    if (this.planting) {
      const planting = this.planting;
      planting.elapsed += deltaSeconds;
      this.endShift = Math.min(1, this.endShift + deltaSeconds / 0.9);
      // 한 단계 올릴 때마다, 다 지었을 때 main.js 가 소리를 낸다
      const step = Math.floor((planting.elapsed - Band.BUILD_DELAY - Band.BUILD_LEAD) / Band.BUILD_STEP);
      if (step >= 0 && step < planting.steps && step > planting.step) {
        planting.step = step;
        if (this.onBuildStep) this.onBuildStep(step, planting.steps);
      }
      if (!planting.done && planting.elapsed >= planting.doneAt) {
        planting.done = true;
        if (this.onBuilt) this.onBuilt();
      }
    }
    // 색과 점수는 실제 편차가 아니라 화면에 보이는 공 위치를 기준으로 한다 (보이는 대로 채점)
    const out = Math.max(0, Math.abs(this.deviation) - tolerance) / (maxDeviation - tolerance);
    this.outAmount = Util.lerp(this.outAmount, Util.clamp(out * 1.5 + (out > 0 ? 0.35 : 0), 0, 1), 1 - Math.exp(-deltaSeconds / 0.12));
    this.slowSide = this.ballX < 0;
    this.floaters.forEach((floater) => (floater.age += deltaSeconds));
    this.floaters = this.floaters.filter((floater) => floater.age < 1);
    this.rings.forEach((ring) => (ring.age += deltaSeconds));
    this.rings = this.rings.filter((ring) => ring.age < Band.RING_SEC);
    this.pop = Math.max(0, this.pop - deltaSeconds / 0.4);
    if (this.dodge != null) this.dodge = Util.lerp(this.dodge, this.dodgeTo, 1 - Math.exp(-deltaSeconds / 0.25));
    this.time += deltaSeconds;
  }

  // 화면에 그려진 공 위치에 해당하는 편차
  get deviation() {
    return this.ballX * this.config.maxDeviation;
  }

  // 공의 중심이 허용 구역 점선 안에 있는가
  get inZone() {
    return Math.abs(this.deviation) <= this.config.tolerance;
  }

  draw() {
    if (this.look.scenic) return this.drawScenic();
    const { context, viewWidth, viewHeight, palette, look } = this;
    const { tolerance, maxDeviation } = this.config;
    context.clearRect(0, 0, viewWidth, viewHeight);
    // 네온 스타일: 선과 공에 빛 번짐
    const glow = (color) => {
      if (!look.glow) return;
      context.shadowColor = color;
      context.shadowBlur = look.glow;
    };
    const noGlow = () => (context.shadowBlur = 0);

    const centerX = viewWidth / 2;
    const groundY = viewHeight * 0.72;
    const trackHalf = Math.max(120, viewWidth / 2 - 230);
    const zoneHalf = trackHalf * (tolerance / maxDeviation);
    // 띠 높이에서는 반지름이 30에서 멈추고, 화면 전체로 커지면 그만큼 더 커진다
    const baseRadius = Util.clamp(viewHeight * 0.14, 14, 30 + Math.max(0, viewHeight - 320) * 0.035);
    const zoneHeight = baseRadius * 2 + Math.min(viewHeight * 0.14, baseRadius * 1.6);

    context.save();
    context.translate(centerX, groundY);
    context.rotate(-this.theta);

    // 허용 구역 (두뇌 게임만 하는 판에는 없다)
    const red = this.outAmount;
    if (!this.brainOnly) {
      context.fillStyle = palette.goodSoft;
      context.fillRect(-zoneHalf, -zoneHeight, zoneHalf * 2, zoneHeight);
      if (red > 0) {
        context.globalAlpha = red;
        context.fillStyle = palette.badSoft;
        context.fillRect(-zoneHalf, -zoneHeight, zoneHalf * 2, zoneHeight);
      }
      context.globalAlpha = this.inZone ? 1 : 0.4 + red * 0.6;
      context.strokeStyle = this.inZone ? palette.good : palette.bad;
      glow(context.strokeStyle);
      context.lineWidth = 3;
      context.setLineDash([6, 6]);
      context.beginPath();
      context.moveTo(-zoneHalf, -zoneHeight);
      context.lineTo(-zoneHalf, 0);
      context.moveTo(zoneHalf, -zoneHeight);
      context.lineTo(zoneHalf, 0);
      context.stroke();
      context.setLineDash([]);
      context.globalAlpha = 1;
      noGlow();
    }

    // 지면
    const extent = viewWidth;
    context.strokeStyle = palette.ground;
    glow(palette.ground);
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(-extent, 0);
    context.lineTo(extent, 0);
    context.stroke();
    noGlow();
    // 지면 무늬 (공이 굴러가는 느낌)
    context.strokeStyle = palette.groundMark;
    context.lineWidth = 3;
    const spacing = 36;
    const markOffset = -((this.travelled * Band.PX_PER_POINT) % spacing);
    context.beginPath();
    for (let x = -extent + markOffset; x < extent; x += spacing) {
      context.moveTo(x, 10);
      context.lineTo(x - 12, 22);
    }
    context.stroke();

    this.drawFlags(extent, baseRadius, 0, (big) => -(zoneHeight + (big ? baseRadius * 0.75 : baseRadius * 0.3)), glow, noGlow);

    // 정답 고리 — 공 뒤에서 퍼져 나간다
    this.drawRings(trackHalf, -baseRadius - 2, baseRadius);

    // 공 (정답 직후에는 잠깐 커지면서 초록으로 물든다)
    const ballCenterX = this.ballX * trackHalf;
    const ballRadius = baseRadius * (1 + 0.25 * this.pop);
    const ballCenterY = -ballRadius - 2;
    if (this.brainOnly) {
      drawBrainBadge(this, ballCenterX, ballCenterY, ballRadius);
      this.drawFloaters(trackHalf, -baseRadius * 2 - 6, baseRadius, glow);
      noGlow();
      context.globalAlpha = 1;
      context.restore();
      return;
    }
    // 스포츠 스타일: 공 뒤로 속도선 (빠를수록 길다)
    if (look.speedLines && this.rpm > 5) {
      context.strokeStyle = palette.ground;
      context.lineWidth = Math.max(2, baseRadius * 0.12);
      context.lineCap = 'round';
      for (let lineIndex = 0; lineIndex < 3; lineIndex++) {
        const lineLength = baseRadius * (0.8 + this.rpm / 45) * (lineIndex === 1 ? 1.3 : 0.9);
        const lineY = ballCenterY + (lineIndex - 1) * ballRadius * 0.55;
        const lineStartX = ballCenterX - ballRadius - 8 - ((this.roll * 6 + lineIndex * 7) % 6);
        context.globalAlpha = 0.55;
        context.beginPath();
        context.moveTo(lineStartX, lineY);
        context.lineTo(lineStartX - lineLength, lineY);
        context.stroke();
      }
      context.globalAlpha = 1;
      context.lineCap = 'butt';
    }
    // 공은 바퀴 모양: 진한 타이어 안에 색 바퀴통. 게임 판의 색 동그라미(공 따라가기의 공, 길 칸)와 헷갈리지 않게 한다.
    // 바퀴통 색이 구역 안/밖을 알리고, 정답 직후에는 초록을 위에 겹쳐 물들인다
    const ballColor = this.inZone ? palette.accent : palette.bad;
    const hubRadius = ballRadius * 0.72;
    glow(ballColor);
    context.fillStyle = palette.ink;
    context.beginPath();
    context.arc(ballCenterX, ballCenterY, ballRadius, 0, Math.PI * 2);
    context.fill();
    noGlow();
    if (look.outline) {
      context.strokeStyle = palette.ink;
      context.lineWidth = look.outline;
      context.stroke();
    }
    // 타이어 무늬 — 바퀴살과 함께 돌아서 굴러가는 것이 보인다
    context.strokeStyle = palette.ground;
    context.lineWidth = Math.max(1.5, ballRadius * 0.07);
    context.lineCap = 'round';
    context.beginPath();
    for (let notchIndex = 0; notchIndex < 10; notchIndex++) {
      const angle = this.roll + (notchIndex * Math.PI) / 5;
      context.moveTo(ballCenterX + Math.cos(angle) * ballRadius * 0.8, ballCenterY + Math.sin(angle) * ballRadius * 0.8);
      context.lineTo(ballCenterX + Math.cos(angle) * ballRadius * 0.92, ballCenterY + Math.sin(angle) * ballRadius * 0.92);
    }
    context.stroke();
    context.lineCap = 'butt';
    context.fillStyle = ballColor;
    context.beginPath();
    context.arc(ballCenterX, ballCenterY, hubRadius, 0, Math.PI * 2);
    context.fill();
    if (this.pop > 0) {
      context.globalAlpha = this.pop;
      context.fillStyle = palette.good;
      context.fill();
      context.globalAlpha = 1;
    }
    context.strokeStyle = palette.onAccent;
    context.lineWidth = Math.max(2, ballRadius * 0.13);
    context.beginPath();
    for (let spokeIndex = 0; spokeIndex < 2; spokeIndex++) {
      const angle = this.roll + (spokeIndex * Math.PI) / 2;
      context.moveTo(ballCenterX + Math.cos(angle) * hubRadius * 0.78, ballCenterY + Math.sin(angle) * hubRadius * 0.78);
      context.lineTo(ballCenterX - Math.cos(angle) * hubRadius * 0.78, ballCenterY - Math.sin(angle) * hubRadius * 0.78);
    }
    context.stroke();

    // 이탈 시 방향 힌트
    if (!this.inZone && red > 0.25) {
      context.globalAlpha = Math.min(1, red);
      context.fillStyle = palette.bad;
      context.font = `800 ${Math.round(baseRadius * 0.9)}px ${palette.font}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const direction = this.slowSide ? 1 : -1;
      context.fillText(this.slowSide ? '›››' : '‹‹‹', ballCenterX + direction * (baseRadius * 2.1), ballCenterY);
      context.globalAlpha = 1;
    }

    // 점수 피드백
    this.drawFloaters(trackHalf, -baseRadius * 2 - 6, baseRadius, glow);
    noGlow();
    context.globalAlpha = 1;
    context.restore();
  }

  // 점수 깃발 — 구역 한가운데를 지나는 순간이 그 점수에 닿은 때다. baseY = 깃대 아래 끝, topFor(big) = 깃대 위 끝
  drawFlags(extent, baseRadius, baseY, topFor, glow = () => {}, noGlow = () => {}) {
    const { context, viewWidth, palette } = this;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    const first = Math.max(Band.MARK_EVERY, Math.ceil((this.travelled - extent / Band.PX_PER_POINT) / Band.MARK_EVERY) * Band.MARK_EVERY);
    for (let milestone = first; (milestone - this.travelled) * Band.PX_PER_POINT < extent; milestone += Band.MARK_EVERY) {
      const x = (milestone - this.travelled) * Band.PX_PER_POINT;
      // 양옆의 시간·점수 표시와 겹치지 않게 가장자리에서는 사라진다
      const alpha = Util.clamp((viewWidth / 2 - 170 - Math.abs(x)) / 100, 0, 1);
      if (alpha <= 0) continue;
      const big = milestone % Band.MARK_BIG === 0;
      const done = milestone <= this.travelled;
      const pop = this.passed && this.passed.milestone === milestone ? Math.max(0, 1 - this.passed.age / Band.POP_SEC) : 0;
      const top = topFor(big);
      const flagWidth = baseRadius * (big ? 1.25 : 0.9) * (1 + 0.5 * pop);
      const flagHeight = flagWidth * 0.8;
      context.globalAlpha = alpha;
      context.strokeStyle = context.fillStyle = done ? palette.good : big ? palette.accent : palette.ground;
      glow(context.fillStyle);
      context.lineWidth = big ? 4 : 3;
      context.beginPath();
      context.moveTo(x, baseY);
      context.lineTo(x, top);
      context.stroke();
      context.beginPath();
      context.moveTo(x, top);
      context.lineTo(x + flagWidth, top + flagHeight / 2);
      context.lineTo(x, top + flagHeight);
      context.fill();
      context.font = `800 ${Math.round(baseRadius * (big ? 0.7 : 0.55))}px ${palette.font}`;
      context.fillText(String(milestone), x + flagWidth + 5, top + flagHeight / 2);
    }
    context.globalAlpha = 1;
    noGlow();
  }

  // 정답 고리 — 공 뒤에서 퍼져 나간다 (y = 고리 중심 높이)
  drawRings(trackHalf, y, baseRadius) {
    const { context, palette } = this;
    for (const ring of this.rings) {
      const progress = ring.age / Band.RING_SEC;
      context.globalAlpha = (1 - progress) * 0.6;
      context.strokeStyle = palette.good;
      context.lineWidth = Math.max(1.5, baseRadius * 0.2 * (1 - progress));
      context.beginPath();
      context.arc(ring.x * trackHalf, y, baseRadius * (1 + progress * 2.8), 0, Math.PI * 2);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  // 점수 피드백 — baseY 에서 튀어 올랐다가 사라진다
  // beside = { left, right, y, maxX }: 풍경 라이딩의 말풍선 양 끝과 가운데 높이. 그 위로 올라갈 자리가 위쪽 칩에 막히면(휴대폰)
  // 말풍선 옆에 띄운다 (오른쪽, 넘치면 왼쪽)
  drawFloaters(trackHalf, baseY, baseRadius, glow = () => {}, beside = null) {
    const { context, palette } = this;
    context.textAlign = 'center';
    context.textBaseline = 'bottom';
    const fontPx = Math.round(baseRadius * 0.95);
    const rise = 26;
    const cramped = beside && this.hudDepth(-fontPx, baseY - rise - fontPx * 1.3, fontPx, baseY) > 0;
    for (const floater of this.floaters) {
      let floaterX = floater.x * trackHalf;
      // 처음에 튕겨 오르고 끝에서 느려지게. 일정한 속도로 올라가면 흘러가는 느낌이 난다.
      const ease = 1 - Math.pow(1 - floater.age, 3);
      let floaterY = baseY - ease * rise;
      if (cramped) {
        context.font = `800 ${fontPx}px ${palette.font}`;
        const textWidth = context.measureText(floater.text).width * 1.3;
        floaterX = beside.right + 10 + textWidth / 2 + textWidth / 2 <= beside.maxX ? beside.right + 10 + textWidth / 2 : beside.left - 10 - textWidth / 2;
        floaterY = beside.y + fontPx * 0.5 - ease * 8;
      }
      context.globalAlpha = floater.age < 0.1 ? floater.age / 0.1 : floater.age < 0.5 ? 1 : 1 - (floater.age - 0.5) / 0.5;
      context.fillStyle = palette[floater.color] || floater.color; // 'good' | 'warn' | 'bad' 또는 색 값
      glow(context.fillStyle);
      // 톡 튀어나왔다가 제 크기로 (만점 틱은 조금 더 크게)
      const scale = (floater.age < 0.1 ? 0.5 + 0.8 * (floater.age / 0.1) : 1 + 0.3 * Math.max(0, 1 - (floater.age - 0.1) / 0.15)) * (floater.color === 'good' ? 1.05 : 0.9);
      context.font = `800 ${Math.round(baseRadius * 0.95)}px ${palette.font}`;
      context.save();
      context.translate(floaterX, floaterY);
      context.scale(scale, scale);
      context.fillText(floater.text, 0, 0);
      context.restore();
    }
    context.shadowBlur = 0;
    context.globalAlpha = 1;
  }

  // ---------- 풍경 라이딩 (운영 버전 app/ 의 화면 스타일, look.scenic) ----------
  // 하늘과 언덕이 점수만큼 흘러가고(먼 것일수록 느리게) 길 위에서 자전거가 달린다. 공 대신 자전거 배지,
  // 허용 구역은 길 위의 초록 구간이다. 배지 위 말풍선이 RPM 과 할 일을 글로 알려 준다 (색만으로 알리지 않는다).
  // 라운드가 흐르는 동안 하루가 지나간다: 아침 → 한낮 → 늦은 오후 → 해 질 녘 (dayT 0~1).
  // 하늘은 위와 지평선 두 색. 파랑에서 주황으로 바로 섞으면 중간이 잿빛이 되어서, 위는 파랑 계열로 두고 지평선만 물든다
  skyAt(dayProgress) {
    const { palette } = this;
    const keys = [[0, palette.skyDawn, palette.skyDawnLow], [0.35, palette.sky, palette.skyLow], [0.72, palette.skyGolden, palette.skyGoldenLow], [1, palette.skyDusk, palette.skyDuskLow]];
    for (let i = 1; i < keys.length; i++) {
      if (dayProgress <= keys[i][0]) {
        const [fromProgress, fromTop, fromLow] = keys[i - 1];
        const blend = (dayProgress - fromProgress) / (keys[i][0] - fromProgress);
        return [mix(fromTop, keys[i][1], blend), mix(fromLow, keys[i][2], blend)];
      }
    }
    return [palette.skyDusk, palette.skyDuskLow];
  }

  // 가까운 언덕의 구간 (나무 칸 i 기준). 숲 → 과수원 → 마을 → 풍차 들판을 돈다.
  // 경계에서는 칸마다 조금씩 섞여서 다음 풍경이 오른쪽에서부터 차츰 들어온다
  static region(slotIndex) {
    const regionNumber = Math.floor((slotIndex + hash(slotIndex + 3) * 8) / Band.REGION_SLOTS);
    return ((regionNumber % 4) + 4) % 4;
  }

  drawScenic() {
    const { context, viewWidth, viewHeight, palette } = this;
    const { tolerance, maxDeviation } = this.config;
    context.clearRect(0, 0, viewWidth, viewHeight);
    const scroll = this.travelled * Band.PX_PER_POINT;
    // tall: 속도 전환 구간에 카드가 화면 전체로 커지면 1. 카메라를 낮춰 길을 넓고 높게, 길 아래 풀밭을 보여 준다
    const tall = Util.clamp((viewHeight - 340) / 320, 0, 1);
    const roadHeight = Util.lerp(Util.clamp(viewHeight * 0.2, 44, 96), viewHeight * 0.17, tall);
    const roadCenterY = Util.lerp(viewHeight - roadHeight / 2 - Math.min(10, viewHeight * 0.03), viewHeight * 0.68, tall); // 길 한가운데 높이
    const roadTop = roadCenterY - roadHeight / 2;
    const baseRadius = Util.clamp(viewHeight * 0.12, 14, 30 + Math.max(0, viewHeight - 320) * 0.035);
    const day = Util.clamp(this.dayT || 0, 0, 1);
    const dusk = Util.clamp((day - 0.6) / 0.4, 0, 1);

    // 하늘
    const [skyTop, skyLow] = this.skyAt(day);
    const sky = context.createLinearGradient(0, 0, 0, roadTop - viewHeight * 0.08);
    sky.addColorStop(0, skyTop);
    sky.addColorStop(1, skyLow);
    context.fillStyle = sky;
    context.fillRect(0, 0, viewWidth, viewHeight);
    // 해: 낮은 곳에서 떠서 높이 지나 오른쪽 언덕 뒤로 진다. 왼쪽 위 시간 칩과 오른쪽 위 점수 칩 사이로 다닌다
    const sunRadius = Util.clamp(viewHeight * 0.11, 18, 64) * (1 + 0.3 * dusk);
    const sunX = viewWidth * Util.lerp(0.46, 0.84, day);
    const sunY = roadTop - Util.lerp(viewHeight * 0.2, viewHeight * 0.62, Math.sin(Math.PI * Util.lerp(0.12, 0.92, day)));
    context.fillStyle = mix(palette.sun, palette.sunDusk, dusk);
    context.beginPath();
    context.arc(sunX, Math.max(sunRadius + 6, sunY), sunRadius, 0, Math.PI * 2);
    context.fill();
    // 구름: 바람에 천천히 흐르고, 달릴수록 조금 더 빨리 지나간다
    const cloud = mix(palette.cloud, palette.cloudDusk, dusk);
    context.fillStyle = cloud;
    for (let cloudIndex = 0; cloudIndex < 4; cloudIndex++) {
      const span = viewWidth + 360;
      const cloudX = viewWidth + 180 - ((cloudIndex * 397 + hash(cloudIndex) * 200 + this.time * 7 + scroll * 0.05) % span);
      const cloudY = viewHeight * (0.1 + 0.16 * hash(cloudIndex + 11)) + roadTop * 0.1;
      const cloudSize = Util.clamp(viewHeight * 0.07, 12, 40) * (0.8 + 0.5 * hash(cloudIndex + 5));
      context.globalAlpha = 0.85;
      context.beginPath();
      context.arc(cloudX - cloudSize, cloudY, cloudSize * 0.7, 0, Math.PI * 2);
      context.arc(cloudX, cloudY - cloudSize * 0.35, cloudSize, 0, Math.PI * 2);
      context.arc(cloudX + cloudSize * 1.1, cloudY, cloudSize * 0.75, 0, Math.PI * 2);
      context.roundRect(cloudX - cloudSize * 1.7, cloudY - cloudSize * 0.1, cloudSize * 3.6, cloudSize * 0.75, cloudSize * 0.37);
      context.fill();
    }
    context.globalAlpha = 1;

    // 언덕: 사인 둘을 겹친 능선. off 만큼 흘러간다 (먼 것일수록 느리게)
    const ridge = (base, amplitude, offset, frequencyA, frequencyB) => (x) => base + amplitude * (0.6 * Math.sin((x + offset) * frequencyA) + 0.4 * Math.sin((x + offset) * frequencyB + 1.3));
    const hill = (ridgeAt, color) => {
      context.fillStyle = color;
      context.beginPath();
      context.moveTo(0, viewHeight);
      for (let x = 0; x <= viewWidth + 8; x += 8) context.lineTo(x, ridgeAt(x));
      context.lineTo(viewWidth + 8, viewHeight);
      context.closePath();
      context.fill();
    };
    hill(ridge(roadTop - viewHeight * 0.24, viewHeight * 0.07, scroll * 0.12, 0.0042, 0.011), palette.hillFar);
    const nearOffset = scroll * 0.35;
    const near = ridge(roadTop - viewHeight * 0.08, viewHeight * 0.045, nearOffset, 0.006, 0.017);
    hill(near, palette.hillNear);
    // 가까운 언덕 위의 풍경 (칸마다 정해진 무작위로 있거나 없고, 구간에 따라 종류가 바뀐다)
    const slotSpacing = 150;
    const size = Util.clamp(viewHeight * 0.1, 14, 60);
    for (let i = Math.floor((nearOffset - 160) / slotSpacing); i * slotSpacing - nearOffset < viewWidth + 100; i++) {
      const region = Band.region(i);
      if (hash(i) < [0.45, 0.22, 0.28, 0.35][region]) continue; // 구간마다 빽빽한 정도가 다르다
      const x = i * slotSpacing - nearOffset + hash(i + 99) * 60;
      const propHeight = size * (0.75 + 0.5 * hash(i + 7));
      const y = near(x) + propHeight * 0.15;
      const pick = hash(i + 31);
      if (region === 0) drawPine(this, x, y, propHeight);
      else if (region === 1) drawRoundTree(this, x, y, propHeight, pick > 0.5);
      else if (region === 2) pick > 0.35 ? drawHouse(this, x, y, propHeight, pick) : drawRoundTree(this, x, y, propHeight, false);
      else pick > 0.45 ? drawWindmill(this, x, y, propHeight * 1.35, i) : drawFlowerPatch(this, x, y, propHeight, i);
    }
    // 해 질 녘에는 풍경 전체가 노을빛으로 물든다 (길과 자전거는 그대로 또렷하게)
    if (dusk > 0) {
      context.globalCompositeOperation = 'multiply';
      context.globalAlpha = 0.4 * dusk;
      context.fillStyle = palette.duskTint;
      context.fillRect(0, 0, viewWidth, viewHeight);
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1;
    }

    let centerX = viewWidth / 2;
    const extent = viewWidth;
    let trackHalf = Math.max(120, viewWidth / 2 - 230);
    // 좁은 화면(휴대폰)에서는 트랙 끝이 오른쪽 아래 '그만하기' 단추 밑으로 들어간다. 자전거가 단추 높이에 있으면
    // 트랙을 단추 왼쪽 자리에 맞게 줄이고 옮긴다 (카드가 커져 길이 단추보다 위로 가거나 단추가 숨으면 제자리로 미끄러져 돌아온다)
    const end = this.endRect;
    const reach = baseRadius + 6;
    const bikeY = roadCenterY - roadHeight * 0.12;
    this.dodgeTo = end && !this.brainOnly && bikeY + reach > end.top && bikeY - reach < end.bottom && centerX + trackHalf + reach > end.left ? 1 : 0;
    if (this.dodge == null) this.dodge = this.dodgeTo;
    if (end && this.dodge > 0.001) {
      const half = Math.min(trackHalf, Math.max(60, (end.left - 2 * reach) / 2));
      trackHalf = Util.lerp(trackHalf, half, this.dodge);
      centerX = Util.lerp(centerX, Math.min(centerX, reach + half), this.dodge);
    }
    const zoneHalf = trackHalf * (tolerance / maxDeviation);
    context.save();
    context.translate(centerX, roadCenterY);
    context.rotate(-this.theta);

    // 길과 그 아래 풀밭 (기울어도 아래가 비지 않게 넉넉히)
    context.fillStyle = palette.grass;
    context.fillRect(-extent, roadHeight / 2, extent * 2, viewHeight);
    // 길 아래에 자리가 넉넉하면(속도 전환 구간) 길가의 꽃과 덤불이 가장 빨리 지나간다
    const below = viewHeight - roadCenterY - roadHeight / 2;
    if (below > 40) drawRoadside(this, extent, roadHeight / 2, below, scroll * 1.25, Util.clamp((below - 40) / 80, 0, 1));
    // 길 건너편의 낮은 언덕 (길과 함께 기울고 점수만큼 흘러간다). 입체 언덕의 앞쪽 비탈을 보는 것으로 여긴다:
    // 기념물(마을)은 그 앞 비탈, 꼭대기보다 아래·길보다 위에 선다. 언덕을 먼저 그리고 기념물을 그 앞에 그려 가려지지 않는다.
    // 꼭대기는 길 윗선에서 verge × 0.9 ~ 2.0 위, 밑동은 verge × 0.45 위라 건물 아랫부분 뒤로 늘 언덕 비탈이 보인다
    const verge = Util.clamp(baseRadius * 0.85, 10, 32);
    const crest = (x) => -roadHeight / 2 - verge * (1.45 + 0.35 * Math.sin((x + scroll) * 0.009) + 0.2 * Math.sin((x + scroll) * 0.023 + 1.7));
    drawRoadsideHill(this, extent, -roadHeight / 2, crest, verge);
    this.drawLandmarks(this.landmarkItems(baseRadius, extent), baseRadius, -roadHeight / 2 - verge * 0.45);
    // 점수 깃발도 같은 비탈에 똑바로 (기념물 앞에 그려 가려지지 않게)
    this.drawScenicFlags(extent, baseRadius, -roadHeight / 2 - verge * 0.45);
    context.fillStyle = palette.road;
    context.fillRect(-extent, -roadHeight / 2, extent * 2, roadHeight);
    context.fillStyle = palette.roadEdge;
    context.fillRect(-extent, -roadHeight / 2, extent * 2, Math.max(2, roadHeight * 0.06));
    context.fillRect(-extent, roadHeight / 2 - Math.max(2, roadHeight * 0.06), extent * 2, Math.max(2, roadHeight * 0.06) * tall);
    // 흘러가는 차선
    const dash = Util.clamp(roadHeight * 0.6, 24, 44);
    const period = dash * 1.7;
    const laneHeight = Math.max(3, roadHeight * 0.07);
    context.fillStyle = palette.roadMark;
    for (let x = -extent - (scroll % period); x < extent; x += period) context.fillRect(x, roadHeight * 0.24 - laneHeight / 2, dash, laneHeight);

    // 허용 구역: 길 위의 초록 구간과 양옆 점선 기둥 (두뇌 게임만 하는 판에는 없다)
    const gateTop = -roadHeight / 2 - baseRadius * 1.3;
    if (!this.brainOnly) {
      context.globalAlpha = 0.6;
      context.fillStyle = palette.zone;
      context.fillRect(-zoneHalf, -roadHeight / 2, zoneHalf * 2, roadHeight);
      context.globalAlpha = 1;
      context.strokeStyle = palette.panel;
      context.lineWidth = Math.max(3, baseRadius * 0.12);
      context.setLineDash([8, 6]);
      context.beginPath();
      context.moveTo(-zoneHalf, gateTop);
      context.lineTo(-zoneHalf, roadHeight / 2);
      context.moveTo(zoneHalf, gateTop);
      context.lineTo(zoneHalf, roadHeight / 2);
      context.stroke();
      context.setLineDash([]);
    }

    // 자전거 배지 (정답 직후에는 잠깐 커지면서 초록으로 물든다). 나무를 심을 때는 앞으로 비켜 간다
    const shift = this.endShift * this.endShift * (3 - 2 * this.endShift);
    const ballCenterX = this.ballX * trackHalf + shift * Math.min(trackHalf * 0.6, viewWidth * 0.22);
    const ballRadius = baseRadius * (1 + 0.25 * this.pop);
    const ballCenterY = -roadHeight * 0.12;
    this.drawRings(trackHalf, ballCenterY, baseRadius);
    const fontSize = Math.round(Util.clamp(baseRadius * 0.62, 13, 30));
    if (this.brainOnly) {
      // 두뇌 배지만. 말풍선(RPM)과 '여기에 맞춰 달려요' 없이, 알림(최고 기록 등)은 말풍선이 있던 자리 위에 뜬다
      drawBrainBadge(this, ballCenterX, ballCenterY, ballRadius);
      this.drawFloaters(trackHalf, ballCenterY - baseRadius - fontSize * 0.6 - Math.round(fontSize * 1.9) - 4, baseRadius);
      context.restore();
      return;
    }
    context.fillStyle = palette.panel;
    context.beginPath();
    context.arc(ballCenterX, ballCenterY, ballRadius, 0, Math.PI * 2);
    context.fill();
    if (this.pop > 0) {
      context.globalAlpha = this.pop;
      context.fillStyle = palette.goodSoft;
      context.fill();
      context.globalAlpha = 1;
    }
    context.lineWidth = Math.max(3, ballRadius * 0.15);
    context.strokeStyle = this.inZone ? palette.accent : palette.warn;
    context.stroke();
    drawBike(this, ballCenterX, ballCenterY, ballRadius);

    // 말풍선: RPM 과 할 일
    const tip = this.inZone ? '좋아요' : this.slowSide ? '더 빠르게 ›' : '‹ 조금 천천히';
    const rpmText = `${Math.round(this.rpm)} rpm`;
    context.font = `900 ${fontSize}px ${palette.font}`;
    const rpmWidth = context.measureText(rpmText).width;
    context.font = `700 ${fontSize}px ${palette.fontText}`;
    const tipWidth = context.measureText(tip).width;
    const padX = fontSize * 0.8;
    const gapX = fontSize * 0.55;
    const bubbleHeight = Math.round(fontSize * 1.9);
    const bubbleWidth = padX * 2 + rpmWidth + gapX + tipWidth;
    const bubbleX = Util.clamp(ballCenterX, -centerX + bubbleWidth / 2 + 12, viewWidth - centerX - bubbleWidth / 2 - 12);
    const bubbleTop = ballCenterY - baseRadius - fontSize * 0.6 - bubbleHeight; // 배지가 커져도 말풍선은 제자리
    context.globalAlpha = 1 - this.endShift;
    context.fillStyle = palette.ink;
    context.beginPath();
    context.roundRect(bubbleX - bubbleWidth / 2, bubbleTop, bubbleWidth, bubbleHeight, bubbleHeight / 2);
    context.fill();
    const tailX = Util.clamp(ballCenterX, bubbleX - bubbleWidth / 2 + bubbleHeight / 2, bubbleX + bubbleWidth / 2 - bubbleHeight / 2);
    context.beginPath();
    context.moveTo(tailX - fontSize * 0.45, bubbleTop + bubbleHeight - 1);
    context.lineTo(tailX, bubbleTop + bubbleHeight + fontSize * 0.45);
    context.lineTo(tailX + fontSize * 0.45, bubbleTop + bubbleHeight - 1);
    context.fill();
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillStyle = palette.onAccent;
    context.font = `900 ${fontSize}px ${palette.font}`;
    context.fillText(rpmText, bubbleX - bubbleWidth / 2 + padX, bubbleTop + bubbleHeight / 2 + 1);
    context.fillStyle = this.inZone ? palette.tipGood : palette.tipWarn;
    context.font = `700 ${fontSize}px ${palette.fontText}`;
    context.fillText(tip, bubbleX - bubbleWidth / 2 + padX + rpmWidth + gapX, bubbleTop + bubbleHeight / 2 + 1);
    context.globalAlpha = 1;

    // 구역 밖에 있을 때만 구역 위에 '여기에 맞춰 달려요' 표지 (말풍선보다 위에 두어 겹치지 않게).
    // 속도 전환 구간에는 안내 카드가 같은 말을 하므로 숨긴다
    const hintAlpha = Util.clamp(this.outAmount * 2, 0, 1) * (1 - tall);
    if (hintAlpha > 0) {
      const text = '여기에 맞춰 달려요';
      context.font = `700 ${fontSize}px ${palette.fontText}`;
      const hintWidth = context.measureText(text).width + fontSize * 1.4;
      const hintHeight = Math.round(fontSize * 1.7);
      // 위쪽 칩 밑으로 들어가면 그만큼 내린다 (휴대폰: 칩과 말풍선 사이가 좁다)
      let hintY = bubbleTop - hintHeight - 8;
      hintY += this.hudDepth(-hintWidth / 2, hintY, hintWidth / 2, hintY + hintHeight) + (this.hudDepth(-hintWidth / 2, hintY, hintWidth / 2, hintY + hintHeight) ? 2 : 0);
      context.globalAlpha = hintAlpha;
      context.fillStyle = palette.panel;
      context.beginPath();
      context.roundRect(-hintWidth / 2, hintY, hintWidth, hintHeight, hintHeight / 2);
      context.fill();
      context.fillStyle = palette.ink;
      context.textAlign = 'center';
      context.fillText(text, 0, hintY + hintHeight / 2 + 1);
      context.globalAlpha = 1;
    }

    this.drawFloaters(trackHalf, bubbleTop - 4, baseRadius, undefined, { left: bubbleX - bubbleWidth / 2, right: bubbleX + bubbleWidth / 2, y: bubbleTop + bubbleHeight / 2, maxX: viewWidth - centerX - 8 });
    context.restore();
  }

  // ----- 기념물 -----
  // 화면 근처의 기념물과 그 터 [left, right] (밑면 + 팻말). 길가 언덕 앞 비탈에 그린다
  landmarkItems(baseRadius, extent) {
    const { context, viewWidth, palette } = this;
    const landmarkHeight = baseRadius * 1.8;
    const screenXOf = (score) => (score - this.travelled) * Band.PX_PER_POINT;
    // 양옆의 시간·점수 표시와 겹치지 않게 가장자리에서는 사라진다 (깃발과 같은 규칙)
    const fade = (x) => Util.clamp((viewWidth / 2 - 170 - Math.abs(x)) / 100, 0, 1);
    // 날짜 팻말은 곧 지나갈 기념물 하나에만: 자전거 조금 앞(ahead, 가운데 말풍선에 가리지 않는 자리)에 가장 가까운 것.
    // 다가오면 나타났다가 자전거에 닿기 전에 사라진다.
    // 비슷한 점수가 모여 마을이 되면 팻말이 건물 사이에 빽빽하게 끼어 어수선했다 (2026-11-05)
    const ahead = Math.max(120, viewWidth / 2 - 230) * 0.55;
    let near = null;
    for (const landmark of this.landmarks) {
      const distance = Math.abs(screenXOf(landmark.score) - ahead);
      if (landmark.tag && (!near || distance < near.distance)) near = { landmark, distance };
    }
    const tagAlpha = near ? Util.clamp(1 - (near.distance - landmarkHeight * 0.6) / (landmarkHeight * 1.2), 0, 1) : 0;
    const fontSize = Math.round(Util.clamp(baseRadius * 0.42, 10, 18));
    context.font = `800 ${fontSize}px ${palette.font}`;
    const items = [];
    const add = (landmark, x, tag, extra) => {
      const foot = footprint(landmark.kind, landmark.size, landmarkHeight);
      const tagWidth = tag ? context.measureText(tag).width + fontSize * 0.7 : 0;
      const rightReach = tag ? foot.sign + landmarkHeight * 0.06 + tagWidth : foot.body;
      items.push({ landmark, x, tag, left: x - foot.body - landmarkHeight * 0.12, right: x + rightReach + landmarkHeight * 0.12, ...extra });
    };
    for (const landmark of this.landmarks) {
      const x = screenXOf(landmark.score);
      if (Math.abs(x) > extent + landmarkHeight * 2) continue;
      const alpha = fade(x);
      const showTag = alpha > 0 && tagAlpha > 0 && near.landmark === landmark;
      add(landmark, x, showTag ? landmark.tag : '', { alpha, tagAlpha: showTag ? tagAlpha : 0 });
    }
    if (this.planting) add(this.planting, screenXOf(this.planting.score), '오늘', { planting: true, alpha: 1 });
    return items;
  }

  // 풍경 라이딩의 점수 깃발: 기념물처럼 길가 언덕 앞 비탈(baseY)에 똑바로 선 동화책 풍 깃발.
  // 나무 깃대 + 금색 꼭지, 바람에 흔들리는 천(제 색을 조금 어둡게 한 윤곽), 밑에 옅은 그림자, 옆에 점수 (밝은 테두리로 언덕 위에서도 읽힌다).
  // 색: 아직 안 지난 깃발은 크림색, 1000점마다 큰 깃발은 강조색, 지난 깃발은 금색 (초록은 언덕에 묻힌다). 지나는 순간 커졌다 돌아온다
  drawScenicFlags(extent, baseRadius, baseY) {
    const { context, viewWidth, palette } = this;
    const tone = (color) => mix(color, '#3a2a20', 0.3);
    const first = Math.max(Band.MARK_EVERY, Math.ceil((this.travelled - extent / Band.PX_PER_POINT) / Band.MARK_EVERY) * Band.MARK_EVERY);
    for (let milestone = first; (milestone - this.travelled) * Band.PX_PER_POINT < extent; milestone += Band.MARK_EVERY) {
      const x = (milestone - this.travelled) * Band.PX_PER_POINT;
      // 양옆의 시간·점수 표시와 겹치지 않게 가장자리에서는 사라진다
      const alpha = Util.clamp((viewWidth / 2 - 170 - Math.abs(x)) / 100, 0, 1);
      if (alpha <= 0) continue;
      const big = milestone % Band.MARK_BIG === 0;
      const done = milestone <= this.travelled;
      const pop = this.passed && this.passed.milestone === milestone ? Math.max(0, 1 - this.passed.age / Band.POP_SEC) : 0;
      const scale = 1 + 0.35 * pop;
      const poleHeight = baseRadius * (big ? 2.2 : 1.65) * scale;          // 깃대 높이
      const flagWidth = baseRadius * (big ? 1.25 : 0.9) * scale;           // 천 너비
      const flagHeight = flagWidth * 0.72;
      const cloth = done ? '#f5b301' : big ? palette.accent : '#fff4dc';
      const lineWidth = Math.max(1.2, baseRadius * 0.07);
      context.save();
      context.globalAlpha = alpha;
      context.translate(x, baseY);
      context.rotate(this.theta);
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.fillStyle = 'rgba(30, 60, 35, 0.22)';
      context.beginPath();
      context.ellipse(baseRadius * 0.08, 0, baseRadius * 0.32, baseRadius * 0.09, 0, 0, Math.PI * 2);
      context.fill();
      // 깃대
      context.strokeStyle = tone(palette.trunk);
      context.lineWidth = lineWidth * 2.4;
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(0, -poleHeight);
      context.stroke();
      context.strokeStyle = palette.trunk;
      context.lineWidth = lineWidth * 1.3;
      context.stroke();
      // 천: 깃대에서 펄럭이며 끝이 두 갈래
      const top = -poleHeight + baseRadius * 0.12;
      const wave = Math.sin(this.time * 3 + milestone * 0.01) * flagHeight * 0.12;
      context.beginPath();
      context.moveTo(0, top);
      context.quadraticCurveTo(flagWidth * 0.5, top - flagHeight * 0.12 + wave, flagWidth, top + wave);
      context.lineTo(flagWidth * 0.78, top + flagHeight * 0.5 + wave);
      context.lineTo(flagWidth, top + flagHeight + wave);
      context.quadraticCurveTo(flagWidth * 0.5, top + flagHeight * 0.88 + wave, 0, top + flagHeight);
      context.closePath();
      context.fillStyle = cloth;
      context.fill();
      context.strokeStyle = tone(cloth);
      context.lineWidth = lineWidth;
      context.stroke();
      // 꼭지
      context.fillStyle = '#f5d36b';
      context.beginPath();
      context.arc(0, -poleHeight, lineWidth * 1.6, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = tone('#f5d36b');
      context.stroke();
      // 점수
      context.font = `800 ${Math.round(baseRadius * (big ? 0.7 : 0.55) * scale)}px ${palette.font}`;
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      const labelX = flagWidth + baseRadius * 0.18;
      const labelY = top + flagHeight / 2 + wave;
      context.lineWidth = Math.max(2.5, baseRadius * 0.14);
      context.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      context.strokeText(String(milestone), labelX, labelY);
      context.fillStyle = done ? tone('#f5b301') : big ? palette.accent : palette.ink;
      context.fillText(String(milestone), labelX, labelY);
      context.restore();
    }
  }

  // items = landmarkItems, baseY = 밑동 높이 (길가 언덕의 앞 비탈, 길 윗선에서 조금 위). 화면 가운데가 지금 점수 자리다
  drawLandmarks(items, baseRadius, baseY) {
    const { context, palette } = this;
    const landmarkHeight = baseRadius * 1.8;
    let plantingItem = null;
    for (const item of items) {
      if (item.planting) {
        plantingItem = item;
        continue;
      }
      if (item.alpha <= 0) continue;
      context.globalAlpha = item.alpha;
      drawLandmark(this, item.landmark, item.x, baseY, landmarkHeight * (1 + 0.35 * item.landmark.pop), '', baseRadius);
    }
    // 날짜 팻말은 모든 건물 위에 (이웃 건물에 가려지지 않게)
    for (const item of items) {
      if (!item.tag || item.planting || item.alpha <= 0) continue;
      context.globalAlpha = item.alpha * item.tagAlpha;
      const poppedHeight = landmarkHeight * (1 + 0.35 * item.landmark.pop);
      context.save();
      context.translate(item.x, baseY);
      context.rotate(this.theta);
      drawSign(this, item.landmark, poppedHeight, item.tag, baseRadius);
      context.restore();
    }
    context.globalAlpha = 1;
    if (!plantingItem) return;
    const x = plantingItem.x;
    const planting = this.planting;
    // 짓기 연출 (Band.BUILD_*): 풍경이 커지고 자전거가 비켜 간 뒤 → 터(흙)를 고르고 → 층마다 한 단계씩 아래부터 쌓아 올리고
    // (단계마다 통통 튀며 흙먼지) → 지붕까지 올리면 반짝이며 '오늘' 팻말과 이름표가 바뀐다
    const buildTime = planting.elapsed - Band.BUILD_DELAY;
    if (buildTime <= 0) return;
    const full = heightOf(planting.kind, planting.size, landmarkHeight);
    // 터: 흙 둔덕
    const moundGrowth = Util.clamp(buildTime / 0.3, 0, 1);
    context.fillStyle = palette.trunk;
    context.beginPath();
    context.ellipse(x, baseY, landmarkHeight * 0.5 * moundGrowth, landmarkHeight * 0.1 * moundGrowth, 0, Math.PI, 0);
    context.fill();
    const stage = (buildTime - Band.BUILD_LEAD) / Band.BUILD_STEP; // 지금 몇 번째 단계인가 (소수)
    const overshoot = 1.70158;
    const back = (stepProgress) => 1 + (overshoot + 1) * (stepProgress - 1) ** 3 + overshoot * (stepProgress - 1) ** 2; // 살짝 넘쳤다 돌아오는 증가
    // 단계가 시작할 때마다 밑동에서 흙먼지
    if (stage > 0 && stage < planting.steps + 0.6) {
      const dustPhase = stage - Math.floor(stage);
      context.fillStyle = '#d8d2c4';
      context.globalAlpha = 0.75 * (1 - dustPhase);
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          context.beginPath();
          context.arc(x + side * landmarkHeight * (0.4 + dustPhase * 0.45 + i * 0.12), baseY - landmarkHeight * (0.04 + i * 0.07 + dustPhase * 0.1), landmarkHeight * (0.06 + dustPhase * 0.06), 0, Math.PI * 2);
          context.fill();
        }
      }
      context.globalAlpha = 1;
    }
    const done = planting.elapsed >= planting.doneAt;
    if (stage > 0) {
      if (Landmarks.isBuilding(planting.kind)) {
        // 아래부터 단계만큼 드러낸다 (단계마다 톡 튀어 오른다)
        const step = Math.min(Math.floor(stage), planting.steps - 1);
        const stepProgress = Util.clamp((stage - step) / 0.75, 0, 1); // 한 단계의 앞 3/4 동안 올라간다
        const reveal = done ? 1 : (step + back(stepProgress)) / planting.steps;
        context.save();
        context.translate(x, baseY);
        context.rotate(this.theta);
        context.beginPath();
        context.rect(-landmarkHeight * 3, -full * Math.min(1.08, reveal) - landmarkHeight * 0.05, landmarkHeight * 6, full * Math.min(1.08, reveal) + landmarkHeight * 0.3);
        context.restore();
        context.save();
        context.clip();
        drawLandmark(this, planting, x, baseY, landmarkHeight, '', baseRadius);
        context.restore();
        if (done) {
          context.save();
          context.translate(x, baseY);
          context.rotate(this.theta);
          drawSign(this, planting, landmarkHeight, '오늘', baseRadius);
          context.restore();
        }
      } else {
        // 바람개비·풍선·돌탑: 한 번에 톡 솟는다
        const grow = back(Util.clamp(stage, 0, 1));
        if (grow > 0.02) drawLandmark(this, planting, x, baseY, landmarkHeight * grow, done ? '오늘' : '', baseRadius);
      }
    }
    // 다 지은 순간 반짝임
    const sparkle = (planting.elapsed - planting.doneAt) / 1.25;
    if (sparkle > 0 && sparkle < 1) {
      context.fillStyle = palette.sun;
      for (let i = 0; i < 8; i++) {
        const angle = -Math.PI / 2 + (i - 3.5) * 0.42;
        const sparkleDistance = landmarkHeight * (0.6 + sparkle * 1.0);
        context.globalAlpha = 1 - sparkle;
        context.beginPath();
        context.arc(x + Math.cos(angle) * sparkleDistance, baseY - full * 0.55 + Math.sin(angle) * sparkleDistance * 0.7, Math.max(2, baseRadius * 0.12) * (1 - sparkle * 0.5), 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    }
    // 이름표: 짓는 동안 '오늘 기록으로 짓는 중…', 다 지으면 'N번째 기록 · 집을 지었어요'. 다 지은 높이 위에 미리 자리를 잡아 움직이지 않는다
    if (planting.label) {
      const text = done ? planting.label : '오늘 기록으로 짓는 중…';
      const fontSize = Math.round(Util.clamp(baseRadius * 0.6, 13, 26));
      context.font = `700 ${fontSize}px ${palette.fontText}`;
      const labelWidth = context.measureText(text).width + fontSize * 1.4;
      const labelHeight = Math.round(fontSize * 1.75);
      const labelY = -full - labelHeight - 10;
      const pop = done ? Math.max(0, 1 - (planting.elapsed - planting.doneAt) / 0.35) : 0;
      context.save();
      context.translate(x, baseY);
      context.rotate(this.theta);
      // 카드가 다시 줄어 이름표가 위쪽 칩 밑으로 들어가면 흐려 지운다 (휴대폰: 칩이 가로를 다 차지한다)
      const hidden = Util.clamp(this.hudDepth(-labelWidth / 2, labelY, labelWidth / 2, labelY + labelHeight) / 16, 0, 1);
      context.globalAlpha = Util.clamp(buildTime / 0.3, 0, 1) * (1 - hidden);
      context.translate(0, labelY + labelHeight / 2);
      context.scale(1 + 0.15 * pop, 1 + 0.15 * pop);
      context.fillStyle = done ? palette.ink : 'rgba(29, 43, 36, 0.78)';
      context.beginPath();
      context.roundRect(-labelWidth / 2, -labelHeight / 2, labelWidth, labelHeight, labelHeight / 2);
      context.fill();
      context.fillStyle = palette.onAccent;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, 0, 1);
      context.restore();
    }
  }

  // ----- 풍경 소품. (x, y) = 밑동, h = 크기 -----
}
