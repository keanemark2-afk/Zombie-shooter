import type { Group } from 'three';
import type { Collider } from './colliders';
import type { Lamp } from './props';

export type LevelId = 'village' | 'range';

export interface SpawnPoint {
  x: number;
  z: number;
  /** Facing angle (radians). 0 faces north (-z), PI faces south (+z). */
  yaw: number;
}

/** One playable area. Only one level is visible at a time; terrain and sky are shared. */
export interface Level {
  readonly id: LevelId;
  readonly root: Group;
  readonly colliders: Collider[];
  readonly lamps: Lamp[];
  readonly playerSpawn: SpawnPoint;
  /** Where enemies appear. */
  readonly enemySpawns: SpawnPoint[];
}
