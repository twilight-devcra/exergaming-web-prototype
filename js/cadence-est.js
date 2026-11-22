// 페달 원시 파형 lz 로 케이던스를 직접 추정한다 (페달 펌웨어의 회전 검출기와 독립).
// 지금은 pedal-debug 페이지의 비교용이지만, 게임에서도 그대로 쓸 수 있게 화면 코드와 분리해 둔다.
//
// 입력: CAPD 의 lz 를 mg 단위로 100Hz 한 샘플씩 (sample). 유실 구간은 skip(sampleCount) 으로 시계만 넘긴다.
// lz 는 크랭크가 한 바퀴 돌 때 한 주기를 그리는 사인파에 가깝다 (2026-10-14 녹화로 확인, 29~50 rpm).
// 세 가지 추정값을 낸다.
//  zc    영교차: 반 바퀴마다 교차가 하나씩 생긴다. 교차 때마다 '최근 반 바퀴 둘 = 한 바퀴' 시간으로 갱신하고,
//        다음 교차가 늦어지면 그만큼 느려진 것으로 본다 (키보드 A/D 입력과 같은 처리). 녹화 기준 지연 약 1.25초, 흔들림 1.7%
//  teo   파형 모양: 고조파를 걸러낸 뒤 Teager 에너지 연산자 비 ω² = ΣΨ[y'] / ΣΨ[y] 를 0.5초 창으로 매 샘플 계산.
//        지연 약 0.65초로 빠르지만 일정하게 밟을 때 흔들림이 7% 정도라 단독으로는 공이 떨린다
//  comb  결합: 평소에는 zc, teo 가 zc 에서 COMB_DEV 넘게 COMB_HOLD 이상 벗어나 있으면 teo (실제 속도 변화로 본다)
// 최근 1초 동안 lz 의 변화 폭(최대 − 최소)이 STOP_RANGE_MG 아래면 정지로 보고 셋 다 0.
// DC 제거 뒤 진폭으로 판정하면 DC 추정의 잔물결(최대 40 mg 정도)이 1.5초 시정수로 빠질 때까지 정지가 늦게 잡힌다.
// 녹화 두 개에서 1초 변화 폭은 페달링 중 최소 110 mg (약 30 rpm), 정지 중 최대 16.6 mg 였다.
export class LzCadence {
  constructor() {
    this.reset();
    this.seq = -1;
  }

  // CAPD 프레임 하나를 넣고 read() 결과를 돌려준다. frame = [seq, 그 뒤 5샘플 × (lz, ly, gx, gz)], lz 는 0.1 mg 단위.
  // 짧은 유실(4프레임 이하)은 시계만 넘기고 이어 가고, 그보다 길거나 seq 가 되감기면(CAP 을 다시 건 경우) 처음부터 잡는다.
  capd(frame) {
    const seq = frame[0];
    const gap = seq - this.seq - 1;
    if (this.seq < 0 || gap < 0 || gap > 4) this.reset();
    else if (gap > 0) this.skip(gap * 5);
    this.seq = seq;
    for (let sampleIndex = 0; sampleIndex < 5; sampleIndex++) this.sample(frame[1 + sampleIndex * 4] / 10);
    return this.read();
  }

  reset() {
    this.time = 0;           // 이 추정기 기준 샘플 시계 (초)
    this.dcOffset = null;
    this.ampSlow = 0;        // 영교차 히스테리시스 기준
    this.stopWindow = new Float64Array(LzCadence.STOP_WINDOW); // 정지 판정용 최근 lz (원신호)
    this.stopWindowNext = 0;
    this.stopWindowFilled = 0;
    this.range = 0;
    this.state = 0;
    this.crossings = [];     // 최근 교차 시각 3개
    this.turnSeconds = 0;    // 최근 한 바퀴 시간 (초)
    this.zcNew = false;      // 마지막 read() 이후 영교차 추정이 새로 나왔는가
    this.setCutoff(LzCadence.CUTOFF_MIN_HZ);
    this.lowpassStages = [[0, 0, 0, 0], [0, 0, 0, 0]]; // 두 단 biquad 상태 (입력1, 입력2, 출력1, 출력2)
    this.filteredHistory = [0, 0, 0, 0]; // 걸러낸 신호의 최근 4개 (미분용)
    this.numerators = new Float64Array(LzCadence.TEO_WINDOW);
    this.denominators = new Float64Array(LzCadence.TEO_WINDOW);
    this.teoNext = 0;
    this.numeratorSum = 0;
    this.denominatorSum = 0;
    this.filled = 0;
    this.devSince = null;    // teo 가 zc 에서 벗어나기 시작한 시각
    this.wasStopped = true;
  }

