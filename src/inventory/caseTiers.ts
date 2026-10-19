// The attache cases the Trader sells, smallest first (you start with the first).

/** The case sizes the Trader sells, smallest first. */
export const CASE_TIERS: ReadonlyArray<{ w: number; h: number; name: string; perk: string; coinBonus: number; pistolAmmoBonus: number }> = [
  { w: 7, h: 10, name: 'Standard case', perk: '', coinBonus: 0, pistolAmmoBonus: 0 },
  { w: 7, h: 12, name: 'Tall case', perk: 'Enemies drop 10% more coins.', coinBonus: 0.1, pistolAmmoBonus: 0 },
  { w: 8, h: 12, name: 'Wide case', perk: 'Enemies drop 10% more coins, and pistol ammo comes in bigger boxes.', coinBonus: 0.1, pistolAmmoBonus: 0.25 },
  { w: 8, h: 13, name: 'Deep case', perk: 'Enemies drop 20% more coins, and pistol ammo comes in bigger boxes.', coinBonus: 0.2, pistolAmmoBonus: 0.25 },
  { w: 9, h: 13, name: 'Grand case', perk: 'Enemies drop 30% more coins, and pistol ammo boxes are 50% bigger.', coinBonus: 0.3, pistolAmmoBonus: 0.5 },
];
