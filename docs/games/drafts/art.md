# 그림 조각 기억하기 (`art`) — design card

> Stage 1 of the game-draft workflow ([README.md](README.md)). Picture preview (before the mockup): [`tools/sketch/art/`](../../../tools/sketch/art/index.html) (`node server.js` → http://localhost:5173/tools/sketch/art/).

**Status:** **card** (with a picture-style preview) · mockup · sketch · approved · built
**Gap it fills:** honestly, mostly **즉시 기억 (시각·위치)**, which is already over-represented (4 games). What's new is **연합 기억** (△, priority medium): "what was where" is an object-location pairing. Option D below would reach **지연 회상** (☐, priority high), but that needs session-level support.
**Tags / clashes:** `Tag.MEMORY`, shared with path, symbol, cover, novel, box and recall. That makes 7 memory games out of 20, so rerun the order check (200 rounds, no adjacent similar games) when it's built.

## The rule in one sentence
"그림을 잘 봐 두었다가, 칸이 뒤집히면 노란 칸에 있던 조각을 고르세요."

## One question, step by step
1. An abstract picture fills a square. `look` "그림을 잘 보세요". 4 s at Lv3.
2. The tiles flip over in a diagonal wave from the top-left (~0.8 s). Only the backs are left.
3. One tile turns yellow with a **?**. Four picture pieces appear beside the board. `act` "노란 칸에 있던 조각을 고르세요".
4. Right: the yellow tile flips back to show the piece in place. Wrong or timeout: the right piece gets a green ring and ✓, the tapped one red and ✗, and the yellow tile flips back to show the piece. Both last ~1 s.

**Three questions on the same picture**, each asking a different tile, with one study phase per game. A new picture per question would make a game ~22 s. After each answer the tile flips back to hidden, so the next question can't use it as a neighbour clue.

## The picture (the part to settle first)
It isn't a grid of random shapes but **one composition**: big planes, a hero shape or two, a line that runs across, and small accents. The tile grid is laid over it afterwards. Four styles are drawn by hand in the preview:

| | Style | 3×3 tiles in the preview | Generator effort |
|---|---|---|---|
| ★ | **A · 구성** (concentric rings, crossing thin lines, checker plate, zigzag, dot row: Kandinsky-like) | all 9 distinct; each tile catches a different motif | low: geometric primitives |
| | **B · 포스터** (flat colour planes, half-discs, striped band: Bauhaus-like) | bold and readable; tiles 1 and 4 both read "red disc + stripes" | low |
| | **C · 종이 오리기** (paper panels, leaf, starburst, wave: Matisse cut-out-like) | the most attractive; panel colour helps place a tile, but tiles 1/4/5 are mostly panel seams | medium: organic paths |
| | **D · 선과 별** (black calligraphic curve, outlined blobs, star, crescent, eye: Miró-like) | lots of empty cream ground; tiles 3 and 6 are sparse even after a fix | medium |

**Recommendation: A's motifs on C's coloured ground panels.** A gives the most even spread of distinct tiles and its motifs can be named ("checker", "zigzag", "rings"), which helps older players encode them. C's panels make each tile's background a second cue, and the result looks more like a picture.

**Rules the generator must keep** (each one comes from something the preview showed):
1. **Every tile distinct.** No two tiles show the same set of motifs, and no tile is mostly empty ground. Check: give each tile a signature (which motifs cover more than ~8 % of it, plus its main ground colour), and reject the picture if two signatures match or a tile has fewer than 2 entries.
2. **Motifs differ in shape and fill**, not colour alone: solid, stripes, dots, checker, outline, line.
3. **Motifs cross tile edges** so it reads as one picture, but each motif's *identifying* part (a centre, a point, a pattern) lies inside one tile.
4. **Layer order:** ground planes (2–4) → hero shapes (1–2, spanning 2–4 tiles each) → one long line across many tiles → accents, placed one at a time into whichever tile is emptiest until rule 1 passes.
5. Nothing finer than ~6 px at tile scale. 6–8 colours on a cream ground.

## Mechanic options
| | Option | Tests | Risk |
|---|---|---|---|
| ★ | **A. All tiles flip, pick the piece** (4 choices, taken from other tiles of the same picture) | visual memory of what was where | distractors from the same picture must be distinct (rule 1) |
| | B. Only some tiles flip, the rest stay visible | mostly continuity (visual construction) | can be solved without memory by matching lines across edges. Possibly Lv1 only |
| | C. Reverse: show one piece, tap where it was on the hidden grid | location memory. The tiles are the targets (≥ 75 px), no distractors to design | 1-in-9 guessing at Lv3, and harder at Lv1. Good as a later-level variant |
| | D. Delayed: show the picture at session start, ask at the end | **지연 회상** (☐, high) | needs a hook outside the minigame round; park it until A is proven |

**Distractor kinds:** *far* tiles (not adjacent) → *near* tiles (adjacent, sharing motifs across the seam) → at Lv6+ **one altered copy** of the target (one motif recoloured or removed). **Loophole:** with two or more altered copies of the target among the choices, the right one is simply "the one the others share" (the 금고 열기 leftover-digit problem). So allow at most one altered copy, and fill the other choices with real tiles. No rotated or mirrored distractors (the same policy as novel.js).

## Levels (only the ones that matter)
| Lv | Board | What makes it harder |
|---|---|---|
| 1 | 2×2, study 5 s, 2 choices (far) | — |
| 3 | 3×3, study 4 s, 3 choices (any) | standard |
| 5 | 3×3, study 3.5 s, 4 choices (near) | choices share motifs |
| 6 | 3×3, 4 choices, one altered copy of the target | details, not just "which part" |
| 8 | 4×4, study 3.5 s, 4 choices (near + altered) | 16 tiles, so the picture needs more motifs |

The in-between levels move along grid size, study time, choice count and distractor kind.

## Board space
| Device | Board area | Layout |
|---|---|---|
| Tablet | 1136 × 337 (≈ 277 high under the instruction line) | picture up to 300 px square on the left, 4 choices in a row on the right (132 px each). Fits in the preview |
| Phone 390×844 | 330 × 494 | picture on top (~260), choices as a 2×2 block (~100 px) or a row of 4 (~72 px) below |
| Small phone | 300 × 339 | picture ~180, row of 4 at ~66 px. Still ≥ 56 |

Phone layouts aren't drawn yet (Stage 2).

## Constraint check
- [ ] **Under 10 s at Lv3: over.** Study 4 s + flip 0.8 s + 3 × ~2.5 s ≈ **12 s**, about the same as 없던 그림 찾기. Ways to cut it: 3.5 s study, or a faster flip. I'd accept ~11 s rather than drop a question.
- [x] Taps: 132 px choices on the tablet. Phone sizes estimated above, all ≥ 56.
- [x] Not colour alone: the yellow tile also shows **?**, motifs differ in shape and fill, and feedback adds ✓/✗ (the preview shows only coloured rings so far; add the marks in the mockup).
- [x] Reading: one short instruction line per phase.
- [x] One right answer: the choices are different tiles, and rule 1 makes them visibly different. An altered copy changes a whole motif, not a shade.
- [x] Intro diagram: ① 그림 보기 → ② 칸이 뒤집히면 노란 칸의 조각 고르기.

## Risks to check in the mockup / sketch
- Is 4 s enough to take in an abstract picture, or do older players fixate on one motif and fail every other tile?
- **Scale:** a tile is 100 px on the board but its choice is 132 px. Do players accept that the piece is the same part, only bigger?
- Does the flip read as "hidden", not "shuffled"?
- "뭘 그린 거예요?": does abstract art feel pleasant or confusing? Nameable motifs may matter more than style.
- Edge motifs (a half-disc on the bottom edge) give away "bottom row". That's fair spatial reasoning, but check that it doesn't make Lv5+ trivial.

## Open questions for review
1. **Picture style:** A, B, C, D or the A-on-C hybrid? (Recommended: the hybrid.)
2. Same picture for all three questions, with the answered tile hidden again? (Recommended: yes.)
3. Faint tile grid lines during study, so players know where the cuts are? (Recommended: no, keep it one picture. The flip shows the grid.)
4. Altered-copy distractors from Lv6, at most one per question? (Recommended: yes.)
5. Option D (delayed recall) as a later follow-up? (Recommended: park it.)
6. Title: 그림 조각 기억하기, or something shorter like 그림 조각 찾기?
