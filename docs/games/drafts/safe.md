# 금고 열기 (`safe`) — design card

> Stage 1 of the game-draft workflow ([README.md](README.md)). Mockup: [`tools/sketch/safe/`](../../../tools/sketch/safe/index.html) (`node server.js` → http://localhost:5173/tools/sketch/safe/).

**Status:** card · **mockup** · sketch · approved · built
**Gap it fills:** 처리 속도 (SDMT/기호 바꾸기 — TARGETS.md notes no game targets speed itself) at Lv1–4; 추론 · 규칙 찾기 (☐/△, priority high) at Lv5–8. Partly 작업 기억 (holding a worked-out digit).
**Tags / clashes:** recommend `Tag.SEARCH` (table lookup is visual search; keeps it apart from count/seek/pair/coin). Not `NUMBER`: there's no arithmetic.

## The rule in one sentence
"그림마다 정해진 숫자를 표에서 찾아, 금고 암호를 차례대로 누르세요." (Lv5+: "표에 없는 그림은 단서를 보고 알아내세요.")

## One code, step by step
1. A safe shows a row of shapes (the code), each with an empty digit window under it. A **key** (열쇠 표) pairs each shape with a digit. A **keypad** lists only the digits that appear in the key, in ascending order. Instruction line: `act` "암호를 누르세요".
2. The current window is highlighted. The player taps the digit for that shape. The digit drops in, ✓, and the highlight moves on.
3. A wrong digit shakes the window, shows the right digit in it (struck-through tap, blue correct digit), and **play continues** to the next window. A timeout fills the rest in for ~1 s.
4. When the last window fills, the safe opens (all right) or rattles shut (any wrong).

**One long code per game, not three short ones.** This uses the existing exception for one-long-answer games (like 길 따라 그리기): 60 % of points spread over the digits, 40 % for opening the safe, and it counts as one answer for the difficulty meter. It's the only way to fit 10 s, and it means a deduction made at Lv5+ pays off every time that shape repeats in the code.

## Mechanic options
| | Option | Tests | Risk |
|---|---|---|---|
| ★ | **Key + keypad** (above). Keypad shows only the key's digits | lookup speed; at high levels, deduction | two searches per digit (shape in key, digit on pad). Ascending pad order keeps the second one cheap |
| | **Full 0–9 phone keypad** | same, more "real lock" | 10 targets to scan while pedalling. Doesn't help the elimination levels: the pad no longer shows which digits are in play |
| | **Pick the right code** out of 3 candidate codes | faster, fewest taps | partial matching ("first digit matches, pick it") lets players skip most lookups. Better as a Lv1-only easing than as the game |
| | **Reverse direction** (code in digits, tap shapes) on alternating games | adds 인지적 유연성 (☐, high) | a second rule to teach. Park it as a later variant |

## Kinds of indirect clue (Lv5+)
Each kind leaves exactly one possible digit for the unknown shape, with no arithmetic involved.
- **빈칸 (elimination):** the key has a "▲ = ?" row. The keypad holds every digit in play, so ▲ is the one digit not used in the key.
- **열린 쪽지 (worked example):** a note shows an earlier code that opened, e.g. ★▲ → 5 2. ★ = 5 is in the key, so ▲ = 2.
- **이어진 쪽지 (chain, Lv8):** two notes, ●■ → 7 3 and ■▲ → 3 9, with ● in the key. ● gives ■, and ■ gives ▲.
- *Rejected:* arithmetic clues ("▲ = ★ + 1"). Calculation is already over-served (4 games) and the clue becomes a maths problem.

## Levels
| Lv | Key | Code | Unknowns | Clue | Decoy digits on pad |
|---|---|---|---|---|---|
| 1 | 3 shapes | 3 digits | – | – | – |
| 2 | 4 | 4 | – | – | – |
| 3 | 4 | 5 | – | – (standard: shapes may repeat) | – |
| 4 | 5 | 5 | – | – | – |
| 5 | 5 | 5 | 1 | 빈칸 | – |
| 6 | 5 | 5 | 1 | 열린 쪽지 | 1 |
| 7 | 6 | 6 | 2 | 열린 쪽지 → then 빈칸 | – |
| 8 | 6 | 6 | 2 | 이어진 쪽지 | 1 |

Every unknown shape appears in the code at least once (usually twice), so the clue can't be skipped. The key and its digits are new each game. Digits come from 1–9 and are never consecutive in key order, so position can't stand in for lookup.

**Decoys (found while mocking up):** if the pad shows only the key's digits, 빈칸 elimination solves *every* note puzzle and players can ignore the note. So note levels add one digit that belongs to no shape, enough to leave two candidates. Lv7 needs none: the note pins one unknown and elimination then gives the other, so both clue kinds get used in order.

## Mockup verdict (stage 2)
- **Layout B (stacked, SDMT-style key strip) recommended.** It fits every level with room to spare, including Lv8's two notes and 7-digit pad, and the key strip is the same shape as the clinical SDMT key. Layout A (side by side) fits only up to Lv6; at Lv8 it runs edge to edge.
- Wrong-digit feedback (struck tapped digit, correct digit in a green-ringed window, the pad's correct key outlined) reads clearly without extra text.
- The intro screen overflows the 455 px card by a few lines. The harness shows the *existing* 심볼 위치 외우기 intro clipping the same way at 1280×800, so check intros on the tablet in general.

## Constraint check
- [~] **Under 10 s at Lv3:** 5 digits × ~1.3 s ≈ 7 s. Lv7–8 ≈ 3–4 s of deduction + 6 × 1.3 s ≈ 11–12 s, **slightly over**. Accept it, or drop Lv7–8 to 5 digits.
- [x] Taps only. The keypad has 3–6 buttons of ≥ 72 px in a 1160 × 340 body.
- [x] Colour is never the only cue: shapes reuse `SYMBOLS` from 심볼 위치 외우기, which differ in both shape and colour.
- [x] Reading: one instruction line. Clue notes are shapes and digits only.
- [x] Exactly one answer by construction: unique digits per shape, and each clue kind leaves one candidate.
- [x] Intro diagram, `diagram(level)` like 동전 세기: ① 표에서 그림의 숫자 찾기 → ② 차례대로 누르기. Lv5+ swap ① for the clue kind.

## Risks to check in the mockup / sketch
- ~~**Layout:** does it fit 1160 × 340 with a clue note at Lv6–8?~~ Yes, in layout B (see the verdict above).
- **Lv4 → Lv5 cliff:** a player who has been matching mechanically meets "?" for the first time. Is "?" in the key, plus a level-specific hint, enough? This is the 사다리 타기 question and needs a real older player in the stage-3 sketch.
- **Lost place on repeated shapes** (★●★★▲): is the highlighted window enough?
- **Do players use the note at all,** or do they guess from the keypad? Watch for this in the sketch.

## Open questions for review
1. One long code per game (★ recommended) vs three short codes?
2. On a wrong digit: continue (★) vs end the code there?
3. Name: 금고 열기 (★) / 암호 풀기 / 자물쇠 열기?
4. Lv7–8 at ~12 s: accept, or cap the code at 5 digits?
5. Layout B (★) or A?
