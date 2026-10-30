// 지시 따르기
// 기계의 조작판. 판의 화면에 짧은 지시가 뜨고, 그대로 버튼을 누르거나 스위치를 켠다. 한 게임에 지시 3개.
// 조작판 (단계마다 줄이 늘어난다. 지시마다 그림 배치는 새로 섞는다):
//   램프   — A·B·C 글자가 쓰인 불. 켜져 있으면 밝게 빛난다 (있으면·없으면 지시에서만 켜진다)
//   스위치 — 1·2·3… 번호판이 붙은 스위치. 누르면 위로 올라가 켜진다 (ON). 한 번 켜면 끄지 않는다
//   버튼   — 그림이 그려진 둥근 버튼
// 조작마다 이름 붙이는 방법이 다르다 (버튼은 그림 · 스위치는 번호 · 램프는 글자). 모두 그림이면
// "별 스위치" 를 읽고 별 버튼을 누르는 식으로 헷갈린다 (2026-10-30 시연 의견).
// 지시 종류 (kind). 단계마다 kinds 에서 서로 다른 셋을 골라 낸다 (높은 단계일수록 고를 거리가 많다):
//   그림·자리   one "별 버튼" · edge "맨 왼쪽 버튼" · nth "오른쪽에서 세 번째 버튼" · rel "별 바로 오른쪽 버튼"
//               rel2 "별에서 왼쪽으로 두 칸 떨어진 버튼" · between "별과 하트 사이에 있는 버튼"
//   함정·횟수   not "별 버튼 말고 하트 버튼" · twice "별 버튼을 세 번" · countpress "켜진 램프 수만큼 별 버튼을"
//   스위치      sw "2번, 4번 스위치를 켜세요" · offall "꺼진 스위치를 모두" (몇 개는 처음부터 켜져 있다)
//               parity "짝수 번호 스위치를 모두" · countsw "켜진 램프 수와 같은 번호의 스위치"
//   조건        if "A 램프가 켜져 있으면 …, 꺼져 있으면 …" · ifand "A와 B 램프가 모두 …" · ifor "A나 C 램프 중 하나라도 …"
//               swif "2번 스위치가 켜져 있으면 …" · cmp "별이 하트보다 왼쪽에 있으면 …, 아니면 …"
//   차례·기억   seq "세모 → 별 버튼을 차례로" · reverse "… 순서를 거꾸로 해서" · mixed "3번 스위치를 켜고 별 버튼을"
//               chain — 지시 여러 개(chain 개)가 화면에 하나씩 차례로 뜨고, 뒤의 지시가 앞에서 한 조작을 가리킨다:
//                 "별 버튼을 누르세요" → "방금 누른 버튼 바로 오른쪽 버튼을 누르세요" → "맨 처음 누른 버튼을 한 번 더 누르세요"
//                 맞게 조작한 표시는 잠깐 보였다가 지워진다 (무엇을 눌렀는지 판을 보고 알 수 없게)
//   기다리기    go "B 램프가 켜지면 별 버튼을 누르세요" — 램프가 꺼진 채로 시작해 하나씩 켜진다. 그 전에 누르면 틀린다.
//               distract 개의 다른 램프가 먼저 켜진다. 제한 시간은 그 램프가 켜진 뒤부터 잰다
//   두 가지     compound "먼저 꺼진 스위치를 모두 켜세요 / 그다음 별 버튼을 두 번 누르세요" — 스위치 지시 하나와 버튼 지시 하나를
//               이어 붙인다 (답은 묶음 둘: 앞 묶음을 다 해야 뒤 묶음으로 넘어간다)
// 단계는 네 층으로 나뉜다: 쉬움(Lv1–2) 버튼 하나 · 보통(Lv3–4) 두 번 조작·함정 · 어려움(Lv5) 조건·세기·기다리기 ·
// 외워서(Lv6) 지시를 읽을 시간만큼만 보여 주고 화면을 끈 뒤에야 조작판이 풀린다 ·
// 전문가(Lv7–8) 어려운 지시만, 두 가지 지시 · 세 단계 이어진 지시 · 짧은 제한 시간. 읽는 동안에는 조작판에 덮개가 내려와
// 무엇을 누를지 미리 찾아 둘 수 없다 (2026-10-30 시연 의견: 높은 단계를 더 가파르게)
// 한 번 잘못 누르면 그 지시는 틀린 것으로 끝내고 정답을 보여 준다. 지시 하나가 답 하나다 (난이도 계기판·연속 정답).
// 버튼 그림은 심볼 위치 외우기의 SYMBOLS 를 쓴다 (모양마다 색이 달라 색만으로 가리지 않는다). 마름모는 빼서 네모와 헷갈리지 않게 한다.
// 램프는 색이 아니라 밝기와 빛 번짐, 그리고 '켜짐' 글자로 켜진 것을 알린다.
// 난이도:
//   buttons · switches · lamps — 조작판의 버튼·스위치·램프 수 (0 이면 그 줄이 없다)
//   kinds — 이 단계에서 나올 수 있는 지시 종류 (같은 것을 두 번 적으면 더 자주 나온다)
//   sw — sw 의 켤 스위치 수 · steps — seq·reverse 의 누를 버튼 수 · times — twice 의 횟수 · chain — chain 의 단계 수
//   mixed — mixed 에서 스위치 다음에 누를 버튼 수 · distract — go 에서 먼저 켜지는 다른 램프 수 (최대)
//   read  — 지시를 읽을 시간만큼 보여 주고 (FollowGame.readMs) 화면을 끈 다음에야 조작판이 풀린다.
//           이어진 지시는 첫 단계만 그렇고, 그 뒤 단계는 바로 뜨고 바로 조작한다 (단계마다 기다리면 지루하다)
//   cover — read 동안 조작판(램프·스위치·버튼)을 덮개로 가린다
//   time  — 제한 시간 배율 (1 보다 작으면 짧다. 읽는 시간은 빼고 잰다)
const FOLLOW_NAMES = { circle: '동그라미', square: '네모', triangle: '세모', star: '별', plus: '십자', moon: '달', heart: '하트' };
const FOLLOW_SHAPES = SYMBOLS.filter((s) => FOLLOW_NAMES[s.id]);
const FOLLOW_LAMPS = ['A', 'B', 'C'];
const FOLLOW_ORD = ['', '첫', '두', '세', '네', '다섯', '여섯', '일곱'];   // 'n 번째'
const FOLLOW_TIMES = ['', '한', '두', '세'];
// 받침이 있으면 a, 없으면 b (별과 / 하트와). 한글이 아닌 글자(A·B·C)는 받침이 없는 것으로 친다
function followJosa(word, a, b) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 ? a : b;
}

