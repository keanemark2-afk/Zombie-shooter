import { ATTACHMENT_NAMES, EXCLUSIVES, UPGRADE_STATS, STAT_NAMES, type UpgradeStat, type WeaponUpgrades } from '../combat/upgrades';
import { tuning } from '../config/tuning';
import { CASE_TIERS } from './caseTiers';
import { itemDef, type Item, type ItemKind } from './items';

export { CASE_TIERS };

// The Trader's rules: what is for sale, what things sell for, what upgrades
// cost, and the transactions themselves. Free of graphics so it can be
// unit-tested; the game gives the Trader a `TraderHost` to work through.

/** What the Trader charges and pays (the `shop` section of tuning.ts). */
export interface ShopPrices {
  weapon: Record<string, number>;
  /** Price of one pack of ammo, by gun. */
  ammoPack: Record<string, number>;
  /** Rounds in one pack, by gun. */
  ammoAmount: Record<string, number>;
  herbG: number;
  herbR: number;
  herbY: number;
  spray: number;
  frag: number;
  flash: number;
  fire: number;
  stock: number;
  scope: number;
  longMag: number;
  /** The base cost of one level of an upgrade, by gun (the level number and the stat's factor multiply it). */
  upgradeBase: Record<string, number>;
  upgradeFactor: Record<UpgradeStat, number>;
  exclusive: Record<string, number>;
  /** Price of a completely worn knife (repairs cost in proportion to the wear). */
  knifeRepair: number;
  /** Case prices for the next four sizes. */
  caseUpgrade: number[];
  /** Guns and attachments sell for this fraction of their price. */
  sellFraction: number;
}

/** The prices as set in tuning.ts (read each time so F1 changes apply at once). */
export function tuningPrices(): ShopPrices {
  const t = tuning.shop;
  return {
    weapon: t.weapon,
    ammoPack: t.ammoPack,
    ammoAmount: tuning.drops.ammoPerPickup,
    herbG: t.herbG,
    herbR: t.herbR,
    herbY: t.herbY,
    spray: t.spray,
    frag: t.frag,
    flash: t.flash,
    fire: t.fire,
    stock: t.stock,
    scope: t.scope,
    longMag: t.longMag,
    upgradeBase: t.upgradeBase,
    upgradeFactor: { firepower: t.factorFirepower, fireRate: t.factorFireRate, reload: t.factorReload, capacity: t.factorCapacity },
    exclusive: t.exclusive,
    knifeRepair: t.knifeRepair,
    caseUpgrade: [t.caseTall, t.caseWide, t.caseDeep, t.caseGrand],
    sellFraction: t.sellFraction,
  };
}

export type Failure = 'money' | 'room' | 'maxed' | 'owned' | 'locked' | 'last' | 'nothing' | 'unknown' | 'fit';
export type Outcome = { ok: true; message: string } | { ok: false; reason: Failure; message: string };

/** What the Trader needs from the game. */
export interface TraderHost {
  coins: number;
  items(): readonly Item[];
  /** Adds a new item to the case. False if there is no room. */
  addItem(kind: ItemKind, key: string): boolean;
  removeItem(id: number): void;
  /** Number of guns in the case. */
  weaponCount(): number;
  ownsWeapon(id: string): boolean;
  weaponName(id: string): string;
  /** Spare ammo carried and the most that can be carried, or null if the gun isn't carried. */
  ammo(id: string): { reserve: number; max: number } | null;
  addAmmo(id: string, amount: number): number;
  /** Knife condition, 0 (broken) to 1 (new). */
  knifeCondition(): number;
  repairKnife(): void;
  caseTier(): number;
  upgradeCase(): void;
  upgrades: WeaponUpgrades;
}

export interface Offer {
  id: string;
  group: 'weapon' | 'ammo' | 'supply' | 'attachment';
  name: string;
  blurb: string;
  price: number;
  /** What it adds to the case (if it is an item). */
  item?: { kind: ItemKind; key: string };
  weapon?: string;
}

const fail = (reason: Failure, message: string): Outcome => ({ ok: false, reason, message });
const done = (message: string): Outcome => ({ ok: true, message });

export class Trader {
  constructor(
    private readonly host: TraderHost,
    private readonly prices: () => ShopPrices,
    /** Names and descriptions of every gun that exists. */
    private readonly weaponIds: readonly string[],
  ) {}

  /** Everything on the Buy tab right now. */
  offers(): Offer[] {
    const p = this.prices();
    const h = this.host;
    const out: Offer[] = [];
    for (const id of this.weaponIds) {
      if (h.ownsWeapon(id)) continue;
      out.push({ id: `weapon:${id}`, group: 'weapon', name: h.weaponName(id), blurb: 'A new gun for your case.', price: p.weapon[id] ?? 5000, item: { kind: 'weapon', key: id }, weapon: id });
    }
    for (const id of this.weaponIds) {
      const a = h.ammo(id);
      if (!a) continue;
      out.push({ id: `ammo:${id}`, group: 'ammo', name: `${h.weaponName(id)} ammo (${p.ammoAmount[id] ?? 10})`, blurb: `You carry ${a.reserve} of ${a.max}.`, price: p.ammoPack[id] ?? 200, weapon: id });
    }
    const supply = (key: string, kind: ItemKind, k: string, price: number) => {
      const def = itemDef({ kind, key: k });
      out.push({ id: key, group: 'supply', name: def.name, blurb: def.blurb, price, item: { kind, key: k } });
    };
    supply('herbG', 'herb', 'G', p.herbG);
    supply('herbR', 'herb', 'R', p.herbR);
    supply('herbY', 'herb', 'Y', p.herbY);
    supply('spray', 'spray', 'spray', p.spray);
    supply('frag', 'grenade', 'frag', p.frag);
    supply('flash', 'grenade', 'flash', p.flash);
    supply('fire', 'grenade', 'fire', p.fire);
    for (const key of ['stock', 'scope', 'longMag'] as const) {
      out.push({ id: `attach:${key}`, group: 'attachment', name: ATTACHMENT_NAMES[key], blurb: itemDef({ kind: 'attachment', key }).blurb, price: p[key], item: { kind: 'attachment', key } });
    }
    return out;
  }

