// 가린 숫자 더하기
// 작은 숫자 여러 개를 판에 늘어놓고 그중 몇 개를 표시가 다른 상자로 덮은 뒤, 두 숫자의 합을 묻는다.
// 묻는 두 숫자 가운데 적어도 하나는 덮인 숫자다. 판 하나에 문제 3개.
// 설명 없이도 '상자끼리의 식'이 아니라 '숫자 더하기'로 읽히도록:
//   - 숫자는 덮였든 아니든 늘 화면에 있다. 상자는 숫자가 보이게 열린 채로 나왔다가 눈앞에서 닫힌다.
//   - 묻는 두 숫자는 제자리에서 식의 빈칸으로 날아가고(빈 자리에는 테두리가 남는다), 답하면 식 안에서 상자가 열린다.
//   - 숫자는 위쪽에 한 줄로 늘어놓고 식과 보기는 바로 그 아래 가운데에 둔다. 숫자가 날아가는 거리가 짧고 눈이 오가는 폭도 좁다.
//     (식 둘레에 흩어 놓아 보았더니 숫자끼리 너무 떨어져 찾기 번거로웠다.)
// 숫자는 상자의 표시로 기억하므로 자리는 외울 거리가 아니다. 줄의 순서는 판마다 섞는다.
// 난이도는 다섯 가지로 조절한다.
//   n      — 숫자 수
//   hidden — 그중 덮는 수. 외워야 할 (표시, 숫자) 짝이 늘어난다
//   both   — 두 숫자가 모두 덮인 것일 확률. 머릿속에서 둘을 다 꺼내 더해야 한다
//   opts   — 보기 수
//   show   — 외우는 시간의 기본 몫(ms). 쉬운 단계만 따로 정하고, 나머지는 SHOW_MS 다
const COVER_MARKS = (() => {
  const star = Array.from({ length: 10 }, (_, i) => {
    const a = ((-90 + i * 36) * Math.PI) / 180;
    const rad = i % 2 ? 12 : 28;
    return `${(50 + Math.cos(a) * rad).toFixed(1)},${(53 + Math.sin(a) * rad).toFixed(1)}`;
  }).join(' ');
  // 색만으로 구분하지 않도록 상자마다 모양이 다르다 (색약 대응)
  return [
    { id: 'red', fill: '#e5484d', glyph: '<circle cx="50" cy="50" r="24"/>' },
    { id: 'blue', fill: '#2f6fed', glyph: '<rect x="28" y="28" width="44" height="44" rx="5"/>' },
    { id: 'green', fill: '#1f9d55', glyph: '<polygon points="50,24 76,72 24,72"/>' },
    { id: 'yellow', fill: '#e09b00', glyph: '<polygon points="50,22 78,50 50,78 22,50"/>' },
    { id: 'purple', fill: '#8e4ec6', glyph: '<path d="M43 24h14v19h19v14H57v19H43V57H24V43h19z"/>' },
    { id: 'cyan', fill: '#06a3c8', glyph: `<polygon points="${star}"/>` },
  ];
})();

class CoverGame {
  static id = 'cover';
  static tags = ['memory', 'number']; // 꼬리표가 겹치는 게임끼리는 연달아 나오지 않는다 (main.js planPass)
  static title = '가린 숫자 더하기';
  static hint = '상자가 닫히기 전에 속에 든 숫자를 외워 두었다가<br>두 숫자를 더한 값을 고르세요';
  static levels = [
    // 쉬운 단계: 숫자 셋, 덮는 것도 한두 개, 외울 시간을 넉넉히
    { n: 3, hidden: 1, both: 0, opts: 3, show: 3000 },
    { n: 3, hidden: 2, both: 0, opts: 3, show: 2500 },
    { n: 4, hidden: 2, both: 0, opts: 3 },
    { n: 5, hidden: 2, both: 0.35, opts: 4 },
    { n: 5, hidden: 3, both: 0.35, opts: 4 },
    { n: 6, hidden: 3, both: 0.5, opts: 4 },
    { n: 6, hidden: 4, both: 0.6, opts: 5 },
    { n: 7, hidden: 5, both: 0.7, opts: 5 },
  ];
  static maxLevel = CoverGame.levels.length;
  static ROUNDS = 3;
  static LO = 2;          // 1 은 더해도 거의 생각할 게 없어서 뺀다
  static HI = 9;          // 숫자는 모두 서로 다르다 (상자 속 숫자가 겹치면 섞어 기억한 것을 가려낼 수 없다)
  static SHOW_MS = 1500;  // 외우는 시간 = SHOW_MS + SHOW_PER × 덮을 수
  static SHOW_PER = 550;
  static LID_GAP = 130;   // 상자가 하나씩 닫히는 간격
  static FLY_MS = 520;    // css .cv-tok 의 transition 과 같게

