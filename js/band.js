// 상단 1/4 영역: 평지를 구르는 공으로 페달링 속도를 시각화.
// 속도 전환 구간에는 같은 캔버스가 화면 전체로 커진다 (크기에 맞춰 공과 구역도 조금 커진다).
// 지면은 페달 속도가 아니라 점수만큼 흘러간다. 초록 구역 안에서는 꾸준히 나아가고, 벗어나면 느려지다 멈추며,
// 인지 게임을 맞히면 한꺼번에 쭉 나아간다. 일정 점수마다 깃발이 서 있어 점수가 '달린 거리'로 보인다.
class Band {
  static RING_SEC = 0.7;
  static PX_PER_POINT = 8;   // 1점에 지면이 움직이는 거리
  static MARK_EVERY = 200;   // 깃발 간격 (점)
  static MARK_BIG = 1000;     // 큰 깃발 간격 (점)
  static POP_SEC = 0.5;      // 깃발을 지난 직후 깃발이 커졌다 돌아오는 시간

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

    // 점수 깃발 — 구역 한가운데를 지나는 순간이 그 점수에 닿은 때다
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
      const top = -(zoneH + (big ? r * 0.75 : r * 0.3));
      const fw = r * (big ? 1.25 : 0.9) * (1 + 0.5 * pop);
      const fh = fw * 0.8;
      g.globalAlpha = alpha;
      g.strokeStyle = g.fillStyle = done ? pal.good : big ? pal.accent : pal.ground;
      glow(g.fillStyle);
      g.lineWidth = big ? 4 : 3;
      g.beginPath();
      g.moveTo(x, 0);
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

    // 정답 고리 — 공 뒤에서 퍼져 나간다
    for (const ring of this.rings) {
      const p = ring.t / Band.RING_SEC;
      g.globalAlpha = (1 - p) * 0.6;
      g.strokeStyle = pal.good;
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
    // 정답 직후에는 초록을 위에 겹쳐 물들인다
    const ballColor = this.inZone ? pal.accent : pal.bad;
    glow(ballColor);
    g.fillStyle = ballColor;
    g.beginPath();
    g.arc(bx, by, br, 0, Math.PI * 2);
    g.fill();
    noGlow();
    if (this.pop > 0) {
      g.globalAlpha = this.pop;
      g.fillStyle = pal.good;
      g.fill();
      g.globalAlpha = 1;
    }
    if (look.outline) {
      g.strokeStyle = pal.ink;
      g.lineWidth = look.outline;
      g.stroke();
    }
    g.strokeStyle = pal.onAccent;
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
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    for (const f of this.floaters) {
      const fx = f.x * trackHalf;
      // 처음에 튕겨 오르고 끝에서 느려지게. 일정한 속도로 올라가면 흘러가는 느낌이 난다.
      const fy = -r * 2 - 6 - (1 - Math.pow(1 - f.t, 3)) * 26;
      g.globalAlpha = f.t < 0.15 ? f.t / 0.15 : 1 - (f.t - 0.15) / 0.85;
      g.fillStyle = pal[f.color] || f.color; // 'good' | 'warn' | 'bad' 또는 색 값
      glow(g.fillStyle);
      g.font = `800 ${Math.round(r * 0.95)}px ${pal.font}`;
      g.fillText(f.text, fx, fy);
    }
    noGlow();
    g.globalAlpha = 1;
    g.restore();
  }
}
