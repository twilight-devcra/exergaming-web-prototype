// slides.html → PDF. 실행: node docs/build/pdf.js [--preview]
const path = require('path');
const { pathToFileURL } = require('url');
const { launch, sleep } = require('./cdp');

const DOCS = path.resolve(__dirname, '..');
const OUT = path.join(DOCS, '엑서게임_기획_슬라이드.pdf');

(async () => {
  const page = await launch({ port: 9334, width: 1280, height: 720 });
  try {
    await page.viewport(1280, 720, 1);
    await page.goto(pathToFileURL(path.join(DOCS, 'slides.html')).href);
    await page.eval(`document.fonts.ready.then(() => Promise.all([...document.images].map((image) => image.decode().catch(() => {})))).then(() => true)`);
    await sleep(300);
    await page.pdf(OUT);

    if (process.argv.includes('--preview')) {
      // 슬라이드별 미리보기 PNG (검수용)
      const slideCount = await page.eval(`document.querySelectorAll('.slide').length`);
      for (let i = 0; i < slideCount; i++) {
        await page.shot(path.join(require('os').tmpdir(), `slide-${i + 1}.png`), { x: 0, y: i * 720, width: 1280, height: 720 });
      }
    }
  } finally {
    await page.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
