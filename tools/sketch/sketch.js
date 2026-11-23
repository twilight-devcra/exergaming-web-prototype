// 미니게임 초안(스케치) 도구. 코드를 쓰기 전에 게임 판을 진짜 앱 화면 안에 그려 보고, 손으로 짠 문제로 눌러 본다.
// 쓰는 법은 tools/sketch/README.md. 게임 코드(js/)는 바꾸지 않고, 앱의 css 와 모양(SYMBOLS, Util)을 그대로 빌려 쓴다.
//
//   Sketch.page({ title, notes, groups: [{ title, notes, device, shots: [{ id, caption, device, render(stage) }] }] })
//     목업 페이지 (2단계). 각 shot 은 기기(device) 화면 하나: 위는 풍경 카드 자리, 아래는 게임 카드.
//     device = 'tablet'(1280×800, 기본) | 'phone'(390×844) | 'phone-small'(360×640). shot 에 없으면 group 의 것을 쓴다.
//     render(stage) 는 진짜 게임처럼 stage(.stage) 안에 그린다 (Sketch.frame 으로 머리 줄을 단다).
//     목록의 화면은 저마다 그 기기 크기의 iframe(?shot=<id>)이라 앱 css 의 휴대폰 규칙(@media max-width)과 vh 가 진짜처럼 먹는다.
//     화면 이름을 누르면 그 화면 하나만 창 크기로 연다 (태블릿·휴대폰에서 직접 확인할 때).
//
//   Sketch.play(GameClass, { level, puzzles })
//     눌러 보는 스케치 (3단계). 진짜 게임과 같은 모양의 host 를 주고 판을 끝없이 이어서 돌린다.
//     게임 시계·제한 시간 막대·점수는 흉내만 낸다. 기록(question/answer)은 콘솔에 찍는다.
//     제한 시간은 진짜처럼 host.timer(load) 로 받고, GameClass.questionTime = { base, per } (나중에 js/config.js 로 옮길 값)로 초를 셈한다.
import { Util, EASY_TIME } from '../../js/config.js';
import { SYMBOLS } from '../../js/games/symbol.js';
import { Diagram } from '../../js/diagram.js';

export { Util, SYMBOLS, Diagram };

// 앱이 맞추는 기기. 휴대폰 크기는 app/app.css · css/style.css 의 '휴대폰'(max-width: 600px) 규칙이 먹는 크기
export const DEVICES = {
  tablet: { width: 1280, height: 800, label: '태블릿 1280×800' },          // 체육관 태블릿
  phone: { width: 390, height: 844, label: '휴대폰 390×844' },             // 흔한 세로 휴대폰
  'phone-small': { width: 360, height: 640, label: '작은 휴대폰 360×640' }, // 키가 작은 휴대폰 (max-height: 720px 규칙도 먹는다)
};
export const SCREEN = DEVICES.tablet;

const element = (tag, cls, html) => Util.element(tag, cls, html);

// 앱 게임 화면 하나 (#game: 풍경 카드 자리 + 게임 카드 #cog). 진짜 앱과 같은 id·class 라 app.css 가 그대로 먹는다.
// 한 페이지에 여러 개를 두므로 id 가 겹치지만, 그리기만 하는 페이지라 괜찮다.
function screen(parent) {
  const root = element('div', 'sk-screen');
  root.innerHTML = '<section id="game" class="screen active"><div id="band"><div class="sk-band">풍경 카드 (속도)</div></div><div id="cog"></div></section>';
  parent.append(root);
  const stage = element('div', 'stage');
  root.querySelector('#cog').append(stage);
  return { root, stage };
}

