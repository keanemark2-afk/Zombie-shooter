# Dead Acre

An over-the-shoulder zombie arena shooter that plays like the classic survival-horror
action games: tight pistol gunplay, body-part hit reactions, kicks and suplexes,
a trader between waves, and a score-attack mode. No story, just the fighting.

**Status:** Phase 0 of 7 (an empty village arena to fly around). See `PROGRESS.md`.

## How to play (Windows)

1. Double-click **`Play Game.bat`**.
2. The first time, it downloads what the game needs (about a minute).
3. Your browser opens with the game. Keep the black window open while you play.

If Node.js is missing, the launcher tells you exactly what to install.

## Keys (Phase 0)

| Key | Does |
| --- | --- |
| Hold mouse button + move | Look around |
| W A S D | Fly |
| Space / E, Q / C | Fly up, fly down |
| Shift | Fly faster |
| F1 | Tuning panel (change any number live, "Copy values" to share) |
| F3 | FPS counter |
| H | Hide / show the help box |

## For developers

```
npm install        # once
npm run dev        # start the game at http://localhost:5173
npm test           # unit tests
npm run test:smoke # 30-second automated play test in a headless browser
npm run check      # typecheck + all tests
```

All gameplay numbers live in `src/config/tuning.ts`.
