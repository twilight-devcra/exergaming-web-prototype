# 세션 로그 형식

한 판(속도 측정 ~ 결과)의 기록 형식입니다. 만드는 코드는 `js/session-log.js`, 기록하는 곳은 `js/main.js`(판 흐름·입력 장치)와 `js/games/*.js`(문제·답)입니다.
형식을 바꾸면 이 문서와 `SessionLog.VERSION` 을 함께 고칩니다. 지금 버전은 **1** 입니다.

## 파일 얻기

| 모드 | 방법 | 파일 |
|---|---|---|
| 테스트 화면 | 결과 화면의 **세션 로그 저장** | `exergame-session-<YYYYMMDD-HHMMSS>.json` — 세션 하나, JSON 객체 하나 |
| 시연 모드 (`?demo`) | 판이 끝날 때마다 태블릿(IndexedDB `exergame-sessions`)에 자동 저장 → 운영 메뉴 **세션 로그 → 전체 내보내기** | `exergame-sessions-station<N>-<YYYY-MM-DD>.jsonl` — 한 줄에 세션 하나 (JSON Lines) |

시연 모드는 결과 없이 끝난 판(중단, 측정 중 자리 비움)도 저장합니다. 결과 화면 없이 끝난 테스트 화면의 판은 내려받을 수 없습니다.
크기는 페달로 5분 한 판에 약 0.6 MB 이고 대부분 `capd` 입니다.

## 시각

모든 기록에 두 가지 시각이 붙습니다.

- **`t`** — 기록 시작(속도 측정 화면이 열린 순간)부터의 실제 시간, ms (소수 첫째 자리). 입력 장치 기록(`keys` · `capd` · `workout`)과 맞춰 볼 때 씁니다.
- **`clock`** — 게임 시계, ms. 일시정지(페달 끊김, 운영 메뉴, 테스트 화면의 Esc) 동안 멈춥니다. 라운드 시작 시 0 입니다.

문제의 걸린 시간 `ms` 는 게임 시계 기준이라 일시정지한 시간이 빠집니다. 일시정지 동안은 `samples` 도 쌓이지 않습니다.

## 최상위 구조

```json
{ "meta": {...}, "events": [...], "keys": [...], "capd": [...], "workout": [...], "samples": [...] }
```

`keys` · `capd` · `workout` · `samples` 는 용량을 줄이려고 객체가 아니라 배열의 배열입니다. 열 순서는 `meta.formats` 에도 적혀 있습니다.

## `meta`

| 필드 | 내용 |
|---|---|
| `version` | 형식 버전 (지금 1) |
| `id` | 기록 시작 시각 (epoch ms, 문자열). IndexedDB 의 키 |
| `mode` | `test` \| `demo` |
| `station`, `participant` | 시연 모드의 스테이션 번호(문자열)와 참가 번호(`"3-017"`). 결과 화면이 열릴 때 붙으므로 중단된 판은 `participant` 가 없다. 테스트 화면은 없음 |
| `startedAt`, `endedAt` | ISO 시각 |
| `durationMs` | 기록 길이 (실제 시간) |
| `ended` | 끝난 방식. `complete`(시간이 다 됨) · `operator`(운영 메뉴에서 끝냄) · `idle`(자리 비움으로 끝남) · `abandoned`(결과 없이 버림: 중단, 측정 중 자리 비움, 테스트 화면에서 메뉴로) |
| `theme` | 화면 스타일 id |
| `input` | 판을 시작할 때의 입력 장치. `pedal` \| `keyboard` |
| `firmware` | 페달 펌웨어 (`VER`), 모르면 null |
| `rpmSource` | 속도 측정 방식 (`zc` · `comb` · `teo` · `pedal`) |
| `userAgent`, `screen` | 브라우저, 화면 크기 `[w, h]` |
| `config` | 그 판의 설정 전체 (`js/config.js`). `tolerance`(허용 구역 비율), `durationSec`, `questionTime` 등 |
| `formats` | 아래 배열들의 열 이름 |
| `summary` | 끝날 때의 요약 (아래) |

`summary`:

