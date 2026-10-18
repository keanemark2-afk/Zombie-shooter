import { describe, expect, it } from 'vitest';
import { resolveHit, resolveShot, zoneGroup, type DamageRules, type PelletHit, type TargetState } from '../../src/combat/damage';

const rules: DamageRules = {
  damage: { head: 2.5, torso: 1, arm: 0.6, leg: 0.75 },
  reactions: {
    classicHeadStagger: true,
    remakeHeadStaggerChance: 0.35,
    focusStaggerBonus: 0.45,
    legKneelChance: 1,
    kneelSpinChance: 0.25,
    knockbackThreshold: 0.6,
    knockdownThreshold: 1.6,
  },
};

const pistol = { damage: 100, knockback: 0.15 };

function zombie(overrides: Partial<TargetState> = {}): TargetState {
  return { health: 450, invincible: false, running: false, downed: false, holdingWeapon: false, windingUpThrow: false, ...overrides };
}

const always = () => 0; // a "random" roll that always succeeds
const never = () => 0.999; // a roll that always fails

describe('damage', () => {
  it('applies the body-part multipliers', () => {
    expect(resolveHit('head', pistol, zombie(), 1, rules).damage).toBe(250);
    expect(resolveHit('torso', pistol, zombie(), 1, rules).damage).toBe(100);
    expect(resolveHit('armL', pistol, zombie(), 1, rules).damage).toBe(60);
    expect(resolveHit('legR', pistol, zombie(), 1, rules).damage).toBe(75);
  });

  it('kills when health runs out and reports the overkill', () => {
    const hit = resolveHit('head', pistol, zombie({ health: 100 }), 1, rules);
    expect(hit.killed).toBe(true);
    expect(hit.reaction).toBe('death');
    expect(hit.overkill).toBe(150);
    expect(hit.healthAfter).toBe(0);
  });

  it('does not kill an invincible dummy but still reacts', () => {
    const hit = resolveHit('head', pistol, zombie({ health: 10, invincible: true }), 1, rules);
    expect(hit.killed).toBe(false);
    expect(hit.healthAfter).toBe(10);
    expect(hit.reaction).toBe('headStagger');
  });

  it('groups left/right limbs together', () => {
    expect(zoneGroup('armL')).toBe('arm');
    expect(zoneGroup('legR')).toBe('leg');
    expect(zoneGroup('head')).toBe('head');
  });
});

describe('head reactions', () => {
  it('classic rules: a pistol headshot always staggers, whatever the roll', () => {
    expect(resolveHit('head', pistol, zombie(), 0, rules, never).reaction).toBe('headStagger');
  });

  it('remake rules: stagger is a chance that grows with reticle focus', () => {
    const remake = { ...rules, reactions: { ...rules.reactions, classicHeadStagger: false } };
    // Roll of 0.5: misses at a wide reticle (35%), succeeds when focused (35% + 45% = 80%).
    expect(resolveHit('head', pistol, zombie(), 0, remake, () => 0.5).reaction).toBe('torsoFlinch');
    expect(resolveHit('head', pistol, zombie(), 1, remake, () => 0.5).reaction).toBe('headStagger');
  });

  it('a zombie lying on the ground does not stagger', () => {
    expect(resolveHit('head', pistol, zombie({ downed: true }), 1, rules).reaction).toBe('none');
  });
});

describe('leg reactions', () => {
  it('a walking zombie drops to one knee', () => {
    const hit = resolveHit('legL', pistol, zombie(), 1, rules, never);
    expect(hit.reaction).toBe('kneel');
    expect(hit.spin).toBe(false);
  });

  it('sometimes the kneeling zombie spins round', () => {
    expect(resolveHit('legL', pistol, zombie(), 1, rules, always).spin).toBe(true);
  });

  it('a running zombie trips and falls flat', () => {
    expect(resolveHit('legR', pistol, zombie({ running: true }), 1, rules).reaction).toBe('trip');
  });

  it('respects the kneel chance', () => {
    const rare = { ...rules, reactions: { ...rules.reactions, legKneelChance: 0 } };
    expect(resolveHit('legR', pistol, zombie(), 1, rare, always).reaction).toBe('torsoFlinch');
  });
});

