// 지시 따르기
// 기계의 조작판. 판의 화면에 짧은 지시가 뜨고, 그대로 버튼을 누르거나 스위치를 켠다. 한 게임에 지시 3개.
// 조작판 (단계마다 줄이 늘어난다. 지시마다 그림 배치는 새로 섞는다):
//   램프   — A·B·C 글자가 쓰인 불. 켜져 있으면 밝게 빛난다 (있으면·없으면 지시에서만 켜진다)
//   스위치 — 1·2·3… 번호판이 붙은 스위치. 누르면 위로 올라가 켜진다 (ON). 한 번 켜면 끄지 않는다
//   버튼   — 그림이 그려진 둥근 버튼
// 조작마다 이름 붙이는 방법이 다르다 (버튼은 그림 · 스위치는 번호 · 램프는 글자). 모두 그림이면
// "별 스위치" 를 읽고 별 버튼을 누르는 식으로 헷갈린다 (2026-10-30 시연 의견).
// 지시 종류 (kind):
//   one — "별 버튼을 누르세요"
//   sw  — "2번, 4번 스위치를 켜세요" (sw 개. 순서는 상관없다)
//   seq — "세모 → 별 → 달 버튼을 차례로 누르세요" (steps 개, 순서대로)
//   rel — "별 바로 오른쪽 버튼을 누르세요"
//   if  — "A 램프가 켜져 있으면 세모, 꺼져 있으면 하트 버튼을 누르세요" (램프는 저마다 반쯤만 켜진다)
//   chain — 지시 여러 개(chain 개)가 화면에 하나씩 차례로 뜨고, 뒤의 지시가 앞에서 한 조작을 가리킨다:
//           "별 버튼을 누르세요" → "방금 누른 버튼 바로 오른쪽 버튼을 누르세요" → "맨 처음 누른 버튼을 한 번 더 누르세요"
//           맞게 조작한 표시는 잠깐 보였다가 지워진다 (무엇을 눌렀는지 판을 보고 알 수 없게). 지시 전체가 답 하나다
// 한 번 잘못 누르면 그 지시는 틀린 것으로 끝내고 정답을 보여 준다. 지시 하나가 답 하나다 (난이도 계기판·연속 정답).
// 버튼 그림은 심볼 위치 외우기의 SYMBOLS 를 쓴다 (모양마다 색이 달라 색만으로 가리지 않는다). 마름모는 빼서 네모와 헷갈리지 않게 한다.
// 램프는 색이 아니라 밝기와 빛 번짐, 그리고 '켜짐' 글자로 켜진 것을 알린다.
// 난이도:
//   buttons · switches · lamps — 조작판의 버튼·스위치·램프 수 (0 이면 그 줄이 없다)
//   kinds — 이 단계에서 나오는 지시 종류. 한 게임 안에서는 되도록 서로 다른 종류를 낸다
//   sw    — sw 지시의 켤 스위치 수 · steps — seq 의 누를 버튼 수 · chain — chain 지시의 단계 수
//   hide  — 처음 조작하면 화면이 꺼진다 (여러 번 조작하는 지시는 외워서 해야 한다)
const FOLLOW_NAMES = { circle: '동그라미', square: '네모', triangle: '세모', star: '별', plus: '십자', moon: '달', heart: '하트' };
const FOLLOW_SHAPES = SYMBOLS.filter((s) => FOLLOW_NAMES[s.id]);
const FOLLOW_LAMPS = ['A', 'B', 'C'];

