# Dead Acre - notes for Claude

The full brief is the user's original prompt; key rules are repeated here.

## Working with the user
- No coding knowledge, on Windows. Explain in plain English with exact one-at-a-time steps.
- Build in phases (0-7). After each phase: stop, summarise, give launch steps and a short
  test checklist, and wait for their OK before starting the next phase.
- Keep `PROGRESS.md` up to date in plain English.
- Pushing: the user approved pushing to the work branch at the end of each phase
  (never to the default branch). Local commits any time.
- Test before handing over: `npm run check` (typecheck, unit tests, ~30 s Playwright smoke
  test that fails on any console error). Look at the screenshots in `test-results/`.
- Originality: mechanics only. No names or assets from any existing game.

## Code rules
- Every gameplay/visual number lives in `src/config/tuning.ts` with a plain-English
  `//` note on the same line (a unit test enforces this). Optional `[a to b]` at the end of
  the note sets the F1 slider range. Read tuning values at use time so F1 edits apply live.
- `Play Game.bat` must stay ASCII with CRLF line endings (`.gitattributes` keeps it as-is).
  Use `call npm ...` inside it. Avoid parentheses inside `echo` lines in `( )` blocks.
- Avoid Ctrl-based controls (Ctrl+W closes the browser tab).
- Static scenery is merged by material in `src/world/staticBatch.ts`; mark anything that
  must stay separate (barrels, crates, enemies) with `userData.dynamic = true`.
- Headless Chromium renders with SwiftShader (~1-3 fps); smoke tests must wait on frame
  counts (`window.__deadAcre`) rather than fixed timeouts.
