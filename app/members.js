// 회원 화면 (운영 버전만): 로그인 · 기록 · 결과의 회원 카드.
// 번호·아이디·기록은 app/member-records.js, 아이디 규칙은 js/member-id.js, QR 그리기·읽기는 app/qr.js
//  - 아이디: 담당자가 로그인 과정을 맡는다. '새 아이디 만들기'로 글 아이디를 만들고(겹치면 안 됨), '아이디로 들어가기'의 목록에서 골라 준다.
//    운영 메뉴의 '센터/단체명'(아이디 접두어)이 앞에 붙어 '<접두어>_<아이디>' 로 저장된다 (화면에는 아이디만)
//  - 회원 번호: 8자리 숫자 (앞 7자리 무작위 + 끝 1자리 검사 숫자, Luhn). QR 회원 카드로 들어온다. 이름 같은 개인 정보는 받지 않는다
//  - QR 코드: 회원 카드 주소 (app/card.html#번호). 휴대폰으로 찍으면 카드 화면이 열리고, 태블릿은 주소에서 번호만 읽는다
//  - 기록: 이 태블릿의 localStorage (exergame.members) + 서버 기록. 세션 로그에는 meta.user 로 번호·아이디가 붙어 업로드된다
// 흐름: 대기 화면 → 로그인 → 회원이면 기록(달력) → 세션 설정 → … → 결과
//       로그인 화면: 아이디로 들어가기(목록) · 새 아이디 만들기 · 손님으로 하기 · QR 회원 카드(카메라 · 번호 · 사진)
//       손님은 결과 화면에서 새 회원 번호와 QR 코드를 받고(오늘 기록이 그 번호로 저장된다), 그 대신 아이디를 만들어 저장할 수도 있다
import { SESSION_DIFFICULTIES, $, html } from '../js/config.js';
import { Stars } from '../js/stars.js';
import { Abilities } from '../js/abilities.js';
import { Radar } from '../js/radar.js';
import { RoundReport } from '../js/round-report.js';
import { compactGames } from '../js/history-entry.js';
import { SessionStore } from '../js/session-log.js';
import { SessionUpload } from '../js/session-upload.js';
import { MemberId } from '../js/member-id.js';
import { drawCard, saveCard } from './member-card.js';
import { Sfx } from '../js/sfx.js';
import { Members } from './member-records.js';
import { qrSvg, QrScanner } from './qr.js';

// 휴대폰에서 하는 판인가. 휴대폰은 제 화면을 제 카메라로 비출 수 없으므로 회원 카드를 사진으로 저장하고 사진으로 읽는다.
// 화면의 짧은 쪽이 600px 보다 작은 터치 기기 (스테이션 태블릿은 800px 쯤이다)
const onPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;

// 로그인 화면의 보기마다 제목 (app/index.html #login 의 data-view)
const LOGIN_TITLES = { home: '어떻게 시작할까요?', scan: 'QR 회원 카드로 들어가기', list: '아이디를 골라 주세요', number: '회원 번호를 눌러 주세요' };
// '돌아가기' 로 갈 보기 (회원 번호는 QR 보기의 '번호로 들어가기' 에서 온다)
const LOGIN_PARENT = { scan: 'home', list: 'home', number: 'scan' };

// 마지막 운동이 며칠 전인가 (아이디 목록의 작은 글)
function daysAgoText(isoTime) {
  if (!isoTime) return '';
  const days = Math.round((new Date(new Date().toDateString()) - new Date(new Date(isoTime).toDateString())) / 86400000);
  return days <= 0 ? '오늘' : days === 1 ? '어제' : `${days}일 전`;
}

