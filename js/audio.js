// WebAudio로 합성하는 비트 + 효과음.
// 비트 1개 = 페달 반 바퀴 (A 또는 D 한 번). 짝수 비트는 킥(A), 홀수 비트는 스네어(D).
import { Sfx } from './sfx.js';

export class BeatAudio {
  constructor() {
    this.audioContext = null;
    this.master = null;
    this.timer = null;
    this.queue = [];
    this.muted = false;
    this.style = 'beat'; // 음악 스타일 (STYLES)
  }

  ensure() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.audioContext.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.audioContext.destination);
      this.noise = this.makeNoise();
    }
    if (this.audioContext.state === 'suspended') this.audioContext.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (!this.master) return;
    this.master.gain.cancelScheduledValues(this.audioContext.currentTime); // 진행 중인 페이드인을 끊는다
    this.master.gain.value = muted ? 0 : 0.55;
  }

  makeNoise() {
    const frameCount = this.audioContext.sampleRate * 0.5;
    const buffer = this.audioContext.createBuffer(1, frameCount, this.audioContext.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) samples[i] = Math.random() * 2 - 1;
    return buffer;
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
      const masterGain = this.master.gain;
      const now = this.audioContext.currentTime;
      masterGain.cancelScheduledValues(now);
      masterGain.setValueAtTime(0.0001, now);
      masterGain.linearRampToValueAtTime(0.55, now + fadeIn);
    }
    this.getBpm = getBpm;
    this.beat = 0;
    this.next = this.audioContext.currentTime + 0.1;
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
    if (this.audioContext) this.audioContext.suspend();
  }

  resume() {
    if (this.audioContext) this.audioContext.resume();
  }

  schedule() {
    const ahead = this.audioContext.currentTime + 0.12;
    while (this.next < ahead) {
      const secondsPerBeat = 60 / this.getBpm();
      this.playBeat(this.beat, this.next, secondsPerBeat);
      this.queue.push({ time: this.next, beatIndex: this.beat });
      this.next += secondsPerBeat;
      this.beat++;
    }
  }

  // 시각 효과용: 이미 소리가 난 비트들을 꺼낸다
  pollBeats() {
    if (!this.audioContext) return [];
    const now = this.audioContext.currentTime;
    const played = [];
    while (this.queue.length && this.queue[0].time <= now) played.push(this.queue.shift());
    return played;
  }

  // ---------------- 음악 스타일 ----------------
  // 모든 스타일이 같은 박자 틀을 쓴다: 비트 하나 = 페달 반 바퀴, 마디 하나 = 비트 4개 (페달 두 바퀴).
  // 어느 스타일이든 비트마다 또렷한 소리가 나서 페달 박자를 이끈다. 음은 모두 다장조/가단조 안에 있어
  // 연속 정답 보상음(LADDER, 가단조 5음)과 어울린다. 고르는 곳: 운영 메뉴 '음악' (MUSIC_STYLES, js/config.js)
  static midiToFrequency(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  static hash(seed) {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  setStyle(id) {
    this.style = BeatAudio.STYLES[id] ? id : 'beat';
  }

  playBeat(beat, time, secondsPerBeat) {
    (BeatAudio.STYLES[this.style] || BeatAudio.STYLES.beat).call(this, beat, time, secondsPerBeat);
  }

  // 화음: 낮은 근음부터 쌓은 MIDI 번호
  static CHORDS = {
    cMajor: [48, 55, 60, 64, 67], gMajor: [43, 50, 55, 59, 62], aMinor: [45, 52, 57, 60, 64], fMajor: [41, 48, 53, 57, 60],
    dMinor: [50, 57, 62, 65, 69], eMajor: [40, 47, 56, 59, 64], cMajor7: [48, 55, 59, 64, 67], aMinor7: [45, 52, 55, 60, 64], fMajor7: [41, 48, 52, 57, 60],
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
  setRest(resting, crash = true) {
    if (this.rest && !resting && crash) this.crashNext = true;
    this.rest = resting;
  }

  static STYLES = {
    // 기본 비트: 킥·스네어·하이햇과 베이스 (예전 그대로)
    beat(beat, time, secondsPerBeat) {
      const bassLine = [55, 55, 65.41, 49];
      if (beat % 2 === 0) {
        this.kick(time);
        this.bass(time, bassLine[Math.floor(beat / 8) % 4], secondsPerBeat * 0.9);
      } else {
        this.snare(time);
      }
      this.hat(time + secondsPerBeat / 2);
    },

    // 산책 기타: 부드러운 킥과 셰이커 위에 기타처럼 뜯는 화음. C G Am F
    acoustic(beat, time, secondsPerBeat) {
      const chordNotes = BeatAudio.CHORDS[['cMajor', 'gMajor', 'aMinor', 'fMajor'][Math.floor(beat / 4) % 4]];
      const beatInBar = beat % 4;
      if (beatInBar % 2 === 0) this.kick(time, 0.45, 110);
      else this.shaker(time, 0.12);
      this.shaker(time + secondsPerBeat / 2, 0.05);
      const arpeggio = [0, 1, 2, 3, 4, 3, 2, 1];
      for (const half of [0, 1]) {
        const note = chordNotes[arpeggio[beatInBar * 2 + half]];
        this.pluck(time + (half * secondsPerBeat) / 2, BeatAudio.midiToFrequency(note + 12), secondsPerBeat * 1.6, beatInBar * 2 + half === 0 ? 0.16 : 0.11);
      }
      if (beatInBar === 0) this.bass(time, BeatAudio.midiToFrequency(chordNotes[0] - 12) / 2, secondsPerBeat * 1.8, 0.2);
    },

    // 트로트: 쿵(베이스·킥) 짝(화음·박수)과 아코디언 가락. 가락은 한 바퀴(8마디) 걸러 한 번씩 나온다
    trot(beat, time, secondsPerBeat) {
      const bar = Math.floor(beat / 4);
      const chordNotes = BeatAudio.CHORDS[['aMinor', 'aMinor', 'dMinor', 'dMinor', 'eMajor', 'eMajor', 'aMinor', 'aMinor'][bar % 8]];
      const beatInBar = beat % 4;
      if (beatInBar % 2 === 0) {
        this.kick(time, 0.7);
        this.bass(time, BeatAudio.midiToFrequency((beatInBar === 0 ? chordNotes[0] : chordNotes[1]) - 12) / 2, secondsPerBeat * 0.8, 0.24);
      } else {
        this.clap(time, 0.22);
        this.stab(time, chordNotes.slice(2).map((note) => BeatAudio.midiToFrequency(note)), 0.05);
      }
      this.hat(time + secondsPerBeat / 2, 0.06);
      if (Math.floor(bar / 8) % 2 === 1) {
        const tuneBeat = beat % 32;
        for (const [startBeat, note, beats] of BeatAudio.TROT_TUNE) {
          if (startBeat >= tuneBeat && startBeat < tuneBeat + 1) this.accordion(time + (startBeat - tuneBeat) * secondsPerBeat, BeatAudio.midiToFrequency(note), beats * secondsPerBeat * 0.92, 0.07);
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
    disco(beat, time, secondsPerBeat) {
      const bar = Math.floor(beat / 4);
      const beatInBar = beat % 4;
      const cycleBar = (bar - 24) % 48;
      const section = this.rest ? 'rest' : bar < 8 ? 'intro' : bar < 16 ? 'build1' : bar < 24 ? 'build2'
        : cycleBar < 24 ? 'full' : cycleBar < 36 ? 'groove' : cycleBar < 42 ? 'break' : 'rise';
      const chordNotes = BeatAudio.CHORDS[(section === 'groove' ? ['fMajor', 'gMajor', 'aMinor', 'aMinor'] : ['aMinor', 'fMajor', 'cMajor', 'gMajor'])[bar % 4]];
      const chordFrequencies = chordNotes.slice(1).map((note) => BeatAudio.midiToFrequency(note));
      const root = BeatAudio.midiToFrequency(chordNotes[0] - 12);
      const calm = section === 'rest' || section === 'break';

      if (beatInBar === 0 && (this.crashNext || (!this.rest && (bar === 16 || (bar >= 24 && cycleBar === 0))))) {
        this.crash(time, 0.1);
        this.crashNext = false;
      }
      this.kick(time, calm ? 0.45 : section === 'intro' ? 0.55 : 0.62);

      // 박수
      if (!calm && section !== 'intro') {
        if (beatInBar % 2 === 1) this.clap(time, 0.22);
        if (section === 'rise' && cycleBar >= 46 && beatInBar % 2 === 0) this.clap(time, 0.16);
        if (section === 'rise' && cycleBar === 47) this.clap(time + secondsPerBeat / 2, 0.14);
      }
      // 하이햇
      if (section === 'build1' || section === 'rise') this.hat(time + secondsPerBeat / 2, 0.07);
      else if (section === 'build2' || section === 'full') this.openHat(time + secondsPerBeat / 2, 0.07);
      else if (section === 'groove') for (const quarter of [1, 2, 3]) this.hat(time + (quarter * secondsPerBeat) / 4, quarter === 2 ? 0.08 : 0.045);
      // 베이스
      if (calm || section === 'intro') {
        if (beatInBar % 2 === 0) this.bass(time, root / 2, secondsPerBeat * 1.6, 0.2);
      } else if (section === 'build1') {
        this.bass(time, root / 2, secondsPerBeat * 0.42, 0.22);
      } else {
        this.bass(time, root / 2, secondsPerBeat * 0.42, 0.22);
        this.bass(time + secondsPerBeat / 2, root, secondsPerBeat * 0.42, 0.16);
      }
      // 화음
      if (beatInBar === 0 && section !== 'intro' && section !== 'build1') this.pad(time, chordFrequencies, secondsPerBeat * 4, calm ? 0.045 : 0.03);
      // 신스 가락: 본 그루브 16~23마디, 두 마디씩 (Am F 위에서 A, C G 위에서 B)
      if (section === 'full' && cycleBar >= 16) {
        const riff = BeatAudio.DISCO_RIFF[bar % 4 < 2 ? 0 : 1];
        const riffEighth = (bar % 2) * 8 + beatInBar * 2;
        for (const [eighth, note, eighths] of riff) {
          if (eighth === riffEighth || eighth === riffEighth + 1) this.lead(time + ((eighth - riffEighth) * secondsPerBeat) / 2, BeatAudio.midiToFrequency(note), (eighths * secondsPerBeat) / 2, 0.045);
        }
      }
      // 끌어올리기: 6마디 동안 올라가는 쉿 소리
      if (section === 'rise' && cycleBar === 42 && beatInBar === 0) this.riser(time, secondsPerBeat * 24);
    },

    // 잔잔하게: 드럼 없이 똑딱 나무 소리가 박자를 짚고, 화음과 종소리가 천천히 흐른다. C Am F G (두 마디씩)
    calm(beat, time, secondsPerBeat) {
      const chordNotes = BeatAudio.CHORDS[['cMajor', 'aMinor', 'fMajor', 'gMajor'][Math.floor(beat / 8) % 4]];
      this.woodblock(time, beat % 2 === 0 ? 1050 : 790, beat % 2 === 0 ? 0.2 : 0.14);
      if (beat % 8 === 0) this.pad(time, chordNotes.slice(1).map((note) => BeatAudio.midiToFrequency(note)), secondsPerBeat * 8, 0.035);
      if (beat % 4 === 0) this.bass(time, BeatAudio.midiToFrequency(chordNotes[0] - 12) / 2, secondsPerBeat * 3, 0.14);
      if (BeatAudio.hash(beat) < 0.35) {
        const penta = [72, 74, 76, 79, 81];
        this.bell(time + (BeatAudio.hash(beat + 7) < 0.5 ? 0 : secondsPerBeat / 2), BeatAudio.midiToFrequency(penta[Math.floor(BeatAudio.hash(beat + 3) * 5)]), 0.05);
      }
    },
  };

  // 미리 듣기 (운영 메뉴): 이 스타일을 120 BPM(페달 60 RPM)으로 seconds 초 동안 들려준다. 라운드가 시작되면 그쪽이 이긴다
  preview(style, seconds = 10) {
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
    this.previewTimer = setTimeout(() => this.endPreview(), seconds * 1000);
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
  ambient(playing) {
    if (playing) {
      this.ensure();
      if (this.ambientTimer) return;
      this.ambientGain = this.audioContext.createGain();
      this.ambientGain.gain.setValueAtTime(0.0001, this.audioContext.currentTime);
      this.ambientGain.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 1.2);
      this.ambientGain.connect(this.master);
      this.ambientBeat = 0;
      this.ambientNext = this.audioContext.currentTime + 0.1;
      this.ambientTimer = setInterval(() => this.ambientSchedule(), 50);
      this.ambientSchedule();
      return;
    }
    if (!this.ambientTimer) return;
    clearInterval(this.ambientTimer);
    this.ambientTimer = null;
    const fadingGain = this.ambientGain;
    const now = this.audioContext.currentTime;
    fadingGain.gain.cancelScheduledValues(now);
    fadingGain.gain.setValueAtTime(fadingGain.gain.value, now);
    fadingGain.gain.linearRampToValueAtTime(0.0001, now + 0.8);
    setTimeout(() => fadingGain.disconnect(), 1500);
  }

  ambientSchedule() {
    const secondsPerBeat = 60 / 76;
    const destination = this.ambientGain;
    while (this.ambientNext < this.audioContext.currentTime + 0.2) {
      const beat = this.ambientBeat;
      const time = this.ambientNext;
      const chordNotes = BeatAudio.CHORDS[['cMajor7', 'aMinor7', 'fMajor7', 'gMajor'][Math.floor(beat / 8) % 4]];
      if (beat % 8 === 0) {
        this.pad(time, chordNotes.slice(1).map((note) => BeatAudio.midiToFrequency(note)), secondsPerBeat * 8, 0.04, destination);
        this.bass(time, BeatAudio.midiToFrequency(chordNotes[0] - 12) / 2, secondsPerBeat * 6, 0.1, destination);
      }
      if (BeatAudio.hash(beat + 101) < 0.7) this.bell(time, BeatAudio.midiToFrequency(chordNotes[1 + Math.floor(BeatAudio.hash(beat + 55) * 4)] + 12), 0.045, destination);
      this.ambientNext += secondsPerBeat;
      this.ambientBeat++;
    }
  }

  // ---------------- 악기 ----------------
  pluck(time, frequency, duration, volume, destination = this.master) {
    const audioContext = this.audioContext;
    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(4200, time);
    lowpass.frequency.exponentialRampToValueAtTime(900, time + 0.25);
    const envelope = audioContext.createGain();
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(volume, time + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
    lowpass.connect(envelope).connect(destination);
    for (const [type, ratio, level] of [['triangle', 1, 1], ['sine', 2, 0.35]]) {
      const oscillator = audioContext.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = frequency * ratio;
      const partialGain = audioContext.createGain();
      partialGain.gain.value = level;
      oscillator.connect(partialGain).connect(lowpass);
      oscillator.start(time);
      oscillator.stop(time + duration + 0.02);
    }
  }

  pad(time, frequencies, duration, volume, destination = this.master) {
    const audioContext = this.audioContext;
    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1300;
    const envelope = audioContext.createGain();
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.linearRampToValueAtTime(volume, time + Math.min(0.4, duration * 0.3));
    envelope.gain.setValueAtTime(volume, time + duration * 0.75);
    envelope.gain.linearRampToValueAtTime(0.0001, time + duration);
    lowpass.connect(envelope).connect(destination);
    for (const frequency of frequencies) {
      for (const detune of [-7, 7]) {
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sawtooth';
        oscillator.frequency.value = frequency;
        oscillator.detune.value = detune;
        oscillator.connect(lowpass);
        oscillator.start(time);
        oscillator.stop(time + duration + 0.05);
      }
    }
  }

  stab(time, frequencies, volume) {
    const audioContext = this.audioContext;
    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 2400;
    const envelope = audioContext.createGain();
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(volume, time + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.13);
    lowpass.connect(envelope).connect(this.master);
    for (const frequency of frequencies) {
      const oscillator = audioContext.createOscillator();
      oscillator.type = 'square';
      oscillator.frequency.value = frequency;
      oscillator.connect(lowpass);
      oscillator.start(time);
      oscillator.stop(time + 0.15);
    }
  }

  // 아코디언처럼: 살짝 어긋난 두 톱니파 + 떨림
  accordion(time, frequency, duration, volume) {
    const audioContext = this.audioContext;
    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 2600;
    const envelope = audioContext.createGain();
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.linearRampToValueAtTime(volume, time + 0.03);
    envelope.gain.setValueAtTime(volume, time + Math.max(0.03, duration - 0.06));
    envelope.gain.linearRampToValueAtTime(0.0001, time + duration);
    lowpass.connect(envelope).connect(this.master);
    const vibrato = audioContext.createOscillator();
    vibrato.frequency.value = 5.5;
    const depth = audioContext.createGain();
    depth.gain.value = 9;
    vibrato.connect(depth);
    vibrato.start(time);
    vibrato.stop(time + duration + 0.05);
    for (const detune of [0, 12]) {
      const oscillator = audioContext.createOscillator();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = detune;
      depth.connect(oscillator.detune);
      oscillator.connect(lowpass);
      oscillator.start(time);
      oscillator.stop(time + duration + 0.05);
    }
  }

  bell(time, frequency, volume, destination = this.master) {
    const audioContext = this.audioContext;
    for (const [ratio, level, decay] of [[1, 1, 1.6], [2.76, 0.25, 0.6]]) {
      const oscillator = audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency * ratio;
      const envelope = audioContext.createGain();
      envelope.gain.setValueAtTime(0.0001, time);
      envelope.gain.exponentialRampToValueAtTime(volume * level, time + 0.006);
      envelope.gain.exponentialRampToValueAtTime(0.0005, time + decay);
      oscillator.connect(envelope).connect(destination);
      oscillator.start(time);
      oscillator.stop(time + decay + 0.02);
    }
  }

  woodblock(time, frequency, volume) {
    const audioContext = this.audioContext;
    for (const [type, ratio, level] of [['sine', 1, 1], ['triangle', 1.52, 0.4]]) {
      const oscillator = audioContext.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = frequency * ratio;
      const envelope = audioContext.createGain();
      envelope.gain.setValueAtTime(0.0001, time);
      envelope.gain.exponentialRampToValueAtTime(volume * level, time + 0.003);
      envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
      oscillator.connect(envelope).connect(this.master);
      oscillator.start(time);
      oscillator.stop(time + 0.08);
    }
  }

  noiseHit(time, type, frequency, volume, decay, resonance = 1) {
    const audioContext = this.audioContext;
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = this.noise;
    const filter = audioContext.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = resonance;
    const envelope = audioContext.createGain();
    envelope.gain.setValueAtTime(volume, time);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + decay);
    noiseSource.connect(filter).connect(envelope).connect(this.master);
    noiseSource.start(time);
    noiseSource.stop(time + decay + 0.02);
  }

  crash(time, volume) {
    this.noiseHit(time, 'highpass', 5000, volume, 1.4, 0.7);
  }

  // 점점 커지며 높아지는 쉿 소리 (끌어올리기)
  riser(time, duration) {
    const audioContext = this.audioContext;
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = this.noise;
    noiseSource.loop = true;
    const filter = audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(500, time);
    filter.frequency.exponentialRampToValueAtTime(7000, time + duration);
    const envelope = audioContext.createGain();
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(0.09, time + duration);
    envelope.gain.linearRampToValueAtTime(0.0001, time + duration + 0.05);
    noiseSource.connect(filter).connect(envelope).connect(this.master);
    noiseSource.start(time);
    noiseSource.stop(time + duration + 0.1);
  }

  // 신스 가락: 살짝 어긋난 두 사각파
  lead(time, frequency, duration, volume) {
    const audioContext = this.audioContext;
    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(3200, time);
    lowpass.frequency.exponentialRampToValueAtTime(1400, time + duration);
    const envelope = audioContext.createGain();
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(volume, time + 0.01);
    envelope.gain.setValueAtTime(volume, time + duration * 0.6);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
    lowpass.connect(envelope).connect(this.master);
    for (const detune of [-6, 6]) {
      const oscillator = audioContext.createOscillator();
      oscillator.type = 'square';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = detune;
      oscillator.connect(lowpass);
      oscillator.start(time);
      oscillator.stop(time + duration + 0.02);
    }
  }

  shaker(time, volume) {
    this.noiseHit(time, 'highpass', 6500, volume, 0.06);
  }

  openHat(time, volume) {
    this.noiseHit(time, 'highpass', 8000, volume, 0.18);
  }

  clap(time, volume) {
    this.noiseHit(time, 'bandpass', 1300, volume, 0.13, 0.9);
    this.noiseHit(time + 0.012, 'bandpass', 1300, volume * 0.7, 0.1, 0.9);
  }

  kick(time, volume = 0.9, from = 140) {
    const audioContext = this.audioContext;
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    oscillator.frequency.setValueAtTime(from, time);
    oscillator.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    envelope.gain.setValueAtTime(volume, time);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
    oscillator.connect(envelope).connect(this.master);
    oscillator.start(time);
    oscillator.stop(time + 0.25);
  }

  snare(time) {
    const audioContext = this.audioContext;
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = this.noise;
    const filter = audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    const envelope = audioContext.createGain();
    envelope.gain.setValueAtTime(0.45, time);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
    noiseSource.connect(filter).connect(envelope).connect(this.master);
    noiseSource.start(time);
    noiseSource.stop(time + 0.16);
  }

  hat(time, volume = 0.12) {
    const audioContext = this.audioContext;
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = this.noise;
    const filter = audioContext.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const envelope = audioContext.createGain();
    envelope.gain.setValueAtTime(volume, time);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    noiseSource.connect(filter).connect(envelope).connect(this.master);
    noiseSource.start(time);
    noiseSource.stop(time + 0.05);
  }

  bass(time, frequency, duration, volume = 0.25, destination = this.master) {
    const audioContext = this.audioContext;
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency * 2;
    const envelope = audioContext.createGain();
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(volume, time + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + Math.min(duration, 0.5));
    oscillator.connect(envelope).connect(destination);
    oscillator.start(time);
    oscillator.stop(time + Math.min(duration, 0.5) + 0.02);
  }

  tone(frequency, duration, type = 'sine', volume = 0.3, delay = 0) {
    if (!this.audioContext) return;
    const audioContext = this.audioContext;
    const time = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    const envelope = audioContext.createGain();
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(volume, time + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(envelope).connect(this.master);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  // 연속 정답 보상음. 한 번 맞힐 때마다 음이 한 단계씩 올라가서, 연속이 쌓이는 게 귀로 들린다.
  // 음은 비트의 베이스(A 단조)와 같은 음계라 반주 위에 얹혀도 어긋나지 않는다.
  static LADDER = [880, 1046.5, 1174.7, 1318.5, 1568, 1760];

  reward(streak) {
    if (!this.audioContext) return;
    const ladder = BeatAudio.LADDER;
    this.blip(ladder[Math.max(0, Math.min(streak - 1, ladder.length - 1))]);
  }

  // 사인파 하나보다 두툼하게 — 살짝 어긋난 두 음을 겹치고, 음을 아래에서 끌어올리고,
  // 맨 앞에 아주 짧은 잡음을 얹어 또렷하게 친다.
  blip(frequency) {
    const audioContext = this.audioContext;
    const time = audioContext.currentTime;
    for (const [type, detune, volume] of [['triangle', 1, 0.2], ['sine', 1.006, 0.14]]) {
      const oscillator = audioContext.createOscillator();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency * detune * 0.84, time);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * detune, time + 0.045);
      const envelope = audioContext.createGain();
      envelope.gain.setValueAtTime(0.0001, time);
      envelope.gain.exponentialRampToValueAtTime(volume, time + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
      oscillator.connect(envelope).connect(this.master);
      oscillator.start(time);
      oscillator.stop(time + 0.32);
    }
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = this.noise;
    const highpass = audioContext.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 4200;
    const noiseEnvelope = audioContext.createGain();
    noiseEnvelope.gain.setValueAtTime(0.09, time);
    noiseEnvelope.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    noiseSource.connect(highpass).connect(noiseEnvelope).connect(this.master);
    noiseSource.start(time);
    noiseSource.stop(time + 0.06);
  }

  sfx(name) {
    switch (name) {
      case Sfx.TAP: this.tone(660, 0.08, 'sine', 0.2); break;
      case Sfx.GOOD: this.tone(880, 0.1, 'sine', 0.25); break;
      case Sfx.BAD: this.tone(180, 0.25, 'square', 0.15); break;
      // 길게 이어 온 연속이 끊길 때. 그냥 틀렸을 때보다 아깝게 들리도록 떨어뜨린다.
      case Sfx.DROP:
        this.tone(392, 0.14, 'triangle', 0.18);
        this.tone(262, 0.28, 'triangle', 0.18, 0.1);
        break;
      case Sfx.CLEAR:
        this.tone(660, 0.12, 'sine', 0.25);
        this.tone(880, 0.12, 'sine', 0.25, 0.09);
        this.tone(1320, 0.2, 'sine', 0.25, 0.18);
        break;
      case Sfx.BLINK: this.tone(520, 0.06, 'sine', 0.12); break;
      // 라운드 끝에 건물을 한 층 올릴 때 (나무 블록을 얹는 통통 소리), 지붕을 얹을 때는 한 음 높게
      case Sfx.BUILD:
        this.tone(262, 0.09, 'triangle', 0.28);
        this.tone(392, 0.07, 'triangle', 0.14, 0.03);
        break;
      case Sfx.BUILD_TOP:
        this.tone(392, 0.09, 'triangle', 0.28);
        this.tone(523, 0.1, 'triangle', 0.16, 0.03);
        break;
      case Sfx.TICK: this.tone(1200, 0.04, 'square', 0.06); break;
      case Sfx.COUNT: this.tone(440, 0.12, 'sine', 0.3); break;
      case Sfx.START: this.tone(880, 0.25, 'sine', 0.3); break;
      case Sfx.END:
        this.tone(880, 0.15, 'sine', 0.3);
        this.tone(660, 0.15, 'sine', 0.3, 0.15);
        this.tone(440, 0.4, 'sine', 0.3, 0.3);
        break;
    }
  }
}