class FollowGame {
  static id = 'follow';
  static tags = ['order']; // 꼬리표가 겹치는 게임끼리는 연달아 나오지 않는다 (main.js planPass)
  static title = '지시 따르기';
  static hint = '조작판 화면에 나온 지시대로<br>버튼을 누르고 스위치를 켜세요';
  // 지시가 여러 가지라야 높은 단계에서도 같은 게임이 되풀이되는 느낌이 없다 (2026-10-30 시연 의견). 높은 단계일수록 고를 거리가 많다
  static levels = [
    // 쉬운 단계: 버튼 하나를 그림이나 자리로 찾는다
    { buttons: 3, switches: 0, lamps: 0, kinds: ['one', 'edge', 'twice'], times: 2 },
    { buttons: 4, switches: 3, lamps: 0, kinds: ['one', 'edge', 'nth', 'twice', 'sw'], sw: 1, times: 2 },
    { buttons: 5, switches: 3, lamps: 0, kinds: ['nth', 'not', 'twice', 'sw', 'seq', 'between'], sw: 2, steps: 2, times: 2 },
    { buttons: 5, switches: 4, lamps: 0, kinds: ['not', 'seq', 'rel', 'between', 'offall', 'parity', 'twice'], sw: 2, steps: 2, times: 3 },
    // 램프가 들어온다: 조건 · 세기 · 기다리기
    { buttons: 6, switches: 4, lamps: 2, kinds: ['seq', 'rel2', 'between', 'if', 'swif', 'cmp', 'countpress', 'go', 'offall'], steps: 2, distract: 0 },
    // 외워서: 지시를 읽는 동안은 조작할 수 없고, 화면이 꺼진 뒤에 한다. 이어진 지시(두 단계), 거꾸로 누르기, 두 램프 조건이 들어온다
    { buttons: 6, switches: 4, lamps: 3, kinds: ['reverse', 'ifand', 'ifor', 'swif', 'cmp', 'countsw', 'countpress', 'go', 'mixed', 'chain', 'parity'], steps: 3, chain: 2, mixed: 1, distract: 1, read: true },
    // 전문가: 어려운 지시만 나온다. 두 가지 지시 · 세 단계 이어진 지시 · 미끼 램프 둘. 읽는 동안 조작판이 덮개로 가려진다.
    // 제한 시간 Lv7 85% · Lv8 75%, Lv8 은 이어진 지시가 더 자주 나온다
    { buttons: 7, switches: 5, lamps: 3, kinds: ['compound', 'compound', 'chain', 'reverse', 'ifand', 'ifor', 'swif', 'cmp', 'countsw', 'countpress', 'go'], steps: 3, chain: 3, distract: 2, read: true, cover: true, time: 0.85 },
    { buttons: 7, switches: 5, lamps: 3, kinds: ['compound', 'compound', 'chain', 'chain', 'reverse', 'ifand', 'ifor', 'swif', 'cmp', 'countsw', 'countpress', 'go'], steps: 3, chain: 3, distract: 2, read: true, cover: true, time: 0.75 },
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
    // 지시 종류: 한 게임 안에서는 서로 다르게 (kinds 에 두 번 적힌 것은 앞에 뽑힐 가능성만 높다)
    const kinds = [...new Set(U.shuffle([...this.spec.kinds]))];
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
    // 처음부터 켜져 있는 스위치 (꺼진 스위치를 모두 · 스위치가 켜져 있으면 …)
    q.swOn.forEach((on, i) => this.reset(`s${i}`).el.classList.toggle('flipped', on));
    q.lamps.forEach((on, i) => this.lamp(i, on));
    this.step = 0;
    this.gi = 0;        // 지금 묶음 (q.groups)
    this.gdone = [];    // 지금 묶음에서 맞게 조작한 것
    this.goReady = false;
    [...this.progress.children].forEach((d, i) => d.classList.toggle('cur', i === this.answered));
    this.h.sfx('blink');
    this.h.question({
      n: this.answered + 1, kind: q.kind, parts: q.parts || null, text: q.text,
      buttons: q.buttons.map((s) => s.id), swOn: q.swOn, lamps: q.lamps, go: q.go || null,
      answer: q.answer, groups: q.steps ? null : q.groups, read: !!this.spec.read,
    });
    this.present(q.steps ? q.steps[0].html : q.html, true);
  }

