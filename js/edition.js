// 판(edition)마다 다른 일. App 은 지금이 어느 판인지 묻지 않고 App.edition 의 갈고리를 부른다.
//  - 테스트 화면 (index.html): 아래 TestEdition. 메뉴에서 설정을 고르고, Esc 일시정지 메뉴와 개발용 키가 있다
//  - 운영 버전 (app/, 무인 스테이션): js/demo.js 의 StationEdition. 대기 화면 · 회원 · 운영 메뉴는 Demo 가 맡는다
import { Config } from './config.js';
import { TestMenu } from './test-menu.js';
import { TestResults } from './test-results.js';

/**
 * @typedef {object} Edition
 * @property {'test' | 'demo'} mode   세션 로그의 meta.mode
 * @property {string} homeScreen      라운드를 그만두면 돌아가는 화면
 * @property {boolean} pauseMenu      Esc 로 여는 일시정지 메뉴가 있는가 (없으면 판이 스스로 멈춘다)
 * @property {boolean} devKeys        T(화면 스타일 바꾸기) · `(디버그 표시) 키를 쓰는가
 * @property {() => object} loadConfig                 처음 설정
 * @property {(app: object) => void} bindScreens       App.init 중간, 키·페달을 묶기 전에 판의 화면을 준비한다
 * @property {(app: object) => void} start             App.init 끝
 * @property {(app: object) => void} beforeRound       라운드를 시작하기 직전
 * @property {(app: object, id: string) => void} onScreen  화면(.screen)을 바꿨다
 * @property {(app: object, dt: number, rpm: number) => void} tick  매 프레임
 * @property {(app: object, state: string, detail: string) => boolean} onLink  페달 연결 상태가 바뀌었다. true = 판이 다 처리했다 (App 의 기본 처리를 건너뛴다)
 * @property {(app: object) => boolean} onRotate       화면을 눕히거나 세웠다. true = 판이 다 처리했다
 * @property {(app: object, log: object, ended: string) => void} logClosed  세션 로그를 닫았다
 * @property {(app: object) => object | null} plantInfo  라운드 끝에 기념물을 세울 정보 (Band.plant). 세우지 않으면 null
 * @property {(app: object) => object | null} roundPreset  결과 화면 난이도 권유의 기준이 되는 라운드 난이도 프리셋
 * @property {(app: object) => boolean} remembersSetup  권한 난이도를 다음 세션 설정에 미리 골라 두는가 (회원)
 * @property {(app: object) => boolean} showResult     결과 화면을 띄운다 (테스트: js/test-results.js, 스테이션: Demo.showResult)
 */

/** @type {Edition} */
export const TestEdition = {
  mode: 'test',
  homeScreen: 'menu',
  pauseMenu: true,
  devKeys: true,
  loadConfig: () => Config.load(),
  bindScreens(app) {
    TestMenu.bind(app);
    TestResults.bind(app);
  },
  start() {},
  beforeRound(app) {
    TestMenu.read(app);
  },
  onScreen(app, id) {
    if (id === 'menu') TestResults.renderBoard(document.querySelector('#menu-board'));
  },
  tick() {},
  onLink: () => false,
  onRotate: () => false,
  logClosed() {},
  plantInfo: () => null,
  roundPreset: (app) => Config.presetOf(app.config),
  remembersSetup: () => false,
  showResult() {
    TestResults.show();
    return true;
  },
};
