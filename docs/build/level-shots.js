// 미니게임마다 Lv1 · Lv4 · Lv8 화면을 찍는다 (난이도가 어떻게 달라지는지 보여 주는 자료 · 운영 설명서용).
// 실행: node docs/build/level-shots.js [게임 id,…] [레벨,…]   → docs/shots/levels/<게임>-lv<레벨>-<차례>-<장면>.png
//   예) node docs/build/level-shots.js            모든 게임, Lv1·4·8
//       node docs/build/level-shots.js box,track 8
//
// 운영 버전(app/) 화면을 헤드리스 Edge 로 띄우고, 로그인·세션 설정 없이 바로 라운드를 시작한다:
// 한 게임만 켜고 시작·최고 난이도를 그 레벨로 묶은 두뇌 게임만 판(brainOnly — 페달 없이)이다.
// 움직이는 장면은 게임 시계를 세워서 찍는다: App.paused 를 직접 켜면 게임 시계(host.now · host.after)가 멈추고
// 일시정지 화면은 뜨지 않는다 (setPaused 를 거치지 않으므로). 찍고 나면 다시 푼다.
// 문제는 판마다 무작위라 다시 찍으면 다른 그림이 나온다.
//
// 게임마다 찍는 장면 (RECIPES). 한 장에 담기지 않는 게임은 레벨마다 달라지는 장면만 레벨마다 찍고,
// 레벨과 상관없는 장면(진행 방식만 보여 주는 것)은 Lv4 에서 한 번만 찍는다 (essence).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { launch, sleep } = require('./cdp');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.resolve(__dirname, '../shots/levels');
const PORT = 5197;
const WIDTH = 1600;
const HEIGHT = 1000;
const SCALE = 1.6; // 2560 × 1600 (docs/shots 의 다른 레벨 사진과 같은 크기)
const ESSENCE_LEVEL = 4;
const ALL_GAMES = ['path', 'symbol', 'arith', 'count', 'fit', 'seek', 'cover', 'pipe', 'novel', 'track', 'follow', 'pair', 'box', 'compare', 'coin', 'recall', 'chain', 'blank', 'safe', 'art'];

