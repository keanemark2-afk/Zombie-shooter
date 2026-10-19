import { describe, expect, it } from 'vitest';
import { NavGrid } from '../../src/ai/navGrid';
import type { Collider } from '../../src/world/colliders';

const box = (x: number, z: number, w: number, d: number, rotY = 0): Collider => ({ kind: 'box', x, z, halfW: w / 2, halfD: d / 2, rotY, height: 2, tag: 'solid' });
const out = { x: 0, z: 0 };

describe('NavGrid', () => {
  it('walks straight to the goal across open ground', () => {
    const g = new NavGrid(-20, -20, 20, 20, 0.5);
    g.setObstacles([], 0.3);
    g.flowFrom(10, 0);
    expect(g.steer(-10, 0, out)).toBe(true);
    expect(out.x).toBeGreaterThan(-10);
    expect(Math.abs(out.z)).toBeLessThan(0.6);
    expect(g.distanceAt(-10, 0)).toBeCloseTo(20, 0);
  });

  it('goes round a wall through the gap in it', () => {
    const g = new NavGrid(-20, -20, 20, 20, 0.5);
    // A long wall across the middle with a gap at z = 12..16.
    g.setObstacles([box(0, -4, 0.4, 32), box(0, 18.5, 0.4, 3)], 0.3);
    g.flowFrom(8, 0);
    // From the other side the route is much longer than the straight line.
    expect(g.distanceAt(-8, 0)).toBeGreaterThan(30);
    // And the first step heads towards the gap, not into the wall.
    let x = -8;
    let z = 0;
    for (let i = 0; i < 80; i++) {
      expect(g.steer(x, z, out)).toBe(true);
      const dx = out.x - x;
      const dz = out.z - z;
      const len = Math.hypot(dx, dz) || 1;
      x += (dx / len) * 0.4;
      z += (dz / len) * 0.4;
      expect(g.isWalkable(x, z)).toBe(true);
      if (Math.hypot(x - 8, z) < 1) break;
    }
    expect(Math.hypot(x - 8, z)).toBeLessThan(1);
  });

  it('reports no way through when the goal is walled in', () => {
    const g = new NavGrid(-20, -20, 20, 20, 0.5);
    g.setObstacles([box(0, 5, 20, 0.5), box(0, -5, 20, 0.5), box(10, 0, 0.5, 11), box(-10, 0, 0.5, 11)], 0.3);
    g.flowFrom(0, 0);
    expect(g.distanceAt(15, 15)).toBe(Infinity);
    expect(g.steer(15, 15, out)).toBe(false);
  });

  it('keeps walkers a body-width away from obstacles', () => {
    const g = new NavGrid(-10, -10, 10, 10, 0.5);
    g.setObstacles([{ kind: 'circle', x: 0, z: 0, radius: 1, height: 2, tag: 'solid' }], 0.4);
    expect(g.isWalkable(0, 0)).toBe(false);
    expect(g.isWalkable(1.2, 0)).toBe(false);
    expect(g.isWalkable(1.8, 0)).toBe(true);
  });

  it('knows when a straight line is blocked', () => {
    const g = new NavGrid(-10, -10, 10, 10, 0.5);
    g.setObstacles([box(0, 0, 0.5, 6)], 0.3);
    expect(g.lineClear(-5, 0, 5, 0)).toBe(false);
    expect(g.lineClear(-5, 5, 5, 5)).toBe(true);
  });

  it('handles rotated boxes', () => {
    const g = new NavGrid(-10, -10, 10, 10, 0.5);
    g.setObstacles([box(0, 0, 0.5, 8, Math.PI / 2)], 0.2);
    // Rotated a quarter turn, the long side runs left-right.
    expect(g.isWalkable(3, 0)).toBe(false);
    expect(g.isWalkable(0, 3)).toBe(true);
  });
});
