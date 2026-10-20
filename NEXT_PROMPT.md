# Prompt to finish Dead Acre

Copy everything below the line into the AI assistant.

---

You are continuing work on **Dead Acre**, an original over-the-shoulder zombie arena shooter (inspired by how the 2005 and 2023 versions of a well-known survival-horror game *play*: mechanics only, with no names, characters, assets or voice lines copied). It is built with TypeScript, plain Three.js and Vite. The repository is `keanemark2-afk/Zombie-shooter`, branch `claude/new-session-o1i6xt`. Never push to the default branch.

## About me
I have no coding knowledge and I'm on Windows. Explain things in plain English. When I need to do something, give me exact steps, one at a time. Don't tell me something works unless you've tested it.

## Read these first
1. `CLAUDE.md`: the code rules. **Follow them strictly.** In particular:
   - Every gameplay number goes in `src/config/tuning.ts` with a `//` note on the same line.
   - Never add or remove lights while the game is running.
   - Browser tests wait on frame counts, never on fixed timeouts.
2. `PROGRESS.md`: what is already built.
3. `src/core/game.ts`: the main game class. It is large, so search it rather than reading it all.

## Current state
Phases 0–5 are built. That covers:
- shooting
- melee and the knife
- horde AI and Survival waves
- health and drops
- grenades, all enemy types, the parasite and 9 guns
- the attaché case grid (`src/inventory/grid.ts`, `src/ui/caseScreen.ts`)
- the Trader (`src/inventory/shop.ts`, `src/ui/traderScreen.ts`, `src/characters/trader.ts`)
- gun upgrades (`src/combat/upgrades.ts`)

## Step 1: make the tests pass (do this first)
1. Run `npm install`, then `npm run check`. That runs the typecheck, about 218 unit tests and the Playwright browser tests in `tests/smoke/`, which take roughly 15 minutes.
2. In the last run, three browser tests failed. Fixes for all three have been made but **not confirmed**:
   - `tests/smoke/phase5.spec.ts`: the case closed on the same frame Tab opened it, so the Trader screen never appeared. The extra Tab check in `game.ts` was removed.
   - `tests/smoke/survival.spec.ts`: the starting items changed. The starting case is now 2 frag grenades, 1 green herb and the pistol.
   - `tests/smoke/phase4.spec.ts`: the flash grenade didn't kill the parasite in time. The check now only confirms the flash grenade was thrown. Ideally, also verify that `Game.flashGrenade` really kills parasites (`Zombie.flash`).
3. Fix anything still red. If a test is flaky because the test browser is slow, make it robust:
   - loop, re-placing the zombie each time
   - use the `launched` counters in `state()`
   - never weaken what the game actually does just to get green
4. Look at the screenshots in `test-results/`.

## Step 2: Phase 6, Score Attack and difficulty
- **Score Attack mode** (`score` already exists in `GameMode`; add a menu button).
  - The clock starts at **2:00**. The run ends at **150 kills**, when time runs out, or on death.
  - **Combo:** a kill within about 10 seconds of the last keeps the combo going. Show a draining combo bar. Points per kill = base + (combo − 1) × 500, and × 1,000 once past combo 10.
  - **Time bonuses:** headshot kill or kick kill +2 s, suplex +5 s, barrel kill +1 s, elite kill a big bonus.
  - **Time orbs** around the map add +30 s (`Pickups` already has an `orb` drop type).
  - **Overdrive gauge** fills over time and faster with kills. Activate it for about 20 seconds of double time gains and no reloads.
  - **Results screen:** leftover time converts to points. Ranks: S++ ≥ 1,000,000, S+ ≥ 500,000, S ≥ 200,000, then A, B and C.
  - **Local high scores** per map, stored in localStorage inside try/catch.
  - Put the scoring rules in a pure, unit-tested module `src/modes/scoreAttack.ts`.
- **Hidden dynamic difficulty.**
  - Track accuracy, headshot rate, damage taken, time since last hit and deaths.
  - Within set limits, quietly nudge attack tokens, run chance, enemy damage, spawn count and drop generosity.
  - Show the current value only in the F1 panel, and add an off switch.
  - Make it a pure, unit-tested module.
- **Difficulty** Easy / Normal / Hard / Pro. `settings.difficulty` already exists, and the chainsaw uses it. Add enemy damage and ammo multipliers to tuning.
- **Full Settings screen** (`src/ui/menu.ts`):
  - mouse sensitivity, invert Y, aim mode (Classic/Modern), FOV, gore, difficulty
  - volume sliders
  - graphics quality
  - all saved in `src/config/settings.ts`
- **Remappable controls.** `src/config/controls.ts` already has the `bindings` data. Build a screen to rebind keys and pad buttons, and save the result.
- Add `tests/smoke/phase6.spec.ts`.

## Step 3: Phase 7, polish
- Music: low ambient dread for Survival, up-tempo music for Score Attack. Use only CC0 tracks or music generated with the Web Audio API, and credit every file in `CREDITS.md`.
- Better menus, and controller button prompts everywhere.
- A light post-processing pass.
- A performance pass: watch F3 frame rate and draw calls.
- Keep the code-built characters. The gore, dismemberment and suplex rely on their separate body parts.
- Final docs: `PROGRESS.md`, `README.md` (controls table), `CLAUDE.md`.

## After each phase
1. Run `npm run check` until it is green.
2. Update `PROGRESS.md` in plain English.
3. Commit and push to `claude/new-session-o1i6xt`.
4. Give me a short plain-English summary and a test checklist.
5. Tell me how to play: in GitHub Desktop press **Fetch**, then **Pull**, then double-click **`Play Game.bat`**.
