// 운동량 (시연 결과 화면). 표시 전용이고 점수에는 들어가지 않는다.
// 페달 WORKOUT 프레임의 watt 는 느리게 밟으면 0 이 되는 펌웨어 버그가 있어서,
// 게임이 이미 구한 RPM(zc 파형 추정)으로 파워를 추정해 라운드 동안 더한다.
const Exercise = {
  // RPM → 추정 파워 (W).
  // TODO 임시 곡선 (60 RPM ≈ 48 W). 행사 저항 설정에서 녹화한 기록 중 watt 가 0 이 아닌 프레임으로 맞춘 곡선으로 바꾼다.
  //      정확할 필요는 없지만 모든 스테이션에서 같은 곡선을 써야 한다.
  watts(rpm) {
    return rpm > 0 ? 0.01 * rpm * rpm + 0.2 * rpm : 0;
  },
  EFFICIENCY: 0.24,  // 페달에 한 일 → 몸이 쓴 열량 (사람 근육 효율 약 24%)
  J_PER_KCAL: 4184,

  // 열량을 와닿는 음식으로 바꿔 말한다. 큰 것부터 보고 1개 이상 되는 첫 번째를 쓴다.
  FOODS: [
    { name: '바나나', kcal: 90, unit: '개' },
    { name: '귤', kcal: 40, unit: '개' },
    { name: '각설탕', kcal: 15, unit: '개' },
    { name: '방울토마토', kcal: 3, unit: '개' },
  ],

  compare(kcal) {
    const f = this.FOODS.find((x) => kcal >= x.kcal) || this.FOODS[this.FOODS.length - 1];
    const n = Math.max(1, Math.round((kcal / f.kcal) * 2) / 2);
    return `${f.name} ${n}${f.unit} 만큼`;
  },
};

// 라운드 하나의 운동량을 쌓는다
class ExerciseMeter {
  constructor() {
    this.reset();
  }

  reset() {
    this.joules = 0;
    this.revs = 0;
    this.activeSec = 0;  // 실제로 밟은 시간
  }

  add(dt, rpm) {
    if (rpm <= 0) return;
    this.joules += Exercise.watts(rpm) * dt;
    this.revs += (rpm / 60) * dt;
    this.activeSec += dt;
  }

  get kcal() {
    return this.joules / Exercise.EFFICIENCY / Exercise.J_PER_KCAL;
  }

  get avgRpm() {
    return this.activeSec > 0 ? (this.revs / this.activeSec) * 60 : 0;
  }

  get avgWatts() {
    return this.activeSec > 0 ? this.joules / this.activeSec : 0;
  }
}
