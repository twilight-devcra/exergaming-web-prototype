// 페달 입력 추상화. 입력원은 두 가지다.
//  - 키보드: A/D 키를 번갈아 누르는 것을 반 바퀴로 취급한다.
//  - 센서: 페달이 약 1초마다 보내는 평균 RPM (js/pedal-link.js). 연결되어 있으면 이쪽이 우선한다.
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
    // 센서값은 1초에 한 번 계단처럼 바뀌므로 조금 더 길게 이어 붙인다
    const k = 1 - Math.exp(-dt / (this.sensorOn ? 0.5 : 0.25));
    this.smoothed = U.lerp(this.smoothed, raw, k);
    return this.smoothed;
  }
}

Pedal.SENSOR_ZERO_GRACE = 3;
Pedal.SENSOR_STALE_MS = 4000;