describe('arm reactions', () => {
  it('flinches and drops whatever it is holding', () => {
    const hit = resolveHit('armR', pistol, zombie({ holdingWeapon: true }), 1, rules);
    expect(hit.reaction).toBe('armFlinch');
    expect(hit.dropWeapon).toBe(true);
  });

  it('cancels a throw that was winding up', () => {
    expect(resolveHit('armL', pistol, zombie({ windingUpThrow: true }), 1, rules).cancelThrow).toBe(true);
  });

  it('does not drop anything if empty-handed', () => {
    expect(resolveHit('armL', pistol, zombie(), 1, rules).dropWeapon).toBe(false);
  });
});

describe('torso reactions', () => {
  it('a pistol just makes it flinch', () => {
    const hit = resolveHit('torso', pistol, zombie(), 1, rules);
    expect(hit.reaction).toBe('torsoFlinch');
    expect(hit.knockback).toBe(0.15);
  });

  it('a powerful gun shoves it back', () => {
    expect(resolveHit('torso', { damage: 300, knockback: 1.2 }, zombie(), 1, rules).reaction).toBe('knockback');
  });
});

describe('shotgun blasts (several pellets at once)', () => {
  const pellet = (zone: PelletHit['zone'], damage = 40, knockback = 0.3): PelletHit => ({ zone, damage, knockback });

  it('adds up damage from every pellet, with body-part multipliers', () => {
    const hit = resolveShot([pellet('torso'), pellet('torso'), pellet('legL')], zombie(), 1, rules);
    expect(hit.damage).toBeCloseTo(40 + 40 + 30, 5);
    expect(hit.pellets).toBe(3);
    expect(hit.zones.sort()).toEqual(['legL', 'torso']);
  });

  it('a close blast knocks the zombie off its feet', () => {
    const blast = Array.from({ length: 7 }, () => pellet('torso', 20, 0.3)); // push 2.1
    const hit = resolveShot(blast, zombie({ health: 1000 }), 1, rules);
    expect(hit.reaction).toBe('knockdown');
    expect(hit.knockback).toBeCloseTo(2.1, 5);
  });

  it('a few stray pellets only shove it', () => {
    const hit = resolveShot([pellet('torso', 20, 0.3), pellet('torso', 20, 0.3), pellet('torso', 20, 0.3)], zombie(), 1, rules);
    expect(hit.reaction).toBe('knockback');
  });

  it('knockdown beats a headshot stagger, but a pellet in the head staggers otherwise', () => {
    const big = [pellet('head', 10, 1), pellet('torso', 10, 1)];
    expect(resolveShot(big, zombie(), 1, rules).reaction).toBe('knockdown');
    const small = [pellet('head', 10, 0.1), pellet('torso', 10, 0.1), pellet('torso', 10, 0.1)];
    const hit = resolveShot(small, zombie(), 1, rules);
    expect(hit.zone).toBe('head');
    expect(hit.reaction).toBe('headStagger');
  });

  it('a zombie already on the ground is not knocked down again', () => {
    const blast = Array.from({ length: 8 }, () => pellet('torso', 10, 0.3));
    expect(resolveShot(blast, zombie({ downed: true }), 1, rules).reaction).toBe('none');
  });

  it('any pellet in an arm knocks its tool loose', () => {
    const hit = resolveShot([pellet('torso', 10, 0.1), pellet('armL', 10, 0.1)], zombie({ holdingWeapon: true }), 1, rules);
    expect(hit.dropWeapon).toBe(true);
  });

  it('a single bullet gives the same result as before', () => {
    const one = resolveShot([pellet('legR', 100, 0.15)], zombie(), 1, rules, () => 0.999);
    const old = resolveHit('legR', { damage: 100, knockback: 0.15 }, zombie(), 1, rules, () => 0.999);
    expect(one).toEqual(old);
  });
});
