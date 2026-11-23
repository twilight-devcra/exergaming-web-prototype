# <Title> (`<id>`) — design card

> Stage 1 of the game-draft workflow (see [README.md](README.md)). Fill this in before any mockup or code.
> Keep it to about one screen. Leave out anything a mockup or sketch would settle faster.

**Status:** card · mockup · sketch · approved · built   ← move the marker as it advances
**Gap it fills:** <subdomain from [TARGETS.md](../TARGETS.md), and its priority>
**Tags / clashes:** <Tag.… from `js/games/tags.js`, and which existing games share it>

## The rule in one sentence
<What the intro hint would say. If it takes two sentences, the rule is probably too complex for a player who is pedalling.>

## One question, step by step
1. <What appears, and what the instruction line says (`look` / `act`)>
2. <What the player taps>
3. <Right: … / wrong or timeout: what is shown for ~1 s>

Three questions per game. <Say what carries over between them, e.g. the same board.>

## Mechanic options
<Two or three ways to play the same idea. Give one line each on what it tests and how it fails. Mark the recommended one.>

| | Option | Tests | Risk |
|---|---|---|---|
| ★ | | | |
| | | | |

## Levels (only the three that matter)
| Lv | Board | What makes it harder |
|---|---|---|
| 1 | <a concrete board, e.g. "3 shapes, code of 2"> | |
| 3 | <standard first level> | |
| 8 | | |

<In a line or two, say the axes the in-between levels move along.>

## Board space: tablet and phone are different layouts
The app also runs on portrait phones (`max-width: 600px` rules in `css/style.css` and `app/app.css`). The board area there is the opposite shape, so plan **a separate phone layout**, not a shrunken tablet one. Measured by `tools/sketch/shoot.js`:

| Device | Board area (`.stage-body`) | Shape | What fits |
|---|---|---|---|
| Tablet 1280×800 | **1136 × 337** | wide, short | side by side; stacked layouts rarely fit |
| Phone 390×844 | **330 × 494** | narrow, tall | one stack, top to bottom |
| Small phone 360×640 | **300 × 339** | small | the phone stack, shrunk. Check 56 px here |

- Tablet layout: <…>
- Phone layout: <… how the board stacks. Rows that are side by side on the tablet usually wrap or stack here.>

## Constraint check
- [ ] Under 10 s per game at Lv3: <estimate: N questions × M s>
- [ ] Taps only, targets ≥ 56 px on the tablet **and** a 390×844 phone (say what happens on 360×640)
- [ ] Nothing told apart by colour alone
- [ ] ≤ a few words to read while pedalling
- [ ] Exactly one right answer; how the generator guarantees it: <…>
- [ ] Intro diagram in two steps: <① … → ② …>

## Risks to check in the mockup / sketch
- <"Is it obvious that …?" These are the questions a playtest has to answer.>

## Open questions for review
- <Decisions the reviewer should make, each with a recommendation>
