# 미니게임 레벨별 화면 (Lv1 · Lv4 · Lv8)

게임마다 난이도가 어떻게 달라지는지 보여 주는 화면 모음 (운영 설명서 자료). 운영 버전(`app/`) 화면 그대로, 2560×1600.

- 다시 찍기: `node docs/build/level-shots.js` (모든 게임) · `node docs/build/level-shots.js box,track 8` (일부만). 문제는 무작위라 찍을 때마다 그림이 달라진다.
- 파일 이름: `<게임>-lv<레벨>-<차례>-<장면>.png`. 한 장에 담기지 않는 게임은 장면을 나눠 찍었다.
  레벨마다 달라지는 장면은 레벨마다, 진행 방식만 보여 주는 장면은 Lv4 에서 한 번만 찍었다.
- 움직이는 장면(공 따라가기·상자 속 과일 세기 등)은 게임 시계를 멈춰 찍었다. 차례대로 외우기의 `sequence` 는 화면에 하나씩 나오는 카드를 이어 붙인 것이다.
- 레벨별 값의 자세한 내용: [미니게임 난이도 문서](../../games/README.md)

## 길 따라 그리기 (`path`)

길이 한 칸씩 켜진 뒤 같은 순서로 누른다.

**Lv1 → Lv4 → Lv8**: 격자 3×3 · 4칸 · 꺾임 1 → 3×5 · 6~8칸 · 꺾임 2 → 5×7 · 14~15칸 · 꺾임 9, 아무 칸에서나 시작하고 길이 제 옆을 지나간다

| 장면 | Lv1 | Lv4 | Lv8 |
|---|---|---|---|
| 길이 다 켜진 순간 (보여 주기 끝) | <img src="path-lv1-1-show.png" width="260"> | <img src="path-lv4-1-show.png" width="260"> | <img src="path-lv8-1-show.png" width="260"> |
| 같은 순서로 누르는 중 (진행 방식, Lv4 만) | – | <img src="path-lv4-2-answer.png" width="260"> | – |

## 심볼 위치 외우기 (`symbol`)

심볼 자리를 외운 뒤, 위 칸에 뜬 심볼이 어디 있었는지 누른다.

**Lv1 → Lv4 → Lv8**: 심볼 2개 (4.5초) → 4개 → 8개 (판 8칸이 다 찬다)

| 장면 | Lv1 | Lv4 | Lv8 |
|---|---|---|---|
| 외울 판 | <img src="symbol-lv1-1-show.png" width="260"> | <img src="symbol-lv4-1-show.png" width="260"> | <img src="symbol-lv8-1-show.png" width="260"> |
| 묻는 화면 (레벨과 상관없이 같다, Lv4 만) | – | <img src="symbol-lv4-2-ask.png" width="260"> | – |

## 사칙연산 역산 (`arith`)

빈칸에 들어갈 숫자를 후보에서 골라 식을 완성한다.

**Lv1 → Lv4 → Lv8**: 덧셈만 · 한 칸은 채워 둠 · 후보 3 → 빈칸 2 · 후보 5 · 뺄셈 섞임 → 빈칸 3 · 후보 7 · 답이 둘일 수 있다

| 장면 | Lv1 | Lv4 | Lv8 |
|---|---|---|---|
| 문제 화면 | <img src="arith-lv1-1-question.png" width="260"> | <img src="arith-lv4-1-question.png" width="260"> | <img src="arith-lv8-1-question.png" width="260"> |

## 우세한 색 찾기 (`count`)

격자에서 가장 많은 색을 고른다.

**Lv1 → Lv4 → Lv8**: 3×3 · 두 색 · 같은 색끼리 붙어 있다 → 4×4 · 세 색 → 6×7 · 다섯 색 · 한 칸 차이 · 흩어져 있다

| 장면 | Lv1 | Lv4 | Lv8 |
|---|---|---|---|
| 문제 화면 | <img src="count-lv1-1-question.png" width="260"> | <img src="count-lv4-1-question.png" width="260"> | <img src="count-lv8-1-question.png" width="260"> |

## 빈자리 채우기 (`fit`)

둘레의 선이 모두 이어지는 조각을 고른다.

