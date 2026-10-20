// 인지 능력 그래프 (시연 결과 화면)
// 게임 하나가 축 하나가 아니라, 게임마다 여러 능력 축에 가중치를 나눠 준다 (docs/DEMO_BRIEF.md).
// 축마다 둘 이상의 게임이 들어가므로 짧은 라운드에서 어떤 게임을 못 해도 모든 축이 채워진다.
// 과학적으로 정확할 필요는 없다. 아래 표의 숫자는 플레이해 보며 감으로 다듬는다.
// 능력마다 만점 기준이 없으므로 '어느 난이도까지 해냈나' 를 별 1~5개(반 개 단위)로 보여 준다.
// 별 수 ≈ 해낸 레벨이라 짧은 라운드에서는 2~3개가 보통이고, 더 올라갈 자리가 남는다.
const ABILITIES = [
  { id: 'memory', name: '기억력', praise: '본 것을 오래 또렷하게 기억해요' },
  { id: 'spatial', name: '공간지각', praise: '모양과 위치를 한눈에 파악해요' },
  { id: 'attention', name: '주의집중', praise: '헷갈리는 것 속에서도 집중을 잃지 않아요' },
  { id: 'logic', name: '논리·수리', praise: '숫자와 규칙을 차근차근 풀어내요' },
  { id: 'speed', name: '처리속도', praise: '보고 판단하는 속도가 빨라요' },
];

const ABILITY_WEIGHTS = {
  path: { memory: 0.5, spatial: 0.4, attention: 0.1 },
  symbol: { memory: 0.6, spatial: 0.3, attention: 0.1 },
  arith: { memory: 0.2, attention: 0.1, logic: 0.7 },
  count: { attention: 0.5, speed: 0.5 },
  fit: { spatial: 0.6, logic: 0.4 },
  seek: { spatial: 0.3, attention: 0.4, speed: 0.3 },
  cover: { memory: 0.6, attention: 0.1, logic: 0.3 },
  ladder: { spatial: 0.3, attention: 0.5, speed: 0.2 },
};

// 처리속도 축에 들어가는 게임은 문제당 걸린 시간도 본다 (정답 피드백·연출 시간 포함, 초).
// fast 이하면 그대로, slow 이상이면 그 게임의 처리속도 몫을 PACE_MIN 배로 깎는다. 문제를 고르는 동안의 시간만 따로 재지 않으므로 대략값이다.
const ABILITY_PACE = {
  count: { fast: 4, slow: 14 },
  seek: { fast: 5, slow: 18 },
  ladder: { fast: 5, slow: 15 },
};

