import { describe, expect, it } from 'vitest';
import { assignSurroundAngles, TokenPool, type Candidate } from '../../src/ai/director';

const z = (id: number, distance: number, ready = true): Candidate => ({ id, distance, ready });

describe('TokenPool', () => {
  it('lets only a few zombies attack, nearest first', () => {
    const pool = new TokenPool(2);
    pool.update([z(1, 5), z(2, 2), z(3, 8), z(4, 3)], 0.1, 10);
    expect(pool.holders.sort()).toEqual([2, 4]);
    expect(pool.has(1)).toBe(false);
  });

  it('hands a freed token to the next zombie in line', () => {
    const pool = new TokenPool(2);
    pool.update([z(1, 1), z(2, 2), z(3, 3)], 0.1, 10);
    expect(pool.has(3)).toBe(false);
    pool.release(1);
    pool.update([z(2, 2), z(3, 3)], 0.1, 10);
    expect(pool.holders.sort()).toEqual([2, 3]);
  });

  it('takes the token back from a zombie that can no longer attack or has left', () => {
    const pool = new TokenPool(2);
    pool.update([z(1, 1), z(2, 2)], 0.1, 10);
    pool.update([z(1, 1, false)], 0.1, 10);
    expect(pool.has(1)).toBe(false);
    expect(pool.has(2)).toBe(false);
  });

  it('takes the token back from one that dawdles', () => {
    const pool = new TokenPool(1);
    pool.update([z(1, 1), z(2, 2)], 0.1, 3);
    for (let t = 0; t < 4; t += 0.5) pool.update([z(1, 1), z(2, 2)], 0.5, 3);
    // Zombie 1 timed out; zombie 2 got its turn.
    expect(pool.has(2)).toBe(true);
  });

  it('never exceeds the maximum, even when it is lowered', () => {
    const pool = new TokenPool(3);
    const all = [z(1, 1), z(2, 2), z(3, 3), z(4, 4)];
    pool.update(all, 0.1, 10);
    expect(pool.count).toBe(3);
    pool.max = 1;
    pool.update(all, 0.1, 10);
    expect(pool.count).toBe(1);
  });
});

describe('assignSurroundAngles', () => {
  it('spreads zombies evenly round the player', () => {
    const out = assignSurroundAngles([0.1, 0.2, 0.3, 0.4]);
    const sorted = [...out].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeCloseTo(Math.PI / 2, 5);
  });

  it('keeps zombies in the same order round the circle', () => {
    const angles = [0.0, 1.0, 2.0, -1.0];
    const out = assignSurroundAngles(angles);
    const orderIn = angles.map((_, i) => i).sort((a, b) => angles[a] - angles[b]);
    const orderOut = out.map((_, i) => i).sort((a, b) => out[a] - out[b]);
    // The same cyclic order (maybe starting somewhere else).
    const start = orderOut.indexOf(orderIn[0]);
    expect([...orderOut.slice(start), ...orderOut.slice(0, start)]).toEqual(orderIn);
  });

  it('puts one zombie on the way the player is heading', () => {
    const out = assignSurroundAngles([0.1, 2.2, -2.0], 1.0);
    const nearest = Math.min(...out.map((a) => Math.abs(Math.atan2(Math.sin(a - 1.0), Math.cos(a - 1.0)))));
    expect(nearest).toBeLessThan(0.5);
  });

  it('copes with none and one', () => {
    expect(assignSurroundAngles([])).toEqual([]);
    expect(assignSurroundAngles([1.2])).toHaveLength(1);
  });
});
