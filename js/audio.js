// WebAudio로 합성하는 비트 + 효과음.
// 비트 1개 = 페달 반 바퀴 (A 또는 D 한 번). 짝수 비트는 킥(A), 홀수 비트는 스네어(D).
class BeatAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.timer = null;
    this.queue = [];
    this.muted = false;
  }

  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // getBpm: 매 비트마다 현재 템포를 물어본다 (목표 RPM 변화에 따라 템포도 바뀜)
  start(getBpm) {
    this.ensure();
    this.stop();
    this.getBpm = getBpm;
    this.beat = 0;
    this.next = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.queue = [];
  }

  pause() {
    if (this.ctx) this.ctx.suspend();
  }

  resume() {
    if (this.ctx) this.ctx.resume();
  }

  schedule() {
    const ahead = this.ctx.currentTime + 0.12;
    while (this.next < ahead) {
      const spb = 60 / this.getBpm();
      this.playBeat(this.beat, this.next, spb);
      this.queue.push({ t: this.next, i: this.beat });
      this.next += spb;
      this.beat++;
    }
  }

  // 시각 효과용: 이미 소리가 난 비트들을 꺼낸다
  pollBeats() {
    if (!this.ctx) return [];
    const now = this.ctx.currentTime;
    const out = [];
    while (this.queue.length && this.queue[0].t <= now) out.push(this.queue.shift());
    return out;
  }

  playBeat(i, t, spb) {
    const bassLine = [55, 55, 65.41, 49];
    if (i % 2 === 0) {
      this.kick(t);
      this.bass(t, bassLine[Math.floor(i / 8) % 4], spb * 0.9);
    } else {
      this.snare(t);
    }
    this.hat(t + spb / 2);
  }

  kick(t) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.25);
  }

  snare(t) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = c.createGain();
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + 0.16);
  }

  hat(t) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + 0.05);
  }

  bass(t, freq, dur) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq * 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + Math.min(dur, 0.5));
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + Math.min(dur, 0.5) + 0.02);
  }

  tone(freq, dur, type = 'sine', vol = 0.3, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  sfx(name) {
    switch (name) {
      case 'tap': this.tone(660, 0.08, 'sine', 0.2); break;
      case 'good': this.tone(880, 0.1, 'sine', 0.25); break;
      case 'bad': this.tone(180, 0.25, 'square', 0.15); break;
      case 'clear':
        this.tone(660, 0.12, 'sine', 0.25);
        this.tone(880, 0.12, 'sine', 0.25, 0.09);
        this.tone(1320, 0.2, 'sine', 0.25, 0.18);
        break;
      case 'blink': this.tone(520, 0.06, 'sine', 0.12); break;
      case 'count': this.tone(440, 0.12, 'sine', 0.3); break;
      case 'go': this.tone(880, 0.25, 'sine', 0.3); break;
      case 'end':
        this.tone(880, 0.15, 'sine', 0.3);
        this.tone(660, 0.15, 'sine', 0.3, 0.15);
        this.tone(440, 0.4, 'sine', 0.3, 0.3);
        break;
    }
  }
}
