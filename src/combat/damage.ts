// The rules for what a bullet does to a zombie: how much damage, and how the
// zombie reacts depending on where it was hit. Kept free of graphics so the
// rules can be unit-tested.

export type Zone = 'head' | 'torso' | 'armL' | 'armR' | 'legL' | 'legR' | 'parasite' | 'shield';
export type ZoneGroup = 'head' | 'torso' | 'arm' | 'leg' | 'parasite' | 'shield';
/** Arms and legs: the parts that can be torn off. */
export type LimbZone = 'armL' | 'armR' | 'legL' | 'legR';
/** Where on a limb it was hit: the upper part (tears off the whole limb) or the lower part. */
export type LimbSegment = 'upper' | 'lower';

export function isLimb(zone: Zone): zone is LimbZone {
  return zone === 'armL' || zone === 'armR' || zone === 'legL' || zone === 'legR';
}

export function zoneGroup(zone: Zone): ZoneGroup {
  if (zone === 'armL' || zone === 'armR') return 'arm';
  if (zone === 'legL' || zone === 'legR') return 'leg';
  return zone;
}

export type Reaction =
  | 'none' // damage only, no change in behaviour
  | 'torsoFlinch' // small flinch, keeps coming
  | 'knockback' // shoved back a step
  | 'headStagger' // clutches face and stumbles back: open for a kick
  | 'kneel' // drops to one knee
  | 'trip' // was running: falls flat on its face
  | 'armFlinch' // arm knocked back, drops what it was holding
  | 'knockdown' // blown off its feet onto its back (a close shotgun blast)
  | 'legless' // lost a leg: falls and crawls after you
  | 'mutate' // its head is gone and a parasite bursts out of the neck
  | 'death';

export interface WeaponHit {
  damage: number;
  knockback: number;
}

export interface TargetState {
  health: number;
  invincible: boolean;
  running: boolean;
  /** Lying on the ground (tripped or knocked down). */
  downed: boolean;
  holdingWeapon: boolean;
  windingUpThrow: boolean;
  /** Dragging itself along the ground after losing a leg (reacts like a downed zombie). */
  crawling?: boolean;
  /** A big elite: shrugs off everything except headshots and explosions. */
  heavy?: boolean;
  /** Has a parasite where its head was: `health` is then the parasite's. */
  parasite?: boolean;
  /** A head blown off may let a parasite out (not elites, not ones that already have one). */
  canMutate?: boolean;
}

export interface DamageRules {
  damage: { head: number; torso: number; arm: number; leg: number; parasite: number };
  reactions: {
    classicHeadStagger: boolean;
    remakeHeadStaggerChance: number;
    focusStaggerBonus: number;
    legKneelChance: number;
    kneelSpinChance: number;
    knockbackThreshold: number;
    knockdownThreshold: number;
  };
  gore: { headPopDamage: number };
  parasite: { bodyScale: number };
}

export interface HitResult {
  /** The body part that decided the reaction (the head if any pellet hit it). */
  zone: Zone;
  /** Every body part that was hit by this shot. */
  zones: Zone[];
  /** How many bullets or pellets hit. */
  pellets: number;
  damage: number;
  healthAfter: number;
  killed: boolean;
  /** How far the damage went past the health that was left (0 if it didn't kill). */
  overkill: number;
  reaction: Reaction;
  /** Kneeling zombie twists round to face away (sets up a suplex later). */
  spin: boolean;
  dropWeapon: boolean;
  cancelThrow: boolean;
  knockback: number;
  /** The head burst (kills outright). */
  headPop: boolean;
  /** The burst came from a lucky critical headshot. */
  crit: boolean;
  /** Arms and legs torn off by this shot. */
  severed: Array<{ zone: LimbZone; segment: LimbSegment }>;
  /** A parasite bursts out where the head was (the zombie is not dead). */
  mutate: boolean;
}

