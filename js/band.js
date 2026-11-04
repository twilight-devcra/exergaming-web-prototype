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

    this.drawFlags(ext, r, -roadH / 2, (big) => -roadH / 2 - r * (big ? 2.3 : 1.7));

    // 자전거 배지 (정답 직후에는 잠깐 커지면서 초록으로 물든다)
    const bx = this.ballX * trackHalf;
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
