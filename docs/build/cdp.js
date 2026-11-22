// 헤드리스 Edge를 DevTools Protocol로 조작하는 최소 헬퍼 (의존성 없음, Node 22+)
const { spawn } = require('child_process');
const fs = require('fs');
const { tmpdir } = require('os');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

// args: 브라우저에 더 넘길 옵션 (예: 가짜 카메라 --use-file-for-fake-video-capture=...)
async function launch({ port = 9333, width = 1600, height = 1000, args = [] } = {}) {
  const profile = fs.mkdtempSync(path.join(tmpdir(), 'edge-cdp-'));
  const browser = spawn(EDGE, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--hide-scrollbars',
    ...args,
    'about:blank',
  ], { stdio: 'ignore' });

  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((candidate) => candidate.type === 'page');
    } catch { /* 브라우저가 아직 뜨는 중 */ }
  }
  if (!target) throw new Error('Edge 디버깅 포트에 연결하지 못했습니다');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
  let lastId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const messageId = ++lastId;
      pending.set(messageId, { resolve, reject });
      socket.send(JSON.stringify({ id: messageId, method, params }));
    });

  await send('Page.enable');
  await send('Runtime.enable');

  const page = {
    send,
    async viewport(viewportWidth, viewportHeight, scale = 1) {
      await send('Emulation.setDeviceMetricsOverride', { width: viewportWidth, height: viewportHeight, deviceScaleFactor: scale, mobile: false });
    },
    async goto(url) {
      await send('Page.navigate', { url });
      await page.waitFor('document.readyState === "complete"');
    },
    async eval(expression) {
      const evaluated = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text);
      return evaluated.result.value;
    },
    async waitFor(condition, timeout = 30000) {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeout) {
        try { if (await page.eval(`!!(${condition})`)) return; } catch { /* 페이지가 아직 준비되지 않음 */ }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`timeout: ${condition}`);
    },
    async shot(file, clip) {
      const params = { format: 'png', captureBeyondViewport: !!clip };
      if (clip) params.clip = { ...clip, scale: 1 };
      const screenshot = await send('Page.captureScreenshot', params);
      fs.writeFileSync(file, Buffer.from(screenshot.data, 'base64'));
      console.log('saved', path.basename(file));
    },
    async pdf(file) {
      const printed = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
      fs.writeFileSync(file, Buffer.from(printed.data, 'base64'));
      console.log('saved', path.basename(file));
    },
    async close() {
      socket.close();
      // 브라우저 전체를 DevTools로 정상 종료 (browser.kill만으로는 자식 프로세스가 남는다)
      try {
        const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
        const browserSocket = new WebSocket(webSocketDebuggerUrl);
        await new Promise((resolve) => browserSocket.addEventListener('open', resolve, { once: true }));
        browserSocket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
        await new Promise((resolve) => setTimeout(resolve, 500));
        browserSocket.close();
      } catch {
        browser.kill();
      }
      // 임시 프로필(캐시 포함)을 지운다. 남겨 두면 실행할 때마다 쌓여 디스크를 채운다 (2026-11-20, 100여 개 · 7GB 넘게 쌓였다).
      // 브라우저가 파일을 잠깐 더 쥐고 있을 수 있어 몇 번 다시 해 본다
      for (let i = 0; i < 10; i++) {
        try {
          fs.rmSync(profile, { recursive: true, force: true });
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    },
  };
  return page;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

module.exports = { launch, sleep };
