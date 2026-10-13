// 상단 1/4 영역: 평지를 구르는 공으로 페달링 속도를 시각화.
// 속도 전환 구간에는 같은 캔버스가 화면 전체로 커진다 (크기에 맞춰 공과 구역도 조금 커진다).
class Band {
  static RING_SEC = 0.7;

  constructor(canvas, cfg) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.cfg = cfg;
    this.ballX = 0;       // -1 ~ 1 (트랙 기준 정규화 위치)
    this.roll = 0;        // 공 회전각
    this.travel = 0;      // 지면 무늬 스크롤
    this.theta = 0;       // 현재 지면 각도 (rad)
    this.thetaTarget = 0;
    this.floaters = [];
    this.rings = [];      // 인지 게임 정답 때 공에서 퍼지는 고리
    this.pop = 0;         // 정답 직후 공이 커졌다 돌아오는 정도 1→0
    this.outAmount = 0;   // 구역 이탈 정도 0~1
    this.resize();
    // 높이가 바뀌는 동안(전환 애니메이션) 매번 다시 맞춘다. 캔버스 크기를 바꾸면 내용이 지워지므로 바로 다시 그린다.
    new ResizeObserver(() => {
      this.resize();
      this.draw();
    }).observe(canvas);
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
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

  // deviation: (rpm - target) / target
  update(dt, rpm, deviation) {
    const { tolerance, maxDeviation } = this.cfg;
    const target = U.clamp(deviation / maxDeviation, -1, 1);
    this.ballX = U.lerp(this.ballX, target, 1 - Math.exp(-dt / 0.18));
    this.theta = U.lerp(this.theta, this.thetaTarget, 1 - Math.exp(-dt / 0.6));
    const speed = rpm / 60; // 초당 회전 수
    this.roll += speed * Math.PI * 2 * dt;
    this.travel += speed * 70 * dt;
    // 색과 점수는 실제 편차가 아니라 화면에 보이는 공 위치를 기준으로 한다 (보이는 대로 채점)
    const out = Math.max(0, Math.abs(this.deviation) - tolerance) / (maxDeviation - tolerance);
    this.outAmount = U.lerp(this.outAmount, U.clamp(out * 1.5 + (out > 0 ? 0.35 : 0), 0, 1), 1 - Math.exp(-dt / 0.12));
    this.slowSide = this.ballX < 0;
    this.floaters.forEach((f) => (f.t += dt));
    this.floaters = this.floaters.filter((f) => f.t < 1);
    this.rings.forEach((r) => (r.t += dt));
    this.rings = this.rings.filter((r) => r.t < Band.RING_SEC);
    this.pop = Math.max(0, this.pop - dt / 0.4);
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
    const { g, W, H } = this;
    const { tolerance, maxDeviation } = this.cfg;
    g.clearRect(0, 0, W, H);

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
    const zr = Math.round(U.lerp(213, 253, red));
    const zg = Math.round(U.lerp(242, 214, red));
    const zb = Math.round(U.lerp(224, 214, red));
    g.fillStyle = `rgb(${zr},${zg},${zb})`;
    g.fillRect(-zoneHalf, -zoneH, zoneHalf * 2, zoneH);
    g.strokeStyle = this.inZone ? '#1f9d55' : `rgba(229,72,77,${0.4 + red * 0.6})`;
    g.lineWidth = 3;
    g.setLineDash([6, 6]);
    g.beginPath();
    g.moveTo(-zoneHalf, -zoneH);
    g.lineTo(-zoneHalf, 0);
    g.moveTo(zoneHalf, -zoneH);
    g.lineTo(zoneHalf, 0);
    g.stroke();
    g.setLineDash([]);

    // 지면
    const ext = W;
    g.strokeStyle = '#9aa1ad';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(-ext, 0);
    g.lineTo(ext, 0);
    g.stroke();
    // 지면 무늬 (공이 굴러가는 느낌)
    g.strokeStyle = '#d6d9df';
    g.lineWidth = 3;
    const spacing = 36;
    const off = -(this.travel % spacing);
    g.beginPath();
    for (let x = -ext + off; x < ext; x += spacing) {
      g.moveTo(x, 10);
      g.lineTo(x - 12, 22);
    }
    g.stroke();

    // 정답 고리 — 공 뒤에서 퍼져 나간다
    for (const ring of this.rings) {
      const p = ring.t / Band.RING_SEC;
      g.globalAlpha = (1 - p) * 0.6;
      g.strokeStyle = '#1f9d55';
      g.lineWidth = Math.max(1.5, r * 0.2 * (1 - p));
      g.beginPath();
      g.arc(ring.x * trackHalf, -r - 2, r * (1 + p * 2.8), 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;

    // 공 (정답 직후에는 잠깐 커지면서 초록으로 물든다)
    const bx = this.ballX * trackHalf;
    const br = r * (1 + 0.25 * this.pop);
    const by = -br - 2;
    const base = this.inZone ? [47, 111, 237] : [229, 72, 77];
    g.fillStyle = `rgb(${Math.round(U.lerp(base[0], 31, this.pop))},` +
      `${Math.round(U.lerp(base[1], 157, this.pop))},${Math.round(U.lerp(base[2], 85, this.pop))})`;
    g.beginPath();
    g.arc(bx, by, br, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = Math.max(2, br * 0.14);
    g.beginPath();
    for (let k = 0; k < 2; k++) {
      const a = this.roll + (k * Math.PI) / 2;
      g.moveTo(bx + Math.cos(a) * br * 0.62, by + Math.sin(a) * br * 0.62);
      g.lineTo(bx - Math.cos(a) * br * 0.62, by - Math.sin(a) * br * 0.62);
    }
    g.stroke();

    // 이탈 시 방향 힌트
    if (!this.inZone && red > 0.25) {
      g.fillStyle = `rgba(229,72,77,${Math.min(1, red)})`;
      g.font = `800 ${Math.round(r * 0.9)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const dir = this.slowSide ? 1 : -1;
      g.fillText(this.slowSide ? '›››' : '‹‹‹', bx + dir * (r * 2.1), by);
    }

    // 점수 피드백
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    for (const f of this.floaters) {
      const fx = f.x * trackHalf;
      // 처음에 튕겨 오르고 끝에서 느려지게. 일정한 속도로 올라가면 흘러가는 느낌이 난다.
      const fy = -r * 2 - 6 - (1 - Math.pow(1 - f.t, 3)) * 26;
      g.globalAlpha = f.t < 0.15 ? f.t / 0.15 : 1 - (f.t - 0.15) / 0.85;
      g.fillStyle = f.color;
      g.font = `800 ${Math.round(r * 0.95)}px system-ui, sans-serif`;
      g.fillText(f.text, fx, fy);
    }
    g.globalAlpha = 1;
    g.restore();
  }
}