const Abilities = {
  MAX_STARS: 5,
  MIN_STARS: 1,    // 데이터가 있으면 적어도 별 하나
  STAR_BONUS: 0.5, // 별 = 해낸 레벨 + 이만큼
  PACE_MIN: 0.6,

  // 판 하나에서 해낸 레벨 = (레벨 − 1) + 정확도: Lv3 을 다 맞히면 3, 절반이면 2.5, Lv1 을 다 틀리면 0.
  // 축 하나 = 관련 게임 판들의 가중 평균. 가중치 = 게임 가중치(ABILITY_WEIGHTS) × 레벨 — 높은 레벨에서 해낸(또는 놓친) 판이
  // 몸풀기 Lv1 보다 크게 친다. 라운드 앞쪽 게임은 늘 Lv1 이라, 레벨로 가중하지 않으면 모두가 낮게 나온다.
  // stats: App.stats ({ id: { runs: [[레벨, 맞힌 수, 문제 수]…], total, ms } })
  // → [{ id, name, praise, stars(1~5, 0.5 단위), value(그래프용 0~100), raw(해낸 레벨, 데이터 없으면 null), hasData }]
  compute(stats) {
    const sum = {};
    const wsum = {};
    for (const T of GAME_TYPES) {
      const s = stats[T.id];
      const w = ABILITY_WEIGHTS[T.id];
      if (!s || !w || !s.runs) continue;
      // 처리속도 몫은 그 게임의 문제당 평균 시간으로 깎는다
      const pace = ABILITY_PACE[T.id];
      let paceK = 1;
      if (pace && s.ms > 0 && s.total > 0) {
        const per = s.ms / 1000 / s.total;
        const f = U.clamp((pace.slow - per) / (pace.slow - pace.fast), 0, 1);
        paceK = this.PACE_MIN + (1 - this.PACE_MIN) * f;
      }
      for (const [lv, correct, total] of s.runs) {
        if (total <= 0) continue;
        const d = lv - 1 + correct / total;
        for (const [axis, k] of Object.entries(w)) {
          sum[axis] = (sum[axis] || 0) + k * lv * (axis === 'speed' ? d * paceK : d);
          wsum[axis] = (wsum[axis] || 0) + k * lv;
        }
      }
    }
    return ABILITIES.map((a) => {
      const has = wsum[a.id] > 0;
      const raw = has ? sum[a.id] / wsum[a.id] : null;
      const stars = has ? U.clamp(Math.round((raw + this.STAR_BONUS) * 2) / 2, this.MIN_STARS, this.MAX_STARS) : 0;
      // 데이터가 없는 축은 별 하나 자리에 흐리게 그린다
      const value = ((has ? stars : this.MIN_STARS) / this.MAX_STARS) * 100;
      return { ...a, stars, value, raw: has ? Math.round(raw * 100) / 100 : null, hasData: has };
    });
  },

  // 데이터가 있는 축 중 별이 가장 많은 것 (같으면 해낸 레벨이 높은 것)
  best(list) {
    const has = list.filter((a) => a.hasData);
    if (!has.length) return null;
    return has.reduce((b, a) => (a.stars > b.stars || (a.stars === b.stars && a.raw > b.raw) ? a : b));
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

  STAR_GAP: 18,   // 별 다섯 줄이 viewBox 좌우 끝(공간지각·처리속도)에서 잘리지 않는 폭

  // 오각별 path (중심 cx, cy)
  star(cx, cy, r = 8.5) {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
    }
    return d + 'Z';
  },

  pts(values) {
    return values.map((v, i) => this.point(i, values.length, v).map((x) => x.toFixed(1)).join(',')).join(' ');
  },

  // labels: [{ name, stars, hasData }] 또는 null(장식용, 글자 없음)
  render(svg, values, labels) {
    const n = values.length;
    svg.setAttribute('viewBox', '-28 0 456 380'); // 좌우 축 이름(네 글자)이 잘리지 않을 만큼만 넓게
    let h = '';
    if (labels) h += '<defs><linearGradient id="rd-half"><stop offset="50%" class="rd-half-on"/><stop offset="50%" class="rd-half-off"/></linearGradient></defs>';
    // 고리 하나 = 별 하나
    for (let k = 5; k >= 1; k--) {
      h += `<polygon class="rd-grid${k === 5 ? ' outer' : ''}" points="${this.pts(values.map(() => k * 20))}"/>`;
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
        if (!l.hasData) {
          h += `<text class="rd-value nodata" x="${lx.toFixed(1)}" y="${(ly + 24).toFixed(1)}" text-anchor="${anchor}">-</text>`;
          return;
        }
        // 별 다섯 개를 글자처럼 정렬한다 (anchor 에 맞춰 왼쪽·가운데·오른쪽)
        const w = this.STAR_GAP * 5;
        const x0 = anchor === 'start' ? lx : anchor === 'end' ? lx - w : lx - w / 2;
        for (let k = 0; k < 5; k++) {
          const cls = l.stars >= k + 1 ? 'on' : l.stars >= k + 0.5 ? 'half' : 'off';
          h += `<path class="rd-star ${cls}" d="${this.star(x0 + this.STAR_GAP * (k + 0.5), ly + 16)}"/>`;
        }
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
