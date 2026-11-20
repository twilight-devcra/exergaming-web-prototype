// 회원 화면 (실험, 운영 버전만): 로그인 · 기록 · 결과의 회원 카드. 서버 없이 QR 코드로 같은 사람을 알아본다.
// 번호·기록은 app/member-records.js, QR 그리기·읽기는 app/qr.js
//  - 회원 번호: 8자리 숫자 (앞 7자리 무작위 + 끝 1자리 검사 숫자, Luhn). 이름 같은 개인 정보는 받지 않는다
//  - QR 코드: 회원 카드 주소 (app/card.html#번호). 휴대폰으로 찍으면 카드 화면이 열리고, 태블릿은 주소에서 번호만 읽는다
//  - 기록: 이 태블릿의 localStorage (exergame.members). 다른 태블릿에서 만든 번호로 들어와도 되지만 기록은 태블릿마다 따로다.
//    세션 로그에는 meta.user 로 번호가 붙어 업로드되므로, 바깥 DB 에서 모으면 태블릿을 넘어 이어 볼 수 있다
// 흐름: 대기 화면 → 로그인(카메라로 QR · 번호 입력 · 손님) → 회원이면 기록(달력) → 세션 설정 → … → 결과
//       손님은 결과 화면에서 새 회원 번호와 QR 코드를 받는다 (오늘 기록이 그 번호로 저장된다)
import { SESSION_DIFFICULTIES } from '../js/config.js';
import { Stars } from '../js/stars.js';
import { SessionUpload } from '../js/session-upload.js';
import { drawCard, saveCard } from './member-card.js';
import { Sfx } from '../js/sfx.js';
import { Members } from './member-records.js';
import { qrSvg, QrScanner } from './qr.js';

// 휴대폰에서 하는 판인가. 휴대폰은 제 화면을 제 카메라로 비출 수 없으므로 회원 카드를 사진으로 저장하고 사진으로 읽는다.
// 화면의 짧은 쪽이 600px 보다 작은 터치 기기 (스테이션 태블릿은 800px 쯤이다)
const onPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;

