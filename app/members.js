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
    const $ = (selector) => document.querySelector(selector);
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
      const fileInput = $('#lg-photo-file');
      fileInput.value = ''; // 같은 사진을 다시 골라도 change 가 오게
      fileInput.click();
    };
    $('#lg-photo-file').addEventListener('change', (event) => {
      demo.activeAt = app.clock; // 사진을 고르는 동안 자리 비움으로 넘어가지 않게
      if (event.target.files[0]) this.fromPhoto(event.target.files[0]);
    });
    $('#lg-keys').addEventListener('click', (event) => {
      const key = event.target.closest('button');
      if (!key) return;
      if (key.dataset.k === 'del') this.code = this.code.slice(0, -1);
      else if (key.dataset.k === 'ok') return this.submitCode();
      else if (this.code.length < 8) this.code += key.textContent;
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
    const app = this.app;
    this.via = via;
    this.user = null;
    this.guest = false;
    this.showPad(false);
    document.getElementById('lg-photo').hidden = !onPhone();
    document.getElementById('lg-photo-msg').textContent = '';
    app.show('login');
    app.state = 'login';
    this.demo.activeAt = app.clock;
    if (app.config.sound) app.audio.ambient(true);
    this.startCamera();
  },

  startCamera() {
    const message = document.getElementById('lg-cam-msg');
    const box = document.querySelector('.lg-cam');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      box.classList.add('off');
      message.textContent = onPhone() ? '이 기기에서는 카메라를 쓸 수 없어요. 사진이나 번호로 들어가 주세요' : '이 기기에서는 카메라를 쓸 수 없어요. 번호로 들어가 주세요';
      return;
    }
    QrScanner.start(document.getElementById('lg-video'), (text) => {
      const id = Members.parse(text);
      if (id && this.app.state === 'login') this.login(id);
    }, (state) => {
      box.classList.toggle('off', state === 'denied');
      message.textContent = state === 'denied'
        ? (onPhone() ? '카메라를 켜지 못했어요. 사진이나 번호로 들어가 주세요' : '카메라를 켜지 못했어요. 번호로 들어가 주세요')
        : state === 'starting' ? '카메라를 켜는 중…' : '휴대폰에 찍어 둔 QR 코드를 화면 위쪽 카메라에 비춰 주세요';
    });
  },

  // 사진으로 들어가기: 고른 사진에서 회원 번호를 읽는다
  async fromPhoto(file) {
    const message = document.getElementById('lg-photo-msg');
    message.className = 'lg-photo-msg';
    message.textContent = '사진을 읽는 중…';
    let id = null;
    try {
      id = Members.parse((await QrScanner.readImage(file)) || '');
    } catch { }
    if (this.app.state !== 'login') return;
    if (id) {
      message.textContent = '';
      this.login(id);
    } else {
      message.className = 'lg-photo-msg bad';
      message.textContent = '이 사진에서 회원 카드를 찾지 못했어요. 저장해 둔 회원 카드 사진을 골라 주세요';
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
    const sourceNote = document.getElementById('hs-src');
    delete Members.remote[id];
    if (!Members.hasRemote()) { sourceNote.textContent = ''; return; }
    const local = SessionUpload.settings().localHistory;
    sourceNote.textContent = '다른 태블릿의 기록도 불러오는 중…';
    try {
      const list = await Members.fetchRemote(id);
      if (this.user !== id) return;
      // 시험용 로컬 서버는 언제나 알린다. 실제 서버로 착각하지 않게
      sourceNote.textContent = local ? `시험용: 이 태블릿의 세션 로그를 서버 대신 썼어요 (${list.length}건)`
        : list && list.length ? '다른 태블릿의 기록까지 모두 보여 드려요' : '';
    } catch {
      if (this.user !== id) return;
      sourceNote.textContent = '지금은 서버에 연결하지 못해 이 태블릿의 기록만 보여 드려요';
    }
    if (this.app.state === 'history') this.renderHistory();
  },

  showPad(visible) {
    this.code = '';
    document.getElementById('lg-pad').hidden = !visible;
    document.getElementById('lg-choices').hidden = visible;
    document.getElementById('lg-pad-msg').textContent = 'QR 코드 아래에 적힌 8자리 번호';
    this.renderPad();
  },

  renderPad() {
    const slots = (this.code + '________').slice(0, 8);
    document.getElementById('lg-digits').innerHTML = [...slots].map((digit, i) => `${i === 4 ? '<em></em>' : ''}<i class="${digit === '_' ? '' : 'on'}">${digit === '_' ? '' : digit}</i>`).join('');
  },

  submitCode() {
    const id = this.code;
    const message = document.getElementById('lg-pad-msg');
    if (id.length < 8) { message.textContent = '8자리를 모두 눌러 주세요'; return; }
    if (!Members.valid(id)) {
      message.textContent = '번호가 맞지 않아요. 다시 확인해 주세요';
      const digits = document.getElementById('lg-digits');
      digits.classList.remove('shake');
      void digits.offsetWidth;
      digits.classList.add('shake');
      this.code = '';
      this.renderPad();
      return;
    }
    this.login(id);
  },

  // ---------------- 기록 (달력) ----------------
  openHistory() {
    const app = this.app;
    const now = new Date();
    this.month = new Date(now.getFullYear(), now.getMonth(), 1);
    this.renderHistory();
    app.show('history');
    app.state = 'history';
    this.demo.activeAt = app.clock;
  },

  moveMonth(step) {
    const month = new Date(this.month.getFullYear(), this.month.getMonth() + step, 1);
    const now = new Date();
    if (month > new Date(now.getFullYear(), now.getMonth(), 1)) return;
    if (month < new Date(now.getFullYear() - 2, now.getMonth(), 1)) return;
    this.month = month;
    this.renderHistory();
  },

  renderHistory() {
    const id = this.user;
    const sessions = Members.merged(id);
    const dayKey = (date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    const byDay = {};
    for (const session of sessions) {
      const key = dayKey(new Date(session.at));
      byDay[key] = (byDay[key] || 0) + 1;
    }
    const now = new Date();
    const month = this.month;
    document.getElementById('hs-title').textContent = sessions.length ? '다시 오셨네요, 반가워요!' : '첫 트레이닝을 시작해 볼까요?';
    document.getElementById('hs-id').textContent = `회원 번호 ${Members.format(id)}`;
    document.getElementById('hs-month').textContent = `${month.getFullYear()}년 ${month.getMonth() + 1}월`;
    const isThisMonth = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
    document.getElementById('hs-next').disabled = isThisMonth;
    // 달력: 일요일부터
    const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    let calendarHtml = ['일', '월', '화', '수', '목', '금', '토'].map((weekday, i) => `<b class="${i === 0 ? 'sun' : ''}">${weekday}</b>`).join('');
    for (let i = 0; i < firstWeekday; i++) calendarHtml += '<span></span>';
    let monthCount = 0;
    for (let day = 1; day <= days; day++) {
      const date = new Date(month.getFullYear(), month.getMonth(), day);
      const dayCount = byDay[dayKey(date)] || 0;
      monthCount += dayCount;
      const classes = [dayCount ? 'done' : '', isThisMonth && day === now.getDate() ? 'today' : '', date > now ? 'future' : ''].filter(Boolean).join(' ');
      calendarHtml += `<span class="${classes}">${day}${dayCount > 1 ? `<small>${dayCount}</small>` : ''}</span>`;
    }
    document.getElementById('hs-cal').innerHTML = calendarHtml;
    // 숫자 요약과 최근 기록
    const thisMonth = sessions.filter((session) => { const date = new Date(session.at); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth(); }).length;
    const last = sessions[sessions.length - 1];
    const ago = last ? Math.round((new Date(now.toDateString()) - new Date(new Date(last.at).toDateString())) / 86400000) : null;
    document.getElementById('hs-stats').innerHTML = [
      ['이번 달', `${thisMonth}<small>번</small>`],
      ['모두', `${sessions.length}<small>번</small>`],
      ['지난번', last ? (ago === 0 ? '오늘' : ago === 1 ? '어제' : `${ago}<small>일 전</small>`) : '–'],
    ].map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('');
    const difficultyLabel = (difficultyId) => (SESSION_DIFFICULTIES.find((difficulty) => difficulty.id === difficultyId) || {}).label || '';
    const weekdayNames = ['일', '월', '화', '수', '목', '금', '토'];
    document.getElementById('hs-recent').innerHTML = sessions.length
      ? sessions.slice(-4).reverse().map((session) => {
        const date = new Date(session.at);
        return `<li><span>${date.getMonth() + 1}월 ${date.getDate()}일 (${weekdayNames[date.getDay()]})</span><span>${session.min ?? '–'}분 ·${difficultyLabel(session.difficulty)}${session.track === 'brain' ? ' · 두뇌만' : ''}</span><b>${(session.score || 0).toLocaleString('ko-KR')}점</b></li>`;
      }).join('')
      : `<li class="empty">${Members.hasRemote() ? '아직 기록이 없어요' : '이 태블릿에는 아직 기록이 없어요'}. 오늘 트레이닝부터 쌓여요</li>`;
    // 받침이 있으면(ㄹ 받침 빼고) '으로', 없으면 '로'
    const roParticle = (word) => { const syllable = word.charCodeAt(word.length - 1) - 0xac00; return syllable >= 0 && syllable < 11172 && syllable % 28 && syllable % 28 !== 8 ? '으로' : '로'; };
    const next = Members.nextSetup(last);
    const nextDifficulty = next ? difficultyLabel(next.difficulty) : '';
    const tail = `${next && next.track === 'brain' ? ' · 두뇌 게임만' : ''}${next ? roParticle(next.track === 'brain' ? '만' : nextDifficulty) : ''} 골라 둘게요`;
    const summary = !next ? '다음 화면에서 시간과 난이도를 골라요'
      : next.shift === 'up' ? `지난번에 아주 잘하셔서 난이도를 올려 ${next.min}분 · ${nextDifficulty}${tail}`
      : next.shift === 'down' ? `이번엔 조금 편하게 ${next.min}분 · ${nextDifficulty}${tail}`
      : `지난번처럼 ${next.min}분 · ${nextDifficulty}${tail}`;
    document.getElementById('hs-sum').textContent = summary;
    void monthCount;
  },

  // ---------------- 매 프레임 ----------------
  tick(app, entered) {
    if (app.state !== 'login') QrScanner.stop();
    if (app.state === 'attract' && entered) {
      this.user = null;
      this.guest = false;
    }
    if ((app.state === 'login' || app.state === 'history') && (app.clock - this.demo.activeAt) / 1000 > this.IDLE_SEC) app.show('attract');
  },

  // 풍경에 세울 지난 세션들 (js/band.js setLandmarks). 기념물 종류는 난이도, 크기는 시간으로 정한다. 손님은 없다
  landmarks() {
    if (!this.user) return [];
    return Members.merged(this.user).map((session) => ({
      // eslint-disable-next-line id-length -- 기록 항목 형식 (js/band.js 가 읽는다)
      score: session.score || 0, at: session.at, difficulty: session.difficulty, min: session.min, look: session.look || null,
      key: session.sid ? `${session.device || ''}:${session.sid}` : session.at,
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
  onResult(app, simulated) {
    const box = document.getElementById('dr-member');
    if (!box) return;
    // 새 회원 카드를 보여 줄 때만 결과 화면의 첫 칸을 넓힌다 (app/app.css .with-card)
    const screen = document.getElementById('demo-result');
    screen.classList.remove('with-card');
    if (simulated) {
      box.innerHTML = '<p class="dm-note">가상 결과라 기록하지 않아요</p>';
      return;
    }
    const fresh = !this.user;
    if (fresh) this.user = Members.newId();
    const id = this.user;
    if (app.log) {
      app.log.meta.user = id;
      app.log.meta.userNew = fresh;
    }
    const games = (app.roundStats && app.roundStats.games) || {}; // 게임별 성적 (js/round-stats.js)
    const topLevel = Math.max(0, ...Object.values(games).map((game) => game.level || 0));
    const session = app.log && app.log.meta.session;
    Members.record(id, {
      // eslint-disable-next-line id-length -- localStorage 에 저장하는 기록 항목 형식
      at: new Date().toISOString(), min: session ? session.min : Math.round(app.config.durationSec / 60), difficulty: session ? session.difficulty : 'normal',
      track: app.brainOnly ? 'brain' : 'dual', // 두뇌 게임만 한 판인가 (페달 + 두뇌 게임이면 dual)
      score: app.score, distM: Math.round(app.meter.distM), kcal: Math.round(app.meter.kcal * 10) / 10, level: topLevel,
      gameAcc: (() => { const accuracy = Stars.gameAccuracy(games); return accuracy == null ? null : Math.round(accuracy * 100) / 100; })(),
      ended: app.log ? app.log.meta.ended : null,
      // 서버 기록과 겹치는지 가리는 열쇠 (세션 로그의 meta.device + meta.id)
      device: app.log ? app.log.meta.device : null, sid: app.log ? app.log.meta.id : null,
      // 풍경에 세운 기념물의 생김새 (js/landmarks.js Landmarks.look). 다음 라운드부터 이대로 그린다
      look: (app.log && app.log.meta.landmark) || null,
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
      const saveButton = box.querySelector('.dm-save');
      const saveMessage = box.querySelector('.dm-save-msg');
      let cardBlob = null;
      drawCard(id).then((blob) => {
        cardBlob = blob;
        saveButton.disabled = false;
      });
      saveButton.onclick = async () => {
        if (!cardBlob) return;
        const notice = await saveCard(cardBlob, id);
        if (notice) saveMessage.textContent = notice;
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
      const recordCount = Members.merged(id).length;
      box.innerHTML = `<p class="dm-saved"><b>${recordCount}번째 트레이닝</b>을 기록했어요<br><span>회원 ${Members.format(id)}</span></p>`;
    }
  },
};
