# 스케치 (미니게임 초안 도구)

게임 코드를 쓰기 전에 게임 판을 진짜 앱 화면(운영 버전 1280×800, 풍경 라이딩 스타일) 안에 그려 보고 눌러 보는 도구입니다. 순서와 이유는 [docs/games/drafts/README.md](../../docs/games/drafts/README.md).

```bash
node server.js                              # http://localhost:5173/tools/sketch/<id>/
node tools/sketch/shoot.js <id> [저장 폴더]  # 모든 화면을 1280×800 PNG 로 (기본: tools/.cache/sketch/<id>/)
```

`dev` 에 올리면 태블릿에서 `https://twilight-devcra.github.io/exergaming-web-prototype/dev/tools/sketch/<id>/` 로 볼 수 있습니다.

## 파일

- `sketch.js` — `Sketch.page`(목업 페이지), `Sketch.frame`(게임 머리 줄), `Sketch.intro`(소개 화면), `Sketch.play`(눌러 보는 스케치), `Sketch.glyph`(심볼 위치 외우기의 `SYMBOLS` 그림)
- `sketch.css` — 페이지 스크롤, 태블릿 틀
- `shoot.js` — 헤드리스 Edge(`docs/build/cdp.js`)로 화면을 찍는다. Claude 가 자기 목업을 직접 보고 고칠 때도 쓴다
- `<id>/` — 게임 하나의 스케치
  - `board.js` — 상태 하나를 받아 판을 그리는 함수. 목업과 눌러 보는 스케치가 같이 쓴다
  - `index.html` — 2단계 목업: 손으로 쓴 상태들 × 배치 안 2~3개
  - `play.html` — 3단계: 손으로 쓴 문제를 진짜 게임과 같은 host 로 돌린다
  - `<id>.css`

## 규칙

- 앱 css(`css/style.css`, `css/themes.css`, `app/app.css`)를 그대로 불러온다. `<html data-edition="app">`, `<body data-theme="scenic">`
- 게임 판 자리는 약 **1160 × 340** (넓고 낮다). 목업 크기는 px 로 정한다. 앱 css 중 `vh` 로 정한 것은 목록 화면에서는 브라우저 창을 따르므로, 정확한 크기는 화면 이름을 눌러(`?shot=<id>`) 한 화면으로 본다
- 생성기는 만들지 않는다. 문제는 손으로 쓴다. 생성기는 설계가 정해진 뒤 진짜 게임에서 만든다
- 3단계 게임 클래스는 진짜 게임과 같은 모양(`constructor(host)`, `start()`, `abort()`, `host.after/timer/answer/done`)으로 쓴다. 그래야 `js/games/` 로 옮길 때 판 그리기와 진행 코드를 그대로 쓴다. 제한 시간은 `static questionTime = { base, per }` 로 적는다 (나중에 `js/config.js` 로 옮긴다)
- `js/` 의 게임 코드는 바꾸지 않는다