class FollowGame {
  static id = 'follow';
  static tags = ['order']; // 꼬리표가 겹치는 게임끼리는 연달아 나오지 않는다 (main.js planPass)
  static title = '지시 따르기';
  static hint = '조작판 화면에 나온 지시대로<br>버튼을 누르고 스위치를 켜세요';
  static levels = [
    // 쉬운 단계: 버튼 하나만 찾아 누른다
    { buttons: 3, switches: 0, lamps: 0, kinds: ['one'] },
    { buttons: 4, switches: 3, lamps: 0, kinds: ['one', 'sw'], sw: 1 },
    { buttons: 5, switches: 3, lamps: 0, kinds: ['one', 'sw', 'seq'], sw: 2, steps: 2 },
    { buttons: 5, switches: 4, lamps: 0, kinds: ['sw', 'seq', 'rel'], sw: 2, steps: 2 },
    // 램프가 들어온다
    { buttons: 6, switches: 0, lamps: 2, kinds: ['seq', 'rel', 'if'], steps: 2 },
    // 앞의 조작을 가리키는 이어진 지시가 들어온다 (Lv6 두 단계 · Lv7 부터 세 단계, '맨 처음' 을 가리킬 수 있다)
    { buttons: 6, switches: 4, lamps: 3, kinds: ['seq', 'if', 'sw', 'chain'], sw: 3, steps: 3, chain: 2 },
    { buttons: 7, switches: 5, lamps: 3, kinds: ['seq', 'if', 'chain'], sw: 3, steps: 3, chain: 3 },
    { buttons: 7, switches: 5, lamps: 3, kinds: ['chain', 'chain', 'if', 'seq'], sw: 3, steps: 3, chain: 3, hide: true },
  ];
  static maxLevel = FollowGame.levels.length;
  static QUESTIONS = 3;
  static STEP_MS = 450;   // 이어진 지시: 맞게 조작한 표시를 보여 주는 시간. 그 뒤 표시를 지우고 다음 단계를 띄운다
  // 조작판은 버튼 수에 맞춘 너비(px)로 그리고, 판 크기에 맞춰 통째로 줄이거나 키운다
  static panelWidth(buttons) {
    return Math.max(760, buttons * 142 + 80);
  }

  // 소개 그림: ① 화면의 지시를 읽고 ② 그대로 누른다
  static diagram() {
    const sym = (id) => SYMBOLS.find((s) => s.id === id).svg;
    const ids = ['triangle', 'star', 'heart'];
    const panel = (tap) => '<rect class="dg-cp" x="4" y="4" width="160" height="104" rx="12"/>' +
      '<rect class="dg-cp-screen" x="16" y="14" width="136" height="32" rx="6"/>' +
      Dg.text(84, 31, '별 버튼을 누르세요', 13, 'dg-cp-txt') +
      ids.map((id, i) => `<circle class="dg-cp-btn" cx="${40 + i * 44}" cy="78" r="17"/>` + Dg.glyph(sym(id), 40 + i * 44, 78, 20)).join('') +
      (tap ? Dg.tap(84, 78, 22) : '');
    return [
      { svg: Dg.svg('0 0 168 112', panel(false)), caption: '화면의 지시를 읽고' },
      { svg: Dg.svg('0 0 168 112', panel(true)), caption: '그대로 누르기' },
    ];
  }

  constructor(host) {
    this.h = host;
    this.spec = FollowGame.levels[host.level - 1];
    this.answered = 0;
    this.correct = 0;
    this.phase = 'wait';
    // 지시 종류: 한 게임 안에서 되도록 겹치지 않게
    const kinds = U.shuffle([...this.spec.kinds]);
    this.kinds = [...Array(FollowGame.QUESTIONS).keys()].map((i) => kinds[i % kinds.length]);
  }

  start() {
    const { stage, level } = this.h;
    const { buttons, switches, lamps } = this.spec;
    this.msg = U.el('div', 'stage-msg act', '지시대로 조작하세요');
    const { body, dots } = U.frame(stage, `${FollowGame.title} · Lv.${level}`, this.msg, FollowGame.QUESTIONS);
    this.body = body;
    this.progress = dots;
    this.wrap = U.el('div', 'cp-wrap');
    this.panel = U.el('div', 'cp-panel');
    this.panel.style.width = `${FollowGame.panelWidth(buttons)}px`;
    this.screen = U.el('div', 'cp-screen');
    this.panel.append(this.screen);

    // 조작 하나 = { el, face(그림 자리), tag(✓·✕·순서 표시) }. id: b0.. 버튼 · s0.. 스위치 · l0.. 램프
    // 램프와 스위치는 한 줄에 나란히 둔다 (조작판이 너무 높아지지 않게)
    this.ctrls = {};
    const mid = U.el('div', 'cp-mid');
    const row = (cls, n, prefix, make, into = this.panel) => {
      if (!n) return;
      const r = U.el('div', `cp-row ${cls}`);
      for (let i = 0; i < n; i++) {
        const c = make(i);
        c.tag = U.el('span', 'cp-tag');
        c.el.append(c.tag);
        if (prefix !== 'l') c.el.addEventListener('pointerdown', () => this.pick(prefix + i));
        r.append(c.el);
        this.ctrls[prefix + i] = c;
      }
      into.append(r);
    };
    // 램프 글자와 스위치 번호는 늘 그 자리에 있다 (지시마다 바뀌는 것은 버튼 그림과 램프의 켜짐뿐)
    row('cp-lamps', lamps, 'l', (i) => {
      const el = U.el('div', 'cp-lamp', `<div class="cp-bulb">${FOLLOW_LAMPS[i]}</div><span class="cp-state">꺼짐</span>`);
      return { el, face: el.firstChild, state: el.querySelector('.cp-state') };
    }, mid);
    row('cp-switches', switches, 's', (i) => {
      const el = U.el('div', 'cp-switch', `<span class="cp-on">ON</span><div class="cp-track"><i></i></div><div class="cp-plate">${i + 1}</div>`);
      return { el, face: el.querySelector('.cp-plate') };
    }, mid);
    if (mid.children.length) this.panel.append(mid);
    row('cp-buttons', buttons, 'b', () => {
      const el = U.el('div', 'cp-btn', '<div class="cp-cap"></div>');
      return { el, face: el.firstChild };
    });
    this.wrap.append(this.panel);
    body.append(this.wrap);
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(body);
    this.layout();
    this.h.after(250, () => this.ask());
  }

