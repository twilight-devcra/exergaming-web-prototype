# New minigame briefs

Four minigames to add next: **없던 그림 찾기** (built; planned as 바뀐 것 찾기), **장보기**, **공 따라가기** (built), **집 찾아가기**.
Each brief says what the player does, why the game is worth adding, how difficulty scales, and anything that needs care when building it.
The shared rules for every new game come first. Read `DEMO_BRIEF.md` for the project itself.

Written 2026-10-22. The level tables and timings are first guesses to tune in playtests, like the existing games' were.

## Rules every new game follows

These match the eight existing games (`js/games/*.js`), so a new game slots into rounds, presets, logs and the results chart without special cases.

- **Length.** One game, all of its questions included, takes under 10 s at its standard level. A 5-minute round runs about 20 games (see Round pacing in `DEMO_BRIEF.md`).
- **Questions.** Three questions per game (`ROUNDS = 3`), each worth `base × mult / ROUNDS` points. A game built around one long answer (like 길 따라 그리기's path) can instead score 60% across its picks and 40% for completing it. It then counts as one answer for the difficulty meter.
- **Levels.** Eight levels. Lv1–2 are the easy levels for older players and Lv3 is the standard first level (see Easier levels for older players in `DEMO_BRIEF.md`). Easy levels may set their own longer show times, as 심볼 위치 외우기 and 가린 숫자 더하기 do. The host already stretches question timers on Lv1–2 (`EASY_TIME`).
- **Input.** Taps only, with targets at least 56 px on a 1280×800 tablet. The player is pedalling, so nothing needs precise or rapid tapping, dragging, typing or reading more than a few words.
- **Colour.** Never tell things apart by colour alone. Every colour gets a matching shape, as in the existing glyph sets (`SYMBOLS`, `COUNT_COLORS`, `COVER_MARKS`, `LADDER_PEGS`).
- **Timing.** Use `host.after` (the game clock) for anything timed, and `host.now()` for positions in a moving animation, so operator pauses, pedal disconnects and intros stop the game too. Do not use `setTimeout` or `performance.now()` for game logic.
- **Self-explaining.** The intro shows a two-step diagram (`static diagram()`, drawn with `js/diagram.js`) and a two-line `hint`. The first question should teach the rule without more text.
- **Feedback.** On a wrong answer or timeout, show the right answer for about a second, then move on.
- **Instruction line.** Create one `stage-msg` element and place it **directly above the board**, inside the game's wrapper after the progress dots, so it sits where the player is looking. Change it only through `U.say(el, text, kind)`. Pick the kind that matches what to do: `look` (watch or remember), `act` (tap something), `good`, `bad`, or `''` for no icon. Keep the text short, like "새로 나타난 그림을 누르세요". The question timer attaches itself just under this line. Don't let the wrapper take all spare height (`flex: 1`); the instruction and board should centre together.

### Checklist for adding a game

1. Write `js/games/<id>.js` with `id`, `title`, `hint`, `tags`, `levels`, `maxLevel`, `diagram()`, a constructor taking `host`, `start()`, `result()` and `abort()`. Layout follows the stage size (`ResizeObserver`).
2. Add the `<script>` tag in `index.html` (after `js/diagram.js`) and the class to `GAME_TYPES` in `js/main.js`.
3. Add a `questionTime` entry in `js/config.js` and say in its comment what the "load" is.
4. Add `ABILITY_WEIGHTS` in `js/abilities.js`, and `ABILITY_PACE` if the game feeds the speed axis.
5. Log through the host:
   - `host.question(...)` with everything needed to replay the question
   - `host.input(...)` for picks along the way
   - `host.answer({ correct, timedOut, ... })` for the final answer
6. Run the puzzle generator a few hundred times in Node for every level. Check that each puzzle has exactly one answer and never hangs (see how the easy levels were tested).
7. Update the list of minigames in `DEMO_BRIEF.md`.

### Effect on game order

Games with overlapping `tags` never run back to back (`App.planPass`). Two of the four new games are memory games, so the memory tag grows to 5 of 12 games: path, symbol, cover, novel, shop. Twelve games still leaves enough non-memory games to separate them, but run the order check from the intro work again after adding them (200 rounds, no adjacent similar games).

---

## 1. 없던 그림 찾기 (built 2026-10-22, `js/games/novel.js`)

**id:** `novel` · **tags:** `['memory']` · **abilities:** memory 0.6, attention 0.4 · **question time:** `{ base: 5, per: 0.5 }`, where the load is the number of pictures on the board

Planned as 바뀐 것 찾기, renamed and narrowed during building. The player always looks for a picture that **was not there before**.

### The game
1. A few pictures sit on a grid ("잘 보세요").
2. A striped curtain drops over the board (0.2 s), stays down for 0.12 s, then lifts (0.22 s). The board changes behind it. The timer and taps start once it is fully up. Pictures appear without a pop, so a board redrawn after an answer doesn't look new.
3. It comes back with one new picture. The new picture either appears in an empty cell or replaces a picture that was there. The player taps it.
4. Feedback: ✓ on the new picture, or ✕ on the tapped cell and a blue outline on the right one.

The three questions are a chain. After each answer, the same board is shown again for 60% of the first look time (at least 1.2 s), then the curtain drops again and the next new picture appears. Showing a fresh board each time would take about 16 s per game.

### What changes, and what doesn't
- **Changes that can be the answer:** a picture added to an empty cell, or a picture replacing one that was there.
- **Left out:** disappearing pictures (there is nothing to tap) and rotations (other games treat a rotated shape as the same shape). For the same reason, no shape or mark in the set is a rotation of another, so there is no square/diamond pair and only a horizontal bar.
- **Pictures stay in place.** Changing places during the blink was tried and removed as too hard. The code is still there (`shuffle` in the level table) but no level uses it.
- **No repeats:** a picture that has been on the board is never used as the "new" one again in that game.

### Pictures
A flat, single-colour shape gives only about a dozen distinct pictures, which is too few for high levels and leaves nothing subtle to change. So a picture is an **outer shape** plus a **white mark** inside it, which makes 55 combinations. Neither part relies on colour:
- **Shapes (11):** circle, square, triangle, star, plus, heart, drop, hexagon, pentagon, dome, cloud.
- **Marks (5):** none, dot, bar, ring, small triangle.

Lv1–6 use plain shapes only. At Lv8 the new picture can be **a shape already on the board with a different mark**. That is the subtle case, and when it replaces, it replaces the same-shaped picture.

### Levels
The first version was too hard at every level. This table is the eased version: fewer pictures, longer looks, no place-changing, marks from Lv7, and the "same shape, new mark" case at Lv8 only.

| Lv | Pictures | Grid | First look | Marks | Replace rather than add | Same shape, new mark |
|---|---|---|---|---|---|---|
| 1 | 2 | 2×3 | 3.5 s | none | never | — |
| 2 | 3 | 2×3 | 3.2 s | none | never | — |
| 3 | 3 | 3×3 | 2.8 s | none | 30% | — |
| 4 | 4 | 3×3 | 2.6 s | none | 40% | — |
| 5 | 4 | 3×3 | 2.4 s | none | 50% | — |
| 6 | 5 | 3×4 | 2.2 s | none | 50% | — |
| 7 | 5 | 3×4 | 2.0 s | 3 kinds | 60% | — |
| 8 | 6 | 3×4 | 1.8 s | 3 kinds | 60% | 40% |

The look between questions is 60% of the first look, at least 1.2 s. The question timer is `{ base: 5, per: 0.5 }`.

### Checks done
- **Generator:** 2,000 games per level in Node. Every question had exactly one picture not on the previous board, no repeats, no duplicate pictures, no shape repeated on plain levels, and no new picture in the same cell twice in a row.
- **Browser:** played through at Lv1, Lv5 and Lv8, including in the neon theme.
- **Game order:** with 9 games, 200 simulated rounds gave no similar games back to back.

### Diagram
① 그림들을 잘 보고: three shapes on a 2×3 grid. ② 새로 나타난 그림 누르기: a heart added, with the tap ring on it.

---

## 2. 장보기 (shopping list)

**Proposed id:** `shop` · **tags:** `['memory']` · **abilities:** memory 0.6, attention 0.3, logic 0.1

### The game
A shopping memo shows a few items. Then a market shelf appears and the player picks those items into a basket.

1. A memo slides in with `k` item pictures, each with its name underneath ("사과", "두부"…), for `show × k` ms.
2. The memo folds away. A shelf with `m` items appears, and below it a basket with `k` empty slots.
3. The player taps items. Each tap fills the next basket slot: green if it was on the list, red with a shake if not. Once all `k` slots are full, the game is over.
4. Feedback: list items they missed glow on the shelf.

**One list per game.** Each pick scores like a step of 길 따라 그리기, with a completion bonus for a fully right basket. The whole list counts as one answer for the difficulty meter.

### Why
Recalling a list is the core of everyday-memory tests (CERAD word list), and grocery shopping is a task older players do every week. It suits the Korean dementia-centre style of everyday-life training. The basket slots tell the player how many to pick, so no counting rule needs explaining.

### Levels
| Lv | On the list | On the shelf | Show per item | Distractors |
|---|---|---|---|---|
| 1 | 2 | 4 | 2.0 s | different kinds of things |
| 2 | 2 | 6 | 2.0 s | different kinds of things |
| 3 | 3 | 6 | 1.5 s | different kinds of things |
| 4 | 3 | 8 | 1.5 s | some look-alikes (사과 vs 토마토) |
| 5 | 4 | 8 | 1.3 s | some look-alikes |
| 6 | 4 | 10 | 1.3 s | mostly look-alikes |
| 7 | 5 | 10 | 1.1 s | mostly look-alikes |
| 8 | 5 | 12 | 1.1 s | mostly look-alikes, items shuffled on the shelf between levels |

Question time load: items on the list. Suggested `{ base: 4, per: 1.5 }`, about 8.5 s for 3 items.

### Build notes
- **Item pictures are the main cost.** About 20 grocery items, each recognisable by shape: 사과, 배, 바나나, 포도, 수박, 토마토, 당근, 감자, 양파, 파, 배추, 고추, 버섯, 두부, 달걀, 우유, 빵, 생선, 라면, 김. They should be drawn as SVG in the house style, so they look the same on every tablet and follow the screen style. Emoji look different from device to device.
- Look-alike pairs to use as distractors: 사과/토마토, 배/양파, 감자/달걀, 우유/두부 packs, 파/고추.
- Names under the pictures help older players remember (picture plus word). Keep them on both the memo and the shelf.
- Log the list, the shelf, and each pick in order.

### Diagram
① 살 것을 외우고: a memo with three items. ② 진열대에서 골라 담기: a shelf with the tap ring on one listed item and a basket with one filled slot.

---

## 3. 공 따라가기 (built 2026-10-22, `js/games/track.js`)

**id:** `track` · **tags:** `['track']` · **abilities:** attention 0.6, spatial 0.3, speed 0.1 · **question time:** `{ base: 4, per: 1.5 }`, where the load is the number of balls to pick, timed from when the balls stop

### The game
1. Identical balls appear. `t` of them show a ★ inside a pulsing orange ring ("★ 공을 잘 보세요").
2. The stars vanish and the balls move ("눈으로 따라가세요"), bouncing off the walls.
3. The balls stop. The player gets exactly `t` taps. **Each tap is scored at once:** a correct ball shows its ★ with a green ring and earns `1/t` of the points; a wrong one fades with a red ring. A tap can't be undone. (A first version let players untap a pick, which was hard to notice, and only scored the board as a whole.) The message counts down how many are left.
4. After the last tap, or when time runs out, any missed ★ balls show with a dashed ring.

**Each ball is one answer** for the difficulty meter and the streak, like a question in the other games. A timeout counts as one wrong answer.

### Motion
- **Precomputed:** `TrackGame.simulate` computes every position in advance at 120 steps per second, from random start points and velocities (each heading at least 15° off the axes, speed ±15% around the level's value).
- **Game-clock drawing:** the drawing loop only picks the step for the current game time (`host.now()`, added to the host for this game). An operator pause, a pedal disconnect or an intro freezes the balls.
- **Collisions:** balls bounce off the walls. On Lv1–6 they also bounce off each other (equal-mass elastic collisions), so they never overlap. On Lv7–8 they pass over each other, which is the hard part.
- **Start and end:** balls start at least 2R + 8 apart and always end at least 2R + 4 apart. If a simulated board ends with balls too close, it is regenerated, so a ball is never hidden when it is time to tap.
- **Log:** the simulation uses a seeded random generator, so the logged `seed` (with the level) replays the whole board through `TrackGame.simulate(spec, seed)`. Start positions and velocities are logged too.

### Levels
Lv1–4 are gentler than first planned, after 없던 그림 찾기 turned out too hard. Lv5–8 were then made harder again because they played too easy: more balls, up to 4 targets, curving paths (`wander`) from Lv5 so a ball's heading no longer tells where it went, overlapping from Lv6, and faster Lv7–8.

| Lv | Balls | Targets (★) | Speed (arena widths per s) | Moving time | Balls overlap | Curving | Star shown |
|---|---|---|---|---|---|---|---|
| 1 | 4 | 1 | 0.14 | 2.0 s | no | no | 2.0 s |
| 2 | 5 | 1 | 0.16 | 2.5 s | no | no | 2.0 s |
| 3 | 5 | 2 | 0.19 | 2.5 s | no | no | 1.8 s |
| 4 | 6 | 2 | 0.21 | 3.0 s | no | no | 1.6 s |
| 5 | 7 | 3 | 0.26 | 3.0 s | no | up to 30°/s | 1.5 s |
| 6 | 8 | 3 | 0.31 | 3.5 s | yes | up to 50°/s | 1.5 s |
| 7 | 9 | 4 | 0.39 | 4.0 s | yes | up to 75°/s | 1.4 s |
| 8 | 10 | 4 | 0.44 | 4.0 s | yes | up to 100°/s | 1.3 s |

With curving, each ball picks a new turn rate about every 0.6 s.

The arena is 160 × 100 units and balls have a radius of 7, about 59 px across on a 1280×800 tablet. Taps count within 1.5 ball radii.

### Checks done
- **Generator:** 500 boards per level in Node. No overlaps at the start or end, nothing leaving the arena, and no overlap in flight on the bouncing levels. The slowest Lv8 board takes about 37 ms to generate, which happens while the intro is showing.
- **Browser:** played through at Lv1, Lv4 and Lv8 (neon theme), checking the scores.
- **Pause:** pausing mid-motion froze the balls, and resuming continued them.

### Diagram
① ★ 공을 잘 보고: four balls, one with a ★ and ring. ② 멈추면 그 공 누르기: the balls glide to new places (SMIL loop), then the tap ring appears on the former ★ ball.

---

## 4. 집 찾아가기 (route following on a map)

**Proposed id:** `map` · **tags:** `['trace']` · **abilities:** spatial 0.6, logic 0.2, memory 0.2

### The game
A small top-down town map shows a walker at a crossroads and a row of arrow cards. The player follows the arrows in their head and taps the house where the walk ends.

1. The map shows streets on a grid of blocks, a few houses at crossroads, and the walker (an arrowhead showing which way they face).
2. Above the map, arrow cards give the route, one card per block: ↑ go straight, ← turn left, → turn right.
3. The player taps the house the route ends at.
4. Feedback: the walker walks the route along the streets (about 0.3 s per block), and the right house glows.

Three routes per game at Lv1–4. Two at Lv5–8, where routes are longer (`ROUNDS` per level).

### Directions
- **Map directions (Lv1–3):** the walker always faces up and each arrow means that direction on the map. This is the gentle version.
- **Walker's directions (Lv4+):** ← and → mean the walker's own left and right, and the walker turns as they go. When the walker faces down the map, left and right flip on screen. That is the real skill, the same one needed for reading a map while walking.

### Why
Finding a route from directions is an everyday skill and a common orientation exercise (지남력) in Korean dementia-prevention programmes. BrainHQ includes navigation exercises too. It is spatial without memory load, since the cards stay visible. That sets it apart from the memory games and balances them in the schedule.

### Levels
| Lv | Blocks | Route length | Directions | Houses | Walker starts facing |
|---|---|---|---|---|---|
| 1 | 2×2 | 2 | map | 3 | up |
| 2 | 3×2 | 2 | map | 4 | up |
| 3 | 3×3 | 3 | map | 5 | up |
| 4 | 3×3 | 3 | walker's | 5 | up |
| 5 | 4×3 | 4 | walker's | 6 | up or sideways |
| 6 | 4×4 | 4 | walker's | 6 | any |
| 7 | 4×4 | 5 | walker's | 7 | any |
| 8 | 5×4 | 6 | walker's | 8 | any |

Question time load: route length. Suggested `{ base: 4, per: 1.5 }`.

### Build notes
- **Houses** sit at crossroads, at most one per crossroads. Each house has a distinct roof colour and a shape on its door (colour-blind support).
- **Routes:** never leave the map, never turn back onto the block just walked, and end at a house. At least one other house should be where a common mistake leads, such as mixing up left and right in walker mode.
- **Cards:** big (64 px or more), left to right in order, the next card highlighted during the feedback walk.
- **Explaining the turn:** in walker mode the first question should start facing up, so the rule is learned before the hard case appears. The arrowhead on the walker must be clearly readable.
- **Log** the map, the start position and heading, the cards, the right house, and the house tapped.

### Diagram
① 화살표대로 가면: a 2×2-block map with the walker and the cards ↑ →. ② 도착한 집 누르기: the route drawn on the streets and the tap ring on the house.

---

## Suggested build order

1. **없던 그림 찾기:** done.
2. **집 찾아가기:** new drawing (streets, houses, walker) but simple logic, and it fills the spatial gap.
3. **장보기:** mostly blocked on drawing about 20 grocery pictures.
4. **공 따라가기:** done (added `host.now()`).

## Open questions

- 장보기 pictures: draw them ourselves (consistent, themeable) or license an icon set in a matching style?
- Should 장보기 count as one answer for the difficulty meter (like 길 따라 그리기) or one answer per pick (like 공 따라가기)? One answer keeps the meter steady. One per pick reacts faster.
- 집 찾아가기 at high levels: hide the cards once the player starts, adding a memory load? That would change its tag to include `memory`, so it is left out for now.
