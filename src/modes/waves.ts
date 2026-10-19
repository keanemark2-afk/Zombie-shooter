import { tuning } from '../config/tuning';
import { ELITE_KINDS, type EnemyKind } from '../enemies/kinds';

// Which zombies come in each wave, and when. Pure logic (no graphics) so it
// can be unit-tested.

export interface WavePlan {
  wave: number;
  /** Everything that will come, in no particular order. */
  counts: Partial<Record<EnemyKind, number>>;
  total: number;
  /** Most that may be alive at once. */
  maxAlive: number;
  /** Seconds between arrivals. */
  interval: number;
}

/** The first wave each kind can appear in, and how common it is once it has. */
const MIX: Array<{ kind: EnemyKind; from: number; weight: number }> = [
  { kind: 'shambler', from: 1, weight: 1 },
  { kind: 'armed', from: 2, weight: 0.35 },
  { kind: 'runner', from: 3, weight: 0.28 },
  { kind: 'shield', from: 5, weight: 0.16 },
  { kind: 'dynamite', from: 6, weight: 0.14 },
];

/** Works out a wave. `allowed` limits which kinds may appear (and `scale` bends the size, for difficulty). */
export function planWave(wave: number, allowed: readonly EnemyKind[] | null = null, scale = 1): WavePlan {
  const w = tuning.waves;
  const total = Math.max(1, Math.round((w.firstWaveSize + (wave - 1) * w.growthPerWave) * scale));
  const mix = MIX.filter((m) => wave >= m.from && (!allowed || allowed.includes(m.kind)));
  // The plain zombie is always common; newer kinds grow in over a couple of waves.
  const weights = mix.map((m) => m.weight * Math.min(1, (wave - m.from + 1) / 2));
  const sum = weights.reduce((a, b) => a + b, 0);
  const counts: Partial<Record<EnemyKind, number>> = {};
  // Largest-remainder rounding, so the counts always add up to the total.
  const exact = weights.map((x) => (x / sum) * total);
  const floors = exact.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((_, i) => i).sort((a, b) => exact[b] - floors[b] - (exact[a] - floors[a]));
  for (const i of order) {
    if (left <= 0) break;
    floors[i]++;
    left--;
  }
  mix.forEach((m, i) => {
    if (floors[i] > 0) counts[m.kind] = floors[i];
  });
  return {
    wave,
    counts,
    total,
    maxAlive: Math.min(w.maxAliveCap, Math.max(1, Math.round(w.maxAliveStart + (wave - 1) * w.maxAliveGrowth))),
    interval: Math.max(w.minSpawnInterval, w.spawnInterval - (wave - 1) * w.spawnSpeedUp),
  };
}

export type WaveState = 'idle' | 'countdown' | 'active' | 'intermission';

export interface WaveUpdate {
  /** Kinds that should walk in right now. */
  spawn: EnemyKind[];
  /** The wave has just been cleared. */
  cleared: boolean;
  /** The wave has just begun. */
  started: boolean;
}

/** Runs a wave: counts down, lets zombies in a few at a time, notices when it is cleared. */
export class WaveDirector {
  wave = 0;
  state: WaveState = 'idle';
  plan: WavePlan | null = null;
  /** Seconds left of the countdown or the break. */
  timer = 0;
  private queue: EnemyKind[] = [];
  private spawnTimer = 0;

  constructor(
    private readonly random: () => number = Math.random,
    private readonly allowed: readonly EnemyKind[] | null = null,
    /** Bends the size of every wave (difficulty). */
    public scale = 1,
  ) {}

  /** How many are still to come, plus how many are alive (for the "zombies left" counter). */
  remaining(alive: number): number {
    return this.queue.length + alive;
  }

  /** Begins the countdown to wave `n`. */
  begin(n: number, delay: number): void {
    this.wave = n;
    this.plan = planWave(n, this.allowed, this.scale);
    this.state = 'countdown';
    this.timer = delay;
  }

  /** Ends the break early (the player pressed Ready). */
  skipBreak(): void {
    if (this.state === 'intermission') this.timer = 0;
  }

  update(dt: number, alive: number): WaveUpdate {
    const result: WaveUpdate = { spawn: [], cleared: false, started: false };
    switch (this.state) {
      case 'idle':
        break;
      case 'countdown':
        this.timer -= dt;
        if (this.timer <= 0) this.start(result);
        break;
      case 'active': {
        this.spawnTimer -= dt;
        const plan = this.plan!;
        let aliveNow = alive;
        while (this.queue.length > 0 && aliveNow < plan.maxAlive && this.spawnTimer <= 0) {
          result.spawn.push(this.queue.shift()!);
          aliveNow++;
          this.spawnTimer += plan.interval;
        }
        if (this.queue.length === 0 && aliveNow === 0 && result.spawn.length === 0) {
          this.state = 'intermission';
          this.timer = tuning.waves.breakTime;
          result.cleared = true;
        }
        break;
      }
      case 'intermission':
        this.timer -= dt;
        if (this.timer <= 0) this.begin(this.wave + 1, 3);
        break;
    }
    return result;
  }

  private start(result: WaveUpdate): void {
    const plan = this.plan!;
    this.queue = [];
    for (const [kind, n] of Object.entries(plan.counts) as Array<[EnemyKind, number]>) for (let i = 0; i < n; i++) this.queue.push(kind);
    // Shuffle (so the strong ones are spread through the wave).
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.state = 'active';
    this.spawnTimer = 0;
    result.started = true;
  }
}

/** Which elite comes next, and whether one is due, after `kills` kills. */
export class EliteSchedule {
  private next: number;
  private index = 0;

  constructor(private readonly every: () => number = () => tuning.waves.eliteEveryKills) {
    this.next = every();
  }

  /** Returns an elite kind when the kill count has passed the next threshold. */
  check(kills: number): EnemyKind | null {
    if (kills < this.next) return null;
    this.next += this.every();
    return ELITE_KINDS[this.index++ % ELITE_KINDS.length];
  }

  reset(): void {
    this.next = this.every();
    this.index = 0;
  }
}