  // 정지를 사이에 둔 값끼리 섞이지 않게: 멈출 때 교차 기록을, 다시 움직일 때 파형 창을 비운다.
  // (안 그러면 정지 전후 교차로 아주 느린 값이 나오고, 정지 잡음이 남은 창에서 TEO 가 수백 rpm 으로 튄다)
  clearTeo() {
    this.numerators.fill(0);
    this.denominators.fill(0);
    this.numeratorSum = 0;
    this.denominatorSum = 0;
    this.filled = 0;
    this.devSince = null;
  }

  // 4차(2차 × 2) 버터워스 저역통과. 차단 주파수는 현재 케이던스를 따라간다 (cutoffHz = 1.5 × 케이던스, 1.2~3 Hz)
  setCutoff(cutoffHz) {
    this.cutoffHz = cutoffHz;
    const prewarped = Math.tan(Math.PI * cutoffHz * LzCadence.SAMPLE_SEC);
    const quality = Math.SQRT1_2;
    const normalizer = 1 + prewarped / quality + prewarped * prewarped;
    this.feedForward0 = (prewarped * prewarped) / normalizer;
    this.feedForward1 = 2 * this.feedForward0;
    this.feedBack1 = (2 * (prewarped * prewarped - 1)) / normalizer;
    this.feedBack2 = (1 - prewarped / quality + prewarped * prewarped) / normalizer;
  }

  biquad(state, input) {
    const output = this.feedForward0 * input + this.feedForward1 * state[0] + this.feedForward0 * state[1]
      - this.feedBack1 * state[2] - this.feedBack2 * state[3];
    state[1] = state[0]; state[0] = input; state[3] = state[2]; state[2] = output;
    return output;
  }

  // 유실된 샘플 수만큼 시계만 넘긴다 (교차 간격이 실제 시간과 맞게)
  skip(sampleCount) {
    this.time += sampleCount * LzCadence.SAMPLE_SEC;
  }

  sample(lzMg) {
    const step = LzCadence.SAMPLE_SEC;
    this.time += step;
    if (this.dcOffset === null) this.dcOffset = lzMg;
    this.dcOffset += (lzMg - this.dcOffset) * LzCadence.DC_ALPHA;
    const centered = lzMg - this.dcOffset;
    this.ampSlow += (Math.abs(centered) - this.ampSlow) * LzCadence.SLOW_ALPHA;
    this.stopWindow[this.stopWindowNext] = lzMg;
    this.stopWindowNext = (this.stopWindowNext + 1) % LzCadence.STOP_WINDOW;
    if (this.stopWindowFilled < LzCadence.STOP_WINDOW) this.stopWindowFilled++;
    let low = Infinity, high = -Infinity;
    for (let i = 0; i < this.stopWindowFilled; i++) {
      const value = this.stopWindow[i];
      if (value < low) low = value;
      if (value > high) high = value;
    }
    this.range = high - low;
    const stopped = this.stopped;
    if (stopped && !this.wasStopped) {
      this.crossings = [];
      this.state = 0;
    } else if (!stopped && this.wasStopped) {
      this.clearTeo();
    }
    this.wasStopped = stopped;

    // 영교차 (히스테리시스: 진폭의 30%, 하한 8 mg)
    const hysteresis = Math.max(8, 0.3 * this.ampSlow);
    let crossed = false;
    if (this.state <= 0 && centered > hysteresis) { this.state = 1; crossed = true; }
    else if (this.state >= 0 && centered < -hysteresis) { this.state = -1; crossed = true; }
    if (crossed) {
      this.crossings.push(this.time);
      if (this.crossings.length > 3) this.crossings.shift();
      if (this.crossings.length === 3) {
        this.turnSeconds = this.crossings[2] - this.crossings[0];
        this.zcNew = true;
        const cutoffHz = Math.min(LzCadence.CUTOFF_MAX_HZ, Math.max(LzCadence.CUTOFF_MIN_HZ, 1.5 / this.turnSeconds));
        if (Math.abs(cutoffHz / this.cutoffHz - 1) > 0.05) this.setCutoff(cutoffHz);
      }
    }

    // 파형 모양 (TEO)
    const filtered = this.biquad(this.lowpassStages[1], this.biquad(this.lowpassStages[0], centered));
    const history = this.filteredHistory;
    history[3] = history[2]; history[2] = history[1]; history[1] = history[0]; history[0] = filtered;
    const slope = (history[0] - history[1]) / step;
    const slopeBefore = (history[1] - history[2]) / step;
    const slopeBefore2 = (history[2] - history[3]) / step;
    const curve = (slope - slopeBefore) / step;
    const curveBefore = (slopeBefore - slopeBefore2) / step;
    const jerk = (curve - curveBefore) / step;
    const numerator = curve * curve - slope * jerk;      // Ψ[y']
    const denominator = slope * slope - history[0] * curve; // Ψ[y]
    this.numeratorSum += numerator - this.numerators[this.teoNext];
    this.denominatorSum += denominator - this.denominators[this.teoNext];
    this.numerators[this.teoNext] = numerator;
    this.denominators[this.teoNext] = denominator;
    this.teoNext = (this.teoNext + 1) % LzCadence.TEO_WINDOW;
    if (this.filled < LzCadence.TEO_WINDOW + 4) this.filled++;
  }

