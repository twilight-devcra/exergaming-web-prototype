// WebAudio로 합성하는 비트 + 효과음.
// 비트 1개 = 페달 반 바퀴 (A 또는 D 한 번). 짝수 비트는 킥(A), 홀수 비트는 스네어(D).
class BeatAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.timer = null;
    this.queue = [];
    this.muted = false;
    this.style = 'beat'; // 음악 스타일 (STYLES)
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
    if (!this.master) return;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime); // 진행 중인 페이드인을 끊는다
    this.master.gain.value = m ? 0 : 0.55;
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // getBpm: 매 비트마다 현재 템포를 물어본다 (목표 RPM 변화에 따라 템포도 바뀜)
  // fadeIn: 이 시간(초) 동안 소리를 0에서 키운다
  start(getBpm, { fadeIn = 0 } = {}) {
    this.ensure();
    this.stop();
    if (this.previewing) {
      this.previewing = false;
      clearTimeout(this.previewTimer);
      this.style = this.previewKeep;
      this.muted = this.previewMuted;
    }
    if (fadeIn > 0 && !this.muted) {
      const g = this.master.gain;
      const t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.0001, t);
      g.linearRampToValueAtTime(0.55, t + fadeIn);
    }
    this.getBpm = getBpm;
    this.beat = 0;
    this.next = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  // 끊지 않고 템포 정하는 방법만 바꾼다 (측정 → 라운드로 넘어갈 때). 멈춰 있으면 새로 시작한다
  setTempo(getBpm) {
    if (!this.timer) return this.start(getBpm);
    this.getBpm = getBpm;
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

  // ---------------- 음악 스타일 ----------------
  // 모든 스타일이 같은 박자 틀을 쓴다: 비트 하나 = 페달 반 바퀴, 마디 하나 = 비트 4개 (페달 두 바퀴).
  // 어느 스타일이든 비트마다 또렷한 소리가 나서 페달 박자를 이끈다. 음은 모두 다장조/가단조 안에 있어
  // 연속 정답 보상음(LADDER, 가단조 5음)과 어울린다. 고르는 곳: 운영 메뉴 '음악' (MUSIC_STYLES, js/config.js)
  static m2f(n) {
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  static hash(i) {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  setStyle(id) {
    this.style = BeatAudio.STYLES[id] ? id : 'beat';
  }

  playBeat(i, t, spb) {
    (BeatAudio.STYLES[this.style] || BeatAudio.STYLES.beat).call(this, i, t, spb);
  }

  // 화음: 낮은 근음부터 쌓은 MIDI 번호
  static CHORDS = {
    C: [48, 55, 60, 64, 67], G: [43, 50, 55, 59, 62], Am: [45, 52, 57, 60, 64], F: [41, 48, 53, 57, 60],
    Dm: [50, 57, 62, 65, 69], E: [40, 47, 56, 59, 64], Cmaj7: [48, 55, 59, 64, 67], Am7: [45, 52, 55, 60, 64], Fmaj7: [41, 48, 52, 57, 60],
  };

  // 트로트 가락 (8마디, 한 바퀴 32비트): [시작 비트, 음, 길이(비트)]. 화음은 Am Am Dm Dm E E Am Am
  static TROT_TUNE = [
    [0, 76, 1], [1, 76, 0.5], [1.5, 74, 0.5], [2, 72, 1], [3, 71, 1],
    [4, 69, 2], [6, 72, 1], [7, 76, 1],
    [8, 77, 1.5], [9.5, 76, 0.5], [10, 74, 1], [11, 77, 1],
    [12, 76, 2], [14, 74, 1], [15, 72, 1],
    [16, 71, 1], [17, 72, 0.5], [17.5, 71, 0.5], [18, 68, 1], [19, 71, 1],
    [20, 76, 2], [22, 74, 1], [23, 71, 1],
    [24, 72, 1], [25, 71, 0.5], [25.5, 69, 0.5], [26, 72, 1], [27, 76, 1],
    [28, 69, 3],
  ];

  // 신나는 댄스의 신스 가락 (두 마디 = 8분음표 16개): [8분음표 자리, 음, 길이(8분음표)]. 0 = Am F 위, 1 = C G 위
  static DISCO_RIFF = [
    [[0, 76, 1], [2, 76, 1], [3, 74, 1], [4, 72, 2], [6, 69, 1], [7, 72, 1], [8, 72, 2], [10, 69, 1], [11, 72, 1], [12, 74, 2], [14, 72, 2]],
    [[0, 76, 1], [2, 79, 1], [3, 76, 1], [4, 74, 2], [6, 72, 1], [7, 74, 1], [8, 74, 2], [10, 71, 1], [11, 74, 1], [12, 74, 4]],
  ];

  // 속도 전환(두뇌 쉬는 시간) 동안 음악을 가라앉힌다 (신나는 댄스만 따른다). 끝나면 다음 마디 첫 박에 심벌
  setRest(on, crash = true) {
    if (this.rest && !on && crash) this.crashNext = true;
    this.rest = on;
  }

  static STYLES = {
    // 기본 비트: 킥·스네어·하이햇과 베이스 (예전 그대로)
    beat(i, t, spb) {
      const bassLine = [55, 55, 65.41, 49];
      if (i % 2 === 0) {
        this.kick(t);
        this.bass(t, bassLine[Math.floor(i / 8) % 4], spb * 0.9);
      } else {
        this.snare(t);
      }
      this.hat(t + spb / 2);
    },

    // 산책 기타: 부드러운 킥과 셰이커 위에 기타처럼 뜯는 화음. C G Am F
    acoustic(i, t, spb) {
      const C = BeatAudio.CHORDS[['C', 'G', 'Am', 'F'][Math.floor(i / 4) % 4]];
      const pos = i % 4;
      if (pos % 2 === 0) this.kick(t, 0.45, 110);
      else this.shaker(t, 0.12);
      this.shaker(t + spb / 2, 0.05);
      const arp = [0, 1, 2, 3, 4, 3, 2, 1];
      for (const h of [0, 1]) {
        const n = C[arp[pos * 2 + h]];
        this.pluck(t + (h * spb) / 2, BeatAudio.m2f(n + 12), spb * 1.6, pos * 2 + h === 0 ? 0.16 : 0.11);
      }
      if (pos === 0) this.bass(t, BeatAudio.m2f(C[0] - 12) / 2, spb * 1.8, 0.2);
    },

    // 트로트: 쿵(베이스·킥) 짝(화음·박수)과 아코디언 가락. 가락은 한 바퀴(8마디) 걸러 한 번씩 나온다
    trot(i, t, spb) {
      const bar = Math.floor(i / 4);
      const C = BeatAudio.CHORDS[['Am', 'Am', 'Dm', 'Dm', 'E', 'E', 'Am', 'Am'][bar % 8]];
      const pos = i % 4;
      if (pos % 2 === 0) {
        this.kick(t, 0.7);
        this.bass(t, BeatAudio.m2f((pos === 0 ? C[0] : C[1]) - 12) / 2, spb * 0.8, 0.24);
      } else {
        this.clap(t, 0.22);
        this.stab(t, C.slice(2).map((n) => BeatAudio.m2f(n)), 0.05);
      }
      this.hat(t + spb / 2, 0.06);
      if (Math.floor(bar / 8) % 2 === 1) {
        const at = i % 32;
        for (const [s, n, len] of BeatAudio.TROT_TUNE) {
          if (s >= at && s < at + 1) this.accordion(t + (s - at) * spb, BeatAudio.m2f(n), len * spb * 0.92, 0.07);
        }
      }
    },

    // 신나는 댄스: 비트마다 킥(페달 박자), 라운드가 흐르며 소리가 하나씩 더해진다. 마디 = 비트 4개 = 페달 두 바퀴 (60 RPM 이면 2초)
    //   0~7마디    들어가기: 킥 + 베이스 (대개 속도 측정 동안)
    //   8~15마디   + 박수 · 하이햇
    //   16~23마디  + 엇박 오픈 하이햇 · 옥타브 베이스 · 깔리는 화음
    //   24마디~   48마디(60 RPM 이면 약 1분 36초)씩 되풀이:
    //             본 그루브 24 (16~23마디에 신스 가락) → 다른 화음의 그루브 12 → 쉬어 가기 6 → 끌어올리기 6
    //   속도 전환(두뇌 쉬는 시간) 동안은 킥 · 베이스 · 화음만 남기고, 끝나면 심벌과 함께 돌아온다 (setRest)
    disco(i, t, spb) {
      const bar = Math.floor(i / 4);
      const pos = i % 4;
      const c = (bar - 24) % 48;
      const sec = this.rest ? 'rest' : bar < 8 ? 'intro' : bar < 16 ? 'build1' : bar < 24 ? 'build2'
        : c < 24 ? 'full' : c < 36 ? 'groove' : c < 42 ? 'break' : 'rise';
      const C = BeatAudio.CHORDS[(sec === 'groove' ? ['F', 'G', 'Am', 'Am'] : ['Am', 'F', 'C', 'G'])[bar % 4]];
      const chord = C.slice(1).map((n) => BeatAudio.m2f(n));
      const root = BeatAudio.m2f(C[0] - 12);
      const calm = sec === 'rest' || sec === 'break';

      if (pos === 0 && (this.crashNext || (!this.rest && (bar === 16 || (bar >= 24 && c === 0))))) {
        this.crash(t, 0.1);
        this.crashNext = false;
      }
      this.kick(t, calm ? 0.45 : sec === 'intro' ? 0.55 : 0.62);

      // 박수
      if (!calm && sec !== 'intro') {
        if (pos % 2 === 1) this.clap(t, 0.22);
        if (sec === 'rise' && c >= 46 && pos % 2 === 0) this.clap(t, 0.16);
        if (sec === 'rise' && c === 47) this.clap(t + spb / 2, 0.14);
      }
      // 하이햇
      if (sec === 'build1' || sec === 'rise') this.hat(t + spb / 2, 0.07);
      else if (sec === 'build2' || sec === 'full') this.openHat(t + spb / 2, 0.07);
      else if (sec === 'groove') for (const k of [1, 2, 3]) this.hat(t + (k * spb) / 4, k === 2 ? 0.08 : 0.045);
      // 베이스
      if (calm || sec === 'intro') {
        if (pos % 2 === 0) this.bass(t, root / 2, spb * 1.6, 0.2);
      } else if (sec === 'build1') {
        this.bass(t, root / 2, spb * 0.42, 0.22);
      } else {
        this.bass(t, root / 2, spb * 0.42, 0.22);
        this.bass(t + spb / 2, root, spb * 0.42, 0.16);
      }
      // 화음
      if (pos === 0 && sec !== 'intro' && sec !== 'build1') this.pad(t, chord, spb * 4, calm ? 0.045 : 0.03);
      // 신스 가락: 본 그루브 16~23마디, 두 마디씩 (Am F 위에서 A, C G 위에서 B)
      if (sec === 'full' && c >= 16) {
        const riff = BeatAudio.DISCO_RIFF[bar % 4 < 2 ? 0 : 1];
        const at = (bar % 2) * 8 + pos * 2;
        for (const [e, n, len] of riff) {
          if (e === at || e === at + 1) this.lead(t + ((e - at) * spb) / 2, BeatAudio.m2f(n), (len * spb) / 2, 0.045);
        }
      }
      // 끌어올리기: 6마디 동안 올라가는 쉿 소리
      if (sec === 'rise' && c === 42 && pos === 0) this.riser(t, spb * 24);
    },

    // 잔잔하게: 드럼 없이 똑딱 나무 소리가 박자를 짚고, 화음과 종소리가 천천히 흐른다. C Am F G (두 마디씩)
    calm(i, t, spb) {
      const C = BeatAudio.CHORDS[['C', 'Am', 'F', 'G'][Math.floor(i / 8) % 4]];
      this.woodblock(t, i % 2 === 0 ? 1050 : 790, i % 2 === 0 ? 0.2 : 0.14);
      if (i % 8 === 0) this.pad(t, C.slice(1).map((n) => BeatAudio.m2f(n)), spb * 8, 0.035);
      if (i % 4 === 0) this.bass(t, BeatAudio.m2f(C[0] - 12) / 2, spb * 3, 0.14);
      if (BeatAudio.hash(i) < 0.35) {
        const penta = [72, 74, 76, 79, 81];
        this.bell(t + (BeatAudio.hash(i + 7) < 0.5 ? 0 : spb / 2), BeatAudio.m2f(penta[Math.floor(BeatAudio.hash(i + 3) * 5)]), 0.05);
      }
    },
  };

  // 미리 듣기 (운영 메뉴): 이 스타일을 120 BPM(페달 60 RPM)으로 sec 초 들려준다. 라운드가 시작되면 그쪽이 이긴다
  preview(style, sec = 10) {
    this.ensure();
    const keep = this.previewing ? this.previewKeep : this.style;
    this.setStyle(style);
    if (!this.previewing) this.previewMuted = this.muted;
    this.previewing = false;
    this.setMuted(false); // 소리를 꺼 둔 설정이어도 미리 듣기는 들린다
    this.start(() => 120, { fadeIn: 0.3 });
    this.previewing = true;
    this.previewKeep = keep;
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.endPreview(), sec * 1000);
  }

  endPreview() {
    if (!this.previewing) return;
    this.previewing = false;
    clearTimeout(this.previewTimer);
    this.stop();
    this.style = this.previewKeep;
    this.setMuted(this.previewMuted);
  }

  // ---------------- 세션 설정 화면의 잔잔한 음악 ----------------
  // 페달과 상관없이 느린 빠르기(76 BPM)로 흐른다. 드럼 없이 화음과 종소리만. 화면을 떠나면 천천히 줄어든다
  ambient(on) {
    if (on) {
      this.ensure();
      if (this.ambTimer) return;
      this.amb = this.ctx.createGain();
      this.amb.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      this.amb.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 1.2);
      this.amb.connect(this.master);
      this.ambBeat = 0;
      this.ambNext = this.ctx.currentTime + 0.1;
      this.ambTimer = setInterval(() => this.ambientSchedule(), 50);
      this.ambientSchedule();
      return;
    }
    if (!this.ambTimer) return;
    clearInterval(this.ambTimer);
    this.ambTimer = null;
    const g = this.amb;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.8);
    setTimeout(() => g.disconnect(), 1500);
  }

  ambientSchedule() {
    const spb = 60 / 76;
    const out = this.amb;
    while (this.ambNext < this.ctx.currentTime + 0.2) {
      const i = this.ambBeat;
      const t = this.ambNext;
      const C = BeatAudio.CHORDS[['Cmaj7', 'Am7', 'Fmaj7', 'G'][Math.floor(i / 8) % 4]];
      if (i % 8 === 0) {
        this.pad(t, C.slice(1).map((n) => BeatAudio.m2f(n)), spb * 8, 0.04, out);
        this.bass(t, BeatAudio.m2f(C[0] - 12) / 2, spb * 6, 0.1, out);
      }
      if (BeatAudio.hash(i + 101) < 0.7) this.bell(t, BeatAudio.m2f(C[1 + Math.floor(BeatAudio.hash(i + 55) * 4)] + 12), 0.045, out);
      this.ambNext += spb;
      this.ambBeat++;
    }
  }

  // ---------------- 악기 ----------------
  pluck(t, f, dur, vol, out = this.master) {
    const c = this.ctx;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 0.25);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    lp.connect(g).connect(out);
    for (const [type, mul, v] of [['triangle', 1, 1], ['sine', 2, 0.35]]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f * mul;
      const og = c.createGain();
      og.gain.value = v;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }

  pad(t, freqs, dur, vol, out = this.master) {
    const c = this.ctx;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1300;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.4, dur * 0.3));
    g.gain.setValueAtTime(vol, t + dur * 0.75);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    lp.connect(g).connect(out);
    for (const f of freqs) {
      for (const d of [-7, 7]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = d;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  stab(t, freqs, vol) {
    const c = this.ctx;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    lp.connect(g).connect(this.master);
    for (const f of freqs) {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(lp);
      o.start(t);
      o.stop(t + 0.15);
    }
  }

  // 아코디언처럼: 살짝 어긋난 두 톱니파 + 떨림
  accordion(t, f, dur, vol) {
    const c = this.ctx;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.setValueAtTime(vol, t + Math.max(0.03, dur - 0.06));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    lp.connect(g).connect(this.master);
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.5;
    const depth = c.createGain();
    depth.gain.value = 9;
    lfo.connect(depth);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
    for (const d of [0, 12]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = d;
      depth.connect(o.detune);
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  bell(t, f, vol, out = this.master) {
    const c = this.ctx;
    for (const [mul, v, len] of [[1, 1, 1.6], [2.76, 0.25, 0.6]]) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mul;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * v, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0005, t + len);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + len + 0.02);
    }
  }

  woodblock(t, f, vol) {
    const c = this.ctx;
    for (const [type, mul, v] of [['sine', 1, 1], ['triangle', 1.52, 0.4]]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f * mul;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * v, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.08);
    }
  }

  noiseHit(t, type, freq, vol, len, q = 1) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + len + 0.02);
  }

  crash(t, vol) {
    this.noiseHit(t, 'highpass', 5000, vol, 1.4, 0.7);
  }

  // 점점 커지며 높아지는 쉿 소리 (끌어올리기)
  riser(t, dur) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.1);
  }

  // 신스 가락: 살짝 어긋난 두 사각파
  lead(t, f, dur, vol) {
    const c = this.ctx;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(1400, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.setValueAtTime(vol, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    lp.connect(g).connect(this.master);
    for (const d of [-6, 6]) {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.detune.value = d;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }

  shaker(t, vol) {
    this.noiseHit(t, 'highpass', 6500, vol, 0.06);
  }

  openHat(t, vol) {
    this.noiseHit(t, 'highpass', 8000, vol, 0.18);
  }

  clap(t, vol) {
    this.noiseHit(t, 'bandpass', 1300, vol, 0.13, 0.9);
    this.noiseHit(t + 0.012, 'bandpass', 1300, vol * 0.7, 0.1, 0.9);
  }

  kick(t, vol = 0.9, from = 140) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(vol, t);
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

  hat(t, vol = 0.12) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + 0.05);
  }

  bass(t, freq, dur, vol = 0.25, out = this.master) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq * 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + Math.min(dur, 0.5));
    o.connect(g).connect(out);
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

  // 연속 정답 보상음. 한 번 맞힐 때마다 음이 한 단계씩 올라가서, 연속이 쌓이는 게 귀로 들린다.
  // 음은 비트의 베이스(A 단조)와 같은 음계라 반주 위에 얹혀도 어긋나지 않는다.
  static LADDER = [880, 1046.5, 1174.7, 1318.5, 1568, 1760];

  reward(streak) {
    if (!this.ctx) return;
    const L = BeatAudio.LADDER;
    this.blip(L[Math.max(0, Math.min(streak - 1, L.length - 1))]);
  }

  // 사인파 하나보다 두툼하게 — 살짝 어긋난 두 음을 겹치고, 음을 아래에서 끌어올리고,
  // 맨 앞에 아주 짧은 잡음을 얹어 또렷하게 친다.
  blip(freq) {
    const c = this.ctx;
    const t = c.currentTime;
    for (const [type, detune, vol] of [['triangle', 1, 0.2], ['sine', 1.006, 0.14]]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq * detune * 0.84, t);
      o.frequency.exponentialRampToValueAtTime(freq * detune, t + 0.045);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.32);
    }
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4200;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.09, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(hp).connect(ng).connect(this.master);
    s.start(t);
    s.stop(t + 0.06);
  }

  sfx(name) {
    switch (name) {
      case 'tap': this.tone(660, 0.08, 'sine', 0.2); break;
      case 'good': this.tone(880, 0.1, 'sine', 0.25); break;
      case 'bad': this.tone(180, 0.25, 'square', 0.15); break;
      // 길게 이어 온 연속이 끊길 때. 그냥 틀렸을 때보다 아깝게 들리도록 떨어뜨린다.
      case 'drop':
        this.tone(392, 0.14, 'triangle', 0.18);
        this.tone(262, 0.28, 'triangle', 0.18, 0.1);
        break;
      case 'clear':
        this.tone(660, 0.12, 'sine', 0.25);
        this.tone(880, 0.12, 'sine', 0.25, 0.09);
        this.tone(1320, 0.2, 'sine', 0.25, 0.18);
        break;
      case 'blink': this.tone(520, 0.06, 'sine', 0.12); break;
      // 라운드 끝에 건물을 한 층 올릴 때 (나무 블록을 얹는 통통 소리), 지붕을 얹을 때는 한 음 높게
      case 'build':
        this.tone(262, 0.09, 'triangle', 0.28);
        this.tone(392, 0.07, 'triangle', 0.14, 0.03);
        break;
      case 'buildTop':
        this.tone(392, 0.09, 'triangle', 0.28);
        this.tone(523, 0.1, 'triangle', 0.16, 0.03);
        break;
      case 'tick': this.tone(1200, 0.04, 'square', 0.06); break;
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