  buy(offer: Offer): Outcome {
    const h = this.host;
    if (h.coins < offer.price) return fail('money', 'Not enough coins.');
    if (offer.group === 'ammo') {
      const w = offer.weapon!;
      const a = h.ammo(w);
      if (!a || a.reserve >= a.max) return fail('maxed', 'You are already carrying all the ammo you can.');
      const added = h.addAmmo(w, this.prices().ammoAmount[w] ?? 10);
      if (added <= 0) return fail('maxed', 'You are already carrying all the ammo you can.');
      h.coins -= offer.price;
      return done(`Bought ${added} rounds.`);
    }
    if (!offer.item) return fail('unknown', 'Not for sale.');
    if (offer.weapon && h.ownsWeapon(offer.weapon)) return fail('owned', 'You already have that gun.');
    if (!h.addItem(offer.item.kind, offer.item.key)) return fail('room', 'No room in your case.');
    h.coins -= offer.price;
    return done(`Bought ${offer.name}.`);
  }

  /** What the Trader pays for an item. */
  sellPrice(item: Item): number {
    const p = this.prices();
    if (item.kind === 'weapon') return Math.round((p.weapon[item.key] ?? 0) * p.sellFraction);
    if (item.kind === 'attachment') return Math.round((p[item.key as 'stock'] ?? 0) * p.sellFraction);
    return itemDef(item).value;
  }

  sell(item: Item): Outcome {
    const h = this.host;
    if (!h.items().some((it) => it.id === item.id)) return fail('nothing', 'You do not have that.');
    if (item.kind === 'weapon' && h.weaponCount() <= 1) return fail('last', 'You cannot sell your only gun.');
    const price = this.sellPrice(item);
    h.removeItem(item.id);
    h.coins += price;
    return done(`Sold ${itemDef(item).name} for ${price.toLocaleString('en-US')}.`);
  }

  /** What the next level of this stat costs (null when it is maxed). */
  upgradeCost(gun: string, stat: UpgradeStat): number | null {
    const u = this.host.upgrades;
    if (!u.canUpgrade(gun, stat)) return null;
    const p = this.prices();
    return Math.round((p.upgradeBase[gun] ?? 1500) * (u.level(gun, stat) + 1) * (p.upgradeFactor[stat] ?? 1));
  }

  upgrade(gun: string, stat: UpgradeStat): Outcome {
    const h = this.host;
    if (!h.ownsWeapon(gun)) return fail('nothing', 'You do not have that gun.');
    const cost = this.upgradeCost(gun, stat);
    if (cost === null) return fail('maxed', `${STAT_NAMES[stat]} is already at its best.`);
    if (h.coins < cost) return fail('money', 'Not enough coins.');
    h.upgrades.upgrade(gun, stat);
    h.coins -= cost;
    return done(`${STAT_NAMES[stat]} improved.`);
  }

  exclusiveCost(gun: string): number {
    return this.prices().exclusive[gun] ?? 20000;
  }

  buyExclusive(gun: string): Outcome {
    const h = this.host;
    if (!h.ownsWeapon(gun)) return fail('nothing', 'You do not have that gun.');
    if (h.upgrades.hasExclusive(gun)) return fail('owned', 'You already have that upgrade.');
    if (!h.upgrades.canBuyExclusive(gun)) return fail('locked', 'Upgrade every stat to the top first.');
    const cost = this.exclusiveCost(gun);
    if (h.coins < cost) return fail('money', 'Not enough coins.');
    h.upgrades.buyExclusive(gun);
    h.coins -= cost;
    return done(`${EXCLUSIVES[gun]?.name ?? 'Exclusive upgrade'} unlocked.`);
  }

  /** What it costs to put the knife right (0 when it is as good as new). */
  knifeRepairCost(): number {
    const wear = 1 - this.host.knifeCondition();
    return wear <= 0.005 ? 0 : Math.max(50, Math.round(this.prices().knifeRepair * wear));
  }

  repairKnife(): Outcome {
    const cost = this.knifeRepairCost();
    if (cost === 0) return fail('maxed', 'Your knife is as good as new.');
    if (this.host.coins < cost) return fail('money', 'Not enough coins.');
    this.host.repairKnife();
    this.host.coins -= cost;
    return done('Knife sharpened and mended.');
  }

  /** The next case up, or null if you already have the biggest. */
  nextCase(): { tier: number; w: number; h: number; name: string; perk: string; price: number } | null {
    const tier = this.host.caseTier() + 1;
    if (tier >= CASE_TIERS.length) return null;
    const t = CASE_TIERS[tier];
    return { tier, w: t.w, h: t.h, name: t.name, perk: t.perk, price: this.prices().caseUpgrade[tier - 1] ?? 10000 };
  }

  buyCase(): Outcome {
    const next = this.nextCase();
    if (!next) return fail('maxed', 'You already have the biggest case.');
    if (this.host.coins < next.price) return fail('money', 'Not enough coins.');
    this.host.upgradeCase();
    this.host.coins -= next.price;
    return done(`${next.name} bought.`);
  }
}

/** Every stat in the order the Upgrade tab shows them. */
export const UPGRADE_ORDER = UPGRADE_STATS;
