# Minigame drafts

New minigames go through three cheap stages before anyone writes `js/games/<id>.js`. Each stage can reject or reshape the idea for a fraction of the cost of a build. (사다리 타기 was fully built, about 470 lines, before playtests showed that "even Lv1 was too hard.")

| Stage | Artifact | Answers | Cost |
|---|---|---|---|
| 1. Design card | `docs/games/drafts/<id>.md` from [TEMPLATE.md](TEMPLATE.md) | Is the rule one sentence? Does it fill a gap in [TARGETS.md](../TARGETS.md)? Does it fit 10 s, 56 px, no colour-only cues? | minutes |
| 2. Mockup | `tools/sketch/<id>/index.html`: hand-written board states drawn inside the real app card, with 2–3 layout or style variants, **plus a separate phone layout** | Does it fit the tablet board (1136 × 337) and the phone board (330 × 494)? Are taps ≥ 56 px? Is it readable at a glance? Which look? | an hour |
| 3. Clickable sketch | `tools/sketch/<id>/play.html`: hard-coded puzzles, real tap → feedback, stub host | Does an older player get Lv1 (and the first harder rule) without help? | a couple of hours |
| Build | `js/games/<id>.js` + the checklist in [NEW_GAMES_BRIEF.md](../NEW_GAMES_BRIEF.md) | — | as before, but with the design settled |

Stop after each stage for a verdict. Record the verdict in the card, update **Status**, and only then move on. Claude runs the stages with the `/game-draft` skill (`.claude/skills/game-draft/`).

The sketch harness is described in [tools/sketch/README.md](../../../tools/sketch/README.md).

When a game is built, keep its card. It records why the design is the way it is, and the generated manual page in `docs/games/` doesn't.

## Drafts
| Game | Status |
|---|---|
| [금고 열기 (`safe`)](safe.md) | built: [`js/games/safe.js`](../../../js/games/safe.js) (generator checked by `node tools/safe-check.js`) |
| [그림 조각 기억하기 (`art`)](art.md) | clickable sketch round 1: [`play.html`](../../../tools/sketch/art/play.html) |
