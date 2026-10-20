# Demo Event Brief — Polish Pass

Start here if you are picking up work on preparing this prototype for the public demonstration.
It records the goal, what is already decided, and what is still open. Read `README.md` (Korean) for how to run the game and connect the pedal.

## The event

- **One-time public demonstration** to advertise the exergaming experience. Number of participants is unknown.
- **Several stations**, each a stationary pedaling device (Cardio pedal, `Cardio-P xxxx`, over Web Bluetooth) with a **tablet** in front running this web game.
- Each participant plays **one short session of a few minutes**.
- At the end each participant gets:
  1. a **spatial/radar-style graph of cognitive ("brain") abilities**, built from their minigame performance,
  2. an **exercise amount** result,
  3. a **single numeric score**. Prizes are given out at the end of the event based on this score.
- **No server.** Staff record scores offline (on paper or a separate device). Each tablet runs on its own.
- **Tablets are not iPads.** They will run a Chromium browser (Chrome/Edge), which Web Bluetooth requires. The exact model is not specified, so the layout must work across common tablet sizes in landscape.
- **Session length: 5 minutes of play** (`durationSec: 300`; the current default is 180). Calibration and the countdown come on top of that.
- **Internet is assumed to be available at the venue.** The repo is already hosted on **GitHub Pages** (`twilight-devcra/exergaming-web-prototype`), which provides the HTTPS that Web Bluetooth requires. Whatever is pushed to `main` is what the tablets load. Fallback: load the page on each tablet before the event, or ship an offline copy. Before relying on the fallback, test that the pedal still connects from a cached or offline copy.

## What is settled

- **Core gameplay is validated.** Internal playtests passed: pedal to keep the ball in the green zone (target speed = the player's calibrated comfortable speed, with uphill/downhill shifts) while solving touch minigames underneath. Don't redesign it. This pass is about **presentation and polish**.
- Pedal speed comes from the lz waveform zero-crossing estimator (`rpmSource: 'zc'`, see `js/cadence-est.js`). This was tuned on 2026-10-14 recordings. Leave it alone unless a station-specific problem comes up.
- The eight minigames (`js/games/`): path (길 따라 그리기), symbol (심볼 위치 외우기), arith (사칙연산 역산), count (우세한 색 찾기), fit (빈자리 채우기, hex line tiles), seek (숨은 순서 찾기), cover (가린 숫자 더하기, add two numbers when at least one is under a marked box; added 2026-10-20), ladder (사다리 타기, pick the peg whose ladder path drops it into the same-shaped hole; more holes and slanted rungs at higher levels, some of which change the path compared with reading them flat; added 2026-10-20).
- **The calibrated target speed does not affect the score.** Players aren't expected to pedal flat out during warm-up, and the score only measures how well they hold *their own* target. Don't treat "sandbagging the warm-up" as a fairness problem.
- **Exercise amount = virtual distance + MET-based kcal, from cadence only** (decided 2026-10-16). Pedal resistance can differ per player and can't be calibrated, and the pedal's `watt` is an uncalibrated vibration proxy (default coefficient, grows ~rpm³, reads 0 when slow). So don't use watts. Distance = revolutions × 6 m (the firmware's default bike gearing). kcal = MET × 3.5 × 65 kg / 200 per minute, with MET interpolated from RPM (1.3 at rest, 3.5 at 60 RPM, 4.8 at 90+; values from the Compendium of Physical Activities, RPM anchors are ours). No food or place comparisons.
  **It is display-only and does not count toward the prize score.** The prize score stays as it is now: speed-consistency points (운동 점수) plus minigame points.
- **Radar graph axes are cognitive ability fields, not one axis per game.** It doesn't need to be scientifically exact. Each game feeds several axes with weights (see below).

## Status (2026-10-15): station mode built

`index.html?demo` (linked from the test menu) is the participant-facing flow. It shares the round engine in `js/main.js` with the test page. Everything demo-specific lives in `js/demo.js`, `js/abilities.js` and `js/exercise.js`. See the README section 시연 모드 for staff instructions.

