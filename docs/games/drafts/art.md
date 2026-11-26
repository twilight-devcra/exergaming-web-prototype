# 그림 조각 기억하기 (`art`) — design card

> Game-draft workflow ([README.md](README.md)). **Clickable sketch: [`play.html`](../../../tools/sketch/art/play.html)** · mockup: [`tools/sketch/art/`](../../../tools/sketch/art/index.html) · generated pictures: [`gallery.html`](../../../tools/sketch/art/gallery.html) · style comparison: [`styles.html`](../../../tools/sketch/art/styles.html) (`node server.js` → http://localhost:5173/tools/sketch/art/).

**Status:** card · mockup · **sketch** (round 1) · approved · built
**Gap it fills:** honestly, mostly **즉시 기억 (시각·위치)**, which is already over-represented (4 games). What's new is **연합 기억** (△, priority medium): "what was where" is an object-location pairing. Option D below would reach **지연 회상** (☐, priority high), but that needs session-level support.
**Tags / clashes:** `Tag.MEMORY`, shared with path, symbol, cover, novel, box and recall. That makes 7 memory games out of 20, so rerun the order check (200 rounds, no adjacent similar games) when it's built.

## Review log
- **Mockup → sketch:** `play.html` runs the real game shape on freshly generated pictures. The playthrough exposed an altered-copy loophole, now fixed (see Distractor kinds).
- **Mockup round 2 verdict:** the generated pictures (gallery) are accepted for now, 3×4 busyness included. Next: the clickable sketch.
- **Mockup round 1 → 2:** tablet layout **B** (choices at tile size, 2×2). **2 questions per game** (`ROUNDS = 2`). Asked to see many generated pictures to check they don't look alike, so a picture-generator prototype (`generate.js`) and a gallery were built ahead of the sketch.
- **Card → mockup:** the A+C style was chosen. Lv1 is **1×2** (two tiles). Pictures don't have to be square: grids like 2×3 and 3×4 are fine.

## The rule in one sentence
"그림을 잘 봐 두었다가, 칸이 뒤집히면 노란 칸에 있던 조각을 고르세요."

## One question, step by step
1. An abstract picture is shown. `look` "그림을 잘 보세요". 4 s at Lv3.
2. The tiles flip over in a diagonal wave from the top-left (~0.8 s). Only the backs are left.
3. One tile turns yellow with a **?**. The picture pieces appear in the dashed slots beside the board. `act` "노란 칸에 있던 조각을 고르세요".
4. Right: the yellow tile flips back to show the piece in place (green ring). Wrong or timeout: the tapped piece gets a red ✕, the right piece a green ✓, and the yellow tile flips back to show the piece. Both last ~1 s.

**Two questions on the same picture**, each asking a different tile, with one study phase per game. That uses the existing per-game `ROUNDS`: each answer is worth base ÷ 2, so a game scores the same total as a 3-question game. After the first answer every tile is hidden again, so the second question can't use the first as a neighbour clue. At Lv1 (1×2) the two questions ask the two tiles, so nothing repeats.

## The picture
It isn't a grid of random shapes but **one composition**: coloured paper panels, one to three large shapes, an optional line across, and small accents. The tile grid is laid over it afterwards.

| | Style ([styles.html](../../../tools/sketch/art/styles.html)) | 3×3 tiles |
|---|---|---|
| | A · 구성 (rings, thin crossing lines, checker, zigzag: Kandinsky-like) | all 9 distinct |
| | B · 포스터 (flat colour planes, half-discs, striped band: Bauhaus-like) | two tiles read alike |
| | C · 종이 오리기 (paper panels, leaf, star, wave: Matisse-like) | several tiles are mostly panel seams |
| | D · 선과 별 (black curve, blobs, star, crescent: Miró-like) | lots of empty ground |
| ★ | **A+C** (A's motifs on C's paper panels) | all distinct; each piece carries panel colours plus a motif |

### Generator (prototype: `tools/sketch/art/generate.js`)
`makePicture(cols, rows, seed)` builds a picture in these steps:
1. **Palette:** one of 4 (primary, warm, cool, pop), 5 panel colours each.
2. **Panels:** repeatedly cut the largest panel with a slanted line, 2 to 5 panels depending on tile count. Both ends of a cut stay at least 22 units from a tile edge. Cuts are drawn as white paper seams.
3. **Large shapes:** 1 (up to 4 tiles), 2 (6 tiles) or 3 (9+ tiles), each a different kind: concentric rings, a half-disc on the picture's edge, a quarter-circle in a corner, a big triangle. If a shape's box would only graze a tile (overlap under 18 units), its position is re-rolled, up to 12 times.
4. **Line (optional):** thin straight line, thick arc, S-curve, or none (20 %).
5. **Accents:** one per tile, except that a tile mostly covered by a large shape usually gets none. They are drawn from a shuffled bag of 12 kinds (triangle, zigzag, checker, stripes, dot row, ring, dot, square, ✕, star, wave, half-moon), so no kind repeats within a picture. Each sits at least 8 units inside its tile. Its colour is picked to contrast with the panel beneath.
6. **Check:** each tile gets a signature (large shapes covering it, its accent's kind, its main panel colour). If two signatures match, a tile has nothing on it, or a large shape grazes a tile, the picture is rebuilt from the next seed.
7. **Altered copy:** every accent has a sibling of a different shape (zigzag → bar, dot → square, ring → dot, triangle → square …) for the Lv6+ distractor. Only tiles with an accent can be asked with an altered copy.

**Tested:** 500 seeds per grid size (1×2 to 3×4). No failures, at most 3 rebuilds, under 0.2 ms per picture. Palettes and large-shape kinds come out evenly. The gallery shows 8 per grid size, whole or pulled apart into pieces.

**From the gallery (3 batches, ~120 pictures):**
- Pictures differ clearly from one another: palette, panel cuts, large shapes and line all change.
- The first version gave every tile a small icon and drew the same black arc in most pictures. That read as a sticker sheet. Fixed with larger and fewer accents, more and larger shapes, and four line options.
- At 3×4 the pictures are still busy (12 tiles need 12 distinct pieces). That's acceptable for Lv7–8, but it's the level where pictures look least like art.
- The 12 accent kinds recur across pictures. Within one game that doesn't matter (one picture per game, no repeats inside it). For variety across games, the real game could avoid reusing the previous game's palette and large-shape kinds.

**Rules the generator keeps:**
1. Every tile distinct (signature check above), and never by colour alone: accent kinds don't repeat within a picture.
2. Motifs differ in shape and fill: solid, stripes, dots, checker, outline, line.
3. Large shapes cross tile edges so it reads as one picture. Small accents stay inside one tile.
4. **Nothing grazes a tile edge**: no seam within 22 units of one, no accent within 8, no large shape overlapping a tile by under 18. Otherwise a piece shows a sliver that looks like a mistake. Seams lined up with the tile edges would turn the picture back into a grid of coloured squares.
5. Any aspect ratio: 1×2, 2×2, 2×3, 3×3, 3×4.

## Mechanic options
| | Option | Tests | Risk |
|---|---|---|---|
| ★ | **A. All tiles flip, pick the piece** (choices are other tiles of the same picture) | visual memory of what was where | distractors must be distinct (generator rule 1) |
| | B. Only some tiles flip, the rest stay visible | mostly continuity (visual construction) | can be solved without memory by matching lines across edges |
| | C. Reverse: show one piece, tap where it was on the hidden grid | location memory | 1-in-6 guessing at Lv3. Possible later variant |
| | D. Delayed: show the picture at session start, ask at the end | **지연 회상** (☐, high) | needs a hook outside the minigame round; parked |

**Distractor kinds:** *far* tiles (not adjacent) → *near* tiles (adjacent, sharing shapes across the seam) → at Lv6+ **one altered copy**: a piece with one small shape changed (zigzag → bar, dot → square …). **Loophole 1 (found in the sketch):** if the altered copy is always made from the right piece, two look-alike pieces always mean "the answer is one of these two", so a player who remembers nothing gets 50/50 instead of 25 %. So the altered copy is made from the right piece only about 40 % of the time, otherwise from one of the wrong tiles. With 4 choices, a look-alike pair then holds the answer less often than chance (40 % vs 50 %). **Loophole 2:** with two or more altered copies among the choices, the right one is simply "the one the others share" (the 금고 열기 leftover-digit problem). So allow at most one altered copy, and fill the other choices with real tiles. No rotated or mirrored distractors (the same policy as novel.js).

## Levels
| Lv | Board | What makes it harder |
|---|---|---|
| 1 | **1×2**, study 5 s, 2 choices (the other tile is the only distractor) | — (teaches the rule: "left or right piece?") |
| 2 | 2×2, study 4.5 s, 2 choices | 4 tiles |
| 3 | **2×3**, study 4 s, 3 choices (any) | standard |
| 4 | 3×3, study 4 s, 3 choices (far) | 9 tiles |
| 5 | 3×3, study 3.5 s, 4 choices (near) | choices share shapes across the seam |
| 6 | 3×3, study 3.5 s, 4 choices, one **altered copy** of the target | details, not just "which part" |
| 7 | **3×4**, study 4 s, 4 choices (near) | 12 tiles |
| 8 | 3×4, study 3.5 s, 4 choices (near + altered) | densest |

## Board space
| Device | Board area | Layout |
|---|---|---|
| Tablet (layout B) | 1136 × 337 | picture on the left, choices at tile size on the right (one row for 2, a 2×2 block for 3–4). Tile = board height ÷ rows, capped at 150 px. Choices 150 px at Lv1–3, 112 px at Lv6–8 |
| Phone 390×844 | 330 × 494 | picture on top, one row of choices below (110 px for 2, 102 px for 3, 73 px for 4). Lv8 tiles 82 px |
| Small phone 360×640 | 300 × 339 | same stack: Lv3 choices 92 px, Lv8 choices **66 px**, tiles 75 px. All ≥ 56 |

Sizes come from measuring the board (`fit` in `board.js`, a ResizeObserver like the real games use). During the study phase the choice slots show as dashed outlines, so the picture never moves when the choices appear.

## Mockup verdict
- **Round 2:** layout B chosen; layout A is kept only as two reference shots. 2 progress dots. All 31 screens fit with no overflow.
- **Round 1:** everything fits on the tablet, the phone and the small phone; the smallest tap target is 66 px (Lv8, 360×640). On the phone, a single row of choices leaves more height for the picture than a 2×2 block. Feedback: a right answer flips the yellow tile back with a green ring; a wrong one marks the tapped piece ✕ (red) and the right piece ✓ (green), and flips the yellow tile back.

## Constraint check
- [x] **Under 10 s at Lv3:** study 4 s + flip 0.8 s + 2 × ~2.5 s ≈ **9.8 s** (with 3 questions it was ~12 s).
- [x] Taps (measured): tablet 112–150 px, phone 73–110 px, small phone 66–92 px.
- [x] Not colour alone: the yellow tile also shows **?**, accent kinds never repeat within a picture, and feedback carries ✓/✕ marks.
- [x] Reading: one short instruction line per phase.
- [x] One right answer: the choices are different tiles with different signatures. An altered copy changes a shape, not a shade.
- [x] Intro diagram: ① 그림을 잘 봐 두기 → ② 노란 칸에 있던 조각 고르기.

## Clickable sketch (round 1)
- `play.html` runs `ArtGame` (`art-game.js`, ready to move to `js/games/art.js`) on the stub host. Each game makes a fresh picture with `generate.js` and avoids the previous game's palette. Which tile is asked and which wrong answers appear follow the level's `pick` rule (far / near / any) plus the altered copy at Lv6 and Lv8. That is a small rule set rather than hand-written puzzles, since the pictures themselves are generated. Level bar at the bottom; `?level=N`, `?intro=0`, `?seed=N` (fix the picture).
- Flow: picture for the level's show time → tiles flip in a 3D diagonal wave (90 ms per diagonal, 320 ms each; ~0.8 s at 3×4) → question 1 → 0.9 s (right) or 1.4 s (wrong, the right piece shown) → question 2 on the same picture, every tile hidden again → done.
- Timer: `questionTime { base: 3, per: 0.6 }` × number of choices → Lv1 8.4 s and Lv2 6.9 s (with EASY_TIME), Lv3 4.8 s, Lv5–8 5.4 s.
- Checked automatically: every level on the tablet and the phone (right answer, wrong answer, timeout, progress dots, score); 2,000 sampled questions per level (choice count, no duplicates, the answer present, no repeated tile, altered-copy source split).

## Risks to check in the sketch (playtest checklist)
- **Lv1 without help:** after the intro, does the player get "pick the piece that was under the yellow tile" on the first question? Watch for taps on the yellow tile itself.
- Is 4 s enough to take in an abstract picture, or do older players fixate on one shape and fail the other tile?
- **Lv1 1×2:** is "left or right piece" too trivial, or a good first step?
- Does the flip read as "hidden", not "shuffled"?
- "뭘 그린 거예요?": does abstract art feel pleasant or confusing? Nameable shapes may matter more than style.
- **3×4 busyness:** can a player hold 12 pieces, or does Lv7–8 turn into guessing?
- Edge shapes (a half-disc on the bottom edge) give away "bottom row". That's fair spatial reasoning, but check that it doesn't make Lv5+ trivial.
- **Second question:** without seeing the picture again, can players still answer, or does Q2 feel like guessing?
- **Altered copy (Lv6, Lv8):** do players notice the changed shape, or does it feel unfair?
- **Timer:** is 4.8 s at Lv3 enough to compare 3 pieces, and does the bar add pressure the memory task doesn't need?

## Open questions for review
1. Playing the sketch: does each level feel right, especially the steps Lv1 → Lv3 (1×2 to 2×3) and Lv6 → Lv7 (3×3 to 3×4)?
2. Show times (Lv3 4 s, Lv8 3.5 s) and question timer (Lv3 4.8 s): too short, too long?
3. Faint tile grid lines during study, so players know where the cuts are? (Recommended: no, keep it one picture. The flip shows the grid.)
4. Option D (delayed recall) as a later follow-up? (Recommended: park it.)
5. Title: 그림 조각 기억하기, or something shorter like 그림 조각 찾기?