// 목록의 화면 하나: 그 기기 크기의 iframe 을 칸 너비에 맞게 줄인다 (--k)
function framedShot(parent, shot, device) {
  const { width, height } = DEVICES[device];
  const viewport = element('div', 'sk-viewport');
  viewport.style.aspectRatio = `${width} / ${height}`;
  const frame = element('iframe');
  frame.src = shotUrl(shot.id);
  frame.loading = 'lazy';
  frame.width = width;
  frame.height = height;
  viewport.append(frame);
  parent.append(viewport);
  const fit = () => viewport.style.setProperty('--k', viewport.clientWidth / width);
  new ResizeObserver(fit).observe(viewport);
  fit();
}

const shotUrl = (id) => `${location.pathname}?shot=${encodeURIComponent(id)}`;

export const Sketch = {
  SYMBOLS,
  symbol: (id) => SYMBOLS.find((symbol) => symbol.id === id),
  // 그림 하나 (100×100 svg). cls 로 크기를 정한다
  glyph(id, cls = 'sk-glyph') {
    return `<svg class="${cls}" viewBox="0 0 100 100">${Sketch.symbol(id).svg}</svg>`;
  },

  // 진짜 게임의 머리 줄 (게임 이름 · 진행 점 · 안내 문구). kind = look | act | good | bad | ''
  frame(stage, title, message = '', kind = '', rounds = 0) {
    const messageBox = element('div', 'stage-msg');
    const { body, dots } = Util.frame(stage, title, messageBox, rounds);
    Util.say(messageBox, message, kind);
    return { body, dots, message: messageBox };
  },

  // 게임 소개 화면 (진짜는 main.js 의 intro). steps = diagram() 이 돌려주는 [{ svg, caption }, …]. stage 자리를 소개로 바꾼다
  intro(stage, { tag = '새 게임', name, steps, hint }) {
    const intro = element('div', 'intro');
    intro.innerHTML = `<div class="tag">${tag}</div><div class="name">${name}</div>
      ${Diagram.render({ diagram: () => steps })}
      <div class="hint">${hint}</div><div class="skip">화면을 누르면 바로 시작합니다</div>`;
    stage.replaceWith(intro);
  },

  page({ title, notes = '', groups }) {
    document.title = `${title} · 스케치`;
    const wanted = new URLSearchParams(location.search).get('shot');
    const all = groups.flatMap((group) => group.shots.map((shot) => ({ ...shot, device: shot.device || group.device || 'tablet' })));
    // tools/sketch/shoot.js 가 읽는다: 찍을 화면과 기기 크기
    window.SKETCH_SHOTS = all.map((shot) => ({ id: shot.id, ...DEVICES[shot.device] }));
    if (wanted) {
      const shot = all.find((candidate) => candidate.id === wanted);
      document.body.classList.add('sk-single');
      if (!shot) return void (document.body.textContent = `shot '${wanted}' 이 없습니다`);
      const { root, stage } = screen(document.body);
      root.classList.add('sk-full');
      shot.render(stage);
      if (window === window.top) {
        const back = element('a', 'sk-back', '← 모두 보기');
        back.href = location.pathname;
        document.body.append(back);
      }
      return;
    }
    const main = element('main', 'sk-page');
    main.append(element('h1', '', title));
    if (notes) main.append(element('div', 'sk-notes', notes));
    for (const group of groups) {
      const section = element('section', 'sk-group');
      section.append(element('h2', '', group.title));
      if (group.notes) section.append(element('div', 'sk-notes', group.notes));
      const grid = element('div', `sk-grid ${(group.device || 'tablet').startsWith('phone') ? 'phone' : ''}`);
      for (const shot of all.filter((candidate) => group.shots.some((own) => own.id === candidate.id))) {
        const figure = element('figure', 'sk-shot');
        grid.append(figure);
        framedShot(figure, shot, shot.device);
        const size = shot.device === 'tablet' ? '' : ` <small>${DEVICES[shot.device].label}</small>`;
        figure.append(element('figcaption', '', `<a href="${shotUrl(shot.id)}" title="이 화면만 창 크기로">${shot.id}</a>${size} ${shot.caption || ''}`));
      }
      section.append(grid);
      main.append(section);
    }
    document.body.append(main);
  },

  // ---------- 3단계: 눌러 보는 스케치 ----------
  // GameClass 는 진짜 게임과 같은 모양(constructor(host), start(), abort())이면 된다. 판이 끝나면 다음 판을 연다.
  // 화면 아래에 레벨 고르기를 둔다. ?level=N 으로 시작 레벨을 정할 수 있다.
  play(GameClass, { levels = GameClass.maxLevel || 8 } = {}) {
    document.body.classList.add('sk-single');
    const params = new URLSearchParams(location.search);
    let level = Number(params.get('level')) || 1;
    let current = null;
    let generation = 0;
    const { root } = screen(document.body);
    root.classList.add('sk-full');
    const cog = root.querySelector('#cog');
    const bar = element('div', 'sk-bar');
    bar.innerHTML = `${GameClass.title || ''} · 레벨 ${[...Array(levels).keys()].map((i) => `<button data-level="${i + 1}">${i + 1}</button>`).join('')} <span class="sk-score"></span>`;
    document.body.append(bar);
    const score = { games: 0, cleared: 0 };
    const showScore = () => (bar.querySelector('.sk-score').textContent = `판 ${score.games} · 다 맞힘 ${score.cleared}`);

    const begin = () => {
      generation++;
      const mine = generation;
      current?.abort?.();
      cog.innerHTML = '';
      const stage = element('div', 'stage');
      cog.append(stage);
      bar.querySelectorAll('button').forEach((button) => button.classList.toggle('on', Number(button.dataset.level) === level));
      const start = performance.now();
      const host = {
        stage, level, multiplier: 1, startClock: 0, base: 100,
        after: (delayMs, callback) => setTimeout(() => mine === generation && callback(), delayMs),
        now: () => performance.now() - start,
        timer: (load, onOut) => {
          const { base, per } = GameClass.questionTime || { base: 6, per: 1 };
          const seconds = (base + per * load) * (level <= EASY_TIME.length ? EASY_TIME[level - 1] : 1);
          Sketch.timer(stage, seconds, () => mine === generation && onOut());
        },
        stopTimer: () => Sketch.timer(stage, 0),
        question: (data) => console.log('question', data),
        open: () => {},
        input: (data) => console.log('input', data),
        answer: (data) => console.log('answer', data),
        sfx: () => {},
        award: () => {},
        done: (result) => {
          console.log('done', result);
          score.games++;
          if (result.cleared) score.cleared++;
          showScore();
          setTimeout(() => mine === generation && begin(), 900);
        },
      };
      current = new GameClass(host);
      current.start();
    };
    bar.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-level]');
      if (!button) return;
      level = Number(button.dataset.level);
      begin();
    });
    showScore();
    begin();
  },

  // 문제 제한 시간 막대 (진짜는 main.js startQuestionTimer · updateQuestionTimer). seconds = 0 이면 그 자리에 멈춘다
  timer(stage, seconds, onOut) {
    cancelAnimationFrame(stage.skTimer);
    let bar = stage.querySelector('.qtimer');
    if (!seconds) {
      bar?.classList.add('stopped');
      return;
    }
    if (!bar) {
      bar = element('div', 'qtimer', '<i></i>');
      (stage.querySelector('.stage-msg') || stage).append(bar);
    }
    bar.className = 'qtimer on';
    const start = performance.now();
    const tick = () => {
      const remaining = Util.clamp(1 - (performance.now() - start) / (seconds * 1000), 0, 1);
      bar.firstChild.style.transform = `scaleX(${remaining})`;
      bar.classList.toggle('warn', remaining < 0.4);
      bar.classList.toggle('low', remaining < 0.18);
      if (remaining > 0) stage.skTimer = requestAnimationFrame(tick);
      else onOut();
    };
    tick();
  },
};
