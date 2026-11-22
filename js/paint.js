// 캔버스 그림에 함께 쓰는 작은 도구 (js/band.js · 풍경 그림 · 운영 버전 대기 화면)

// 0 이상 1 미만의 늘 같은 가짜 난수. 같은 i 면 같은 값이라 풍경이 프레임마다 흔들리지 않는다
export function hash(i) {
  const wave = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return wave - Math.floor(wave);
}

// '#rrggbb' 두 색을 amount 만큼 섞는다 (0 이면 fromColor, 1 이면 toColor)
export function mix(fromColor, toColor, amount) {
  const channelsOf = (color) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const [fromChannels, toChannels] = [channelsOf(fromColor), channelsOf(toColor)];
  return `rgb(${fromChannels.map((value, i) => Math.round(value + (toChannels[i] - value) * amount)).join(',')})`;
}
