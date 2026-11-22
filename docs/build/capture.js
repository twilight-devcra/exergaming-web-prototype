// 실제 웹게임을 헤드리스로 플레이시키며 슬라이드용 스크린샷을 찍는다.
// 실행: node docs/build/capture.js  → docs/shots/*.png
const http = require('http');
const fs = require('fs');
const path = require('path');
const { launch, sleep } = require('./cdp');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.resolve(__dirname, '../shots');
const PORT = 5199;
const WIDTH = 1600;
const HEIGHT = 1000;
const BAND = { x: 0, y: 0, width: WIDTH, height: HEIGHT * 0.25 };

function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  return http.createServer((request, response) => {
    const url = decodeURIComponent(request.url.split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    fs.readFile(file, (error, data) => {
      if (error) return response.writeHead(404).end();
      response.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
      response.end(data);
    });
  }).listen(PORT);
}

// 페이지 안에서 쓰는 헬퍼
const HELPERS = `
  window.__pedalAt = (interval) => {
    clearInterval(window.__pedalTimer);
    let stroke = 0;
    window.__pedalTimer = setInterval(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: stroke++ % 2 ? 'KeyD' : 'KeyA' })), interval);
  };
  window.__tap = (element) => element.dispatchEvent(new PointerEvent('pointerdown'));
  true;
`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = serve();
  const page = await launch({ width: WIDTH, height: HEIGHT });
  const shot = (name, clip) => page.shot(path.join(OUT, `${name}.png`), clip);
  try {
    await page.viewport(WIDTH, HEIGHT, 1.5);
    await page.goto(`http://localhost:${PORT}/`);
    // 메뉴 화면 순위 예시 데이터 (예시용 이름)
    await page.eval(`localStorage.clear();
      localStorage.setItem('exergame.board', JSON.stringify([
        { id: 1, name: '참가자 A', score: 2484, ex: 1712, cog: 772, dur: 180 },
        { id: 2, name: '참가자 B', score: 2311, ex: 1650, cog: 661, dur: 180 },
        { id: 3, name: '참가자 C', score: 2096, ex: 1590, cog: 506, dur: 180 },
        { id: 4, name: '참가자 D', score: 1873, ex: 1402, cog: 471, dur: 180 },
      ])); true`);
    await page.goto(`http://localhost:${PORT}/`);
    await page.eval(HELPERS);
    await sleep(400);
    await shot('01-menu');

    // 속도 측정
    await page.eval(`document.querySelector('#cfg-calib').value = 8; document.querySelector('#cfg-duration').value = 60;
      __pedalAt(400); document.querySelector('#btn-start').click(); true`);
    await sleep(3500);
    await shot('02-calib');

    // 카운트다운 → 레벨 3 사이클부터 보여주기 위해 순서를 앞당김
    await page.waitFor(`App.state === 'countdown'`);
    await page.eval(`App.gameIndex = 6; true`);
    await sleep(1300);
    await shot('03-countdown');

    // 길 따라 그리기
    await page.waitFor(`App.current && App.current.type.id === 'path'`);
    await page.waitFor(`document.querySelectorAll('.pcell.on').length >= 5`);
    await shot('04-path-show');
    await page.waitFor(`App.current.game.phase === 'input'`);
    await page.eval(`(async () => {
      const game = App.current.game;
      for (let i = 1; i <= 4; i++) { const [row, column] = game.path[i]; __tap(game.cells[row][column]); await new Promise((resolve) => setTimeout(resolve, 120)); }
      return true; })()`);
    await sleep(250);
    await shot('05-path-input');
    await shot('band-ok', BAND);
    await page.eval(`(async () => {
      const game = App.current.game;
      for (let i = game.nextStep; i < game.path.length; i++) { const [row, column] = game.path[i]; __tap(game.cells[row][column]); await new Promise((resolve) => setTimeout(resolve, 120)); }
      return true; })()`);
    await sleep(300);
    await shot('06-path-clear');

    // 심볼 위치 외우기
    await page.waitFor(`App.current && App.current.type.id === 'symbol'`);
    await page.waitFor(`document.querySelector('.memorize-banner')`);
    await sleep(300);
    await shot('07-symbol-banner');
    await page.waitFor(`document.querySelectorAll('.sym-grid .sym').length === App.current.game.symbolCount`);
    await sleep(300);
    await shot('08-symbol-show');
    await page.waitFor(`App.current.game.phase === 'input'`);
    await page.eval(`__tap(App.current.game.cells[App.current.game.current.slot]); true`);
    await page.waitFor(`App.current.game.phase === 'input' && App.current.game.answered === 1`);
    await sleep(200);
    await shot('09-symbol-ask');
    await page.eval(`(() => { const game = App.current.game;
      const wrongSlot = [...Array(8).keys()].find((slot) => slot !== game.current.slot && !game.cells[slot].classList.contains('closed'));
      __tap(game.cells[wrongSlot]); return true; })()`);
    await sleep(250);
    await shot('10-symbol-wrong');
    await page.waitFor(`App.current.game.phase === 'input' && App.current.game.answered === 2`);
    await page.eval(`__tap(App.current.game.cells[App.current.game.current.slot]); true`);

    // 사칙연산 역산 (페달을 느리게 밟아 구역 이탈도 함께 보여준다)
    await page.waitFor(`App.current && App.current.type.id === 'arith' && App.current.game.phase === 'input'`, 15000);
    await page.eval(`__pedalAt(640); (() => { const game = App.current.game;
      __tap(game.candidateButtons.find((button) => Number(button.textContent) === game.puzzle.solution[0])); return true; })()`);
    await sleep(3200);
    await shot('11-arith-slow');
    await shot('band-slow', BAND);
    await page.eval(`(() => { const game = App.current.game;
      game.puzzle.solution.slice(1).forEach((value) => __tap(game.candidateButtons.find((button) => Number(button.textContent) === value))); return true; })()`);
    await sleep(250);
    await page.eval(`__pedalAt(400); true`);
    await shot('12-arith-right');

    // 오르막 구간: 목표 RPM +12%로 전환된 상태
    await page.eval(`App.slopeLevel = 1; __pedalAt(Math.round(400 / 1.12)); true`);
    await sleep(3500);
    await shot('band-uphill', BAND);
    await shot('13-uphill');

    // 결과 화면
    await page.waitFor(`App.state === 'result'`, 40000);
    await page.eval(`clearInterval(window.__pedalTimer); document.activeElement.blur(); true`);
    await sleep(500);
    await shot('14-result');
  } finally {
    await page.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
