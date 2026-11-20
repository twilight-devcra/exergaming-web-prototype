// 라운드 중 화면 위쪽 표시(남은 시간 · 진행 막대 · 달린 거리 · 점수판)와 점수·정답 연출.
// 점수 자체는 App 이 센다(App.score). 여기서는 화면의 점수판이 점수를 받는 모습만 다룬다:
// 인지 게임 점수는 정답 자리에서 배지로 튀어나와 점수판으로 날아가고, 도착하면 점수판 숫자가 굴러 올라간다.
import { $, U } from './config.js';
import { Exercise } from './exercise.js';
import { Fx } from './fx.js';

export const ScoreHud = {
  landed: 0, // 점수판에 도착한 점수 (날아가는 중인 점수는 아직 빠져 있다)
  shown: 0,  // 점수판에 지금 보이는 값 (landed 까지 굴러 올라간다)
  epoch: 0,  // 판마다 올린다. 지난 판에 날아가던 점수가 새 판 점수판에 내려앉지 않게

  // 새 라운드
  reset() {
    this.landed = 0;
    this.shown = 0;
    this.epoch++;
  },

  // 점수판에 pts 를 올린다. anchor 가 있으면(인지 게임 정답) 그 자리에서 text 배지가 튀어나와 점수판으로 날아간다.
  // streak = 지금 연속 정답 (길수록 배지가 크다)
  addPoints(pts, anchor, text, streak) {
    if (!anchor || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (anchor) floatAt(anchor, text);
      return this.land(pts, !!anchor);
    }
    const epoch = this.epoch;
    flyScore(anchor, text, streak, () => epoch === this.epoch && this.land(pts, true));
  },

  // 점수판이 점수를 받는다: 숫자가 굴러 올라가고(render), 받은 순간 튀어 오른다.
  // big = 날아온 인지 점수 — 더 크게 튀고 초록으로 번쩍이며 둘레에 고리가 퍼진다
  land(pts, big) {
    this.landed += pts;
    const value = $('#hud-score .value');
    value.classList.remove('bump', 'catch');
    void value.offsetWidth;
    value.classList.add(big ? 'catch' : 'bump');
    if (!big) return;
    const r = value.getBoundingClientRect();
    const x = r.right - 30, y = r.top + r.height / 2;
    const ring = U.el('div', 'score-ring');
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    document.body.append(ring);
    setTimeout(() => ring.remove(), 600);
    Fx.burst(x, y, 0.6);
  },

  // 한 프레임의 표시. left = 남은 시간(s), done = 라운드 진행 0~1, playing = 라운드 중, held = 게임 소개 중이라 시계가 멈췄다,
  // distM = 달린 거리. dt 가 0 이면 점수판 숫자를 굴리지 않고 바로 맞춘다
  render(dt, { left, done, playing, held, distM }) {
    $('#hud-time .value').textContent = U.fmtTime(left);
    $('#hud-time').classList.toggle('warn', playing && left <= 10);
    $('#hud-time').classList.toggle('held', playing && held);
    // 운영 버전(app/)에만 있는 표시: 라운드 진행 막대와 달린 거리
    const progress = $('#hud-progress');
    if (progress) progress.style.transform = `scaleX(${done})`;
    const dist = $('#hud-dist .value');
    if (dist) {
      const d = Exercise.fmtDist(distM);
      const text = `${d.value} ${d.unit}`;
      if (dist.textContent !== text) dist.textContent = text;
    }
    // 점수판 숫자는 받은 점수까지 굴러 올라간다 (남은 차이의 비율만큼, 너무 느리지 않게 초당 최소 40점)
    if (!dt || this.shown > this.landed) this.shown = this.landed;
    else if (this.shown < this.landed) {
      const gap = this.landed - this.shown;
      this.shown = Math.min(this.landed, this.shown + Math.max(40 * dt, gap * (1 - Math.exp(-dt / 0.12))));
    }
    const n = String(Math.floor(this.shown));
    const value = $('#hud-score .value');
    if (value.textContent !== n) value.textContent = n;
  },

  // 연속 정답 표시 (2 연속부터)
  renderStreak(streak) {
    const el = $('#streak');
    el.classList.toggle('on', streak >= 2);
    if (streak < 2) return;
    el.textContent = `${streak} 연속`;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  },

  // 맞힌 순간 게임 영역 전체가 한 번 밝아진다. 연속이 쌓일수록 세진다.
  flashGlow(streak) {
    const alpha = Math.min(0.1 + streak * 0.045, 0.34);
    const el = U.el('div', 'glow');
    el.style.background = `radial-gradient(ellipse at 50% 55%, color-mix(in srgb, var(--good) ${Math.round(alpha * 100)}%, transparent) 0%, transparent 62%)`;
    $('#cog').append(el);
    setTimeout(() => el.remove(), 440);
  },
};

// 움직임을 줄인 화면: 배지를 날리지 않고 정답 자리에 글자만 잠깐 띄운다
function floatAt(anchor, text) {
  const cog = $('#cog');
  const cr = cog.getBoundingClientRect();
  const r = anchor.getBoundingClientRect();
  const f = U.el('div', 'floater', text);
  f.style.left = `${r.left + r.width / 2 - cr.left}px`;
  f.style.top = `${r.top + r.height / 2 - cr.top}px`;
  cog.append(f);
  setTimeout(() => f.remove(), 950);
}

// 배지: 정답 자리에서 크게 튀어나와 잠깐 떠 있다가, 위로 솟으며 점수판 쪽으로 휘어 날아가 작아진다.
// 가로(바깥 상자)와 세로·크기(안쪽 글자)를 다른 곡선으로 움직여서 곧은 선이 아니라 호를 그린다. 연속 정답이 길수록 크다
function flyScore(anchor, text, streak, onLand) {
  const a = anchor.getBoundingClientRect();
  const d = $('#hud-score .value').getBoundingClientRect();
  const x = a.left + a.width / 2, y = a.top + a.height / 2;
  const dx = d.right - 30 - x, dy = d.top + d.height / 2 - y;
  const f = U.el('div', 'score-pop', `<span>${text}</span>`);
  f.classList.toggle('hot', streak >= 3);
  f.style.left = `${x}px`;
  f.style.top = `${y}px`;
  f.style.setProperty('--k', String(1 + Math.min(streak, 6) * 0.06));
  document.body.append(f);
  const ms = 1150, flyAt = 0.42;
  f.animate([
    { transform: 'translateX(0)', offset: 0 },
    { transform: 'translateX(0)', offset: flyAt, easing: 'cubic-bezier(0.55, 0, 0.9, 0.45)' },
    { transform: `translateX(${dx}px)`, offset: 1 },
  ], { duration: ms, fill: 'forwards' });
  const anim = f.firstChild.animate([
    { transform: 'translateY(0) scale(0.3)', opacity: 0, offset: 0, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.3)' },
    { transform: 'translateY(-6px) scale(1.25)', opacity: 1, offset: 0.12 },
    { transform: 'translateY(-10px) scale(1)', offset: 0.22 },
    { transform: 'translateY(-16px) scale(1)', offset: flyAt, easing: 'cubic-bezier(0.25, 0.7, 0.35, 1)' },
    { transform: `translateY(${dy}px) scale(0.45)`, opacity: 0.9, offset: 1 },
  ], { duration: ms, fill: 'forwards' });
  anim.onfinish = () => {
    f.remove();
    onLand();
  };
}
