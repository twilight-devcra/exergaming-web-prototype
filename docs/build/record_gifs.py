# 실제 게임을 헤드리스 Edge 로 돌리며 녹화해 시연 모드 GIF 를 만든다.
#   python docs/build/record_gifs.py [flow] [styles] [--out 폴더]
#     flow   — demo-flow.gif: 대기 화면 → 측정 → 게임(일부러 한 번 틀림) → 속도 전환 → 결과 → 다음 참가자 (기본 스타일, 55초 판)
#     styles — style-<id>.gif 스타일마다 (대기 화면 → 우세한 색 찾기 → 결과) 와 styles-tour.gif (다섯 스타일 이어 붙임)
#     둘 다 빼면 전부 만든다. 결과는 --out (기본 docs/gifs, git 에 넣지 않는다)
# 필요한 것: Python 3, `pip install websocket-client`, PATH 의 ffmpeg, Microsoft Edge
#
# 녹화용으로 바꾸는 것:
#   - 페달은 연결된 것처럼 보이게 하고, 파형 추정값(App.pedal.lzFrame)을 초당 20번 넣어 흉내 낸다.
#     목표 속도를 약 2.5초 늦게 따라가서 속도 전환 때 공이 잠깐 벗어났다 돌아온다.
#   - 누른 곳에 흰 물결을 그린다.
#   - 스타일 GIF 의 결과 화면은 레이더가 다 채워지도록 그럴듯한 성적을 넣은 연출 값이다 (flow 의 결과는 실제 값).
import argparse, base64, functools, http.server, json, os, random, shutil, subprocess, sys, tempfile, threading, time, urllib.request

try:
    import websocket
except ImportError:
    sys.exit('websocket-client 가 필요합니다: pip install websocket-client')

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ap = argparse.ArgumentParser()
ap.add_argument('which', nargs='*', choices=['flow', 'styles'])
ap.add_argument('--out', default=os.path.join(ROOT, 'docs', 'gifs'))
args = ap.parse_args()
WHICH = args.which or ['flow', 'styles']
OUT = args.out
if not shutil.which('ffmpeg'):
    sys.exit('ffmpeg 를 PATH 에서 찾지 못했습니다')
sys.stdout.reconfigure(encoding='utf-8')
os.makedirs(OUT, exist_ok=True)
WORK = tempfile.mkdtemp(prefix='exergame-gif-')

PORT, DBG = 5197, 9335
W, H = 1280, 800           # 녹화 화면 (가로형 태블릿)
GIF_W, FPS = 960, 10
EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
THEMES = ['clean', 'neon', 'sporty', 'cartoon', 'pixel']
random.seed(7)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
profile = tempfile.mkdtemp(prefix='exergame-edge-')
proc = subprocess.Popen([EDGE, '--headless=new', f'--remote-debugging-port={DBG}', f'--user-data-dir={profile}', f'--window-size={W},{H}',
                         '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
                         '--disable-renderer-backgrounding', '--hide-scrollbars', '--mute-audio', 'about:blank'])
target = None
for _ in range(60):
    time.sleep(0.25)
    try:
        target = next((t for t in json.load(urllib.request.urlopen(f'http://127.0.0.1:{DBG}/json/list')) if t['type'] == 'page'), None)
        if target: break
    except Exception: pass
if not target:
    proc.kill()
    sys.exit('Edge 디버깅 포트에 연결하지 못했습니다')