| 필드 | 내용 |
|---|---|
| `score`, `exScore`, `cogScore` | 최종 점수 = 운동 점수 + 인지 게임 점수 |
| `baseline` | 측정한 기준 RPM (실패하면 `config.fallbackRpm`) |
| `bestStreak` | 최고 연속 정답 |
| `elapsedSec` | 플레이한 시간 (게임 시계) |
| `stats` | 게임별 `{ plays, cleared, correct, total, points, level, runs, ms }`. `level` 은 도달한 최고 난이도, `runs` 는 판마다 `[레벨, 맞힌 수, 문제 수]`, `ms` 는 문제를 푼 시간 합 |
| `exercise` | `{ kcal, distM, revs, avgRpm, activeSec }` RPM 으로 어림한 운동량 (`js/exercise.js`). `kcal` 은 MET 표·체중 65 kg 기준, `distM` 은 한 바퀴 6 m |
| `abilities` | 시연 모드 결과만. 능력 축별 별 수 1~5 (0.5 단위), 데이터가 없는 축은 null (`js/abilities.js`) |
| `abilitiesRaw` | 시연 모드 결과만. 별로 바꾸기 전 '해낸 레벨' (판마다 `레벨 − 1 + 정확도`, 게임 가중치 × 레벨로 가중 평균), 데이터가 없는 축은 null |

## `events`

모든 이벤트는 `{ "t", "clock", "type", ... }` 이고 시간순입니다.

### 판 흐름

| `type` | 추가 필드 | 언제 |
|---|---|---|
| `calib_start` | | 속도 측정 화면이 열림 (기록 시작) |
| `start` | `via`: `tap` \| `pedal` | 시연 모드만. 대기 화면에서 무엇으로 시작했나 (`calib_start` 바로 뒤) |
| `calib_pedaling` | | 측정 중 처음 밟음 (측정 시간이 여기서부터 흐른다) |
| `calib_end` | `baseline`, `measured`, `samples`, `fallback` | 측정 끝. `measured` 가 `config.minRpm` 보다 낮으면 `fallback: true` 이고 `baseline` 은 대체값. 이어서 3초 카운트다운 |
| `play_start` | | 카운트다운 끝 (GO) |
| `game_start` | `game`, `level`, `mult`, `diff` | 인지 게임 하나 시작 (소개 화면이 뜬 순간). `diff` 는 그때의 난이도 계기판 값 (`config.difficulty: 'adaptive'` 일 때 `level` = 그 정수 부분) |
| `difficulty` | `ok`, `diff` | 답 하나에 따라 난이도 계기판이 움직임 (`adaptive` 일 때만) |
| `game_end` | `game`, `cleared`, `correct`, `total` | 게임 하나 끝 |
| `game_abort` | `game`, `cleared`, `correct`, `total` | 라운드가 끝나며 진행 중이던 게임이 중단됨. 이 게임의 마지막 `question` 에는 `answer` 가 없을 수 있다 |
| `points` | `game`, `pts` | 인지 게임 점수 지급 |
| `shift_start` | `from`, `to` | 속도 전환 구간 시작. 기울기 -1(내리막) · 0(평지) · 1(오르막). 목표 RPM = `baseline × (1 + 기울기 × config.rpmChangeAmount)` |
| `shift_end` | `slope` | 속도 전환 구간 끝 |
| `pause`, `resume` | | 게임 시계가 멈춤 / 다시 흐름. 이유는 바로 앞의 `link` · `operator` 로 알 수 있다. 둘 다 없으면 시연 모드의 PIN 입력 중이거나 테스트 화면의 Esc |
| `link` | `state`, `detail` | 페달 연결 상태 변화 (`ready` · `connecting` · `reconnecting` · `disconnected` · `idle`) |
| `operator` | `open` | 시연 모드 운영 메뉴가 라운드 중에 열림/닫힘 |
| `idle_prompt`, `idle_resumed` | | 시연 모드 '아직 하고 계신가요?' 안내가 뜸 / 다시 움직여서 사라짐 |
| `session_end` | `ended` | 기록 끝 (`meta.ended` 와 같음) |

### 문제

문제 하나는 `question` → (`timer_start`) → `input`* → (`timeout`) → `answer` 순서입니다.

| `type` | 공통 필드 | 언제 |
|---|---|---|
| `question` | `game`, `level`, `q` + 게임별 내용 | 문제가 **입력을 받기 시작한** 순간. 외우기·길 보여 주기 같은 보여 주는 단계는 끝난 뒤다 |
| `timer_start` | `game`, `load`, `limitMs` | 제한 시간 시작. `limitMs = (base + per × load) × 1000` (`config.questionTime`). 제한 시간이 꺼져 있으면 없다 |
| `input` | `game`, `q`, `ms` + 게임별 내용 | 답 도중의 입력 (길 따라 그리기의 맞은 칸, 사칙연산의 숫자 넣기/빼기) |
| `timeout` | | 제한 시간이 다 됨. 바로 뒤에 `timedOut: true` 인 `answer` 가 온다 |
| `answer` | `game`, `q`, `ms`, `correct`, `timedOut` + 게임별 내용 | 답이 정해짐. `ms` = `question` 부터 걸린 시간 (게임 시계) |

