# 그림 조각 기억하기 (`art`) — design card

> Game-draft workflow ([README.md](README.md)). Mockup: [`tools/sketch/art/`](../../../tools/sketch/art/index.html), style comparison: [`styles.html`](../../../tools/sketch/art/styles.html) (`node server.js` → http://localhost:5173/tools/sketch/art/).

**Status:** card · **mockup** (round 1) · sketch · approved · built

## Review log
- **Card → mockup:** the A+C style was chosen. Lv1 is **1×2** (two tiles). Pictures don't have to be square: grids like 2×3 and 3×4 are fine.
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
| | **A+C · 섞음** (A's rings, checker, zigzag, dot row and lines on C's four paper panels; A's colours swapped where a panel would swallow them) | all 9 distinct, each piece carries 1–3 panel colours plus a motif; looks more like a picture than A | low: A's primitives + 4 panel polygons |

**Chosen: A's motifs on C's coloured ground panels (A+C).** A gives the most even spread of distinct tiles and its motifs can be named ("checker", "zigzag", "rings"), which helps older players encode them. C's panels make each tile's background a second cue, and the result looks more like a picture.

**Rules the generator must keep** (each one comes from something the preview showed):
1. **Every tile distinct.** No two tiles show the same set of motifs, and no tile is mostly empty ground. Check: give each tile a signature (which motifs cover more than ~8 % of it, plus its main ground colour), and reject the picture if two signatures match or a tile has fewer than 2 entries.
2. **Motifs differ in shape and fill**, not colour alone: solid, stripes, dots, checker, outline, line.
3. **Motifs cross tile edges** so it reads as one picture, but each motif's *identifying* part (a centre, a point, a pattern) lies inside one tile.
4. **Layer order:** ground planes (2–4) → hero shapes (1–2, spanning 2–4 tiles each) → one long line across many tiles → accents, placed one at a time into whichever tile is emptiest until rule 1 passes.
5. Nothing finer than ~6 px at tile scale. 6–8 colours on a cream ground.
6. **Nothing small lands on a tile edge** (from the mockup). A small motif or a panel seam that ends just past an edge leaves a few-pixel sliver in the next piece, which looks like a mistake. Keep small motifs inside one tile. Keep seams at least ~15 units from an edge, or slanted across the tile. Seams that line up with the tile edges would turn the picture back into a grid of coloured squares.
7. **Any aspect ratio.** The picture is cols × rows tiles: 1×2, 2×2, 2×3, 3×3, 3×4. Wide grids suit the tablet's wide, short board.

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
| 1 | **1×2**, study 5 s, 2 choices (the other tile is the only distractor) | — (teaches the rule: "left or right piece?") |
| 2 | 2×2, study 4.5 s, 2 choices | 4 tiles |
| 3 | **2×3**, study 4 s, 3 choices (any) | standard |
| 4 | 3×3, study 4 s, 3 choices (far) | 9 tiles |
| 5 | 3×3, study 3.5 s, 4 choices (near) | choices share motifs across the seam |
| 6 | 3×3, study 3.5 s, 4 choices, one **altered copy** of the target | details, not just "which part" (mockup: zigzag → straight bar) |
| 7 | **3×4**, study 4 s, 4 choices (near) | 12 tiles |
| 8 | 3×4, study 3.5 s, 4 choices (near + altered) | densest (mockup: red circle → red square) |

Three questions per game on one picture. **At Lv1 there are only 2 tiles**, so the third question asks a tile again: left, right, then left. Every tile is hidden again after each answer, so the repeat still has to come from memory.

## Board space
| Device | Board area | Layout |
|---|---|---|
| Tablet | 1136 × 337 | picture on the left, choices on the right. Tile = board height ÷ rows, capped at 150 px (Lv1 300×150 · Lv3 450×300 · Lv8 448×336). Fits at every level |
| Phone 390×844 | 330 × 494 | picture on top, one row of choices below (110 px for 2, 102 px for 3, 73 px for 4). Lv8 tiles 82 px |
| Small phone 360×640 | 300 × 339 | same stack: Lv3 choices 92 px, Lv8 choices **66 px**, tiles 75 px. All ≥ 56 |

Sizes come from measuring the board (`fit` in `board.js`, a ResizeObserver like the real games use). During the study phase the choice row shows as dashed empty slots, so the picture never moves when the choices appear.

## Mockup verdict (round 1)
- **Everything fits** on the tablet, the phone and the small phone, with no overflow. The smallest tap target is 66 px (Lv8, 360×640).
- **Tablet, A vs B.** A: large 132 px choices in a row. B: choices the same size as the tiles, in a 2×2 block. Both fit. B answers the scale risk (a piece looks exactly like its tile), but its choices shrink to 112 px at Lv6–8 and sit in two rows. **Recommended: B.** Matching size makes "this piece goes in that slot" obvious, and 112 px is still double the minimum. A is the fallback if the 2×2 block reads as a second board.
- **Phone:** one stack (picture, then a row of choices). A 2×2 block of choices would leave less height for the picture at 3×4, so a single row it is.
- **Feedback:** a right answer flips the yellow tile back with a green ring. A wrong one marks the tapped piece ✕ (red) and the right piece ✓ (green), and flips the yellow tile back with a yellow ring, so the player sees the piece in place.
- **Pictures:** the five hand-drawn A+C pictures keep every tile distinct, Lv8's 12 included. Moving the panel seams off the tile edges (rule 6) was the only fix needed.

## Constraint check
- [ ] **Under 10 s at Lv3: over.** Study 4 s + flip 0.8 s + 3 × ~2.5 s ≈ **12 s**, about the same as 없던 그림 찾기. Ways to cut it: 3.5 s study, or a faster flip. I'd accept ~11 s rather than drop a question.
- [x] Taps (measured): tablet 112–150 px, phone 73–110 px, small phone 66–92 px.
- [x] Not colour alone: the yellow tile also shows **?**, motifs differ in shape and fill, and feedback carries ✓/✕ marks.
- [x] Reading: one short instruction line per phase.
- [x] One right answer: the choices are different tiles, and rule 1 makes them visibly different. An altered copy changes a whole motif, not a shade.
- [x] Intro diagram: ① 그림 보기 → ② 칸이 뒤집히면 노란 칸의 조각 고르기.

## Risks to check in the mockup / sketch
- Is 4 s enough to take in an abstract picture, or do older players fixate on one motif and fail every other tile?
- **Scale (layout A):** a tile is ~92–150 px on the board but its choice is 132 px. Do players accept that the piece is the same part at a different size? Layout B avoids the question.
- **Lv1 1×2:** is "left or right piece" too trivial, or a good first step? Watch whether the repeated third question feels odd.
- Does the flip read as "hidden", not "shuffled"?
- "뭘 그린 거예요?": does abstract art feel pleasant or confusing? Nameable motifs may matter more than style.
- Edge motifs (a half-disc on the bottom edge) give away "bottom row". That's fair spatial reasoning, but check that it doesn't make Lv5+ trivial.

## Open questions for review
1. **Tablet layout:** A (large choices in a row) or B (choices at tile size, 2×2)? (Recommended: B.)
2. Lv1 third question repeats a tile (left, right, left)? (Recommended: yes. The alternative, a new picture per question, adds two study phases.)
3. Same picture for all three questions, with the answered tile hidden again? (Recommended: yes.)
4. Faint tile grid lines during study, so players know where the cuts are? (Recommended: no, keep it one picture. The flip shows the grid.)
5. Altered-copy distractors from Lv6, at most one per question? (Recommended: yes.)
6. Option D (delayed recall) as a later follow-up? (Recommended: park it.)
7. Title: 그림 조각 기억하기, or something shorter like 그림 조각 찾기?