**Lv1 → Lv4 → Lv8**: 선 1 · 보기 2 · 조각을 돌리지 않음 → 선 2 · 보기 3 · 돌린 조각 → 선 3 · 보기 6 · 비슷한 오답

| 장면 | Lv1 | Lv4 | Lv8 |
|---|---|---|---|
| 문제 화면 | <img src="fit-lv1-1-question.png" width="260"> | <img src="fit-lv4-1-question.png" width="260"> | <img src="fit-lv8-1-question.png" width="260"> |

## 숨은 순서 찾기 (`seek`)

왼쪽 그림 순서가 일직선으로 놓인 줄을 찾는다.

**Lv1 → Lv4 → Lv8**: 7칸 판 · 두 개짜리 순서 → 19칸 · 세 개 · 미끼 1 → 61칸 · 다섯 개 · 그림 6종 · 미끼 4

| 장면 | Lv1 | Lv4 | Lv8 |
|---|---|---|---|
| 문제 화면 | <img src="seek-lv1-1-question.png" width="260"> | <img src="seek-lv4-1-question.png" width="260"> | <img src="seek-lv8-1-question.png" width="260"> |

## 가린 숫자 더하기 (`cover`)

숫자 몇 개가 표시 붙은 상자로 덮인 뒤, 두 숫자의 합을 고른다.

**Lv1 → Lv4 → Lv8**: 숫자 3 · 덮개 1 · 보기 3 → 숫자 5 · 덮개 2 · 둘 다 덮인 문제 35% → 숫자 7 · 덮개 5 · 70% · 보기 5

| 장면 | Lv1 | Lv4 | Lv8 |
|---|---|---|---|
| 상자가 열린 채 숫자를 보여 주는 화면 | <img src="cover-lv1-1-show.png" width="260"> | <img src="cover-lv4-1-show.png" width="260"> | <img src="cover-lv8-1-show.png" width="260"> |
| 상자가 닫히고 묻는 화면 | <img src="cover-lv1-2-ask.png" width="260"> | <img src="cover-lv4-2-ask.png" width="260"> | <img src="cover-lv8-2-ask.png" width="260"> |

## 배관 타기 (`pipe`)

관을 따라가 구멍에 들어갈 모양 조각을 고른다.

**Lv1 → Lv4 → Lv8**: 관 3 · 모양 1가지 → 관 4 · 모양 2가지 · 고리 → 관 6 · 구멍 4 · 모양 4가지 · 16번 넘게 엇갈린다

| 장면 | Lv1 | Lv4 | Lv8 |
|---|---|---|---|
| 문제 화면 | <img src="pipe-lv1-1-question.png" width="260"> | <img src="pipe-lv4-1-question.png" width="260"> | <img src="pipe-lv8-1-question.png" width="260"> |

## 없던 그림 찾기 (`novel`)

판을 외운 뒤 가림막이 걷히면 새로 나타난 그림을 누른다.

**Lv1 → Lv4 → Lv8**: 그림 2 · 2×3 · 3.5초 · 늘 빈 칸에 더해진다 → 4 · 3×3 · 2.6초 · 40% 는 있던 그림을 밀어낸다 → 6 · 3×4 · 1.8초 · 무늬 · 비슷한 그림

| 장면 | Lv1 | Lv4 | Lv8 |
|---|---|---|---|
| 처음 판 | <img src="novel-lv1-1-show.png" width="260"> | <img src="novel-lv4-1-show.png" width="260"> | <img src="novel-lv8-1-show.png" width="260"> |
| 가림막이 걷힌 뒤 (새 그림이 하나 있다) | <img src="novel-lv1-2-find.png" width="260"> | <img src="novel-lv4-2-find.png" width="260"> | <img src="novel-lv8-2-find.png" width="260"> |

## 공 따라가기 (`track`)

★ 이 뜬 공을 눈으로 따라가다가 공이 멈추면 누른다.

**Lv1 → Lv4 → Lv8**: 공 4 · ★ 1 · 느리게 2초 → 공 6 · ★ 2 · 3초 → 공 10 · ★ 4 · 빠르게 4초 · 공끼리 겹쳐 지나가고 휘어 간다

