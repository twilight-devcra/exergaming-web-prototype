// 운영 메뉴 (운영 버전 app/index.html): 대기 화면의 ⚙ 버튼이나 왼쪽 위 모서리 길게 누르기 → PIN → 운영 메뉴.
// 메뉴 안의 라운드 설정(DEMO_SETTINGS), 자동 업로드 설정, 기록 보기·내려받기도 여기 있다.
// 스테이션 흐름(js/demo.js 의 Demo)은 isOpen·pinOpen 으로 메뉴가 열려 있는지 보고 게임을 멈춘다.
import { PRESET_KEYS, ROUND_PRESETS, DEMO_SETTINGS, APP_OPERATOR_PIN, Config, $, U } from '../js/config.js';
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
  pinBuf: '',
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
    const c = this.app.cfg;
    const changed = Object.keys(Config.demoSaved()).length;
    const preset = Config.preset(Config.presetOf(c));
    $('#op-cfg').innerHTML = `설정 코드 <b>${Config.demoCode(c)}</b>${changed ? ` (기본값에서 ${changed}개 바꿈)` : ' (기본값)'} · ` +
      ($('#setup')
        ? `라운드 길이·난이도는 참가자가 고름 · `
        : `라운드 난이도 ${preset ? preset.label : '직접 설정'} · 라운드 ${U.fmtTime(c.durationSec)} · `) +
      `측정 ${c.calibrationSec}초 · 게임 ${this.app.enabledTypes().length}종<br>` +
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
        const n = await SessionStore.exportAll(`exergame-sessions-station${this.demo.station || ''}-${new Date().toISOString().slice(0, 10)}.jsonl`);
        if (!n) $('#op-sess-count').textContent = '저장된 로그가 없습니다';
      } catch (e) {
        $('#op-sess-count').textContent = `내보내기 실패: ${e.message || e}`;
      }
      setTimeout(() => (this.demo.leaving = false), 1000);
    };
    $('#op-sim').onchange = () => {
      this.demo.simResult = $('#op-sim').checked;
      this.demo.updateAttract();
    };
    $('#op-kbd').onchange = () => {
      this.demo.allowKbd = $('#op-kbd').checked;
      this.demo.updateAttract();
      if (this.app.state === 'setup') this.demo.pickSetup({});
    };
    $('#op-station').addEventListener('input', () => $('#op-station').classList.remove('invalid'));
    this.bindSettings();
    // 운영 버전: 대기 화면 오른쪽 아래의 '운영' 버튼 → PIN. 대기 화면을 눌러 시작하는 것과 겹치지 않게 막는다
    const ob = $('#op-open');
    if (ob) {
      ob.addEventListener('pointerdown', (e) => e.stopPropagation());
      ob.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openPin();
      });
    }
    // 모서리 길게 누르기 → PIN
    const corner = $('#op-corner');
    let timer = null;
    const cancel = () => { clearTimeout(timer); timer = null; };
    corner.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      cancel();
      timer = setTimeout(() => { timer = null; this.openPin(); }, OperatorMenu.CORNER_HOLD_MS);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => corner.addEventListener(t, cancel));
  },

  // ---------------- 라운드 설정 (DEMO_SETTINGS) ----------------
  // 맨 위의 '라운드 난이도'는 저장하는 항목이 아니다. 고르면 프리셋에 든 칸(PRESET_KEYS)을 채우고, 칸을 고치면 맞는 프리셋을 다시 찾아 보여 준다.
  bindSettings() {
    const box = $('#op-set-fields');
    const presets = ROUND_PRESETS.map((p) => `<option value="${p.id}">${p.label}</option>`).join('');
    box.append(U.el('label', 'setting', `라운드 난이도<select id="op-set-preset">${presets}<option value="custom" disabled>직접 설정</option></select>`));
    const note = U.el('p', 'setting-note');
    note.id = 'op-set-preset-note';
    box.append(note);
    $('#op-set-preset').addEventListener('change', (e) => {
      const p = Config.preset(e.target.value);
      if (p) this.fillSettings({ ...this.readSettings(), ...p.values });
    });
    // 두 열로 나눠 놓는다. DEMO_SETTINGS 순서는 설정 코드(Config.demoCode)에 쓰이므로 바꾸지 않고 여기서만 가른다
    const cols = [U.el('div', 'op-set-col', '<h3>시간·점수·페달</h3>'), U.el('div', 'op-set-col', '<h3>미니게임 난이도</h3>')];
    box.append(...cols);
    const right = ['difficulty', 'startLevel', 'maxLevel', 'diffUp', 'diffDown', 'questionTimeScale', 'multiplierTop'];
    for (const s of DEMO_SETTINGS) {
      const input = s.options
        ? `<select data-key="${s.key}">${s.options.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`
        : `<input type="number" data-key="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" inputmode="decimal">`;
      cols[right.includes(s.key) ? 1 : 0].append(U.el('label', 'setting', `${s.label}${input}`));
    }
    // 프리셋 선택은 위에서 따로 다룬다 (input 이 change 보다 먼저 와서, 여기서 다시 맞추면 고른 값이 되돌아간다)
    const mark = (e) => e.target.id !== 'op-set-preset' && this.markSettings();
    box.addEventListener('input', mark);
    box.addEventListener('change', mark);
    $('#op-set-open').onclick = () => this.openSettings();
    $('#op-set-cancel').onclick = () => $('#op-set').classList.remove('active');
    $('#op-set-reset').onclick = () => this.fillSettings(Config.demoDefaults());
    $('#op-set-save').onclick = () => this.saveSettings();
  },

  openSettings() {
    if (this.app.inRound) return;
    this.fillSettings(this.app.cfg);
    $('#op-set').classList.add('active');
    // 설명이 프리셋마다 길이가 달라 아래 칸들이 오르내리지 않게 가장 긴 설명만큼 자리를 잡아 둔다 (보이는 동안에만 잴 수 있다)
    U.reserveHeight($('#op-set-preset-note'), Config.presetNotes());
  },

  fillSettings(cfg) {
    for (const s of DEMO_SETTINGS) {
      const el = $(`#op-set-fields [data-key="${s.key}"]`);
      const v = cfg[s.key];
      el.value = s.options ? v : Math.round(v * (s.scale || 1) * 1000) / 1000;
    }
    this.markSettings();
  },

  readSettings() {
    const out = {};
    for (const s of DEMO_SETTINGS) {
      const el = $(`#op-set-fields [data-key="${s.key}"]`);
      if (s.options) {
        out[s.key] = el.value;
        continue;
      }
      const v = parseFloat(el.value);
      const def = Config.demoDefaults()[s.key];
      // 소수 단계(0.05 등)는 부동소수 찌꺼기 없이 저장한다
      out[s.key] = Number.isFinite(v) ? Math.round((U.clamp(v, s.min, s.max) / (s.scale || 1)) * 10000) / 10000 : def;
    }
    return out;
  },

  // 기본값과 다른 항목을 표시하고, 저장하면 될 설정 코드를 미리 보여 준다
  markSettings() {
    const v = this.readSettings();
    const def = Config.demoDefaults();
    for (const s of DEMO_SETTINGS) {
      $(`#op-set-fields [data-key="${s.key}"]`).parentElement.classList.toggle('changed', v[s.key] !== def[s.key]);
    }
    $('#op-set-code').textContent = `설정 코드 ${Config.demoCode(v)}`;
    const id = Config.presetOf(v);
    $('#op-set-preset').value = id;
    $('#op-set-preset-note').textContent = Config.presetNote(id);
    PRESET_KEYS.forEach((k) => $(`#op-set-fields [data-key="${k}"]`).parentElement.classList.toggle('preset', id !== 'custom'));
  },

  saveSettings() {
    const v = this.readSettings();
    Config.demoSave(v);
    Object.assign(this.app.cfg, v);
    this.demo.renderCfg();
    $('#op-set').classList.remove('active');
  },

  open() {
    const a = this.app;
    this.isOpen = true;
    $('#op-set-open').disabled = a.inRound;
    $('#op-set-open').textContent = a.inRound ? '라운드 설정 (라운드 중에는 못 바꿈)' : '라운드 설정';
    $('#op-station').value = this.demo.station;
    $('#op-kbd').checked = this.demo.allowKbd;
    $('#op-sim').checked = this.demo.simResult;
    $('#op-station').classList.remove('invalid');
    $('#op-round').style.display = a.inRound ? '' : 'none';
    $('#op-end').style.display = a.state === 'play' ? '' : 'none';
    if (a.inRound) {
      const left = a.state === 'play' ? a.cfg.durationSec - a.elapsed : a.cfg.durationSec;
      $('#op-round-note').textContent = `라운드 진행 중 · 멈춰 있음 (남은 시간 ${U.fmtTime(left)})`;
    }
    $('#op-close').textContent = a.inRound ? '이어서 진행' : a.state === 'result' || a.state === 'ending' ? '결과 화면으로 돌아가기' : '대기 화면 열기';
    this.renderLog();
    this.renderSessions();
    this.renderUpload();
    this.app.renderMusicTry();
    if (a.inRound) a.log.ev('operator', { open: true });
    $('#op').classList.add('active');
    this.demo.syncPause();
  },

  hide() {
    this.app.audio.endPreview();
    this.app.renderMusicTry();
    if (this.app.inRound && this.isOpen) this.app.log.ev('operator', { open: false });
    this.isOpen = false;
    $('#op-set').classList.remove('active');
    $('#op').classList.remove('active');
    this.demo.syncPause();
  },

  close() {
    const v = parseInt($('#op-station').value, 10);
    if (!(v >= 1 && v <= 99)) {
      $('#op-station').classList.add('invalid');
      $('#op-station').focus();
      return;
    }
    this.demo.station = String(v);
    this.demo.save('station', this.demo.station);
    this.demo.renderStation();
    this.demo.enterKiosk();
    this.hide();
  },

  renderLog() {
    const log = this.demo.load('log', []);
    $('#op-log-count').textContent = log.length ? `${log.length}건` : '';
    const el = $('#op-log');
    if (!log.length) {
      el.innerHTML = '<li class="board-empty">아직 기록이 없습니다</li>';
      return;
    }
    el.innerHTML = log.slice(-40).reverse().map((r) => {
      const t = new Date(r.at);
      const hm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
      return `<li><b>${r.station || '?'}-${String(r.no).padStart(3, '0')}</b><span>${hm}${r.track === 'brain' ? ' · 두뇌만' : ''}</span><span class="sc">${r.score.toLocaleString('ko-KR')}점</span></li>`;
    }).join('');
  },

  downloadCsv() {
    const log = this.demo.load('log', []);
    // track: dual(페달 + 두뇌 게임) · brain(두뇌 게임만). 이 열을 더하기 전 기록은 dual.
    // 끝의 열은 두뇌 그래프의 축 (0~1, js/abilities.js AXES). 2026-11-20 전 기록은 축이 달라(별점) 비어 있다
    const head = ['station', 'no', 'time', 'settings', 'track', 'score', 'exercise', 'cognitive', 'kcal', 'dist_m', 'revs', ...AXES.map((x) => x.id)];
    const rows = log.map((r) => [r.station, r.no, r.at, r.cfg ?? '', r.track || 'dual', r.score, r.ex, r.cog, r.kcal, r.distM ?? '', r.revs, ...AXES.map((x) => r.domains?.[x.id] ?? '')]);
    const csv = '﻿' + [head, ...rows].map((row) => row.join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `exergame-station${this.demo.station || ''}-${new Date().toISOString().slice(0, 10)}.csv`;
    this.demo.leaving = true; // 다운로드도 beforeunload 를 부를 수 있다
    a.click();
    setTimeout(() => { this.demo.leaving = false; URL.revokeObjectURL(a.href); }, 1000);
  },

  // ---------------- PIN ----------------
  bindPin() {
    $('#pin-pad').addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      e.preventDefault();
      this.armPinTimeout();
      const k = b.dataset.k;
      if (k === 'cancel') return this.closePin();
      if (k === 'del') this.pinBuf = this.pinBuf.slice(0, -1);
      else if (this.pinBuf.length < this.pin.length) this.pinBuf += b.textContent;
      this.renderPin();
      if (this.pinBuf.length < this.pin.length) return;
      if (this.pinBuf === this.pin) {
        this.closePin(true);
        this.open();
      } else {
        const dots = $('#pin-dots');
        dots.classList.remove('shake');
        void dots.offsetWidth;
        dots.classList.add('shake');
        this.pinBuf = '';
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
    this.pinBuf = '';
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
    $('#pin-dots').querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i < this.pinBuf.length));
  },

  // ---------------- 자동 업로드 (js/session-upload.js) ----------------
  bindUpload() {
    SessionUpload.onChange = (state, set) => {
      const el = $('#op-up-state');
      if (el) el.textContent = SessionUpload.describe(state, set);
    };
    SessionUpload.init();
    if (!$('#op-up-url')) return;
    const hist = $('#op-up-hist');
    const local = $('#op-up-local');
    const save = () => {
      SessionUpload.setSettings({
        url: $('#op-up-url').value, key: $('#op-up-key').value, historyUrl: hist ? hist.value : '',
        ...(local ? { localHistory: local.checked } : {}),
      });
      if (hist && local) hist.disabled = local.checked;
    };
    $('#op-up-url').addEventListener('change', save);
    $('#op-up-key').addEventListener('change', save);
    if (hist) hist.addEventListener('change', save);
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
    const el = $('#op-sess-count');
    try {
      const n = await SessionStore.count();
      let size = '';
      if (navigator.storage && navigator.storage.estimate) {
        const { usage } = await navigator.storage.estimate();
        size = ` · 저장 공간 약 ${(usage / 1048576).toFixed(1)} MB`;
      }
      el.textContent = `${n}건${size}${this.demo.storeError ? ` · 마지막 저장 실패: ${this.demo.storeError}` : ''}`;
    } catch (e) {
      el.textContent = `읽을 수 없음: ${e.message || e}`;
    }
  },
};