// ---------------- 화면: 로그인 · 기록 · 결과의 회원 카드 ----------------
// js/demo.js 가 부른다: openLogin(대기 화면에서 시작), tick(매 프레임), onResult(결과 화면을 열 때)
export const MemberUI = {
  IDLE_SEC: 60, // 로그인·기록 화면에서 아무 입력이 없으면 대기 화면으로
  user: null,   // 로그인한 회원 번호 (손님이면 null)
  guest: false,

  init(demo, app) {
    if (!document.getElementById('login')) return null;
    this.demo = demo;
    this.app = app;
    const $ = (s) => document.querySelector(s);
    for (const id of ['#login', '#history']) {
      $(id).addEventListener('pointerdown', () => {
        demo.activeAt = app.clock;
        app.audio.ensure();
      });
    }
    $('#lg-back').onclick = () => app.show('attract');
    $('#hs-back').onclick = () => app.show('attract');
    $('#lg-guest').onclick = () => this.asGuest();
    $('#lg-code').onclick = () => this.showPad(true);
    $('#lg-pad-cancel').onclick = () => this.showPad(false);
    $('#lg-photo').onclick = () => {
      const f = $('#lg-photo-file');
      f.value = ''; // 같은 사진을 다시 골라도 change 가 오게
      f.click();
    };
    $('#lg-photo-file').addEventListener('change', (e) => {
      demo.activeAt = app.clock; // 사진을 고르는 동안 자리 비움으로 넘어가지 않게
      if (e.target.files[0]) this.fromPhoto(e.target.files[0]);
    });
    $('#lg-keys').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.k === 'del') this.code = this.code.slice(0, -1);
      else if (b.dataset.k === 'ok') return this.submitCode();
      else if (this.code.length < 8) this.code += b.textContent;
      this.renderPad();
    });
    $('#hs-prev').onclick = () => this.moveMonth(-1);
    $('#hs-next').onclick = () => this.moveMonth(1);
    $('#hs-go').onclick = () => {
      if (app.state !== 'history') return;
      const last = Members.merged(this.user).slice(-1)[0];
      const next = Members.nextSetup(last);
      demo.openSetup(this.via, next && { min: next.min, difficulty: next.difficulty, track: next.track });
    };
    return this;
  },

  // ---------------- 로그인 ----------------
  openLogin(via) {
    const a = this.app;
    this.via = via;
    this.user = null;
    this.guest = false;
    this.showPad(false);
    document.getElementById('lg-photo').hidden = !onPhone();
    document.getElementById('lg-photo-msg').textContent = '';
    a.show('login');
    a.state = 'login';
    this.demo.activeAt = a.clock;
    if (a.cfg.sound) a.audio.ambient(true);
    this.startCamera();
  },

  startCamera() {
    const msg = document.getElementById('lg-cam-msg');
    const box = document.querySelector('.lg-cam');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      box.classList.add('off');
      msg.textContent = onPhone() ? '이 기기에서는 카메라를 쓸 수 없어요. 사진이나 번호로 들어가 주세요' : '이 기기에서는 카메라를 쓸 수 없어요. 번호로 들어가 주세요';
      return;
    }
    QrScanner.start(document.getElementById('lg-video'), (text) => {
      const id = Members.parse(text);
      if (id && this.app.state === 'login') this.login(id);
    }, (st) => {
      box.classList.toggle('off', st === 'denied');
      msg.textContent = st === 'denied'
        ? (onPhone() ? '카메라를 켜지 못했어요. 사진이나 번호로 들어가 주세요' : '카메라를 켜지 못했어요. 번호로 들어가 주세요')
        : st === 'starting' ? '카메라를 켜는 중…' : '휴대폰에 찍어 둔 QR 코드를 화면 위쪽 카메라에 비춰 주세요';
    });
  },

  // 사진으로 들어가기: 고른 사진에서 회원 번호를 읽는다
  async fromPhoto(file) {
    const msg = document.getElementById('lg-photo-msg');
    msg.className = 'lg-photo-msg';
    msg.textContent = '사진을 읽는 중…';
    let id = null;
    try {
      id = Members.parse((await QrScanner.readImage(file)) || '');
    } catch (e) { }
    if (this.app.state !== 'login') return;
    if (id) {
      msg.textContent = '';
      this.login(id);
    } else {
      msg.className = 'lg-photo-msg bad';
      msg.textContent = '이 사진에서 회원 카드를 찾지 못했어요. 저장해 둔 회원 카드 사진을 골라 주세요';
    }
  },

  asGuest() {
    if (this.app.state !== 'login') return;
    QrScanner.stop();
    this.user = null;
    this.guest = true;
    this.demo.openSetup(this.via);
  },

  login(id) {
    QrScanner.stop();
    Members.ensure(id);
    this.user = id;
    this.guest = false;
    this.app.audio.sfx(Sfx.CLEAR);
    this.openHistory();
    this.loadRemote(id);
  },

  // 서버에서 이 회원의 다른 태블릿 기록까지 받아 와 달력을 다시 그린다. 그동안은 이 태블릿 기록만 보인다
  async loadRemote(id) {
    const src = document.getElementById('hs-src');
    delete Members.remote[id];
    if (!Members.hasRemote()) { src.textContent = ''; return; }
    const local = SessionUpload.settings().localHistory;
    src.textContent = '다른 태블릿의 기록도 불러오는 중…';
    try {
      const list = await Members.fetchRemote(id);
      if (this.user !== id) return;
      // 시험용 로컬 서버는 언제나 알린다. 실제 서버로 착각하지 않게
      src.textContent = local ? `시험용: 이 태블릿의 세션 로그를 서버 대신 썼어요 (${list.length}건)`
        : list && list.length ? '다른 태블릿의 기록까지 모두 보여 드려요' : '';
    } catch (e) {
      if (this.user !== id) return;
      src.textContent = '지금은 서버에 연결하지 못해 이 태블릿의 기록만 보여 드려요';
    }
    if (this.app.state === 'history') this.renderHistory();
  },

  showPad(on) {
    this.code = '';
    document.getElementById('lg-pad').hidden = !on;
    document.getElementById('lg-choices').hidden = on;
    document.getElementById('lg-pad-msg').textContent = 'QR 코드 아래에 적힌 8자리 번호';
    this.renderPad();
  },

  renderPad() {
    const d = (this.code + '________').slice(0, 8);
    document.getElementById('lg-digits').innerHTML = [...d].map((c, i) => `${i === 4 ? '<em></em>' : ''}<i class="${c === '_' ? '' : 'on'}">${c === '_' ? '' : c}</i>`).join('');
  },

  submitCode() {
    const id = this.code;
    const msg = document.getElementById('lg-pad-msg');
    if (id.length < 8) { msg.textContent = '8자리를 모두 눌러 주세요'; return; }
    if (!Members.valid(id)) {
      msg.textContent = '번호가 맞지 않아요. 다시 확인해 주세요';
      const el = document.getElementById('lg-digits');
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
      this.code = '';
      this.renderPad();
      return;
    }
    this.login(id);
  },

  // ---------------- 기록 (달력) ----------------
  openHistory() {
    const a = this.app;
    const now = new Date();
    this.month = new Date(now.getFullYear(), now.getMonth(), 1);
    this.renderHistory();
    a.show('history');
    a.state = 'history';
    this.demo.activeAt = a.clock;
  },

  moveMonth(step) {
    const m = new Date(this.month.getFullYear(), this.month.getMonth() + step, 1);
    const now = new Date();
    if (m > new Date(now.getFullYear(), now.getMonth(), 1)) return;
    if (m < new Date(now.getFullYear() - 2, now.getMonth(), 1)) return;
    this.month = m;
    this.renderHistory();
  },

  renderHistory() {
    const id = this.user;
    const hist = Members.merged(id);
    const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const byDay = {};
    for (const h of hist) {
      const k = dayKey(new Date(h.at));
      byDay[k] = (byDay[k] || 0) + 1;
    }
    const now = new Date();
    const m = this.month;
    document.getElementById('hs-title').textContent = hist.length ? '다시 오셨네요, 반가워요!' : '첫 트레이닝을 시작해 볼까요?';
    document.getElementById('hs-id').textContent = `회원 번호 ${Members.format(id)}`;
    document.getElementById('hs-month').textContent = `${m.getFullYear()}년 ${m.getMonth() + 1}월`;
    const isThisMonth = m.getFullYear() === now.getFullYear() && m.getMonth() === now.getMonth();
    document.getElementById('hs-next').disabled = isThisMonth;
    // 달력: 일요일부터
    const first = new Date(m.getFullYear(), m.getMonth(), 1).getDay();
    const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    let h = ['일', '월', '화', '수', '목', '금', '토'].map((w, i) => `<b class="${i === 0 ? 'sun' : ''}">${w}</b>`).join('');
    for (let i = 0; i < first; i++) h += '<span></span>';
    let monthCount = 0;
    for (let d = 1; d <= days; d++) {
      const date = new Date(m.getFullYear(), m.getMonth(), d);
      const n = byDay[dayKey(date)] || 0;
      monthCount += n;
      const cls = [n ? 'done' : '', isThisMonth && d === now.getDate() ? 'today' : '', date > now ? 'future' : ''].filter(Boolean).join(' ');
      h += `<span class="${cls}">${d}${n > 1 ? `<small>${n}</small>` : ''}</span>`;
    }
    document.getElementById('hs-cal').innerHTML = h;
    // 숫자 요약과 최근 기록
    const thisMonth = hist.filter((x) => { const d = new Date(x.at); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }).length;
    const last = hist[hist.length - 1];
    const ago = last ? Math.round((new Date(now.toDateString()) - new Date(new Date(last.at).toDateString())) / 86400000) : null;
    document.getElementById('hs-stats').innerHTML = [
      ['이번 달', `${thisMonth}<small>번</small>`],
      ['모두', `${hist.length}<small>번</small>`],
      ['지난번', last ? (ago === 0 ? '오늘' : ago === 1 ? '어제' : `${ago}<small>일 전</small>`) : '–'],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    const diffLabel = (id) => (SESSION_DIFFICULTIES.find((d) => d.id === id) || {}).label || '';
    const wd = ['일', '월', '화', '수', '목', '금', '토'];
    document.getElementById('hs-recent').innerHTML = hist.length
      ? hist.slice(-4).reverse().map((x) => {
        const d = new Date(x.at);
        return `<li><span>${d.getMonth() + 1}월 ${d.getDate()}일 (${wd[d.getDay()]})</span><span>${x.min ?? '–'}분 ·${diffLabel(x.difficulty)}${x.track === 'brain' ? ' · 두뇌만' : ''}</span><b>${(x.score || 0).toLocaleString('ko-KR')}점</b></li>`;
      }).join('')
      : `<li class="empty">${Members.hasRemote() ? '아직 기록이 없어요' : '이 태블릿에는 아직 기록이 없어요'}. 오늘 트레이닝부터 쌓여요</li>`;
    // 받침이 있으면(ㄹ 받침 빼고) '으로', 없으면 '로'
    const ro = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c < 11172 && c % 28 && c % 28 !== 8 ? '으로' : '로'; };
    const next = Members.nextSetup(last);
    const dl = next ? diffLabel(next.difficulty) : '';
    const tail = `${next && next.track === 'brain' ? ' · 두뇌 게임만' : ''}${next ? ro(next.track === 'brain' ? '만' : dl) : ''} 골라 둘게요`;
    const sum = !next ? '다음 화면에서 시간과 난이도를 골라요'
      : next.shift === 'up' ? `지난번에 아주 잘하셔서 난이도를 올려 ${next.min}분 · ${dl}${tail}`
      : next.shift === 'down' ? `이번엔 조금 편하게 ${next.min}분 · ${dl}${tail}`
      : `지난번처럼 ${next.min}분 · ${dl}${tail}`;
    document.getElementById('hs-sum').textContent = sum;
    void monthCount;
  },

  // ---------------- 매 프레임 ----------------
  tick(a, entered) {
    if (a.state !== 'login') QrScanner.stop();
    if (a.state === 'attract' && entered) {
      this.user = null;
      this.guest = false;
    }
    if ((a.state === 'login' || a.state === 'history') && (a.clock - this.demo.activeAt) / 1000 > this.IDLE_SEC) a.show('attract');
  },

  // 풍경에 세울 지난 세션들 (js/band.js setLandmarks). 기념물 종류는 난이도, 크기는 시간으로 정한다. 손님은 없다
  landmarks() {
    if (!this.user) return [];
    return Members.merged(this.user).map((x) => ({
      score: x.score || 0, at: x.at, difficulty: x.difficulty, min: x.min, look: x.look || null,
      key: x.sid ? `${x.device || ''}:${x.sid}` : x.at,
    }));
  },

  // 이번 라운드가 이 회원의 몇 번째 기록인가 (라운드 끝 기념물의 이름표). 손님은 결과 화면에서 회원 번호를 받으므로 첫 기록이다
  nextCount() {
    return (this.user ? Members.merged(this.user).length : 0) + 1;
  },

  // 라운드를 시작할 때 세션 로그에 회원 번호를 붙인다
  tagLog(log) {
    log.meta.user = this.user;
    log.meta.guest = this.guest || !this.user;
  },

  // ---------------- 결과 화면 ----------------
  // 손님이면 새 번호를 만들어 오늘 기록을 그 번호로 저장하고 QR 카드를 보여 준다. 회원이면 기록에 더한다
  onResult(a, sim) {
    const box = document.getElementById('dr-member');
    if (!box) return;
    // 새 회원 카드를 보여 줄 때만 결과 화면의 첫 칸을 넓힌다 (app/app.css .with-card)
    const screen = document.getElementById('demo-result');
    screen.classList.remove('with-card');
    if (sim) {
      box.innerHTML = '<p class="dm-note">가상 결과라 기록하지 않아요</p>';
      return;
    }
    const fresh = !this.user;
    if (fresh) this.user = Members.newId();
    const id = this.user;
    if (a.log) {
      a.log.meta.user = id;
      a.log.meta.userNew = fresh;
    }
    const games = (a.roundStats && a.roundStats.games) || {}; // 게임별 성적 (js/round-stats.js)
    const lv = Math.max(0, ...Object.values(games).map((s) => s.level || 0));
    const s = a.log && a.log.meta.session;
    Members.record(id, {
      at: new Date().toISOString(), min: s ? s.min : Math.round(a.cfg.durationSec / 60), difficulty: s ? s.difficulty : 'normal',
      track: a.brainOnly ? 'brain' : 'dual', // 두뇌 게임만 한 판인가 (페달 + 두뇌 게임이면 dual)
      score: a.score, distM: Math.round(a.meter.distM), kcal: Math.round(a.meter.kcal * 10) / 10, level: lv,
      gameAcc: (() => { const acc = Stars.gameAcc(games); return acc == null ? null : Math.round(acc * 100) / 100; })(),
      ended: a.log ? a.log.meta.ended : null,
      // 서버 기록과 겹치는지 가리는 열쇠 (세션 로그의 meta.device + meta.id)
      device: a.log ? a.log.meta.device : null, sid: a.log ? a.log.meta.id : null,
      // 풍경에 세운 기념물의 생김새 (js/landmarks.js Landmarks.look). 다음 라운드부터 이대로 그린다
      look: (a.log && a.log.meta.landmark) || null,
    });
    document.getElementById('dr-id').textContent = `회원 ${Members.format(id)}`;
    if (fresh && onPhone()) {
      // 휴대폰: 이 휴대폰으로 QR 을 비출 수 없으니 회원 카드 그림을 바로 갤러리에 저장한다 (app/card.html 과 같은 그림).
      // 그림은 미리 그려 둔다: iPhone 의 공유 창(navigator.share)은 누른 순간 곧바로 불러야 열린다
      screen.classList.add('with-card');
      box.innerHTML = `
        <div class="dm-new dm-phone">
          <h4><em>새 회원</em>회원 카드를 이 휴대폰에 저장하세요</h4>
          <button class="dm-save" type="button" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-5-5m5 5l5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
            회원 카드 저장
          </button>
          <p class="dm-save-msg" aria-live="polite"></p>
          <p class="dm-id">다음에는 '회원 카드가 있으신가요?' 화면에서 <strong>사진으로 들어가기</strong>를 누르고 저장한 카드를 고르세요. 회원 번호 <b>${Members.format(id)}</b> 를 눌러도 돼요</p>
        </div>`;
      const btn = box.querySelector('.dm-save');
      const msg = box.querySelector('.dm-save-msg');
      let blob = null;
      drawCard(id).then((b) => {
        blob = b;
        btn.disabled = false;
      });
      btn.onclick = async () => {
        if (!blob) return;
        const m = await saveCard(blob, id);
        if (m) msg.textContent = m;
      };
    } else if (fresh) {
      screen.classList.add('with-card');
      // 사진으로 찍어 두면 QR 이 작아 태블릿이 잘 못 읽는다. 휴대폰 카메라로 비춰 링크를 열고, 회원 카드 화면(app/card.html)에서
      // '갤러리에 저장' 한 큰 QR 그림을 쓰도록 안내한다. 결과 화면에서 눈에 잘 띄도록 따로 강조한 칸에 둔다
      box.innerHTML = `
        <div class="dm-new">
          <h4><em>새 회원</em>회원 카드를 휴대폰에 담아 가세요</h4>
          <div class="dm-card">
            <div class="dm-qr">${qrSvg(Members.cardUrl(id))}</div>
            <ol class="dm-steps">
              <li>휴대폰 <b>카메라를 켜고</b> 이 QR 코드에 <b>비춰</b> 주세요 <small>(사진은 찍지 않아도 돼요)</small></li>
              <li>화면에 뜨는 <b>링크를 누르면</b> 회원 카드가 열려요</li>
              <li>회원 카드의 <b>'갤러리에 저장'</b>을 누르세요</li>
            </ol>
          </div>
          <p class="dm-id">다음에 오시면 저장한 사진을 태블릿 카메라에 보여 주세요. 안 되면 회원 번호 <b>${Members.format(id)}</b> 를 눌러도 돼요</p>
        </div>`;
    } else {
      const n = Members.merged(id).length;
      box.innerHTML = `<p class="dm-saved"><b>${n}번째 트레이닝</b>을 기록했어요<br><span>회원 ${Members.format(id)}</span></p>`;
    }
  },
};
