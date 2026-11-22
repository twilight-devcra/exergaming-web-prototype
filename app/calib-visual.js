// 속도 측정(준비 운동) 화면의 그림 (운영 버전만).
// 둥근 길 위를 게임 속 자전거가 페달 빠르기에 맞춰 돌고(페달 네 바퀴에 한 바퀴), 안쪽 파란 고리가 측정 시간만큼 찬다.
// 가운데 숫자(남은 초)와 아래 안내 문구는 main.js 의 updateCalib 이 그대로 채운다. Demo.tick 이 측정 중에 매 프레임 부른다.
import { Util } from '../js/config.js';
import { drawBike } from '../js/scenery-art.js';

export const CalibVisual = {
  REVS_PER_LAP: 4, // 페달 몇 바퀴에 길을 한 바퀴 도는가 (60 RPM 이면 4초에 한 바퀴)

  init() {
    this.canvas = document.getElementById('calib-canvas');
    if (!this.canvas) return null;
    this.context = this.canvas.getContext('2d');
    this.reset();
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    this.resize();
    return this;
  },

  reset() {
    this.lap = -Math.PI / 2; // 꼭대기에서 출발
    this.roll = 0;
  },

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvasWidth = rect.width;
    this.canvasHeight = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  tick(deltaSeconds, rpm, calib, totalSec) {
    if (!this.canvasWidth) this.resize();
    this.lap += ((rpm / 60) * 2 * Math.PI * deltaSeconds) / this.REVS_PER_LAP;
    this.roll += (rpm / 60) * 2 * Math.PI * deltaSeconds;
    this.draw(Util.clamp(calib.elapsed / totalSec, 0, 1));
  },

  draw(progress) {
    const { context, canvasWidth, canvasHeight } = this;
    if (!canvasWidth || !canvasHeight) return;
    const bodyStyle = getComputedStyle(document.body);
    const cssColor = (name) => bodyStyle.getPropertyValue(name).trim();
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    const size = Math.min(canvasWidth, canvasHeight);
    const centerX = canvasWidth / 2, centerY = canvasHeight / 2;
    const roadWidth = size * 0.085;
    const trackRadius = size / 2 - roadWidth * 1.05 - 6;  // 길 가운데 반지름 (자전거 배지가 길보다 조금 커서 바깥에 자리를 남긴다)

    // 둥근 길: 회색 길, 가장자리 선, 가운데 점선
    context.lineWidth = roadWidth;
    context.strokeStyle = cssColor('--road');
    context.beginPath();
    context.arc(centerX, centerY, trackRadius, 0, Math.PI * 2);
    context.stroke();
    context.lineWidth = Math.max(1.5, roadWidth * 0.08);
    context.strokeStyle = cssColor('--road-edge');
    for (const edgeRadius of [trackRadius - roadWidth / 2, trackRadius + roadWidth / 2]) {
      context.beginPath();
      context.arc(centerX, centerY, edgeRadius, 0, Math.PI * 2);
      context.stroke();
    }
    context.setLineDash([roadWidth * 0.45, roadWidth * 0.55]);
    context.lineDashOffset = -this.lap * trackRadius * 0.2; // 점선은 자전거와 반대로 살짝 흘러 달리는 느낌을 준다
    context.lineWidth = Math.max(2, roadWidth * 0.1);
    context.strokeStyle = cssColor('--road-mark');
    context.beginPath();
    context.arc(centerX, centerY, trackRadius, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);

    // 측정 진행: 길 안쪽의 파란 고리
    const progressRadius = trackRadius - roadWidth / 2 - size * 0.045;
    context.lineCap = 'round';
    context.lineWidth = size * 0.028;
    context.strokeStyle = cssColor('--cell');
    context.beginPath();
    context.arc(centerX, centerY, progressRadius, 0, Math.PI * 2);
    context.stroke();
    if (progress > 0) {
      context.strokeStyle = cssColor('--accent');
      context.beginPath();
      context.arc(centerX, centerY, progressRadius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      context.stroke();
    }

    // 자전거: 게임 속과 같은 흰 동그라미 배지가 길 위를 시계 방향으로 돈다. 늘 똑바로 서 있고, 가는 쪽을 바라본다
    const bikeAngle = this.lap;
    const bikeX = centerX + Math.cos(bikeAngle) * trackRadius;
    const bikeY = centerY + Math.sin(bikeAngle) * trackRadius;
    const badgeRadius = roadWidth * 0.95;
    context.save();
    context.shadowColor = 'rgba(29, 43, 36, 0.25)';
    context.shadowBlur = 10;
    context.shadowOffsetY = 3;
    context.fillStyle = cssColor('--panel');
    context.beginPath();
    context.arc(bikeX, bikeY, badgeRadius, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.lineWidth = Math.max(3, badgeRadius * 0.12);
    context.strokeStyle = cssColor('--accent');
    context.beginPath();
    context.arc(bikeX, bikeY, badgeRadius, 0, Math.PI * 2);
    context.stroke();
    context.save();
    context.translate(bikeX, bikeY);
    if (Math.sin(bikeAngle) > 0) context.scale(-1, 1); // 아래쪽 반을 돌 때는 왼쪽으로 간다
    drawBike({ context, palette: { ink: cssColor('--ink') }, roll: this.roll }, 0, badgeRadius * 0.06, badgeRadius * 1.3);
    context.restore();
  },
};
