// The rules for close combat: which kick or stab a stunned zombie is open to,
// parry timing, knife wear, breaking free of a grab, and how a blast fades
// with distance. Kept free of graphics so the rules can be unit-tested.

export type MeleeMove = 'roundhouse' | 'frontKick' | 'suplex' | 'finisher';

/** What a zombie is open to: staggered by a headshot, down on one knee, or lying on the ground. */
export type Openness = 'head' | 'kneel' | 'down' | null;

/** On-screen word for each move. */
export const MELEE_NAMES: Record<MeleeMove, string> = {
  roundhouse: 'Kick',
  frontKick: 'Kick',
  suplex: 'Suplex',
  finisher: 'Finish',
};

/**
 * The follow-up for a stunned zombie. A kneeling zombie with its back to you
 * gets suplexed; from the front it gets kicked.
 */
export function meleeMoveFor(openTo: Openness, facingAway: boolean): MeleeMove | null {
  switch (openTo) {
    case 'head':
      return 'roundhouse';
    case 'kneel':
      return facingAway ? 'suplex' : 'frontKick';
    case 'down':
      return 'finisher';
    default:
      return null;
  }
}

export interface MeleeCandidate {
  openTo: Openness;
  /** Metres from the player. */
  distance: number;
  /** Degrees between where the player is looking and the zombie. */
  angleOff: number;
  /** The zombie has its back to the player. */
  facingAway: boolean;
}

/** The nearest zombie open to a melee follow-up, within reach and roughly in view. */
export function pickMeleeTarget<T extends MeleeCandidate>(candidates: readonly T[], range: number, maxAngle: number): { target: T; move: MeleeMove } | null {
  let best: { target: T; move: MeleeMove } | null = null;
  for (const c of candidates) {
    const move = meleeMoveFor(c.openTo, c.facingAway);
    if (!move || c.distance > range || Math.abs(c.angleOff) > maxAngle) continue;
    if (!best || c.distance < best.target.distance) best = { target: c, move };
  }
  return best;
}

export type ParryResult = 'perfect' | 'parry' | 'none';

export interface ParryRules {
  parryWindow: number;
  perfectParryWindow: number;
}

/**
 * Was a zombie's hit parried? `sincePress` is how long ago the knife button
 * was pressed (null if not recently). Holding the button blocks too. A broken
 * knife can't parry at all.
 */
export function judgeParry(sincePress: number | null, guardHeld: boolean, durability: number, rules: ParryRules): ParryResult {
  if (durability <= 0) return 'none';
  if (sincePress !== null && sincePress >= 0 && sincePress <= rules.perfectParryWindow) return 'perfect';
  if (sincePress !== null && sincePress >= 0 && sincePress <= rules.parryWindow) return 'parry';
  return guardHeld ? 'parry' : 'none';
}

/** The knife's condition. Parries and finishers wear it down; a broken knife can't parry. */
export class Knife {
  durability: number;

  constructor(private max: number) {
    this.durability = max;
  }

  get broken(): boolean {
    return this.durability <= 0;
  }

  /** 0 (broken) .. 1 (like new). */
  get condition(): number {
    return this.max > 0 ? Math.max(0, Math.min(1, this.durability / this.max)) : 0;
  }

  wear(cost: number, unbreakable = false): void {
    if (unbreakable) return;
    this.durability = Math.max(0, this.durability - cost);
  }

  repair(max = this.max): void {
    this.max = max;
    this.durability = max;
  }
}

export interface GrabRules {
  mashPerPress: number;
  wigglePerFlick: number;
  drain: number;
  biteTime: number;
}

/** Struggling in a zombie's grip: mash to fill the bar before it bites. */
export class GrabStruggle {
  progress = 0;
  time = 0;

  constructor(private readonly rules: GrabRules) {}

  mash(): void {
    this.progress += this.rules.mashPerPress;
  }

  wiggle(): void {
    this.progress += this.rules.wigglePerFlick;
  }

  /** Advance time: "free" once the bar is full, "bitten" if time runs out first. */
  tick(dt: number): 'struggling' | 'free' | 'bitten' {
    if (this.progress >= 1) return 'free';
    this.time += dt;
    this.progress = Math.max(0, this.progress - this.rules.drain * dt);
    if (this.time >= this.rules.biteTime) return 'bitten';
    return 'struggling';
  }

  /** 0..1 time left before the bite. */
  get timeLeft(): number {
    return Math.max(0, 1 - this.time / Math.max(0.01, this.rules.biteTime));
  }
}

/** How much of a blast reaches `distance` metres from its centre: 1 at the centre, 0 at the edge. */
export function blastFalloff(distance: number, radius: number): number {
  if (radius <= 0 || distance >= radius) return 0;
  const k = 1 - Math.max(0, distance) / radius;
  return k * k * (3 - 2 * k);
}
