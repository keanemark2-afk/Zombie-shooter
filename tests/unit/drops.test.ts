import { describe, expect, it } from 'vitest';
import { ammoWeight, herbWeight, rollDrop, type DropContext, type DropRules } from '../../src/combat/drops';

const rules: DropRules = {
  chance: 1,
  ammoWeight: 1,
  lowAmmoBoost: 4,
  herbWeight: 0.7,
  lowHealingBoost: 5,
  coinWeight: 1.1,
  treasureWeight: 0.14,
  grenadeWeight: 0.12,
  coinsMin: 40,
  coinsMax: 160,
  ammoPerPickup: { pistol: 12, pump: 6, smg: 40, rocket: 1 },
};

/** A small deterministic random-number generator, so the tests give the same answer every time. */
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function ctx(over: Partial<DropContext> = {}): DropContext {
  return {
    guns: [{ weapon: 'pistol', reserve: 20, maxReserve: 60 }],
    healItems: 2,
    coinScale: 1,
    luck: 1,
    grenades: true,
    ...over,
  };
}

function tally(c: DropContext, n = 4000, r = rules, seed = 7): Record<string, number> {
  const random = rng(seed);
  const out: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const d = rollDrop(c, r, random);
    const key = d ? (d.type === 'ammo' ? `ammo:${d.weapon}` : d.type) : 'nothing';
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

describe('rollDrop', () => {
  it('only ever drops ammo for guns you are carrying', () => {
    const t = tally(ctx({ guns: [{ weapon: 'pistol', reserve: 0, maxReserve: 60 }] }));
    expect(t['ammo:pistol']).toBeGreaterThan(0);
    expect(Object.keys(t).filter((k) => k.startsWith('ammo:') && k !== 'ammo:pistol')).toEqual([]);
  });

  it('drops no ammo at all when you carry no guns that use it', () => {
    const t = tally(ctx({ guns: [] }));
    expect(Object.keys(t).some((k) => k.startsWith('ammo:'))).toBe(false);
  });

  it('drops ammo more often when you are low on it', () => {
    const low = tally(ctx({ guns: [{ weapon: 'pistol', reserve: 0, maxReserve: 60 }] }));
    const full = tally(ctx({ guns: [{ weapon: 'pistol', reserve: 60, maxReserve: 60 }] }));
    expect(low['ammo:pistol']).toBeGreaterThan((full['ammo:pistol'] ?? 0) * 3);
  });

  it('favours the gun you are lowest on', () => {
    const t = tally(ctx({ guns: [{ weapon: 'pistol', reserve: 60, maxReserve: 60 }, { weapon: 'pump', reserve: 0, maxReserve: 24 }] }));
    expect(t['ammo:pump']).toBeGreaterThan(t['ammo:pistol'] * 3);
  });

  it('drops herbs more often when you carry few healing items', () => {
    const none = tally(ctx({ healItems: 0 }));
    const lots = tally(ctx({ healItems: 8 }));
    expect((none.herb ?? 0) + (none.spray ?? 0)).toBeGreaterThan(((lots.herb ?? 0) + (lots.spray ?? 0)) * 3);
  });

  it('otherwise drops coins, with the odd treasure and grenade', () => {
    const t = tally(ctx());
    expect(t.coins).toBeGreaterThan(0);
    expect(t.treasure).toBeGreaterThan(0);
    expect(t.grenade).toBeGreaterThan(0);
    expect(tally(ctx({ grenades: false })).grenade).toBeUndefined();
  });

  it('sometimes drops nothing, and a lucky roll drops more often', () => {
    const half = { ...rules, chance: 0.5 };
    const t = tally(ctx(), 4000, half);
    expect(t.nothing).toBeGreaterThan(1500);
    expect(t.nothing).toBeLessThan(2500);
    const lucky = tally(ctx({ luck: 2 }), 4000, half);
    expect(lucky.nothing ?? 0).toBe(0);
  });

  it('scales the coin pile', () => {
    const random = rng(3);
    let small = 0;
    let big = 0;
    for (let i = 0; i < 400; i++) {
      const a = rollDrop(ctx({ guns: [], healItems: 99 }), { ...rules, treasureWeight: 0, grenadeWeight: 0, herbWeight: 0 }, random);
      if (a?.type === 'coins') small += a.amount;
      const b = rollDrop(ctx({ guns: [], healItems: 99, coinScale: 8 }), { ...rules, treasureWeight: 0, grenadeWeight: 0, herbWeight: 0 }, random);
      if (b?.type === 'coins') big += b.amount;
    }
    expect(big).toBeGreaterThan(small * 6);
  });
});

describe('weights', () => {
  it('grow as ammo or healing items run down', () => {
    const g = { weapon: 'pistol', maxReserve: 60 };
    expect(ammoWeight({ ...g, reserve: 0 }, rules)).toBeGreaterThan(ammoWeight({ ...g, reserve: 30 }, rules));
    expect(ammoWeight({ ...g, reserve: 30 }, rules)).toBeGreaterThan(ammoWeight({ ...g, reserve: 60 }, rules));
    expect(herbWeight(0, rules)).toBeGreaterThan(herbWeight(3, rules));
  });
});
