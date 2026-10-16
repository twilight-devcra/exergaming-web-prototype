// 운동량 (시연 결과 화면). 표시 전용이고 점수에는 들어가지 않는다.
// 페달 저항은 참가자마다 바뀔 수 있고 페달의 watt 는 보정되지 않은 진동 값이라 쓰지 않는다.
// 게임이 이미 구한 RPM(zc 파형 추정)만으로 거리와 열량을 어림한다.
const Exercise = {
  // 자전거로 치면 한 바퀴에 가는 거리 (m). 페달 펌웨어의 기본 D_rev 와 같은 값
  M_PER_REV: 6,

  // 열량은 MET 표로 어림한다: kcal/분 = MET × 3.5 × 체중(kg) / 200 (ACSM 식, 쉬는 몫 포함)
  REF_KG: 65,
  // RPM → MET 꺾은선. 앉아서 쉬기 1.3, 실내 자전거 '아주 가볍게' 3.5, '가볍게'(51–89 W) 4.8 은
  // Compendium of Physical Activities 값이고, 그 값을 몇 RPM 에 둘지는 우리가 정한 것이다.
  MET_POINTS: [[0, 1.3], [60, 3.5], [90, 4.8]],

  met(rpm) {
    const p = this.MET_POINTS;
    if (rpm <= p[0][0]) return p[0][1];
    for (let i = 1; i < p.length; i++) {
      const [r1, m1] = p[i];
      if (rpm <= r1) {
        const [r0, m0] = p[i - 1];
        return m0 + ((m1 - m0) * (rpm - r0)) / (r1 - r0);
      }
    }
    return p[p.length - 1][1];
  },

  kcalPerSec(rpm) {
    return (this.met(rpm) * 3.5 * this.REF_KG) / 200 / 60;
  },

  // 결과 화면용 거리: 1 km 아래는 10 m 단위, 위는 0.1 km 단위
  fmtDist(m) {
    const r = Math.round(m / 10) * 10;
    return r < 1000 ? { value: String(r), unit: 'm' } : { value: (m / 1000).toFixed(1), unit: 'km' };
  },
};

// 라운드 하나의 운동량을 쌓는다
class ExerciseMeter {
  constructor() {
    this.reset();
  }

  reset() {
    this.kcal = 0;
    this.revs = 0;
    this.activeSec = 0;  // 실제로 밟은 시간
  }

  add(dt, rpm) {
    if (rpm <= 0) return;
    this.kcal += Exercise.kcalPerSec(rpm) * dt;
    this.revs += (rpm / 60) * dt;
    this.activeSec += dt;
  }

  get distM() {
    return this.revs * Exercise.M_PER_REV;
  }

  get avgRpm() {
    return this.activeSec > 0 ? (this.revs / this.activeSec) * 60 : 0;
  }
}
