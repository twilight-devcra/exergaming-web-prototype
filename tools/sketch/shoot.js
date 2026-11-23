// 스케치의 화면(shot)을 1280×800 그림으로 모두 찍는다: node tools/sketch/shoot.js <스케치 폴더 이름> [저장 폴더]
// 예: node tools/sketch/shoot.js safe   → tools/.cache/sketch/safe/<shot id>.png
// 서버를 따로 띄우지 않아도 된다 (잠깐 띄웠다 끈다). 헤드리스 Edge 는 docs/build/cdp.js 를 쓴다.
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
    await page.waitFor("document.querySelectorAll('.sk-shot').length > 0");
    const ids = await page.eval("[...document.querySelectorAll('.sk-shot figcaption a')].map((a) => a.textContent)");
    for (const id of ids) {
      await page.goto(`${base}?shot=${encodeURIComponent(id)}`);
      await page.waitFor("document.querySelector('.sk-full') && document.fonts.status === 'loaded'");
      await new Promise((resolve) => setTimeout(resolve, 250));
      await page.shot(path.join(out, `${id}.png`));
      console.log(path.join(out, `${id}.png`));
    }
  } finally {
    await page.close();
    server.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
