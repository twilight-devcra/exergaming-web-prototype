// 페달 입력 추상화. 지금은 A/D 키를 번갈아 누르는 것을 반 바퀴로 취급한다.
// 실제 센서를 연결할 때는 stroke()를 센서 이벤트에서 호출하거나 rawRpm()을 센서값으로 바꾸면 된다.
class Pedal {
  constructor() {
    this.lastKey = null;
    this.times = [];
    this.smoothed = 0;
    this.onStroke = null;
  }

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

  rawRpm(now = performance.now()) {
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
    const k = 1 - Math.exp(-dt / 0.25);
    this.smoothed = U.lerp(this.smoothed, raw, k);
    return this.smoothed;
  }
}