  // 조작판을 판 자리에 맞춰 통째로 줄이거나 키운다 (버튼이 가장 작을 때도 56px 은 넘는다)
  layout() {
    const s = this.body;
    const w = this.panel.offsetWidth;
    const h = this.panel.offsetHeight;
    const k = U.clamp(Math.min((s.clientWidth - 24) / w, (s.clientHeight - 8) / h), 0.55, 1.2);
    this.panel.style.transform = `scale(${k})`;
    this.wrap.style.width = `${w * k}px`;
    this.wrap.style.height = `${h * k}px`;
  }

  ask() {
    const q = FollowGame.make(this.kinds[this.answered], this.spec);
    this.q = q;
    this.done = [];   // 맞게 조작한 것 (조작한 순서)
    const pic = (s) => `<svg viewBox="0 0 100 100">${s.svg}</svg>`;
    q.buttons.forEach((s, i) => this.reset(`b${i}`, pic(s)));
    q.switches.forEach((_, i) => this.reset(`s${i}`));
    q.lamps.forEach((on, i) => {
      const c = this.reset(`l${i}`);
      c.el.classList.toggle('on', on);
      c.state.textContent = on ? '켜짐' : '꺼짐';
    });
    this.step = 0;
    this.show(q.steps ? q.steps[0].html : q.html);
    U.say(this.msg, '지시대로 조작하세요', 'act');
    [...this.progress.children].forEach((d, i) => d.classList.toggle('cur', i === this.answered));
    this.panel.classList.add('live');
    this.phase = 'input';
    this.h.sfx('blink');
    this.h.question({
      n: this.answered + 1, kind: q.kind, text: q.text,
      buttons: q.buttons.map((s) => s.id), switches: q.switches.length, lamps: q.lamps,
      answer: q.answer, ordered: q.ordered,
    });
    this.h.timer(q.load, () => this.finishQ(false, true));
  }

  // 화면에 지시를 띄운다. 이어진 지시는 몇 번째 단계인지도 귀퉁이에 보인다
  show(html) {
    const { steps } = this.q;
    // 한 덩어리로 감싸야 flex 안에서 띄어쓰기·줄바꿈이 살아 있다
    this.screen.innerHTML = `<span>${html}</span>` + (steps ? `<small class="cp-step">${this.step + 1} / ${steps.length}</small>` : '');
    this.screen.classList.remove('off', 'flash');
    void this.screen.offsetWidth;   // 같은 화면에 이어서 띄울 때도 번쩍임이 다시 보이게
    this.screen.classList.add('flash');
  }

  // 조작 하나를 처음 상태로 되돌린다 (표시·켜짐을 지운다). svg 를 주면 그림도 바꾼다 (버튼)
  reset(id, svg) {
    const c = this.ctrls[id];
    c.el.className = c.el.className.split(' ')[0];
    if (svg) c.face.innerHTML = svg;
    c.tag.textContent = '';
    c.tag.className = 'cp-tag';
    return c;
  }

