// Throwing things: works out the launch velocity that makes a grenade, axe or
// stick of dynamite land where it was aimed, and steps it along its arc.
// Pure maths (no graphics) so it can be unit-tested.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * The velocity to throw from `from` so that the object lands on `to`, thrown
 * at `speed` (metres per second) under gravity. Prefers a high lob when
 * `lob` is true (grenades), a flatter flight otherwise (axes). If the target
 * is out of reach it throws as far as it can in that direction.
 */
export function solveThrow(from: Vec3, to: Vec3, speed: number, lob = true, gravity = 9.8): Vec3 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return { x: 0, y: speed, z: 0 };
  const v2 = speed * speed;
  const disc = v2 * v2 - gravity * (gravity * d * d + 2 * dy * v2);
  let angle: number;
  if (disc < 0) {
    // Out of reach: the angle that goes furthest.
    angle = Math.PI / 4;
  } else {
    const root = Math.sqrt(disc);
    const high = Math.atan2(v2 + root, gravity * d);
    const low = Math.atan2(v2 - root, gravity * d);
    angle = lob ? high : low;
  }
  const horizontal = Math.cos(angle) * speed;
  return { x: (dx / d) * horizontal, y: Math.sin(angle) * speed, z: (dz / d) * horizontal };
}

/** Where a thrown object is after `t` seconds. */
export function positionAt(from: Vec3, velocity: Vec3, t: number, gravity = 9.8): Vec3 {
  return { x: from.x + velocity.x * t, y: from.y + velocity.y * t - 0.5 * gravity * t * t, z: from.z + velocity.z * t };
}

/** How long until it comes back down to height `groundY` (the later of the two times). */
export function flightTime(from: Vec3, velocity: Vec3, groundY: number, gravity = 9.8): number {
  const a = -0.5 * gravity;
  const b = velocity.y;
  const c = from.y - groundY;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return 0;
  const root = Math.sqrt(disc);
  return Math.max((-b + root) / (2 * a), (-b - root) / (2 * a));
}

/** A wooden shield: soaks up shots until it breaks. */
export class ShieldState {
  hp: number;

  constructor(readonly max: number) {
    this.hp = max;
  }

  get broken(): boolean {
    return this.hp <= 0;
  }

  /** Takes a hit. Returns true if this is the hit that broke it. */
  hit(damage: number): boolean {
    if (this.broken) return false;
    this.hp = Math.max(0, this.hp - damage);
    return this.hp <= 0;
  }
}

export type Difficulty = 'easy' | 'normal' | 'hard' | 'pro';

/** What a chainsaw hit does: instant death on the hard settings, a heavy blow otherwise. */
export function chainsawHit(difficulty: Difficulty, normalDamage: number, instantKillFrom: Difficulty | 'never'): { damage: number; instantKill: boolean } {
  const order: Difficulty[] = ['easy', 'normal', 'hard', 'pro'];
  const kills = instantKillFrom !== 'never' && order.indexOf(difficulty) >= order.indexOf(instantKillFrom);
  return { damage: normalDamage, instantKill: kills };
}
