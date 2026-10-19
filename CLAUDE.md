# Dead Acre - notes for Claude

The full brief is the user's original prompt; key rules are repeated here.

## Working with the user
- No coding knowledge, on Windows. Explain in plain English with exact one-at-a-time steps.
- Build in phases (0-7). After each phase: stop, summarise, give launch steps and a short
  test checklist, and wait for their OK before starting the next phase.
- Keep `PROGRESS.md` up to date in plain English.
- Pushing: the user approved pushing to the work branch at the end of each phase
  (never to the default branch). Local commits any time.
- Test before handing over: `npm run check` (typecheck, unit tests, then the Playwright
  browser tests - about 6 minutes, two files in parallel - which fail on any console
  error). Look at the screenshots in `test-results/`.
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
- Player preferences (crosshair style/colour/size, laser beam, gunshot sound) live in
  `src/config/settings.ts` (localStorage, try/catch) and are edited in menu > Settings;
  gameplay numbers stay in tuning. The crosshair is an SVG drawn by `src/ui/crosshair.ts`.
- Recorded sounds (CC0, listed in `CREDITS.md`) are OGG files in `public/sounds/`, made by
  `tools/make_sounds.py` (numpy + ffmpeg). Played via `Sfx.playSample`; the old synth
  gunshots remain as the "Old generated sound" option. Credit every new file.
- Elements toggled with the `hidden` attribute rely on the global `[hidden]` CSS rule.
- Dispose geometries of removed zombies/props (materials are shared caches).
- Weapons: definitions + ammo/pump/reload state machine in `src/combat/weapons.ts`
  (unit tested); each gun's numbers are a tuning section with the same shape as
  `tuning.pistol`. Shots go through `resolveShot` (pellets add up; big total push =
  knockdown). Shotguns also have a close-range blast (`blastPush`). Long guns are
  children of the player root, placed each frame in `holdLongGun`, hands by IK.
- Seven weapons (`WEAPONS`): `cycle` none/pump/bolt, `auto` (SMG fires while held),
  `scope` (rifle: camera jumps to the eye, `.scope` overlay), `projectile` (rocket:
  `Game.launchRocket` -> `explode`). Every gun section in tuning has the same keys
  (a unit test checks), including `headPop`, `critChance`, `dismember`.
- Gore: `resolveShot` decides `headPop` / `crit` / `severed` (pure, unit tested);
  `Game.applyGore` does the visuals. `Zombie.popHead()` / `sever()` detach parts
  (stand-in joints keep the pose code working); `GoreSystem` (`src/fx/gore.ts`) flings
  pieces with simple physics and runs stump spurts. Gore level is a player setting.
- Melee/knife/grab rules are pure in `src/combat/melee.ts` (unit tested). The player
  plays moves (`startMelee`, `MELEE_TIMING`) and calls `meleeEvent`; the game applies
  them to `meleeTarget`. The suplex body is placed by `Game.carryPose` each tick.
  Zombie attacks go through `ZombieHost.attackPlayer` (parry -> grab -> hit).
- Test hooks: `__deadAcre.zombie(kind, value)` forces a zombie state / grab / place;
  `killAll()`, `spawn(kind, distance, aware)`, `cheat(kind, value)` (hurt / herb / coins / wave...).
  `tests/smoke/helpers.ts` has `fastMode(page)` (no shadows or glow, long catch-up steps:
  the game then runs faster than real time in the slow test browser) and `withGame`.
- Modes: `GameMode` = survival | score | range (`src/core/modes.ts`); `Game.modeId`. Run
  logic: `startMode` / `clearRun`, `survivalTick` (waves via `WaveDirector`), `onZombieDied`
  (counts kills, rolls drops), `damagePlayer` (the only way health goes down).
- Group AI (`src/ai/`): `NavGrid` (flow field from the player; bucket queue, ~4 ms),
  `TokenPool` (who may attack), `assignSurroundAngles`, and `Horde` which ties them to
  the zombies. Zombies get awareness (`aware`, `senses`, `noticePlayer`) and per-kind
  numbers (`tuning.enemyTypes`, `src/enemies/kinds.ts`).
- Pure rules, all unit tested: `combat/health.ts` (health, herbs), `combat/drops.ts`
  (`rollDrop`), `modes/waves.ts`, `inventory/supplies.ts`, `ai/*`.
- Quick turn only triggers when the character faces away from the camera (the
  user hit accidental 180s when sprinting while backing off).
- Game world updates at a fixed 60 Hz (`tick`), drawing interpolates positions (`render`).
  Hit-stop freezes ticks only.
