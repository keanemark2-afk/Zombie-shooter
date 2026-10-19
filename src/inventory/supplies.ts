import { herbEffect, mixHerbs } from '../combat/health';
import { makeItem, type GrenadeKind, type Item, type ItemKind } from './items';

/**
 * What you carry besides your guns: herbs, sprays, grenades, treasure and
 * gun attachments, plus your coins. The attache case (Phase 5) lays the items
 * out on a grid and can refuse an item that doesn't fit, by setting `fits`.
 */
export class Supplies {
  coins = 0;
  items: Item[] = [];
  /** Can this item be added right now? (The case says no when it is full.) */
  fits: (item: Item) => boolean = () => true;
  /** Called whenever the list changes (the HUD redraws). */
  onChange: () => void = () => {};

  add(item: Item): boolean {
    if (!this.fits(item)) return false;
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
    this.onChange();
    return a;
  }

  clear(): void {
    this.coins = 0;
    this.items = [];
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