  // id = 누른 버튼(b0..)·스위치(s0..). 이미 맞게 조작한 것은 무시한다 (이어진 지시는 같은 버튼을 다시 누를 수 있다)
  pick(id) {
    if (this.phase !== 'input') return;
    if (this.q.steps) return this.pickStep(id);
    if (this.done.includes(id)) return;
    const { answer, ordered } = this.q;
    const ok = ordered ? answer[this.done.length] === id : answer.includes(id);
    this.h.input({ ctrl: id, correct: ok });
    if (this.spec.hide) this.screen.classList.add('off');
    const c = this.ctrls[id];
    c.el.classList.add(id[0] === 's' ? 'flipped' : 'pressed');
    if (!ok) {
      c.el.classList.add('wrong');
      this.mark(c, '✕', 'wrong');
      return this.finishQ(false, false);
    }
    this.done.push(id);
    c.el.classList.add('right');
    this.mark(c, ordered && answer.length > 1 ? String(this.done.length) : '✓', 'right');
    if (this.done.length === answer.length) this.finishQ(true, false);
    else this.h.sfx('blink');
  }

  // 이어진 지시의 한 단계. 맞으면 표시를 잠깐 보인 뒤 지우고 (켠 스위치는 켜진 채로 둔다) 다음 단계를 띄운다
  pickStep(id) {
    const c = this.ctrls[id];
    if (id[0] === 's' && c.el.classList.contains('flipped')) return;
    const ok = this.q.steps[this.step].answer === id;
    this.h.input({ ctrl: id, step: this.step + 1, correct: ok });
    c.el.classList.add(id[0] === 's' ? 'flipped' : 'pressed');
    if (!ok) {
      c.el.classList.add('wrong');
      this.mark(c, '✕', 'wrong');
      return this.finishQ(false, false);
    }
    this.done.push(id);
    c.el.classList.add('right');
    this.mark(c, '✓', 'right');
    if (++this.step === this.q.steps.length) return this.finishQ(true, false);
    this.h.sfx('blink');
    this.phase = 'step';
    this.h.after(FollowGame.STEP_MS, () => {
      if (this.phase !== 'step') return;
      c.el.classList.remove('right', 'pressed');
      this.mark(c, '', '');
      this.show(this.q.steps[this.step].html);
      this.phase = 'input';
    });
  }

  mark(c, text, cls) {
    c.tag.textContent = text;
    c.tag.className = `cp-tag${cls ? ` ${cls}` : ''}`;
  }

  // 지시 하나를 끝낸다. 틀렸으면 아직 안 한 정답 조작을 보여 준다 (순서가 있으면 번호도)
  finishQ(ok, timedOut) {
    if (this.phase !== 'input' && this.phase !== 'step') return;
    this.phase = 'wait';
    this.h.stopTimer();
    this.h.answer({ picked: [...this.done], correct: ok, timedOut });
    this.panel.classList.remove('live');
    this.screen.classList.remove('off');
    if (ok) {
      this.correct++;
      U.say(this.msg, '정답!', 'good');
      this.h.award((this.h.base * this.h.mult) / FollowGame.QUESTIONS, this.ctrls[this.done[this.done.length - 1]].el);
      this.h.sfx('good');
    } else if (this.q.steps) {
      // 이어진 지시는 지금 단계의 정답만 보여 준다 (화면도 그 단계 그대로)
      const id = this.q.steps[this.step].answer;
      this.ctrls[id].el.classList.add('reveal');
      this.mark(this.ctrls[id], '●', 'reveal');
      U.say(this.msg, timedOut ? '시간 초과 · 정답은 이것이었어요' : '정답은 이것이었어요', 'bad');
      this.h.sfx('bad');
    } else {
      const { answer, ordered } = this.q;
      answer.forEach((id, k) => {
        if (this.done.includes(id)) return;
        this.ctrls[id].el.classList.add('reveal');
        this.mark(this.ctrls[id], ordered && answer.length > 1 ? String(k + 1) : '●', 'reveal');
      });
      U.say(this.msg, timedOut ? '시간 초과 · 정답은 이것이었어요' : '정답은 이것이었어요', 'bad');
      this.h.sfx('bad');
    }
    const d = this.progress.children[this.answered];
    d.classList.remove('cur');
    d.classList.add(ok ? 'right' : 'wrong');
    this.answered++;
    this.h.after(ok ? 700 : 1400, () => {
      if (this.answered >= FollowGame.QUESTIONS) return this.finish();
      this.ask();
    });
  }

