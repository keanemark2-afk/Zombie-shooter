# Dead Acre - Progress

Plain-English log of what's built, what's next and what's known to be wrong.

## Where we are

**Phase 0 - Setup: done (waiting for your OK).**

## Done

### Phase 0 - Setup
- **Launcher:** double-click `Play Game.bat`. It checks for Node.js (and explains how
  to install it if missing), downloads the game's building blocks the first time,
  starts the game and opens your browser. Later updates re-download only when needed.
- **The arena:** an empty village square at dusk. Dirt ground, rickety fences with four
  gaps (where zombies will come in later), five houses around the edge with warm lit
  windows, three sheds, a stone well in the middle, a watchtower, hay bales, crates,
  eight red explosive barrels, a cart, four lantern posts, pine woods and hills beyond.
  Fog, a sunset glow, long evening shadows, glow around lights, washed-out colours,
  darkened corners and light film grain.
- **Everything solid already has an invisible "bump" shape** ready for Phase 1
  (turn on Tuning > Debug > Show colliders to see them as yellow outlines).
- **Fly-around camera** so you can look at the arena (replaced by the real
  over-the-shoulder camera in Phase 1).
- **F3 FPS counter**, which also shows "draw calls" (how much work each frame is).
- **F1 tuning panel:** every number from `src/config/tuning.ts` as a slider, tick box or
  colour picker. Hover any setting to read what it does. "Copy values" copies only what
  you changed, ready to paste to Claude. "Reset everything" puts it all back.
- **Error box:** if anything ever breaks, a red box shows the error with a Copy button.
- **Automated checks:** 23 unit tests, and a test that opens the game in a hidden
  browser, plays it with simulated keys and mouse for about 30 seconds, tries the F1
  panel, F3 counter and other controls, and fails on any error.

## Next

**Phase 1 - Gunfeel:** the player character, over-the-shoulder camera, aiming with a
laser sight and tightening reticle, the starter pistol (recoil, reload), basic gamepad
support, one zombie with body-part hit reactions (head stagger, leg kneel/trip, arm
drop) and full hit feedback, plus a shooting range with a respawning dummy.

## Known problems / notes
- I can't run `Play Game.bat` myself (my computer runs Linux), so your first
  double-click is its real test. I checked the file line by line and tested the
  setup step it runs.
- My test browser has no graphics card, so it draws only ~1-3 frames per second. Your
  laptop is the real test for speed: press F3 and tell me the number.
- One frame of the scene currently costs about 120 draw calls (scenery is welded
  together for speed), which should be comfortable on a gaming laptop.