  // 소개 그림: ① 상자 속 숫자를 외워 두었다가 ② 두 수를 더한 값을 고른다
  static diagram() {
    const m = COVER_MARKS[0];
    const tok = (x, y, s, v) => Dg.rect(x, y, s, s, 'dg-slot') + Dg.text(x + s / 2, y + s / 2, v, s * 0.55);
    const box = (x, y, s) => `<rect fill="${m.fill}" x="${x}" y="${y}" width="${s}" height="${s}" rx="8"/>` +
      Dg.glyph(m.glyph, x + s / 2, y + s / 2, s, 'fill="rgba(255,255,255,0.92)"');
    // 열린 상자: 숫자가 보이고, 표시가 찍힌 뚜껑이 왼쪽 위 모서리를 축으로 젖혀져 있다
    const open = (x, y, s, v) => `<rect class="dg-slot" style="stroke:${m.fill}" x="${x}" y="${y}" width="${s}" height="${s}" rx="7"/>` +
      Dg.text(x + s / 2, y + s / 2, v, s * 0.55) +
      `<g transform="rotate(-38 ${x} ${y})">${box(x, y - s * 0.62, s).replace(`height="${s}"`, `height="${s * 0.62}"`)}</g>`;
    const opts = [[11, 40], [12, 82], [13, 124]].map(([v, x]) => Dg.rect(x, 82, 38, 38) + Dg.text(x + 19, 101, v, 19)).join('');
    return [
      { svg: Dg.svg('0 0 200 136', tok(22, 66, 44, 3) + open(78, 66, 44, 7) + tok(134, 66, 44, 5)), caption: '상자 속 숫자를 외워 두었다가' },
      {
        svg: Dg.svg('0 0 200 136', box(18, 10, 36) + Dg.text(70, 28, '+', 22) + tok(86, 10, 36, 5) + Dg.text(138, 28, '=', 22) +
          Dg.text(170, 28, '?', 24, 'dg-txt num') + opts + Dg.tap(101, 101)),
        caption: '두 수를 더한 값 고르기',
      },
    ];
  }

  constructor(host) {
    this.h = host;
    this.spec = CoverGame.levels[host.level - 1];
    this.round = 0;
    this.correct = 0;
    this.phase = 'show';
    this.last = null; // 지난 문제의 두 숫자 (같은 짝을 연달아 묻지 않게)
  }

  start() {
    const { stage, level } = this.h;
    stage.append(U.el('div', 'stage-title', `${CoverGame.title} · Lv.${level}`));
    this.msg = U.el('div', 'stage-msg', '외우세요!');
    this.board = U.el('div', 'cv-board');
    this.row = U.el('div', 'cv-row');
    this.center = U.el('div', 'cv-center');
    this.progress = U.el('div', 'dots');
    for (let i = 0; i < CoverGame.ROUNDS; i++) this.progress.append(U.el('span'));
    // 처음부터 빈 식을 흐리게 보여 줘서 '두 숫자를 더하는 게임'이라는 것이 먼저 보이게 한다
    this.eq = U.el('div', 'cv-eq idle');
    this.slots = [U.el('div', 'cv-slot'), U.el('div', 'cv-slot')];
    this.ansBox = U.el('div', 'cv-ans', '?');
    this.eq.append(this.slots[0], U.el('div', '', '+'), this.slots[1], U.el('div', '', '='), this.ansBox);
    this.opts = U.el('div', 'cv-opts');
    this.center.append(this.eq, this.opts, this.progress);
    this.board.append(this.row, this.center);
    stage.append(this.msg, this.board);

    this.toks = CoverGame.deal(this.spec);
    this.toks.forEach((t) => {
      t.home = U.el('div', 'cv-home');
      t.el = U.el('div', 'cv-tok', `<div class="cv-face">${t.v}</div>`);
      if (t.mark) {
        const lid = U.el('div', 'cv-lid', `<svg viewBox="0 0 100 100">${t.mark.glyph}</svg>`);
        lid.style.background = t.mark.fill;
        t.el.append(lid);
        t.el.classList.add('open');
      }
      this.row.append(t.home);
      this.board.append(t.el);
    });
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(stage);
    this.layout();
    this.h.sfx('blink');

    const hid = this.toks.filter((t) => t.mark);
    const show = (this.spec.show || CoverGame.SHOW_MS) + CoverGame.SHOW_PER * hid.length;
    hid.forEach((t, i) => this.h.after(show + i * CoverGame.LID_GAP, () => {
      t.el.classList.remove('open');
      this.h.sfx('blink');
    }));
    this.h.after(show + hid.length * CoverGame.LID_GAP + 450, () => this.ask());
  }

