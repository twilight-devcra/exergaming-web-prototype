// 운영 메뉴 (운영 버전 app/index.html): 대기 화면의 ⚙ 버튼이나 왼쪽 위 모서리 길게 누르기 → PIN → 운영 메뉴.
// 메뉴 안의 라운드 설정(DEMO_SETTINGS), 자동 업로드 설정, 기록 보기·내려받기도 여기 있다.
// 스테이션 흐름(js/demo.js 의 Demo)은 isOpen·pinOpen 으로 메뉴가 열려 있는지 보고 게임을 멈춘다.
import { PRESET_KEYS, ROUND_PRESETS, DEMO_SETTINGS, APP_OPERATOR_PIN, Config, $, Util } from '../js/config.js';
import { AXES } from '../js/abilities.js';
import { SessionStore } from '../js/session-log.js';
import { SessionUpload } from '../js/session-upload.js';

export const OperatorMenu = {
  CORNER_HOLD_MS: 2000,  // 왼쪽 위 모서리를 이만큼 누르고 있으면 PIN 입력
  PIN_TIMEOUT_MS: 20000, // PIN 화면에서 이만큼 아무것도 누르지 않으면 닫는다

  demo: null,       // js/demo.js 의 Demo (스테이션 번호·저장·멈춤)
  app: null,
  isOpen: false,    // 운영 메뉴가 열려 있다 (게임은 멈춤)
  pinOpen: false,   // PIN 화면이 열려 있다
  pinInput: '',
  pinTimer: null,

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
    $('#op-cfg').innerHTML = `설정 코드 <b>${Config.demoCode(settings)}</b>${changed ? ` (기본값에서 ${changed}개 바꿈)` : ' (기본값)'} · ` +
      ($('#setup')
        ? `라운드 길이·난이도는 참가자가 고름 · `
        : `라운드 난이도 ${preset ? preset.label : '직접 설정'} · 라운드 ${Util.formatTime(settings.durationSec)} · `) +
      `측정 ${settings.calibrationSec}초 · 게임 ${this.app.enabledTypes().length}종<br>` +
      (this.pin ? '운영 메뉴는 왼쪽 위 모서리를 2초 누른 뒤 PIN 을 입력하면 열립니다.' : '운영 메뉴는 대기 화면의 ⚙ 운영 버튼이나 왼쪽 위 모서리 2초 누르기로 열립니다 (PIN 없음).');
  },

  // ---------------- 운영 메뉴 ----------------
  bindMenu() {
    $('#op-close').onclick = () => this.close();
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
        const exported = await SessionStore.exportAll(`exergame-sessions-station${this.demo.station || ''}-${new Date().toISOString().slice(0, 10)}.jsonl`);
        if (!exported) $('#op-sess-count').textContent = '저장된 로그가 없습니다';
      } catch (error) {
        $('#op-sess-count').textContent = `내보내기 실패: ${error.message || error}`;
      }
      setTimeout(() => (this.demo.leaving = false), 1000);
    };
    $('#op-sim').onchange = () => {
      this.demo.simResult = $('#op-sim').checked;
      this.demo.updateAttract();
    };
    $('#op-kbd').onchange = () => {
      this.demo.allowKeyboard = $('#op-kbd').checked;
      this.demo.updateAttract();
      if (this.app.state === 'setup') this.demo.pickSetup({});
    };
    $('#op-station').addEventListener('input', () => $('#op-station').classList.remove('invalid'));
    this.bindSettings();
    // 운영 버전: 대기 화면 오른쪽 아래의 '운영' 버튼 → PIN. 대기 화면을 눌러 시작하는 것과 겹치지 않게 막는다
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
    $('#op-set-open').onclick = () => this.openSettings();
    $('#op-set-cancel').onclick = () => $('#op-set').classList.remove('active');
    $('#op-set-reset').onclick = () => this.fillSettings(Config.demoDefaults());
    $('#op-set-save').onclick = () => this.saveSettings();
  },

  openSettings() {
    if (this.app.inRound) return;
    this.fillSettings(this.app.config);
    $('#op-set').classList.add('active');
    // 설명이 프리셋마다 길이가 달라 아래 칸들이 오르내리지 않게 가장 긴 설명만큼 자리를 잡아 둔다 (보이는 동안에만 잴 수 있다)
    Util.reserveHeight($('#op-set-preset-note'), Config.presetNotes());
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
  },

  saveSettings() {
    const values = this.readSettings();
    Config.demoSave(values);
    Object.assign(this.app.config, values);
    this.demo.renderConfig();
    $('#op-set').classList.remove('active');
  },

  open() {
    const app = this.app;
    this.isOpen = true;
    $('#op-set-open').disabled = app.inRound;
    $('#op-set-open').textContent = app.inRound ? '라운드 설정 (라운드 중에는 못 바꿈)' : '라운드 설정';
    $('#op-station').value = this.demo.station;
    $('#op-kbd').checked = this.demo.allowKeyboard;
    $('#op-sim').checked = this.demo.simResult;
    $('#op-station').classList.remove('invalid');
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
    $('#op').classList.add('active');
    this.demo.syncPause();
  },

  hide() {
    this.app.audio.endPreview();
    this.app.renderMusicTry();
    if (this.app.inRound && this.isOpen) this.app.log.event('operator', { open: false });
    this.isOpen = false;
    $('#op-set').classList.remove('active');
    $('#op').classList.remove('active');
    this.demo.syncPause();
  },

  close() {
    const station = parseInt($('#op-station').value, 10);
    if (!(station >= 1 && station <= 99)) {
      $('#op-station').classList.add('invalid');
      $('#op-station').focus();
      return;
    }
    this.demo.station = String(station);
    this.demo.save('station', this.demo.station);
    this.demo.renderStation();
    this.demo.enterKiosk();
    this.hide();
  },

  renderLog() {
    const log = this.demo.load('log', []);
    $('#op-log-count').textContent = log.length ? `${log.length}건` : '';
    const list = $('#op-log');
    if (!log.length) {
      list.innerHTML = '<li class="board-empty">아직 기록이 없습니다</li>';
      return;
    }
    list.innerHTML = log.slice(-40).reverse().map((round) => {
      const time = new Date(round.at);
      const hourMinute = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
      return `<li><b>${round.station || '?'}-${String(round.no).padStart(3, '0')}</b><span>${hourMinute}${round.track === 'brain' ? ' · 두뇌만' : ''}</span><span class="sc">${round.score.toLocaleString('ko-KR')}점</span></li>`;
    }).join('');
  },

  downloadCsv() {
    const log = this.demo.load('log', []);
    // track: dual(페달 + 두뇌 게임) · brain(두뇌 게임만). 이 열을 더하기 전 기록은 dual.
    // 끝의 열은 두뇌 그래프의 축 (0~1, js/abilities.js AXES). 2026-11-20 전 기록은 축이 달라(별점) 비어 있다
    const header = ['station', 'no', 'time', 'settings', 'track', 'score', 'exercise', 'cognitive', 'kcal', 'dist_m', 'revs', ...AXES.map((axis) => axis.id)];
    const rows = log.map((round) => [round.station, round.no, round.at, round.config ?? '', round.track || 'dual', round.score, round.ex, round.cog, round.kcal, round.distM ?? '', round.revs, ...AXES.map((axis) => round.domains?.[axis.id] ?? '')]);
    const csv = '﻿' + [header, ...rows].map((row) => row.join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `exergame-station${this.demo.station || ''}-${new Date().toISOString().slice(0, 10)}.csv`;
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
