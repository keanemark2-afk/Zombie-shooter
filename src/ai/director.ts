// How a horde behaves as a group: only a few zombies may attack at once (they
// hold an "attack token"), the rest circle you at a distance and wait for a
// gap, spread out evenly round you so they cut off your escape.

export interface Candidate {
  id: number;
  /** Metres from the player. */
  distance: number;
  /** Is it able to attack right now (on its feet, aware of you)? */
  ready: boolean;
}

/** Hands out a limited number of attack permits, nearest zombie first. */
export class TokenPool {
  private readonly held = new Map<number, number>();
  /** Zombies that dawdled lose their turn for a while, so somebody else gets one. */
  private readonly barred = new Map<number, number>();

  constructor(public max: number) {}

  has(id: number): boolean {
    return this.held.has(id);
  }

  get count(): number {
    return this.held.size;
  }

  get holders(): number[] {
    return [...this.held.keys()];
  }

  /** Called every so often with every zombie in the fight. */
  update(candidates: readonly Candidate[], dt: number, timeout: number): void {
    const byId = new Map(candidates.map((c) => [c.id, c]));
    for (const [id, left] of this.barred) {
      if (left - dt <= 0) this.barred.delete(id);
      else this.barred.set(id, left - dt);
    }
    for (const [id, age] of this.held) {
      const c = byId.get(id);
      const next = age + dt;
      // Lose the token if it can't attack any more, left the fight, or dawdled too long.
      if (!c || !c.ready) this.held.delete(id);
      else if (next > timeout) {
        this.held.delete(id);
        this.barred.set(id, timeout);
      } else this.held.set(id, next);
    }
    // A lowered maximum takes tokens from the zombies that have held them longest.
    if (this.held.size > this.max) {
      const oldest = [...this.held.entries()].sort((a, b) => b[1] - a[1]);
      for (const [id] of oldest) {
        if (this.held.size <= this.max) break;
        this.held.delete(id);
      }
    }
    if (this.held.size >= this.max) return;
    const waiting = candidates.filter((c) => c.ready && !this.held.has(c.id) && !this.barred.has(c.id)).sort((a, b) => a.distance - b.distance);
    for (const c of waiting) {
      if (this.held.size >= this.max) break;
      this.held.set(c.id, 0);
    }
  }

  /** Gives the permit back (the attack is over). */
  release(id: number): void {
    this.held.delete(id);
  }

  clear(): void {
    this.held.clear();
    this.barred.clear();
  }
}

const TAU = Math.PI * 2;

function wrap(a: number): number {
  let d = a % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/**
 * Spreads `angles` (where each zombie is round the player, in radians) into
 * evenly spaced places on the circle. Zombies keep their order round the
 * circle (so they never cross paths) and move as little as possible. If
 * `preferred` is given (the way the player is heading), one place is lined up
 * with it so somebody is always cutting off the escape.
 */
export function assignSurroundAngles(angles: readonly number[], preferred: number | null = null): number[] {
  const n = angles.length;
  if (n === 0) return [];
  const order = angles.map((_, i) => i).sort((a, b) => wrap(angles[a]) - wrap(angles[b]));
  const step = TAU / n;
  // The circular mean of how far each is from its even place.
  let sx = 0;
  let sz = 0;
  order.forEach((idx, k) => {
    const off = angles[idx] - k * step;
    sx += Math.cos(off);
    sz += Math.sin(off);
  });
  let base = Math.atan2(sz, sx);
  if (preferred !== null && n > 1) {
    let best = 0;
    for (let k = 0; k < n; k++) if (Math.abs(wrap(preferred - (base + k * step))) < Math.abs(wrap(preferred - (base + best * step)))) best = k;
    base += wrap(preferred - (base + best * step)) * 0.7;
  }
  const result = new Array<number>(n);
  order.forEach((idx, k) => {
    result[idx] = wrap(base + k * step);
  });
  return result;
}