`q` 는 세션 안의 문제 번호(1부터)로 `question` · `input` · `answer` 를 잇습니다.
시간 초과는 오답으로 칩니다 (`correct: false`, `timedOut: true`).

### 게임별 내용

**`path` 길 따라 그리기** — 한 게임이 문제 하나

| 이벤트 | 필드 |
|---|---|
| `question` | `grid`: `[행, 열]` · `path`: `[[행, 열], ...]` 첫 칸은 처음부터 켜져 있는 출발 칸이고 눌러야 하는 것은 그 다음부터 · `free`: 아무 데서나 시작·끝나는 단계인가 |
| `input` | `cell`: `[행, 열]` · `ok`: true · `step`: 경로에서 몇 번째 칸인가. 맞은 칸만 남는다 (틀린 칸은 곧바로 `answer`) |
| `answer` | `reached`: 맞게 누른 칸 수 · `of`: 눌러야 했던 칸 수 · `wrongCell`: 틀리게 누른 칸, 시간 초과면 null |

**`symbol` 심볼 위치 외우기** — 게임 하나에 문제 3개

| 이벤트 | 필드 |
|---|---|
| `question` | `target`: 위에 나온 심볼 · `slot`: 그 심볼이 있던 칸 · `n`: 몇 번째 질문 · `board`: 외울 때 보여 준 `[[칸, 심볼], ...]` |
| `answer` | `picked`: 고른 칸, 시간 초과면 null |

칸 번호는 2×4 판의 0~7, 왼쪽 위부터 가로로 (0~3 윗줄). 심볼 id: `circle` `square` `triangle` `star` `plus` `diamond` `moon` `heart`.

**`arith` 사칙연산 역산** — 게임 하나에 문제 3개

| 이벤트 | 필드 |
|---|---|
| `question` | `ops`: 빈칸 사이 연산자 `["+", "-"]` · `cands`: 보기 숫자 (화면 순서) · `ans`: 등호 오른쪽 값 · `sol`: 풀이 하나 · `solutions`: 답이 되는 조합 수 |
| `input` | `put`: 넣은 숫자, `slot`: 들어간 칸 · 또는 `remove`: 뺀 숫자, `slot`: 뺀 칸 |
| `answer` | `fill`: 칸마다 넣은 숫자, 시간 초과로 빈 칸은 null |

식은 왼쪽부터 계산합니다. `sol` 이 아니어도 값이 `ans` 이면 정답입니다.

**`count` 우세한 색 찾기** — 게임 하나에 문제 3개

| 이벤트 | 필드 |
|---|---|
| `question` | `grid`: `[행, 열]` · `colors`: 색 id, **개수가 많은 순** (0번이 정답) · `counts`: 색마다 칸 수 (`colors` 와 같은 순서) · `cells`: 칸마다 색 번호(`colors` 의 인덱스), 꺼진 칸은 -1. 왼쪽 위부터 가로로 |
| `answer` | `picked`: 고른 색 id, 시간 초과면 null · `count`: 고른 색의 칸 수 |

색 id: `red` `blue` `green` `yellow` `purple`.

**`fit` 빈자리 채우기** — 게임 하나에 문제 3개

| 이벤트 | 필드 |
|---|---|
| `question` | `gap`: 빈자리 모양 · `shown`: 보기 조각들 (화면 순서) `{ piece, rot, answer }` |
| `answer` | `picked`: 고른 보기의 `shown` 인덱스, 시간 초과면 null |

모양 문자열은 육각형 변 6개를 `/` 로 이은 것이고, 변 0 은 오른쪽 위에서 시계 방향입니다. 변마다 거기서 끝나는 선의 색 번호를 작은 것부터 붙여 씁니다 (0 빨강 · 1 노랑 · 2 파랑, 선이 없으면 빈 문자열). 예: `"0/12//2/0/1"`.
`piece` 는 돌리기 전 모양이고, 화면에는 시계 방향으로 `rot × 60°` 돌려서 보여 줍니다. `answer: true` 인 조각이 정답입니다.

**`seek` 숨은 순서 찾기** — 게임 하나에 문제 3개