  // 숫자 크기는 판 높이(줄 + 식 + 보기)와 너비(숫자 n개) 둘 다에 맞춘다. 숫자는 줄의 제자리(.cv-home) 또는 식의 빈칸 위에 놓인다.
  layout() {
    const b = this.board;
    const W = b.clientWidth;
    const H = b.clientHeight;
    if (!W || !H) return;
    const tk = Math.round(U.clamp(Math.min(H / 5.6, W / (this.toks.length * 1.3 + 0.5)), 36, 110));
    b.style.setProperty('--tk', `${tk}px`);
    const br = b.getBoundingClientRect();
    const er = this.slots.map((s) => s.getBoundingClientRect());
    this.toks.forEach((t) => {
      const r = t.at != null ? er[t.at] : t.home.getBoundingClientRect();
      t.el.style.left = `${r.left - br.left}px`;
      t.el.style.top = `${r.top - br.top}px`;
    });
  }

  ask() {
    const [a, b] = this.pickPair();
    const ans = a.v + b.v;
    this.q = { a, b, ans };
    this.msg.textContent = '';
    this.msg.className = 'stage-msg';
    [...this.progress.children].forEach((d, i) => d.classList.toggle('cur', i === this.round));
    this.eq.classList.remove('idle');
    this.ansBox.className = 'cv-ans';
    this.ansBox.textContent = '?';

    [a, b].forEach((t, i) => {
      t.at = i;
      t.el.classList.add('away');
      t.home.classList.add('empty');
    });
    this.layout();
    this.h.sfx('tap');

    this.h.after(CoverGame.FLY_MS, () => {
      const opts = CoverGame.options(a, b, this.toks, this.spec.opts);
      this.opts.innerHTML = '';
      this.btns = opts.map((v) => {
        const btn = U.el('button', 'ar-cand cv-opt', String(v));
        btn.addEventListener('pointerdown', () => this.pick(v, btn));
        this.opts.append(btn);
        return btn;
      });
      this.ansBox.classList.add('active');
      this.layout();
      this.phase = 'input';
      const idx = (t) => this.toks.indexOf(t);
      this.h.question({
        values: this.toks.map((t) => t.v),
        marks: this.toks.map((t) => (t.mark ? t.mark.id : null)),
        terms: [idx(a), idx(b)],
        ans,
        opts,
      });
      this.h.timer([a, b].filter((t) => t.mark).length, () => this.pick(null, null));
    });
  }

  // 덮인 숫자 가운데 덜 물어본 것부터 쓴다. 한 번 묻고 나면 답할 때 상자를 열어 보여 주므로,
  // 같은 상자를 다시 물으면 방금 본 숫자를 떠올리기만 하면 된다.
  // 바로 앞 문제와 같은 식(좌우만 바꾼 것 포함)은 내지 않는다. 덮인 것이 둘뿐인 판에서 둘 다 덮인 식을 뽑으면
  // 그런 식이 하나뿐이므로, 그때는 하나만 덮인 식으로 넘어간다.
  pickPair() {
    const hid = U.shuffle(this.toks.filter((t) => t.mark)).sort((x, y) => x.asks - y.asks);
    const vis = U.shuffle(this.toks.filter((t) => !t.mark));
    const wantBoth = hid.length >= 2 && (!vis.length || Math.random() < this.spec.both);
    const same = (p) => this.last && p.every((t) => this.last.includes(t));
    // 후보는 덜 물어본 덮인 숫자가 앞에 오도록 늘어놓고, 원하는 종류(둘 다 덮인 식 / 하나만 덮인 식)를 먼저 본다
    const both = [];
    const one = [];
    hid.forEach((a, i) => {
      hid.slice(i + 1).forEach((b) => both.push([a, b]));
      vis.forEach((v) => one.push([a, v]));
    });
    const pair = (wantBoth ? [...both, ...one] : [...one, ...both]).find((p) => !same(p));
    pair.forEach((t) => t.mark && t.asks++);
    this.last = pair;
    return U.shuffle(pair);
  }

