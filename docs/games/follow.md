[← 목차·공통 규칙](README.md) · [← 공 따라가기](track.md) · [짝 없는 것 찾기 →](pair.md)

# 지시 따르기 (`follow`)

> 이 문서는 `node tools/manual.js`가 게임 코드에서 자동으로 생성합니다. 직접 수정하지 마세요.
> 내용을 바꾸려면 게임 파일(`js/games/*.js`)의 상단 주석, `levels`, 상수 주석을 수정한 뒤 스크립트를 다시 실행하세요.

기계의 조작판. 판의 화면에 짧은 지시가 뜨고, 그대로 버튼을 누르거나 스위치를 켠다. 한 게임에 지시 3개.

- 파일: [js/games/follow.js](../../js/games/follow.js) — 설계 의도는 파일 상단 주석에 더 자세히 있습니다
- 문제 수: 게임당 3개
- 태그: order (태그가 겹치는 게임은 연달아 나오지 않음)
- 제한 시간: 4초 + 1.5초 × N, N = 지시의 양 (버튼 하나 1 · 스위치·차례 누를 수 · 바로 옆 2 · 램프 조건 3 · 이어진 지시 단계 수 + 1)
- 두뇌 그래프 영역: 언어 · 주의집중
- 세부 인지 영역: 언어 이해 · 작업 기억 · 억제 (부분) · 추론 · 규칙 찾기 (부분) · 순서 기억 (부분) ([점검표](TARGETS.md))

## 난이도 변수

| 변수 | 설명 |
|---|---|
| `buttons` · `switches` · `lamps` | 조작판의 버튼·스위치·램프 수 (0 이면 그 줄이 없다) |
| `kinds` | 이 단계에서 나올 수 있는 지시 종류 (같은 것을 두 번 적으면 더 자주 나온다) |
| `flips` | sw 의 켤 스위치 수 |
| `steps` | seq·reverse 의 누를 버튼 수 |
| `times` | twice 의 횟수 |
| `chain` | chain 의 단계 수 |
| `mixed` | mixed 에서 스위치 다음에 누를 버튼 수 |
| `distract` | go 에서 먼저 켜지는 다른 램프 수 (최대) |
| `read` | 지시를 읽을 시간만큼 보여 주고 (FollowGame.readMs) 화면을 끈 다음에야 조작판이 풀린다. 이어진 지시는 첫 단계만 그렇고, 그 뒤 단계는 바로 뜨고 바로 조작한다 (단계마다 기다리면 지루하다) |
| `cover` | read 동안 조작판(램프·스위치·버튼)을 덮개로 가린다 |
| `time` | 제한 시간 배율 (1 보다 작으면 짧다. 읽는 시간은 빼고 잰다) |

## 레벨별 값

| Lv | `buttons` | `switches` | `lamps` | `kinds` | `flips` | `steps` | `times` | `chain` | `mixed` | `distract` | `read` | `cover` | `time` | 메모 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 (쉬움) | 3 | 0 | 0 | one, edge, twice | – | – | 2 | – | – | – | – | – | – | 쉬운 단계: 버튼 하나를 그림이나 자리로 찾는다 |
| 2 (쉬움) | 4 | 3 | 0 | one, edge, nth, twice, sw | 1 | – | 2 | – | – | – | – | – | – |  |
| 3 | 5 | 3 | 0 | nth, not, twice, sw, seq, between | 2 | 2 | 2 | – | – | – | – | – | – |  |
| 4 | 5 | 4 | 0 | not, seq, rel, between, offall, parity, twice | 2 | 2 | 3 | – | – | – | – | – | – |  |
| 5 | 6 | 4 | 2 | seq, rel2, between, if, swif, cmp, countpress, go, offall | – | 2 | – | – | – | 0 | – | – | – | 램프가 들어온다: 조건 · 세기 · 기다리기 |
| 6 | 6 | 4 | 3 | reverse, ifand, ifor, swif, cmp, countsw, countpress, go, mixed, chain, parity | – | 3 | – | 2 | 1 | 1 | ✓ | – | – | 외워서: 지시를 읽는 동안은 조작할 수 없고, 화면이 꺼진 뒤에 한다. 이어진 지시(두 단계), 거꾸로 누르기, 두 램프 조건이 들어온다 |
| 7 | 7 | 5 | 3 | compound, compound, chain, reverse, ifand, ifor, swif, cmp, countsw, countpress, go | – | 3 | – | 3 | – | 2 | ✓ | ✓ | 0.85 | 전문가: 어려운 지시만 나온다. 두 가지 지시 · 세 단계 이어진 지시 · 미끼 램프 둘. 읽는 동안 조작판이 덮개로 가려진다. 제한 시간 Lv7 85% · Lv8 75%, Lv8 은 이어진 지시가 더 자주 나온다 |
| 8 | 7 | 5 | 3 | compound, compound, chain, chain, reverse, ifand, ifor, swif, cmp, countsw, countpress, go | – | 3 | – | 3 | – | 2 | ✓ | ✓ | 0.75 |  |

## 상수 (모든 레벨 공통)

| 이름 | 값 | 설명 |
|---|---|---|
| `STEP_MS` | `450` | 이어진 지시: 맞게 조작한 표시를 보여 주는 시간. 그 뒤 표시를 지우고 다음 단계를 띄운다 |

레벨 표의 `–`는 해당 레벨에서 값을 지정하지 않았다는 뜻입니다 (변수 설명의 기본값을 쓰거나 기능이 꺼짐). `a~b`는 그 범위에서 무작위로 정한다는 뜻입니다.
