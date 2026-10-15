// 인지 능력 그래프 (시연 결과 화면)
// 게임 하나가 축 하나가 아니라, 게임마다 여러 능력 축에 가중치를 나눠 준다 (docs/DEMO_BRIEF.md).
// 축마다 둘 이상의 게임이 들어가므로 짧은 라운드에서 어떤 게임을 못 해도 모든 축이 채워진다.
// 과학적으로 정확할 필요는 없다. 아래 표의 숫자는 플레이해 보며 감으로 다듬는다.
const ABILITIES = [
  { id: 'memory', name: '기억력' },
  { id: 'spatial', name: '공간지각' },
  { id: 'attention', name: '주의집중' },
  { id: 'logic', name: '논리·수리' },
  { id: 'speed', name: '처리속도' },
];

const ABILITY_WEIGHTS = {
  path: { memory: 0.5, spatial: 0.4, attention: 0.1 },
  symbol: { memory: 0.6, spatial: 0.3, attention: 0.1 },
  arith: { memory: 0.2, attention: 0.1, logic: 0.7 },
  count: { attention: 0.5, speed: 0.5 },
  fit: { spatial: 0.6, logic: 0.4 },
  seek: { spatial: 0.3, attention: 0.4, speed: 0.3 },
};

// 처리속도 축에 들어가는 게임은 문제당 걸린 시간도 본다 (정답 피드백·연출 시간 포함, 초).
// fast 이하면 속도 만점, slow 이상이면 속도 0. 문제를 고르는 동안의 시간만 따로 재지 않으므로 대략값이다.
const ABILITY_PACE = {
  count: { fast: 4, slow: 14 },
  seek: { fast: 5, slow: 18 },
};

const Abilities = {
  FLOOR: 20,     // 그래프가 비어 보이지 않도록 하는 최저 표시값
  NEUTRAL: 50,   // 데이터가 없는 축의 표시값

  // stats: App.stats ({ id: { plays, correct, total, level, ms } })
  // → [{ id, name, value(0~100), hasData }]
  compute(stats) {
    const sum = {};
    const wsum = {};
    for (const T of GAME_TYPES) {
      const s = stats[T.id];
      const w = ABILITY_WEIGHTS[T.id];
      if (!s || !w || s.total <= 0) continue;
      // 게임 하나의 성적 0~1. 정확도가 대부분이고, 높은 난이도(Lv3 이상)까지 간 만큼 조금 더한다.
      // (난이도는 실력이 아니라 한 바퀴 돌 때마다 오르므로 비중을 작게 둔다)
      const acc = s.correct / s.total;
      const lv = U.clamp((s.level - 1) / 2, 0, 1);
      const p = acc * (0.85 + 0.15 * lv);
      for (const [axis, k] of Object.entries(w)) {
        let v = p;
        const pace = ABILITY_PACE[T.id];
        if (axis === 'speed' && pace && s.ms > 0) {
          const per = s.ms / 1000 / s.total;
          const f = U.clamp((pace.slow - per) / (pace.slow - pace.fast), 0, 1);
          v = p * (0.4 + 0.6 * f);
        }
        sum[axis] = (sum[axis] || 0) + v * k;
        wsum[axis] = (wsum[axis] || 0) + k;
      }
    }
    return ABILITIES.map((a) => {
      const has = wsum[a.id] > 0;
      const value = has ? Math.round(this.FLOOR + (100 - this.FLOOR) * (sum[a.id] / wsum[a.id])) : this.NEUTRAL;
      return { id: a.id, name: a.name, value, hasData: has };
    });
  },

  // 데이터가 있는 축 중 가장 높은 것
  best(list) {
    const has = list.filter((a) => a.hasData);
    if (!has.length) return null;
    return has.reduce((b, a) => (a.value > b.value ? a : b));
  },
};

// 오각형 레이더 그래프 (SVG). values는 0~100.
const Radar = {
  NS: 'http://www.w3.org/2000/svg',
  CX: 200,
  CY: 190,
  R: 130,

  point(i, n, v) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = (this.R * v) / 100;
    return [this.CX + Math.cos(a) * r, this.CY + Math.sin(a) * r];
  },

  pts(values) {
    return values.map((v, i) => this.point(i, values.length, v).map((x) => x.toFixed(1)).join(',')).join(' ');
  },

  // labels: [{ name, value, hasData }] 또는 null(장식용, 글자 없음)
  render(svg, values, labels) {
    const n = values.length;
    svg.setAttribute('viewBox', '-28 0 456 380'); // 좌우 축 이름(네 글자)이 잘리지 않을 만큼만 넓게
    let h = '';
    for (let k = 4; k >= 1; k--) {
      h += `<polygon class="rd-grid${k === 4 ? ' outer' : ''}" points="${this.pts(values.map(() => k * 25))}"/>`;
    }
    for (let i = 0; i < n; i++) {
      const [x, y] = this.point(i, n, 100);
      h += `<line class="rd-axis" x1="${this.CX}" y1="${this.CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
    }
    h += `<polygon class="rd-shape" points="${this.pts(values)}"/>`;
    values.forEach((v, i) => {
      const [x, y] = this.point(i, n, v);
      h += `<circle class="rd-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6"/>`;
    });
    if (labels) {
      labels.forEach((l, i) => {
        const [x, y] = this.point(i, n, 100);
        const dx = x - this.CX;
        const anchor = Math.abs(dx) < 8 ? 'middle' : dx > 0 ? 'start' : 'end';
        const lx = x + Math.sign(Math.round(dx)) * 12;
        const ly = y + (y < this.CY - 20 ? -30 : y > this.CY + 20 ? 26 : -4);
        h += `<text class="rd-label${l.hasData ? '' : ' nodata'}" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}">${l.name}</text>`;
        h += `<text class="rd-value${l.hasData ? '' : ' nodata'}" x="${lx.toFixed(1)}" y="${(ly + 24).toFixed(1)}" text-anchor="${anchor}">${l.hasData ? l.value : '-'}</text>`;
      });
    }
    svg.innerHTML = h;
  },

  // 장식용 애니메이션에서 모양만 바꾼다
  update(svg, values) {
    const shape = svg.querySelector('.rd-shape');
    if (shape) shape.setAttribute('points', this.pts(values));
    svg.querySelectorAll('.rd-dot').forEach((c, i) => {
      const [x, y] = this.point(i, values.length, values[i]);
      c.setAttribute('cx', x.toFixed(1));
      c.setAttribute('cy', y.toFixed(1));
    });
  },
};