class CDP:
    """DevTools 연결 하나. 이벤트는 버리고 응답만 기다린다"""
    def __init__(self, url):
        self.ws = websocket.create_connection(url, suppress_origin=True, timeout=60)
        self.mid = 0

    def send(self, method, **params):
        self.mid += 1
        self.ws.send(json.dumps({'id': self.mid, 'method': method, 'params': params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get('id') == self.mid:
                if 'error' in m: raise RuntimeError(m['error'])
                return m.get('result')


# 조작용과 녹화용을 따로 연결해서, 녹화하는 동안에도 조작이 막히지 않게 한다
drv = CDP(target['webSocketDebuggerUrl'])
cap = CDP(target['webSocketDebuggerUrl'])


def ev(expr):
    r = drv.send('Runtime.evaluate', expression=expr, awaitPromise=True, returnByValue=True)
    if 'exceptionDetails' in r:
        raise RuntimeError(r['exceptionDetails'].get('exception', {}).get('description') or r['exceptionDetails'])
    return r['result'].get('value')


def wait(cond, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if ev(f'!!({cond})'): return
        except Exception: pass
        time.sleep(0.05)
    raise RuntimeError('timeout ' + cond)


def goto(url):
    drv.send('Page.navigate', url=url)
    time.sleep(0.4)
    wait('document.readyState === "complete"')


def center(sel):
    return ev(f"(() => {{ const r = document.querySelector('{sel}').getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; }})()")


def tap(x, y, hold=0.07):
    drv.send('Input.dispatchTouchEvent', type='touchStart', touchPoints=[{'x': x, 'y': y}])
    time.sleep(hold)
    drv.send('Input.dispatchTouchEvent', type='touchEnd', touchPoints=[])


# ---------------- 녹화 ----------------
class Recorder(threading.Thread):
    """켜져 있는 동안 화면을 초당 약 12장 찍는다. begin(이름) 마다 새 구간이 된다"""
    def __init__(self):
        super().__init__(daemon=True)
        self.on = False
        self.seg = None
        self.frames = []   # (시각, 구간, jpeg)
        self.names = {}    # 구간 → 이름
        self.done = False
        self.busy = False  # 스크린샷을 찍는 중

    def begin(self, name):
        self.seg = len(self.names) + 1
        self.names[self.seg] = name
        self.on = True

    # 찍고 있던 한 장이 끝날 때까지 기다린다. 그 사이에 페이지를 옮기면 스크린샷이 실패한다
    def pause(self):
        self.on = False
        while self.busy:
            time.sleep(0.005)

    def run(self):
        while not self.done:
            if not self.on:
                time.sleep(0.01)
                continue
            t, seg = time.monotonic(), self.seg
            self.busy = True
            try:
                r = cap.send('Page.captureScreenshot', format='jpeg', quality=88)
            except Exception:
                if self.done: return  # 브라우저를 닫는 중
                r = None              # 한 장 실패는 건너뛴다
            finally:
                self.busy = False
            if r and self.on and seg == self.seg:
                self.frames.append((t, seg, base64.b64decode(r['data'])))
            time.sleep(max(0, 0.075 - (time.monotonic() - t)))


rec = Recorder()


def clip(name, start=0.0, end=None):
    """이름 붙은 구간을 FPS 로 다시 뽑는다. start/end 는 초, 음수면 구간 끝에서부터"""
    seg = next(s for s, n in rec.names.items() if n == name)
    fr = [f for f in rec.frames if f[1] == seg]
    if not fr:
        raise RuntimeError(f'{name}: 녹화된 화면이 없습니다')
    t0, t1 = fr[0][0], fr[-1][0]
    a = t1 + start if start < 0 else t0 + start
    b = t1 if end is None else (t1 + end if end < 0 else t0 + end)
    out, i, t = [], 0, a
    while t <= b:
        while i + 1 < len(fr) and fr[i + 1][0] <= t: i += 1
        out.append(fr[i][2])
        t += 1 / FPS
    return out


def write_gif(name, frames):
    d = os.path.join(WORK, name)
    os.makedirs(d)
    for i, b in enumerate(frames):
        with open(os.path.join(d, f'{i:05d}.jpg'), 'wb') as f:
            f.write(b)
    out = os.path.join(OUT, name + '.gif')
    vf = (f'scale={GIF_W}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=200:stats_mode=diff[p];'
          '[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', os.path.join(d, '%05d.jpg'),
                    '-vf', vf, '-loop', '0', out], check=True)
    print(f'  {out}  {len(frames) / FPS:.1f}초  {os.path.getsize(out) / 1048576:.1f} MB')


# ---------------- 페이지 안에서 쓰는 도구 ----------------
TAP_RIPPLE = """
addEventListener('DOMContentLoaded', () => {
  const st = document.createElement('style');
  st.textContent = `.__tap{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,255,255,.45);
    box-shadow:0 0 0 3px rgba(20,24,36,.45);pointer-events:none;z-index:99999;animation:__tap .55s ease-out forwards}
    @keyframes __tap{from{transform:scale(.45);opacity:1}to{transform:scale(1.5);opacity:0}}`;
  document.head.append(st);
  addEventListener('pointerdown', (e) => {
    const d = document.createElement('div'); d.className = '__tap';
    d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px';
    document.body.append(d); setTimeout(() => d.remove(), 650);
  }, true);
});
"""

# 페달이 연결된 화면으로 (실제 연결은 없다. CAP 명령은 보내지 않고 버린다)
PEDAL_CONNECTED = """
App.link.state = 'ready'; App.link.send = () => Promise.resolve();
App.pedal.sensorOn = true; App.pedal.sensorSeen = true;
document.body.classList.add('sensor');
document.querySelectorAll('.pedal-status').forEach(s => { s.dataset.state = 'ready'; s.textContent = 'Cardio-P 연결됨'; });
if (typeof Demo !== 'undefined' && Demo.app) Demo.updateAttract(); true
"""

PEDALING = """
window.__ped = { on: true, rpm: 60 };
setInterval(() => {
  const p = __ped; if (!p.on) return;
  const want = (['countdown', 'play'].includes(App.state) && App.target) ? App.target : 60;
  p.rpm += (want - p.rpm) * 0.02;
  App.pedal.lzFrame(p.rpm + (Math.random() - 0.5) * 1.2);
}, 50); true
"""

# 지금 문제의 정답(wrong 이면 오답) 위치. 입력을 받는 중이 아니면 null
TARGETS = """
window.__targets = (wrong) => {
  const c = App.current;
  if (!c || App.state !== 'play' || App.paused) return null;
  const g = c.game;
  if (g.phase !== 'input') return null;
  const ctr = (el) => { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; };
  let els = [];
  switch (c.T.id) {
    case 'count': els = [g.btns.find((x) => (wrong ? x.i !== 0 : x.i === 0)).b]; break;
    case 'arith': els = g.p.sol.map((v) => g.btns.find((b) => Number(b.textContent) === v && !b.disabled)); break;
    case 'fit': els = [g.btns[g.shown.findIndex((s) => s.answer !== !!wrong)]]; break;
    case 'seek': els = [g.cellEls[g.puzzle.answer[Math.floor(g.puzzle.answer.length / 2)]]]; break;
    case 'symbol': els = [wrong ? g.cells.find((x, i) => i !== g.current.slot && !x.classList.contains('closed')) : g.cells[g.current.slot]]; break;
    case 'path': els = g.path.slice(g.k).map(([r, cc]) => g.cells[r][cc]); break;
  }
  return { q: App.log.qn, game: c.T.id, pts: els.map(ctr) };
}; true
"""

# 스타일 GIF 결과 화면용 연출 값
STAGED_RESULT = """
(() => {
  const fill = { path: [9, 10, 2], symbol: [3, 3, 1], arith: [2, 3, 1], count: [3, 3, 1], fit: [2, 3, 1], seek: [3, 3, 2] };
  for (const [id, [c, t, l]] of Object.entries(fill)) Object.assign(App.stats[id], { plays: 1, correct: c, total: t, level: l, ms: t * 6500 });
  App.exScore = 2614; App.cogScore = 1288; App.score = App.exScore + App.cogScore;
  const m = App.meter; m.activeSec = 292; m.revs = 61 / 60 * 292; m.joules = Exercise.watts(61) * 292;
})(); true
"""


def autoplay(until, think=(0.7, 1.2), wrong=(), gap=0.3):
    """until 이 참이 될 때까지 문제마다 잠깐 생각한 뒤 정답을 누른다. wrong = 일부러 틀릴 (게임 id, 그 게임의 몇 번째 문제)"""
    last, seen = None, {}
    while not ev(f'!!({until})'):
        t = ev('window.__targets()')
        if t and t['q'] != last:
            seen[t['game']] = seen.get(t['game'], 0) + 1
            bad = (t['game'], seen[t['game']]) in wrong
            time.sleep(random.uniform(*think))
            t2 = ev(f'window.__targets({str(bad).lower()})')
            if t2 and t2['q'] == t['q']:
                for p in t2['pts']:
                    tap(*p)
                    time.sleep(gap)
            last = t['q']
        time.sleep(0.04)


def load_demo(theme):
    url = f'http://127.0.0.1:{PORT}/?demo&theme={theme}'
    goto(url)
    ev("localStorage.clear(); indexedDB.deleteDatabase('exergame-sessions'); Demo.leaving = true; true")
    goto(url)
    ev(PEDAL_CONNECTED)
    ev(TARGETS)
    ev("$('#op-station').value = 3; true")
    tap(*center('#op-close'))
    time.sleep(0.3)
    ev(PEDAL_CONNECTED)
    ev('Demo.leaving = true; true')  # 다음 페이지 이동 때 '나가시겠습니까?' 를 띄우지 않게


def record_flow():
    print('demo-flow')
    load_demo('clean')
    ev('App.cfg.calibrationSec = 6; App.cfg.durationSec = 55; App.cfg.rpmChangeSegmentSec = 14; App.cfg.shiftSec = 7; true')
    time.sleep(4.5)                       # 대기 화면 그래프가 움직이기 시작하도록
    rec.begin('flow')
    time.sleep(3)
    tap(*center('#att-start'))
    time.sleep(0.6)
    ev(PEDALING)
    wait("App.state === 'play'", 30)
    autoplay("App.state === 'result'", wrong={('symbol', 2)})
    time.sleep(5)
    x, y = center('#dr-next')             # 진행 요원이 길게 눌러 다음 참가자로
    drv.send('Input.dispatchTouchEvent', type='touchStart', touchPoints=[{'x': x, 'y': y}])
    time.sleep(2.3)
    drv.send('Input.dispatchTouchEvent', type='touchEnd', touchPoints=[])
    ev('__ped.on = false; true')
    time.sleep(2.2)
    rec.pause()
    write_gif('demo-flow', clip('flow'))


def record_style(theme):
    print('style', theme)
    load_demo(theme)
    ev("App.cfg.calibrationSec = 3; App.cfg.games = ['count']; App.cfg.rpmChange = false; true")
    time.sleep(4.5)
    rec.begin(f'{theme}:attract')
    time.sleep(2.6)
    rec.pause()
    tap(*center('#att-start'))
    time.sleep(0.4)
    ev(PEDALING)
    wait("document.querySelector('#cog .intro .name')", 30)  # 게임 소개 화면
    time.sleep(0.9)
    rec.begin(f'{theme}:game')
    autoplay("document.querySelector('.perfect')", think=(0.8, 1.0))
    time.sleep(1.3)
    rec.pause()
    ev(STAGED_RESULT)
    ev("App.endRound('operator'); true")
    time.sleep(0.15)
    rec.begin(f'{theme}:result')
    time.sleep(3.6)
    rec.pause()
    ev('__ped.on = false; true')


try:
    drv.send('Page.enable')
    drv.send('Runtime.enable')
    for c in (drv, cap):
        c.send('Emulation.setDeviceMetricsOverride', width=W, height=H, deviceScaleFactor=1, mobile=False)
    drv.send('Emulation.setTouchEmulationEnabled', enabled=True, maxTouchPoints=5)
    drv.send('Page.addScriptToEvaluateOnNewDocument', source=TAP_RIPPLE)
    rec.start()
    if 'flow' in WHICH:
        record_flow()
    if 'styles' in WHICH:
        for th in THEMES:
            record_style(th)
        tour = []
        for th in THEMES:
            write_gif(f'style-{th}', clip(f'{th}:attract') + clip(f'{th}:game') + clip(f'{th}:result'))
            tour += clip(f'{th}:game', start=-4.6) + clip(f'{th}:result', end=2.2)
        write_gif('styles-tour', tour)
finally:
    rec.done = True
    try: drv.send('Browser.close')
    except Exception: pass
    proc.kill()
    srv.shutdown()
    shutil.rmtree(WORK, ignore_errors=True)
    shutil.rmtree(profile, ignore_errors=True)
