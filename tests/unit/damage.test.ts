import { describe, expect, it } from 'vitest';
import { resolveHit, resolveShot, zoneGroup, type DamageRules, type PelletHit, type TargetState } from '../../src/combat/damage';

const rules: DamageRules = {
  damage: { head: 2.5, torso: 1, arm: 0.6, leg: 0.75, parasite: 3 },
  reactions: {
    classicHeadStagger: true,
    remakeHeadStaggerChance: 0.35,
    focusStaggerBonus: 0.45,
    legKneelChance: 1,
    kneelSpinChance: 0.25,
    knockbackThreshold: 0.6,
    knockdownThreshold: 1.6,
  },
  gore: { headPopDamage: 600 },
  parasite: { bodyScale: 0.2 },
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

describe('gore: bursting heads', () => {
  it('a pistol headshot does not burst the head on its own', () => {
    const hit = resolveHit('head', pistol, zombie(), 1, rules, always);
    expect(hit.headPop).toBe(false);
    expect(hit.killed).toBe(false);
  });

  it('a big enough hit to the head always bursts it and kills outright', () => {
    const hit = resolveShot([{ zone: 'head', damage: 700, knockback: 1 }], zombie({ health: 5000 }), 0, rules, never);
    expect(hit.headPop).toBe(true);
    expect(hit.killed).toBe(true);
    expect(hit.reaction).toBe('death');
    expect(hit.crit).toBe(false);
  });

  it('a shotgun pellet to the head bursts it when its chance comes up', () => {
    const pellet: PelletHit = { zone: 'head', damage: 42, knockback: 0.3, pop: 0.85 };
    expect(resolveShot([pellet], zombie(), 1, rules, always).headPop).toBe(true);
    expect(resolveShot([pellet], zombie(), 1, rules, never).headPop).toBe(false);
  });

  it('pellets that miss the head never burst it', () => {
    const pellet: PelletHit = { zone: 'torso', damage: 42, knockback: 0.3, pop: 1 };
    expect(resolveShot([pellet], zombie(), 1, rules, always).headPop).toBe(false);
  });

  it('a critical headshot bursts the head, more likely with a tight reticle', () => {
    const roll = (v: number) => () => v;
    const shot: PelletHit[] = [{ zone: 'head', damage: 100, knockback: 0.15 }];
    // 5% crit chance: 2.5% with a wide reticle, 5% fully focused.
    expect(resolveShot(shot, zombie(), 1, rules, roll(0.04), { critChance: 0.05 }).crit).toBe(true);
    expect(resolveShot(shot, zombie(), 0, rules, roll(0.04), { critChance: 0.05 }).crit).toBe(false);
    const hit = resolveShot(shot, zombie(), 1, rules, roll(0.01), { critChance: 0.05 });
    expect(hit.headPop).toBe(true);
    expect(hit.killed).toBe(true);
  });

  it('never bursts the head of an invincible practice dummy', () => {
    const hit = resolveShot([{ zone: 'head', damage: 900, knockback: 1, pop: 1 }], zombie({ invincible: true }), 1, rules, always);
    expect(hit.headPop).toBe(false);
    expect(hit.killed).toBe(false);
  });
});

describe('gore: tearing off limbs', () => {
  it('a heavy hit to a leg tears it off and the zombie starts crawling', () => {
    const hit = resolveShot([{ zone: 'legL', damage: 700, knockback: 1, sever: 0.9, segment: 'lower' }], zombie({ health: 5000 }), 1, rules, always);
    expect(hit.severed).toEqual([{ zone: 'legL', segment: 'lower' }]);
    expect(hit.reaction).toBe('legless');
  });

  it('losing an arm makes it drop what it holds', () => {
    const hit = resolveShot([{ zone: 'armR', damage: 700, knockback: 0, sever: 1, segment: 'upper' }], zombie({ health: 5000, holdingWeapon: true }), 1, rules, always);
    expect(hit.severed).toEqual([{ zone: 'armR', segment: 'upper' }]);
    expect(hit.dropWeapon).toBe(true);
    expect(hit.reaction).toBe('armFlinch');
  });

  it('several pellets on one arm tear it off once, at the shoulder if any hit up there', () => {
    const pellets: PelletHit[] = [
      { zone: 'armL', damage: 42, knockback: 0.3, sever: 0.5, segment: 'lower' },
      { zone: 'armL', damage: 42, knockback: 0.3, sever: 0.5, segment: 'upper' },
    ];
    expect(resolveShot(pellets, zombie(), 1, rules, always).severed).toEqual([{ zone: 'armL', segment: 'upper' }]);
  });

  it('light guns never tear anything off', () => {
    const hit = resolveShot([{ zone: 'legR', damage: 100, knockback: 0.15 }], zombie(), 1, rules, always);
    expect(hit.severed).toEqual([]);
    expect(hit.reaction).toBe('kneel');
  });

  it('a crawling zombie reacts like one lying on the ground', () => {
    expect(resolveHit('head', pistol, zombie({ crawling: true }), 1, rules).reaction).toBe('none');
    expect(resolveHit('legR', pistol, zombie({ crawling: true }), 1, rules).reaction).toBe('none');
  });

  it('a killing blow can still tear a limb off', () => {
    const hit = resolveShot([{ zone: 'armL', damage: 2000, knockback: 0, sever: 1, segment: 'upper' }], zombie(), 1, rules, always);
    expect(hit.killed).toBe(true);
    expect(hit.severed.length).toBe(1);
  });
});

describe('parasite mutation', () => {
  const head = (damage: number): PelletHit[] => [{ zone: 'head', damage, knockback: 0.15 }];
  const mutable = (over: Partial<TargetState> = {}) => zombie({ canMutate: true, ...over });

  it('a killing headshot that is not overkill can let a parasite out instead', () => {
    const r = resolveShot(head(100), mutable({ health: 200 }), 1, rules, always, { mutateChance: 0.3, overkillRatio: 2.2 });
    expect(r.mutate).toBe(true);
    expect(r.killed).toBe(false);
    expect(r.reaction).toBe('mutate');
    expect(r.healthAfter).toBe(200);
  });

  it('only when the roll comes up', () => {
    const r = resolveShot(head(100), mutable({ health: 200 }), 1, rules, never, { mutateChance: 0.3, overkillRatio: 2.2 });
    expect(r.mutate).toBe(false);
    expect(r.killed).toBe(true);
  });

  it('overkill prevents it', () => {
    const r = resolveShot(head(400), mutable({ health: 100 }), 1, rules, always, { mutateChance: 1, overkillRatio: 2.2 });
    expect(r.mutate).toBe(false);
    expect(r.killed).toBe(true);
  });

  it('a critical headshot kills instantly: no parasite', () => {
    const r = resolveShot(head(100), mutable({ health: 450 }), 1, rules, always, { mutateChance: 1, critChance: 1 });
    expect(r.crit).toBe(true);
    expect(r.mutate).toBe(false);
    expect(r.killed).toBe(true);
  });

  it('never for elites or zombies that already have one', () => {
    expect(resolveShot(head(100), zombie({ health: 200 }), 1, rules, always, { mutateChance: 1 }).mutate).toBe(false);
    expect(resolveShot(head(100), mutable({ health: 200, parasite: true }), 1, rules, always, { mutateChance: 1 }).mutate).toBe(false);
  });

  it('a hit to the body never starts one', () => {
    const r = resolveShot([{ zone: 'torso', damage: 300, knockback: 0 }], mutable({ health: 200 }), 1, rules, always, { mutateChance: 1 });
    expect(r.mutate).toBe(false);
  });
});

describe('with a parasite out', () => {
  const infested = (over: Partial<TargetState> = {}) => zombie({ parasite: true, health: 400, ...over });

  it('the parasite is the weak point; the body barely counts', () => {
    const body = resolveShot([{ zone: 'torso', damage: 100, knockback: 0 }], infested(), 1, rules);
    const weak = resolveShot([{ zone: 'parasite', damage: 100, knockback: 0 }], infested(), 1, rules);
    expect(body.damage).toBeCloseTo(20);
    expect(weak.damage).toBeCloseTo(300);
    expect(weak.killed).toBe(false);
    expect(resolveShot([{ zone: 'parasite', damage: 200, knockback: 0 }], infested(), 1, rules).killed).toBe(true);
  });
});

describe('heavy elites', () => {
  const brute = (over: Partial<TargetState> = {}) => zombie({ heavy: true, health: 4000, ...over });

  it('shrug off leg shots, body shots and shotgun blasts', () => {
    expect(resolveShot([{ zone: 'legL', damage: 100, knockback: 0.2 }], brute(), 1, rules, always).reaction).toBe('none');
    expect(resolveShot([{ zone: 'torso', damage: 100, knockback: 5 }], brute(), 1, rules, always).reaction).toBe('none');
    expect(resolveShot([{ zone: 'armR', damage: 100, knockback: 0 }], brute(), 1, rules, always).reaction).toBe('none');
  });

  it('are staggered by a headshot', () => {
    expect(resolveShot([{ zone: 'head', damage: 100, knockback: 0.15 }], brute(), 1, rules, always).reaction).toBe('headStagger');
  });

  it('are thrown by an explosion', () => {
    expect(resolveShot([{ zone: 'torso', damage: 100, knockback: 5 }], brute(), 1, rules, always, { explosive: true }).reaction).toBe('knockdown');
  });
});

describe('shields', () => {
  it('never take damage as part of the body', () => {
    const r = resolveShot([{ zone: 'shield', damage: 500, knockback: 1 }], zombie(), 1, rules);
    expect(r.damage).toBe(0);
    expect(r.killed).toBe(false);
  });
});

describe('heavy elites and gore', () => {
  const heavy = { health: 5000, invincible: false, running: false, downed: false, holdingWeapon: false, windingUpThrow: false, heavy: true };

  it('their heads cannot be burst even by a huge hit, and nothing tears off', () => {
    const r = resolveShot([{ zone: 'head', damage: 400, knockback: 1, pop: 1 }], heavy, 1, rules, () => 0, { critChance: 1 });
    expect(r.headPop).toBe(false);
    expect(r.crit).toBe(false);
    expect(r.killed).toBe(false);
    const arm = resolveShot([{ zone: 'armL', damage: 100, knockback: 1, sever: 1 }], heavy, 1, rules, () => 0);
    expect(arm.severed).toEqual([]);
  });
});