/** One bullet or pellet that hit a zombie. `damage` is before body-part multipliers. */
export interface PelletHit {
  zone: Zone;
  damage: number;
  knockback: number;
  /** Chance this pellet bursts the head if it hit the head (0..1, already reduced for distance). */
  pop?: number;
  /** Chance this pellet tears off the arm or leg it hit (0..1, already reduced for distance). */
  sever?: number;
  /** Which part of the limb it hit. */
  segment?: LimbSegment;
}

/** Extra per-shot chances that don't belong to a single pellet. */
export interface ShotExtras {
  /** The gun's critical headshot chance at a fully tight reticle (half of it when wide). */
  critChance?: number;
  /** Chance a head that is blown off lets a parasite out (rises with the wave number). */
  mutateChance?: number;
  /** A hit this many times the zombie's remaining health is overkill: no parasite. */
  overkillRatio?: number;
  /** An explosion: even a heavy elite is thrown about by it. */
  explosive?: boolean;
}

/**
 * Works out the result of one bullet hitting one zombie.
 * `focus` is how tight the reticle was (0 = wide, 1 = fully focused).
 * `random` returns numbers from 0 to 1 (pass a fixed one in tests).
 */
export function resolveHit(
  zone: Zone,
  weapon: WeaponHit,
  target: TargetState,
  focus: number,
  rules: DamageRules,
  random: () => number = Math.random,
): HitResult {
  return resolveShot([{ zone, damage: weapon.damage, knockback: weapon.knockback }], target, focus, rules, random);
}

/**
 * Works out the result of one shot (a single bullet, or every shotgun pellet
 * that hit the same zombie). Damage and push add up across pellets; the
 * reaction comes from the head if any pellet hit it, otherwise from the body
 * part that took the most damage. A big enough total push knocks it down.
 */