| 장면 | Lv1 | Lv4 | Lv8 |
|---|---|---|---|
| ★ 을 보여 주는 화면 | <img src="track-lv1-1-cue.png" width="260"> | <img src="track-lv4-1-cue.png" width="260"> | <img src="track-lv8-1-cue.png" width="260"> |
| 움직이는 중 (공끼리 겹쳐 지나간다, Lv8 만) | – | – | <img src="track-lv8-2-move.png" width="260"> |
| 멈춘 뒤 고르는 화면 (Lv4 만) | – | <img src="track-lv4-2-pick.png" width="260"> | – |

## 지시 따르기 (`follow`)

조작판 화면의 지시대로 버튼·스위치를 조작한다.

**Lv1 → Lv4 → Lv8**: 버튼 3 · 버튼 하나 누르기 → 버튼 5 · 스위치 4 · 함정 · 차례 · 두 번 조작 → 버튼 7 · 스위치 5 · 램프 3 · 조건 · 이어진 지시. 읽는 동안 조작판을 덮고, 지시를 지운 뒤에야 조작한다

| 장면 | Lv1 | Lv4 | Lv8 |
|---|---|---|---|
| 지시와 조작판 | <img src="follow-lv1-1-input.png" width="260"> | <img src="follow-lv4-1-input.png" width="260"> | – |
| 지시를 읽는 동안 (조작판이 덮여 있다) | – | – | <img src="follow-lv8-1-read.png" width="260"> |
| 지시와 조작판 | – | – | <img src="follow-lv8-2-input.png" width="260"> |

## 짝 없는 것 찾기 (`pair`)

빨랫줄의 양말 가운데 짝이 없는 하나를 누른다.

**Lv1 → Lv4 → Lv8**: 양말 5 · 종류마다 색이 다르다 → 9 · 비슷한 색 · 뒤집힌 양말 → 15 · 미묘한 차이

| 장면 | Lv1 | Lv4 | Lv8 |
|---|---|---|---|
| 문제 화면 | <img src="pair-lv1-1-question.png" width="260"> | <img src="pair-lv4-1-question.png" width="260"> | <img src="pair-lv8-1-question.png" width="260"> |

## 상자 속 과일 세기 (`box`)

과일이 상자에 들어가고 나오는 것을 본 뒤 상자 속 과일 수를 고른다.

**Lv1 → Lv4 → Lv8**: 한 가지 과일 · 빈 상자 · 넣기만 → 두 가지 · 처음에 2~3개 · 넣고 빼기 · 특정 과일을 묻는다 → 상자 둘 · 처음에 4~5개 · 보기 5

| 장면 | Lv1 | Lv4 | Lv8 |
|---|---|---|---|
| 과일이 한 줄로 오가는 중 | <img src="box-lv1-1-move.png" width="260"> | – | – |
| 처음 상자 속 (Lv1 은 빈 상자라 없음) | – | <img src="box-lv4-1-start.png" width="260"> | <img src="box-lv8-1-start.png" width="260"> |
| 묻는 화면 | <img src="box-lv1-2-ask.png" width="260"> | – | – |
| 과일이 한 줄로 오가는 중 | – | <img src="box-lv4-2-move.png" width="260"> | <img src="box-lv8-2-move.png" width="260"> |
| 묻는 화면 | – | <img src="box-lv4-3-ask.png" width="260"> | <img src="box-lv8-3-ask.png" width="260"> |

## 두 그림 비교하기 (`compare`)

두 그림이 같은지 다른지 고른다.

**Lv1 → Lv4 → Lv8**: 3×3 격자 · 선 4 · 선이 생기거나 없어진다 → 4×4 · 선 8 · 선이 옮겨진다 → 7×7 · 선 35 · 선 모양(속 빈 선)까지 바뀐다

| 장면 | Lv1 | Lv4 | Lv8 |
|---|---|---|---|
| 문제 화면 | <img src="compare-lv1-1-question.png" width="260"> | <img src="compare-lv4-1-question.png" width="260"> | <img src="compare-lv8-1-question.png" width="260"> |

## 동전 세기 (`coin`)

겹쳐 놓인 동전을 센다 (Lv4 부터는 값을 더한다).

**Lv1 → Lv4 → Lv8**: 구리 동전 4~6개 · 몇 개인지 → 2종 6~8개 · 값 표를 보고 더한다 → 5종 15~18개 · 3층까지 겹친다

