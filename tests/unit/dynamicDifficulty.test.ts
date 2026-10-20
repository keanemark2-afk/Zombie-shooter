import { describe, expect, it } from 'vitest';
import { DynamicDifficulty } from '../../src/ai/dynamicDifficulty';

describe('DynamicDifficulty', () => {
  it('starts at default rank 5', () => {
    const dd = new DynamicDifficulty();
    expect(dd.rank).toBe(5);
    expect(dd.modifiers().rank).toBe(5);
  });

  it('records accuracy and headshots accurately', () => {
    const dd = new DynamicDifficulty();
    dd.recordShot(true, true);
    dd.recordShot(true, false);
    dd.recordShot(false);
    expect(dd.stats.shots).toBe(3);
    expect(dd.stats.hits).toBe(2);
    expect(dd.stats.headshots).toBe(1);
    expect(dd.accuracy).toBeCloseTo(2 / 3);
    expect(dd.headshotRate).toBeCloseTo(1 / 2);
  });

  it('drops rank when taking heavy damage or death', () => {
    const dd = new DynamicDifficulty();
    const initialRank = dd.rank;
    dd.recordDamage(40);
    expect(dd.rank).toBeLessThan(initialRank);

    const rankBeforeDeath = dd.rank;
    dd.recordDeath();
    expect(dd.rank).toBeLessThan(rankBeforeDeath);
  });

  it('clamps rank within bounds [1, 10]', () => {
    const dd = new DynamicDifficulty();
    dd.nudgeRank(100);
    expect(dd.rank).toBe(10);
    dd.nudgeRank(-100);
    expect(dd.rank).toBe(1);
  });

  it('modulates tokens, run chance, and multipliers based on rank', () => {
    const dd = new DynamicDifficulty();

    dd.rank = 1;
    const low = dd.modifiers(3);
    expect(low.maxAttackers).toBe(2);
    expect(low.damageMultiplier).toBeLessThan(1.0);
    expect(low.dropGenerosity).toBeGreaterThan(1.0);

    dd.rank = 10;
    const high = dd.modifiers(3);
    expect(high.maxAttackers).toBe(4);
    expect(high.damageMultiplier).toBeGreaterThan(1.0);
    expect(high.dropGenerosity).toBeLessThan(1.0);
  });

  it('returns neutral multipliers when disabled', () => {
    const dd = new DynamicDifficulty();
    dd.enabled = false;
    dd.rank = 10;
    const mods = dd.modifiers(3);
    expect(mods.maxAttackers).toBe(3);
    expect(mods.damageMultiplier).toBe(1.0);
    expect(mods.dropGenerosity).toBe(1.0);
  });
});
