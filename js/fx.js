// 게임 연출 효과: 정답 파편, 꽃가루, 화면 흔들림. 화면 스타일(js/themes.js)의 effects 가 모양을 정하고,
// 기본 스타일처럼 effects 가 비어 있으면 아무것도 하지 않는다.
// 화면 전체를 덮는 캔버스 하나(#fx)에 그리며 입자가 남아 있는 동안만 돈다.
//   burst    — 정답 때 터지는 입자 모양: glow 빛 | streak 속도선 | star 별 | pixel 네모
//   confetti — 깃발·완벽·결과 화면 꽃가루 모양: glow | paper 종이 | star | pixel
//   shake    — 오답 때 게임 영역을 흔드는 세기 (px). 0 이면 흔들지 않는다
import { $ } from './config.js';

export const Effects = {
  style: {},
  parts: [],
  sprites: {}, // 빛 입자 그림 (색마다 하나, glowSprite)
  running: false,
  lastTouchX: 0, // 마지막 터치 위치 — 정답 파편이 여기서 터진다
  lastTouchY: 0,

  init() {
    this.canvas = $('#fx');
    this.context = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointerdown', (event) => {
      this.lastTouchX = event.clientX;
      this.lastTouchY = event.clientY;
    }, true);
  },

  resize() {
    const pixelRatio = window.devicePixelRatio || 1;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * pixelRatio);
    this.canvas.height = Math.round(this.height * pixelRatio);
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  },

  palette() {
    const bodyStyle = getComputedStyle(document.body);
    const cssColor = (name) => bodyStyle.getPropertyValue(name).trim();
    return {
      colors: [cssColor('--accent'), cssColor('--good'), cssColor('--warn'), cssColor('--bad')],
      ink: cssColor('--ink'), good: cssColor('--good'), accent: cssColor('--accent'),
    };
  },

  setStyle(style) {
    this.style = style || {};
    this.parts = [];
    this.themeColors = this.palette();
    this.sprites = {};
  },

  // 빛 입자 그림. 입자마다 shadowBlur 로 번지게 하면 태블릿에서 정답 때마다 프레임이 떨어져서(네온),
  // 색마다 한 번 그라디언트로 그려 두고 drawImage 로 찍는다. GLOW_PAD = 예전 shadowBlur 만큼 번지는 폭
  GLOW_PAD: 14,
  GLOW_PX: 96,
  glowSprite(color) {
    let sprite = this.sprites[color];
    if (sprite) return sprite;
    const size = this.GLOW_PX;
    sprite = document.createElement('canvas');
    sprite.width = sprite.height = size;
    const spriteContext = sprite.getContext('2d');
    const gradient = spriteContext.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    // 흰색 알파 그라디언트를 그린 뒤 색을 입힌다 (팔레트 색이 어떤 CSS 형식이어도 된다)
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    spriteContext.fillStyle = gradient;
    spriteContext.fillRect(0, 0, size, size);
    spriteContext.globalCompositeOperation = 'source-in';
    spriteContext.fillStyle = color;
    spriteContext.fillRect(0, 0, size, size);
    this.sprites[color] = sprite;
    return sprite;
  },

  // ---------------- 게임에서 부르는 곳 ----------------
  hit(streak) {
    this.burst(this.lastTouchX, this.lastTouchY, 1 + Math.min(streak, 8) * 0.15);
  },

  miss(gameArea) {
    if (this.style.shake) this.shake(gameArea, this.style.shake);
  },

  // 한 게임을 다 맞혔을 때: 화면 가운데 큰 파편 + 꽃가루 조금
  cleared(gameArea) {
    const bounds = gameArea.getBoundingClientRect();
    this.burst(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, 2);
    this.confetti(0.4);
  },

  // ---------------- 효과 ----------------
  // 입자 { kind, x, y, velocityX, velocityY, age(s), life(s), size, color, rotation, spin, gravity, drag, fall(꽃가루) }
  burst(x, y, power = 1) {
    const kind = this.style.burst;
    if (!kind) return;
    const { colors, good } = this.themeColors;
    const count = Math.round((kind === 'pixel' ? 16 : 14) * power);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (160 + Math.random() * 340) * (0.8 + power * 0.2);
      const particle = {
        kind, x, y, velocityX: Math.cos(angle) * speed, velocityY: Math.sin(angle) * speed, age: 0,
        life: 0.5 + Math.random() * 0.4, size: 5 + Math.random() * 6,
        color: i % 3 === 0 ? colors[Math.floor(Math.random() * colors.length)] : good,
        rotation: Math.random() * 6, spin: (Math.random() - 0.5) * 12, gravity: 0, drag: 3,
      };
      if (kind === 'star') { particle.velocityY -= 160; particle.gravity = 900; particle.drag = 1.5; particle.size += 4; }
      if (kind === 'pixel') { particle.gravity = 1100; particle.velocityY -= 200; particle.drag = 1; particle.size = 6 + 3 * Math.floor(Math.random() * 2); }
      if (kind === 'streak') { particle.life = 0.35 + Math.random() * 0.2; particle.drag = 5; }
      this.parts.push(particle);
    }
    if (kind === 'glow' || kind === 'streak') this.parts.push({ kind: 'ring', x, y, age: 0, life: 0.45, size: 24 * power, color: good });
    this.run();
  },

  confetti(amount = 1) {
    const kind = this.style.confetti;
    if (!kind) return;
    const { colors } = this.themeColors;
    // 별은 크고 테두리가 있어 같은 수면 화면을 너무 덮는다
    const count = Math.round((kind === 'star' ? 45 : 90) * amount);
    for (let i = 0; i < count; i++) {
      this.parts.push({
        kind: kind === 'paper' ? 'paper' : kind, x: Math.random() * this.width, y: -20 - Math.random() * this.height * 0.4,
        velocityX: (Math.random() - 0.5) * 120, velocityY: 120 + Math.random() * 220, age: 0, life: 2.6 + Math.random() * 1.2,
        size: 7 + Math.random() * 7, color: colors[i % colors.length], rotation: Math.random() * 6,
        spin: (Math.random() - 0.5) * 10, gravity: kind === 'glow' ? 40 : 160, drag: 0.6, fall: true,
      });
    }
    this.run();
  },

  shake(element, magnitude) {
    if (!element || !element.animate) return;
    const keyframes = [0, -1, 0.8, -0.6, 0.4, -0.2, 0].map((offset) => ({ transform: `translateX(${offset * magnitude}px)` }));
    element.animate(keyframes, { duration: 320, easing: 'ease-out' });
  },

  // ---------------- 그리기 ----------------
  run() {
    if (this.running) return;
    this.running = true;
    this.lastFrameAt = performance.now();
    requestAnimationFrame((now) => this.frame(now));
  },

  frame(now) {
    const deltaSeconds = Math.min(0.05, (now - this.lastFrameAt) / 1000);
    this.lastFrameAt = now;
    const { context } = this;
    context.clearRect(0, 0, this.width, this.height);
    for (const particle of this.parts) {
      particle.age += deltaSeconds;
      if (particle.velocityX != null) {
        const damping = Math.exp(-particle.drag * deltaSeconds);
        particle.velocityX *= damping;
        particle.velocityY = particle.velocityY * damping + particle.gravity * deltaSeconds;
        particle.x += particle.velocityX * deltaSeconds;
        particle.y += particle.velocityY * deltaSeconds;
        particle.rotation += particle.spin * deltaSeconds;
      }
      this.draw(particle);
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.shadowBlur = 0;
    this.parts = this.parts.filter((particle) => particle.age < particle.life && particle.y < this.height + 40);
    if (this.parts.length) requestAnimationFrame((nextNow) => this.frame(nextNow));
    else {
      this.running = false;
      context.clearRect(0, 0, this.width, this.height);
    }
  },

  draw(particle) {
    const { context } = this;
    const progress = particle.age / particle.life;
    // 꽃가루는 거의 끝까지 또렷하다가 사라진다
    context.globalAlpha = particle.fall ? Math.min(1, (1 - progress) * 4) : 1 - progress * progress;
    context.fillStyle = context.strokeStyle = particle.color;
    switch (particle.kind) {
      case 'ring':
        context.globalAlpha = 1 - progress;
        context.lineWidth = 4 * (1 - progress) + 1;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size * (1 + progress * 2.5), 0, Math.PI * 2);
        context.stroke();
        break;
      case 'glow': {
        const radius = Math.max(0.5, particle.size * 0.6 * (1 - progress * 0.7)) + this.GLOW_PAD;
        context.globalCompositeOperation = 'lighter';
        context.drawImage(this.glowSprite(particle.color), particle.x - radius, particle.y - radius, radius * 2, radius * 2);
        context.globalCompositeOperation = 'source-over';
        break;
      }
      case 'streak': {
        const length = Math.hypot(particle.velocityX, particle.velocityY) * 0.06 + 4;
        const angle = Math.atan2(particle.velocityY, particle.velocityX);
        context.lineWidth = 4;
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(particle.x, particle.y);
        context.lineTo(particle.x - Math.cos(angle) * length, particle.y - Math.sin(angle) * length);
        context.stroke();
        break;
      }
      case 'paper':
        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.scale(1, Math.cos(particle.age * 9 + particle.rotation)); // 뒤집히며 팔랑인다
        context.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
        context.restore();
        break;
      case 'star':
        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.beginPath();
        for (let i = 0; i < 10; i++) {
          const radius = i % 2 ? particle.size * 0.45 : particle.size;
          const angle = (i * Math.PI) / 5 - Math.PI / 2;
          context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        }
        context.closePath();
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = this.themeColors.ink;
        context.stroke();
        context.restore();
        break;
      case 'pixel': {
        // 4px 격자에 맞추고, 흐려지지 않고 계단식으로 사라진다
        const size = particle.size;
        context.globalAlpha = progress < 0.7 ? 1 : progress < 0.85 ? 0.6 : 0.3;
        context.fillRect(Math.round(particle.x / 4) * 4, Math.round(particle.y / 4) * 4, size, size);
        break;
      }
    }
  },
};