  // 지시를 화면에 띄우고 조작을 받기 시작한다. read 단계는 읽을 시간만큼 보여 준 뒤 화면을 끄고 나서야 조작판이 풀린다
  // (이어진 지시는 첫 단계만)
  present(html, first) {
    const q = this.q;
    this.show(html);
    if (!this.spec.read || !first) return this.unlock(first);
    this.phase = 'read';
    this.panel.classList.remove('live');
    this.panel.classList.toggle('covered', !!this.spec.cover);   // 덮개: 읽는 동안 누를 곳을 미리 찾지 못하게
    U.say(this.msg, '지시를 외우세요', 'look');
    this.h.after(FollowGame.readMs(html), () => {
      if (this.q !== q || this.phase !== 'read') return;
      this.screen.classList.add('off');
      this.unlock(first);
    });
  }

  unlock(first) {
    const q = this.q;
    this.panel.classList.remove('covered');
    this.panel.classList.add('live');
    this.phase = 'input';
    // 이어진 지시의 둘째 단계부터는 처음 잰 제한 시간이 이어진다
    if (q.steps && !first) return;
    if (q.go) return this.wait(q);
    U.say(this.msg, '지시대로 조작하세요', 'act');
    this.h.timer(this.limit(q.load), () => this.finishQ(false, true));
  }

  // 기다리기: 램프가 하나씩 켜진다. 지시한 램프가 켜지면 그때부터 누를 수 있고 제한 시간도 그때부터 잰다
  wait(q) {
    U.say(this.msg, '램프를 지켜보세요', 'look');
    q.go.events.forEach(({ l, at }) => this.h.after(at, () => {
      if (this.q !== q || this.phase !== 'input') return;
      this.lamp(l, true);
      this.h.sfx('blink');
      if (l !== q.go.lamp) return;
      this.goReady = true;
      U.say(this.msg, '지시대로 조작하세요', 'act');
      this.h.timer(this.limit(q.load), () => this.finishQ(false, true));
    }));
  }

  // 단계의 제한 시간 배율(time)을 일의 양으로 바꿔 넣는다: (기본 + 양 × 배) × time = 기본 + 새 양 × 배
  limit(load) {
    const f = this.spec.time || 1;
    if (f === 1) return load;
    const { base, per } = DEFAULT_CONFIG.questionTime.follow;
    return Math.max(0.3, ((base + per * load) * f - base) / per);
  }

