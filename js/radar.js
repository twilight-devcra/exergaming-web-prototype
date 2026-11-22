// 두뇌 그래프 (결과 화면 '이번 세션 성과' 카드, js/round-report.js): 축마다 0~100% 를 방사형 그래프로 그린다.
// 축 이름 아래에 그 값(%)을 적는다. 데이터가 없는 축은 흐린 이름과 '–' 로 두고, 점은 가장 안쪽에 둔다.
// 0% 도 한가운데 점이 되지 않게 반지름의 FLOOR 만큼은 늘 차 있다 (그래프가 쪼그라들어 보이면 힘이 빠진다 — js/abilities.js)
export const Radar = {
  CENTER_X: 270,
  CENTER_Y: 194,
  RADIUS: 120,
  FLOOR: 0.15,

  // 축 axisIndex (axisCount 개 가운데)의 frac (0~1) 자리
  point(axisIndex, axisCount, frac) {
    const angle = -Math.PI / 2 + (axisIndex * 2 * Math.PI) / axisCount;
    const distance = this.RADIUS * (this.FLOOR + (1 - this.FLOOR) * frac);
    return [this.CENTER_X + Math.cos(angle) * distance, this.CENTER_Y + Math.sin(angle) * distance];
  },

  polygon(axisCount, fracs) {
    return fracs.map((frac, i) => this.point(i, axisCount, frac).map((coordinate) => coordinate.toFixed(1)).join(',')).join(' ');
  },

  // axes = [{ name, acc (0~1 또는 null), hasData }]
  render(svg, axes) {
    const axisCount = axes.length;
    // 글자는 그래프에 비해 크게 둔다 (카드가 작아져 그림 전체가 줄어도 읽히게). 폭은 '답하는 속도' 가 옆에 들어갈 만큼
    svg.setAttribute('viewBox', '0 0 540 372');
    let markup = '';
    // 고리: 25 · 50 · 75 · 100%
    for (const ring of [1, 0.75, 0.5, 0.25]) {
      markup += `<polygon class="rd-grid${ring === 1 ? ' outer' : ''}" points="${this.polygon(axisCount, axes.map(() => ring))}"/>`;
    }
    axes.forEach((_, i) => {
      const [x, y] = this.point(i, axisCount, 1);
      markup += `<line class="rd-axis" x1="${this.CENTER_X}" y1="${this.CENTER_Y}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
    });
    const fracs = axes.map((axis) => (axis.hasData ? axis.acc : 0));
    markup += `<polygon class="rd-shape" points="${this.polygon(axisCount, fracs)}"/>`;
    fracs.forEach((frac, i) => {
      if (!axes[i].hasData) return;
      const [x, y] = this.point(i, axisCount, frac);
      markup += `<circle class="rd-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6"/>`;
    });
    // 이름과 값: 위쪽 축은 바깥 위로, 아래쪽 축은 바깥 아래로, 옆 축은 바깥 옆으로
    axes.forEach((axis, i) => {
      const [x, y] = this.point(i, axisCount, 1);
      const offsetX = x - this.CENTER_X;
      const offsetY = y - this.CENTER_Y;
      const anchor = Math.abs(offsetX) < 8 ? 'middle' : offsetX > 0 ? 'start' : 'end';
      const labelX = x + Math.sign(Math.round(offsetX)) * 12;
      const labelY = offsetY < -20 ? y - 44 : offsetY > 20 ? y + 28 : y - 8;
      const muted = axis.hasData ? '' : ' nodata';
      markup += `<text class="rd-label${muted}" x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="${anchor}">${axis.name}</text>`;
      markup += `<text class="rd-value${muted}" x="${labelX.toFixed(1)}" y="${(labelY + 27).toFixed(1)}" text-anchor="${anchor}">${axis.hasData ? `${Math.round(axis.acc * 100)}%` : '–'}</text>`;
    });
    svg.innerHTML = markup;
  },
};
