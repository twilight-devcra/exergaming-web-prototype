// 화면 스타일. 색·글꼴·모양은 css/themes.css 의 body[data-theme] 가 맡고,
// 여기서는 캔버스에 그리는 속도 띠(band)와 연출 효과(fx, js/fx.js)를 정한다.
// 고른 스타일은 태블릿에 저장되고 테스트 화면과 운영 버전이 함께 쓴다 (같은 주소에서 열 때). ?theme=neon 처럼 주소로도 고를 수 있다.
const THEMES = [
  { id: 'clean', name: '기본', band: {}, fx: {} },
  // dark = 어두운 배경. 어두운 그림(달)을 밝게 바꾸고 그림 둘레에 옅은 빛을 둘러 잘 보이게 한다
  { id: 'neon', name: '아케이드 네온', dark: true, band: { glow: 16 }, fx: { burst: 'glow', confetti: 'glow', shake: 7 } },
  { id: 'sporty', name: '스포츠', band: { speedLines: true }, fx: { burst: 'streak', confetti: 'paper', shake: 6 } },
  { id: 'cartoon', name: '카툰', band: { outline: 3 }, fx: { burst: 'star', confetti: 'star', shake: 0 } },
  { id: 'pixel', name: '레트로 픽셀', dark: true, band: { pixel: 3 }, fx: { burst: 'pixel', confetti: 'pixel', shake: 5 } },
  // 운영 버전(app/) 전용. 색·배치는 app/app.css 에 있다. 오답에 화면을 흔들지 않는다
  { id: 'scenic', name: '풍경 라이딩', app: true, band: { scenic: true }, fx: { burst: 'star', confetti: 'paper', shake: 0 } },
];

const Theme = {
  KEY: 'exergame.theme',
  current: THEMES[0],

  list: THEMES,

  init() {
    // 운영 버전은 자기 스타일 하나만 쓰고 저장하지 않는다 (프로토타입이 저장한 스타일을 건드리지 않게).
    // 프로토타입에서는 운영 버전 전용 스타일을 고를 수 없다
    const app = EDITION === 'app';
    this.list = THEMES.filter((t) => !!t.app === app);
    let saved = null;
    try { saved = localStorage.getItem(this.KEY); } catch (e) {}
    const id = app ? this.list[0].id : new URLSearchParams(location.search).get('theme') || saved;
    this.apply(id, false);
    document.querySelectorAll('select[data-theme-picker]').forEach((sel) => {
      sel.innerHTML = this.list.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');
      sel.value = this.current.id;
      sel.onchange = () => this.apply(sel.value);
    });
    // 글꼴이 늦게 도착하면 캔버스 글자를 다시 그린다
    if (document.fonts) document.fonts.ready.then(() => App.band.draw());
  },

  apply(id, save = true) {
    const t = this.list.find((x) => x.id === id) || this.list[0];
    this.current = t;
    document.body.dataset.theme = t.id;
    document.body.classList.toggle('theme-dark', !!t.dark);
    App.band.setLook(t.band);
    Fx.setStyle(t.fx);
    if (save && !t.app) {
      try { localStorage.setItem(this.KEY, t.id); } catch (e) {}
    }
    document.querySelectorAll('select[data-theme-picker]').forEach((sel) => (sel.value = t.id));
  },

  // 테스트 화면에서 T 키: 다음 스타일로 (게임 도중에도 바꿔 볼 수 있다)
  next() {
    const i = this.list.indexOf(this.current);
    this.apply(this.list[(i + 1) % this.list.length].id);
    const el = $('#toast');
    el.textContent = `스타일: ${this.current.name}`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  },
};
