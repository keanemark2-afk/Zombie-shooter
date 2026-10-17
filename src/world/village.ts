import { Group } from 'three';
import type { Level, SpawnPoint } from './level';
import { PropBuilder } from './props';
import { batchStaticMeshes } from './staticBatch';
import { SQUARE_HALF_SIZE } from './terrain';

/** Openings in the square's fence where the roads (and zombies) come through. */
export const GATES = [
  { name: 'north', x: 0, z: -SQUARE_HALF_SIZE, width: 5 },
  { name: 'south', x: 0, z: SQUARE_HALF_SIZE, width: 5 },
  { name: 'east', x: SQUARE_HALF_SIZE, z: 5, width: 4 },
  { name: 'west', x: -SQUARE_HALF_SIZE, z: -5, width: 4 },
];

/** The village square at dusk. */
export function buildVillage(): Level {
  const root = new Group();
  root.name = 'village';
  const p = new PropBuilder(1234);
  const r = root;
  const H = SQUARE_HALF_SIZE;

  // Fence around the square, leaving the four gates open.
  for (const side of [-1, 1]) {
    p.fence(r, -H, side * H, -2.5, side * H);
    p.fence(r, 2.5, side * H, H, side * H);
  }
  p.fence(r, H, -H, H, 3);
  p.fence(r, H, 7, H, H);
  p.fence(r, -H, -H, -H, -7);
  p.fence(r, -H, -3, -H, H);

  // Houses looking onto the square from outside the fence.
  p.house(r, -12, -30, 8, 6, 5, 0, [true, false, false, true], true);
  p.house(r, 13, -31.5, 7, 6, 4.6, 0, [false, false, true, false], false);
  p.house(r, 32, -4, 10, 7, 5.4, -Math.PI / 2, [false, true, false, false], true);
  p.house(r, -31, 11, 7, 6, 4.8, Math.PI / 2, [true, false, false, false], true);
  p.house(r, 7, 32, 8, 6, 5, Math.PI, [false, false, true, false], false);
  p.house(r, -14, 31, 6.5, 5.5, 4.4, Math.PI, [false, false, false, false], false);

  // Inside the square.
  p.well(r, 0, 0);
  p.watchtower(r, -16, -15.5, 0.12);
  p.shed(r, -17.5, 9, 4, 3, 2.6, 0.08);
  p.shed(r, 16.5, 15.5, 3.6, 3, 2.5, Math.PI - 0.15);
  p.shed(r, 16.8, -15.5, 4.2, 3.4, 2.7, -Math.PI / 2 + 0.05, true);
  p.cart(r, 6, 6.5, 0.6);

  p.hayStack(r, -13.2, 12.6, 0.3, [[0, 0, 0], [1.2, 0, 0], [0.6, 1, 0], [0, 0, 0.62]]);
  p.roundBale(r, 10, -7, 0.4);
  p.roundBale(r, 11.4, -5.4, 1.2);
  p.hayStack(r, -6.5, 15.5, -0.2, [[0, 0, 0], [1.2, 0, 0]]);

  p.crate(r, 12.6, 0, 16.2, 1, 0.1);
  p.crate(r, 13.7, 0, 16.0, 0.9, -0.2);
  p.crate(r, 13.1, 1, 16.1, 0.8, 0.5);
  p.crate(r, -12.5, 0, -17.6, 1, 0.3);
  p.crate(r, -11.4, 0, -17.9, 1, 0.05);
  p.crate(r, 19.2, 0, 1.2, 1.1, 0.2);
  p.crate(r, -19.6, 0, -4.2, 0.9, -0.4);
  p.crate(r, 4.2, 0, -12.4, 1, 0.7);
  p.crate(r, 4.3, 1, -12.4, 0.7, 0.2);
  p.crate(r, -8, 0, 4.8, 0.85, 0.9);

  p.barrel(r, 11.3, 15.2);
  p.barrel(r, -11.9, 14.3);
  p.barrel(r, 14.6, -12.4);
  p.barrel(r, -11.4, -15.3);
  p.barrel(r, 19.3, 3.3);
  p.barrel(r, -19.1, -1.9);
  p.barrel(r, 3.0, -13.4);
  p.barrel(r, -7.2, 5.8);

  p.lanternPost(r, -5, 8.5, 0.4);
  p.lanternPost(r, 8.6, -8.6, 2.2);
  p.lanternPost(r, -9, -4, -0.8);
  p.lanternPost(r, 4, 19.5, -1.7);

  batchStaticMeshes(root);

  // Zombies walk in through the gates from a few metres outside.
  const enemySpawns: SpawnPoint[] = GATES.map((g) => {
    const out = 5;
    const nx = Math.sign(g.x);
    const nz = Math.sign(g.z);
    return { x: g.x + nx * out, z: g.z + nz * out, yaw: Math.atan2(nx, nz) };
  });

  return {
    id: 'village',
    root,
    colliders: p.colliders,
    lamps: p.lamps,
    playerSpawn: { x: 0, z: 12, yaw: 0 },
    enemySpawns,
  };
}
