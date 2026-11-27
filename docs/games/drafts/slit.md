# 물고기 엿보기 (`slit`) — design card

> Game-draft workflow ([README.md](README.md)). **Clickable sketch: [`play.html`](../../../tools/sketch/slit/play.html)** · mockup: [`tools/sketch/slit/`](../../../tools/sketch/slit/index.html) · fish generator with motion: [`fish.html`](../../../tools/sketch/slit/fish.html) · first look at 12 kinds: [`kinds.html`](../../../tools/sketch/slit/kinds.html) (`node server.js` → http://localhost:5173/tools/sketch/slit/).

**Status:** card · mockup · sketch · approved · **built** (2026-11-27: [`js/games/slit.js`](../../../js/games/slit.js), fish in [`js/games/slit-fish.js`](../../../js/games/slit-fish.js), checked by `node tools/slit-check.js`)
**Gap it fills:** mainly **시각 구성** (△, priority medium: "부분을 조합해 전체 모양을 만드는 능력", only 빈자리 채우기 so far). The player never sees the whole thing at once and has to build it from slices over time. This is *anorthoscopic perception* (slit viewing), a known lab task for temporal integration of shape. It also partly covers **지속적 주의 · 시각 추적** (☑, already 2 games). With word stimuli it touches reading but not **낱말 인출**, because the player matches what they see and doesn't retrieve anything.
**Tags / clashes:** `Tag.TRACK` (watch something moving), shared only with 공 따라가기. Not `MEMORY` as long as the choices stay on screen (option A). Option B would make it the 8th memory game. Word stimuli would also add `Tag.WORD` (같은 글자 넣기).

## Review log
- **After the build:** "levels 4+ slightly harder". Lv4–8 each got a narrower slit and a slightly faster fish, one notch: slit 26/20/15/11/8 % → 22/17/12/9/7 %, pass 2.5/2.4/2.3/2.2/2.0 s → 2.4/2.3/2.2/2.1/1.9 s. Looks unchanged, so the timers shrink a little with the faster pass.
- **Sketch → built:** approved and added to the app as `slit` (v1.8.0).
  - The sketch's game class and board became `js/games/slit.js` (layout from the board's shape with a `ResizeObserver`; the size math also subtracts the app's white mat and reads the wider gap the app puts between band and cards). The generator moved to `js/games/slit-fish.js`; the sketch's `fish.js` now re-exports it (8,000 questions compared: identical).
  - The watch prompt is now "틈으로 물고기를 보세요": "틈으로 지나가는 물고기를 보세요" wrapped onto two lines on the 360×640 phone.
  - The session log keeps each card's fish features, what was changed and its SVG; the admin replay draws the cards.
  - Checks: `tools/slit-check.js` (16,000 questions: choice count, all drawings different, every pair of cards differs in exactly two features, each card's own change matches the level's change size, no eye change on a slim fish, answer position even); in the app at 1280×800 and 360×640.
- **Sketch round 1:** the timer now follows the number of **looks** at the fish, first pass included: 6 at Lv1 down to 3 at Lv8 (see Levels).
- **Mockup → sketch:** tablet layout **B** (band on top, one row of choices); phone **2×2**, small phone included; the fish **keeps looping** at every level; title **물고기 엿보기**. The mockup now shows only these. `play.html` runs `SlitGame` (`slit-game.js`, in the real game shape) with a fresh fish each question.
- **Card → mockup:** the kind is **fish only** (generated, [Fish as a generated kind](#fish-as-a-generated-kind-toolssketchslitfishhtml)), one fish at a time. Lv8 was set by the user: complexity 3, small differences, slit 8 %, 2 s per pass. A build was asked for first, then the layout mockup was put back in front of it.

## The rule in one sentence
"틈 사이로 지나가는 물고기를 잘 보고, 똑같은 물고기를 고르세요." (the intro hint)

## One question, step by step
1. A dark band with one narrow slit (yellow edges) sits on top. The choices (2–4 cards) are already shown below. `look` "틈으로 물고기를 보세요".
2. A fish swims right to left behind the band. Only the part under the slit is visible at any moment. After it has passed, it pauses 0.5 s and swims past again, at every level, until an answer.
3. `act` "똑같은 물고기를 누르세요" once the first pass is done, and the timer starts. Tapping is allowed earlier too, so a quick player isn't held back.
4. Right: the walls fade and show the whole fish in the band (green ring), green ✓ on the card. Wrong or timeout: the tapped card gets a red ✕, the right card a green ✓, and the walls fade to show the whole fish, for ~1.4 s.

**Two questions per game** (`ROUNDS = 2`, as in 그림 조각 기억하기). Three won't fit in 10 s (see Constraint check).

## What scrolls past (the stimulus kinds)
Moving preview of 12 hand-drawn kinds with slit-width and speed sliders: [`tools/sketch/slit/kinds.html`](../../../tools/sketch/slit/kinds.html) (opens straight from disk). Its distractors are all single changes of the shown item, so they still have the centre loophole below; that's fine for judging looks.

The skill being tested changes with the kind, as you said:

| Kind | Example | What the player does | Distractors (one change each) |
|---|---|---|---|
| **선 그림** (line drawing on a dot grid) | 두 그림 비교하기's drawings | pure shape integration: put the slices together into one shape | a line added, removed or shifted, with the compare.js generator reused |
| **모양 + 무늬** | 없던 그림 찾기's `NOVEL_SHAPES` × `NOVEL_MARKS` | integration with an easy whole: is it a circle or a house, and with what inside? | same shape with a different mark, or a different shape with the same mark |
| **낱말** (2–3 syllables, Korean) | 사과 · 사자 · 가자 | Korean blocks are built left to right (초성 then a vertical 중성), so a narrow slit shows jamo strokes, not syllables. The player reads "through" the slit | one syllable or one jamo different (사과 / 사파), from a word list |
| (later) 기호 줄 | ○△□ in a row | sequence of symbols, close to plain reading | swap or change one symbol. Too close to 숨은 순서 찾기, so parked |

**Recommendation:** keep **one kind per game** and rotate it each time the game comes up in a round (선 그림 → 모양 → 낱말 → …). The levels then move the same axes for every kind (slit width, speed, choices, closeness). One game that changes its kind keeps the tag count down and gives variety. Splitting it into three games would triple the build work and crowd the TRACK tag.

### Fish as a generated kind ([`tools/sketch/slit/fish.html`](../../../tools/sketch/slit/fish.html))
Fish became the favourite in the kinds preview, but tail, fin and stripes alone are three switches, too few for eight levels. The fish is now built from features, each with several values:

| Feature | Values | Change size |
|---|---|---|
| 몸 모양 | 날씬 (both ends pointed) · 둥긂 (puffer) · 상자 (boxfish) · 마름모 (tall, angelfish) · 혹 머리 (hump over the head). Outlines, not stretched ovals: the first oval set read alike | big |
| 꼬리 | 갈래 · 부채 · 둥긂 · 뾰족 | big |
| 등지느러미 | 없음 · 돛 · 가시 · 긴 둔덕 | big |
| 무늬 종류 | 없음 · 세로 줄 · 다이아 · 가로 띠 · 꺾쇠. Marks start behind the gill line. (Round white dots were dropped: on a dark fish they read as extra eyes. Every eye also has a dark pupil now, so no white mark can pass for one) | big |
| 무늬 개수 | 1–4 (줄, 다이아, 꺾쇠) | small |
| 배지느러미 | 없음 · 하나 · 둘 | small |
| 눈 · 입 · 아가미 선 | 점 눈 / 큰 눈 · 다문 / 벌린 입 · 없음 / 있음 | small |

Knobs for the level table:
- **Complexity:** how many features a fish carries (1: body, tail, back fin, stripes → 3: everything). More features means more to hold while the fish passes.
- **Change size:** big (another kind of part) → small (a count or a detail).
- **School:** 1 → 3 fish in a row; the player must also keep track of *which* fish changed.
- **Slit, speed, loop, choices:** as before.

Every choice is one change of a hidden base school, at a different (fish, feature) pair, so each card is the odd one out on exactly its own feature and none stands out (loophole 1).

## Mechanic options
| | Option | Tests | Risk |
|---|---|---|---|
| ★ | **A. Choices shown from the start, stimulus loops** (Lv5+: one pass) | integrating slices while checking them against the choices | the "centre" loophole below; watching only where the choices differ is fine (that's selective attention) |
| | B. Stimulus first, then the choices (one pass, no loop) | visual construction + visual memory | 8th MEMORY game; harsh for older players if they blink. Could be a Lv7–8 rule |
| | C. The slit moves over a still stimulus (a "flashlight") | the same integration, but the eye follows the slit | the eye has to move, which is harder while pedalling, and it's less like the classic task |
| | D. Show the stimulus whole, then pick the slice that came from it | part-whole matching, no motion | no longer a slit game; close to 그림 조각 기억하기 |

## Loopholes
1. **The centre candidate.** If every distractor is the answer with one change, the answer is the card that agrees with most of the others at every spot. That can be found **without ever watching the slit** (the 금고 열기 leftover-digit problem). Fix: build all the choices, answer included, as single changes of a hidden *base* that is never shown. Then no card is the centre. The generator checks that the answer isn't uniquely the most similar card to the rest.
2. **Answer position.** Shuffle the cards every question.
3. **Wide slit.** If the slit is wider than the part where the choices differ, one glance is enough. That's fine at Lv1–2 and is exactly what the slit-width axis tightens.

## Levels
| Lv | Board | What makes it harder |
|---|---|---|
Fish only, one fish per question (`LEVELS` in [`fish.js`](../../../tools/sketch/slit/fish.js)). "Pass" = seconds for the fish to cross the slit completely; it then pauses 0.5 s and swims past again.

| Lv | Complexity | Change | Slit (of fish width) | Pass | Choices | Looks | Timer |
|---|---|---|---|---|---|---|---|
| 1 | 1 | big | 50 % | 3.0 s | 2 | 6 | 18.5 s |
| 2 | 1 | big | 40 % | 2.8 s | 3 | 6 | 17.5 s |
| 3 | 2 | big | 32 % | 2.6 s | 3 | 5 | 13.4 s |
| 4 | 2 | mixed | 22 % | 2.4 s | 3 | 5 | 12.6 s |
| 5 | 2 | mixed | 17 % | 2.3 s | 4 | 4 | 9.4 s |
| 6 | 3 | mixed | 12 % | 2.2 s | 4 | 4 | 9.1 s |
| 7 | 3 | small | 9 % | 2.1 s | 4 | 3 | 6.2 s |
| 8 | 3 | small | **7 %** | **1.9 s** | 4 | **3** | 5.8 s |

**Looks** = how many times the player can see the fish before time runs out, the first pass included (set by the user: 6 at Lv1, 3 at Lv8). The timer starts after the first pass, so it is (looks − 1) × (pass + 0.5 s pause) + 1 s to decide after the last pass. The host stretches Lv1–2 timers by the easy-level factor (2×, 1.6×); the game divides that back out, since the looks are already generous. The round preset's time scale (`questionTimeScale`) still applies.

Lv8 is the user's setting; Lv1–7 step evenly towards it. The fish loops at every level for now (the card first had one pass from Lv5; see open questions). 2,000 questions per level: every one has the full number of distinct choices.

## Board space
| Device | Board area | Layout |
|---|---|---|
| Tablet 1280×800 | **1136 × 337** | ★ **B:** band on top in the middle (fish 144 px tall), choices in one row below (fish 108 px, cards 124 px tall) |
| Phone 390×844 | **330 × 494** | band across the full width (fish 100 px), choices 2×2 below (fish 59 px, cards 75 px) |
| Small phone 360×640 | **300 × 339** | the same stack (fish 92 px in the band, cards 69 px) |

Sizes come from measuring the board (`sizes` in `board.js`): the band is 1.3 × the fish, cards hold the fish at 0.75 × the band's on the tablet; on phones the band shrinks until the cards get at least 0.6 × the band's fish.

## Mockup verdict (round 1)
- **32 screens (30 boards + 2 intros), no overflow.** Smallest tap target: tablet 123 px, phone 75 px, small phone 69 px (2×2). The one-card-per-row phone variant drops to 52 px on the small phone.
- **Tablet B recommended** (band on top, one row of choices). The choices sit right under the slit, so the eye moves the shortest way, and it's the same top-to-bottom order as the phone. A (band | 2×2) gives the same card size (128 px) but leaves an empty slot at 3 choices; C (choices on both sides of the band) makes the eye cross the band to compare the left and right cards.
- **Phone: 2×2**, not one card per row. One per row gives no bigger fish (the cards run out of height before width) and pushes the band to the top.
- **Lv8 details are readable on the cards:** 점 눈 / 큰 눈, 아가미 선, 벌린 입 and 다이아 1 / 2 all show on the tablet's 108 px fish and still on the small phone's ~53 px fish, though barely there.
- Feedback: the walls fade to 12 % so the whole fish shows inside the band; the picked card gets ✕ and the right card ✓ (green ring on the band too when right).
- Fish drawing fix found here: card buttons drew the fish in pure black instead of the board ink, because a button doesn't inherit the text colour.

## Constraint check
- [ ] **Under 10 s at Lv3: over.** Per question: first pass 2.6 s + decision ~1.5 s + feedback 0.9 s ≈ 5 s, so two questions ≈ **10 s**, and more whenever a player waits for a second pass. Tapping during the first pass helps. Check in the sketch; if it runs long, Lv3 could pass in 2.2 s.
- [x] Taps only: tablet 123 px, phone 75 px, small phone 69 px (measured).
- [x] Not colour alone: the stimuli are black-on-white shapes, words and lines; feedback carries ✓/✕.
- [~] Reading: the instruction line is short, but **word stimuli are reading by design**. Keep them to 2–3 common syllables.
- [x] One right answer: every choice is a different single change of the base (loophole 1), so exactly one matches the stimulus.
- [x] Intro diagram: ① 틈으로 지나가는 것 보기 → ② 똑같은 것 누르기.

## Clickable sketch (round 1)
- `play.html` runs `SlitGame` on the sketch host. Level bar at the bottom; `?level=N`, `?intro=0`. A narrow window (or a phone) gets the phone layout, switched by the board's shape like the real games.
- Flow: the choices and the band appear together, `look` "틈으로 물고기를 보세요". The fish crosses the slit in the level's pass time, pauses 0.5 s and comes again until an answer. After the first full pass: `act` "똑같은 물고기를 누르세요" and the question timer starts. Tapping during the first pass already counts (logged as `early`). Right: walls fade, green ring, 0.9 s. Wrong or timeout: ✕ / ✓, walls fade to show the whole fish, 1.4 s. Two questions, each a new fish.
- Timer: from the looks (Levels table), `questionTime { base: 0, per: 1 }` with the seconds as the load. Measured in the browser: Lv1 18.5 s, Lv3 13.4 s, Lv8 6.0 s after the first pass.
- Checked in headless Edge on 1280×800 and 390×844, every level: fish moves left; nothing opens before the first pass; prompt and timer after it; right answer scores; an early wrong tap shows ✕ and ✓; the game ends after 2; the Lv3 timeout shows "시간 초과".

## Risks to check in the sketch (playtest checklist)
- **Lv1 without help:** after the intro, does the player understand it's *one* fish swimming behind the wall, and look at the slit rather than the cards?
- **Speed:** is 3 s per pass at Lv1 readable for older eyes, and does 2 s at Lv8 feel fair or frantic?
- **Lv8 small changes through a 7 % slit:** 점 눈 / 큰 눈, 아가미 선, 벌린 입, 다이아 1 / 2. Can players catch them, or does it turn into guessing? (The fish loops, so they get more looks.)
- **Strategy:** do players read the cards first and then wait for the part where they differ? That's fine (selective attention), but if it's the only strategy, the slit width hardly matters.
- **Waiting:** does anyone sit through all the looks? A question can now last up to ≈ 21 s at Lv1, 16 s at Lv3 and 8 s at Lv8, so a Lv3 game where both questions use every look runs ≈ 35 s (with feedback) against the 10 s budget.
- **Phone:** are the 2×2 cards (fish about 59 px, 53 px on the small phone) big enough for the small differences at Lv7–8?
- Does the "look → tap" switch after the first pass make sense, or do players wait for permission they don't need?

## Open questions for review (sketch round 1)
1. Play each level: is Lv1 → Lv3 → Lv5 → Lv8 a smooth climb?
2. **Speeds:** too fast or too slow anywhere?
3. **Game length:** players who use every look at Lv1–4 make games far longer than 10 s. Accept that for the easy and middle levels, or cut the looks there?
4. Anything to change before the build?

## Decided at the mockup (round 1)
Tablet **B**, phone **2×2** (small phone too), **loop** at every level, title **물고기 엿보기**.

## Open questions from mockup round 1 (answered)
1. **Tablet layout:** B, band on top with one row of choices (recommended), A or C?
2. **Phone:** 2×2 (recommended) or one card per row?
3. **Loop or one pass:** the fish loops at every level now. Keep that (recommended for a first sketch: Lv8 is already hard), or switch to one pass from Lv5 as the card first had?
4. **Lv1–7 steps** between the given Lv8 and an easy Lv1: right in the sketch?
5. **Title:** 틈으로 보고 찾기, or something with the fish in it, like 틈새 물고기?

## Earlier open questions (card)
1. **Kinds:** one kind per game, rotated each time it comes up (recommended), or fix the kind by level (pictures early, words middle, drawings late), or separate games per kind?
2. **Which kinds to keep:** drawings + shapes + words (recommended), or drop words to keep reading out?
3. **Option A vs B:** choices visible (recommended), with option B (stimulus first, then choices) possibly as a Lv7–8 rule?
4. **Two questions per game** to fit 10 s (recommended), or three with a faster pass?
5. **Title:** 틈으로 보고 찾기, 틈새 그림 찾기, or 지나간 것 찾기?