  finish() {
    this.phase = 'end';
    this.ro.disconnect();
    this.h.done(this.result());
  }

  result() {
    return { cleared: this.correct === FollowGame.QUESTIONS, correct: this.correct, total: FollowGame.QUESTIONS };
  }

  // 점수는 맞힐 때마다 바로 지급하므로 중단될 때 따로 줄 것이 없다
  abort() {
    this.phase = 'end';
    this.ro.disconnect();
    return { cleared: false, correct: this.correct, total: this.answered };
  }

  // ---- 지시 만들기 ----
  // 버튼 그림은 지시마다 새로 섞는다 (겹치지 않는다). 스위치는 1번부터 번호 순, 램프는 A 부터 글자 순으로 늘 같은 자리다.
  // 반환: { kind, buttons(그림들), switches(스위치마다 켤지 [false…]), lamps(램프마다 켜짐 [true/false…]), answer(조작 id 들),
  //         ordered, text(기록용 글), html(화면용), load(제한 시간의 일의 양) }
  // load — one 1 · sw/seq 조작 수 · rel 2 · if 3 · chain 단계 수 + 1 (읽을 것이 많을수록 길게)
  // chain 은 steps([{ html, answer }])도 돌려준다 (화면에 하나씩 띄운다)
  static make(kind, { buttons: nb, switches: ns, lamps: nl, sw = 1, steps = 2, chain = 2 }) {
    const pick = (n) => U.shuffle([...FOLLOW_SHAPES]).slice(0, n);
    const buttons = pick(nb);
    const switches = Array(ns).fill(false);
    const lamps = Array(nl).fill(false);
    const name = (s) => `<b>${FOLLOW_NAMES[s.id]}</b>`;
    const order = U.shuffle([...Array(nb).keys()]);   // 버튼을 고를 때 쓰는 무작위 순서
    let answer;
    let ordered = false;
    let html;
    let load;

    if (kind === 'one') {
      answer = [`b${order[0]}`];
      html = `${name(buttons[order[0]])} 버튼을 누르세요`;
      load = 1;
    } else if (kind === 'sw') {
      const on = U.shuffle([...Array(ns).keys()]).slice(0, sw).sort((a, b) => a - b);
      answer = on.map((i) => `s${i}`);
      on.forEach((i) => (switches[i] = true));
      html = `${on.map((i) => `<b>${i + 1}번</b>`).join(', ')} 스위치를 켜세요`;
      load = sw;
    } else if (kind === 'seq') {
      const pressed = order.slice(0, steps);
      answer = pressed.map((i) => `b${i}`);
      ordered = true;
      html = `${pressed.map((i) => name(buttons[i])).join(' → ')} 버튼을<br>차례로 누르세요`;
      load = steps;
    } else if (kind === 'rel') {
      const at = order[0];
      const dirs = [at > 0 && [-1, '왼쪽'], at < nb - 1 && [1, '오른쪽']].filter(Boolean);
      const [d, word] = dirs[U.rand(dirs.length)];
      answer = [`b${at + d}`];
      html = `${name(buttons[at])} 바로 <u>${word}</u> 버튼을 누르세요`;
      load = 2;
    } else if (kind === 'chain') {
      const steps = FollowGame.chain(chain, buttons, ns).map(({ html, id }) => ({ html, answer: id }));
      const text = steps.map((st) => st.html.replace(/<[^>]+>/g, '')).join(' / ');
      return { kind, buttons, switches, lamps, steps, answer: steps.map((st) => st.answer), ordered: true, text, html: steps[0].html, load: chain + 1 };
    } else {
      // if: 램프마다 반쯤 켜고, 그 가운데 하나를 조건으로 삼는다
      lamps.forEach((_, i) => (lamps[i] = Math.random() < 0.5));
      const cond = U.rand(nl);
      const [yes, no] = order;
      answer = [`b${lamps[cond] ? yes : no}`];
      html = `<b>${FOLLOW_LAMPS[cond]}</b> 램프가 <u>켜져 있으면</u> ${name(buttons[yes])},<br><u>꺼져 있으면</u> ${name(buttons[no])} 버튼을 누르세요`;
      load = 3;
    }
    const text = html.replace(/<br>/g, ' ').replace(/<[^>]+>/g, '');
    return { kind, buttons, switches, lamps, answer, ordered, text, html, load };
  }

