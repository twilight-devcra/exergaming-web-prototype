// 운영 메뉴 (운영 버전 app/index.html): 대기 화면의 ⚙ 버튼이나 왼쪽 위 모서리 길게 누르기 → PIN → 운영 메뉴.
// 하위 메뉴(왼쪽 목록)로 나눈다. 담당자가 손대는 것은 기본 설정(센터/단체명 · 페달) 하나이고, 나머지는 '고급 설정' 을 펼쳐야 보인다:
// 라운드 · 음악(DEMO_SETTINGS · 음악) · 회원 기록(회원 기록 주소) · 서버 · 업로드 · 기록 · 로그(이 태블릿의 기록 · 세션 로그 내보내기) · 테스트.
// 하위 메뉴 이름 아래에는 그 칸의 지금 상태를 보인다 (renderTabs). 고급 설정을 접어 두었을 때 손볼 것이 있으면 '고급 설정' 에 알린다.
// 칸을 오가도 적은 값은 그대로이고, '대기 화면 열기'(close)에서 센터/단체명을 확인해 저장한다. 라운드 설정은 칸 안의 '저장'으로.
// 센터/단체명은 코드 · 저장소에서는 아이디 접두어(prefix)라고 부른다 (js/member-id.js).
// 스테이션 흐름(js/demo.js 의 Demo)은 isOpen·pinOpen 으로 메뉴가 열려 있는지 보고 게임을 멈춘다.
import { PRESET_KEYS, ROUND_PRESETS, DEMO_SETTINGS, APP_OPERATOR_PIN, Config, $, Util, html } from '../js/config.js';
import { AXES } from '../js/abilities.js';
import { SessionStore } from '../js/session-log.js';
import { SessionUpload } from '../js/session-upload.js';
import { MemberId } from '../js/member-id.js';
import { Members } from './member-records.js';

