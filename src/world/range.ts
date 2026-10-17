import { Group, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import type { Level } from './level';
import { PropBuilder } from './props';
import { batchStaticMeshes } from './staticBatch';

/** Where the shooter stands on the range (z), looking south (+z) down the lane. */
export const RANGE_LINE_Z = -18;
/** Distance markers along the lane, in metres from the shooting line. */
export const RANGE_MARKERS = [5, 10, 15, 20, 30, 40];

/** Distance from the shooting line -> world z position down the lane. */
export function rangeZ(distance: number): number {
  return RANGE_LINE_Z + distance;
}

/** A walled shooting lane in the square, for testing guns on a respawning dummy zombie. */
export function buildRange(): Level {
  const root = new Group();
  root.name = 'range';
  const p = new PropBuilder(4321);
  const half = 7;
  const back = rangeZ(43);

  // Side walls and a hay-bale backstop.
  p.plankWall(root, -half, RANGE_LINE_Z - 4, -half, back, 1.6);
  p.plankWall(root, half, RANGE_LINE_Z - 4, half, back, 1.6);
  p.plankWall(root, -half, RANGE_LINE_Z - 4, half, RANGE_LINE_Z - 4, 1.6);
  const bales: Array<[number, number, number]> = [];
  for (let level = 0; level < 4; level++) {
    for (let x = -6; x <= 6; x += 1.2) bales.push([x + (level % 2) * 0.6 - 0.3, level, 0]);
  }
  p.hayStack(root, 0, back + 0.4, 0, bales);
  p.plankWall(root, -half, back + 1.2, half, back + 1.2, 2.6);

  // Distance signs on the left wall, facing the shooter.
  for (const d of RANGE_MARKERS) {
    p.sign(root, -half + 0.7, rangeZ(d), Math.PI, `${d} m`);
  }

  // A painted shooting line on the ground.
  const lineMat = new MeshStandardMaterial({ color: '#8a8270', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  lineMat.userData.surface = 'dirt';
  const line = new Mesh(new PlaneGeometry(2 * half - 0.4, 0.12), lineMat);
  line.rotation.x = -Math.PI / 2;
  line.position.set(0, 0.01, RANGE_LINE_Z + 0.6);
  line.receiveShadow = true;
  root.add(line);

  p.table(root, 3.8, RANGE_LINE_Z - 2, 0.1);
  p.crate(root, -4.8, 0, RANGE_LINE_Z - 2.6, 0.9, 0.3);
  p.barrel(root, -5.8, RANGE_LINE_Z - 1.8);
  // Lanterns lean out over the lane from the walls.
  p.lanternPost(root, -half + 0.5, RANGE_LINE_Z - 1, 0);
  p.lanternPost(root, half - 0.5, rangeZ(14), Math.PI);
  p.lanternPost(root, -half + 0.5, rangeZ(28), 0);

  batchStaticMeshes(root);

  return {
    id: 'range',
    root,
    colliders: p.colliders,
    lamps: p.lamps,
    playerSpawn: { x: 0, z: RANGE_LINE_Z, yaw: Math.PI },
    enemySpawns: [{ x: 0, z: rangeZ(12), yaw: 0 }],
  };
}