| 장면 | Lv1 | Lv4 | Lv8 |
|---|---|---|---|
| 문제 화면 | <img src="coin-lv1-1-question.png" width="260"> | <img src="coin-lv4-1-question.png" width="260"> | <img src="coin-lv8-1-question.png" width="260"> |

## 차례대로 외우기 (`recall`)

그림이 하나씩 나왔다 사라진 뒤, 묻는 성질(모양이나 개수)을 나온 차례대로 누른다.

**Lv1 → Lv4 → Lv8**: 그림 2 · 모양이나 개수 하나만 바뀐다 → 3 · 둘 다 바뀌고 무엇을 물을지 나중에 알려 준다 → 6 · 모양 5가지 · 1.7초씩

| 장면 | Lv1 | Lv4 | Lv8 |
|---|---|---|---|
| 그림 하나가 뜬 전체 화면 (Lv4 만) | – | <img src="recall-lv4-0-screen.png" width="260"> | – |
| 나온 그림을 차례대로 이은 것 (화면에서는 한 번에 하나씩 나온다) | <img src="recall-lv1-1-sequence.png" width="260"> | <img src="recall-lv4-1-sequence.png" width="260"> | <img src="recall-lv8-1-sequence.png" width="260"> |
| 답하는 화면 | <img src="recall-lv1-2-answer.png" width="260"> | <img src="recall-lv4-2-answer.png" width="260"> | <img src="recall-lv8-2-answer.png" width="260"> |

## 조각 잇기 (`chain`)

왼쪽 벽부터 오른쪽 벽까지 맞는 조각을 차례로 잇는다.

**Lv1 → Lv4 → Lv8**: 조각 2 · 함정 없음 → 5 · 함정이 1~2수 뒤에 드러난다 → 7 · 모양 4가지 · 3~5수 뒤

| 장면 | Lv1 | Lv4 | Lv8 |
|---|---|---|---|
| 문제 화면 | <img src="chain-lv1-1-question.png" width="260"> | <img src="chain-lv4-1-question.png" width="260"> | <img src="chain-lv8-1-question.png" width="260"> |

## 같은 글자 넣기 (`blank`)

모든 빈칸에 들어맞는 글자 하나를 고른다.

**Lv1 → Lv4 → Lv8**: 흔한 두 글자 낱말 1개 · 보기 3 → 낱말 3 · 보기 4 · 함정 1 → 낱말 4 · 보기 5 · 덜 흔한 낱말 · 함정 2

| 장면 | Lv1 | Lv4 | Lv8 |
|---|---|---|---|
| 문제 화면 | <img src="blank-lv1-1-question.png" width="260"> | <img src="blank-lv4-1-question.png" width="260"> | <img src="blank-lv8-1-question.png" width="260"> |

## 금고 열기 (`safe`)

암호 표에서 그림의 숫자를 찾아 금고 암호를 누른다.

**Lv1 → Lv4 → Lv8**: 표 3줄 · 3자리 · 첫 자리 채워 둠 → 5줄 · 5자리 → 6줄 · 5자리 · 그림 3개는 단서(식)를 풀어 알아낸다

| 장면 | Lv1 | Lv4 | Lv8 |
|---|---|---|---|
| 문제 화면 | <img src="safe-lv1-1-question.png" width="260"> | <img src="safe-lv4-1-question.png" width="260"> | <img src="safe-lv8-1-question.png" width="260"> |

## 그림 조각 기억하기 (`art`)

추상화를 잠깐 본 뒤, 뒤집힌 칸 가운데 노란 칸에 있던 조각을 고른다.

**Lv1 → Lv4 → Lv8**: 1×2 차분한 그림 · 보기 2 → 2×3 보통 그림 · 보기 3 (먼 칸) → 3×4 · 보기 4 (이웃 칸 + 무늬 하나를 바꾼 조각)

| 장면 | Lv1 | Lv4 | Lv8 |
|---|---|---|---|
| 그림 보기 | <img src="art-lv1-1-show.png" width="260"> | <img src="art-lv4-1-show.png" width="260"> | <img src="art-lv8-1-show.png" width="260"> |
| 문제 화면 | <img src="art-lv1-2-ask.png" width="260"> | <img src="art-lv4-2-ask.png" width="260"> | <img src="art-lv8-2-ask.png" width="260"> |
