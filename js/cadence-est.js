// 페달 원시 파형 lz 로 케이던스를 직접 추정한다 (페달 펌웨어의 회전 검출기와 독립).
// 지금은 pedal-debug 페이지의 비교용이지만, 게임에서도 그대로 쓸 수 있게 화면 코드와 분리해 둔다.
//
// 입력: CAPD 의 lz 를 mg 단위로 100Hz 한 샘플씩 (sample). 유실 구간은 skip(n) 으로 시계만 넘긴다.
// lz 는 크랭크가 한 바퀴 돌 때 한 주기를 그리는 사인파에 가깝다 (2026-10-14 녹화로 확인, 29~50 rpm).
// 세 가지 추정값을 낸다.
//  zc    영교차: 반 바퀴마다 교차가 하나씩 생긴다. 교차 때마다 '최근 반 바퀴 둘 = 한 바퀴' 시간으로 갱신하고,
//        다음 교차가 늦어지면 그만큼 느려진 것으로 본다 (키보드 A/D 입력과 같은 처리). 녹화 기준 지연 약 1.25초, 흔들림 1.7%
//  teo   파형 모양: 고조파를 걸러낸 뒤 Teager 에너지 연산자 비 ω² = ΣΨ[y'] / ΣΨ[y] 를 0.5초 창으로 매 샘플 계산.
//        지연 약 0.65초로 빠르지만 일정하게 밟을 때 흔들림이 7% 정도라 단독으로는 공이 떨린다
//  comb  결합: 평소에는 zc, teo 가 zc 에서 COMB_DEV 넘게 COMB_HOLD 이상 벗어나 있으면 teo (실제 속도 변화로 본다)
// 진폭이 정지 수준(STOP_MG)으로 떨어지면 셋 다 0. 정지 중 lz 잡음은 약 1 mg, 페달링 중 최소는 약 130 mg 였다.
class LzCadence {
  constructor() {
    this.reset();
  }

  reset() {
    this.t = 0;              // 이 추정기 기준 샘플 시계 (초)
    this.dc = null;
    this.ampSlow = 0;        // 영교차 히스테리시스 기준
    this.ampFast = 0;        // 정지 판정
    this.state = 0;
    this.cross = [];         // 최근 교차 시각 3개
    this.full = 0;           // 최근 한 바퀴 시간 (초)
    this.zcNew = false;      // 마지막 read() 이후 영교차 추정이 새로 나왔는가
    this.setCutoff(LzCadence.FC_MIN);
    this.lp = [[0, 0, 0, 0], [0, 0, 0, 0]]; // 두 단 biquad 상태 (x1, x2, y1, y2)
    this.h = [0, 0, 0, 0];   // 걸러낸 신호의 최근 4개 (미분용)
    this.num = new Float64Array(LzCadence.TEO_W);
    this.den = new Float64Array(LzCadence.TEO_W);
    this.ri = 0;
    this.sn = 0;
    this.sd = 0;
    this.filled = 0;
    this.devSince = null;    // teo 가 zc 에서 벗어나기 시작한 시각
    this.wasStopped = true;
  }

  // 정지를 사이에 둔 값끼리 섞이지 않게: 멈출 때 교차 기록을, 다시 움직일 때 파형 창을 비운다.
  // (안 그러면 정지 전후 교차로 아주 느린 값이 나오고, 정지 잡음이 남은 창에서 TEO 가 수백 rpm 으로 튄다)
  clearTeo() {
    this.num.fill(0);
    this.den.fill(0);
    this.sn = 0;
    this.sd = 0;
    this.filled = 0;
    this.devSince = null;
  }

  // 4차(2차 × 2) 버터워스 저역통과. 차단 주파수는 현재 케이던스를 따라간다 (fc = 1.5 × 케이던스, 1.2~3 Hz)
  setCutoff(fc) {
    this.fc = fc;
    const K = Math.tan(Math.PI * fc * LzCadence.DT);
    const q = Math.SQRT1_2;
    const nrm = 1 + K / q + K * K;
    this.b0 = (K * K) / nrm;
    this.b1 = 2 * this.b0;
    this.a1 = (2 * (K * K - 1)) / nrm;
    this.a2 = (1 - K / q + K * K) / nrm;
  }

  biquad(s, x) {
    const y = this.b0 * x + this.b1 * s[0] + this.b0 * s[1] - this.a1 * s[2] - this.a2 * s[3];
    s[1] = s[0]; s[0] = x; s[3] = s[2]; s[2] = y;
    return y;
  }

  // 유실된 샘플 수만큼 시계만 넘긴다 (교차 간격이 실제 시간과 맞게)
  skip(n) {
    this.t += n * LzCadence.DT;
  }