function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
  return http.createServer((request, response) => {
    const url = decodeURIComponent(request.url.split('?')[0]);
    const file = path.join(ROOT, url.endsWith('/') ? `${url}index.html` : url);
    fs.readFile(file, (error, data) => {
      if (error) return response.writeHead(404).end();
      response.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` });
      response.end(data);
    });
  }).listen(PORT);
}

// 페이지 안에서 쓰는 헬퍼. 기다리기는 화면 프레임마다 확인한다 (게임 시계 기준으로 한 프레임 안쪽까지 맞는다)
const HELPERS = `
  window.__s = {
    game: () => App.current && App.current.game,
    phase: () => App.current && App.current.game && App.current.game.phase,
    // cond 가 참이 될 때까지 기다리고 그때의 게임 시계를 돌려준다
    until(cond, timeout = 40000) {
      const startedAt = performance.now();
      return new Promise((resolve, reject) => {
        const check = () => {
          let ok = false;
          try { ok = cond(); } catch { /* 아직 준비되지 않음 */ }
          if (ok) return resolve(App.clock);
          if (performance.now() - startedAt > timeout) return reject(new Error('timeout: ' + cond));
          requestAnimationFrame(check);
        };
        check();
      });
    },
    // 게임 시계가 clock 에 이르면 세운다
    freezeAt(clock) {
      return __s.until(() => App.clock >= clock).then(() => { App.paused = true; return App.clock; });
    },
    resume() { App.paused = false; return true; },
    tap(element) { element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); },
    rect(selector) {
      const boxes = selector.split(',').map((one) => document.querySelector(one.trim())).filter(Boolean).map((element) => element.getBoundingClientRect());
      const left = Math.min(...boxes.map((box) => box.left)), top = Math.min(...boxes.map((box) => box.top));
      const right = Math.max(...boxes.map((box) => box.right)), bottom = Math.max(...boxes.map((box) => box.bottom));
      return { x: left, y: top, width: right - left, height: bottom - top };
    },
  };
  true;
`;

(async () => {
  const games = process.argv[2] ? process.argv[2].split(',') : ALL_GAMES;
  const levels = process.argv[3] ? process.argv[3].split(',').map(Number) : [1, 4, 8];
  fs.mkdirSync(OUT, { recursive: true });
  const server = serve();
  const page = await launch({ port: 9335, width: WIDTH, height: HEIGHT });

  const capture = async (clip) => {
    const params = { format: 'png' };
    if (clip) params.clip = { ...clip, scale: 1 };
    return (await page.send('Page.captureScreenshot', params)).data;
  };
  const save = (name, base64) => {
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(base64, 'base64'));
    console.log('saved', name);
  };
  // 게임 시계를 clock 에 세우고 찍은 뒤 다시 푼다. CSS 전환(나타나기 등)은 실제 시간으로 흐르므로 잠깐 기다렸다 찍는다
  const frozenShot = async (name, clockExpression) => {
    await page.eval(`__s.freezeAt(${clockExpression})`);
    await sleep(450);
    save(name, await capture());
    await page.eval('__s.resume()');
  };
  // phase 에 들어선 뒤 게임 시계로 delay ms 지나서 찍는다
  const shotAfterPhase = async (name, phase, delay) => {
    const at = await page.eval(`__s.until(() => __s.phase() === '${phase}')`);
    await frozenShot(name, at + delay);
  };

  // 라운드를 시작하고 소개 화면을 넘겨 첫 게임이 뜰 때까지
  const startGame = async (game, level) => {
    await page.goto(`http://localhost:${PORT}/app/`);
    await page.waitFor('window.App && App.state === "attract"', 20000);
    await page.eval(HELPERS);
    await page.eval(`
      Object.assign(App.config, { games: ['${game}'], startLevel: ${level}, maxLevel: ${level}, difficulty: 'cycle', brainOnly: true, durationSec: 600, sound: false });
      App.band.onMilestone = () => {}; // 출발 깃발의 꽃가루가 하늘을 덮지 않게
      document.querySelector('#fx').style.visibility = 'hidden'; // 꽃가루·파편 효과 (그래도 남는 것까지) 숨긴다
      App.startRound(); true`);
    await page.waitFor('App.inIntro', 15000);
    // 소개 화면은 0.6초 뒤부터 누를 수 있다
    for (let i = 0; i < 40; i++) {
      if (await page.eval('!!__s.game()')) break;
      await page.eval(`(() => { const intro = document.querySelector('.intro'); if (intro) __s.tap(intro); return true; })()`);
      await sleep(200);
    }
    await page.waitFor('__s.game()', 5000);
  };

  const RECIPES = {
    // 길이 다 그려진 순간 (마지막 칸이 켜졌을 때) · Lv4 에서 답하는 중 (절반쯤 따라 누른 화면)
    async path(name, level) {
      await page.eval(`__s.until(() => { const g = __s.game(); const [r, c] = g.path[g.path.length - 1]; return g.head === g.cells[r][c]; })`);
      await frozenShot(name('1-show'), 'App.clock');
      if (level !== ESSENCE_LEVEL) return;
      await page.eval(`__s.until(() => __s.phase() === 'input')`);
      await page.eval(`(async () => { const g = __s.game(); const half = Math.ceil(g.path.length / 2);
        for (let i = 1; i < half; i++) { const [r, c] = g.path[i]; __s.tap(g.cells[r][c]); await new Promise((done) => setTimeout(done, 150)); } return true; })()`);
      await frozenShot(name('2-answer'), 'App.clock + 900');
    },
    // 외울 판 (심볼이 모두 놓였을 때) · Lv4 에서 묻는 화면
    async symbol(name, level) {
      const at = await page.eval(`__s.until(() => document.querySelectorAll('.sym-grid .sym').length === __s.game().symbolCount)`);
      await frozenShot(name('1-show'), at + 400);
      if (level === ESSENCE_LEVEL) await shotAfterPhase(name('2-ask'), 'input', 300);
    },
    // 상자가 열린 채 숫자를 보여 주는 화면 · 상자가 닫히고 묻는 화면
    async cover(name) {
      await shotAfterPhase(name('1-show'), 'show', 1000);
      await shotAfterPhase(name('2-ask'), 'input', 500);
    },
    // 처음 판 · 가림막이 걷힌 뒤 (새 그림이 하나 늘었다)
    async novel(name) {
      await shotAfterPhase(name('1-show'), 'show', 700);
      await shotAfterPhase(name('2-find'), 'input', 500);
    },
    // 그림을 보여 주는 화면 · 칸이 뒤집힌 뒤 노란 칸과 보기
    async art(name) {
      await shotAfterPhase(name('1-show'), 'show', 700);
      await shotAfterPhase(name('2-ask'), 'input', 500);
    },
    // ★ 이 뜬 공 · Lv8 은 움직이는 중(공끼리 겹쳐 지나간다) · Lv4 는 멈춘 뒤 고르는 화면
    async track(name, level) {
      await shotAfterPhase(name('1-cue'), 'cue', 400);
      if (level === 8) {
        const at = await page.eval(`__s.until(() => __s.phase() === 'move')`);
        await frozenShot(name('2-move'), `${at} + __s.game().spec.move * 0.45`);
      }
      if (level === ESSENCE_LEVEL) await shotAfterPhase(name('2-pick'), 'pick', 300);
    },
    // 지시가 뜬 조작판. 높은 단계는 지시를 읽는 동안 조작판을 덮고(read), 지시를 지운 뒤에야 풀어 준다
    async follow(name) {
      const first = await page.eval(`__s.until(() => ['read', 'input'].includes(__s.phase()))`);
      if (await page.eval(`__s.phase() === 'read'`)) {
        await frozenShot(name('1-read'), first + 800);
        await shotAfterPhase(name('2-input'), 'input', 500);
      } else {
        await frozenShot(name('1-input'), first + 700);
      }
    },
    // 처음 상자 속 (있으면) · 과일이 가장 많이 움직이는 순간 · 묻는 화면
    async box(name) {
      const opened = await page.eval(`__s.until(() => document.querySelector('.bx-box.open') || __s.phase() === 'play').then((at) => document.querySelector('.bx-box.open') ? at : null)`);
      let step = 1;
      if (opened != null) await frozenShot(name(`${step++}-start`), opened + 500);
      const playAt = await page.eval(`__s.until(() => __s.phase() === 'play')`);
      // 과일마다 출발 시각·걸리는 시간·출발/도착 자리가 정해져 있다 (box.js 의 flights). 출발·도착 자리는 과일이 통째로 숨는 곳이라
      // 두 자리에서 과일 크기만큼 떨어져야 다 보인다. 보이는 몫(0~1)을 모두 더한 값이 가장 큰 순간을 찍는다
      const best = await page.eval(`(() => {
        const flights = __s.game().flights, size = __s.game().constructor.FRUIT_SIZE;
        const end = Math.max(...flights.map((f) => f.departAt + f.duration));
        let bestT = 0, bestScore = -1;
        for (let t = 0; t <= end; t += 10) {
          const score = flights.reduce((sum, f) => {
            const x = f.fromX + (f.toX - f.fromX) * Math.min(1, Math.max(0, (t - f.departAt) / f.duration));
            return sum + Math.min(1, Math.max(0, Math.min(Math.abs(x - f.fromX), Math.abs(x - f.toX)) / size));
          }, 0);
          if (score > bestScore + 1e-6) { bestScore = score; bestT = t; }
        }
        return bestT; })()`);
      await frozenShot(name(`${step++}-move`), playAt + best);
      await shotAfterPhase(name(`${step}-ask`), 'input', 500);
    },
    // 그림이 하나씩 나오므로 나온 차례대로 카드를 잘라 한 장에 잇는다 · 답하는 화면. Lv4 는 첫 그림이 뜬 전체 화면도
    async recall(name, level) {
      const count = await page.eval(`__s.until(() => __s.game().puzzle).then(() => __s.game().puzzle.items.length)`);
      const cards = [];
      for (let i = 0; i < count; i++) {
        const at = await page.eval(`__s.until(() => { const dots = [...document.querySelectorAll('.rc-steps span')]; return dots[${i}] && dots[${i}].classList.contains('on') && __s.game().cardSvg.childElementCount > 0; })`);
        await page.eval(`__s.freezeAt(${at} + 250)`);
        await sleep(450);
        if (i === 0 && level === ESSENCE_LEVEL) save(name('0-screen'), await capture());
        cards.push(await capture(await page.eval(`(() => { const r = __s.rect('.rc-card, .rc-steps'); return { x: r.x - 12, y: r.y - 12, width: r.width + 24, height: r.height + 24 }; })()`)));
        await page.eval('__s.resume()');
      }
      save(name('1-sequence'), await stitch(cards));
      await shotAfterPhase(name('2-answer'), 'input', 400);
    },
  };
  // 한 장이면 되는 게임: 답을 기다리는 화면 (나타나는 효과가 끝나도록 조금 뒤)
  for (const id of ['arith', 'count', 'fit', 'seek', 'pipe', 'pair', 'compare', 'coin', 'chain', 'blank', 'safe']) {
    RECIPES[id] = async (name) => shotAfterPhase(name('1-question'), 'input', 1200);
  }

  // 카드 사진들을 차례 번호와 함께 한 장에 잇는다 (한 줄에 4장까지). 브라우저 캔버스로 합친다
  const stitch = (images) => page.eval(`(async () => {
    const sources = ${JSON.stringify(images)};
    const loaded = await Promise.all(sources.map((data) => new Promise((resolve) => { const image = new Image(); image.onload = () => resolve(image); image.src = 'data:image/png;base64,' + data; })));
    const perRow = Math.min(4, loaded.length), rows = Math.ceil(loaded.length / perRow);
    const cellW = loaded[0].width, cellH = loaded[0].height, gap = 40, label = 64, pad = 40;
    const canvas = document.createElement('canvas');
    canvas.width = pad * 2 + perRow * cellW + (perRow - 1) * gap;
    canvas.height = pad * 2 + rows * (cellH + label) + (rows - 1) * gap;
    const context = canvas.getContext('2d');
    context.fillStyle = '#f3f4ef'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = 'bold 40px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = '#3a3f45';
    loaded.forEach((image, i) => {
      const x = pad + (i % perRow) * (cellW + gap), y = pad + Math.floor(i / perRow) * (cellH + label + gap);
      context.fillText(String(i + 1), x + cellW / 2, y + label / 2 - 6);
      context.drawImage(image, x, y + label);
    });
    return canvas.toDataURL('image/png').split(',')[1]; })()`);

  try {
    await page.viewport(WIDTH, HEIGHT, SCALE);
    for (const game of games) {
      for (const level of levels) {
        const name = (step) => `${game}-lv${level}-${step}`;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            await startGame(game, level);
            await RECIPES[game](name, level);
            break;
          } catch (error) {
            console.error(`${game} Lv${level} (시도 ${attempt}):`, error.message);
            if (attempt === 2) process.exitCode = 1;
          }
        }
      }
    }
  } finally {
    await page.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
