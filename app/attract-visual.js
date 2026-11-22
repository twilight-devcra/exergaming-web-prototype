// 대기 화면 오른쪽 그림 (운영 버전만): 바퀴 안의 두뇌.
// 바퀴가 한 바퀴 돌 때마다 불꽃이 두뇌로 들어가고, 신경망이 이어지며 차례로 밝아진다 — '페달을 밟으면 두뇌가 깨어난다'.
// 아무도 없으면 천천히 돌고, 대기 화면에서 페달을 밟으면 그 속도로 빨라진다. Demo.tick 이 대기 화면에서 매 프레임 부른다.
import { Util } from '../js/config.js';
import { mix } from '../js/paint.js';

export const AttractVisual = {
  // 옆에서 본 두뇌 (왼쪽이 앞). 가로 -1~1, 세로 대략 -0.8~0.8. 로고(app/logo.svg)도 같은 모양을 쓴다
  BRAIN: 'M-0.95 0.05 C-1 -0.45 -0.6 -0.8 -0.1 -0.8 C0.45 -0.82 0.95 -0.5 0.95 -0.05 C0.97 0.25 0.85 0.42 0.62 0.45 ' +
    'C0.7 0.62 0.5 0.75 0.3 0.66 C0.22 0.62 0.18 0.56 0.15 0.52 L0.13 0.8 L0.01 0.8 L0.02 0.5 ' +
    'C-0.2 0.55 -0.45 0.5 -0.55 0.38 C-0.8 0.42 -0.92 0.28 -0.95 0.05 Z',
  IDLE_RPM: 36,      // 아무도 없을 때 바퀴가 도는 빠르기
  HOP_SEC: 0.1,      // 신호가 이웃한 신경 하나를 건너가는 시간
  GLOW_SEC: 1.1,     // 밝아진 신경이 다시 어두워지는 시간
  SPARK_SEC: 0.45,   // 바퀴에서 두뇌까지 불꽃이 날아가는 시간

  init(app) {
    const canvas = document.getElementById('att-brain');
    if (!canvas) return null;
    this.app = app;
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.path = new Path2D(this.BRAIN);
    this.angle = -Math.PI / 2;
    this.revolutions = 0;
    this.time = 0;           // 흐른 시간 (s)
    this.rpm = this.IDLE_RPM;
    this.sparks = [];        // 날아가는 불꽃 { firedAt, target(신경 번호), angle(나온 바퀴 자리) }
    this.waves = [];         // 퍼지는 물결 { startedAt, hops(신경마다 떨어진 걸음 수) }
    this.buildNetwork();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
    return this;
  },

  // 두뇌 안에 신경(점)을 고르게 뿌리고 가까운 것끼리 잇는다. 매번 같은 모양이 나오도록 정해진 난수를 쓴다
  buildNetwork() {
    let seed = 7;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let mixed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
    const hitTest = document.createElement('canvas').getContext('2d');
    hitTest.setTransform(100, 0, 0, 100, 200, 200);
    const inside = (x, y) => [[0, 0], [0.07, 0], [-0.07, 0], [0, 0.07], [0, -0.07]]
      .every(([offsetX, offsetY]) => hitTest.isPointInPath(this.path, 200 + 100 * (x + offsetX), 200 + 100 * (y + offsetY)));
    // 신경 { x, y, size(점 크기 배율) }
    const nodes = [];
    for (let attempt = 0; attempt < 4000 && nodes.length < 46; attempt++) {
      const x = random() * 2 - 1;
      const y = random() * 1.6 - 0.8;
      if (y > 0.5 || !inside(x, y)) continue; // 뇌줄기에는 두지 않는다
      if (nodes.some((node) => Math.hypot(node.x - x, node.y - y) < 0.2)) continue;
      nodes.push({ x, y, size: 0.7 + random() * 0.6 });
    }
    const edges = [];
    const neighbors = nodes.map(() => []);
    nodes.forEach((node, i) => {
      nodes
        .map((other, j) => ({ j, distance: Math.hypot(other.x - node.x, other.y - node.y) }))
        .filter((candidate) => candidate.j !== i && candidate.distance < 0.36)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3)
        .forEach(({ j }) => {
          if (neighbors[i].includes(j)) return;
          neighbors[i].push(j);
          neighbors[j].push(i);
          edges.push([i, j]);
        });
    });
    this.nodes = nodes;
    this.edges = edges;
    this.neighbors = neighbors;
  },

  resize() {
    const pixelRatio = window.devicePixelRatio || 1;
    const bounds = this.canvas.getBoundingClientRect();
    this.width = bounds.width;
    this.height = bounds.height;
    this.canvas.width = Math.round(bounds.width * pixelRatio);
    this.canvas.height = Math.round(bounds.height * pixelRatio);
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.draw();
  },

  // 한 신경에서 시작해 이웃을 따라 퍼지는 물결. 신경마다 몇 걸음 떨어졌는지 미리 센다
  startWave(startNode) {
    const hops = this.nodes.map(() => Infinity);
    hops[startNode] = 0;
    const queue = [startNode];
    while (queue.length) {
      const i = queue.shift();
      for (const j of this.neighbors[i]) if (hops[j] === Infinity) { hops[j] = hops[i] + 1; queue.push(j); }
    }
    this.waves.push({ startedAt: this.time, hops });
  },

  tick(deltaSeconds, rpm = 0) {
    deltaSeconds = Math.min(deltaSeconds, 0.1);
    this.time += deltaSeconds;
    // 페달을 밟으면 그 속도로, 아니면 천천히
    this.rpm = Util.lerp(this.rpm, Math.max(this.IDLE_RPM, Math.min(rpm, 110)), 1 - Math.exp(-deltaSeconds / 0.5));
    this.angle += (this.rpm / 60) * Math.PI * 2 * deltaSeconds;
    const revolutions = Math.floor((this.angle + Math.PI / 2) / (Math.PI * 2));
    if (revolutions > this.revolutions) {
      this.revolutions = revolutions;
      // 바퀴 꼭대기에서 불꽃이 나와 두뇌 윗부분 아무 신경으로 날아간다
      const upperNodes = this.nodes.map((node, i) => ({ i, y: node.y })).filter((candidate) => candidate.y < -0.2);
      const target = upperNodes[Math.floor(Math.random() * upperNodes.length)].i;
      this.sparks.push({ firedAt: this.time, target, angle: this.angle });
    }
    this.sparks = this.sparks.filter((spark) => {
      if (this.time - spark.firedAt < this.SPARK_SEC) return true;
      this.startWave(spark.target);
      return false;
    });
    this.waves = this.waves.filter((wave) => this.time - wave.startedAt < 12 * this.HOP_SEC + this.GLOW_SEC);
    this.draw();
  },

  // 신경 하나의 밝기 0~1 (여러 물결 중 가장 밝은 것)
  glow(i) {
    let brightness = 0;
    for (const wave of this.waves) {
      const sinceArrival = this.time - wave.startedAt - wave.hops[i] * this.HOP_SEC;
      if (sinceArrival < 0) continue;
      brightness = Math.max(brightness, sinceArrival < 0.08 ? sinceArrival / 0.08 : Math.exp(-(sinceArrival - 0.08) / (this.GLOW_SEC * 0.4)));
    }
    return brightness;
  },

  draw() {
    const { context, width, height } = this;
    if (!width || !height) return;
    const bodyStyle = getComputedStyle(document.body);
    const cssColor = (name) => bodyStyle.getPropertyValue(name).trim();
    const accent = cssColor('--accent'), good = cssColor('--good'), zone = cssColor('--zone'), line = cssColor('--line'), panel = cssColor('--panel');
    context.clearRect(0, 0, width, height);
    const size = Math.min(width, height);
    const centerX = width / 2, centerY = height / 2;
    const wheelRadius = size * 0.45;
    const ringWidth = size * 0.04;

    // 바퀴: 옅은 테두리 위로 파란 띠가 돌고, 앞머리에 페달처럼 흰 점
    context.lineCap = 'round';
    context.lineWidth = ringWidth;
    context.strokeStyle = line;
    context.beginPath();
    context.arc(centerX, centerY, wheelRadius, 0, Math.PI * 2);
    context.stroke();
    const angle = this.angle;
    for (let segment = 0; segment < 24; segment++) {
      context.globalAlpha = Math.pow(1 - segment / 24, 1.6);
      context.strokeStyle = accent;
      context.beginPath();
      context.arc(centerX, centerY, wheelRadius, angle - (segment + 1) * 0.07, angle - segment * 0.07 + 0.01);
      context.stroke();
    }
    context.globalAlpha = 1;
    const headX = centerX + Math.cos(angle) * wheelRadius, headY = centerY + Math.sin(angle) * wheelRadius;
    context.fillStyle = panel;
    context.strokeStyle = accent;
    context.lineWidth = ringWidth * 0.35;
    context.beginPath();
    context.arc(headX, headY, ringWidth * 0.75, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    // 두뇌: 흰 바탕 위 신경망
    const brainScale = wheelRadius * 0.74;
    const brainX = centerX, brainY = centerY - wheelRadius * 0.02;
    const toScreen = (node) => [brainX + node.x * brainScale, brainY + node.y * brainScale];
    context.save();
    context.translate(brainX, brainY);
    context.scale(brainScale, brainScale);
    context.shadowColor = 'rgba(29, 43, 36, 0.12)';
    context.shadowBlur = 30;
    context.shadowOffsetY = 8;
    context.fillStyle = panel;
    context.fill(this.path);
    context.shadowColor = 'transparent';
    context.lineWidth = 3 / brainScale;
    context.strokeStyle = 'rgba(21, 128, 61, 0.22)';
    context.stroke(this.path);
    context.restore();

    const nodeGlows = this.nodes.map((_, i) => this.glow(i));
    context.lineWidth = Math.max(1.5, size * 0.004);
    for (const [i, j] of this.edges) {
      const [fromX, fromY] = toScreen(this.nodes[i]);
      const [toX, toY] = toScreen(this.nodes[j]);
      const edgeGlow = Math.min(nodeGlows[i], nodeGlows[j]);
      context.strokeStyle = line;
      context.globalAlpha = 1;
      context.beginPath();
      context.moveTo(fromX, fromY);
      context.lineTo(toX, toY);
      context.stroke();
      if (edgeGlow > 0.02) {
        context.strokeStyle = zone;
        context.globalAlpha = edgeGlow;
        context.stroke();
      }
    }
    context.globalAlpha = 1;
    const nodeRadius = size * 0.011;
    this.nodes.forEach((node, i) => {
      const [x, y] = toScreen(node);
      const glow = nodeGlows[i];
      if (glow > 0.02) {
        context.globalAlpha = glow * 0.35;
        context.fillStyle = zone;
        context.beginPath();
        context.arc(x, y, nodeRadius * node.size * (1.4 + 1.4 * glow), 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      }
      context.fillStyle = glow > 0.02 ? mix('#b9d7c3', good, glow) : '#b9d7c3';
      context.beginPath();
      context.arc(x, y, nodeRadius * node.size * (1 + 0.5 * glow), 0, Math.PI * 2);
      context.fill();
    });

    // 바퀴에서 두뇌로 날아가는 불꽃
    for (const spark of this.sparks) {
      const progress = Util.clamp((this.time - spark.firedAt) / this.SPARK_SEC, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 2);
      const [targetX, targetY] = toScreen(this.nodes[spark.target]);
      // 불꽃이 나온 바퀴 위 자리
      const startX = centerX + Math.cos(spark.angle) * wheelRadius, startY = centerY + Math.sin(spark.angle) * wheelRadius;
      for (let trail = 0; trail < 6; trail++) {
        const trailProgress = Math.max(0, eased - trail * 0.05);
        context.globalAlpha = (1 - trail / 6) * 0.9;
        context.fillStyle = trail ? zone : good;
        context.beginPath();
        context.arc(Util.lerp(startX, targetX, trailProgress), Util.lerp(startY, targetY, trailProgress), nodeRadius * (1.5 - trail * 0.18), 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    }
  },
};