  sample(lz) {
    const DT = LzCadence.DT;
    this.t += DT;
    if (this.dc === null) this.dc = lz;
    this.dc += (lz - this.dc) * LzCadence.A_DC;
    const y = lz - this.dc;
    this.ampSlow += (Math.abs(y) - this.ampSlow) * LzCadence.A_SLOW;
    this.ampFast += (Math.abs(y) - this.ampFast) * LzCadence.A_FAST;
    const stopped = this.stopped;
    if (stopped && !this.wasStopped) {
      this.cross = [];
      this.state = 0;
    } else if (!stopped && this.wasStopped) {
      this.clearTeo();
    }
    this.wasStopped = stopped;

    // 영교차 (히스테리시스: 진폭의 30%, 하한 8 mg)
    const hy = Math.max(8, 0.3 * this.ampSlow);
    let crossed = false;
    if (this.state <= 0 && y > hy) { this.state = 1; crossed = true; }
    else if (this.state >= 0 && y < -hy) { this.state = -1; crossed = true; }
    if (crossed) {
      this.cross.push(this.t);
      if (this.cross.length > 3) this.cross.shift();
      if (this.cross.length === 3) {
        this.full = this.cross[2] - this.cross[0];
        this.zcNew = true;
        const fc = Math.min(LzCadence.FC_MAX, Math.max(LzCadence.FC_MIN, 1.5 / this.full));
        if (Math.abs(fc / this.fc - 1) > 0.05) this.setCutoff(fc);
      }
    }

    // 파형 모양 (TEO)
    const f = this.biquad(this.lp[1], this.biquad(this.lp[0], y));
    const h = this.h;
    h[3] = h[2]; h[2] = h[1]; h[1] = h[0]; h[0] = f;
    const d1 = (h[0] - h[1]) / DT, d1p = (h[1] - h[2]) / DT, d1pp = (h[2] - h[3]) / DT;
    const d2 = (d1 - d1p) / DT, d2p = (d1p - d1pp) / DT;
    const d3 = (d2 - d2p) / DT;
    const nv = d2 * d2 - d1 * d3;
    const dv = d1 * d1 - h[0] * d2;
    this.sn += nv - this.num[this.ri];
    this.sd += dv - this.den[this.ri];
    this.num[this.ri] = nv;
    this.den[this.ri] = dv;
    this.ri = (this.ri + 1) % LzCadence.TEO_W;
    if (this.filled < LzCadence.TEO_W + 4) this.filled++;
  }

  get stopped() {
    return this.ampFast < LzCadence.STOP_MG;
  }

  zcRpm() {
    if (this.stopped || this.cross.length < 3) return 0;
    const since = this.t - this.cross[2];
    if (since > LzCadence.ZC_TIMEOUT) return 0;
    return 60 / Math.max(this.full, this.full / 2 + since);
  }

  teoRpm() {
    if (this.stopped || this.filled < LzCadence.TEO_W + 4 || !(this.sd > 0) || !(this.sn > 0)) return 0;
    const rpm = (Math.sqrt(this.sn / this.sd) / (2 * Math.PI)) * 60;
    return rpm > LzCadence.TEO_MAX ? 0 : rpm; // 과도 응답으로 튄 값은 버린다
  }

  // 현재 추정값들. zcNew 는 이번 read() 사이에 영교차 추정이 새로 나왔는지 (갱신 시점 표시용)
  read() {
    const zc = this.zcRpm();
    const teo = this.teoRpm();
    let comb = zc;
    if (this.stopped) comb = 0;
    else if (!zc) comb = teo; // 영교차가 아직 준비되지 않았으면 (출발 직후) 파형 모양 쪽
    else if (teo && Math.abs(teo / zc - 1) > LzCadence.COMB_DEV) {
      if (this.devSince === null) this.devSince = this.t;
      if (this.t - this.devSince >= LzCadence.COMB_HOLD) comb = teo;
    } else {
      this.devSince = null;
    }
    const zcNew = this.zcNew;
    this.zcNew = false;
    return { zc, teo, comb, zcNew, zcFull: this.full ? 60 / this.full : 0, stopped: this.stopped };
  }
}

LzCadence.DT = 0.01;
LzCadence.A_DC = 1 - Math.exp(-0.01 / 1.5);   // DC 제거 EMA 1.5초
LzCadence.A_SLOW = 1 - Math.exp(-0.01 / 1.0);
LzCadence.A_FAST = 1 - Math.exp(-0.01 / 0.3);
LzCadence.STOP_MG = 6;
LzCadence.ZC_TIMEOUT = 4;
LzCadence.TEO_W = 50;                          // 0.5초
LzCadence.TEO_MAX = 150;
LzCadence.FC_MIN = 1.2;
LzCadence.FC_MAX = 3;
LzCadence.COMB_DEV = 0.12;
LzCadence.COMB_HOLD = 0.3;
