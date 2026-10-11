// 헤드리스 Edge를 DevTools Protocol로 조작하는 최소 헬퍼 (의존성 없음, Node 22+)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

async function launch({ port = 9333, width = 1600, height = 1000 } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-cdp-'));
  const proc = spawn(EDGE, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--hide-scrollbars',
    'about:blank',
  ], { stdio: 'ignore' });

  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
    } catch (e) {}
  }
  if (!target) throw new Error('Edge 디버깅 포트에 연결하지 못했습니다');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const n = ++id;
      pending.set(n, { res, rej });
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  await send('Page.enable');
  await send('Runtime.enable');

  const page = {
    send,
    async viewport(w, h, scale = 1) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: false });
    },
    async goto(url) {
      await send('Page.navigate', { url });
      await page.waitFor('document.readyState === "complete"');
    },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(cond, timeout = 30000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        try { if (await page.eval(`!!(${cond})`)) return; } catch (e) {}
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`timeout: ${cond}`);
    },
    async shot(file, clip) {
      const params = { format: 'png', captureBeyondViewport: !!clip };
      if (clip) params.clip = { ...clip, scale: 1 };
      const r = await send('Page.captureScreenshot', params);
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      console.log('saved', path.basename(file));
    },
    async pdf(file) {
      const r = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      console.log('saved', path.basename(file));
    },
    async close() {
      ws.close();
      // 브라우저 전체를 DevTools로 정상 종료 (proc.kill만으로는 자식 프로세스가 남는다)
      try {
        const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
        const bws = new WebSocket(webSocketDebuggerUrl);
        await new Promise((r) => bws.addEventListener('open', r, { once: true }));
        bws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
        await new Promise((r) => setTimeout(r, 500));
        bws.close();
      } catch (e) {
        proc.kill();
      }
    },
  };
  return page;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { launch, sleep };