// ---------------- 화면: 로그인 · 기록 · 결과의 회원 카드 ----------------
// js/demo.js 가 부른다: openLogin(대기 화면에서 시작), tick(매 프레임), onResult(결과 화면을 열 때)
export const MemberUI = {
  IDLE_SEC: 60, // 로그인·기록 화면에서 아무 입력이 없으면 대기 화면으로
  user: null,   // 로그인한 회원 번호 · 아이디 (손님이면 null)
  guest: false,
  view: 'home',   // 로그인 화면의 보기: home · list · number
  sort: 'name',   // 아이디 목록 순서: name(가나다) · recent(최근 운동)
  namedUsers: null, // 아이디 목록 (Members.namedList). 받는 중이면 null
  listServer: 'none',
  listRequest: null, // 마지막으로 보낸 목록 요청 (늦게 온 앞 요청의 답은 버린다)
  idForm: null,      // 열려 있는 새 아이디 창 { onCreated, busy }
  resultLog: null,   // 결과 화면의 세션 로그 (손님이 아이디로 저장하면 meta.user 를 고쳐 다시 저장한다)
  simulated: false,  // 지금 결과 화면이 가상 결과다 (기록하지 않는다)
  pick: null,        // 기록 화면 오른쪽 칸: null(숫자 요약·최근 기록) · { day: Date }(그날 고르기) · { key }(그 세션의 두뇌 그래프)

  init(demo, app) {
    if (!$('#login')) return null;
    this.demo = demo;
    this.app = app;
    for (const id of ['#login', '#history', '#id-new']) {
      $(id).addEventListener('pointerdown', () => {
        demo.activeAt = app.clock;
        app.audio.ensure();
      });
    }
    $('#lg-back').onclick = () => (this.view === 'home' ? app.show('attract') : this.showView(LOGIN_PARENT[this.view]));
    $('#hs-back').onclick = () => app.show('attract');
    // 처음 보기: 아이디 · QR 회원 카드 · 새 아이디 · 손님
    $('#lg-pick').onclick = () => this.openList();
    $('#lg-qr').onclick = () => app.state === 'login' && this.showView('scan');
    $('#lg-new').onclick = () => this.openIdForm({
      title: '새 아이디 만들기', okLabel: '만들기',
      onCreated: (id) => { if (this.app.state === 'login') this.login(id); },
    });
    $('#lg-guest').onclick = () => this.asGuest();
    // QR 회원 카드: 번호 · 사진
    $('#lg-code').onclick = () => this.showView('number');
    $('#lg-photo').onclick = () => {
      const fileInput = $('#lg-photo-file');
      fileInput.value = ''; // 같은 사진을 다시 골라도 change 가 오게
      fileInput.click();
    };
    $('#lg-photo-file').addEventListener('change', (event) => {
      demo.activeAt = app.clock; // 사진을 고르는 동안 자리 비움으로 넘어가지 않게
      if (event.target.files[0]) this.fromPhoto(event.target.files[0]);
    });
    // 아이디 목록
    $('#lg-sort').addEventListener('click', (event) => {
      const button = event.target.closest('[data-sort]');
      if (!button) return;
      this.sort = button.dataset.sort;
      this.renderList();
    });
    $('#lg-ids').addEventListener('click', (event) => {
      if (event.target.closest('#lg-ids-new')) return $('#lg-new').click();
      const button = event.target.closest('[data-id]');
      if (button && app.state === 'login' && this.view === 'list') this.login(button.dataset.id);
    });
    // 회원 번호
    $('#lg-keys').addEventListener('click', (event) => {
      const key = event.target.closest('button');
      if (!key) return;
      if (key.dataset.k === 'del') this.code = this.code.slice(0, -1);
      else if (key.dataset.k === 'ok') return this.submitCode();
      else if (this.code.length < 8) this.code += key.textContent;
      this.renderPad();
    });
    // 새 아이디 창
    $('#idn-form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.submitIdForm();
    });
    $('#idn-cancel').onclick = () => this.closeIdForm();
    $('#idn-input').addEventListener('input', () => {
      demo.activeAt = app.clock; // 화면 키보드로 적는 동안은 pointerdown 이 오지 않는다
      if (!this.idForm || !this.idForm.busy) this.idFormMessage('');
    });
    // 기록 (달력)
    $('#hs-prev').onclick = () => this.moveMonth(-1);
    $('#hs-next').onclick = () => this.moveMonth(1);
    // 지난 세션 고르기: 그래프를 그릴 수 있는 날짜 · 최근 기록 줄 · 세션 카드의 목록/앞뒤 단추
    $('#history').addEventListener('click', (event) => {
      if (app.state !== 'history') return;
      const day = event.target.closest('#hs-cal span.tap');
      const row = event.target.closest('li.tap[data-key]');
      const action = event.target.closest('[data-act]');
      if (day) this.pick = { day: new Date(this.month.getFullYear(), this.month.getMonth(), +day.dataset.day) };
      else if (row) this.pick = { key: row.dataset.key };
      else if (action && action.dataset.act === 'list') this.pick = null;
      else if (action && action.dataset.act === 'step' && !action.disabled) {
        this.pick = { key: action.dataset.key };
        const date = new Date(action.dataset.at);
        this.month = new Date(date.getFullYear(), date.getMonth(), 1);
      } else return;
      this.renderHistory();
    });
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
    $('#lg-photo').hidden = !onPhone();
    $('#lg-photo-msg').textContent = '';
    // 센터/단체명(아이디 접두어)이 없으면 아이디를 만들거나 고를 수 없다 (운영 메뉴에서 정한다)
    const hasPrefix = MemberId.validPrefix(Members.prefix());
    $('#lg-pick').disabled = !hasPrefix;
    $('#lg-new').disabled = !hasPrefix;
    $('#lg-note').textContent = hasPrefix ? '' : '아이디를 쓰려면 운영 메뉴에서 센터/단체명을 정해 주세요';
    app.show('login');
    app.state = 'login';
    this.demo.activeAt = app.clock;
    if (app.config.sound) app.audio.ambient(true);
    this.showView('home');
  },

  // 로그인 화면의 보기를 바꾼다. 카메라는 QR 보기(scan)에서만 켠다
  showView(view) {
    this.view = view;
    $('#login').dataset.view = view;
    $('#lg-title').textContent = LOGIN_TITLES[view];
    $('#lg-back').textContent = view === 'home' ? '‹ 처음으로' : '‹ 돌아가기';
    if (view === 'scan') {
      $('#lg-photo-msg').textContent = '';
      this.startCamera();
    }
    else QrScanner.stop();
    if (view === 'number') {
      this.code = '';
      $('#lg-pad-msg').textContent = 'QR 코드 아래에 적힌 8자리 번호';
      this.renderPad();
    }
  },

  startCamera() {
    const message = $('#lg-cam-msg');
    const box = $('.lg-cam');
    const fallback = onPhone() ? '사진이나 번호로 들어가 주세요' : '번호로 들어가 주세요';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      box.classList.add('off');
      message.textContent = `이 기기에서는 카메라를 쓸 수 없어요. ${fallback}`;
      return;
    }
    QrScanner.start($('#lg-video'), (text) => {
      const id = Members.parse(text);
      if (id && this.app.state === 'login' && this.view === 'scan') this.login(id);
    }, (state) => {
      box.classList.toggle('off', state === 'denied');
      message.textContent = state === 'denied' ? `카메라를 켜지 못했어요. ${fallback}`
        : state === 'starting' ? '카메라를 켜는 중…' : '휴대폰에 담아 둔 QR 코드를 화면 위쪽 카메라에 비춰 주세요';
    });
  },

  // 사진으로 들어가기: 고른 사진에서 회원 번호를 읽는다
  async fromPhoto(file) {
    const message = $('#lg-photo-msg');
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
    const sourceNote = $('#hs-src');
    delete Members.remote[id];
    // 잘 불러오면 아무것도 적지 않는다. 시험용 로컬 서버와 연결 실패만 알린다
    sourceNote.textContent = '';
    if (!Members.hasRemote()) return;
    const local = SessionUpload.settings().localHistory;
    try {
      const list = await Members.fetchRemote(id);
      if (this.user !== id) return;
      // 시험용 로컬 서버는 언제나 알린다. 실제 서버로 착각하지 않게
      if (local) sourceNote.textContent = `시험용: 이 태블릿의 세션 로그를 서버 대신 썼어요 (${list.length}건)`;
    } catch {
      if (this.user !== id) return;
      sourceNote.textContent = '지금은 서버에 연결하지 못해 이 태블릿의 기록만 보여 드려요';
    }
    if (this.app.state === 'history') this.renderHistory();
  },

  // ---------------- 아이디 목록 (담당자가 고른다) ----------------
  async openList() {
    if (this.app.state !== 'login') return;
    this.showView('list');
    this.namedUsers = null;
    this.renderList();
    const request = (this.listRequest = {});
    const { users, server } = await Members.namedList();
    if (this.listRequest !== request || this.view !== 'list') return;
    this.namedUsers = users;
    this.listServer = server;
    this.renderList();
  },

  renderList() {
    const grid = $('#lg-ids');
    const message = $('#lg-list-msg');
    for (const button of document.querySelectorAll('#lg-sort [data-sort]')) button.classList.toggle('on', button.dataset.sort === this.sort);
    if (!this.namedUsers) {
      grid.replaceChildren();
      message.textContent = '아이디 목록을 불러오는 중…';
      return;
    }
    const users = [...this.namedUsers].sort(this.sort === 'recent'
      ? (a, b) => (Date.parse(b.last) || 0) - (Date.parse(a.last) || 0) || a.name.localeCompare(b.name, 'ko')
      : (a, b) => a.name.localeCompare(b.name, 'ko'));
    message.textContent = [
      users.length ? `아이디 ${users.length}개` : '',
      this.listServer === 'failed' ? '서버에 연결하지 못해 이 태블릿에서 쓴 아이디만 보여요'
        : this.listServer === 'none' ? '이 태블릿에서 쓴 아이디만 보여요' : '',
    ].filter(Boolean).join(' · ');
    grid.innerHTML = users.length
      ? users.map((user) => html`<button class="lg-id" data-id="${user.id}"><b>${user.name}</b><small>${daysAgoText(user.last)}</small></button>`).join('')
      : '<div class="lg-ids-empty"><p>아직 만든 아이디가 없어요</p><button class="btn" id="lg-ids-new">새 아이디 만들기</button></div>';
  },

  // ---------------- 회원 번호 ----------------
  renderPad() {
    const slots = (this.code + '________').slice(0, 8);
    $('#lg-digits').innerHTML = [...slots].map((digit, i) => html`${i === 4 ? html`<em></em>` : ''}<i class="${digit === '_' ? '' : 'on'}">${digit === '_' ? '' : digit}</i>`).join('');
  },

  submitCode() {
    const id = this.code;
    const message = $('#lg-pad-msg');
    if (id.length < 8) { message.textContent = '8자리를 모두 눌러 주세요'; return; }
    if (!Members.valid(id)) {
      message.textContent = '번호가 맞지 않아요. 다시 확인해 주세요';
      const digits = $('#lg-digits');
      digits.classList.remove('shake');
      void digits.offsetWidth;
      digits.classList.add('shake');
      this.code = '';
      this.renderPad();
      return;
    }
    this.login(id);
  },

  // ---------------- 새 아이디 만들기 (창, 로그인 화면 · 결과 화면) ----------------
  // onCreated(id): 서버(있으면)와 이 태블릿에서 겹치지 않음을 확인하고 만든 뒤 부른다. id 는 접두어까지 붙은 꼴
  openIdForm({ title, okLabel, onCreated }) {
    this.idForm = { onCreated, busy: false };
    $('#idn-title').textContent = title;
    $('#idn-ok').textContent = okLabel;
    $('#idn-ok').disabled = false;
    $('#idn-input').value = '';
    this.idFormMessage('');
    $('#id-new').classList.add('active');
    $('#idn-input').focus(); // 누른 동작 안에서 불러야 화면 키보드가 뜬다
  },

  closeIdForm() {
    this.idForm = null;
    $('#idn-input').blur();
    $('#id-new').classList.remove('active');
  },

  idFormMessage(text, bad = false) {
    const message = $('#idn-msg');
    message.textContent = text;
    message.classList.toggle('bad', bad);
  },

  async submitIdForm() {
    const form = this.idForm;
    if (!form || form.busy) return;
    const input = $('#idn-input');
    const problem = MemberId.nameProblem(MemberId.cleanName(input.value));
    if (problem) {
      this.idFormMessage(problem, true);
      input.focus();
      return;
    }
    form.busy = true;
    $('#idn-ok').disabled = true;
    this.idFormMessage('겹치는 아이디가 있는지 확인하는 중…');
    const result = await Members.createNamed(input.value);
    form.busy = false;
    $('#idn-ok').disabled = false;
    if (this.idForm !== form) return; // 그 사이 창을 닫았거나 화면을 떠났다
    if (result.error) {
      this.idFormMessage(result.message, true);
      input.focus();
      return;
    }
    this.closeIdForm();
    form.onCreated(result.id);
  },

  // ---------------- 기록 (달력) ----------------
  openHistory() {
    const app = this.app;
    const now = new Date();
    this.month = new Date(now.getFullYear(), now.getMonth(), 1);
    this.pick = null;
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
    const graphDays = new Set(); // 두뇌 그래프를 그릴 수 있는 세션이 있는 날 (누를 수 있다)
    for (const session of sessions) {
      const key = dayKey(new Date(session.at));
      byDay[key] = (byDay[key] || 0) + 1;
      if (this.axesOf(session)) graphDays.add(key);
    }
    const picked = this.resolvePick(sessions);
    const pickedDay = picked && dayKey(picked.day || new Date(picked.entry.at));
    const now = new Date();
    const month = this.month;
    $('#hs-title').textContent = sessions.length ? '다시 오셨네요, 반가워요!' : '첫 트레이닝을 시작해 볼까요?';
    $('#hs-id').textContent = `${Members.label(id)} 님`;
    $('#hs-month').textContent = `${month.getFullYear()}년 ${month.getMonth() + 1}월`;
    const isThisMonth = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
    $('#hs-next').disabled = isThisMonth;
    // 달력: 일요일부터
    const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells = ['일', '월', '화', '수', '목', '금', '토'].map((weekday, i) => html`<b class="${i === 0 ? 'sun' : ''}">${weekday}</b>`);
    for (let i = 0; i < firstWeekday; i++) cells.push(html`<span></span>`);
    let monthCount = 0;
    for (let day = 1; day <= days; day++) {
      const date = new Date(month.getFullYear(), month.getMonth(), day);
      const dayCount = byDay[dayKey(date)] || 0;
      monthCount += dayCount;
      const classes = [dayCount ? 'done' : '', graphDays.has(dayKey(date)) ? 'tap' : '', pickedDay === dayKey(date) ? 'sel' : '',
        isThisMonth && day === now.getDate() ? 'today' : '', date > now ? 'future' : ''].filter(Boolean).join(' ');
      cells.push(html`<span class="${classes}" data-day="${day}">${day}${dayCount > 1 ? html`<small>${dayCount}</small>` : ''}</span>`);
    }
    $('#hs-cal').innerHTML = html`${cells}`;
    // 숫자 요약과 최근 기록
    const thisMonth = sessions.filter((session) => { const date = new Date(session.at); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth(); }).length;
    const last = sessions[sessions.length - 1];
    const ago = last ? Math.round((new Date(now.toDateString()) - new Date(new Date(last.at).toDateString())) / 86400000) : null;
    $('#hs-stats').innerHTML = [
      ['이번 달', html`${thisMonth}<small>번</small>`],
      ['모두', html`${sessions.length}<small>번</small>`],
      ['지난번', last ? (ago === 0 ? '오늘' : ago === 1 ? '어제' : html`${ago}<small>일 전</small>`) : '–'],
    ].map(([label, value]) => html`<div><span>${label}</span><b>${value}</b></div>`).join('');
    const difficultyLabel = (difficultyId) => (SESSION_DIFFICULTIES.find((difficulty) => difficulty.id === difficultyId) || {}).label || '';
    $('#hs-recent').innerHTML = sessions.length
      ? sessions.slice(-4).reverse().map((session) => this.sessionRow(session, this.dateText(new Date(session.at)))).join('')
      : html`<li class="empty">${Members.hasRemote() ? '아직 기록이 없어요' : '이 태블릿에는 아직 기록이 없어요'}. 오늘 트레이닝부터 쌓여요</li>`;
    // 받침이 있으면(ㄹ 받침 빼고) '으로', 없으면 '로'
    const roParticle = (word) => { const syllable = word.charCodeAt(word.length - 1) - 0xac00; return syllable >= 0 && syllable < 11172 && syllable % 28 && syllable % 28 !== 8 ? '으로' : '로'; };
    const next = Members.nextSetup(last);
    const nextDifficulty = next ? difficultyLabel(next.difficulty) : '';
    const tail = `${next && next.track === 'brain' ? ' · 두뇌 게임만' : ''}${next ? roParticle(next.track === 'brain' ? '만' : nextDifficulty) : ''} 골라 둘게요`;
    // 난이도를 바꿔 골라 둘 때만 알린다 (지난번과 같으면 세션 설정 화면에서 보인다)
    const summary = !next ? ''
      : next.shift === 'up' ? `지난번에 아주 잘하셔서 난이도를 올려 ${next.min}분 · ${nextDifficulty}${tail}`
      : next.shift === 'down' ? `이번엔 조금 편하게 ${next.min}분 · ${nextDifficulty}${tail}`
      : '';
    $('#hs-sum').textContent = summary;
    void monthCount;
    this.renderPick(sessions, picked);
  },

  // ---------------- 기록: 지난 세션의 두뇌 그래프 ----------------
  // 그 세션의 두뇌 그래프 축들 (지금 규칙으로 다시 계산, js/abilities.js fromEntry). 인지 영역이 하나도 없으면 null
  axesOf(entry) {
    const axes = Abilities.fromEntry(entry);
    return axes && axes.some((axis) => axis.hasData && axis.id !== 'exercise') ? axes : null;
  },

  dateText(date) {
    return `${date.getMonth() + 1}월 ${date.getDate()}일 (${'일월화수목금토'[date.getDay()]})`;
  },

  timeText(date) {
    const hour = date.getHours();
    return `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}시`;
  },

  setupText(entry) {
    const difficulty = (SESSION_DIFFICULTIES.find((candidate) => candidate.id === entry.difficulty) || {}).label || '';
    return `${entry.min ?? '–'}분 · ${difficulty}${entry.track === 'brain' ? ' · 두뇌만' : ''}`;
  },

  // 최근 기록 · 그날 고르기의 한 줄. 그래프를 그릴 수 있으면 누를 수 있다
  sessionRow(entry, when) {
    const tap = !!this.axesOf(entry);
    return html`<li class="${tap ? 'tap' : ''}" data-key="${tap ? Members.keyOf(entry) : ''}"><span>${when}</span><span>${this.setupText(entry)}</span><b>${(entry.score || 0).toLocaleString('ko-KR')}점</b></li>`;
  },

  // this.pick → { day, list }(그날 고르기) · { entry, graphable }(세션 하나) · null. 하루에 그래프가 하나뿐이면 바로 그 세션
  resolvePick(sessions) {
    if (!this.pick) return null;
    const graphable = sessions.filter((session) => this.axesOf(session));
    if (this.pick.day) {
      const pickedDay = this.pick.day.toDateString();
      const list = graphable.filter((session) => new Date(session.at).toDateString() === pickedDay);
      if (list.length > 1) return { day: this.pick.day, list };
      if (!list.length) return (this.pick = null);
      this.pick = { key: Members.keyOf(list[0]) };
    }
    const entry = graphable.find((session) => Members.keyOf(session) === this.pick.key);
    if (!entry) return (this.pick = null);
    return { entry, graphable };
  },

  renderPick(sessions, picked) {
    const detail = $('#hs-detail');
    $('#history .hs-body').classList.toggle('picked', !!picked);
    if (!picked) { detail.replaceChildren(); return; }
    const back = html`<button class="hd-back" data-act="list">‹ 목록</button>`;
    if (picked.list) {
      detail.innerHTML = html`<div class="hd-head">${back}<span class="hd-date">${this.dateText(picked.day)}</span></div>
        <ol class="hs-recent">${picked.list.map((entry) => this.sessionRow(entry, this.timeText(new Date(entry.at))))}</ol>`;
      return;
    }
    const { entry, graphable } = picked;
    const index = graphable.indexOf(entry);
    const date = new Date(entry.at);
    const sameDay = sessions.filter((session) => new Date(session.at).toDateString() === date.toDateString()).length > 1;
    const step = (targetIndex, label, symbol) => {
      const target = graphable[targetIndex];
      return target
        ? html`<button class="hd-step" data-act="step" data-key="${Members.keyOf(target)}" data-at="${target.at}" aria-label="${label}">${symbol}</button>`
        : html`<button class="hd-step" disabled aria-label="${label}">${symbol}</button>`;
    };
    const axes = this.axesOf(entry);
    const best = Abilities.best(axes);
    detail.innerHTML = html`<div class="hd-head">${back}${step(index - 1, '이전 트레이닝', '‹')}<span class="hd-date">${this.dateText(date)}${sameDay ? ` · ${this.timeText(date)}` : ''}</span>${step(index + 1, '다음 트레이닝', '›')}</div>
      <div class="hd-meta"><span>${this.setupText(entry)}</span><b>${(entry.score || 0).toLocaleString('ko-KR')}점</b></div>
      <svg class="radar" role="img" aria-label="영역별 정답률"></svg>
      ${best ? html`<p class="hd-praise"><b>${best.name}</b> · ${best.praise}</p>` : ''}`;
    Radar.render(detail.querySelector('.radar'), axes);
  },

  // ---------------- 매 프레임 ----------------
  tick(app, entered) {
    if (app.state !== 'login' || this.view !== 'home') QrScanner.stop();
    // 새 아이디 창은 연 화면에서만 (자리 비움으로 대기 화면에 가면 닫는다)
    if (entered && this.idForm) this.closeIdForm();
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
  // 손님이면 새 번호를 만들어 오늘 기록을 그 번호로 저장하고, 회원 카드를 받을지 아이디를 만들지 고르게 한다 (센터/단체명이 없으면 바로 QR 회원 카드).
  // 회원이면 기록에 더한다. 가상 결과(운영 메뉴의 테스트)는 화면만 진짜와 똑같이 그리고, 번호를 만들지도 기록하지도 않는다
  onResult(app, simulated) {
    const box = $('#dr-member');
    if (!box) return;
    // 새 회원 칸을 보여 줄 때만 결과 화면의 첫 칸을 넓힌다 (app/app.css .with-card)
    $('#demo-result').classList.remove('with-card');
    this.resultLog = null;
    this.simulated = simulated;
    const fresh = !this.user;
    if (fresh && !simulated) this.user = Members.newId();
    const id = this.user || Members.newId(); // 가상 결과의 손님: 보여 주기만 하는 번호
    if (!simulated) this.recordResult(app, id, fresh);
    $('#dr-id').textContent = `${Members.label(id)} 님${simulated ? ' · 가상 결과' : ''}`;
    if (!fresh) {
      const recordCount = Members.merged(id).length + (simulated ? 1 : 0);
      box.innerHTML = html`<p class="dm-saved"><b>${recordCount}번째 트레이닝</b>을 기록했어요</p>`;
      return;
    }
    if (MemberId.validPrefix(Members.prefix())) this.showRegisterChoice(id);
    else this.showMemberCard(id);
  },

  // 오늘 기록을 이 회원(손님이면 방금 만든 번호)에게 더한다
  recordResult(app, id, fresh) {
    if (app.log) {
      app.log.meta.user = id;
      app.log.meta.userNew = fresh;
      this.resultLog = app.log;
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
      // 기록 화면에서 이 판의 두뇌 그래프를 다시 계산할 재료 (js/history-entry.js · js/abilities.js fromEntry)
      games: compactGames(games),
      exAcc: app.brainOnly ? null : RoundReport.keep(app) / 100,
    });
  },

  // 손님 (센터/단체명이 있는 태블릿): 아이디 만들기 · QR 회원 카드 받기 중에 고른다 (app/index.html #tpl-card-choice).
  // 오늘 기록은 이미 받은 번호로 저장돼 있고, 아이디를 만들면 그리로 옮긴다
  showRegisterChoice(numberId) {
    const box = $('#dr-member');
    const choice = $('#tpl-card-choice').content.cloneNode(true);
    if (onPhone()) choice.querySelector('[data-pick="qr"] small').textContent = '회원 카드 그림을 이 휴대폰에 저장해요';
    choice.querySelector('[data-pick="id"]').onclick = () => this.chooseId(numberId);
    choice.querySelector('[data-pick="qr"]').onclick = () => this.showMemberCard(numberId);
    $('#demo-result').classList.add('with-card');
    box.replaceChildren(choice);
  },

  // 새 회원 카드: 휴대폰이면 카드 그림 저장, 태블릿이면 휴대폰으로 비출 QR (app/index.html #tpl-card-phone · #tpl-card-qr)
  showMemberCard(id) {
    const box = $('#dr-member');
    const phone = onPhone();
    const card = $(phone ? '#tpl-card-phone' : '#tpl-card-qr').content.cloneNode(true);
    card.querySelector('.dm-id b').textContent = Members.format(id);
    // QR 회원 카드 대신 아이디로 저장하기 (센터/단체명이 있을 때만)
    if (!MemberId.validPrefix(Members.prefix())) card.querySelector('.dm-named').remove();
    $('#demo-result').classList.add('with-card');
    box.replaceChildren(card);
    if (phone) {
      // 그림은 미리 그려 둔다: iPhone 의 공유 창(navigator.share)은 누른 순간 곧바로 불러야 열린다
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
    } else {
      // 사진으로 찍어 두면 QR 이 작아 태블릿이 잘 못 읽는다. 휴대폰 카메라로 비춰 링크를 열고, 회원 카드 화면(app/card.html)에서
      // '갤러리에 저장' 한 큰 QR 그림을 쓰도록 안내한다. 결과 화면에서 눈에 잘 띄도록 따로 강조한 칸에 둔다
      box.querySelector('.dm-qr').innerHTML = qrSvg(Members.cardUrl(id));
    }
    const namedButton = box.querySelector('.dm-named button');
    if (namedButton) namedButton.onclick = () => this.chooseId(id);
  },

  // 아이디로 저장하기. 가상 결과에서는 아이디를 만들지 않는다 (서버에 아이디가 생기므로)
  chooseId(numberId) {
    if (!this.simulated) return this.saveAsNamed(numberId);
    const toast = $('#toast');
    toast.textContent = '가상 결과에서는 아이디를 만들지 않아요';
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
  },

  // 손님 결과 화면: 받은 회원 번호 대신 아이디로 오늘 기록을 저장한다.
  // 기록을 아이디로 옮기고, 세션 로그의 meta.user 를 고쳐 다시 저장 · 업로드한다 (서버는 같은 세션을 덮어쓴다)
  saveAsNamed(numberId) {
    const log = this.resultLog;
    this.openIdForm({
      title: '아이디로 저장하기', okLabel: '저장',
      onCreated: (id) => {
        Members.move(numberId, id);
        if (this.user === numberId) this.user = id;
        if (log) {
          log.meta.user = id;
          SessionStore.put(log).then(() => SessionUpload.resend(log.meta.id)).catch(() => { /* 태블릿 기록은 이미 옮겼다 */ });
        }
        $('#demo-result').classList.remove('with-card');
        $('#dr-id').textContent = `${Members.label(id)} 님`;
        $('#dr-member').innerHTML =
          html`<p class="dm-saved"><b>${Members.format(id)}</b> 아이디로 오늘 기록을 저장했어요</p>`;
      },
    });
  },
};
