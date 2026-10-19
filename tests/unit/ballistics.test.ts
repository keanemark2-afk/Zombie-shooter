import { describe, expect, it } from 'vitest';
import { chainsawHit, flightTime, positionAt, ShieldState, solveThrow } from '../../src/combat/ballistics';

describe('solveThrow', () => {
  const from = { x: 0, y: 1.5, z: 0 };

  it('lands a lob on the target', () => {
    const to = { x: 4, y: 0, z: -9 };
    const v = solveThrow(from, to, 14, true);
    const t = flightTime(from, v, to.y);
    const p = positionAt(from, v, t);
    expect(p.x).toBeCloseTo(to.x, 1);
    expect(p.z).toBeCloseTo(to.z, 1);
    expect(p.y).toBeCloseTo(to.y, 1);
  });

  it('a flat throw gets there quicker than a lob', () => {
    const to = { x: 0, y: 1, z: -12 };
    const lob = solveThrow(from, to, 16, true);
    const flat = solveThrow(from, to, 16, false);
    expect(flightTime(from, flat, 1)).toBeLessThan(flightTime(from, lob, 1));
    const p = positionAt(from, flat, flightTime(from, flat, 1));
    expect(p.z).toBeCloseTo(-12, 1);
  });

  it('throws as far as it can when the target is out of reach', () => {
    const v = solveThrow(from, { x: 0, y: 0, z: -200 }, 12, true);
    expect(v.z).toBeLessThan(0);
    expect(v.y).toBeGreaterThan(0);
    const p = positionAt(from, v, flightTime(from, v, 0));
    expect(Math.abs(p.z)).toBeLessThan(40);
  });

  it('copes with a target straight up or right here', () => {
    const v = solveThrow(from, { x: 0, y: 5, z: 0 }, 10, true);
    expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);
  });
});

describe('ShieldState', () => {
  it('soaks up hits and breaks once', () => {
    const s = new ShieldState(500);
    expect(s.hit(200)).toBe(false);
    expect(s.hit(200)).toBe(false);
    expect(s.hit(200)).toBe(true);
    expect(s.broken).toBe(true);
    expect(s.hit(200)).toBe(false);
  });
});

describe('chainsawHit', () => {
  it('kills outright from the chosen difficulty up', () => {
    expect(chainsawHit('easy', 70, 'hard').instantKill).toBe(false);
    expect(chainsawHit('normal', 70, 'hard').instantKill).toBe(false);
    expect(chainsawHit('hard', 70, 'hard').instantKill).toBe(true);
    expect(chainsawHit('pro', 70, 'hard').instantKill).toBe(true);
  });
});
