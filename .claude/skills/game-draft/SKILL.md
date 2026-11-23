---
name: game-draft
description: Design a new minigame for this exergame app before coding it, in three reviewable stages (design card → visual mockup → clickable sketch), stopping for the user's verdict after each. Use when the user proposes a new minigame idea, asks to design, draft, mock up or prototype one, or wants to iterate on a draft in docs/games/drafts/. Not for building the final js/games/<id>.js (that comes after the sketch is approved, following NEW_GAMES_BRIEF.md).
---

# Minigame draft workflow

Goal: find out whether a game idea works, and what it should look like, **before** the expensive build: generator, host wiring, logs, abilities, manual. Read `docs/games/drafts/README.md` and `tools/sketch/README.md` first.

Work out which stage the idea is at from `docs/games/drafts/<id>.md` (its **Status** line). Do only that stage, then stop and ask for a verdict. Never skip ahead to `js/games/`.

## Stage 1: design card
1. Read `docs/games/TARGETS.md` (the gaps), the "Rules every new game follows" in `docs/NEW_GAMES_BRIEF.md`, `js/games/tags.js`, and one or two existing games with similar mechanics.
2. Copy `docs/games/drafts/TEMPLATE.md` to `docs/games/drafts/<id>.md` and fill it in. Write it in English, with Korean for on-screen strings.
   - Give **2–4 mechanic options** with a recommendation. That's where cheap iteration happens.
   - Only the levels that matter (1, 3, 8, and any level where a new rule appears).
   - Be honest in the constraint check (10 s per game, 56 px, colour plus shape, little reading). Flag anything over budget instead of hiding it.
   - Look for loopholes: can the player shortcut the intended thinking? (In 금고 열기 round 1, a keypad showing only the key's digits let the leftover digit give away every clue.)
3. Add the draft to the table in `docs/games/drafts/README.md`.

## Stage 2: mockup
1. Create `tools/sketch/<id>/` with `board.js` (a `drawBoard(body, state)` that renders one hand-written state), `index.html` (the shots) and `<id>.css`. Copy the `<head>` from `tools/sketch/safe/index.html`.
2. Shots: Lv1 · standard level · wrong-answer feedback · success · each level where a new rule appears · the densest level · intro screens via `Sketch.intro` with a `diagram(level)`-style SVG built from `js/diagram.js`. Draw them in **2–3 layout or style variants** as separate groups.
3. Run `node tools/sketch/shoot.js <id> <job tmp dir>` and **look at the PNGs**. Fix overflow and clipping before showing the user. The densest level is the real test.
4. Add a short "Mockup verdict" section to the card: what fits, what doesn't, the recommended variant. Fold any design changes back into the card.

## Stage 3: clickable sketch
1. `tools/sketch/<id>/play.html` with a game class in the real game shape (`constructor(host)`, `start()`, `abort()`, using `host.after`, `host.timer(load)`, `host.answer`, `host.done`) and `static questionTime`. Run it with `Sketch.play(GameClass)`.
2. Puzzles are **hard-coded** (about 3–5 per level that matters). No generator.
3. Reuse `board.js` for drawing. Follow the shared rules: show the right answer for ~1 s on a mistake; the instruction line goes through `Util.say`.
4. Give the user a playtest checklist from the card's "Risks" section: what to watch for when an older player tries it.

## After each stage
- Update **Status** in the card and the drafts table.
- Commit on a branch: the card, the sketch files and the README rows. Don't touch `js/` or `css/`.
- Report: what to look at (the local URL `http://localhost:5173/tools/sketch/<id>/`, and `/dev/tools/sketch/<id>/` once merged to dev), the open questions from the card with your recommendations, and what the next stage would answer.

## Building (only after the sketch is approved)
Follow the checklist in `docs/NEW_GAMES_BRIEF.md`. Move `board.js` and the sketch's game class into `js/games/<id>.js`, write the real generator, and keep the card as the design record (set Status to built).
