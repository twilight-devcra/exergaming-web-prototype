// 스케치의 화면(shot)을 저마다 그 기기 크기(태블릿 1280×800, 휴대폰 390×844 …)의 그림으로 모두 찍는다: node tools/sketch/shoot.js <스케치 폴더 이름> [저장 폴더]
// 예: node tools/sketch/shoot.js safe   → tools/.cache/sketch/safe/<shot id>.png
// 서버를 따로 띄우지 않아도 된다 (잠깐 띄웠다 끈다). 헤드리스 Edge 는 docs/build/cdp.js 를 쓴다.
// 화면마다 판 자리(.stage-body) 크기와 가장 작은 누르는 칸(56px 미만이면 ⚠)을 찍고, 판이 그 자리를 넘치면 ⚠ 넘침 을 붙인다.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { launch } = require('../../docs/build/cdp.js');

const ROOT = path.join(__dirname, '..', '..');
const name = process.argv[2];
if (!name) {
  console.error('사용법: node tools/sketch/shoot.js <스케치 폴더 이름> [저장 폴더]');
  process.exit(1);
}
const out = path.resolve(process.argv[3] || path.join(ROOT, 'tools', '.cache', 'sketch', name));
const PORT = 5190 + Math.floor(Math.random() * 40);

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT }, stdio: 'ignore' });
  const page = await launch({ port: 9400 + Math.floor(Math.random() * 40), width: 1280, height: 800 });
  try {
    fs.mkdirSync(out, { recursive: true });
    const base = `http://localhost:${PORT}/tools/sketch/${name}/`;
    await page.viewport(1280, 800);
    await page.goto(base);
    await page.waitFor('window.SKETCH_SHOTS');
    const shots = await page.eval('window.SKETCH_SHOTS');
    for (const { id, width, height } of shots) {
      await page.viewport(width, height);
      await page.goto(`${base}?shot=${encodeURIComponent(id)}`);
      await page.waitFor("document.querySelector('.sk-full') && document.fonts.status === 'loaded'");
      await new Promise((resolve) => setTimeout(resolve, 250));
      // 판 자리(.stage-body)의 크기와, 판이 그 자리를 넘치는지 (넘치면 잘려 보인다)
      const fit = await page.eval(`(() => {
        const body = document.querySelector('.stage-body');
        if (!body) return '';
        const box = body.getBoundingClientRect();
        const over = [...body.querySelectorAll('*')].some((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width && (rect.left < box.left - 1 || rect.right > box.right + 1 || rect.top < box.top - 1 || rect.bottom > box.bottom + 1);
        });
        // 누르는 것 가운데 가장 작은 것 (button · .clickable · [data-tap]). 규칙은 56px 이상
        const taps = [...body.querySelectorAll('button, .clickable, [data-tap]')].map((node) => node.getBoundingClientRect()).filter((rect) => rect.width);
        const smallest = taps.length ? Math.round(Math.min(...taps.map((rect) => Math.min(rect.width, rect.height)))) : null;
        const tap = smallest == null ? '' : \`  누르는 칸 최소 \${smallest}px\${smallest < 56 ? ' ⚠ 56px 미만' : ''}\`;
        return \`판 자리 \${Math.round(box.width)}×\${Math.round(box.height)}\${tap}\${over ? '  ⚠ 넘침' : ''}\`;
      })()`);
      const file = path.join(out, `${id}.png`);
      await page.shot(file);
      console.log(`${id}  ${width}×${height}  ${fit}`);
    }
  } finally {
    await page.close();
    server.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
