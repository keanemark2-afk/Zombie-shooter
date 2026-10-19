import { describe, expect, it } from 'vitest';
import { UPGRADE_STATS, WeaponUpgrades } from '../../src/combat/upgrades';
import { makeItem, type Item, type ItemKind } from '../../src/inventory/items';
import { CASE_TIERS, Trader, tuningPrices, type ShopPrices, type TraderHost } from '../../src/inventory/shop';
import { Supplies } from '../../src/inventory/supplies';

const WEAPONS = ['pistol', 'pump', 'smg'];

function setup(coins = 10000, owned = ['pistol']) {
  const supplies = new Supplies();
  const upgrades = new WeaponUpgrades(() => ({ firepowerPerLevel: 0.2, fireRatePerLevel: 0.1, reloadPerLevel: 0.1, capacityPerLevel: 0.2, levelsPistols: 5, levelsOthers: 4 }));
  supplies.coins = coins;
  const carried = new Set<string>();
  const reserve: Record<string, number> = { pistol: 10, pump: 0, smg: 0 };
  let knife = 0.4;
  for (const w of owned) {
    supplies.addNew('weapon', w);
    carried.add(w);
  }
  const host: TraderHost = {
    get coins() {
      return supplies.coins;
    },
    set coins(v: number) {
      supplies.coins = v;
    },
    items: () => supplies.items,
    addItem: (kind: ItemKind, key: string) => {
      const it = supplies.addNew(kind, key);
      if (it && kind === 'weapon') carried.add(key);
      return it !== null;
    },
    removeItem: (id: number) => {
      const it = supplies.remove(id);
      if (it?.kind === 'weapon') carried.delete(it.key);
    },
    weaponCount: () => carried.size,
    ownsWeapon: (id: string) => carried.has(id),
    weaponName: (id: string) => id.toUpperCase(),
    ammo: (id: string) => (carried.has(id) ? { reserve: reserve[id], max: 60 } : null),
    addAmmo: (id: string, n: number) => {
      const add = Math.min(n, 60 - reserve[id]);
      reserve[id] += add;
      return add;
    },
    knifeCondition: () => knife,
    repairKnife: () => void (knife = 1),
    caseTier: () => supplies.caseTier,
    upgradeCase: () => supplies.upgradeCase(supplies.caseTier + 1),
    upgrades,
  };
  const prices: ShopPrices = {
    ...tuningPrices(),
    weapon: { pistol: 1500, pump: 2500, smg: 3500 },
    ammoPack: { pistol: 100, pump: 140, smg: 300 },
    ammoAmount: { pistol: 12, pump: 6, smg: 40 },
    upgradeBase: { pistol: 500, pump: 650, smg: 700 },
    upgradeFactor: { firepower: 2, fireRate: 1, reload: 1, capacity: 1 },
    exclusive: { pistol: 6000, pump: 9000, smg: 9000 },
    knifeRepair: 1000,
    caseUpgrade: [3000, 6000, 9000, 15000],
    sellFraction: 0.5,
  };
  const trader = new Trader(host, () => prices, WEAPONS);
  return { trader, host, supplies, upgrades, carried, reserve };
}

const offer = (t: Trader, id: string) => t.offers().find((o) => o.id === id)!;

describe('buying', () => {
  it('lists guns you do not own, and ammo only for guns you carry', () => {
    const { trader } = setup();
    const ids = trader.offers().map((o) => o.id);
    expect(ids).toContain('weapon:pump');
    expect(ids).not.toContain('weapon:pistol');
    expect(ids).toContain('ammo:pistol');
    expect(ids).not.toContain('ammo:pump');
  });

  it('takes the money and puts the item in the case', () => {
    const { trader, host, supplies } = setup(1000);
    const r = trader.buy(offer(trader, 'herbG'));
    expect(r.ok).toBe(true);
    expect(host.coins).toBe(700);
    expect(supplies.count('herb', 'G')).toBe(1);
  });

  it('refuses when you cannot afford it', () => {
    const { trader, host, supplies } = setup(100);
    const r = trader.buy(offer(trader, 'spray'));
    expect(r).toMatchObject({ ok: false, reason: 'money' });
    expect(host.coins).toBe(100);
    expect(supplies.count('spray')).toBe(0);
  });

  it('refuses when the case has no room, and keeps your money', () => {
    const { trader, host, supplies } = setup(5000);
    while (supplies.addNew('treasure', 'crown')) {
      /* fill the case, then the gaps */
    }
    while (supplies.addNew('treasure', 'gemRed')) {
      /* nothing */
    }
    const before = host.coins;
    const r = trader.buy(offer(trader, 'herbG'));
    expect(r).toMatchObject({ ok: false, reason: 'room' });
    expect(host.coins).toBe(before);
  });

  it('buys a gun: it goes in the case and you carry it', () => {
    const { trader, carried, host } = setup(3000);
    expect(trader.buy(offer(trader, 'weapon:pump')).ok).toBe(true);
    expect(carried.has('pump')).toBe(true);
    expect(host.coins).toBe(500);
    expect(trader.offers().map((o) => o.id)).not.toContain('weapon:pump');
    expect(trader.offers().map((o) => o.id)).toContain('ammo:pump');
  });

  it('buys a pack of ammo, but not when you are full', () => {
    const { trader, host, reserve } = setup(1000);
    expect(trader.buy(offer(trader, 'ammo:pistol')).ok).toBe(true);
    expect(reserve.pistol).toBe(22);
    expect(host.coins).toBe(900);
    reserve.pistol = 60;
    expect(trader.buy(offer(trader, 'ammo:pistol'))).toMatchObject({ ok: false, reason: 'maxed' });
    expect(host.coins).toBe(900);
  });
});

