// Hidden dynamic difficulty: monitors accuracy, headshots, damage taken,
// survival time without damage, and deaths, quietly nudging horde pressure,
// enemy aggression, and drop generosity. Pure logic for unit testing.

import { tuning } from '../config/tuning';

export interface DynamicDifficultyStats {
  shots: number;
  hits: number;
  headshots: number;
  damageTaken: number;
  timeSinceLastHit: number;
  deaths: number;
}

export interface DifficultyModifiers {
  rank: number;
  maxAttackers: number;
  runChance: number;
  damageMultiplier: number;
  dropGenerosity: number;
  spawnRateMultiplier: number;
}

export class DynamicDifficulty {
  enabled = true;
  /** Internal rank from 1 (easiest) to 10 (hardest). Default is 5. */
  rank = 5;
  stats: DynamicDifficultyStats = {
    shots: 0,
    hits: 0,
    headshots: 0,
    damageTaken: 0,
    timeSinceLastHit: 0,
    deaths: 0,
  };

  private evaluateTimer = 0;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.rank = tuning.dynamicDifficulty.defaultRank;
    this.enabled = tuning.dynamicDifficulty.enabled;
    this.evaluateTimer = 0;
    this.stats = {
      shots: 0,
      hits: 0,
      headshots: 0,
      damageTaken: 0,
      timeSinceLastHit: 0,
      deaths: 0,
    };
  }

  get accuracy(): number {
    return this.stats.shots > 0 ? this.stats.hits / this.stats.shots : 0.5;
  }

  get headshotRate(): number {
    return this.stats.hits > 0 ? this.stats.headshots / this.stats.hits : 0.2;
  }

  recordShot(hit: boolean, headshot = false): void {
    this.stats.shots++;
    if (hit) {
      this.stats.hits++;
      if (headshot) this.stats.headshots++;
    }
  }

  recordDamage(amount: number): void {
    this.stats.damageTaken += amount;
    this.stats.timeSinceLastHit = 0;
    // Immediate downward nudge on taking large damage
    if (this.enabled && amount >= tuning.dynamicDifficulty.heavyDamageThreshold) {
      this.nudgeRank(-tuning.dynamicDifficulty.damageNudge);
    }
  }

  recordDeath(): void {
    this.stats.deaths++;
    this.stats.timeSinceLastHit = 0;
    if (this.enabled) {
      this.nudgeRank(-tuning.dynamicDifficulty.deathNudge);
    }
  }

  nudgeRank(amount: number): void {
    this.rank = Math.max(tuning.dynamicDifficulty.minRank, Math.min(tuning.dynamicDifficulty.maxRank, this.rank + amount));
  }

  tick(dt: number): void {
    if (!this.enabled) return;

    this.stats.timeSinceLastHit += dt;
    this.evaluateTimer += dt;

    if (this.evaluateTimer >= tuning.dynamicDifficulty.evalInterval) {
      this.evaluateTimer = 0;
      this.evaluate();
    }
  }

  /** Periodically evaluate performance metrics to gently adjust rank. */
  private evaluate(): void {
    let delta = 0;

    // Performing well: high accuracy, high headshot rate, no recent hits
    if (this.stats.timeSinceLastHit >= tuning.dynamicDifficulty.safeTimeThreshold) {
      if (this.accuracy > 0.65) delta += 0.3;
      if (this.headshotRate > 0.35) delta += 0.2;
    }

    // Struggling: low accuracy or taking frequent damage
    if (this.stats.timeSinceLastHit < 8 && this.stats.damageTaken > 40) {
      delta -= 0.4;
    }

    if (delta !== 0) {
      this.nudgeRank(delta);
    }
  }

  /** Returns computed multipliers based on current rank. */
  modifiers(baseAttackers = 3): DifficultyModifiers {
    if (!this.enabled) {
      return {
        rank: this.rank,
        maxAttackers: baseAttackers,
        runChance: tuning.zombie.runChance,
        damageMultiplier: 1.0,
        dropGenerosity: 1.0,
        spawnRateMultiplier: 1.0,
      };
    }

    // Scale between min and max rank: rank 5 is neutral (1.0x)
    const rankDelta = (this.rank - 5) / 5; // -0.8 at rank 1, 0 at rank 5, +1.0 at rank 10

    // Token attackers: 2 when low, baseAttackers when mid, +1 when high
    let maxAttackers = baseAttackers;
    if (this.rank <= 3) maxAttackers = Math.max(1, baseAttackers - 1);
    else if (this.rank >= 8) maxAttackers = baseAttackers + 1;

    const norm = (this.rank - 1) / 9; // 0 (easiest) to 1 (hardest)
    const runChance = 0.1 + norm * 0.35;
    const damageMultiplier = 1.0 + rankDelta * 0.3; // 0.76x to 1.30x (1.00x at rank 5)
    const dropGenerosity = 1.0 - rankDelta * 0.25; // 1.20x to 0.75x (1.00x at rank 5)
    const spawnRateMultiplier = 1.0 + rankDelta * 0.2; // 0.84x to 1.20x (1.00x at rank 5)

    return {
      rank: Math.round(this.rank * 10) / 10,
      maxAttackers,
      runChance,
      damageMultiplier,
      dropGenerosity,
      spawnRateMultiplier,
    };
  }
}
