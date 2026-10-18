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
- Open the game with `?autotest` for automation: no pointer lock, and `window.__deadAcre`
  offers `start(mode)`, `state()`, `aimAt(zone)`, `view(from, to)` (free camera) and
  `tuning`; `window.__game` is the Game instance. Wait for reticle focus before testing
  where a shot lands (the laser dot sways inside the reticle).
- Characters face -z; joint rotation +x swings a limb forward and tilts the spine/head
  back. Body-part meshes are the hitboxes (`userData.zone`). Never add/remove lights at
  runtime (it rebuilds every shader): keep them and set intensity 0 instead.
- Elements toggled with the `hidden` attribute rely on the global `[hidden]` CSS rule.
- Dispose geometries of removed zombies/props (materials are shared caches).
- Weapons: definitions + ammo/pump/reload state machine in `src/combat/weapons.ts`
  (unit tested); each gun's numbers are a tuning section with the same shape as
  `tuning.pistol`. Shots go through `resolveShot` (pellets add up; big total push =
  knockdown). Shotguns also have a close-range blast (`blastPush`). Long guns are
  children of the player root, placed each frame in `holdLongGun`, hands by IK.
- Quick turn only triggers when the character faces away from the camera (the
  user hit accidental 180s when sprinting while backing off).
- Game world updates at a fixed 60 Hz (`tick`), drawing interpolates positions (`render`).
  Hit-stop freezes ticks only.
