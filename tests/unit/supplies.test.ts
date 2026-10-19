import { describe, expect, it } from 'vitest';
import { makeItem } from '../../src/inventory/items';
import { chooseHealItem, Supplies } from '../../src/inventory/supplies';

describe('Supplies', () => {
  it('holds items and counts them', () => {
    const s = new Supplies();
    s.addNew('herb', 'G');
    s.addNew('herb', 'G');
    s.addNew('herb', 'R');
    s.addNew('grenade', 'frag');
    expect(s.count('herb')).toBe(3);
    expect(s.count('herb', 'G')).toBe(2);
    expect(s.grenades('frag')).toHaveLength(1);
  });

  it('counts only healing items that do something', () => {
    const s = new Supplies();
    s.addNew('herb', 'R'); // useless alone
    expect(s.healItems).toBe(0);
    s.addNew('herb', 'G');
    s.addNew('spray', 'spray');
    expect(s.healItems).toBe(2);
  });

  it('refuses an item when full', () => {
    const s = new Supplies();
    s.fits = () => false;
    expect(s.addNew('herb', 'G')).toBeNull();
    expect(s.items).toHaveLength(0);
  });

  it('mixes herbs: the second one is used up', () => {
    const s = new Supplies();
    const g = s.addNew('herb', 'G')!;
    const r = s.addNew('herb', 'R')!;
    const mixed = s.combine(g.id, r.id);
    expect(mixed?.key).toBe('GR');
    expect(s.items).toHaveLength(1);
    expect(s.count('herb', 'R')).toBe(0);
  });

  it('will not mix things that do not go together', () => {
    const s = new Supplies();
    const r1 = s.addNew('herb', 'R')!;
    const r2 = s.addNew('herb', 'R')!;
    const nade = s.addNew('grenade', 'frag')!;
    expect(s.combine(r1.id, r2.id)).toBeNull();
    expect(s.combine(r1.id, nade.id)).toBeNull();
    expect(s.items).toHaveLength(3);
  });

  it('tells the screen when something changes', () => {
    const s = new Supplies();
    let changes = 0;
    s.onChange = () => changes++;
    const h = s.addNew('herb', 'G')!;
    s.remove(h.id);
    expect(changes).toBe(2);
  });
});

describe('chooseHealItem', () => {
  const herb = (key: string) => makeItem('herb', key);

  it('uses nothing when there is nothing to use', () => {
    expect(chooseHealItem([], 0.3)).toBeNull();
    expect(chooseHealItem([herb('R'), herb('Y')], 0.3)).toBeNull();
  });

  it('uses a green herb for a small wound rather than a full-heal mixture', () => {
    const g = herb('G');
    expect(chooseHealItem([herb('GR'), g], 0.75)).toBe(g);
  });

  it('uses the full-heal mixture when badly hurt', () => {
    const gr = herb('GR');
    expect(chooseHealItem([herb('G'), gr], 0.2)).toBe(gr);
  });

  it('saves the spray for emergencies', () => {
    const spray = makeItem('spray', 'spray');
    const g = herb('G');
    expect(chooseHealItem([spray, g], 0.8)).toBe(g);
    expect(chooseHealItem([spray, g], 0.2)).toBe(spray);
  });

  it('never wastes a max-health mixture by accident', () => {
    expect(chooseHealItem([herb('GY')], 0.3)).toBeNull();
  });
});
