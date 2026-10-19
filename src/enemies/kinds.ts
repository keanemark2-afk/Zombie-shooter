import { tuning } from '../config/tuning';

// The different kinds of enemy. Their numbers live in tuning.enemyTypes.

export type EnemyKind = 'shambler' | 'armed' | 'runner' | 'shield' | 'dynamite' | 'brute' | 'chainsaw';

export const ENEMY_KINDS: readonly EnemyKind[] = ['shambler', 'armed', 'runner', 'shield', 'dynamite', 'brute', 'chainsaw'];

/** Elites arrive at kill thresholds, with a warning sound. */
export const ELITE_KINDS: readonly EnemyKind[] = ['brute', 'chainsaw'];

export function isElite(kind: EnemyKind): boolean {
  return kind === 'brute' || kind === 'chainsaw';
}

export const KIND_NAMES: Record<EnemyKind, string> = {
  shambler: 'Shambler',
  armed: 'Harvester',
  runner: 'Sprinter',
  shield: 'Plank-bearer',
  dynamite: 'Fuse-man',
  brute: 'Hulk',
  chainsaw: 'Sawyer',
};

export type KindStats = (typeof tuning.enemyTypes)['shambler'];

export function kindStats(kind: EnemyKind): KindStats {
  return tuning.enemyTypes[kind];
}
