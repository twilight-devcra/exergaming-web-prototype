// 테스트 화면(index.html)의 설정 메뉴: 탭, 라운드 난이도 프리셋, 설정 칸 ↔ cfg.
// 게임 켜고 끄기(#cfg-games)는 운영 메뉴와 함께 쓰므로 App(renderGameToggles)에 있다.
import { BASE_LEVEL, ROUND_PRESETS, Config, $, U } from './config.js';
import { maxGameLevel } from './difficulty.js';

// 프리셋이 채우는 값 → 설정 칸
const PRESET_FIELDS = {
  startLevel: '#cfg-start-level', maxLevel: '#cfg-max-level', diffUp: '#cfg-diff-up', diffDown: '#cfg-diff-down',
  questionTimeScale: '#cfg-qscale', tolerance: '#cfg-tol', maxDeviation: '#cfg-maxdev', rpmChangeAmount: '#cfg-change-amt',
};

const TAB_KEY = 'exergame.menuTab';

export const TestMenu = {
  bind(app) {
    bindPresets(app);
    bindTabs();
    this.fill(app);
  },

  // cfg → 설정 칸
  fill(app) {
    const c = app.cfg;
    $('#cfg-duration').value = c.durationSec;
    $('#cfg-calib').value = c.calibrationSec;
    $('#cfg-tol').value = Math.round(c.tolerance * 100);
    $('#cfg-preset').value = Config.presetOf(c);
    const preset = Config.preset($('#cfg-preset').value);
    $('#cfg-preset-note').textContent = Config.presetNote($('#cfg-preset').value);
    // 설명이 프리셋마다 길이가 달라 아래 칸들이 오르내리지 않게 가장 긴 설명만큼 자리를 잡아 둔다
    U.reserveHeight($('#cfg-preset-note'), Config.presetNotes());
    // 프리셋이 정한 칸을 칠한다
    Object.values(PRESET_FIELDS).forEach((id) => $(id).parentElement.classList.toggle('preset', !!preset));
    // 가장 단계가 많은 게임에 맞춘다 — 그보다 높게 시작하면 모든 게임이 최고 난이도로 고정된다
    $('#cfg-start-level').max = maxGameLevel();
    $('#cfg-start-level').value = c.startLevel;
    $('#cfg-max-level').max = maxGameLevel();
    $('#cfg-max-level').value = c.maxLevel;
    $('#cfg-qscale').value = c.questionTimeScale;
    $('#cfg-diff-up').value = c.diffUp;
    $('#cfg-diff-down').value = c.diffDown;
    $('#cfg-maxdev').value = Math.round(c.maxDeviation * 100);
    $('#cfg-change-amt').value = Math.round(c.rpmChangeAmount * 100);
    $('#cfg-mult').value = c.multiplierTop;
    $('#cfg-difficulty').value = c.difficulty;
    $('#cfg-change').checked = c.rpmChange;
    $('#cfg-brain').checked = !!c.brainOnly;
    $('#cfg-shift').value = c.shiftSec;
    $('#cfg-sound').checked = c.sound;
    $('#cfg-qtimer').checked = c.questionTimer;
    $('#cfg-source').value = c.rpmSource;
    app.applySource();
    document.querySelectorAll('#cfg-games input').forEach((box) => {
      box.checked = !c.games || c.games.includes(box.dataset.game);
    });
    app.renderGamesCount();
  },

  // 설정 칸 → cfg (범위를 벗어나면 맞춘다). 저장하고 칸을 다시 채운다
  read(app) {
    const num = (id, lo, hi, def) => {
      const v = parseFloat($(id).value);
      return Number.isFinite(v) ? U.clamp(v, lo, hi) : def;
    };
    const c = app.cfg;
    const top = maxGameLevel();
    c.durationSec = num('#cfg-duration', 30, 900, 180);
    c.calibrationSec = num('#cfg-calib', 5, 60, 15);
    c.tolerance = num('#cfg-tol', 3, 40, 12) / 100;
    c.startLevel = Math.round(num('#cfg-start-level', 1, top, BASE_LEVEL));
    c.maxLevel = Math.round(num('#cfg-max-level', 1, top, top));
    c.questionTimeScale = num('#cfg-qscale', 0.5, 3, 1);
    // 소수 단계는 부동소수 찌꺼기 없이 저장한다 (프리셋 값과 그대로 비교한다)
    const round4 = (v) => Math.round(v * 10000) / 10000;
    c.diffUp = round4(num('#cfg-diff-up', 0.05, 2, 0.4));
    c.diffDown = round4(num('#cfg-diff-down', 0.05, 2, 0.6));
    c.maxDeviation = round4(num('#cfg-maxdev', 10, 100, 45) / 100);
    c.rpmChangeAmount = round4(num('#cfg-change-amt', 0, 40, 12) / 100);
    c.multiplierTop = num('#cfg-mult', 1, 10, 5);
    c.difficulty = $('#cfg-difficulty').value;
    c.rpmChange = $('#cfg-change').checked;
    c.brainOnly = $('#cfg-brain').checked;
    c.shiftSec = num('#cfg-shift', 4, 30, 8);
    c.sound = $('#cfg-sound').checked;
    c.questionTimer = $('#cfg-qtimer').checked;
    c.rpmSource = $('#cfg-source').value;
    c.games = [...document.querySelectorAll('#cfg-games input')].filter((box) => box.checked).map((box) => box.dataset.game);
    Config.save(c);
    this.fill(app);
  },
};

// 라운드 난이도 프리셋: 고르면 프리셋 값을 채우고, 프리셋에 든 칸을 고치면 바로 반영해 '직접 설정'으로 바뀌는 것이 보이게 한다.
function bindPresets(app) {
  const select = $('#cfg-preset');
  select.innerHTML = ROUND_PRESETS.map((p) => `<option value="${p.id}">${p.label}</option>`).join('') +
    '<option value="custom" disabled>직접 설정</option>';
  select.addEventListener('change', () => {
    const preset = Config.preset(select.value);
    if (!preset) return;
    TestMenu.read(app);
    Object.assign(app.cfg, preset.values);
    Config.save(app.cfg);
    TestMenu.fill(app);
  });
  Object.values(PRESET_FIELDS).forEach((id) => $(id).addEventListener('change', () => TestMenu.read(app)));
  // 글꼴(화면 스타일마다 다르다)이 바뀌면 설명 높이를 다시 잰다
  const remeasure = () => requestAnimationFrame(() => U.reserveHeight($('#cfg-preset-note'), Config.presetNotes()));
  document.querySelector('[data-theme-picker]').addEventListener('change', remeasure);
  if (document.fonts) document.fonts.addEventListener('loadingdone', remeasure);
}

// 메뉴 설정 탭. 마지막으로 연 탭을 이 브라우저에 기억한다 (못 읽으면 첫 탭)
function bindTabs() {
  const tabs = [...document.querySelectorAll('.menu-tabs [data-tab]')];
  if (!tabs.length) return;
  const open = (id) => {
    if (!tabs.some((t) => t.dataset.tab === id)) id = tabs[0].dataset.tab;
    tabs.forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === id));
    document.querySelectorAll('.menu-pane').forEach((pane) => pane.classList.toggle('active', pane.dataset.pane === id));
    try { localStorage.setItem(TAB_KEY, id); } catch (e) { /* 저장 못 해도 탭은 바뀐다 */ }
  };
  tabs.forEach((t) => (t.onclick = () => open(t.dataset.tab)));
  let saved = null;
  try { saved = localStorage.getItem(TAB_KEY); } catch (e) { /* 첫 탭으로 */ }
  open(saved);
}
