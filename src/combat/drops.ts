import type { Herb } from './health';
import type { GrenadeKind } from '../inventory/items';
import { TREASURES } from '../inventory/items';

// What an enemy, a crate or a barrel drops. All the rules are in this one
// function so they can be unit-tested:
//  - ammo only drops for guns you are carrying,
//  - the lower your ammo for a gun, the more likely its ammo drops,
//  - the fewer healing items you carry, the more likely herbs drop,
//  - otherwise it is coins, treasure or grenades.

export interface DropGun {
  weapon: string;
  /** Spare rounds you carry for it. */
  reserve: number;
  /** The most spare rounds you would normally carry. */
  maxReserve: number;
}

export interface DropContext {
  guns: readonly DropGun[];
  /** How many healing items (herbs, sprays) you carry. */
  healItems: number;
  /** Scales the coin pile (a tougher enemy drops more). */
  coinScale: number;
  /** Scales how often anything drops (hidden difficulty, lucky crates...). */
  luck: number;
  /** Can grenades drop? */
  grenades: boolean;
}

export interface DropRules {
  chance: number;
  ammoWeight: number;
  lowAmmoBoost: number;
  herbWeight: number;
  lowHealingBoost: number;
  coinWeight: number;
  treasureWeight: number;
  grenadeWeight: number;
  coinsMin: number;
  coinsMax: number;
  ammoPerPickup: Record<string, number>;
}

export type Drop =
  | { type: 'ammo'; weapon: string; amount: number }
  | { type: 'herb'; herb: Herb }
  | { type: 'spray' }
  | { type: 'coins'; amount: number }
  | { type: 'treasure'; treasure: string }
  | { type: 'grenade'; grenade: GrenadeKind };

interface Entry {
  weight: number;
  make: () => Drop;
}

function pick<T extends { weight: number }>(entries: readonly T[], random: () => number): T | null {
  const total = entries.reduce((a, e) => a + e.weight, 0);
  if (total <= 0) return null;
  let r = random() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return entries[entries.length - 1];
}

/** How likely a gun's ammo is to drop, relative to the base weight (higher when you are running low). */
export function ammoWeight(gun: DropGun, rules: Pick<DropRules, 'ammoWeight' | 'lowAmmoBoost'>): number {
  const fraction = gun.maxReserve > 0 ? Math.max(0, Math.min(1, gun.reserve / gun.maxReserve)) : 1;
  return rules.ammoWeight * (0.1 + (1 - fraction) * rules.lowAmmoBoost);
}

/** How likely herbs are, relative to the base weight (higher when you carry few healing items). */
export function herbWeight(healItems: number, rules: Pick<DropRules, 'herbWeight' | 'lowHealingBoost'>): number {
  return rules.herbWeight * (0.1 + rules.lowHealingBoost / (1 + Math.max(0, healItems)));
}

export function rollDrop(ctx: DropContext, rules: DropRules, random: () => number = Math.random): Drop | null {
  if (random() >= Math.min(1, rules.chance * ctx.luck)) return null;
  const entries: Entry[] = [];
  for (const g of ctx.guns) {
    const amount = rules.ammoPerPickup[g.weapon] ?? 0;
    if (amount <= 0) continue;
    entries.push({ weight: ammoWeight(g, rules), make: () => ({ type: 'ammo', weapon: g.weapon, amount }) });
  }
  const herbs = herbWeight(ctx.healItems, rules);
  const kinds: Array<{ weight: number; make: () => Drop }> = [
    { weight: 0.58, make: () => ({ type: 'herb', herb: 'G' }) },
    { weight: 0.18, make: () => ({ type: 'herb', herb: 'R' }) },
    { weight: 0.12, make: () => ({ type: 'herb', herb: 'Y' }) },
    { weight: 0.12, make: () => ({ type: 'spray' }) },
  ];
  entries.push({ weight: herbs, make: () => pick(kinds, random)!.make() });
  entries.push({
    weight: rules.coinWeight,
    make: () => {
      const base = rules.coinsMin + random() * (rules.coinsMax - rules.coinsMin);
      return { type: 'coins', amount: Math.max(1, Math.round((base * ctx.coinScale) / 10) * 10) };
    },
  });
  const treasures = Object.keys(TREASURES);
  entries.push({
    weight: rules.treasureWeight,
    // The cheaper gems are far more common than a crown.
    make: () => {
      const weights = treasures.map((id) => ({ id, weight: 1 / Math.sqrt(TREASURES[id].value) }));
      return { type: 'treasure', treasure: pick(weights, random)!.id };
    },
  });
  if (ctx.grenades) {
    const grenades: GrenadeKind[] = ['frag', 'frag', 'flash', 'fire'];
    entries.push({ weight: rules.grenadeWeight, make: () => ({ type: 'grenade', grenade: grenades[Math.floor(random() * grenades.length)] }) });
  }
  return pick(entries, random)?.make() ?? null;
}
