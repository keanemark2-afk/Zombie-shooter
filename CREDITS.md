# Credits

## Art, sound and music
All shapes, textures (dirt, planks, stone, plaster, shingles, straw, barrel paint,
clothing), the characters, the sky and the lighting are original and made in code.
Impacts, footsteps, zombie voices and the "Old generated sound" gunshot option are
synthesised live by the game with the Web Audio API.

### Recorded sounds (`public/sounds/`)
Real recordings, all released as **CC0** (public domain: free to use, no credit
required, credited here anyway). Each file was cut, trimmed, layered and faded by
`tools/make_sounds.py`, and the game adds its own EQ, echo and pitch variation.

| Files | What | Source | Creators | License |
| --- | --- | --- | --- | --- |
| `pistol-1/2.ogg`, `pump-1/2.ogg`, `drum-1/2.ogg`, `revolver-1/2.ogg`, `smg-1/2/3.ogg`, `rifle-1/2/3.ogg`, `magnum-1/2.ogg`, `swift-1/2.ogg` | Gunshots (close and distant microphones mixed together; the revolver shot is layered with a rifle's echo) | [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library) (freefirearmsfx.com, "Prepared SFX Library") | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney | CC0 |
| `pump-rack.ogg`, `shell-in.ogg` | Shotgun pump and loading a shell | [Shotgun Reload Sound effects](https://opengameart.org/content/shotgun-reload-sound-effects) | zer0_sol | CC0 |
| `explosion-1.ogg` | Rocket and barrel explosions | [Chunky Explosion](https://opengameart.org/content/chunky-explosion) | Joth | CC0 |
| `explosion-2.ogg` | Smaller explosion | [Dull explosion](https://opengameart.org/content/dull-explosion) | qubodup | CC0 |
| `splat-a-1/2.ogg`, `splat-b-1/2.ogg` | Wet squelches for bursting heads, torn limbs and the knife | [2 wooden squish splatter sequences](https://opengameart.org/content/2-wooden-squish-splatter-sequences) | Independent.nu (submitted by qubodup) | CC0 |

No outside images, models or music are used yet. When they are added (Phase 7),
each one will be listed here with its creator, where it came from and its license.

## Software the game is built with
| Tool | What it does | License |
| --- | --- | --- |
| [Three.js](https://threejs.org) | 3D graphics | MIT |
| [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) | Fast bullet and camera ray tests | MIT |
| [lil-gui](https://lil-gui.georgealways.com) | F1 tuning panel | MIT |
| [Vite](https://vite.dev) | Runs and bundles the game | MIT |
| [TypeScript](https://www.typescriptlang.org) | Programming language | Apache-2.0 |
| [Vitest](https://vitest.dev) | Unit tests | MIT |
| [Playwright](https://playwright.dev) | Automated browser test | Apache-2.0 |
