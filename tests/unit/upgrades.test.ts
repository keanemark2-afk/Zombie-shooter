import { describe, expect, it } from 'vitest';
import { attachmentFits, EXCLUSIVES, UPGRADE_STATS, WeaponUpgrades, type GunKind, type Upgradable } from '../../src/combat/upgrades';

const rules = { firepowerPerLevel: 0.2, fireRatePerLevel: 0.1, reloadPerLevel: 0.1, capacityPerLevel: 0.25, levelsPistols: 5, levelsOthers: 4 };
const base = (): Upgradable => ({ damage: 100, pellets: 1, fireInterval: 0.3, capacity: 10, reloadTime: 1.4, emptyReloadTime: 2, focusTime: 0.8, swaySpeed: 1.6, spreadTight: 0.2, pierce: 0, critChance: 0.05 });
const maxEverything = (u: WeaponUpgrades, gun: string) => {
  for (const s of UPGRADE_STATS) while (u.canUpgrade(gun, s)) u.upgrade(gun, s);
};

const pistol: GunKind = { id: 'pistol', hold: 'pistol', reload: 'magazine', projectile: false };
const pump: GunKind = { id: 'pump', hold: 'long', reload: 'shells', projectile: false };
const smg: GunKind = { id: 'smg', hold: 'long', reload: 'magazine', projectile: false };
const rocket: GunKind = { id: 'rocket', hold: 'long', reload: 'magazine', projectile: true };

describe('weapon upgrades', () => {
  it('starts with nothing bought and leaves the numbers alone', () => {
    const u = new WeaponUpgrades(() => rules);
    expect(u.affects('pistol')).toBe(false);
    expect(u.apply('pistol', base(), base())).toEqual(base());
  });

  it('each level makes the stat better', () => {
    const u = new WeaponUpgrades(() => rules);
    u.upgrade('pistol', 'firepower');
    u.upgrade('pistol', 'firepower');
    u.upgrade('pistol', 'fireRate');
    u.upgrade('pistol', 'reload');
    u.upgrade('pistol', 'capacity');
    const s = u.apply('pistol', base(), base());
    expect(s.damage).toBeCloseTo(140);
    expect(s.fireInterval).toBeCloseTo(0.27);
    expect(s.reloadTime).toBeCloseTo(1.26);
    expect(s.emptyReloadTime).toBeCloseTo(1.8);
    expect(s.capacity).toBe(13);
    expect(u.affects('pistol')).toBe(true);
    expect(u.affects('pump')).toBe(false);
  });

  it('pistols go up five levels, other guns four', () => {
    const u = new WeaponUpgrades(() => rules);
    let n = 0;
    while (u.upgrade('pistol', 'firepower')) n++;
    expect(n).toBe(5);
    n = 0;
    while (u.upgrade('pump', 'firepower')) n++;
    expect(n).toBe(4);
  });

  it('the Exclusive Upgrade only unlocks when every stat is maxed, and only once', () => {
    const u = new WeaponUpgrades(() => rules);
    expect(u.canBuyExclusive('pistol')).toBe(false);
    for (const s of UPGRADE_STATS.slice(0, 3)) while (u.canUpgrade('pistol', s)) u.upgrade('pistol', s);
    expect(u.canBuyExclusive('pistol')).toBe(false);
    while (u.canUpgrade('pistol', 'capacity')) u.upgrade('pistol', 'capacity');
    expect(u.allMaxed('pistol')).toBe(true);
    expect(u.canBuyExclusive('pistol')).toBe(true);
    expect(u.buyExclusive('pistol')).toBe(true);
    expect(u.buyExclusive('pistol')).toBe(false);
    expect(u.hasExclusive('pistol')).toBe(true);
  });

  it('the starter pistol multiplies its crit chance by five', () => {
    const u = new WeaponUpgrades(() => rules);
    maxEverything(u, 'pistol');
    u.buyExclusive('pistol');
    expect(u.apply('pistol', base(), base()).critChance).toBeCloseTo(0.25);
  });

  it('the exclusives do what they say', () => {
    const run = (gun: string) => {
      const u = new WeaponUpgrades(() => rules);
      maxEverything(u, gun);
      u.buyExclusive(gun);
      return u.apply(gun, base(), base());
    };
    expect(run('heavy').pierce).toBe(5);
    const swift = run('swift');
    expect(swift.damage).toBeCloseTo(100 * 2 * 1.5);
    expect(run('smg').capacity).toBeGreaterThan(run('rocket').capacity);
    expect(run('pump').pellets).toBe(2);
    expect(Object.keys(EXCLUSIVES).sort()).toEqual(['drum', 'heavy', 'magnum', 'pistol', 'pump', 'rifle', 'rocket', 'smg', 'swift']);
  });

  it('attachments only fit the guns they are meant for', () => {
    expect(attachmentFits('stock', pump)).toBe(true);
    expect(attachmentFits('stock', pistol)).toBe(false);
    expect(attachmentFits('scope', pistol)).toBe(true);
    expect(attachmentFits('scope', smg)).toBe(true);
    expect(attachmentFits('scope', pump)).toBe(false);
    expect(attachmentFits('longMag', pistol)).toBe(true);
    expect(attachmentFits('longMag', pump)).toBe(false);
    expect(attachmentFits('longMag', rocket)).toBe(false);
    expect(attachmentFits('mystery', pistol)).toBe(false);
  });

  it('fitting an attachment lasts, and can only be done once per gun', () => {
    const u = new WeaponUpgrades(() => rules);
    expect(u.attach(pump, 'stock')).toBe(true);
    expect(u.attach(pump, 'stock')).toBe(false);
    expect(u.attach(pump, 'scope')).toBe(false);
    const s = u.apply('pump', base(), base());
    expect(s.focusTime).toBeCloseTo(0.56);
    expect(s.swaySpeed).toBeCloseTo(1.12);
    u.attach(pistol, 'longMag');
    expect(u.apply('pistol', base(), base()).capacity).toBe(13);
    u.attach(pistol, 'scope');
    expect(u.apply('pistol', base(), base()).spreadTight).toBeCloseTo(0.14);
  });

  it('can be wiped for a new run', () => {
    const u = new WeaponUpgrades(() => rules);
    maxEverything(u, 'pistol');
    u.attach(pistol, 'scope');
    u.reset();
    expect(u.affects('pistol')).toBe(false);
    expect(u.level('pistol', 'firepower')).toBe(0);
  });
});