| 이벤트 | 필드 |
|---|---|
| `question` | `radius`: 판 반지름 · `len`: 찾을 순서의 길이 · `cells`: 칸마다 축 좌표 `[q, r]` · `syms`: 칸마다 그림 번호 · `seq`: 찾을 그림 순서 · `answer`: 정답 줄에 있는 칸 인덱스들 |
| `answer` | `cell`: 누른 칸 인덱스, 시간 초과면 null. 정답 줄의 칸이면 어느 것이든 정답 |

그림 번호는 그 문제 안에서만 뜻이 있습니다 (문제마다 그림 모양을 섞어서 배정한다). 칸 중심 좌표는 뾰족한 쪽이 위인 육각형 기준 `x = √3 × (q + r/2)`, `y = 1.5 × r`.

## `keys`

`[t, code]` — 모든 keydown 의 `KeyboardEvent.code` (`KeyA`, `KeyD`, `Escape` ...). 눌린 채 반복되는 입력은 뺍니다.
키보드로 페달링하면 `KeyA` / `KeyD` 가 번갈아 한 번이 반 바퀴입니다 (같은 키를 연달아 누른 것은 게임이 무시하지만 기록에는 남는다).

## `capd`

`[t, seq, lz₀, ly₀, gx₀, gz₀, lz₁, ly₁, gx₁, gz₁, ..., lz₄, ly₄, gx₄, gz₄]` — 페달의 원시 파형 프레임(`CAPD`)을 받은 그대로.

- 한 프레임에 100 Hz 샘플 5개, 즉 초당 20 프레임. `t` 는 프레임을 받은 시각이고 샘플 5개는 그 앞 50 ms 에 걸쳐 있습니다.
- `seq` 는 프레임 번호. 건너뛰면 유실, 되감기면 페달이 CAP 을 다시 시작한 것입니다.
- `lz` 는 0.1 mg 단위. 게임의 RPM 추정(`js/cadence-est.js`, `LzCadence.capd`)은 이 프레임을 그대로 넣어 다시 계산할 수 있습니다.
- 페달을 쓰고 속도 측정 방식이 파형(`zc` · `comb` · `teo`)일 때만 있습니다.

## `workout`

`[t, rpm, watt, revCount]` — 페달이 약 1초마다 보내는 `WORKOUT` 프레임. `rpm` 은 페달 자체의 avg_rpm, `watt` 는 페달이 계산한 파워(느리게 밟으면 0 이 되는 펌웨어 버그가 있다), `revCount` 는 누적 회전 수.

## `samples`

`[t, clock, rpm, target, deviation, inZone, score]` — 게임 상태, 초당 10번 (일시정지 동안은 없음).

| 열 | 내용 |
|---|---|
| `rpm` | 게임이 실제로 쓴 RPM (입력 장치 값을 다듬은 것) |
| `target` | 그 순간의 목표 RPM. 측정 중에는 null |
| `deviation` | 화면의 공 위치에 해당하는 편차 (목표 대비 비율, 부호 있음: +면 빠름). 공은 RPM 을 조금 늦게 따라간다. 측정 중 null |
| `inZone` | 공이 허용 구역(±`config.tolerance`) 안인가 1 / 0. 운동 점수와 같은 기준. 측정 중 null |
| `score` | 그 순간의 총점 |

## 분석 예

목표 속도 유지 비율 (전체와 게임별):

```python
import json
L = json.load(open('exergame-session-....json', encoding='utf-8'))
E, S = L['events'], L['samples']
start = next(e['clock'] for e in E if e['type'] == 'play_start')
play = [s for s in S if s[3] is not None and s[1] >= start]
print('in zone', sum(s[5] for s in play) / len(play))

# 게임별: game_start / shift_start 사이의 구간
marks = [(e['clock'], e.get('game', e['type'])) for e in E
         if e['type'] in ('game_start', 'shift_start', 'shift_end', 'session_end')]
for (c0, name), (c1, _) in zip(marks, marks[1:]):
    seg = [s for s in play if c0 <= s[1] < c1]
    if seg:
        print(name, sum(s[5] for s in seg) / len(seg))
```

문제별 정답과 걸린 시간:

```python
for e in E:
    if e['type'] == 'answer':
        # 이 문서 이전에 저장된 로그는 길 따라 그리기 정답에 timedOut 이 없다
        print(e['q'], e['game'], e['correct'], e.get('timedOut', False), e['ms'])
```

시연 모드 내보내기(`.jsonl`)는 한 줄씩 `json.loads` 하면 위와 같은 객체입니다.
