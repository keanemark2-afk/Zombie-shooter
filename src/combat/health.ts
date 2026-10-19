// Your health, and what the healing herbs do. Kept free of graphics so the
// rules can be unit-tested.

export type Herb = 'G' | 'R' | 'Y';

export interface HerbEffect {
  /** Health restored, or 'full'. */
  heal: number | 'full';
  /** Permanent extra maximum health. */
  raiseMax: number;
}

/**
 * What each mixture does (the letters are the herbs in it, in a fixed order).
 * A lone red or yellow herb does nothing on its own: it has to be mixed.
 */
export const HERB_EFFECTS: Record<string, HerbEffect> = {
  G: { heal: 30, raiseMax: 0 },
  GG: { heal: 60, raiseMax: 0 },
  GGG: { heal: 100, raiseMax: 0 },
  GR: { heal: 'full', raiseMax: 0 },
  GGR: { heal: 'full', raiseMax: 0 },
  GY: { heal: 40, raiseMax: 10 },
  GGY: { heal: 70, raiseMax: 10 },
  GRY: { heal: 'full', raiseMax: 15 },
  RY: { heal: 0, raiseMax: 8 },
};

/** Herb letters in a fixed order, so the same mix always has the same name. */
export function herbKey(herbs: readonly string[]): string {
  return [...herbs].sort((a, b) => 'GRY'.indexOf(a) - 'GRY'.indexOf(b)).join('');
}

/** The mixture made by combining two items (null if they don't go together). */
export function mixHerbs(a: string, b: string): string | null {
  const key = herbKey((a + b).split(''));
  return key in HERB_EFFECTS && key.length > Math.max(a.length, b.length) ? key : null;
}

export function herbEffect(key: string): HerbEffect | null {
  const e = HERB_EFFECTS[key];
  return e && (e.heal !== 0 || e.raiseMax > 0) ? e : null;
}

export class PlayerHealth {
  current: number;
  /** Seconds of protection left after a hit. */
  grace = 0;

  constructor(public max: number) {
    this.current = max;
  }

  get fraction(): number {
    return this.max > 0 ? Math.max(0, Math.min(1, this.current / this.max)) : 0;
  }

  get dead(): boolean {
    return this.current <= 0;
  }

  /** Below this fraction the player is "in danger" (heartbeat, red pulse). */
  inDanger(level: number): boolean {
    return !this.dead && this.fraction < level;
  }

  /** Takes a hit. Returns the damage actually done (0 while protected or already dead). */
  damage(amount: number, graceTime = 0): number {
    if (this.dead || this.grace > 0 || amount <= 0) return 0;
    const done = Math.min(this.current, amount);
    this.current -= done;
    if (graceTime > 0) this.grace = graceTime;
    return done;
  }

  /** Instant death (the chainsaw), ignoring protection. */
  kill(): void {
    this.current = 0;
  }

  heal(amount: number): void {
    if (this.dead) return;
    this.current = Math.min(this.max, this.current + amount);
  }

  healFull(): void {
    this.heal(this.max);
  }

  raiseMax(by: number): void {
    this.max += by;
    this.current += by;
  }

  /** Applies a herb mixture. Returns false if it would do nothing. */
  apply(effect: HerbEffect): boolean {
    if (this.dead) return false;
    const heals = effect.heal === 'full' || effect.heal > 0;
    if (!heals && effect.raiseMax <= 0) return false;
    if (effect.raiseMax > 0) this.raiseMax(effect.raiseMax);
    if (effect.heal === 'full') this.healFull();
    else this.heal(effect.heal);
    return true;
  }

  tick(dt: number): void {
    this.grace = Math.max(0, this.grace - dt);
  }

  reset(max: number): void {
    this.max = max;
    this.current = max;
    this.grace = 0;
  }
}