  // 지시를 읽을 시간 (ms): 글자 수에 비례하되 2.2~5.5초
  static readMs(html) {
    const len = html.replace(/<[^>]+>/g, '').length;
    return U.clamp(1200 + 90 * len, 2200, 5500);
  }

  lamp(i, on) {
    const c = this.reset(`l${i}`);
    c.el.classList.toggle('on', on);
    c.state.textContent = on ? '켜짐' : '꺼짐';
  }

  // 화면에 지시를 띄운다. 이어진 지시는 몇 번째 단계인지도 귀퉁이에 보인다
  show(html) {
    const { steps } = this.q;
    // 한 덩어리로 감싸야 flex 안에서 띄어쓰기·줄바꿈이 살아 있다
    this.screen.innerHTML = `<span>${html}</span>` + (steps ? `<small class="cp-step">${this.step + 1} / ${steps.length}</small>` : '');
    this.screen.classList.remove('off', 'flash');
    void this.screen.offsetWidth;   // 같은 화면에 이어서 띄울 때도 번쩍임이 다시 보이게
    this.screen.classList.add('flash');
    this.layout();   // 지시가 세 줄이면 조작판이 높아진다 — 다시 맞춘다
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

  // id = 누른 버튼(b0..)·스위치(s0..). 이미 켜진 스위치는 무시한다. 순서가 없는 지시는 이미 맞게 누른 것도 무시하고,
  // 순서가 있는 지시는 같은 버튼을 여러 번 누를 수 있다 (세 번 누르기 · 켜진 램프 수만큼 누르기)
  pick(id) {
    if (this.phase !== 'input') return;
    if (this.q.steps) return this.pickStep(id);
    const c = this.ctrls[id];
    if (id[0] === 's' && c.el.classList.contains('flipped')) return;
    const { groups, go } = this.q;
    const g = groups[this.gi];
    if (!g.ordered && this.gdone.includes(id)) return;
    const early = go && !this.goReady;
    const ok = !early && (g.ordered ? g.ids[this.gdone.length] === id : g.ids.includes(id));
    this.h.input({ ctrl: id, correct: ok, early: !!early });
    this.press(c, id);
    if (!ok) {
      c.el.classList.add('wrong');
      this.mark(c, '✕', 'wrong');
      return this.finishQ(false, false, early);
    }
    this.done.push(id);
    this.gdone.push(id);
    c.el.classList.add('right');
    const repeats = g.ids.filter((x) => x === id).length > 1;
    this.mark(c, repeats ? `${this.gdone.filter((x) => x === id).length}` : g.ordered && g.ids.length > 1 ? String(this.gdone.length) : '✓', 'right');
    if (this.gdone.length === g.ids.length) {
      this.gi++;
      this.gdone = [];
    }
    if (this.gi === groups.length) this.finishQ(true, false);
    else this.h.sfx('blink');
  }

  // 스위치는 켜진 채로, 버튼은 눌렸다가 다시 올라온다 (같은 버튼을 여러 번 누를 때 눌린 것이 보이게)
  press(c, id) {
    if (id[0] === 's') return c.el.classList.add('flipped');
    c.el.classList.remove('pressed');
    void c.el.offsetWidth;
    c.el.classList.add('pressed');
    this.h.after(160, () => c.el.classList.remove('pressed'));
  }

  // 이어진 지시의 한 단계. 맞으면 표시를 잠깐 보인 뒤 지우고 (켠 스위치는 켜진 채로 둔다) 다음 단계를 띄운다
  pickStep(id) {
    const c = this.ctrls[id];
    if (id[0] === 's' && c.el.classList.contains('flipped')) return;
    const ok = this.q.steps[this.step].answer === id;
    this.h.input({ ctrl: id, step: this.step + 1, correct: ok });
    this.press(c, id);
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
      c.el.classList.remove('right');
      this.mark(c, '', '');
      this.present(this.q.steps[this.step].html, false);
    });
  }

  mark(c, text, cls) {
    c.tag.textContent = text;
    c.tag.className = `cp-tag${cls ? ` ${cls}` : ''}`;
  }

  // 지시 하나를 끝낸다. 틀렸으면 아직 안 한 정답 조작을 보여 준다 (순서가 있으면 번호도)
  finishQ(ok, timedOut, early = false) {
    if (this.phase !== 'input' && this.phase !== 'step' && this.phase !== 'read') return;
    this.phase = 'wait';
    this.h.stopTimer();
    this.h.answer({ picked: [...this.done], correct: ok, timedOut });
    this.panel.classList.remove('live', 'covered');
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
      // 아직 안 한 정답 조작 (지금 묶음의 남은 것과 뒤 묶음 전부): 순서가 있으면 몇 번째인지,
      // 같은 버튼을 여러 번 눌러야 하면 몇 번인지 적는다
      this.q.groups.slice(this.gi).forEach((g, k) => {
        const done = k === 0 ? this.gdone : [];
        const left = g.ordered ? g.ids.slice(done.length) : g.ids.filter((id) => !done.includes(id));
        [...new Set(left)].forEach((id) => {
          const c = this.ctrls[id];
          const times = g.ids.filter((x) => x === id).length;
          c.el.classList.remove('right');
          c.el.classList.add('reveal');
          this.mark(c, times > 1 ? `×${times}` : g.ordered && g.ids.length > 1 ? String(g.ids.indexOf(id) + 1) : '●', 'reveal');
        });
      });
      U.say(this.msg, early ? '램프가 켜지기 전에 눌렀어요' : timedOut ? '시간 초과 · 정답은 이것이었어요' : '정답은 이것이었어요', 'bad');
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
  // 반환: { kind, buttons(그림들), swOn(스위치마다 처음부터 켜져 있는지), lamps(램프마다 켜짐), answer(조작 id 들), ordered,
  //         groups([{ ids, ordered }] — 답을 차례로 해야 하는 묶음. 지시 하나면 묶음 하나), parts(compound 의 두 지시 종류),
  //         text(기록용 글), html(화면용), load(제한 시간의 일의 양), steps(chain: [{ html, answer }]), go(기다리기: { lamp, events }) }
  // load 는 읽고 조작할 양이다: 하나 1 · 자리로 찾기 1.5~2 · 여러 번 조작은 그 수 · 조건 3~3.5 · chain 단계 수 + 1
  static make(kind, spec) {
    const { buttons: nb, switches: ns, lamps: nl } = spec;
    const buttons = U.shuffle([...FOLLOW_SHAPES]).slice(0, nb);
    const ctx = {
      spec, nb, ns, nl, buttons,
      swOn: Array(ns).fill(false),
      lamps: Array(nl).fill(false),
      order: U.shuffle([...Array(nb).keys()]),   // 버튼을 고를 때 쓰는 무작위 순서
      nm: (i) => FOLLOW_NAMES[buttons[i].id],
      b: (i) => `<b>${FOLLOW_NAMES[buttons[i].id]}</b>`,
    };
    const r = FollowGame.KINDS[kind](ctx);
    const q = { kind, buttons, swOn: ctx.swOn, lamps: ctx.lamps, ordered: false, ...r };
    if (!q.steps && !q.groups) q.groups = [{ ids: q.answer, ordered: q.ordered }];
    if (q.steps) {
      q.answer = q.steps.map((st) => st.answer);
      q.html = q.steps[0].html;
      q.text = q.steps.map((st) => st.html.replace(/<br>/g, ' ').replace(/<[^>]+>/g, '')).join(' / ');
    } else {
      q.text = q.html.replace(/<br>/g, ' ').replace(/<[^>]+>/g, '');
    }
    return q;
  }

  // 지시 종류마다: ctx 를 받아 { html, answer, ordered?, load, steps?, go? } 를 돌려준다 (ctx.swOn · ctx.lamps 를 바꿔도 된다)
  static KINDS = {
    one: ({ order, b }) => ({ html: `${b(order[0])} 버튼을 누르세요`, answer: [`b${order[0]}`], load: 1 }),

    edge: ({ nb }) => {
      const left = Math.random() < 0.5;
      return { html: `<u>맨 ${left ? '왼쪽' : '오른쪽'}</u> 버튼을 누르세요`, answer: [`b${left ? 0 : nb - 1}`], load: 1 };
    },

    // 양 끝은 edge 가 맡으므로 두 번째부터
    nth: ({ nb }) => {
      const left = Math.random() < 0.5;
      const k = U.randInt(2, nb - 1);
      return { html: `<u>${left ? '왼쪽' : '오른쪽'}에서 ${FOLLOW_ORD[k]} 번째</u> 버튼을 누르세요`, answer: [`b${left ? k - 1 : nb - k}`], load: 1.5 };
    },

    twice: ({ order, b, spec }) => {
      const t = spec.times || 2;
      return { html: `${b(order[0])} 버튼을 <u>${FOLLOW_TIMES[t]} 번</u> 누르세요`, answer: Array(t).fill(`b${order[0]}`), ordered: true, load: t };
    },

    // 먼저 나온 그림이 답이 아니다
    not: ({ order, b }) => ({ html: `${b(order[0])} 버튼 <u>말고</u> ${b(order[1])} 버튼을 누르세요`, answer: [`b${order[1]}`], load: 1.5 }),

    sw: ({ ns, spec }) => {
      const on = U.shuffle([...Array(ns).keys()]).slice(0, Math.min(spec.sw || 2, ns)).sort((a, c) => a - c);
      return { html: `${on.map((i) => `<b>${i + 1}번</b>`).join(', ')} 스위치를 켜세요`, answer: on.map((i) => `s${i}`), load: on.length };
    },

    // 스위치 몇 개를 처음부터 켜 두고, 꺼진 것을 모두 켜게 한다 (꺼진 것이 둘 이상)
    offall: (ctx) => {
      const pre = U.shuffle([...Array(ctx.ns).keys()]).slice(0, U.randInt(1, ctx.ns - 2));
      pre.forEach((i) => (ctx.swOn[i] = true));
      const off = [...Array(ctx.ns).keys()].filter((i) => !ctx.swOn[i]);
      return { html: '<u>꺼진</u> 스위치를 <u>모두</u> 켜세요', answer: off.map((i) => `s${i}`), load: off.length };
    },

    parity: ({ ns }) => {
      const even = Math.random() < 0.5;
      const ids = [...Array(ns).keys()].filter((i) => (i + 1) % 2 === (even ? 0 : 1));
      return { html: `<u>${even ? '짝수' : '홀수'}</u> 번호 스위치를 <u>모두</u> 켜세요`, answer: ids.map((i) => `s${i}`), load: ids.length };
    },

    seq: ({ order, b, spec }) => {
      const picks = order.slice(0, spec.steps || 2);
      return { html: `${picks.map(b).join(' → ')} 버튼을<br>차례로 누르세요`, answer: picks.map((i) => `b${i}`), ordered: true, load: picks.length };
    },

    reverse: ({ order, b, spec }) => {
      const picks = order.slice(0, spec.steps || 2);
      return {
        html: `${picks.map(b).join(' → ')}<br>순서를 <u>거꾸로</u> 해서 누르세요`,
        answer: [...picks].reverse().map((i) => `b${i}`), ordered: true, load: picks.length + 1,
      };
    },

    rel: ({ order, b, nb }) => {
      const at = order[0];
      const dirs = [at > 0 && [-1, '왼쪽'], at < nb - 1 && [1, '오른쪽']].filter(Boolean);
      const [d, w] = dirs[U.rand(dirs.length)];
      return { html: `${b(at)} 바로 <u>${w}</u> 버튼을 누르세요`, answer: [`b${at + d}`], load: 2 };
    },

    rel2: ({ order, b, nm, nb }) => {
      const at = order.find((i) => i >= 2 || i <= nb - 3);
      const dirs = [at >= 2 && [-2, '왼쪽'], at <= nb - 3 && [2, '오른쪽']].filter(Boolean);
      const [d, w] = dirs[U.rand(dirs.length)];
      return { html: `${b(at)}에서 <u>${w}으로 두 칸</u> 떨어진 버튼을 누르세요`, answer: [`b${at + d}`], load: 2 };
    },

    between: ({ b, nm, nb }) => {
      const i = U.rand(nb - 2);
      const [x, y] = Math.random() < 0.5 ? [i, i + 2] : [i + 2, i];
      return { html: `${b(x)}${followJosa(nm(x), '과', '와')} ${b(y)} <u>사이</u>에 있는 버튼을 누르세요`, answer: [`b${i + 1}`], load: 2 };
    },

    // 두 그림의 자리를 비교한다. 고를 두 버튼은 비교하는 두 그림과 다르다
    cmp: ({ order, b, nm }) => {
      const [x, y, p, q] = order;
      return {
        html: `${b(x)}${followJosa(nm(x), '이', '가')} ${b(y)}보다 <u>왼쪽</u>에 있으면 ${b(p)},<br><u>아니면</u> ${b(q)} 버튼을 누르세요`,
        answer: [`b${x < y ? p : q}`], load: 3,
      };
    },

    if: (ctx) => {
      ctx.lamps.forEach((_, i) => (ctx.lamps[i] = Math.random() < 0.5));
      const l = U.rand(ctx.nl);
      const [p, q] = ctx.order;
      return {
        html: `<b>${FOLLOW_LAMPS[l]}</b> 램프가 <u>켜져 있으면</u> ${ctx.b(p)},<br><u>꺼져 있으면</u> ${ctx.b(q)} 버튼을 누르세요`,
        answer: [`b${ctx.lamps[l] ? p : q}`], load: 3,
      };
    },

    // 두 램프가 모두 / 하나라도. 맞는 경우와 아닌 경우가 반반이 되게 켠다 (나머지 램프는 아무렇게나)
    ifand: (ctx) => FollowGame.ifTwo(ctx, true),
    ifor: (ctx) => FollowGame.ifTwo(ctx, false),

    swif: (ctx) => {
      ctx.swOn.forEach((_, i) => (ctx.swOn[i] = Math.random() < 0.5));
      const k = U.rand(ctx.ns);
      const [p, q] = ctx.order;
      return {
        html: `<b>${k + 1}번</b> 스위치가 <u>켜져 있으면</u> ${ctx.b(p)},<br><u>꺼져 있으면</u> ${ctx.b(q)} 버튼을 누르세요`,
        answer: [`b${ctx.swOn[k] ? p : q}`], load: 3,
      };
    },

    // 켜진 램프 수 (1 이상)
    countsw: (ctx) => {
      const c = U.randInt(1, Math.min(ctx.nl, ctx.ns));
      U.shuffle([...Array(ctx.nl).keys()]).slice(0, c).forEach((i) => (ctx.lamps[i] = true));
      return { html: '<u>켜진 램프 수</u>와 같은 번호의 스위치를 켜세요', answer: [`s${c - 1}`], load: 2.5 };
    },

    countpress: (ctx) => {
      const c = U.randInt(1, ctx.nl);
      U.shuffle([...Array(ctx.nl).keys()]).slice(0, c).forEach((i) => (ctx.lamps[i] = true));
      const i = ctx.order[0];
      return { html: `<u>켜진 램프 수만큼</u> ${ctx.b(i)} 버튼을 누르세요`, answer: Array(c).fill(`b${i}`), ordered: true, load: c + 1 };
    },

    // 기다리기: 다른 램프가 먼저 켜지고 (distract 개까지), 지시한 램프가 마지막에 켜진다
    go: ({ nl, order, b, spec }) => {
      const ls = U.shuffle([...Array(nl).keys()]);
      const target = ls[0];
      const decoys = ls.slice(1, 1 + U.randInt(0, Math.min(spec.distract || 0, nl - 1)));
      let at = U.randInt(900, 1500);
      const events = [];
      for (const l of [...decoys, target]) {
        events.push({ l, at });
        at += U.randInt(650, 1000);
      }
      return { html: `<b>${FOLLOW_LAMPS[target]}</b> 램프가 <u>켜지면</u> ${b(order[0])} 버튼을 누르세요`, answer: [`b${order[0]}`], load: 1, go: { lamp: target, events } };
    },

    // 스위치를 먼저 켜고 버튼을 누른다 (mixed 개)
    mixed: ({ ns, order, b, spec }) => {
      const k = U.rand(ns);
      const picks = order.slice(0, spec.mixed || 1);
      const html = picks.length === 1
        ? `<b>${k + 1}번</b> 스위치를 켜고 ${b(picks[0])} 버튼을 누르세요`
        : `<b>${k + 1}번</b> 스위치를 켜고<br>${picks.map(b).join(' → ')} 버튼을 차례로 누르세요`;
      return { html, answer: [`s${k}`, ...picks.map((i) => `b${i}`)], ordered: true, load: picks.length + 1 };
    },

    // 두 가지: 스위치 지시 하나 → 버튼 지시 하나. 램프를 함께 쓰는 둘(램프 수·램프 조건)은 짝짓지 않는다 —
    // 한 판의 램프가 두 지시에 맞춰야 해서 둘 중 하나가 어긋난다. 스위치가 켜져 있는지를 묻는 지시(swif)는 앞에서 스위치를 켜므로 뺀다
    compound: (ctx) => {
      const LAMPS = ['countsw', 'countpress', 'if', 'ifand', 'ifor'];
      const first = ['sw', 'parity', 'offall', 'countsw'][U.rand(4)];
      const second = ['one', 'nth', 'between', 'rel2', 'not', 'twice', 'countpress', 'if', 'ifand', 'ifor', 'cmp']
        .filter((k) => !(LAMPS.includes(first) && LAMPS.includes(k)));
      const k2 = second[U.rand(second.length)];
      const a = FollowGame.KINDS[first](ctx);
      const b = FollowGame.KINDS[k2](ctx);
      const flat = (h) => h.replace(/<br>/g, ' ');
      return {
        html: `<u>먼저</u> ${flat(a.html)}<br><u>그다음</u> ${flat(b.html)}`,
        groups: [{ ids: a.answer, ordered: !!a.ordered }, { ids: b.answer, ordered: !!b.ordered }],
        answer: [...a.answer, ...b.answer], parts: [first, k2], load: a.load + b.load,
      };
    },

    chain: ({ spec, buttons, ns }) => {
      const n = spec.chain || 2;
      return { steps: FollowGame.chain(n, buttons, ns).map(({ html, id }) => ({ html, answer: id })), ordered: true, load: n + 1 };
    },
  };

  static ifTwo(ctx, both) {
    ctx.lamps.forEach((_, i) => (ctx.lamps[i] = Math.random() < 0.5));
    const [l1, l2] = U.shuffle([...Array(ctx.nl).keys()]).slice(0, 2).sort((a, c) => a - c);
    const yes = Math.random() < 0.5;
    if (both) {
      if (yes) ctx.lamps[l1] = ctx.lamps[l2] = true;
      else [[false, true], [true, false], [false, false]][U.rand(3)].forEach((v, k) => (ctx.lamps[[l1, l2][k]] = v));
    } else if (yes) {
      [[true, true], [true, false], [false, true]][U.rand(3)].forEach((v, k) => (ctx.lamps[[l1, l2][k]] = v));
    } else {
      ctx.lamps[l1] = ctx.lamps[l2] = false;
    }
    const [p, q] = ctx.order;
    const [a, c] = [FOLLOW_LAMPS[l1], FOLLOW_LAMPS[l2]];
    const html = both
      ? `<b>${a}</b>와 <b>${c}</b> 램프가 <u>모두</u> 켜져 있으면 ${ctx.b(p)},<br><u>아니면</u> ${ctx.b(q)} 버튼을 누르세요`
      : `<b>${a}</b>나 <b>${c}</b> 램프 중 <u>하나라도</u> 켜져 있으면 ${ctx.b(p)},<br><u>아니면</u> ${ctx.b(q)} 버튼을 누르세요`;
    return { html, answer: [`b${yes ? p : q}`], load: 3.5 };
  }

  // 이어진 지시 n 단계. 첫 단계는 버튼이나 스위치 하나를 바로 가리키고, 그 뒤 단계는 되도록 앞의 조작을 가리킨다:
  //   방금 누른 버튼의 바로 옆 · 맨 처음 누른 버튼 (한 번 더 · 바로 옆) · 방금 켠 스위치의 다음 번호
  //   방금 켠 스위치 번호만큼 왼쪽에서 센 버튼 · 방금 누른 버튼의 자리 번호와 같은 스위치
  // 가리킬 수 있는 것이 없을 때(와 세 단계에서 가끔 둘째 단계)만 새 버튼·스위치를 바로 가리킨다.
  // 세 단계 이상이면 '맨 처음' 이나 번호·자리를 잇는 단계가 꼭 있게 한다.
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
        // 번호와 자리를 잇는다: 스위치 번호만큼 왼쪽에서 센 버튼 · 버튼이 왼쪽에서 몇 번째인지와 같은 번호의 스위치
        if (last && last.t === 's' && last.i < nb) {
          opts.push({ id: `b${last.i}`, html: '<u>방금 켠</u> 스위치 번호만큼<br><u>왼쪽에서 세어</u> 버튼을 누르세요', w: 2 });
        }
        if (last && last.t === 'b' && last.i < ns && !on.has(last.i)) {
          opts.push({ id: `s${last.i}`, html: '<u>방금 누른</u> 버튼이 왼쪽에서 몇 번째인지 세어<br>그 번호 스위치를 켜세요', w: 2 });
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
      // 세 단계면 '맨 처음' 이나 번호·자리를 잇는 단계가 하나는 있게 (둘 다 앞의 조작을 기억해야 한다)
      if (refs && (n < 3 || out.some((o) => /맨 처음|번호만큼|몇 번째인지/.test(o.html)))) return out;
    }
  }
}
