import { herbEffect } from '../combat/health';
import { WEAPONS } from '../combat/weapons';

// Everything you can carry that isn't a gun or its ammo: herbs, sprays,
// grenades, treasure and gun attachments. The same item list is shown in the
// attache case (Phase 5) and sold at the Trader.

export type GrenadeKind = 'frag' | 'flash' | 'fire';

export type ItemKind = 'herb' | 'spray' | 'grenade' | 'treasure' | 'attachment' | 'weapon';

export interface Item {
  id: number;
  kind: ItemKind;
  /**
   * Which one: for a herb, its mixture ("G", "GR"...); for a grenade, its kind;
   * for treasure, its name; for an attachment, its name.
   */
  key: string;
  /** Position in the case grid (set once it is placed). */
  x?: number;
  y?: number;
  /** Turned on its side in the case. */
  rot?: boolean;
}

export interface ItemDef {
  name: string;
  /** Size in the case grid, in squares (width, height) before any turning. */
  w: number;
  h: number;
  /** What the Trader pays for it. */
  value: number;
  /** A colour to draw it in. */
  color: string;
  blurb: string;
}

export const TREASURES: Record<string, { name: string; value: number; w: number; h: number; color: string }> = {
  gemRed: { name: 'Red gem', value: 800, w: 1, h: 1, color: '#d6283c' },
  gemGreen: { name: 'Green gem', value: 1000, w: 1, h: 1, color: '#2fbf6a' },
  gemBlue: { name: 'Blue gem', value: 1400, w: 1, h: 1, color: '#3b82e0' },
  goldBar: { name: 'Gold bar', value: 2200, w: 2, h: 1, color: '#e0b43a' },
  idol: { name: 'Stone idol', value: 3200, w: 1, h: 2, color: '#a99b7c' },
  chalice: { name: 'Silver chalice', value: 3800, w: 1, h: 2, color: '#bfc4cc' },
  crown: { name: 'Jewelled crown', value: 6000, w: 2, h: 2, color: '#f2c94c' },
};

const HERB_COLOR: Record<string, string> = { G: '#4fc04a', R: '#d6403a', Y: '#e6c93a' };

export const ATTACHMENTS: Record<string, { name: string; value: number; w: number; h: number; blurb: string }> = {
  stock: { name: 'Steadying stock', value: 3000, w: 2, h: 1, blurb: 'Fits long guns: the reticle tightens faster and sways less.' },
  scope: { name: 'Sight scope', value: 4500, w: 2, h: 1, blurb: 'Fits the SMG and the pistols: aiming zooms in a little.' },
  longMag: { name: 'Long magazine', value: 3500, w: 1, h: 2, blurb: 'Fits magazine guns: holds a third more rounds.' },
};

export function itemDef(item: Pick<Item, 'kind' | 'key'>): ItemDef {
  switch (item.kind) {
    case 'herb': {
      const names: Record<string, string> = { G: 'Green herb', R: 'Red herb', Y: 'Yellow herb' };
      const name = names[item.key] ?? `Mixed herb (${item.key.split('').join('+')})`;
      const effect = herbEffect(item.key);
      const blurb = item.key.length === 1 && !effect ? 'Useless alone: mix it with a green herb.' : item.key === 'G' ? 'Restores some health.' : 'A mixed herb.';
      return {
        name,
        w: 1,
        h: 2,
        value: 100 * item.key.length,
        color: item.key.length === 1 ? HERB_COLOR[item.key] : '#7fbf3a',
        blurb,
      };
    }
    case 'spray':
      return { name: 'First-aid spray', w: 1, h: 2, value: 1200, color: '#9fd4e8', blurb: 'Restores all your health.' };
    case 'grenade': {
      const names: Record<string, [string, string, number]> = {
        frag: ['Frag grenade', 'Explodes. Hurts everything nearby.', 300],
        flash: ['Flash grenade', 'Blinds and stuns. Kills parasites instantly.', 400],
        fire: ['Incendiary grenade', 'Sets the ground and everything on it alight.', 400],
      };
      const [name, blurb, value] = names[item.key] ?? names.frag;
      return { name, w: 1, h: 2, value, color: item.key === 'flash' ? '#e8e8d0' : item.key === 'fire' ? '#e8742a' : '#6a7a4a', blurb };
    }
    case 'treasure': {
      const t = TREASURES[item.key] ?? TREASURES.gemRed;
      return { name: t.name, w: t.w, h: t.h, value: t.value, color: t.color, blurb: 'Worth a lot to the Trader.' };
    }
    case 'attachment': {
      const a = ATTACHMENTS[item.key] ?? ATTACHMENTS.stock;
      return { name: a.name, w: a.w, h: a.h, value: Math.round(a.value * 0.5), color: '#8f9aa6', blurb: a.blurb };
    }
    case 'weapon': {
      const size = WEAPON_SIZES[item.key] ?? WEAPON_SIZES.pistol;
      const name = WEAPONS.find((w) => w.id === item.key)?.name ?? item.key;
      // The Trader decides what a gun sells for (a share of its price).
      return { name, w: size.w, h: size.h, value: 0, color: size.color, blurb: 'A gun. Drag an attachment onto it to fit it.' };
    }
  }
}

/** How much room each gun takes up in the case (before turning it on its side). */
export const WEAPON_SIZES: Record<string, { w: number; h: number; color: string }> = {
  pistol: { w: 3, h: 2, color: '#6c7480' },
  heavy: { w: 3, h: 2, color: '#7a6a58' },
  swift: { w: 3, h: 2, color: '#587a6e' },
  magnum: { w: 4, h: 2, color: '#8a7a5a' },
  smg: { w: 4, h: 3, color: '#5a6478' },
  pump: { w: 7, h: 2, color: '#7a5a46' },
  drum: { w: 7, h: 2, color: '#6a4a3a' },
  rifle: { w: 8, h: 2, color: '#5d6b4a' },
  rocket: { w: 8, h: 3, color: '#6b6a3a' },
};

let nextItemId = 1;

export function makeItem(kind: ItemKind, key: string): Item {
  return { id: nextItemId++, kind, key };
}
