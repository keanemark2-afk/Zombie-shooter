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
| `pistol-1/2.ogg`, `pump-1/2.ogg`, `drum-1/2.ogg`, `revolver-1/2.ogg` | Gunshots (close and distant microphones mixed together) | [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library) (freefirearmsfx.com, "Prepared SFX Library") | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney | CC0 |
| `pump-rack.ogg`, `shell-in.ogg` | Shotgun pump and loading a shell | [Shotgun Reload Sound effects](https://opengameart.org/content/shotgun-reload-sound-effects) | zer0_sol | CC0 |

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
