import type { LevelId } from '../world/level';

/** What you are playing: endless waves, a timed score chase, or the practice range. */
export type GameMode = 'survival' | 'score' | 'range';

export function levelFor(mode: GameMode): LevelId {
  return mode === 'range' ? 'range' : 'village';
}

export const MODE_NAMES: Record<GameMode, string> = {
  survival: 'Survival',
  score: 'Score Attack',
  range: 'Shooting range',
};
