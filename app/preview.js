// 대기 화면 오른쪽의 게임 화면 미리보기 (운영 버전만).
// 실제 게임과 같은 풍경 그림(Band, 풍경 라이딩)으로 자전거가 달리고, 아래 카드에서 두뇌 게임 문제를 푸는 모습을 되풀이한다.
// 가끔 속도가 처지면 '여기에 맞춰 달려요'가 나와 속도 맞추기도 보여 준다. Demo.tick 이 대기 화면에서 매 프레임 부른다.
const AttractPreview = {
  QUESTIONS: [
    { q: '7 + 5 = ?', opts: ['11', '12', '13'], a: 1 },
    { q: '가장 큰 수는?', opts: ['38', '83', '58'], a: 1 },
    { q: '14 − 6 = ?', opts: ['8', '7', '9'], a: 0 },
    { q: '사과 3개 + 귤 4개는?', opts: ['6개', '8개', '7개'], a: 2 },
    { q: '월요일 다음 다음 날은?', opts: ['화요일', '수요일', '목요일'], a: 1 },
  ],
  Q_SEC: 4.4,       // 문제 하나를 보여 주는 시간
  ANSWER_AT: 2.6,   // 문제가 나오고 이만큼 뒤에 답을 고른다
  CYCLE_SEC: 18,    // 속도가 잠깐 처졌다 돌아오는 주기
  DAY_SEC: 120,     // 하늘이 아침 → 늦은 오후 → 아침으로 한 번 오가는 시간

  init(app) {
    const root = document.getElementById('att-preview');
    if (!root) return null;
    this.app = app;
    this.root = root;
    this.band = new Band(root.querySelector('canvas'), app.cfg);
    // 미리보기 카드는 실제 게임 화면보다 좁아서 풍경이 몇 개 안 보인다. 조금 멀리서 본 것처럼 크게 그려 줄여 넣는다
    const ZOOM = 1.35;
    this.band.resize = function () {
      const dpr = window.devicePixelRatio || 1;
      const r = this.canvas.getBoundingClientRect();
      this.W = r.width * ZOOM;
      this.H = r.height * ZOOM;
      this.canvas.width = Math.round(r.width * dpr);
      this.canvas.height = Math.round(r.height * dpr);
      this.g.setTransform(dpr / ZOOM, 0, 0, dpr / ZOOM, 0, 0);
    };
    this.band.resize();
    this.q = root.querySelector('.pv-q');
    this.opts = [...root.querySelectorAll('.pv-opts span')];
    this.scoreEl = root.querySelector('.pv-score b');
    this.timeEl = root.querySelector('.pv-time b');
    this.t = 0;
    this.score = 3000; // 마을에서 출발해 곧 풍차 들판이 다가온다 (한 풍경 구간은 1분쯤)
    this.qi = -1;
    this.qt = 0;
    this.answered = false;
    this.started = false;
    return this;
  },

  nextQuestion() {
    this.qi = (this.qi + 1) % this.QUESTIONS.length;
    const Q = this.QUESTIONS[this.qi];
    this.q.textContent = Q.q;
    this.opts.forEach((o, i) => {
      o.textContent = Q.opts[i];
      o.className = '';
    });
    this.root.classList.remove('pv-new');
    void this.root.offsetWidth; // 다시 시작하도록
    this.root.classList.add('pv-new');
    this.qt = 0;
    this.answered = false;
  },

  tick(dt) {
    const b = this.band;
    // 화면 스타일(색)이 정해진 다음에 처음 그린다
    if (!this.started) {
      this.started = true;
      b.setLook({ scenic: true });
      b.dist = this.score;
      this.nextQuestion();
    }
    dt = Math.min(dt, 0.1);
    this.t += dt;
    b.cfg = this.app.cfg;
    const tol = b.cfg.tolerance;

    // 페달 속도: 대개 초록 구간 안에서 살짝 흔들리고, 주기마다 잠깐 느려졌다가 돌아온다
    const c = this.t % this.CYCLE_SEC;
    const slow = U.clamp(Math.min((c - 11) / 0.8, (14 - c) / 1.2), 0, 1);
    const dev = tol * 0.45 * Math.sin(this.t * 0.5) - slow * tol * 1.9;
    const rpm = Math.round(60 * (1 + dev) + 1.5 * Math.sin(this.t * 1.7));
    if (b.inZone) this.score += 13 * dt;

    // 두뇌 게임: 잠깐 생각하고 정답을 고르면 자전거가 반짝하며 점수가 오른다
    this.qt += dt;
    if (!this.answered && this.qt >= this.ANSWER_AT) {
      this.answered = true;
      const a = this.QUESTIONS[this.qi].a;
      this.opts.forEach((o, i) => o.classList.add(i === a ? 'ok' : 'dim'));
      b.celebrate();
      b.addFloater('+30', 'good');
      this.score += 30;
    }
    if (this.qt >= this.Q_SEC) this.nextQuestion();

    b.dayT = 0.05 + 0.65 * (1 - Math.cos((2 * Math.PI * this.t) / this.DAY_SEC)) / 2;
    b.update(dt, rpm, dev, this.score);
    b.draw();

    const s = Math.round(b.dist).toLocaleString('ko-KR');
    if (this.scoreEl.textContent !== s) this.scoreEl.textContent = s;
    const left = U.fmtTime(Math.ceil(300 - (this.t % 300)));
    if (this.timeEl.textContent !== left) this.timeEl.textContent = left;
  },
};