Implemented using the proposed defaults below, so revisit if the user disagrees:
- `DEMO_CONFIG` in `js/config.js` (300 s, all games). It ignores the test page's `localStorage` config. Since 2026-10-16 the operator menu's 시간·점수 설정 panel can override only the round-time and scoring fields listed in `DEMO_SETTINGS` (duration, tolerance, points, multiplier, difficulty mode/start/step sizes). Overrides are stored per tablet (`exergame.demo.cfg`, only fields that differ from the defaults) and locked during a round. A 4-character settings code (`Config.demoCode`) is shown in the operator menu and saved with each result (CSV `settings` column), so stations can be checked for matching settings.
- Operator access: long-press the top-left corner for 2 s, then enter `DEMO_OPERATOR_PIN` (default `2580`). The operator menu holds the station number, pedal connect, resume / end now / abandon, and the per-tablet result log with CSV export.
- Result: large score, participant number `<station>-<seq>` (sequence persists per tablet), radar graph, and exercise amount (distance, kcal, pedaling time, revolutions, avg RPM, speed-keeping %). It stays on screen until staff hold the "다음 참가자" button for 2 s.
- Radar uses the weight table below. Per-game performance = accuracy × (0.85 + 0.15 × level bonus for Lv3+). Processing speed also factors in seconds per question for count/seek (`ABILITY_PACE`). **Superseded 2026-10-16 — the chart now shows stars:** each axis gets 1–5 stars (half steps) = demonstrated level + 0.5. Demonstrated level per play = (level − 1) + accuracy; an axis averages its related plays weighted by game weight × level, so harder plays count more than the Lv1 warm-up. It's meant to leave room for improvement: in simulation a 5-minute round gives ~2 stars to an average player and ~3.5 to a near-perfect one. Below the chart: the top ability plus a one-line compliment (`praise` in `ABILITIES`). The session log keeps the unrounded value as `abilitiesRaw`.
- Difficulty is adaptive by default (`difficulty: 'adaptive'`, decided 2026-10-16): one difficulty meter shared by all games, +0.4 per correct answer, −0.6 per wrong one, next game's level = its integer part. It hovers around 60% accuracy. The old rule (+1 level per cycle through the games) is still selectable on the test page as `cycle`. A 5-minute round is only ~6–7 games, so under `cycle` almost nobody got past Lv2.
- Robustness: Wake Lock, fullscreen (re-entered on next touch), beforeunload/back/context-menu/zoom guards, pause with an on-screen notice on pedal loss, an idle prompt after 40 s and auto-end after 15 s more, and a calibration timeout back to attract after 60 s.
- Attract screen starts on tap or ~2.5 s of pedaling, and requires a connected pedal (`?demo&kbd` overrides for testing).

Still open / to do:
- **RPM→MET anchors and the 6 m/rev distance** (`js/exercise.js`) are judgment calls; adjust if the numbers feel off at playtests.
- `ABILITY_PACE` thresholds and the weight table are guesses, so tune them by playtesting.
- Not yet tested on real tablets with the pedal. Check fullscreen, Wake Lock, and reconnect behaviour on the actual devices.
- How results leave the tablet, branding, and staffing are still undecided (see below).
- **Visual style is being chosen.** A style picker offers clean, arcade neon, sporty, cartoon and retro pixel. Each style sets colours, fonts, how the speed band is drawn, and effects. The pick is stored per tablet. Once one is chosen, fix it for every station, e.g. a `theme` field in `DEMO_CONFIG` that overrides the stored pick, and drop the unused styles if wanted. Fonts come from CDNs; the offline fallback is the system font.

## Why the current build isn't demo-ready (original assessment)

The build is set up for internal testing. Things a participant should not see or be able to reach:

