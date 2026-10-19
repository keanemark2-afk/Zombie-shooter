import { herbEffect, mixHerbs } from '../combat/health';
import { CASE_TIERS } from './caseTiers';
import { CaseGrid } from './grid';
import { itemDef, makeItem, type GrenadeKind, type Item, type ItemKind } from './items';

/**
 * What you carry besides your guns: herbs, sprays, grenades, treasure and
 * gun attachments, plus your coins. The attache case (Phase 5) lays the items
 * out on a grid and can refuse an item that doesn't fit, by setting `fits`.
 */
export class Supplies {
  coins = 0;
  items: Item[] = [];
  /** Where each item sits in the attache case. */
  readonly grid = new CaseGrid<Item>(CASE_TIERS[0].w, CASE_TIERS[0].h, (it) => itemDef(it));
  /** Which case you own (an index into CASE_TIERS). */
  caseTier = 0;
  /** No limit on what you carry (the practice range). */
  unlimited = false;
  /** Called whenever the list changes (the HUD redraws). */
  onChange: () => void = () => {};

  /** Can this item be added right now? (The case says no when it is full.) */
  fits(item: Item): boolean {
    return this.unlimited || this.grid.hasRoomFor(item);
  }

  add(item: Item): boolean {
    if (!this.unlimited && !this.grid.autoPlace(item)) return false;
    this.items.push(item);
    this.onChange();
    return true;
  }

  addNew(kind: ItemKind, key: string): Item | null {
    const item = makeItem(kind, key);
    return this.add(item) ? item : null;
  }

  remove(id: number): Item | null {
    const i = this.items.findIndex((it) => it.id === id);
    if (i < 0) return null;
    const [item] = this.items.splice(i, 1);
    this.grid.remove(item);
    this.onChange();
    return item;
  }

  count(kind: ItemKind, key?: string): number {
    return this.items.filter((it) => it.kind === kind && (key === undefined || it.key === key)).length;
  }

  grenades(kind: GrenadeKind): Item[] {
    return this.items.filter((it) => it.kind === 'grenade' && it.key === kind);
  }

  /** How many healing items you carry (herbs that do something, and sprays). */
  get healItems(): number {
    return this.items.filter((it) => it.kind === 'spray' || (it.kind === 'herb' && herbEffect(it.key) !== null)).length;
  }

  /** Mixes two herbs into one. Returns the new item, or null if they don't go together. */
  combine(aId: number, bId: number): Item | null {
    const a = this.items.find((it) => it.id === aId);
    const b = this.items.find((it) => it.id === bId);
    if (!a || !b || a === b || a.kind !== 'herb' || b.kind !== 'herb') return null;
    const key = mixHerbs(a.key, b.key);
    if (!key) return null;
    a.key = key;
    this.items.splice(this.items.indexOf(b), 1);
    this.grid.remove(b);
    this.onChange();
    return a;
  }

  /** Packs the case tidily. */
  sort(): boolean {
    const ok = this.grid.sort();
    this.onChange();
    return ok;
  }

  /** Swaps to a bigger case; everything in it stays where it is. */
  upgradeCase(tier: number): void {
    const t = CASE_TIERS[Math.min(tier, CASE_TIERS.length - 1)];
    this.caseTier = Math.min(tier, CASE_TIERS.length - 1);
    this.grid.resize(t.w, t.h);
    this.onChange();
  }

  clear(): void {
    this.coins = 0;
    this.items = [];
    this.grid.clear();
    this.caseTier = 0;
    this.grid.width = CASE_TIERS[0].w;
    this.grid.height = CASE_TIERS[0].h;
    this.onChange();
  }
}

/**
 * Which healing item the quick-heal key uses. Mixtures that heal fully come
 * first when you are badly hurt; a first-aid spray is kept for emergencies;
 * a plain green herb is used for small wounds. Mixtures that raise your
 * maximum health are never used by accident.
 */
export function chooseHealItem(items: readonly Item[], healthFraction: number): Item | null {
  const heals = items.filter((it) => it.kind === 'spray' || (it.kind === 'herb' && herbEffect(it.key) !== null));
  if (heals.length === 0) return null;
  const score = (it: Item): number => {
    if (it.kind === 'spray') return healthFraction < 0.45 ? 80 : 20;
    const e = herbEffect(it.key)!;
    if (e.raiseMax > 0) return 0; // keep these for the case screen
    if (e.heal === 'full') return healthFraction < 0.6 ? 90 : 30;
    // Prefer the smallest herb that is enough, so nothing is wasted.
    const missing = (1 - healthFraction) * 100;
    return 60 - Math.abs(e.heal - missing) * 0.3 - it.key.length;
  };
  const best = [...heals].sort((a, b) => score(b) - score(a))[0];
  return score(best) > 0 ? best : null;
}
