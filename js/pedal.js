// 페달 입력 추상화. 입력원은 세 가지다.
//  - 키보드: A/D 키를 번갈아 누르는 것을 반 바퀴로 취급한다.
//  - 센서 avg_rpm: 페달이 약 1초마다 보내는 평균 RPM (js/pedal-link.js). 연결되어 있으면 키보드보다 우선한다.
//  - 센서 파형(lz): 페달 원시 파형에서 직접 구한 케이던스 (js/cadence-est.js). 켜져 있고 파형이 들어오는 동안은
//    avg_rpm 보다 우선한다. 페달 검출기는 느리게 밟으면 회전을 놓치는데(DIR_FLIP), 파형은 그 구간에도 맞는 값을 낸다.
//    파형이 LZ_STALE_MS 넘게 끊기면 avg_rpm 으로 돌아간다 (구 펌웨어, 유실 등).
class Pedal {
  constructor() {
    this.lastKey = null;
    this.times = [];
    this.smoothed = 0;
    this.onStroke = null;
    this.sensorOn = false;
    this.sensorSeen = false;
    this.sensorRpm = 0;
    this.sensorAt = 0;
    this.zeroRun = 0;
    this.lzOn = false;   // 파형 추정을 쓰도록 설정되어 있는가
    this.lzRpm = 0;
    this.lzAt = -Infinity;
  }

  // 라운드 시작 시 호출. 센서 연결 상태는 건드리지 않는다.
  reset() {
    this.lastKey = null;
    this.times = [];
    this.smoothed = 0;
  }

  // 같은 키를 연속으로 누르면 무시 (번갈아 눌러야 페달이 돈다)
  press(key) {
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.stroke(key);
  }

  stroke(key) {
    this.times.push(performance.now());
    if (this.times.length > 10) this.times.shift();
    if (this.onStroke) this.onStroke(key);
  }

  setSensor(on) {
    if (on === this.sensorOn) return;
    this.sensorOn = on;
    this.sensorSeen = false;
    this.sensorRpm = 0;
    this.sensorAt = performance.now();
    this.zeroRun = 0;
    this.lzAt = -Infinity;
  }

  // 파형 추정값 하나 (CAPD 프레임마다, 초당 20번)
  lzFrame(rpm) {
    this.lzAt = performance.now();
    this.lzRpm = rpm;
  }

  // 지금 파형 추정을 쓰고 있는가
  get lzLive() {
    return this.sensorOn && this.lzOn && performance.now() - this.lzAt < Pedal.LZ_STALE_MS;
  }

  // 페달의 WORKOUT 프레임 하나.
  // 실제 페달은 계속 밟고 있어도 가끔 0 RPM 프레임을 한두 개 낸다 (한 바퀴를 놓치면 정지로 판단).
  // 그래서 밟던 중의 0은 SENSOR_ZERO_GRACE개까지 직전 값을 유지하고, 그 뒤에야 정지로 본다.
  // (CardioArcade ZoneFilter의 zeroGraceFrames와 같은 처리)
  sensorFrame(rpm) {
    this.sensorAt = performance.now();
    this.sensorSeen = true;
    if (rpm > 0) this.zeroRun = 0;
    else if (this.sensorRpm > 0 && ++this.zeroRun <= Pedal.SENSOR_ZERO_GRACE) return;
    this.sensorRpm = rpm;
  }

  rawRpm(now = performance.now()) {
    if (this.sensorOn) {
      if (this.lzLive) return this.lzRpm;
      // 연결은 살아 있는데 프레임이 안 오면 멈춘 것으로 본다
      if (now - this.sensorAt > Pedal.SENSOR_STALE_MS) return 0;
      // (재)연결 직후 첫 프레임이 오기 전까지는 직전 값을 유지해서 공이 튀지 않게 한다
      return this.sensorSeen ? this.sensorRpm : this.smoothed;
    }
    const ts = this.times;
    if (ts.length < 2) return 0;
    const since = now - ts[ts.length - 1];
    if (since > 2500) return 0;
    const intervals = [];
    for (let i = ts.length - 1; i > 0 && intervals.length < 4; i--) {
      if (now - ts[i - 1] > 3000) break;
      intervals.push(ts[i] - ts[i - 1]);
    }
    if (!intervals.length) return 0;
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    // 입력이 끊기면 마지막 간격보다 길어진 만큼 서서히 느려진다
    const halfRevMs = Math.max(avg, since);
    return 60000 / (halfRevMs * 2);
  }

  update(dt) {
    const raw = this.rawRpm();
    // avg_rpm 은 1초에 한 번 계단처럼 바뀌므로 조금 더 길게 이어 붙인다.
    // 파형 추정은 이미 한 바퀴 평균이라 짧게만 다듬는다 (반 바퀴마다 바뀌는 계단만 부드럽게)
    const tau = this.lzLive ? 0.25 : this.sensorOn ? 0.5 : 0.25;
    const k = 1 - Math.exp(-dt / tau);
    this.smoothed = U.lerp(this.smoothed, raw, k);
    return this.smoothed;
  }
}

Pedal.SENSOR_ZERO_GRACE = 3;
Pedal.SENSOR_STALE_MS = 4000;
Pedal.LZ_STALE_MS = 1000;
