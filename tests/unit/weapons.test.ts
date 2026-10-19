import { beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { blastPush, falloff, randomInCone } from '../../src/combat/pellets';
import { Gun, WEAPONS, type GunEvent } from '../../src/combat/weapons';
import { tuning } from '../../src/config/tuning';
import { assignValues } from '../../src/debug/tuningMeta';

const defaults = structuredClone(tuning);
const def = (id: string) => WEAPONS.find((w) => w.id === id)!;

/** Runs a gun for `seconds` in small steps and collects its events. */
function run(gun: Gun, seconds: number, infinite = true): GunEvent[] {
  const events: GunEvent[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) gun.tick(1 / 60, infinite, (e) => events.push(e));
  return events;
}

beforeEach(() => assignValues(tuning, structuredClone(defaults)));

describe('falloff', () => {
  it('keeps full power up close and fades to the minimum far away', () => {
    expect(falloff(2, 5, 20, 0.25)).toBe(1);
    expect(falloff(12.5, 5, 20, 0.25)).toBeCloseTo(0.625, 5);
    expect(falloff(40, 5, 20, 0.25)).toBe(0.25);
  });
});

describe('blastPush', () => {
  it('is strongest point-blank and fades to nothing at the edge of its reach', () => {
    expect(blastPush(0, 0, 3, 30, 2.8)).toBeCloseTo(2.8, 5);
    expect(blastPush(1.5, 10, 3, 30, 2.8)).toBeCloseTo(2.1, 5);
    expect(blastPush(3, 0, 3, 30, 2.8)).toBe(0);
  });

  it('only reaches zombies in front of the barrel', () => {
    expect(blastPush(1, 45, 3, 30, 2.8)).toBe(0);
  });

  it('does nothing for guns without a blast', () => {
    expect(blastPush(0.5, 0, 0, 0, 0)).toBe(0);
  });
});

describe('randomInCone', () => {
  it('keeps every pellet inside the spread angle', () => {
    const dir = new Vector3(0.3, -0.2, -1).normalize();
    const out = new Vector3();
    for (let i = 0; i < 500; i++) {
      randomInCone(dir, 6, out);
      const angle = (Math.acos(Math.min(1, out.dot(dir))) * 180) / Math.PI;
      expect(angle).toBeLessThanOrEqual(6.0001);
      expect(out.length()).toBeCloseTo(1, 5);
    }
  });

  it('leaves the direction alone with zero spread', () => {
    const dir = new Vector3(0, 0, -1);
    expect(randomInCone(dir, 0, new Vector3()).equals(dir)).toBe(true);
  });
});

describe('weapons', () => {
  it('has nine guns on quick-slots 1 to 9', () => {
    expect(WEAPONS.map((w) => [w.id, w.slot])).toEqual([
      ['pistol', 1],
      ['pump', 2],
      ['drum', 3],
      ['smg', 4],
      ['rifle', 5],
      ['magnum', 6],
      ['rocket', 7],
      ['heavy', 8],
      ['swift', 9],
    ]);
    expect(def('pump').stats().pellets).toBeGreaterThan(1);
  });

  it('gives every gun the same set of numbers in tuning.ts', () => {
    const keys = Object.keys(tuning.pistol).sort();
    for (const w of WEAPONS) expect(Object.keys(w.stats()).sort(), w.id).toEqual(keys);
  });

  it('only the heavy guns burst heads and tear off limbs', () => {
    expect(def('pistol').stats().headPop).toBe(0);
    expect(def('pistol').stats().dismember).toBe(0);
    for (const id of ['pump', 'drum', 'rifle', 'magnum']) {
      expect(def(id).stats().headPop, id).toBeGreaterThan(0.5);
      expect(def(id).stats().dismember, id).toBeGreaterThan(0.1);
    }
  });
});

describe('Gun: pump shotgun', () => {
  it('fires, then works the pump before it can fire again', () => {
    const gun = new Gun(def('pump'));
    expect(gun.pullTrigger()).toBe('fired');
    expect(gun.pullTrigger()).toBe('busy');
    const events = run(gun, tuning.pumpShotgun.fireInterval + 0.05);
    expect(events).toContain('pump');
    expect(events).toContain('eject');
    expect(gun.pullTrigger()).toBe('fired');
    expect(gun.ammo).toBe(tuning.pumpShotgun.capacity - 2);
  });

  it('reloads one shell at a time', () => {
    const gun = new Gun(def('pump'));
    gun.ammo = 3;
    expect(gun.startReload(true)).toBe(true);
    const events = run(gun, 0.25 + tuning.pumpShotgun.reloadTime + 0.05);
    expect(events.filter((e) => e === 'shellIn')).toHaveLength(1);
    expect(gun.ammo).toBe(4);
    run(gun, 3);
    expect(gun.ammo).toBe(tuning.pumpShotgun.capacity);
    expect(gun.reloading).toBe(false);
  });

  it('firing during a shell reload stops the reload and shoots', () => {
    const gun = new Gun(def('pump'));
    gun.ammo = 2;
    gun.startReload(true);
    run(gun, 0.25 + tuning.pumpShotgun.reloadTime + 0.05);
    expect(gun.pullTrigger()).toBe('fired');
    expect(gun.reloading).toBe(false);
    expect(gun.ammo).toBe(2);
  });

  it('pumps a shell into the chamber after reloading from empty', () => {
    const gun = new Gun(def('pump'));
    gun.ammo = 0;
    gun.startReload(true);
    const events = run(gun, 5);
    expect(events.filter((e) => e === 'shellIn')).toHaveLength(tuning.pumpShotgun.capacity);
    expect(events[events.length - 1]).toBe('pump');
    expect(gun.reloading).toBe(false);
  });

  it('runs out of spare shells when ammo is limited', () => {
    const gun = new Gun(def('pump'));
    gun.ammo = 1;
    gun.reserve = 2;
    gun.startReload(false);
    run(gun, 5, false);
    expect(gun.ammo).toBe(3);
    expect(gun.reserve).toBe(0);
    expect(gun.canReload(false)).toBe(false);
  });
});

describe('Gun: magazine weapons', () => {
  it('the drum shotgun swaps its whole drum', () => {
    const gun = new Gun(def('drum'));
    for (let i = 0; i < 5; i++) {
      expect(gun.pullTrigger()).toBe('fired');
      run(gun, tuning.drumShotgun.fireInterval + 0.02);
    }
    gun.startReload(true);
    const events = run(gun, tuning.drumShotgun.reloadTime + 0.05);
    expect(events).toEqual(['drumOut', 'drumIn']);
    expect(gun.ammo).toBe(tuning.drumShotgun.capacity);
  });

  it('an empty gun clicks, and its reload takes longer and racks the slide', () => {
    const gun = new Gun(def('pistol'));
    gun.ammo = 0;
    expect(gun.pullTrigger()).toBe('empty');
    gun.cooldown = 0;
    gun.startReload(true);
    const events = run(gun, tuning.pistol.emptyReloadTime + 0.05);
    expect(events).toEqual(['magOut', 'magIn', 'slide']);
    expect(gun.ammo).toBe(tuning.pistol.capacity);
  });
});

describe('Gun: new weapons', () => {
  it('the submachine gun fires as fast as its fire rate allows while held', () => {
    const gun = new Gun(def('smg'));
    let fired = 0;
    for (let t = 0; t < 1; t += 1 / 60) {
      if (gun.pullTrigger() === 'fired') fired++;
      gun.tick(1 / 60, true, () => {});
    }
    expect(def('smg').auto).toBe(true);
    expect(fired).toBeGreaterThanOrEqual(Math.floor(1 / tuning.smg.fireInterval) - 1);
  });

  it('the rifle works its bolt after every shot and loads round by round', () => {
    const gun = new Gun(def('rifle'));
    expect(gun.pullTrigger()).toBe('fired');
    expect(gun.pullTrigger()).toBe('busy');
    const events = run(gun, tuning.rifle.fireInterval + 0.05);
    expect(events).toContain('bolt');
    expect(events).not.toContain('pump');
    gun.ammo = 0;
    gun.startReload(true);
    const reload = run(gun, 6);
    expect(reload.filter((e) => e === 'roundIn')).toHaveLength(tuning.rifle.capacity);
    expect(reload[reload.length - 1]).toBe('bolt');
  });

  it('the revolver swings out its cylinder to reload', () => {
    const gun = new Gun(def('magnum'));
    gun.ammo = 0;
    gun.startReload(true);
    expect(run(gun, tuning.magnum.reloadTime + 0.05)).toEqual(['cylinderOut', 'cylinderIn']);
    expect(gun.ammo).toBe(tuning.magnum.capacity);
  });

  it('the rocket launcher holds one rocket', () => {
    const gun = new Gun(def('rocket'));
    expect(gun.pullTrigger()).toBe('fired');
    expect(gun.ammo).toBe(0);
    gun.cooldown = 0;
    expect(gun.pullTrigger()).toBe('empty');
    gun.startReload(true);
    expect(run(gun, tuning.rocket.reloadTime + 0.05)).toEqual(['rocketIn']);
    expect(gun.ammo).toBe(1);
  });
});
