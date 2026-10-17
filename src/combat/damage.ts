// The rules for what a bullet does to a zombie: how much damage, and how the
// zombie reacts depending on where it was hit. Kept free of graphics so the
// rules can be unit-tested.

export type Zone = 'head' | 'torso' | 'armL' | 'armR' | 'legL' | 'legR';
export type ZoneGroup = 'head' | 'torso' | 'arm' | 'leg';

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
}

export interface DamageRules {
  damage: { head: number; torso: number; arm: number; leg: number };
  reactions: {
    classicHeadStagger: boolean;
    remakeHeadStaggerChance: number;
    focusStaggerBonus: number;
    legKneelChance: number;
    kneelSpinChance: number;
    knockbackThreshold: number;
  };
}

export interface HitResult {
  zone: Zone;
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
  const group = zoneGroup(zone);
  const damage = weapon.damage * rules.damage[group];
  const healthAfter = target.invincible ? target.health : target.health - damage;
  const killed = !target.invincible && healthAfter <= 0;
  const result: HitResult = {
    zone,
    damage,
    healthAfter: Math.max(0, healthAfter),
    killed,
    overkill: killed ? damage - target.health : 0,
    reaction: 'none',
    spin: false,
    dropWeapon: false,
    cancelThrow: false,
    knockback: 0,
  };

  if (killed) {
    result.reaction = 'death';
    result.dropWeapon = target.holdingWeapon;
    result.knockback = weapon.knockback;
    return result;
  }

  const r = rules.reactions;
  switch (group) {
    case 'head': {
      if (target.downed) break;
      const chance = r.classicHeadStagger
        ? 1
        : r.remakeHeadStaggerChance + Math.max(0, Math.min(1, focus)) * r.focusStaggerBonus;
      result.reaction = random() < chance ? 'headStagger' : 'torsoFlinch';
      break;
    }
    case 'leg': {
      if (target.downed) break;
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
      result.reaction = target.downed ? 'none' : 'armFlinch';
      result.dropWeapon = target.holdingWeapon;
      result.cancelThrow = target.windingUpThrow;
      break;
    }
    case 'torso': {
      if (target.downed) break;
      result.knockback = weapon.knockback;
      result.reaction = weapon.knockback >= r.knockbackThreshold ? 'knockback' : 'torsoFlinch';
      break;
    }
  }
  return result;
}