describe('selling', () => {
  it('pays the item value; guns and attachments sell for half the price', () => {
    const { trader, host, supplies } = setup(0, ['pistol', 'pump']);
    const gem = supplies.addNew('treasure', 'gemRed')!;
    expect(trader.sell(gem).ok).toBe(true);
    expect(host.coins).toBe(800);
    const pump = supplies.items.find((i) => i.key === 'pump')!;
    expect(trader.sellPrice(pump)).toBe(1250);
    trader.sell(pump);
    expect(host.coins).toBe(2050);
    expect(host.ownsWeapon('pump')).toBe(false);
    expect(supplies.items.some((i) => i.key === 'pump')).toBe(false);
  });

  it('will not buy your last gun', () => {
    const { trader, supplies, host } = setup(0);
    const r = trader.sell(supplies.items.find((i) => i.kind === 'weapon')!);
    expect(r).toMatchObject({ ok: false, reason: 'last' });
    expect(host.coins).toBe(0);
  });

  it('cannot sell something you do not have', () => {
    const { trader } = setup();
    const ghost: Item = makeItem('treasure', 'idol');
    expect(trader.sell(ghost)).toMatchObject({ ok: false, reason: 'nothing' });
  });
});

describe('upgrades', () => {
  it('each level costs more than the last', () => {
    const { trader } = setup(100000);
    const costs: number[] = [];
    for (let i = 0; i < 5; i++) {
      costs.push(trader.upgradeCost('pistol', 'firepower')!);
      expect(trader.upgrade('pistol', 'firepower').ok).toBe(true);
    }
    expect(costs).toEqual([1000, 2000, 3000, 4000, 5000]);
    expect(trader.upgradeCost('pistol', 'firepower')).toBeNull();
    expect(trader.upgrade('pistol', 'firepower')).toMatchObject({ ok: false, reason: 'maxed' });
  });

  it('needs the money, and only works on guns you own', () => {
    const { trader, host } = setup(500);
    expect(trader.upgrade('pistol', 'firepower')).toMatchObject({ ok: false, reason: 'money' });
    expect(host.coins).toBe(500);
    expect(trader.upgrade('pump', 'reload')).toMatchObject({ ok: false, reason: 'nothing' });
  });

  it('the Exclusive Upgrade needs every stat at the top, then costs its price', () => {
    const { trader, host, upgrades } = setup(1_000_000);
    expect(trader.buyExclusive('pistol')).toMatchObject({ ok: false, reason: 'locked' });
    for (const s of UPGRADE_STATS) while (upgrades.canUpgrade('pistol', s)) trader.upgrade('pistol', s);
    const before = host.coins;
    expect(trader.buyExclusive('pistol').ok).toBe(true);
    expect(host.coins).toBe(before - 6000);
    expect(trader.buyExclusive('pistol')).toMatchObject({ ok: false, reason: 'owned' });
  });
});

describe('the knife and the case', () => {
  it('repairs the knife in proportion to the wear', () => {
    const { trader, host } = setup(1000);
    expect(trader.knifeRepairCost()).toBe(600);
    expect(trader.repairKnife().ok).toBe(true);
    expect(host.coins).toBe(400);
    expect(host.knifeCondition()).toBe(1);
    expect(trader.knifeRepairCost()).toBe(0);
    expect(trader.repairKnife()).toMatchObject({ ok: false, reason: 'maxed' });
  });

  it('sells bigger cases one after another, up to the biggest', () => {
    const { trader, host, supplies } = setup(100000);
    expect(trader.nextCase()).toMatchObject({ w: 7, h: 12, price: 3000 });
    expect(trader.buyCase().ok).toBe(true);
    expect([supplies.grid.width, supplies.grid.height]).toEqual([7, 12]);
    trader.buyCase();
    trader.buyCase();
    trader.buyCase();
    expect([supplies.grid.width, supplies.grid.height]).toEqual([9, 13]);
    expect(trader.nextCase()).toBeNull();
    expect(trader.buyCase()).toMatchObject({ ok: false, reason: 'maxed' });
    expect(host.coins).toBe(100000 - 3000 - 6000 - 9000 - 15000);
  });

  it('cannot buy a case without the money', () => {
    const { trader, supplies } = setup(100);
    expect(trader.buyCase()).toMatchObject({ ok: false, reason: 'money' });
    expect(supplies.caseTier).toBe(0);
  });

  it('the case sizes are the ones in the brief', () => {
    expect(CASE_TIERS.map((t) => `${t.w}x${t.h}`)).toEqual(['7x10', '7x12', '8x12', '8x13', '9x13']);
  });
});
