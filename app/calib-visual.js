// 속도 측정(준비 운동) 화면의 그림 (운영 버전만).
// 둥근 길 위를 게임 속 자전거가 페달 빠르기에 맞춰 돌고(페달 네 바퀴에 한 바퀴), 안쪽 파란 고리가 측정 시간만큼 찬다.
// 가운데 숫자(남은 초)와 아래 안내 문구는 main.js 의 updateCalib 이 그대로 채운다. Demo.tick 이 측정 중에 매 프레임 부른다.
const CalibVisual = {
  REVS_PER_LAP: 4, // 페달 몇 바퀴에 길을 한 바퀴 도는가 (60 RPM 이면 4초에 한 바퀴)

  init() {
    this.c = document.getElementById('calib-canvas');
    if (!this.c) return null;
    this.g = this.c.getContext('2d');
    this.reset();
    new ResizeObserver(() => this.resize()).observe(this.c);
    this.resize();
    return this;
  },

  reset() {
    this.lap = -Math.PI / 2; // 꼭대기에서 출발
    this.roll = 0;
  },

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.c.getBoundingClientRect();
    this.W = r.width;
    this.H = r.height;
    this.c.width = Math.round(r.width * dpr);
    this.c.height = Math.round(r.height * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  tick(dt, rpm, calib, totalSec) {
    if (!this.W) this.resize();
    this.lap += ((rpm / 60) * 2 * Math.PI * dt) / this.REVS_PER_LAP;
    this.roll += (rpm / 60) * 2 * Math.PI * dt;
    this.draw(U.clamp(calib.elapsed / totalSec, 0, 1));
  },

  draw(progress) {
    const { g, W, H } = this;
    if (!W || !H) return;
    const cs = getComputedStyle(document.body);
    const v = (n) => cs.getPropertyValue(n).trim();
    g.clearRect(0, 0, W, H);
    const S = Math.min(W, H);
    const cx = W / 2, cy = H / 2;
    const road = S * 0.085;
    const R = S / 2 - road * 1.05 - 6;  // 길 가운데 반지름 (자전거 배지가 길보다 조금 커서 바깥에 자리를 남긴다)

    // 둥근 길: 회색 길, 가장자리 선, 가운데 점선
    g.lineWidth = road;
    g.strokeStyle = v('--road');
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = Math.max(1.5, road * 0.08);
    g.strokeStyle = v('--road-edge');
    for (const rr of [R - road / 2, R + road / 2]) {
      g.beginPath();
      g.arc(cx, cy, rr, 0, Math.PI * 2);
      g.stroke();
    }
    g.setLineDash([road * 0.45, road * 0.55]);
    g.lineDashOffset = -this.lap * R * 0.2; // 점선은 자전거와 반대로 살짝 흘러 달리는 느낌을 준다
    g.lineWidth = Math.max(2, road * 0.1);
    g.strokeStyle = v('--road-mark');
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);

    // 측정 진행: 길 안쪽의 파란 고리
    const pr = R - road / 2 - S * 0.045;
    g.lineCap = 'round';
    g.lineWidth = S * 0.028;
    g.strokeStyle = v('--cell');
    g.beginPath();
    g.arc(cx, cy, pr, 0, Math.PI * 2);
    g.stroke();
    if (progress > 0) {
      g.strokeStyle = v('--accent');
      g.beginPath();
      g.arc(cx, cy, pr, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      g.stroke();
    }

    // 자전거: 게임 속과 같은 흰 동그라미 배지가 길 위를 시계 방향으로 돈다. 늘 똑바로 서 있고, 가는 쪽을 바라본다
    const a = this.lap;
    const bx = cx + Math.cos(a) * R;
    const by = cy + Math.sin(a) * R;
    const br = road * 0.95;
    g.save();
    g.shadowColor = 'rgba(29, 43, 36, 0.25)';
    g.shadowBlur = 10;
    g.shadowOffsetY = 3;
    g.fillStyle = v('--panel');
    g.beginPath();
    g.arc(bx, by, br, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.lineWidth = Math.max(3, br * 0.12);
    g.strokeStyle = v('--accent');
    g.beginPath();
    g.arc(bx, by, br, 0, Math.PI * 2);
    g.stroke();
    g.save();
    g.translate(bx, by);
    if (Math.sin(a) > 0) g.scale(-1, 1); // 아래쪽 반을 돌 때는 왼쪽으로 간다
    Band.prototype.drawBike.call({ g, pal: { ink: v('--ink') }, roll: this.roll }, 0, br * 0.06, br * 1.3);
    g.restore();
  },
};
