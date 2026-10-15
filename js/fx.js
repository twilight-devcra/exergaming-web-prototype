// 게임 연출 효과: 정답 파편, 꽃가루, 화면 흔들림. 화면 스타일(js/themes.js)의 fx 가 모양을 정하고,
// 기본 스타일처럼 fx 가 비어 있으면 아무것도 하지 않는다.
// 화면 전체를 덮는 캔버스 하나(#fx)에 그리며 입자가 남아 있는 동안만 돈다.
//   burst    — 정답 때 터지는 입자 모양: glow 빛 | streak 속도선 | star 별 | pixel 네모
//   confetti — 깃발·완벽·결과 화면 꽃가루 모양: glow | paper 종이 | star | pixel
//   shake    — 오답 때 게임 영역을 흔드는 세기 (px). 0 이면 흔들지 않는다
const Fx = {
  style: {},
  parts: [],
  running: false,
  x: 0, // 마지막 터치 위치 — 정답 파편이 여기서 터진다
  y: 0,

  init() {
    this.canvas = $('#fx');
    this.g = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointerdown', (e) => {
      this.x = e.clientX;
      this.y = e.clientY;
    }, true);
  },

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  palette() {
    const cs = getComputedStyle(document.body);
    const v = (n) => cs.getPropertyValue(n).trim();
    return { colors: [v('--accent'), v('--good'), v('--warn'), v('--bad')], ink: v('--ink'), good: v('--good'), accent: v('--accent') };
  },

  setStyle(fx) {
    this.style = fx || {};
    this.parts = [];
    this.pal = this.palette();
  },

  // ---------------- 게임에서 부르는 곳 ----------------
  hit(streak) {
    this.burst(this.x, this.y, 1 + Math.min(streak, 8) * 0.15);
  },

  miss(el) {
    if (this.style.shake) this.shake(el, this.style.shake);
  },

  // 한 게임을 다 맞혔을 때: 화면 가운데 큰 파편 + 꽃가루 조금
  cleared(el) {
    const r = el.getBoundingClientRect();
    this.burst(r.left + r.width / 2, r.top + r.height / 2, 2);
    this.confetti(0.4);
  },

  // ---------------- 효과 ----------------
  burst(x, y, power = 1) {
    const kind = this.style.burst;
    if (!kind) return;
    const { colors, good } = this.pal;
    const n = Math.round((kind === 'pixel' ? 16 : 14) * power);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (160 + Math.random() * 340) * (0.8 + power * 0.2);
      const p = {
        kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0,
        life: 0.5 + Math.random() * 0.4, size: 5 + Math.random() * 6,
        color: i % 3 === 0 ? colors[Math.floor(Math.random() * colors.length)] : good,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, grav: 0, drag: 3,
      };
      if (kind === 'star') { p.vy -= 160; p.grav = 900; p.drag = 1.5; p.size += 4; }
      if (kind === 'pixel') { p.grav = 1100; p.vy -= 200; p.drag = 1; p.size = 6 + 3 * Math.floor(Math.random() * 2); }
      if (kind === 'streak') { p.life = 0.35 + Math.random() * 0.2; p.drag = 5; }
      this.parts.push(p);
    }
    if (kind === 'glow' || kind === 'streak') this.parts.push({ kind: 'ring', x, y, t: 0, life: 0.45, size: 24 * power, color: good });
    this.run();
  },

  confetti(amount = 1) {
    const kind = this.style.confetti;
    if (!kind) return;
    const { colors } = this.pal;
    // 별은 크고 테두리가 있어 같은 수면 화면을 너무 덮는다
    const n = Math.round((kind === 'star' ? 45 : 90) * amount);
    for (let i = 0; i < n; i++) {
      this.parts.push({
        kind: kind === 'paper' ? 'paper' : kind, x: Math.random() * this.W, y: -20 - Math.random() * this.H * 0.4,
        vx: (Math.random() - 0.5) * 120, vy: 120 + Math.random() * 220, t: 0, life: 2.6 + Math.random() * 1.2,
        size: 7 + Math.random() * 7, color: colors[i % colors.length], rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 10, grav: kind === 'glow' ? 40 : 160, drag: 0.6, fall: true,
      });
    }
    this.run();
  },

  shake(el, mag) {
    if (!el || !el.animate) return;
    const k = [0, -1, 0.8, -0.6, 0.4, -0.2, 0].map((f) => ({ transform: `translateX(${f * mag}px)` }));
    el.animate(k, { duration: 320, easing: 'ease-out' });
  },

  // ---------------- 그리기 ----------------
  run() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  },

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const { g } = this;
    g.clearRect(0, 0, this.W, this.H);
    for (const p of this.parts) {
      p.t += dt;
      if (p.vx != null) {
        const d = Math.exp(-p.drag * dt);
        p.vx *= d;
        p.vy = p.vy * d + p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
      this.draw(p);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = 0;
    this.parts = this.parts.filter((p) => p.t < p.life && p.y < this.H + 40);
    if (this.parts.length) requestAnimationFrame((t) => this.frame(t));
    else {
      this.running = false;
      g.clearRect(0, 0, this.W, this.H);
    }
  },

  draw(p) {
    const { g } = this;
    const k = p.t / p.life;
    // 꽃가루는 거의 끝까지 또렷하다가 사라진다
    g.globalAlpha = p.fall ? Math.min(1, (1 - k) * 4) : 1 - k * k;
    g.fillStyle = g.strokeStyle = p.color;
    switch (p.kind) {
      case 'ring':
        g.globalAlpha = 1 - k;
        g.lineWidth = 4 * (1 - k) + 1;
        g.beginPath();
        g.arc(p.x, p.y, p.size * (1 + k * 2.5), 0, Math.PI * 2);
        g.stroke();
        break;
      case 'glow':
        g.globalCompositeOperation = 'lighter';
        g.shadowColor = p.color;
        g.shadowBlur = 14;
        g.beginPath();
        g.arc(p.x, p.y, Math.max(0.5, p.size * 0.6 * (1 - k * 0.7)), 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
        g.globalCompositeOperation = 'source-over';
        break;
      case 'streak': {
        const len = Math.hypot(p.vx, p.vy) * 0.06 + 4;
        const a = Math.atan2(p.vy, p.vx);
        g.lineWidth = 4;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - Math.cos(a) * len, p.y - Math.sin(a) * len);
        g.stroke();
        break;
      }
      case 'paper':
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.scale(1, Math.cos(p.t * 9 + p.rot)); // 뒤집히며 팔랑인다
        g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        g.restore();
        break;
      case 'star':
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? p.size * 0.45 : p.size;
          const a = (i * Math.PI) / 5 - Math.PI / 2;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.closePath();
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = this.pal.ink;
        g.stroke();
        g.restore();
        break;
      case 'pixel': {
        // 4px 격자에 맞추고, 흐려지지 않고 계단식으로 사라진다
        const s = p.size;
        g.globalAlpha = k < 0.7 ? 1 : k < 0.85 ? 0.6 : 0.3;
        g.fillRect(Math.round(p.x / 4) * 4, Math.round(p.y / 4) * 4, s, s);
        break;
      }
    }
  },
};
