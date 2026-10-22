// 게임 소개 화면의 설명 그림.
// 게임마다 static diagram() 이 [{ svg, caption }, ...] (보통 두 단계: 무엇을 보고 → 무엇을 누르나)를 돌려주고,
// Dg.render 가 '① … → ② …' 모양으로 늘어놓는다. 그림은 게임 안에서 쓰는 모양·색을 그대로 써서
// 소개에서 본 것이 실제 판에서 바로 알아보이게 한다. 색은 css 변수(--cell, --accent …)를 따라 화면 스타일마다 바뀐다.
const Dg = {
  svg(viewBox, body) {
    return `<svg class="dg-svg" viewBox="${viewBox}">${body}</svg>`;
  },

  rect(x, y, w, h, cls = 'dg-cell', rx = 7) {
    return `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
  },

  text(x, y, t, size = 20, cls = 'dg-txt') {
    return `<text class="${cls}" x="${x}" y="${y}" font-size="${size}" text-anchor="middle" dominant-baseline="central">${t}</text>`;
  },

  // 100×100 안에 그린 그림을 (cx, cy) 가운데에 size 크기로
  glyph(svg, cx, cy, size, attrs = '') {
    const k = size / 100;
    return `<g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${k})" ${attrs}>${svg}</g>`;
  },

  // 여기를 누르라는 표시 (천천히 퍼지는 고리)
  tap(x, y, r = 17) {
    return `<circle class="dg-tap" cx="${x}" cy="${y}" r="${r}"/>`;
  },

  render(T) {
    if (!T.diagram) return '';
    const steps = T.diagram();
    return `<div class="dg">${steps.map((s, i) =>
      `${i ? '<div class="dg-arrow">→</div>' : ''}<figure class="dg-step">${s.svg}<figcaption><b>${'①②③'[i]}</b> ${s.caption}</figcaption></figure>`
    ).join('')}</div>`;
  },
};
