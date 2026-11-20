// 캔버스 그림에 함께 쓰는 작은 도구 (js/band.js · 풍경 그림 · 운영 버전 대기 화면)

// 0 이상 1 미만의 늘 같은 가짜 난수. 같은 i 면 같은 값이라 풍경이 프레임마다 흔들리지 않는다
export function hash(i) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// '#rrggbb' 두 색을 t 만큼 섞는다
export function mix(a, b, t) {
  const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
}
