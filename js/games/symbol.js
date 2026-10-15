// 심볼 위치 외우기
// 2x4 판의 몇 칸에 서로 다른 심볼을 잠깐 보여준 뒤, 위쪽 칸에 뜬 심볼이 어디 있었는지 3번 맞힌다.
const SYMBOLS = (() => {
  const star = Array.from({ length: 10 }, (_, i) => {
    const a = ((-90 + i * 36) * Math.PI) / 180;
    const rad = i % 2 ? 20 : 47;
    return `${(50 + Math.cos(a) * rad).toFixed(1)},${(54 + Math.sin(a) * rad).toFixed(1)}`;
  }).join(' ');
  // 모양과 색이 모두 확실히 구분되도록 구성
  return [
    { id: 'circle', svg: '<circle cx="50" cy="50" r="42" fill="#e5484d"/>' },
    { id: 'square', svg: '<rect x="10" y="10" width="80" height="80" rx="6" fill="#2f6fed"/>' },
    { id: 'triangle', svg: '<polygon points="50,7 95,90 5,90" fill="#1f9d55"/>' },
    { id: 'star', svg: `<polygon points="${star}" fill="#f5b301"/>` },
    { id: 'plus', svg: '<path d="M37 6h26v31h31v26H63v31H37V63H6V37h31z" fill="#f76808"/>' },
    { id: 'diamond', svg: '<polygon points="50,3 93,50 50,97 7,50" fill="#8e4ec6"/>' },
    // 달은 어두운 색이라 어두운 스타일에서는 밝게 바꾼다 (css: --sym-ink)
    { id: 'moon', svg: '<path class="sym-ink" d="M64 6 A45 45 0 1 0 94 72 A37 37 0 1 1 64 6 Z"/>' },
    { id: 'heart', svg: '<path d="M50 92 L12 54 A22 22 0 0 1 50 20 A22 22 0 0 1 88 54 Z" fill="#06aed5"/>' },
  ];
})();

function symbolEl(sym) {
  return U.el('div', 'sym', `<svg viewBox="0 0 100 100">${sym.svg}</svg>`);
}

class SymbolGame {
  static id = 'symbol';
  static title = '심볼 위치 외우기';
  static hint = '잠깐 보이는 그림들의 위치를 외운 뒤<br>위에 나온 그림이 어디 있었는지 고르세요';
  static counts = [3, 4, 5, 6, 7, 8]; // 심볼 수 = 난이도
  static maxLevel = SymbolGame.counts.length;
  static SHOW_MS = 3200;   // 심볼 노출 시간 (고정)
  static QUESTIONS = 3;

  constructor(host) {
    this.h = host;
    this.n = SymbolGame.counts[host.level - 1];
    this.phase = 'show';
    this.correct = 0;
    this.answered = 0;
  }

  start() {
    const { stage, level } = this.h;
    stage.append(U.el('div', 'stage-title', `${SymbolGame.title} · Lv.${level}`));
    this.wrap = U.el('div', 'sym-wrap');
    this.question = U.el('div', 'sym-question', '');
    this.target = U.el('div', 'sym-target');
    this.grid = U.el('div', 'sym-grid');
    this.wrap.append(this.question, this.target, this.grid);
    stage.append(this.wrap);

    this.cells = [];
    for (let i = 0; i < 8; i++) {
      const cell = U.el('div', 'scell');
      cell.addEventListener('pointerdown', () => this.pick(i));
      this.grid.append(cell);
      this.cells.push(cell);
    }
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(stage);
    this.layout();

    const slots = U.shuffle([...Array(8).keys()]).slice(0, this.n);
    const syms = U.shuffle([...SYMBOLS]).slice(0, this.n);
    this.placed = slots.map((slot, i) => ({ slot, sym: syms[i] }));
    this.asks = U.shuffle([...this.placed]).slice(0, SymbolGame.QUESTIONS);

    const banner = U.el('div', 'memorize-banner', '외우세요!');
    this.grid.append(banner);
    this.h.after(1100, () => {
      banner.remove();
      this.placed.forEach(({ slot, sym }) => this.cells[slot].append(symbolEl(sym)));
      this.h.sfx('blink');
    });
    this.h.after(1100 + SymbolGame.SHOW_MS, () => {
      this.cells.forEach((c) => (c.innerHTML = ''));
      this.h.after(350, () => this.ask());
    });
  }