  // v = 고른 값. null 이면 시간이 다 된 것
  pick(v, btn) {
    if (this.phase !== 'input') return;
    this.phase = 'wait';
    this.h.stopTimer();
    const { a, b, ans } = this.q;
    const ok = v === ans;
    this.h.answer({ picked: v, correct: ok, timedOut: !btn });

    // 식 안에서 상자를 열어 무엇이 들어 있었는지 보여 준다
    [a, b].forEach((t) => t.mark && t.el.classList.add('open'));
    this.ansBox.classList.remove('active');
    this.ansBox.classList.add(ok ? 'right' : 'wrong');
    this.ansBox.textContent = btn ? String(v) : '?';
    this.btns.forEach((x) => {
      x.disabled = true;
      if (Number(x.textContent) === ans) x.classList.add(ok ? 'right' : 'answer');
    });
    if (!ok && btn) btn.classList.add('wrong');
    const d = this.progress.children[this.round];
    d.classList.remove('cur');
    d.classList.add(ok ? 'right' : 'wrong');

    if (ok) {
      this.correct++;
      this.msg.textContent = '정답!';
      this.msg.className = 'stage-msg good';
      this.h.award((this.h.base * this.h.mult) / CoverGame.ROUNDS, this.ansBox);
      this.h.sfx('good');
    } else {
      this.msg.textContent = `${btn ? '' : '시간 초과 · '}${a.v} + ${b.v} = ${ans}`;
      this.msg.className = 'stage-msg bad';
      this.h.sfx('bad');
    }
    this.round++;
    // 마지막 문제는 숫자를 제자리로 돌려보내지 않고 바로 끝낸다
    if (this.round >= CoverGame.ROUNDS) return this.h.after(ok ? 700 : 1300, () => this.finish());
    this.h.after(ok ? 650 : 1300, () => this.putBack());
  }

  // 상자를 닫으며 두 숫자를 제자리로 돌려보낸다
  putBack() {
    const { a, b } = this.q;
    this.opts.innerHTML = '';
    this.ansBox.className = 'cv-ans';
    this.ansBox.textContent = '?';
    this.msg.textContent = '';
    this.msg.className = 'stage-msg';
    [a, b].forEach((t) => {
      t.at = null;
      t.el.classList.remove('open');
    });
    this.layout();
    this.h.after(CoverGame.FLY_MS, () => {
      [a, b].forEach((t) => {
        t.el.classList.remove('away');
        t.home.classList.remove('empty');
      });
      this.h.after(120, () => this.ask());
    });
  }

  finish() {
    this.ro.disconnect();
    this.h.done(this.result());
  }

  result() {
    return { cleared: this.correct === CoverGame.ROUNDS, correct: this.correct, total: CoverGame.ROUNDS };
  }

  // 점수는 맞힐 때마다 바로 지급하므로 중단될 때 따로 줄 것이 없다
  abort() {
    this.ro.disconnect();
    return { cleared: false, correct: this.correct, total: this.round };
  }

  // ---- 판 만들기 ----
  // 반환: [{ v, mark(덮이지 않았으면 null), asks }]. 화면의 줄은 이 순서다 — 덮인 숫자가 앞에 몰리지 않게 섞는다
  static deal({ n, hidden }) {
    const vals = U.shuffle(Array.from({ length: CoverGame.HI - CoverGame.LO + 1 }, (_, i) => CoverGame.LO + i)).slice(0, n);
    const marks = U.shuffle([...COVER_MARKS]);
    return U.shuffle(vals.map((v, i) => ({ v, mark: i < hidden ? marks[i] : null, asks: 0 })));
  }

  // ---- 보기 ----
  // 오답 보기는 실제로 하기 쉬운 실수에서 먼저 고른다: 상자 속 숫자를 다른 상자의 숫자와 바꿔 기억했을 때의 합.
  // 나머지는 정답 가까이의 값으로 채운다. ±1 을 늘 같이 넣으면 '가운데 것'만 고르면 되므로 거리를 섞어 뽑는다.
  // 화면에는 작은 값부터 늘어놓는다.
  static options(a, b, toks, k) {
    const ans = a.v + b.v;
    const hid = toks.filter((t) => t.mark).map((t) => t.v);
    const out = new Set([ans]);
    const mixups = [];
    for (const [x, y] of [[a, b], [b, a]]) {
      if (x.mark) hid.forEach((h) => h !== x.v && h !== y.v && mixups.push(h + y.v));
    }
    for (const m of U.shuffle(mixups)) {
      if (out.size >= k - 1) break; // 가까운 값 하나는 남겨 둔다
      out.add(m);
    }
    for (const d of U.shuffle([-3, -2, -1, 1, 2, 3])) {
      if (out.size >= k) break;
      if (ans + d >= CoverGame.LO) out.add(ans + d);
    }
    return [...out].sort((x, y) => x - y);
  }
}
