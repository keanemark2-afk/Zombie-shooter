// Score Attack mode rules: timer, kill combos, time bonuses, overdrive,
// score rank calculations and local high scores. Pure logic for unit testing.

import { tuning } from '../config/tuning';

export type ScoreRank = 'S++' | 'S+' | 'S' | 'A' | 'B' | 'C';

export interface ScoreAttackState {
  timeRemaining: number;
  score: number;
  kills: number;
  combo: number;
  comboTimer: number;
  maxCombo: number;
  overdriveGauge: number;
  overdriveTimer: number;
  ended: boolean;
  endReason: 'time' | 'kills' | 'death' | null;
}

export interface KillEvent {
  zone: string;
  isMelee: boolean;
  meleeType?: 'frontKick' | 'roundhouse' | 'suplex' | 'knife' | 'finisher';
  isElite: boolean;
  isExplosion: boolean;
  isHeadshot: boolean;
}

export interface ScoreResult {
  finalScore: number;
  baseScore: number;
  timeBonusScore: number;
  kills: number;
  maxCombo: number;
  leftoverTime: number;
  rank: ScoreRank;
  isNewRecord: boolean;
  endReason: 'time' | 'kills' | 'death';
}

export const RANK_THRESHOLDS: Array<{ rank: ScoreRank; minScore: number }> = [
  { rank: 'S++', minScore: 1_000_000 },
  { rank: 'S+', minScore: 500_000 },
  { rank: 'S', minScore: 200_000 },
  { rank: 'A', minScore: 100_000 },
  { rank: 'B', minScore: 50_000 },
  { rank: 'C', minScore: 0 },
];

export function calculateRank(score: number): ScoreRank {
  for (const { rank, minScore } of RANK_THRESHOLDS) {
    if (score >= minScore) return rank;
  }
  return 'C';
}

/** Points awarded for a kill based on the current combo count. */
export function pointsForKill(combo: number, basePoints = 1000): number {
  if (combo <= 1) return basePoints;
  if (combo <= 10) return basePoints + (combo - 1) * 500;
  return basePoints + 9 * 500 + (combo - 10) * 1000;
}

/** Time bonus awarded for a kill, doubled if in overdrive. */
export function timeBonusForKill(event: KillEvent, inOverdrive = false): number {
  let bonus = 0;
  if (event.isElite) {
    bonus = tuning.scoreAttack.eliteTimeBonus;
  } else if (event.meleeType === 'suplex') {
    bonus = tuning.scoreAttack.suplexTimeBonus;
  } else if (event.isHeadshot || event.isMelee) {
    bonus = tuning.scoreAttack.headshotTimeBonus;
  } else if (event.isExplosion) {
    bonus = tuning.scoreAttack.barrelTimeBonus;
  }
  return inOverdrive ? bonus * 2 : bonus;
}

const HIGH_SCORE_KEY = 'deadAcre.highScores';

export interface HighScoreEntry {
  score: number;
  rank: ScoreRank;
  kills: number;
  date: string;
}

export function loadHighScores(): Record<string, HighScoreEntry> {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveHighScore(map: string, score: number, rank: ScoreRank, kills: number): boolean {
  try {
    const all = loadHighScores();
    const existing = all[map];
    if (!existing || score > existing.score) {
      all[map] = { score, rank, kills, date: new Date().toISOString() };
      localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify(all));
      return true;
    }
  } catch {
    // localStorage unavailable or private browsing
  }
  return false;
}

export class ScoreAttackDirector {
  state: ScoreAttackState;

  constructor() {
    this.state = this.createInitialState();
  }

  createInitialState(): ScoreAttackState {
    return {
      timeRemaining: tuning.scoreAttack.startTime,
      score: 0,
      kills: 0,
      combo: 0,
      comboTimer: 0,
      maxCombo: 0,
      overdriveGauge: 0,
      overdriveTimer: 0,
      ended: false,
      endReason: null,
    };
  }

  reset(): void {
    this.state = this.createInitialState();
  }

  get inOverdrive(): boolean {
    return this.state.overdriveTimer > 0;
  }

  /** Advance clock, combo timer and overdrive duration. */
  tick(dt: number): void {
    if (this.state.ended) return;

    // Countdown match timer
    this.state.timeRemaining = Math.max(0, this.state.timeRemaining - dt);
    if (this.state.timeRemaining <= 0) {
      this.endRun('time');
      return;
    }

    // Combo timer
    if (this.state.comboTimer > 0) {
      this.state.comboTimer = Math.max(0, this.state.comboTimer - dt);
      if (this.state.comboTimer <= 0) {
        this.state.combo = 0;
      }
    }

    // Overdrive active countdown or passive accumulation
    if (this.state.overdriveTimer > 0) {
      this.state.overdriveTimer = Math.max(0, this.state.overdriveTimer - dt);
    } else {
      // Passive build-up when not active
      this.state.overdriveGauge = Math.min(1, this.state.overdriveGauge + dt * tuning.scoreAttack.overdrivePassiveRate);
    }
  }

  /** Player activated Overdrive (e.g. Q key or L3+R3). */
  activateOverdrive(): boolean {
    if (this.state.ended || this.state.overdriveTimer > 0 || this.state.overdriveGauge < 0.99) {
      return false;
    }
    this.state.overdriveGauge = 0;
    this.state.overdriveTimer = tuning.scoreAttack.overdriveDuration;
    return true;
  }

  /** Add time from collecting a Time Orb (+30s). */
  addTimeOrb(): number {
    if (this.state.ended) return 0;
    const bonus = tuning.scoreAttack.orbTimeBonus;
    this.state.timeRemaining += bonus;
    return bonus;
  }

  /** Add direct time bonus. */
  addTime(seconds: number): void {
    if (this.state.ended) return;
    this.state.timeRemaining += seconds;
  }

  /** Process an enemy kill. Returns the earned points and time added. */
  onKill(event: KillEvent): { points: number; timeBonus: number } {
    if (this.state.ended) return { points: 0, timeBonus: 0 };

    this.state.kills++;
    this.state.combo++;
    this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo);
    this.state.comboTimer = tuning.scoreAttack.comboDuration;

    // Overdrive gauge bonus on kill (if not currently active)
    if (this.state.overdriveTimer <= 0) {
      this.state.overdriveGauge = Math.min(1, this.state.overdriveGauge + tuning.scoreAttack.overdriveKillBonus);
    }

    const points = pointsForKill(this.state.combo, tuning.scoreAttack.baseKillScore);
    this.state.score += points;

    const timeBonus = timeBonusForKill(event, this.inOverdrive);
    this.state.timeRemaining += timeBonus;

    if (this.state.kills >= tuning.scoreAttack.targetKills) {
      this.endRun('kills');
    }

    return { points, timeBonus };
  }

  endRun(reason: 'time' | 'kills' | 'death'): ScoreResult {
    this.state.ended = true;
    this.state.endReason = reason;

    const leftoverSeconds = Math.max(0, this.state.timeRemaining);
    const timeBonusScore = reason === 'death' ? 0 : Math.round(leftoverSeconds * tuning.scoreAttack.leftoverTimePointRate);
    const finalScore = this.state.score + timeBonusScore;
    const rank = calculateRank(finalScore);
    const isNewRecord = saveHighScore('village', finalScore, rank, this.state.kills);

    return {
      finalScore,
      baseScore: this.state.score,
      timeBonusScore,
      kills: this.state.kills,
      maxCombo: this.state.maxCombo,
      leftoverTime: leftoverSeconds,
      rank,
      isNewRecord,
      endReason: reason,
    };
  }
}
