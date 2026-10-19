import type { Vector3 } from 'three';
import type { Collider } from '../world/colliders';
import { tuning } from '../config/tuning';
import { assignSurroundAngles, TokenPool, type Candidate } from './director';
import { NavGrid } from './navGrid';

/** What the horde needs to know about each zombie. */
export interface HordeMember {
  readonly id: number;
  readonly position: Vector3;
  readonly alive: boolean;
  readonly aware: boolean;
  /** On its feet and ready to attack (not stunned, not recovering). */
  readonly canAttack: boolean;
  /** Goes up by one each time it makes an attack. */
  readonly attackCount: number;
  /** Told by someone else that the player is near. */
  alert(delay: number): void;
}

export interface HordeTarget {
  position: Vector3;
  velocity: Vector3;
  alive: boolean;
}

/** The arena is a square of this half-size, plus a margin outside the gates. */
const HALF = 44;

/**
 * The brains of the group: works out the way round obstacles, who is allowed
 * to attack, and where everybody else waits.
 */
export class Horde {
  readonly nav = new NavGrid(-HALF, -HALF, HALF, HALF, 0.5);
  readonly tokens = new TokenPool(tuning.ai.maxAttackers);
  private readonly slots = new Map<number, { x: number; z: number }>();
  private readonly seenAttacks = new Map<number, number>();
  private flowTimer = 0;
  private slotTimer = 0;
  private colliders: readonly Collider[] = [];
  /** Where the zombie that most recently asked for a path is (scratch). */
  private readonly scratch = { x: 0, z: 0 };

  /** Zombies are about this wide, so obstacles are grown by it. */
  static readonly BODY = 0.4;

  setObstacles(colliders: readonly Collider[]): void {
    this.colliders = colliders;
    this.nav.setObstacles(colliders, Horde.BODY);
    this.flowTimer = 0;
  }

  /** Call when something solid goes away (an exploded barrel, a broken crate). */
  refreshObstacles(): void {
    this.nav.setObstacles(this.colliders, Horde.BODY);
    this.flowTimer = 0;
  }

  reset(): void {
    this.tokens.clear();
    this.slots.clear();
    this.seenAttacks.clear();
    this.flowTimer = 0;
    this.slotTimer = 0;
  }

  /** Number of zombies with an attack token right now. */
  get attackers(): number {
    return this.tokens.count;
  }

  hasToken(id: number): boolean {
    return this.tokens.has(id);
  }

  /** The spot a waiting zombie should stand at, or null (it has no place yet). */
  waitingSpot(id: number): { x: number; z: number } | null {
    return this.slots.get(id) ?? null;
  }

  /** Is the way between two points clear of obstacles? */
  lineClear(a: Vector3, b: Vector3): boolean {
    return this.nav.lineClear(a.x, a.z, b.x, b.z);
  }

  /** Where to head from `from` to reach the player round any obstacles. Returns false if there's no way. */
  steer(from: Vector3, out: { x: number; z: number }): boolean {
    return this.nav.steer(from.x, from.z, out);
  }

  /** Tells every unaware zombie near `at` that something is up (a roar, a gunshot). */
  alertAround(members: readonly HordeMember[], at: Vector3, radius: number): void {
    const r2 = radius * radius;
    for (const m of members) {
      if (!m.alive || m.aware) continue;
      const dx = m.position.x - at.x;
      const dz = m.position.z - at.z;
      if (dx * dx + dz * dz <= r2) m.alert(0.2 + Math.random() * 0.7);
    }
  }

  update(dt: number, members: readonly HordeMember[], player: HordeTarget): void {
    this.tokens.max = Math.max(1, Math.round(tuning.ai.maxAttackers));
    this.flowTimer -= dt;
    if (this.flowTimer <= 0) {
      this.flowTimer = 0.2;
      this.nav.flowFrom(player.position.x, player.position.z);
    }
    if (!player.alive) {
      this.tokens.clear();
      this.slots.clear();
      return;
    }

    const fighters = members.filter((m) => m.alive && m.aware);
    // An attacker that has just made its attack gives its turn up.
    for (const m of fighters) {
      const seen = this.seenAttacks.get(m.id) ?? m.attackCount;
      if (m.attackCount > seen) this.tokens.release(m.id);
      this.seenAttacks.set(m.id, m.attackCount);
    }
    const px = player.position.x;
    const pz = player.position.z;
    const candidates: Candidate[] = fighters.map((m) => ({
      id: m.id,
      distance: Math.hypot(m.position.x - px, m.position.z - pz),
      ready: m.canAttack,
    }));
    this.tokens.update(candidates, dt, tuning.ai.tokenTimeout);

    // Everyone not attacking spreads out evenly round the player.
    this.slotTimer -= dt;
    if (this.slotTimer <= 0) {
      this.slotTimer = 0.4;
      const waiting = fighters.filter((m) => !this.tokens.has(m.id));
      const angles = waiting.map((m) => Math.atan2(m.position.z - pz, m.position.x - px));
      const speed = Math.hypot(player.velocity.x, player.velocity.z);
      const heading = speed > 0.8 ? Math.atan2(player.velocity.z, player.velocity.x) : null;
      const targets = assignSurroundAngles(angles, heading);
      const ring = tuning.ai.ringRadius;
      this.slots.clear();
      waiting.forEach((m, i) => {
        // Alternate between two rings so a big crowd doesn't bunch into one line.
        const r = ring + (i % 2) * 0.9 + Math.floor(waiting.length / 9) * 0.6;
        this.slots.set(m.id, { x: px + Math.cos(targets[i]) * r, z: pz + Math.sin(targets[i]) * r });
      });
    }
    void this.scratch;
  }
}