  layout() {
    const s = this.h.stage;
    const avail = s.clientHeight - 48 - 30 - 14 * 3;
    const sz = Math.max(48, Math.min(avail / 3, (s.clientWidth - 80) / 4.5, 140));
    this.wrap.style.setProperty('--sz', `${sz}px`);
  }

  ask() {
    const q = this.asks[this.answered];
    this.current = q;
    this.target.innerHTML = '';
    this.target.append(symbolEl(q.sym));
    this.target.classList.add('active');
    this.question.textContent = '어디 있었나요?';
    this.cells.forEach((c) => {
      if (!c.classList.contains('closed')) c.classList.add('clickable');
    });
    this.phase = 'input';
    this.h.question({
      target: q.sym.id, slot: q.slot, n: this.answered + 1,
      board: this.placed.map((p) => [p.slot, p.sym.id]), // 외울 때 보여 준 [칸, 심볼]
    });
    this.h.timer(1, () => this.pick(-1));
  }

  // i = 고른 칸. -1 이면 시간이 다 된 것 (틀린 것으로 치고 정답 칸만 보여준다)
  pick(i) {
    if (this.phase !== 'input') return;
    const cell = this.cells[i] || null;
    if (cell && cell.classList.contains('closed')) return;
    this.phase = 'wait';
    this.h.stopTimer();
    this.cells.forEach((c) => c.classList.remove('clickable'));
    const ok = i === this.current.slot;
    this.h.answer({ picked: cell ? i : null, correct: ok, timedOut: !cell });
    if (cell) {
      cell.classList.add('closed', ok ? 'right' : 'wrong');
      cell.append(U.el('span', 'mark', ok ? '✓' : '✕'));
    } else {
      this.question.textContent = '시간 초과!';
    }
    if (ok) {
      this.correct++;
      // 점수는 맞힐 때마다 바로 지급한다
      this.h.award((this.h.base * this.h.mult) / SymbolGame.QUESTIONS, cell);
      this.h.sfx('good');
    } else {
      this.h.sfx('bad');
      const answer = this.cells[this.current.slot];
      answer.classList.add('reveal');
      const ghost = symbolEl(this.current.sym);
      ghost.style.opacity = '0.45';
      answer.append(ghost);
      this.h.after(800, () => {
        answer.classList.remove('reveal');
        ghost.remove();
      });
    }
    this.answered++;
    this.h.after(ok ? 550 : 900, () => {
      if (this.answered < SymbolGame.QUESTIONS) this.ask();
      else this.complete();
    });
  }

  complete() {
    this.phase = 'end';
    this.target.classList.remove('active');
    this.target.innerHTML = '';
    this.question.textContent = `${this.correct} / ${SymbolGame.QUESTIONS} 정답`;
    // 문제마다 이미 정답/오답 소리를 들려줬다. 다 맞혔을 때의 축하음은 host가 울린다.
    this.h.after(1200, () => {
      this.ro.disconnect();
      this.h.done(this.result());
    });
  }

  result() {
    return { cleared: this.correct === SymbolGame.QUESTIONS, correct: this.correct, total: SymbolGame.QUESTIONS };
  }

  // 점수는 맞힐 때마다 바로 지급하므로 중단될 때 따로 줄 것이 없다
  abort() {
    this.ro.disconnect();
    return { cleared: false, correct: this.correct, total: this.answered };
  }
}
