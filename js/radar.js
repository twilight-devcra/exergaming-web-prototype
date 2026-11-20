// 두뇌 그래프 (결과 화면 '이번 세션 성과' 카드, js/round-report.js): 축마다 0~100% 를 방사형 그래프로 그린다.
// 축 이름 아래에 그 값(%)을 적는다. 데이터가 없는 축은 흐린 이름과 '–' 로 두고, 점은 가장 안쪽에 둔다.
// 0% 도 한가운데 점이 되지 않게 반지름의 FLOOR 만큼은 늘 차 있다 (그래프가 쪼그라들어 보이면 힘이 빠진다 — js/abilities.js)
export const Radar = {
  CX: 270,
  CY: 194,
  R: 120,
  FLOOR: 0.15,

  // 축 i (n 개 가운데)의 frac (0~1) 자리
  point(i, n, frac) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = this.R * (this.FLOOR + (1 - this.FLOOR) * frac);
    return [this.CX + Math.cos(a) * r, this.CY + Math.sin(a) * r];
  },

  polygon(n, fracs) {
    return fracs.map((f, i) => this.point(i, n, f).map((v) => v.toFixed(1)).join(',')).join(' ');
  },

  // axes = [{ name, acc (0~1 또는 null), hasData }]
  render(svg, axes) {
    const n = axes.length;
    // 글자는 그래프에 비해 크게 둔다 (카드가 작아져 그림 전체가 줄어도 읽히게). 폭은 '답하는 속도' 가 옆에 들어갈 만큼
    svg.setAttribute('viewBox', '0 0 540 372');
    let h = '';
    // 고리: 25 · 50 · 75 · 100%
    for (const ring of [1, 0.75, 0.5, 0.25]) {
      h += `<polygon class="rd-grid${ring === 1 ? ' outer' : ''}" points="${this.polygon(n, axes.map(() => ring))}"/>`;
    }
    axes.forEach((_, i) => {
      const [x, y] = this.point(i, n, 1);
      h += `<line class="rd-axis" x1="${this.CX}" y1="${this.CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
    });
    const fracs = axes.map((axis) => (axis.hasData ? axis.acc : 0));
    h += `<polygon class="rd-shape" points="${this.polygon(n, fracs)}"/>`;
    fracs.forEach((f, i) => {
      if (!axes[i].hasData) return;
      const [x, y] = this.point(i, n, f);
      h += `<circle class="rd-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6"/>`;
    });
    // 이름과 값: 위쪽 축은 바깥 위로, 아래쪽 축은 바깥 아래로, 옆 축은 바깥 옆으로
    axes.forEach((axis, i) => {
      const [x, y] = this.point(i, n, 1);
      const dx = x - this.CX;
      const dy = y - this.CY;
      const anchor = Math.abs(dx) < 8 ? 'middle' : dx > 0 ? 'start' : 'end';
      const lx = x + Math.sign(Math.round(dx)) * 12;
      const ly = dy < -20 ? y - 44 : dy > 20 ? y + 28 : y - 8;
      const muted = axis.hasData ? '' : ' nodata';
      h += `<text class="rd-label${muted}" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}">${axis.name}</text>`;
      h += `<text class="rd-value${muted}" x="${lx.toFixed(1)}" y="${(ly + 27).toFixed(1)}" text-anchor="${anchor}">${axis.hasData ? `${Math.round(axis.acc * 100)}%` : '–'}</text>`;
    });
    svg.innerHTML = h;
  },
};