- Menu screen: the **시연 설정** settings panel, the **사용할 게임** game picker, the link to the sensor debug page, and keyboard instructions (`A`/`D`, `Esc`, `` ` ``).
- The `` ` `` debug overlay and the `Esc` pause menu, which can quit to the menu.
- Result screen: the local leaderboard and name entry (`localStorage`, per tablet only, so it can't be used for prizes across stations), plus the **다시 하기** / **메뉴로** buttons.
- Wording and visuals are functional rather than inviting. There is no attract/idle screen and no branding.

Missing for the event:

- **Cognitive ability radar graph.** The game already tracks per-game `plays / cleared / correct / total / points` in `Game.stats` (`js/main.js`), but none of it is mapped to abilities or charted.
- **Exercise amount.** The current "운동 점수" measures *speed consistency*, not *amount*. It needs an energy figure estimated from RPM (see "What is settled"). `WORKOUT` frames are parsed in `js/pedal-link.js`, and RPM reaches the game through `js/pedal.js`.
- **A score staff can record reliably.** It should be large, stay on screen until staff dismiss it, and show a station ID or a per-session number so paper records can't get mixed up.
- **An operator flow** for resetting between participants without touching settings.

## Proposed direction (not yet confirmed)

These are reasonable defaults. Confirm with the user before relying on them.

- **Ability fields and game weights.** A starting point to tune by feel:

  | Game | 기억력 Memory | 공간지각 Spatial | 주의집중 Attention | 논리·수리 Logic/numeracy | 처리속도 Processing speed |
  |---|---|---|---|---|---|
  | path 길 따라 그리기 | 0.5 | 0.4 | 0.1 | | |
  | symbol 심볼 위치 외우기 | 0.6 | 0.3 | 0.1 | | |
  | arith 사칙연산 역산 | 0.2 | | 0.1 | 0.7 | |
  | count 우세한 색 찾기 | | | 0.5 | | 0.5 |
  | fit 빈자리 채우기 | | 0.6 | | 0.4 | |
  | seek 숨은 순서 찾기 | | 0.3 | 0.4 | | 0.3 |
  | cover 가린 숫자 더하기 | 0.6 | | 0.1 | 0.3 | |
  | ladder 사다리 타기 | | 0.3 | 0.5 | | 0.2 |

  Per-game performance comes from accuracy and level (now: stars, see Status above). Each axis is the weighted average of the games that touch it. Because each axis draws on two or more games, a short session that skips a game still fills every axis. If an axis gets no data, show a neutral default rather than 0.
  "Processing speed" would be better with timing, but the games don't record answer times today. Either add per-question timing through the host interface in `makeHost` (`js/main.js`), or use questions answered per minute as a proxy.
- **Station mode**: a URL flag or hidden operator gesture (e.g. long-press a corner and enter a PIN). It locks the config, hides all test UI, and runs: attract screen → calibration → round → result → staff tap to reset. Settings stay reachable only through the operator gesture.
- **One fixed config for every station** so scores are comparable for prizes. Ship it as defaults in `js/config.js` rather than relying on each tablet's `localStorage`.
- **Robustness for unattended tablets**: fullscreen/kiosk, Wake Lock during play, a guard against accidental navigation, a clear on-screen state when the pedal disconnects, and recovery when a participant walks away mid-round.

## Open questions

- **RPM→watt curve (dropped 2026-10-16).** The 2026-10-14 recording showed the pedal's `watt` is its default formula `rpm × torque_x10 × 0.0144` on a vibration proxy, never calibrated, and resistance can change per player. Replaced by distance + MET kcal (see above).
- **Session logs.** Each round records events, every question's content, inputs, answers (correct, timed out, time taken) and raw input: keystrokes, or the pedal's CAPD waveform and WORKOUT frames. It also records 10 Hz samples of the game's RPM and target. Test mode downloads the log from the result screen. Demo mode stores it in IndexedDB after every round, abandoned ones included, and the operator menu exports everything as JSONL. Format: `docs/SESSION_LOG.md`.
- **Arith difficulty capped at 3 blanks** (Lv5–6 previously had 4, which played much harder than the other games). Lv5–6 now get harder through fewer valid combinations and more candidate numbers instead.
- **Long-running minigames: addressed.** Each question (each of the three instances in a batch, or the single path in 길 따라 그리기) now has a time limit. It runs on the game clock from the moment input is accepted, and is shown as a shrinking bar at the top of the game area. Running out counts as a wrong answer for that question. Limits are `base + per × load` seconds in `questionTime` in `js/config.js`, where load is cells to press, blanks, lit cells, candidate pieces or board cells. They are first guesses, so tune them by playtesting. The test page has a checkbox to switch the timer off.
- **How results leave the tablet.** Does the participant just view the radar graph and exercise result, or take it with them (photo of the screen, QR code holding the result data, printout)?
- **Language and branding.** UI is Korean. Are a logo, colours, sponsor marks, or a product name needed?
- **Staffing.** Will one staff member watch each station, or will tablets run unattended between staff resets?

## Working notes for future sessions

- No build step and no dependencies. Plain HTML/CSS/JS loaded via `<script>` tags in `index.html`. Keep it that way unless there's a strong reason.
- Code comments and UI text are Korean. Match that in code.
- Config defaults: `js/config.js`. Round flow, scoring, and result screen: `js/main.js` (`beginCountdown`, `nextGame`, `updatePlay`, `endRound`, `showResult`).
- Test without hardware: `A`/`D` keys simulate pedaling. `pedal-debug.html?sim` simulates the pedal on the debug page.
- Update this file as open questions get answered.
