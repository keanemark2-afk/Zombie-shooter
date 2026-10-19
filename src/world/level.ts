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
  /** Where the Trader stands and where a customer stands (if this level has a stall). */
  readonly trader?: { x: number; z: number; yaw: number; customerX: number; customerZ: number };
  /** The player can't walk past this (if set). */
  readonly bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
}
