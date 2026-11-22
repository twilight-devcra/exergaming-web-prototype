// 게임 소개 화면의 설명 그림.
// 게임마다 static diagram() 이 [{ svg, caption }, ...] (보통 두 단계: 무엇을 보고 → 무엇을 누르나)를 돌려주고,
// Diagram.render 가 '① … → ② …' 모양으로 늘어놓는다. 그림은 게임 안에서 쓰는 모양·색을 그대로 써서
// 소개에서 본 것이 실제 판에서 바로 알아보이게 한다. 색은 css 변수(--cell, --accent …)를 따라 화면 스타일마다 바뀐다.
export const Diagram = {
  svg(viewBox, body) {
    return `<svg class="dg-svg" viewBox="${viewBox}">${body}</svg>`;
  },

  rect(x, y, width, height, cls = 'dg-cell', cornerRadius = 7) {
    return `<rect class="${cls}" x="${x}" y="${y}" width="${width}" height="${height}" rx="${cornerRadius}"/>`;
  },

  text(x, y, label, size = 20, cls = 'dg-txt') {
    return `<text class="${cls}" x="${x}" y="${y}" font-size="${size}" text-anchor="middle" dominant-baseline="central">${label}</text>`;
  },

  // 100×100 안에 그린 그림을 (centerX, centerY) 가운데에 size 크기로
  glyph(svg, centerX, centerY, size, attrs = '') {
    const scale = size / 100;
    return `<g transform="translate(${centerX - size / 2} ${centerY - size / 2}) scale(${scale})" ${attrs}>${svg}</g>`;
  },

  // 여기를 누르라는 표시 (천천히 퍼지는 고리)
  tap(x, y, radius = 17) {
    return `<circle class="dg-tap" cx="${x}" cy="${y}" r="${radius}"/>`;
  },

  // GameClass = 게임 클래스, level = 이번 판의 레벨. 레벨에 따라 할 일이 바뀌는 게임은 diagram(level) 에서 그림을 고른다 (동전 세기)
  render(GameClass, level) {
    if (!GameClass.diagram) return '';
    const steps = GameClass.diagram(level);
    return `<div class="dg">${steps.map((step, i) =>
      `${i ? '<div class="dg-arrow">→</div>' : ''}<figure class="dg-step">${step.svg}<figcaption><b>${'①②③'[i]}</b> ${step.caption}</figcaption></figure>`
    ).join('')}</div>`;
  },
};
