# 금고 열기 (`safe`) — design card

> Stage 1 of the game-draft workflow ([README.md](README.md)). Mockup: [`tools/sketch/safe/`](../../../tools/sketch/safe/index.html) (`node server.js` → http://localhost:5173/tools/sketch/safe/).

**Status:** card · **mockup (round 3)** · sketch · approved · built
**Gap it fills:** 처리 속도 (SDMT/기호 바꾸기 — TARGETS.md notes no game targets speed itself) at Lv1–4. Lv5–8 add 추론 · 규칙 찾기 (☐/△, priority high: comparisons, parity, two clues that pin down two shapes together) and 계산, and partly 작업 기억 (holding worked-out digits).
**Tags / clashes:** `Tag.NUMBER` (high levels calculate), so it won't run back to back with arith/cover/box/coin.

## Review log
- **Round 3:** layout C chosen for the tablet. High levels may be harder: mix in logic. Codes capped at 5 digits. Clue rows get no special background and no line break of their own. Phone keypad 2×5 (so the keypad becomes 1–9 plus 0). Round-1 structure questions (one long code, continue after a wrong digit, name) accepted for now.
- **Round 2b:** add a phone mockup. The workflow now always designs a separate phone layout.
- **Round 2:** deduction clues (빈칸 elimination, 열린 쪽지 worked examples) rejected. Switch to math and logic clues. Add layout C. Replace the ✱ handle with a lock that unlocks on success.

## The rule in one sentence
"그림마다 정해진 숫자를 표에서 찾아, 금고 암호를 차례대로 누르세요." (Lv5+: "숫자 대신 식이 있으면 계산해서 그 그림의 숫자를 구하세요." Lv6, Lv8: a hint for the new clue kind.)

## One code, step by step
1. A safe shows a row of shapes (the code), each with an empty digit window under it. A **key** (열쇠 표) pairs each shape with a digit, or gives clues for it. A **keypad 1–9, 0** sits under the door. Instruction line: `act` "암호를 누르세요".
2. The current window is highlighted. The player taps the digit for that shape. The digit drops in and the highlight moves on.
3. A wrong digit shows the right digit in the window (green ring, the tapped digit struck through in red) and **play continues**. The keypad's right key is outlined. A timeout fills in the rest for ~1 s.
4. When the last window fills, the lock on the door turns into an open padlock and goes green (all right), or turns red (any wrong).

**One long code per game, up to 5 digits.** This uses the existing exception for one-long-answer games (like 길 따라 그리기): 60 % of points spread over the digits, 40 % for opening the safe, and it counts as one answer for the difficulty meter. A digit worked out from clues pays off every time that shape repeats.

**Keypad 1–9 and 0.** Fixed positions can be learned. 0 is never a shape's digit; it's there so the phone keypad is a clean 2×5. Because the pad includes digits that aren't in the key, nobody can skip a clue by picking "the leftover digit."

## Clues at Lv5+
Clue rows sit in the key after the plain rows and **look exactly like them**: same row, same colours, no background, no line break of their own. A clue is a short statement of shapes, digits and signs.

| Kind | Example | Thinking | First at |
|---|---|---|---|
| formula: ± small number | ♥ = ☾ + 2 | look up, add | Lv5 |
| **between** (logic) | ★ < ▲ < ☾ (★ 3, ☾ 5) | only one number between → 4 | Lv6 |
| formula: two shapes added | ☾ = ◆ + ■ | two lookups, add | Lv7 |
| **between + parity** (logic) | ★ < ● < ◆, ● = 짝수 (5 < ● < 8) | 6 or 7 → the even one, 6 | Lv7 |
| **two shapes together** | ▲ + ■ = 9, ▲ = ■ × 2 | try pairs, or substitute → ■ 3, ▲ 6 | Lv8 |
| **bound + parity** (logic) | ✚ < ●, ● = 짝수 (✚ 7) | 8 or 9 → 8 | Lv8 |

**Every board has exactly one answer, without assuming the digits are all different.** The mockup's `board.js` tries every 0–9 value for each hidden shape and flags a board unless exactly one assignment satisfies all its clues. Tested: widening Lv6's clue to ★ < ▲ < ■ is flagged as "4 answers." The real generator should use the same check. It also checks that formulas compute and that digits stay distinct within 1–9.

## Levels
| Lv | Key | Code | Hidden shapes | Clues |
|---|---|---|---|---|
| 1 | 3 shapes | 3 digits | – | – |
| 2 | 4 | 4 | – | – |
| 3 | 4 | 5 | – | – (standard: shapes may repeat) |
| 4 | 5 | 5 | – | – |
| 5 | 5 | 5 | 1 | formula ± 1–3 |
| 6 | 5 | 5 | 1 | between (or a × 2 formula) |
| 7 | 6 | 5 | 2 | two-shape sum + between with parity |
| 8 | 6 | 5 | 3 | two shapes together + bound with parity |

Every hidden shape appears in the code at least once. The key and its digits are new each game. Key digits are never consecutive in key order, so position can't stand in for lookup.

## Constraint check
- [x] **Under 10 s at Lv3:** 5 digits × ~1.3 s ≈ 7 s.
- [~] **Lv7–8:** 5 digits ≈ 6.5 s plus solving the clues. Lv7 ≈ 4 s → ~11 s; **Lv8 ≈ 6–8 s → ~13–15 s**. Harder high levels were asked for, so I'd give the question timer a per-clue allowance (`questionTime: { base, per }` with load = digits + 3 × clues) instead of trimming the clues.
- [x] Taps ≥ 56 px on the tablet (60 px) and on a 390×844 phone (56–57 px at every level). Small phones: see below.
- [x] Colour never the only cue (`SYMBOLS` differ in shape and colour). Intro diagrams and hints never use text glyphs like "▲", whose colour wouldn't match the shape.
- [x] Reading: one instruction line. Clues are shapes, digits and signs; the only words are 짝수/홀수.
- [x] Exactly one answer: brute-force check above.
- [x] Intro diagram `diagram(level)`: ① 표에서 숫자 찾기 / 식으로 숫자 구하기 (Lv5) / 두 숫자 사이의 수 (Lv6) / 두 줄을 함께 (Lv8) → ② 차례대로 누르기.

## Mockup verdict (round 3)
- **Tablet, layout C:** fits every level. Lv8's key has 7 rows (3 plain + 4 clues) and gets slightly tighter rows; the board still has room.
- **Phone 390×844:** key rows flow inline, as many per line as fit; clue rows wrap like any other row. Door, then a 2×5 keypad. The 2×5 keypad is lower than 3×3, which leaves more height for the key.
- **Small phone 360×640:** fits without overflow, but keys are 49 px at Lv3 and 45 px at Lv8 (up from 43 and 39 px with the 3×3 keypad). Still under 56. Accepted for now (round-2 recommendation: phone play is secondary). Revisit if phone playtests show mis-taps.
- Intros overflow the 455 px tablet card by a few lines, the same as the existing 심볼 위치 외우기 intro at 1280×800. Check intros on the tablet in general.

## Risks to check in the clickable sketch
- **Lv5 → Lv6:** do older players read ★ < ▲ < ☾ as "between"? Watch for stalls on the first comparison.
- **짝수/홀수 words** in a row of symbols: noticed, or skipped?
- **Lv8 two-shape clues:** solvable while pedalling, or does it take too long? Time this. It sets the per-clue allowance.
- **Lost place on repeated shapes** (■★■♥●): is the highlighted window enough?
- **Full 1–9, 0 keypad:** does scanning 10 buttons slow Lv1–2 noticeably?

## Open questions for review
1. Are the logic kinds right (between, parity, two shapes together), and is Lv8 hard enough or too hard?
2. Lv7–8 time: per-clue allowance on the question timer (★), or cut a clue?
3. Ready for the stage-3 clickable sketch?
