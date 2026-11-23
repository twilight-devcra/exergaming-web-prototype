# 금고 열기 (`safe`) — design card

> Stage 1 of the game-draft workflow ([README.md](README.md)). Mockup: [`tools/sketch/safe/`](../../../tools/sketch/safe/index.html) (`node server.js` → http://localhost:5173/tools/sketch/safe/).

**Status:** card · **mockup (round 2)** · sketch · approved · built
**Gap it fills:** 처리 속도 (SDMT/기호 바꾸기 — TARGETS.md notes no game targets speed itself) at Lv1–4. Lv5–8 add 계산 and partly 작업 기억 (holding a worked-out digit) and 추론 (multi-step chains at Lv8).
**Tags / clashes:** `Tag.NUMBER` now that high levels calculate, so it won't run back to back with arith/cover/box/coin. **Note:** 계산 is already the most-served area (4 games). This game's distinct value is the lookup speed at Lv1–4, so the formulas stay light.

## Review log
- **Round 1 (mockup):** deduction clues (빈칸 elimination, 열린 쪽지 worked examples) rejected as unlikely to work well. Switch to math and logic clues. Add layout C (like A, with a 1–9 keypad under the door). Replace the ✱ handle with a lock that unlocks on success.

## The rule in one sentence
"그림마다 정해진 숫자를 표에서 찾아, 금고 암호를 차례대로 누르세요." (Lv5+: "숫자 대신 식이 있으면 계산해서 그 그림의 숫자를 구하세요.")

## One code, step by step
1. A safe shows a row of shapes (the code), each with an empty digit window under it. A **key** (열쇠 표) pairs each shape with a digit. A **1–9 keypad** sits below. Instruction line: `act` "암호를 누르세요".
2. The current window is highlighted. The player taps the digit for that shape. The digit drops in and the highlight moves on.
3. A wrong digit shows the right digit in the window (green ring, the tapped digit struck through in red) and **play continues**. The keypad's right key is outlined. A timeout fills in the rest for ~1 s.
4. When the last window fills, the lock on the door turns into an open padlock and goes green (all right), or turns red (any wrong).

**One long code per game, not three short ones.** This uses the existing exception for one-long-answer games (like 길 따라 그리기): 60 % of points spread over the digits, 40 % for opening the safe, and it counts as one answer for the difficulty meter. It fits 10 s at Lv3, and a digit worked out from a formula pays off every time that shape repeats.

**Keypad is always 1–9.** Fixed positions can be learned. Because it includes digits that aren't in the key, nobody can skip a formula by picking "the leftover digit," so the round-1 decoy digits are gone.

## Clues at Lv5+: formulas in the key
A formula row takes the place of a digit in the key: **▲ = ★ + 2**. It always refers to shapes higher up the key, so it's computed top to bottom.

| | Kind | Example | Level |
|---|---|---|---|
| ★ | add or subtract a small number (1–3) | ♥ = ☾ + 2 | 5 |
| ★ | double | ▲ = ★ × 2 | 6 |
| ★ | two shapes added | ■ = ★ + ✚ | 8 |
| ★ | chain (a formula uses a formula row) | ▲ = ■ + 1 | 8 |
| | *logic option, not mocked:* comparison/parity ("▲ 는 ★ 보다 크고 짝수") | — | only works with a short candidate list, which a 1–9 pad doesn't give. More reading. Not recommended |

Every result is 1–9, and every shape keeps a distinct digit. The mockup's `board.js` checks both and warns on a mistake. Operands stay small: no ×3, no two-digit intermediate values.

## Levels
| Lv | Key | Code | Formula rows | Kind |
|---|---|---|---|---|
| 1 | 3 shapes | 3 digits | – | – |
| 2 | 4 | 4 | – | – |
| 3 | 4 | 5 | – | – (standard: shapes may repeat) |
| 4 | 5 | 5 | – | – |
| 5 | 5 | 5 | 1 | ± 1–2 |
| 6 | 5 | 5 | 1 | ± 1–3 or × 2 |
| 7 | 6 | 6 | 2 | each from a plain row |
| 8 | 6 | 6 | 2 | two-shape sum, then a chain |

Every formula shape appears in the code at least once (usually twice). The key and its digits are new each game. Key digits are never consecutive in key order, so position can't stand in for lookup.

## Mechanic options (structure)
| | Option | Tests | Risk |
|---|---|---|---|
| ★ | **Key + 1–9 keypad**, one long code | lookup speed; light calculation at high levels | two searches per digit (key, then pad). Fixed pad order makes the second one cheap after a few games |
| | Keypad with only the key's digits (round 1) | faster lookups | the leftover digit gives away every formula row |
| | Pick the right code out of 3 candidates | fewest taps | partial matching skips the lookups. At most a Lv1 easing |

## Constraint check
- [x] **Under 10 s at Lv3:** 5 digits × ~1.3 s ≈ 7 s.
- [~] **Lv7–8:** ~2–3 s per formula + 6 × 1.3 s ≈ 12–13 s, **over budget**. Option: Lv7–8 codes of 5 digits.
- [x] Taps only. Keypad buttons are 62 px in layout C (≥ 56 px).
- [x] Colour never the only cue (`SYMBOLS` differ in shape and colour). The intro diagrams draw shapes, never text glyphs like "▲" whose colour wouldn't match.
- [x] Reading: one instruction line. Formulas are shapes, digits and + − ×.
- [x] Exactly one answer: every digit is determined by the key.
- [x] Intro diagram `diagram(level)`: ① 표에서 숫자 찾기 / 식으로 숫자 구하기 (Lv5) / 구한 숫자로 다음 식 (Lv8) → ② 차례대로 누르기.

## Mockup verdict (stage 2, round 2)
- **Layout C (key | door, with the 1–9 keypad under the door) recommended.** It fits every level including Lv8 with room to spare. The key stays a vertical column, where formula rows read naturally left to right. Hands stay on one row under the door.
- A also fits at Lv8 now (3×3 keypad). B fits but has to split formulas into a side box next to the "?" cells, which adds a lookup.
- Lock plate: grey padlock → green open padlock on success, red on failure. It reads at a glance, and the door's green outline backs it up.
- Earlier finding still stands: intros overflow the 455 px card by a few lines, and the existing 심볼 위치 외우기 intro does the same at 1280×800. Check intros on the tablet in general.

## Risks to check in the clickable sketch
- **Lv4 → Lv5:** will an older player compute "☾ + 2" from the key while pedalling, or stall? Watch whether they find ☾'s digit first.
- **Lost place on repeated shapes** (■★■♥●): is the highlighted window enough?
- **Do players recompute** a formula shape every time it repeats, or remember it? This shows up as time per digit.
- **Full 1–9 pad:** does scanning 9 buttons slow Lv1–2 noticeably compared with round 1's 3–4 buttons?

## Open questions for review
1. Layout C (★), A, or B?
2. Formula kinds: are + − ×2 and two-shape sums the right "math & logic" level, or do you want a logic-style clue I should mock up?
3. Lv7–8 at ~12–13 s: accept, or cap the code at 5 digits?
4. One long code (★) vs three short ones · continue after a wrong digit (★) vs end · name 금고 열기 (★): still open from round 1.
