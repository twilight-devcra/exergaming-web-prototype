// 새 버전 알아차리기: 배포된 사이트(GitHub Pages)에서 새 버전이 올라왔는지 가끔 보고, 안전할 때 페이지를 다시 불러온다.
// 배포할 때 tools/stamp.js 가 페이지의 .build-tag 에 data-build(이 페이지의 빌드 값)를 적고, 페이지 옆에 version.json 을 만든다.
// 둘이 다르면 새 버전이 있는 것이다. 저장소를 그대로 열면 data-build 가 없으므로 아무것도 하지 않는다.
//
// 다시 불러오는 때 (ready() 가 참일 때만):
//   - 운영 버전: 대기 화면이 조용할 때 (js/demo.js), 또는 대기 화면에서 시작을 누를 때
//   - 테스트 화면: 시작 버튼을 누를 때 (js/main.js). 휴대폰은 대기 화면에 오래 머무르지 않으므로
//   시작을 눌렀는데 다시 불러오면 새 버전에서 한 번 더 누르면 된다 (전체 화면·소리는 사람이 눌러야 켜진다)
// 조건:
//   - 새 버전을 본 지 SETTLE_SEC 이 지났다. GitHub Pages 는 파일을 10분까지 캐시하므로, 바로 다시 불러오면
//     캐시된 예전 파일과 새 파일이 섞일 수 있다 (특히 ?v= 가 붙지 않는 테스트 화면)
//   - 보내는 중이거나 아직 안 보낸 세션이 없다 (js/session-upload.js)
//   - 페달: 다시 불러오면 Web Bluetooth 연결이 끊긴다. 연결해 둔 페달이 있으면, 브라우저가 기억한 페달에 저절로
//     다시 붙을 수 있을 때만(PedalLink.reconnectRemembered) 다시 불러온다. 이 기기에서 한 번 실패하면 그 뒤로는
//     페달이 연결돼 있는 동안 다시 불러오지 않고 버전 표시에 '새 버전 있음'만 보인다 (진행 요원이 새로고침하면 된다)
import { SessionUpload } from './session-upload.js';

export const UpdateCheck = {
  CHECK_SEC: 300,  // 이만큼마다 version.json 을 본다 (화면이 다시 보일 때와 인터넷이 다시 연결될 때도)
  SETTLE_SEC: 600, // 새 버전을 보고 이만큼 기다린 뒤에 다시 불러온다 (GitHub Pages 캐시 10분)
  QUIET_SEC: 60,   // 운영 버전: 대기 화면에서 이만큼 아무도 밟거나 누르지 않으면 다시 불러온다 (js/demo.js)
  RECONNECT_KEY: 'exergame.update.pedalReconnect', // 이 기기에서 다시 불러온 뒤 페달에 다시 붙었는가: 'ok' | 'failed'
  RELOAD_KEY: 'exergame.update.reloaded',           // sessionStorage: 새 버전으로 다시 불러왔다 ('pedal' 이면 페달이 연결돼 있었다)

  build: '',   // 이 페이지의 빌드 값 (main 은 커밋 번호, dev 는 'dev' + 커밋 번호)
  newer: null, // version.json 에서 본 새 버전 ({ build, version })
  foundAt: 0,  // 그 새 버전을 처음 본 시각 (Date.now)
  link: null,  // PedalLink
  tag: null,
  label: '',

  init(link) {
    this.link = link;
    this.tag = document.querySelector('.build-tag');
    this.build = (this.tag && this.tag.dataset.build) || '';
    if (!this.build) return; // 저장소를 그대로 연 것 (로컬)
    this.label = this.tag.textContent;
    this.afterReload();
    setInterval(() => this.check(), this.CHECK_SEC * 1000);
    window.addEventListener('online', () => this.check());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.check();
    });
    this.check();
  },

  async check() {
    let info;
    try {
      // 이 파일은 js/ 에 있으므로 ../version.json 은 페이지 묶음의 맨 위 (운영본은 사이트 맨 위, dev 는 /dev/)
      const response = await fetch(new URL('../version.json', import.meta.url), { cache: 'no-store' });
      if (!response.ok) return;
      info = await response.json();
    } catch {
      return; // 인터넷이 없으면 다음에 다시 본다
    }
    if (!info || !info.build || info.build === this.build) return;
    if (!this.newer || this.newer.build !== info.build) {
      this.newer = info;
      this.foundAt = Date.now();
    }
    this.render();
  },

  // 다시 불러와도 되는가
  ready() {
    return !!this.newer && Date.now() - this.foundAt >= this.SETTLE_SEC * 1000 && this.uploadsClear() && this.pedalOk();
  },

  uploadsClear() {
    if (!SessionUpload.started) return true; // 업로드를 쓰지 않는 페이지 (테스트 화면)
    if (SessionUpload.busy) return false;
    if (!SessionUpload.settings().url) return true; // 업로드 주소가 없으면 세션은 태블릿에만 남는다 (다시 불러와도 그대로)
    return SessionUpload.state.pending === 0;
  },

  pedalOk() {
    if (!this.link || !this.link.wantLink) return true;
    let record = null;
    try { record = localStorage.getItem(this.RECONNECT_KEY); } catch { /* 모르면 한 번 해 본다 */ }
    return this.link.canRemember && record !== 'failed';
  },

  // 부르기 전에 ready() 를 확인한다. 운영 버전은 beforeunload 경고를 먼저 꺼 둔다 (js/demo.js leaving)
  reload() {
    try { sessionStorage.setItem(this.RELOAD_KEY, this.link && this.link.wantLink ? 'pedal' : '1'); } catch { /* 페달에 다시 붙지 못할 뿐 */ }
    location.reload();
  },

  // 새 버전으로 다시 불러온 직후: 연결해 두었던 페달에 다시 붙고, 됐는지 이 기기에 적어 둔다
  afterReload() {
    let reloaded = null;
    try {
      reloaded = sessionStorage.getItem(this.RELOAD_KEY);
      sessionStorage.removeItem(this.RELOAD_KEY);
    } catch { return; }
    if (reloaded !== 'pedal' || !this.link) return;
    this.link.reconnectRemembered().then((ok) => {
      try { localStorage.setItem(this.RECONNECT_KEY, ok ? 'ok' : 'failed'); } catch { /* 다음에 다시 해 본다 */ }
    });
  },

  // 버전 표시 옆에 '새 버전 있음' (다시 불러오기를 기다리는 동안. 페달 때문에 못 하면 진행 요원이 새로고침하면 된다)
  render() {
    if (!this.tag) return;
    this.tag.textContent = `${this.label} · 새 버전 있음`;
    this.tag.title = `새 버전 v${this.newer.version} · 대기 화면이 조용하거나 시작을 누를 때 다시 불러옵니다`;
  },
};
