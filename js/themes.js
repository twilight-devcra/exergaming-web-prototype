// 화면 스타일. 색·글꼴·모양은 css/themes.css 의 body[data-theme] 가 맡고,
// 여기서는 캔버스에 그리는 속도 띠(band)와 연출 효과(fx, js/fx.js)를 정한다.
// 고른 스타일은 태블릿에 저장되고 테스트 화면과 시연 모드가 함께 쓴다. ?theme=neon 처럼 주소로도 고를 수 있다.
const THEMES = [
  { id: 'clean', name: '기본', band: {}, fx: {} },
  // dark = 어두운 배경. 어두운 그림(달)을 밝게 바꾸고 그림 둘레에 옅은 빛을 둘러 잘 보이게 한다
  { id: 'neon', name: '아케이드 네온', dark: true, band: { glow: 16 }, fx: { burst: 'glow', confetti: 'glow', shake: 7 } },
  { id: 'sporty', name: '스포츠', band: { speedLines: true }, fx: { burst: 'streak', confetti: 'paper', shake: 6 } },
  { id: 'cartoon', name: '카툰', band: { outline: 3 }, fx: { burst: 'star', confetti: 'star', shake: 0 } },
  { id: 'pixel', name: '레트로 픽셀', dark: true, band: { pixel: 3 }, fx: { burst: 'pixel', confetti: 'pixel', shake: 5 } },
];

const Theme = {
  KEY: 'exergame.theme',
  current: THEMES[0],

  init() {
    let saved = null;
    try { saved = localStorage.getItem(this.KEY); } catch (e) {}
    const id = new URLSearchParams(location.search).get('theme') || saved;
    this.apply(id, false);
    document.querySelectorAll('select[data-theme-picker]').forEach((sel) => {
      sel.innerHTML = THEMES.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');
      sel.value = this.current.id;
      sel.onchange = () => this.apply(sel.value);
    });
    // 글꼴이 늦게 도착하면 캔버스 글자를 다시 그린다
    if (document.fonts) document.fonts.ready.then(() => App.band.draw());
  },

  apply(id, save = true) {
    const t = THEMES.find((x) => x.id === id) || THEMES[0];
    this.current = t;
    document.body.dataset.theme = t.id;
    document.body.classList.toggle('theme-dark', !!t.dark);
    App.band.setLook(t.band);
    Fx.setStyle(t.fx);
    if (save) {
      try { localStorage.setItem(this.KEY, t.id); } catch (e) {}
    }
    document.querySelectorAll('select[data-theme-picker]').forEach((sel) => (sel.value = t.id));
  },

  // 테스트 화면에서 T 키: 다음 스타일로 (게임 도중에도 바꿔 볼 수 있다)
  next() {
    const i = THEMES.indexOf(this.current);
    this.apply(THEMES[(i + 1) % THEMES.length].id);
    const el = $('#toast');
    el.textContent = `스타일: ${this.current.name}`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  },
};
