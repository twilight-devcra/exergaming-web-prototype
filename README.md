# 페달 & 브레인 — 엑서게임 웹 프로토타입

고정형 사이클을 일정한 속도로 밟으면서 화면의 인지 게임을 함께 푸는 시연용 엑서게임의 웹 프로토타입입니다.

## 실행

빌드 과정이나 외부 라이브러리가 없습니다. `index.html`을 브라우저로 열거나, 로컬 서버로 띄웁니다.

```bash
node server.js   # http://localhost:5173
```

- 페달링: `A` / `D` 키를 번갈아 누르기 (한 번 = 반 바퀴)
- 터치: 마우스 클릭
- 일시정지 `Esc`, 디버그 표시 `` ` ``

## 구성

| 경로 | 내용 |
|---|---|
| `index.html`, `css/`, `js/` | 게임 본체 |
| `js/config.js` | 라운드 길이, 허용 구역, 목표 속도 변화 등 조절값 |
| `js/pedal.js` | 페달 입력 (센서 연동 시 교체할 부분) |
| `js/games/` | 인지 게임 3종: 길 따라 그리기, 심볼 위치 외우기, 사칙연산 역산 |
| `docs/엑서게임_기획_슬라이드.pdf` | 기획 요약 슬라이드 |
| `docs/slides.html`, `docs/shots/` | 슬라이드 원본과 플레이 화면 스크린샷 |
| `docs/build/` | 스크린샷 촬영·PDF 생성 스크립트 (Node 22+, Edge 필요) |

## 슬라이드 다시 만들기

```bash
node docs/build/capture.js   # 게임을 자동 플레이하며 스크린샷 촬영
node docs/build/pdf.js       # slides.html → PDF
```