  get stopped() {
    return this.range < LzCadence.STOP_RANGE_MG;
  }

  zcRpm() {
    if (this.stopped || this.crossings.length < 3) return 0;
    const since = this.time - this.crossings[2];
    if (since > LzCadence.ZC_TIMEOUT) return 0;
    return 60 / Math.max(this.turnSeconds, this.turnSeconds / 2 + since);
  }

  teoRpm() {
    if (this.stopped || this.filled < LzCadence.TEO_WINDOW + 4 || !(this.denominatorSum > 0) || !(this.numeratorSum > 0)) return 0;
    const rpm = (Math.sqrt(this.numeratorSum / this.denominatorSum) / (2 * Math.PI)) * 60;
    return rpm > LzCadence.TEO_MAX ? 0 : rpm; // 과도 응답으로 튄 값은 버린다
  }

  // 현재 추정값들. zcNew 는 이번 read() 사이에 영교차 추정이 새로 나왔는지 (갱신 시점 표시용)
  read() {
    const zeroCrossing = this.zcRpm();
    const teo = this.teoRpm();
    let comb = zeroCrossing;
    if (this.stopped) comb = 0;
    else if (!zeroCrossing) comb = teo; // 영교차가 아직 준비되지 않았으면 (출발 직후) 파형 모양 쪽
    else if (teo && Math.abs(teo / zeroCrossing - 1) > LzCadence.COMB_DEV) {
      if (this.devSince === null) this.devSince = this.time;
      if (this.time - this.devSince >= LzCadence.COMB_HOLD) comb = teo;
    } else {
      this.devSince = null;
    }
    const zcNew = this.zcNew;
    this.zcNew = false;
    return {
      zc: zeroCrossing, // eslint-disable-line id-length -- 속도 측정 방식 설정값(rpmSource) 이름
      teo, comb, zcNew, zcFull: this.turnSeconds ? 60 / this.turnSeconds : 0, stopped: this.stopped,
    };
  }
}

LzCadence.SAMPLE_SEC = 0.01;
LzCadence.DC_ALPHA = 1 - Math.exp(-0.01 / 1.5);   // DC 제거 EMA 1.5초
LzCadence.SLOW_ALPHA = 1 - Math.exp(-0.01 / 1.0);
LzCadence.STOP_WINDOW = 100;                       // 정지 판정 창 1초
LzCadence.STOP_RANGE_MG = 30;
LzCadence.ZC_TIMEOUT = 4;
LzCadence.TEO_WINDOW = 50;                         // 0.5초
LzCadence.TEO_MAX = 150;
LzCadence.CUTOFF_MIN_HZ = 1.2;
LzCadence.CUTOFF_MAX_HZ = 3;
LzCadence.COMB_DEV = 0.12;
LzCadence.COMB_HOLD = 0.3;