  // 이어진 지시 n 단계. 첫 단계는 버튼이나 스위치 하나를 바로 가리키고, 그 뒤 단계는 되도록 앞의 조작을 가리킨다:
  //   방금 누른 버튼의 바로 옆 · 맨 처음 누른 버튼 (한 번 더 · 바로 옆) · 방금 켠 스위치의 다음 번호
  // 가리킬 수 있는 것이 없을 때(와 세 단계에서 가끔 둘째 단계)만 새 버튼·스위치를 바로 가리킨다. 세 단계 이상이면 '맨 처음' 을 가리키는 단계가 꼭 있게 한다.
  // 반환: [{ html, id }] (단계마다 화면 글과 정답 조작)
  static chain(n, buttons, ns) {
    const nb = buttons.length;
    const name = (i) => `<b>${FOLLOW_NAMES[buttons[i].id]}</b>`;
    const side = (i) => [i > 0 && [-1, '왼쪽'], i < nb - 1 && [1, '오른쪽']].filter(Boolean);
    for (;;) {
      const out = [];
      const hist = [];          // [{ t: 'b'|'s', i }]
      const on = new Set();     // 켠 스위치
      let refs = 0;
      for (let k = 0; k < n; k++) {
        const last = hist[k - 1];
        const first = hist[0];
        const opts = [];
        if (last && last.t === 'b') {
          for (const [d, w] of side(last.i)) opts.push({ id: `b${last.i + d}`, html: `<u>방금 누른</u> 버튼 바로 <u>${w}</u> 버튼을 누르세요` });
        }
        if (k >= 2 && first.t === 'b') {
          // '맨 처음' 은 바로 앞 단계와 다른 버튼일 때만 (방금 누른 것을 또 누르는 것은 너무 쉽다)
          const notLast = (i) => !(last.t === 'b' && last.i === i);
          if (notLast(first.i)) opts.push({ id: `b${first.i}`, html: '<u>맨 처음</u> 누른 버튼을 <u>한 번 더</u> 누르세요', w: 2 });
          for (const [d, w] of side(first.i)) {
            if (notLast(first.i + d)) opts.push({ id: `b${first.i + d}`, html: `<u>맨 처음</u> 누른 버튼 바로 <u>${w}</u> 버튼을 누르세요`, w: 2 });
          }
        }
        if (last && last.t === 's' && last.i + 1 < ns && !on.has(last.i + 1)) {
          opts.push({ id: `s${last.i + 1}`, html: '<u>방금 켠</u> 스위치의 <u>다음 번호</u> 스위치를 켜세요', w: 2 });
        }
        // 세 단계 이상이면 둘째 단계를 가끔 새 조작으로 둔다 — 셋째 단계의 '맨 처음' 을 다른 조작 너머로 기억해야 한다
        const fresh = n >= 3 && k === 1 && Math.random() < 0.4;
        let pick;
        if (opts.length && !fresh) {
          const pool = opts.flatMap((o) => Array(o.w || 1).fill(o));   // 무게(w)만큼 잘 뽑힌다
          pick = pool[U.rand(pool.length)];
          refs++;
        } else {
          // 새 스위치는 다음 번호가 남아 있는 것만 (다음 단계가 '다음 번호' 를 가리킬 수 있게)
          const free = [...Array(ns).keys()].filter((i) => !on.has(i) && i + 1 < ns && !on.has(i + 1));
          if (free.length && Math.random() < (fresh ? 0.6 : 0.35)) {
            const i = free[U.rand(free.length)];
            pick = { id: `s${i}`, html: `<b>${i + 1}번</b> 스위치를 켜세요` };
          } else {
            const avoid = last && last.t === 'b' ? last.i : -1;
            const cand = [...Array(nb).keys()].filter((i) => i !== avoid);
            const i = cand[U.rand(cand.length)];
            pick = { id: `b${i}`, html: `${name(i)} 버튼을 누르세요` };
          }
        }
        const t = pick.id[0];
        const i = +pick.id.slice(1);
        if (t === 's') on.add(i);
        hist.push({ t, i });
        out.push({ html: pick.html, id: pick.id });
      }
      if (refs && (n < 3 || out.some((o) => o.html.includes('맨 처음')))) return out;
    }
  }
}
