# Dead Acre

An over-the-shoulder zombie arena shooter that plays like the classic survival-horror
action games: tight pistol gunplay, body-part hit reactions, kicks and suplexes,
a trader between waves, and a score-attack mode. No story, just the fighting.

**Status:** Phase 1 of 7 (gunfeel: the pistol, one zombie type, a shooting range). See `PROGRESS.md`.

## How to play (Windows)

1. Double-click **`Play Game.bat`**.
2. The first time, it downloads what the game needs (about a minute).
3. Your browser opens with the game. Keep the black window open while you play.

If Node.js is missing, the launcher tells you exactly what to install.

## Controls

| | Keyboard & mouse | PlayStation | Xbox |
| --- | --- | --- | --- |
| Move / look | W A S D / mouse | Left / right stick | Left / right stick |
| Aim (laser sight) | Hold right mouse | Hold L2 | Hold LT |
| Shoot (while aiming) | Left mouse | R2 | RT |
| Reload | R | Square | X |
| Sprint | Hold Shift | Hold Cross | Hold A |
| Quick 180 turn | Hold S + tap Shift | Down + Cross | Down + A |
| Menu / pause | Esc | Options | Menu |
| Tuning panel / FPS | F1 / F3 | | |

## For developers

```
npm install        # once
npm run dev        # start the game at http://localhost:5173
npm test           # unit tests
npm run test:smoke # automated play tests in a headless browser (~3 minutes)
npm run check      # typecheck + all tests
```

All gameplay numbers live in `src/config/tuning.ts`.