export function resolveShot(
  pellets: PelletHit[],
  target: TargetState,
  focus: number,
  rules: DamageRules,
  random: () => number = Math.random,
  extras: ShotExtras = {},
): HitResult {
  const byZone = new Map<Zone, number>();
  let damage = 0;
  let knockback = 0;
  for (const p of pellets) {
    // The shield is not part of the body: it never takes damage this way.
    const group = zoneGroup(p.zone);
    const mult = group === 'shield' ? 0 : rules.damage[group];
    // Once the parasite is out, the body barely matters: the parasite is the weak point.
    const scale = target.parasite && group !== 'parasite' ? rules.parasite.bodyScale : 1;
    const d = p.damage * mult * scale;
    byZone.set(p.zone, (byZone.get(p.zone) ?? 0) + d);
    damage += d;
    knockback += p.knockback;
  }
  let main: Zone = pellets[0]?.zone ?? 'torso';
  let best = -1;
  for (const [z, d] of byZone) {
    if (d > best) {
      best = d;
      main = z;
    }
  }
  if (byZone.has('head')) main = 'head';
  const zones = [...byZone.keys()];
  const anyArm = byZone.has('armL') || byZone.has('armR');
  const f = Math.max(0, Math.min(1, focus));

  // Gore: a big enough hit (or a lucky one) bursts the head; heavy hits tear off limbs.
  let headPop = false;
  let crit = false;
  const severed: HitResult['severed'] = [];
  // Big elites can't have their heads burst or their limbs torn off.
  if (!target.invincible && !target.heavy) {
    if (byZone.has('head')) {
      if ((byZone.get('head') ?? 0) >= rules.gore.headPopDamage) headPop = true;
      for (const p of pellets) {
        if (headPop) break;
        if (p.zone === 'head' && (p.pop ?? 0) > 0 && random() < (p.pop ?? 0)) headPop = true;
      }
      const critChance = (extras.critChance ?? 0) * (0.5 + 0.5 * f);
      if (!headPop && critChance > 0 && random() < critChance) {
        headPop = true;
        crit = true;
      }
    }
    for (const p of pellets) {
      if (!isLimb(p.zone) || (p.sever ?? 0) <= 0) continue;
      const already = severed.find((s) => s.zone === p.zone);
      if (already && already.segment === 'upper') continue;
      if (random() < (p.sever ?? 0)) {
        const segment = p.segment ?? 'upper';
        if (already) already.segment = segment === 'upper' ? 'upper' : already.segment;
        else severed.push({ zone: p.zone as LimbZone, segment });
      }
    }
  }

  const healthAfter = target.invincible ? target.health : headPop ? 0 : target.health - damage;
  const killed = !target.invincible && healthAfter <= 0;
  const result: HitResult = {
    zone: main,
    zones,
    pellets: pellets.filter((p) => p.damage > 0).length,
    damage,
    healthAfter: Math.max(0, healthAfter),
    killed,
    overkill: killed ? Math.max(0, damage - target.health) : 0,
    reaction: 'none',
    spin: false,
    dropWeapon: false,
    cancelThrow: false,
    knockback: 0,
    headPop,
    crit,
    severed,
    mutate: false,
  };

  // A head blown off (without overkill) sometimes lets a parasite out instead of dying.
  if (
    killed &&
    !crit &&
    byZone.has('head') &&
    target.canMutate &&
    !target.parasite &&
    (extras.mutateChance ?? 0) > 0 &&
    damage <= target.health * (extras.overkillRatio ?? 2.2) &&
    random() < (extras.mutateChance ?? 0)
  ) {
    result.killed = false;
    result.mutate = true;
    result.reaction = 'mutate';
    result.healthAfter = target.health;
    result.overkill = 0;
    result.dropWeapon = target.holdingWeapon;
    return result;
  }

  if (killed) {
    result.reaction = 'death';
    result.dropWeapon = target.holdingWeapon;
    result.knockback = knockback;
    return result;
  }

  // Losing a leg drops it to the ground for good: it crawls from now on.
  if (severed.some((s) => s.zone === 'legL' || s.zone === 'legR')) {
    result.reaction = target.crawling ? 'none' : 'legless';
    result.dropWeapon = target.holdingWeapon;
    result.cancelThrow = target.windingUpThrow;
    return result;
  }
  if (severed.length) {
    result.dropWeapon = target.holdingWeapon;
    result.cancelThrow = target.windingUpThrow;
  }

  const r = rules.reactions;
  const downed = target.downed || !!target.crawling;
  const shrugsOff = !!target.heavy && !extras.explosive;
  if (!downed && !shrugsOff && knockback >= r.knockdownThreshold) {
    result.reaction = 'knockdown';
    result.knockback = knockback;
    result.dropWeapon = target.holdingWeapon;
    result.cancelThrow = target.windingUpThrow;
    return result;
  }

  switch (zoneGroup(main)) {
    case 'head': {
      if (downed) break;
      const chance = r.classicHeadStagger
        ? 1
        : r.remakeHeadStaggerChance + Math.max(0, Math.min(1, focus)) * r.focusStaggerBonus;
      result.reaction = random() < chance ? 'headStagger' : 'torsoFlinch';
      break;
    }
    case 'leg': {
      if (downed) break;
      if (target.running) {
        result.reaction = 'trip';
      } else if (random() < r.legKneelChance) {
        result.reaction = 'kneel';
        result.spin = random() < r.kneelSpinChance;
      } else {
        result.reaction = 'torsoFlinch';
      }
      break;
    }
    case 'arm': {
      result.reaction = downed ? 'none' : 'armFlinch';
      break;
    }
    case 'torso': {
      if (downed) break;
      result.knockback = knockback;
      result.reaction = knockback >= r.knockbackThreshold ? 'knockback' : 'torsoFlinch';
      break;
    }
  }
  // A heavy elite is only staggered by headshots (and thrown by explosions).
  if (shrugsOff && result.reaction !== 'headStagger' && result.reaction !== 'none') {
    result.reaction = 'none';
    result.knockback = 0;
    result.spin = false;
  }
  // Any hit on an arm knocks loose what it holds and spoils a throw.
  if (anyArm) {
    result.dropWeapon = target.holdingWeapon;
    result.cancelThrow = target.windingUpThrow;
  }
  return result;
}
