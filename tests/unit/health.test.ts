import { describe, expect, it } from 'vitest';
import { herbEffect, herbKey, mixHerbs, PlayerHealth } from '../../src/combat/health';

describe('PlayerHealth', () => {
  it('takes damage and dies at zero', () => {
    const h = new PlayerHealth(100);
    expect(h.damage(30)).toBe(30);
    expect(h.current).toBe(70);
    expect(h.damage(500)).toBe(70);
    expect(h.dead).toBe(true);
    expect(h.damage(10)).toBe(0);
  });

  it('is protected for a moment after being hit', () => {
    const h = new PlayerHealth(100);
    h.damage(10, 0.6);
    expect(h.damage(10, 0.6)).toBe(0);
    h.tick(0.7);
    expect(h.damage(10, 0.6)).toBe(10);
  });

  it('heals up to the maximum and no further', () => {
    const h = new PlayerHealth(100);
    h.damage(60);
    h.heal(30);
    expect(h.current).toBe(70);
    h.heal(500);
    expect(h.current).toBe(100);
  });

  it('cannot be healed once dead', () => {
    const h = new PlayerHealth(100);
    h.kill();
    h.heal(50);
    expect(h.dead).toBe(true);
  });

  it('is in danger below the set level', () => {
    const h = new PlayerHealth(100);
    h.damage(75);
    expect(h.inDanger(0.3)).toBe(true);
    h.heal(20);
    expect(h.inDanger(0.3)).toBe(false);
  });

  it('a raised maximum also adds to current health', () => {
    const h = new PlayerHealth(100);
    h.damage(50);
    h.raiseMax(10);
    expect(h.max).toBe(110);
    expect(h.current).toBe(60);
  });
});

describe('herbs', () => {
  it('names a mixture the same way whatever order it was made in', () => {
    expect(herbKey(['Y', 'G', 'R'])).toBe('GRY');
    expect(herbKey(['R', 'G'])).toBe('GR');
  });

  it('green alone heals a bit, green and red heal fully', () => {
    const h = new PlayerHealth(100);
    h.damage(80);
    expect(h.apply(herbEffect('G')!)).toBe(true);
    expect(h.current).toBe(50);
    h.apply(herbEffect('GR')!);
    expect(h.current).toBe(100);
  });

  it('green and yellow raise the maximum health', () => {
    const h = new PlayerHealth(100);
    h.damage(50);
    h.apply(herbEffect('GY')!);
    expect(h.max).toBe(110);
  });

  it('a lone red or yellow herb does nothing', () => {
    expect(herbEffect('R')).toBeNull();
    expect(herbEffect('Y')).toBeNull();
  });

  it('mixes only herbs that go together', () => {
    expect(mixHerbs('G', 'R')).toBe('GR');
    expect(mixHerbs('R', 'G')).toBe('GR');
    expect(mixHerbs('G', 'G')).toBe('GG');
    expect(mixHerbs('GR', 'Y')).toBe('GRY');
    expect(mixHerbs('R', 'R')).toBeNull();
    expect(mixHerbs('GR', 'GR')).toBeNull();
  });
});
