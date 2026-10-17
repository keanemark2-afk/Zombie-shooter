import { describe, expect, it } from 'vitest';
import { ReticleFocus, swayOffset, type FocusStats } from '../../src/combat/reticle';

const stats: FocusStats = { focusTime: 1, spreadWide: 3, spreadTight: 0.2, spreadMoving: 1.5, fireBloom: 1, turnBloom: 0.1 };

describe('ReticleFocus', () => {
  it('starts wide when you raise the gun', () => {
    const r = new ReticleFocus();
    r.update(0.01, true, false, 0, stats);
    expect(r.spread).toBeGreaterThan(2.9);
    expect(r.focus(stats)).toBeLessThan(0.05);
  });

  it('tightens fully after the focus time if you hold still', () => {
    const r = new ReticleFocus();
    for (let i = 0; i < 70; i++) r.update(1 / 60, true, false, 0, stats);
    expect(r.spread).toBeCloseTo(0.2, 5);
    expect(r.focus(stats)).toBeCloseTo(1, 5);
  });

  it('is only half focused halfway through', () => {
    const r = new ReticleFocus();
    for (let i = 0; i < 30; i++) r.update(1 / 60, true, false, 0, stats);
    expect(r.focus(stats)).toBeGreaterThan(0.4);
    expect(r.focus(stats)).toBeLessThan(0.6);
  });

  it('never gets tighter than the moving size while walking', () => {
    const r = new ReticleFocus();
    for (let i = 0; i < 200; i++) r.update(1 / 60, true, true, 0, stats);
    expect(r.spread).toBeCloseTo(1.5, 5);
  });

  it('opens up when you fire, capped at the widest size', () => {
    const r = new ReticleFocus();
    for (let i = 0; i < 70; i++) r.update(1 / 60, true, false, 0, stats);
    r.onFire(stats);
    expect(r.spread).toBeCloseTo(1.2, 5);
    for (let i = 0; i < 10; i++) r.onFire(stats);
    expect(r.spread).toBe(3);
  });

  it('opens up when you swing the camera', () => {
    const r = new ReticleFocus();
    for (let i = 0; i < 70; i++) r.update(1 / 60, true, false, 0, stats);
    r.update(1 / 60, true, false, 10, stats);
    expect(r.spread).toBeGreaterThan(1);
  });

  it('resets to wide when you lower the gun', () => {
    const r = new ReticleFocus();
    for (let i = 0; i < 70; i++) r.update(1 / 60, true, false, 0, stats);
    r.update(1 / 60, false, false, 0, stats);
    r.update(1 / 60, true, false, 0, stats);
    expect(r.focus(stats)).toBeLessThan(0.05);
  });
});

describe('swayOffset', () => {
  it('always stays inside the reticle circle', () => {
    for (let t = 0; t < 100; t += 0.37) {
      const o = swayOffset(t);
      expect(Math.hypot(o.x, o.y)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('moves smoothly (no jumps between frames)', () => {
    let prev = swayOffset(0);
    for (let t = 1 / 60; t < 10; t += 1 / 60) {
      const o = swayOffset(t);
      expect(Math.hypot(o.x - prev.x, o.y - prev.y)).toBeLessThan(0.15);
      prev = o;
    }
  });
});
