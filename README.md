# Dead Acre

An over-the-shoulder zombie arena shooter that plays like the classic survival-horror
action games: tight pistol gunplay, body-part hit reactions, kicks and suplexes,
a trader between waves, and a score-attack mode. No story, just the fighting.

**Status:** Fully built and polished through Phase 7 (Score Attack mode, Survival horde mode, shooting range, the Trader & case grid, dynamic difficulty, full settings, remappable controls, procedural Web Audio music, and polish). See `PROGRESS.md`.

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
| Switch weapon | 1-9 / mouse wheel | D-pad left / right | D-pad left / right |
| Attache case / talk to Trader | Tab / E | Create / Cross | View / A |
| Heal (herb or spray) | H | Triangle | Y |
| Kick / suplex / finish (when prompted) | F | Cross | A |
| Throw a grenade / change type | G / B | L1 / D-pad up | LB / D-pad up |
| Knife slash / parry (hold to block) | V | R1 | RB |
| Break free of a grab | Mash F (or V to stab) | Mash Cross (or R1) | Mash A (or RB) |
| Sprint | Hold Shift | Hold Cross | Hold A |
| Quick 180 turn | Hold S + tap Shift | Down + Cross | Down + A |
| Overdrive (Score Attack) | Q | L3 + R3 | LS + RS |
| Menu / pause | Esc | Options | Menu |
| Tuning panel / FPS | F1 / F3 | | |

Crosshair style, colour and size, the laser line, the gunshot sound and the gore level
can be changed in **menu > Settings**.

## For developers

```
npm install        # once
npm run dev        # start the game at http://localhost:5173
npm test           # unit tests
npm run test:smoke # automated play tests in a headless browser (~3 minutes)
npm run check      # typecheck + all tests
```

All gameplay numbers live in `src/config/tuning.ts`. Player preferences (crosshair,
sound choice) live in `src/config/settings.ts`. Recorded sounds are in `public/sounds/`
(rebuilt from the original CC0 downloads by `tools/make_sounds.py`; see `CREDITS.md`).
