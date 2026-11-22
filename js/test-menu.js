// 테스트 화면(index.html)의 설정 메뉴: 탭, 라운드 난이도 프리셋, 설정 칸 ↔ config.
// 게임 켜고 끄기(#cfg-games)는 운영 메뉴와 함께 쓰므로 App(renderGameToggles)에 있다.
import { BASE_LEVEL, ROUND_PRESETS, Config, $, Util } from './config.js';
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

  // config → 설정 칸
  fill(app) {
    const config = app.config;
    $('#cfg-duration').value = config.durationSec;
    $('#cfg-calib').value = config.calibrationSec;
    $('#cfg-tol').value = Math.round(config.tolerance * 100);
    $('#cfg-preset').value = Config.presetOf(config);
    const preset = Config.preset($('#cfg-preset').value);
    $('#cfg-preset-note').textContent = Config.presetNote($('#cfg-preset').value);
    // 설명이 프리셋마다 길이가 달라 아래 칸들이 오르내리지 않게 가장 긴 설명만큼 자리를 잡아 둔다
    Util.reserveHeight($('#cfg-preset-note'), Config.presetNotes());
    // 프리셋이 정한 칸을 칠한다
    Object.values(PRESET_FIELDS).forEach((id) => $(id).parentElement.classList.toggle('preset', !!preset));
    // 가장 단계가 많은 게임에 맞춘다 — 그보다 높게 시작하면 모든 게임이 최고 난이도로 고정된다
    $('#cfg-start-level').max = maxGameLevel();
    $('#cfg-start-level').value = config.startLevel;
    $('#cfg-max-level').max = maxGameLevel();
    $('#cfg-max-level').value = config.maxLevel;
    $('#cfg-qscale').value = config.questionTimeScale;
    $('#cfg-diff-up').value = config.diffUp;
    $('#cfg-diff-down').value = config.diffDown;
    $('#cfg-maxdev').value = Math.round(config.maxDeviation * 100);
    $('#cfg-change-amt').value = Math.round(config.rpmChangeAmount * 100);
    $('#cfg-mult').value = config.multiplierTop;
    $('#cfg-difficulty').value = config.difficulty;
    $('#cfg-change').checked = config.rpmChange;
    $('#cfg-brain').checked = !!config.brainOnly;
    $('#cfg-shift').value = config.shiftSec;
    $('#cfg-sound').checked = config.sound;
    $('#cfg-qtimer').checked = config.questionTimer;
    $('#cfg-source').value = config.rpmSource;
    app.applySource();
    document.querySelectorAll('#cfg-games input').forEach((box) => {
      box.checked = !config.games || config.games.includes(box.dataset.game);
    });
    app.renderGamesCount();
  },

  // 설정 칸 → config (범위를 벗어나면 맞춘다). 저장하고 칸을 다시 채운다
  read(app) {
    const readNumber = (id, min, max, fallback) => {
      const value = parseFloat($(id).value);
      return Number.isFinite(value) ? Util.clamp(value, min, max) : fallback;
    };
    const config = app.config;
    const top = maxGameLevel();
    config.durationSec = readNumber('#cfg-duration', 30, 900, 180);
    config.calibrationSec = readNumber('#cfg-calib', 5, 60, 15);
    config.tolerance = readNumber('#cfg-tol', 3, 40, 12) / 100;
    config.startLevel = Math.round(readNumber('#cfg-start-level', 1, top, BASE_LEVEL));
    config.maxLevel = Math.round(readNumber('#cfg-max-level', 1, top, top));
    config.questionTimeScale = readNumber('#cfg-qscale', 0.5, 3, 1);
    // 소수 단계는 부동소수 찌꺼기 없이 저장한다 (프리셋 값과 그대로 비교한다)
    const round4 = (value) => Math.round(value * 10000) / 10000;
    config.diffUp = round4(readNumber('#cfg-diff-up', 0.05, 2, 0.4));
    config.diffDown = round4(readNumber('#cfg-diff-down', 0.05, 2, 0.6));
    config.maxDeviation = round4(readNumber('#cfg-maxdev', 10, 100, 45) / 100);
    config.rpmChangeAmount = round4(readNumber('#cfg-change-amt', 0, 40, 12) / 100);
    config.multiplierTop = readNumber('#cfg-mult', 1, 10, 5);
    config.difficulty = $('#cfg-difficulty').value;
    config.rpmChange = $('#cfg-change').checked;
    config.brainOnly = $('#cfg-brain').checked;
    config.shiftSec = readNumber('#cfg-shift', 4, 30, 8);
    config.sound = $('#cfg-sound').checked;
    config.questionTimer = $('#cfg-qtimer').checked;
    config.rpmSource = $('#cfg-source').value;
    config.games = [...document.querySelectorAll('#cfg-games input')].filter((box) => box.checked).map((box) => box.dataset.game);
    Config.save(config);
    this.fill(app);
  },
};

// 라운드 난이도 프리셋: 고르면 프리셋 값을 채우고, 프리셋에 든 칸을 고치면 바로 반영해 '직접 설정'으로 바뀌는 것이 보이게 한다.
function bindPresets(app) {
  const select = $('#cfg-preset');
  select.innerHTML = ROUND_PRESETS.map((roundPreset) => `<option value="${roundPreset.id}">${roundPreset.label}</option>`).join('') +
    '<option value="custom" disabled>직접 설정</option>';
  select.addEventListener('change', () => {
    const preset = Config.preset(select.value);
    if (!preset) return;
    TestMenu.read(app);
    Object.assign(app.config, preset.values);
    Config.save(app.config);
    TestMenu.fill(app);
  });
  Object.values(PRESET_FIELDS).forEach((id) => $(id).addEventListener('change', () => TestMenu.read(app)));
  // 글꼴(화면 스타일마다 다르다)이 바뀌면 설명 높이를 다시 잰다
  const remeasure = () => requestAnimationFrame(() => Util.reserveHeight($('#cfg-preset-note'), Config.presetNotes()));
  document.querySelector('[data-theme-picker]').addEventListener('change', remeasure);
  if (document.fonts) document.fonts.addEventListener('loadingdone', remeasure);
}

// 메뉴 설정 탭. 마지막으로 연 탭을 이 브라우저에 기억한다 (못 읽으면 첫 탭)
function bindTabs() {
  const tabs = [...document.querySelectorAll('.menu-tabs [data-tab]')];
  if (!tabs.length) return;
  const open = (id) => {
    if (!tabs.some((tab) => tab.dataset.tab === id)) id = tabs[0].dataset.tab;
    tabs.forEach((tab) => tab.setAttribute('aria-selected', tab.dataset.tab === id));
    document.querySelectorAll('.menu-pane').forEach((pane) => pane.classList.toggle('active', pane.dataset.pane === id));
    try { localStorage.setItem(TAB_KEY, id); } catch { /* 저장 못 해도 탭은 바뀐다 */ }
  };
  tabs.forEach((tab) => (tab.onclick = () => open(tab.dataset.tab)));
  let saved = null;
  try { saved = localStorage.getItem(TAB_KEY); } catch { /* 첫 탭으로 */ }
  open(saved);
}