export const OperatorMenu = {
  CORNER_HOLD_MS: 2000,  // 왼쪽 위 모서리를 이만큼 누르고 있으면 PIN 입력
  PIN_TIMEOUT_MS: 20000, // PIN 화면에서 이만큼 아무것도 누르지 않으면 닫는다

  demo: null,       // js/demo.js 의 Demo (저장·멈춤)
  app: null,
  isOpen: false,    // 운영 메뉴가 열려 있다 (게임은 멈춤)
  pinOpen: false,   // PIN 화면이 열려 있다
  pinInput: '',
  pinTimer: null,
  tab: 'basic',       // 보고 있는 하위 메뉴 (다음에 열 때도 이 칸부터)
  advancedOpen: false, // '고급 설정' 을 펼쳤다 (고급 칸을 보고 있으면 늘 펼쳐 둔다)
  savedRound: null,   // 라운드 칸에 마지막으로 채운 · 저장한 값 (저장하지 않은 변경을 가린다)
  roundDirty: false,
  recordsLabel: '',

  init(demo, app) {
    this.demo = demo;
    this.app = app;
    this.bindMenu();
    this.bindUpload();
    this.bindPin();
    return this;
  },

  // 운영 메뉴의 설정 요약
  renderSummary() {
    const settings = this.app.config;
    const changed = Object.keys(Config.demoSaved()).length;
    const preset = Config.preset(Config.presetOf(settings));
    const round = $('#setup')
      ? '라운드 길이·난이도는 참가자가 고름'
      : `라운드 난이도 ${preset ? preset.label : '직접 설정'} · 라운드 ${Util.formatTime(settings.durationSec)}`;
    $('#op-cfg').innerHTML = html`설정 코드 <b>${Config.demoCode(settings)}</b>${changed ? ` (기본값에서 ${changed}개 바꿈)` : ' (기본값)'} · ` +
      html`${round} · 측정 ${settings.calibrationSec}초 · 게임 ${this.app.enabledTypes().length}종<br>` +
      (this.pin ? '운영 메뉴는 왼쪽 위 모서리를 2초 누른 뒤 PIN 을 입력하면 열립니다.' : '운영 메뉴는 대기 화면의 ⚙ 운영 버튼이나 왼쪽 위 모서리 2초 누르기로 열립니다 (PIN 없음).');
  },

  // 센터/단체명 칸 아래 안내: 적은 이름으로 아이디가 어떻게 저장되는지, 비었거나 틀렸으면 그 뜻
  renderPrefixNote() {
    const prefix = MemberId.cleanPrefix($('#op-prefix').value);
    const saved = Members.prefix();
    $('#op-prefix-note').textContent = !prefix
      ? '비어 있으면 아이디로 들어가기 · 새 아이디 만들기를 쓸 수 없습니다 (QR 회원 카드 · 손님은 됩니다).'
      : !MemberId.validPrefix(prefix)
        ? MemberId.prefixProblem(prefix)
        : `아이디 '철수' 는 '${MemberId.make(prefix, '철수')}' 로 저장됩니다.` +
          (saved && saved !== prefix ? ` 센터/단체명을 바꾸면 아이디 목록에 '${prefix}' 의 아이디만 보입니다.` : '');
  },

  // ---------------- 하위 메뉴 ----------------
  showTab(tab) {
    this.tab = tab;
    $('#op .op-box').dataset.tab = tab;
    if (tab !== 'basic') this.setAdvanced(true);
    for (const button of document.querySelectorAll('#op-tabs [data-tab]')) {
      const selected = button.dataset.tab === tab;
      button.classList.toggle('on', selected);
      button.setAttribute('aria-selected', String(selected));
    }
    $('#op .op-main').scrollTop = 0;
    // 설명이 프리셋마다 길이가 달라 아래 칸들이 오르내리지 않게 가장 긴 설명만큼 자리를 잡아 둔다 (보이는 동안에만 잴 수 있다)
    if (tab === 'round') Util.reserveHeight($('#op-set-preset-note'), Config.presetNotes());
  },

  // '고급 설정' 펼치기 · 접기. 고급 칸을 보다가 접으면 기본 설정으로 돌아간다
  setAdvanced(open) {
    this.advancedOpen = open;
    $('#op .op-box').classList.toggle('adv-open', open);
    $('#op-adv').setAttribute('aria-expanded', String(open));
    if (!open && this.tab !== 'basic') this.showTab('basic');
  },

  // 하위 메뉴 이름 아래의 작은 글: 그 칸의 지금 상태. 손볼 것이 있으면 warn (강조색)
  renderTabs() {
    const warnings = [];
    const label = (tab, text, warn = false) => {
      const small = $(`#op-tab-${tab}`);
      small.textContent = text;
      small.parentElement.classList.toggle('warn', warn);
      if (warn && tab !== 'basic') warnings.push(text);
    };
    const prefix = MemberId.cleanPrefix($('#op-prefix').value);
    label('basic', !prefix ? '센터/단체명 없음' : MemberId.validPrefix(prefix) ? prefix : '센터/단체명 꼴이 틀림', !MemberId.validPrefix(prefix));
    const changed = Object.keys(Config.demoSaved()).length;
    label('round', this.roundDirty ? '저장하지 않은 변경' : changed ? `기본값에서 ${changed}개 바꿈` : '기본값', this.roundDirty);
    const { url, historyUrl, localHistory } = SessionUpload.settings();
    label('members', localHistory ? '시험용: 이 태블릿의 세션 로그' : historyUrl ? '서버 기록' : '이 태블릿 기록만');
    const state = SessionUpload.state;
    label('server', !url ? '업로드 꺼짐' : state.lastError ? '보내기 실패' : state.pending ? `남은 세션 ${state.pending}건` : '모두 보냄', !!(url && state.lastError));
    label('records', this.recordsLabel);
    const tests = [this.demo.allowKeyboard && '키보드', this.demo.simResult && '가상 결과'].filter(Boolean);
    label('test', tests.length ? `켜짐: ${tests.join(' · ')}` : '꺼짐', tests.length > 0);
    // 고급 설정을 접어 두었어도 손볼 것은 보이게
    label('adv', warnings.join(' · '), warnings.length > 0);
  },

  // ---------------- 운영 메뉴 ----------------
  bindMenu() {
    $('#op-close').onclick = () => this.close();
    $('#op-tabs').addEventListener('click', (event) => {
      const button = event.target.closest('[data-tab]');
      if (button) this.showTab(button.dataset.tab);
    });
    $('#op-adv').onclick = () => this.setAdvanced(!this.advancedOpen);
    $('#op-end').onclick = () => {
      this.hide();
      if (this.app.state === 'play') this.app.endRound('operator');
    };
    $('#op-abandon').onclick = () => {
      this.hide();
      this.app.quit();
      this.demo.syncPause();
    };
    $('#op-csv').onclick = () => this.downloadCsv();
    $('#op-sess-export').onclick = async () => {
      this.demo.leaving = true; // 내려받기가 beforeunload 를 부를 수 있다
      try {
        const exported = await SessionStore.exportAll(`exergame-sessions-${new Date().toISOString().slice(0, 10)}.jsonl`);
        if (!exported) $('#op-sess-count').textContent = '저장된 로그가 없습니다';
      } catch (error) {
        $('#op-sess-count').textContent = `내보내기 실패: ${error.message || error}`;
      }
      setTimeout(() => (this.demo.leaving = false), 1000);
    };
    $('#op-sim').onchange = () => {
      this.demo.simResult = $('#op-sim').checked;
      this.demo.updateAttract();
      this.renderTabs();
    };
    $('#op-kbd').onchange = () => {
      this.demo.allowKeyboard = $('#op-kbd').checked;
      this.demo.updateAttract();
      if (this.app.state === 'setup') this.demo.pickSetup({});
      this.renderTabs();
    };
    $('#op-prefix').addEventListener('input', () => {
      $('#op-prefix').classList.remove('invalid');
      this.renderPrefixNote();
      this.renderTabs();
    });
    this.bindSettings();
    // 운영 버전: 대기 화면 오른쪽 아래의 '운영' 버튼 → PIN. 누른 것이 대기 화면으로 퍼지지 않게 막는다
    const openButton = $('#op-open');
    if (openButton) {
      openButton.addEventListener('pointerdown', (event) => event.stopPropagation());
      openButton.addEventListener('click', (event) => {
        event.stopPropagation();
        this.openPin();
      });
    }
    // 모서리 길게 누르기 → PIN
    const corner = $('#op-corner');
    let timer = null;
    const cancel = () => { clearTimeout(timer); timer = null; };
    corner.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      cancel();
      timer = setTimeout(() => { timer = null; this.openPin(); }, OperatorMenu.CORNER_HOLD_MS);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((eventType) => corner.addEventListener(eventType, cancel));
  },

  // ---------------- 라운드 설정 (DEMO_SETTINGS) ----------------
  // 맨 위의 '라운드 난이도'는 저장하는 항목이 아니다. 고르면 프리셋에 든 칸(PRESET_KEYS)을 채우고, 칸을 고치면 맞는 프리셋을 다시 찾아 보여 준다.
  bindSettings() {
    const box = $('#op-set-fields');
    const presets = ROUND_PRESETS.map((preset) => `<option value="${preset.id}">${preset.label}</option>`).join('');
    box.append(Util.element('label', 'setting', `라운드 난이도<select id="op-set-preset">${presets}<option value="custom" disabled>직접 설정</option></select>`));
    const note = Util.element('p', 'setting-note');
    note.id = 'op-set-preset-note';
    box.append(note);
    $('#op-set-preset').addEventListener('change', (event) => {
      const preset = Config.preset(event.target.value);
      if (preset) this.fillSettings({ ...this.readSettings(), ...preset.values });
    });
    // 두 열로 나눠 놓는다. DEMO_SETTINGS 순서는 설정 코드(Config.demoCode)에 쓰이므로 바꾸지 않고 여기서만 가른다
    const columns = [Util.element('div', 'op-set-col', '<h3>시간·점수·페달</h3>'), Util.element('div', 'op-set-col', '<h3>미니게임 난이도</h3>')];
    box.append(...columns);
    const rightColumnKeys = ['difficulty', 'startLevel', 'maxLevel', 'diffUp', 'diffDown', 'questionTimeScale', 'multiplierTop'];
    for (const setting of DEMO_SETTINGS) {
      const input = setting.options
        ? `<select data-key="${setting.key}">${setting.options.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select>`
        : `<input type="number" data-key="${setting.key}" min="${setting.min}" max="${setting.max}" step="${setting.step}" inputmode="decimal">`;
      columns[rightColumnKeys.includes(setting.key) ? 1 : 0].append(Util.element('label', 'setting', `${setting.label}${input}`));
    }
    // 프리셋 선택은 위에서 따로 다룬다 (input 이 change 보다 먼저 와서, 여기서 다시 맞추면 고른 값이 되돌아간다)
    const mark = (event) => event.target.id !== 'op-set-preset' && this.markSettings();
    box.addEventListener('input', mark);
    box.addEventListener('change', mark);
    $('#op-set-cancel').onclick = () => this.loadRoundSettings();
    $('#op-set-reset').onclick = () => this.fillSettings(Config.demoDefaults());
    $('#op-set-save').onclick = () => this.saveSettings();
  },

  // 라운드 칸을 지금 적용된 설정으로 채운다 (메뉴를 열 때, '되돌리기')
  loadRoundSettings() {
    this.savedRound = null;
    this.fillSettings(this.app.config);
    this.savedRound = this.readSettings();
    this.markSettings();
  },

  fillSettings(values) {
    for (const setting of DEMO_SETTINGS) {
      const field = $(`#op-set-fields [data-key="${setting.key}"]`);
      const value = values[setting.key];
      field.value = setting.options ? value : Math.round(value * (setting.scale || 1) * 1000) / 1000;
    }
    this.markSettings();
  },

  readSettings() {
    const values = {};
    for (const setting of DEMO_SETTINGS) {
      const field = $(`#op-set-fields [data-key="${setting.key}"]`);
      if (setting.options) {
        values[setting.key] = field.value;
        continue;
      }
      const value = parseFloat(field.value);
      const defaultValue = Config.demoDefaults()[setting.key];
      // 소수 단계(0.05 등)는 부동소수 찌꺼기 없이 저장한다
      values[setting.key] = Number.isFinite(value) ? Math.round((Util.clamp(value, setting.min, setting.max) / (setting.scale || 1)) * 10000) / 10000 : defaultValue;
    }
    return values;
  },

  // 기본값과 다른 항목을 표시하고, 저장하면 될 설정 코드를 미리 보여 준다
  markSettings() {
    const values = this.readSettings();
    const defaults = Config.demoDefaults();
    for (const setting of DEMO_SETTINGS) {
      $(`#op-set-fields [data-key="${setting.key}"]`).parentElement.classList.toggle('changed', values[setting.key] !== defaults[setting.key]);
    }
    $('#op-set-code').textContent = `설정 코드 ${Config.demoCode(values)}`;
    const id = Config.presetOf(values);
    $('#op-set-preset').value = id;
    $('#op-set-preset-note').textContent = Config.presetNote(id);
    PRESET_KEYS.forEach((key) => $(`#op-set-fields [data-key="${key}"]`).parentElement.classList.toggle('preset', id !== 'custom'));
    // 저장하지 않은 변경 (칸을 오가거나 메뉴를 닫으면 사라지므로 알린다)
    const saved = this.savedRound;
    this.roundDirty = !!saved && DEMO_SETTINGS.some((setting) => values[setting.key] !== saved[setting.key]);
    $('#op-set-state').textContent = this.roundDirty ? '저장하지 않은 변경이 있습니다' : '';
    $('#op-set-state').classList.remove('done');
    if (this.isOpen) this.renderTabs();
  },

  saveSettings() {
    const values = this.readSettings();
    Config.demoSave(values);
    Object.assign(this.app.config, values);
    this.demo.renderConfig();
    this.savedRound = values;
    this.markSettings();
    $('#op-set-state').textContent = '저장했습니다. 다음 판부터 적용됩니다';
    $('#op-set-state').classList.add('done');
  },

  open() {
    const app = this.app;
    this.isOpen = true;
    // 라운드 설정은 라운드 중에는 못 바꾼다 (fieldset 째 막는다)
    $('#op-set-form').disabled = app.inRound;
    $('#op-set-locked').hidden = !app.inRound;
    this.loadRoundSettings();
    $('#op-prefix').value = Members.prefix();
    $('#op-prefix').classList.remove('invalid');
    this.renderPrefixNote();
    $('#op-kbd').checked = this.demo.allowKeyboard;
    $('#op-sim').checked = this.demo.simResult;
    $('#op-round').style.display = app.inRound ? '' : 'none';
    $('#op-end').style.display = app.state === 'play' ? '' : 'none';
    if (app.inRound) {
      const left = app.state === 'play' ? app.config.durationSec - app.elapsed : app.config.durationSec;
      $('#op-round-note').textContent = `라운드 진행 중 · 멈춰 있음 (남은 시간 ${Util.formatTime(left)})`;
    }
    $('#op-close').textContent = app.inRound ? '이어서 진행' : app.state === 'result' || app.state === 'ending' ? '결과 화면으로 돌아가기' : '대기 화면 열기';
    this.renderLog();
    this.renderSessions();
    this.renderUpload();
    this.app.renderMusicTry();
    if (app.inRound) app.log.event('operator', { open: true });
    this.renderTabs();
    $('#op').classList.add('active');
    this.setAdvanced(this.tab !== 'basic');
    this.showTab(this.tab);
    this.demo.syncPause();
  },

  hide() {
    this.app.audio.endPreview();
    this.app.renderMusicTry();
    if (this.app.inRound && this.isOpen) this.app.log.event('operator', { open: false });
    this.isOpen = false;
    $('#op').classList.remove('active');
    this.demo.syncPause();
  },

  close() {
    const prefix = MemberId.cleanPrefix($('#op-prefix').value);
    // 꼴이 틀렸으면 기본 설정을 열어 보여 준다
    if (prefix && !MemberId.validPrefix(prefix)) {
      this.showTab('basic');
      $('#op-prefix').classList.add('invalid');
      $('#op-prefix').focus();
      return;
    }
    Members.setPrefix(prefix);
    this.demo.enterKiosk();
    this.hide();
  },

  renderLog() {
    const log = this.demo.load('log', []);
    $('#op-log-count').textContent = log.length ? `${log.length}건` : '';
    this.recordsLabel = log.length ? `기록 ${log.length}건` : '기록 없음';
    const list = $('#op-log');
    if (!log.length) {
      list.innerHTML = '<li class="board-empty">아직 기록이 없습니다</li>';
      return;
    }
    list.innerHTML = log.slice(-40).reverse().map((round) => {
      const time = new Date(round.at);
      const hourMinute = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
      return html`<li><b>${String(round.no).padStart(3, '0')}</b><span>${hourMinute}${round.track === 'brain' ? ' · 두뇌만' : ''}</span><span class="sc">${round.score.toLocaleString('ko-KR')}점</span></li>`;
    }).join('');
  },

  downloadCsv() {
    const log = this.demo.load('log', []);
    // track: dual(페달 + 두뇌 게임) · brain(두뇌 게임만). 이 열을 더하기 전 기록은 dual.
    // 끝의 열은 두뇌 그래프의 축 (0~1, js/abilities.js AXES). 2026-11-20 전 기록은 축이 달라(별점) 비어 있다
    const header = ['no', 'time', 'settings', 'track', 'score', 'exercise', 'cognitive', 'kcal', 'dist_m', 'revs', ...AXES.map((axis) => axis.id)];
    const rows = log.map((round) => [round.no, round.at, round.config ?? '', round.track || 'dual', round.score, round.ex, round.cog, round.kcal, round.distM ?? '', round.revs, ...AXES.map((axis) => round.domains?.[axis.id] ?? '')]);
    const csv = '﻿' + [header, ...rows].map((row) => row.join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `exergame-${new Date().toISOString().slice(0, 10)}.csv`;
    this.demo.leaving = true; // 다운로드도 beforeunload 를 부를 수 있다
    link.click();
    setTimeout(() => { this.demo.leaving = false; URL.revokeObjectURL(link.href); }, 1000);
  },

  // ---------------- PIN ----------------
  bindPin() {
    $('#pin-pad').addEventListener('pointerdown', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      event.preventDefault();
      this.armPinTimeout();
      const key = button.dataset.k;
      if (key === 'cancel') return this.closePin();
      if (key === 'del') this.pinInput = this.pinInput.slice(0, -1);
      else if (this.pinInput.length < this.pin.length) this.pinInput += button.textContent;
      this.renderPin();
      if (this.pinInput.length < this.pin.length) return;
      if (this.pinInput === this.pin) {
        this.closePin(true);
        this.open();
      } else {
        const dots = $('#pin-dots');
        dots.classList.remove('shake');
        void dots.offsetWidth;
        dots.classList.add('shake');
        this.pinInput = '';
        setTimeout(() => this.renderPin(), 350);
      }
    });
  },

  // 운영 메뉴 PIN (비어 있으면 PIN 없이 연다)
  get pin() {
    return APP_OPERATOR_PIN;
  },

  openPin() {
    if (this.isOpen || this.pinOpen) return;
    if (!this.pin) return this.open();
    this.pinOpen = true;
    this.pinInput = '';
    this.renderPin();
    $('#pin').classList.add('active');
    this.armPinTimeout();
    this.demo.syncPause();
  },

  closePin(keepPaused = false) {
    clearTimeout(this.pinTimer);
    this.pinOpen = false;
    $('#pin').classList.remove('active');
    if (!keepPaused) this.demo.syncPause();
  },

  armPinTimeout() {
    clearTimeout(this.pinTimer);
    this.pinTimer = setTimeout(() => this.closePin(), OperatorMenu.PIN_TIMEOUT_MS);
  },

  renderPin() {
    $('#pin-dots').querySelectorAll('i').forEach((dot, i) => dot.classList.toggle('on', i < this.pinInput.length));
  },

  // ---------------- 자동 업로드 (js/session-upload.js) ----------------
  bindUpload() {
    SessionUpload.onChange = (state, uploadSettings) => {
      const stateLabel = $('#op-up-state');
      if (stateLabel) stateLabel.textContent = SessionUpload.describe(state, uploadSettings);
      if (this.isOpen) this.renderTabs();
    };
    SessionUpload.init();
    if (!$('#op-up-url')) return;
    const historyInput = $('#op-up-hist');
    const local = $('#op-up-local');
    const save = () => {
      SessionUpload.setSettings({
        url: $('#op-up-url').value, key: $('#op-up-key').value, historyUrl: historyInput ? historyInput.value : '',
        ...(local ? { localHistory: local.checked } : {}),
      });
      if (historyInput && local) historyInput.disabled = local.checked;
      if (this.isOpen) this.renderTabs(); // 회원 기록 칸의 상태 글
    };
    $('#op-up-url').addEventListener('change', save);
    $('#op-up-key').addEventListener('change', save);
    if (historyInput) historyInput.addEventListener('change', save);
    if (local) local.addEventListener('change', save);
    $('#op-up-now').onclick = () => {
      save();
      SessionUpload.kick();
    };
  },

  renderUpload() {
    if (!$('#op-up-url')) return;
    const { url, key, historyUrl, localHistory } = SessionUpload.settings();
    $('#op-up-url').value = url;
    $('#op-up-key').value = key;
    if ($('#op-up-hist')) $('#op-up-hist').value = historyUrl;
    if ($('#op-up-local')) {
      $('#op-up-local').checked = localHistory;
      if ($('#op-up-hist')) $('#op-up-hist').disabled = localHistory;
    }
    SessionUpload.refresh();
  },

  async renderSessions() {
    const countLabel = $('#op-sess-count');
    try {
      const sessionCount = await SessionStore.count();
      let size = '';
      if (navigator.storage && navigator.storage.estimate) {
        const { usage } = await navigator.storage.estimate();
        size = ` · 저장 공간 약 ${(usage / 1048576).toFixed(1)} MB`;
      }
      countLabel.textContent = `${sessionCount}건${size}${this.demo.storeError ? ` · 마지막 저장 실패: ${this.demo.storeError}` : ''}`;
    } catch (error) {
      countLabel.textContent = `읽을 수 없음: ${error.message || error}`;
    }
  },
};
