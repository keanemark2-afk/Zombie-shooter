import { describe, expect, it } from 'vitest';
import { FixedStepClock } from '../../src/core/loop';

describe('FixedStepClock', () => {
  const step = 1 / 60;

  it('runs one update per 60th of a second', () => {
    const clock = new FixedStepClock();
    expect(clock.advance(step, step, 0.1)).toBe(1);
    expect(clock.advance(step, step, 0.1)).toBe(1);
  });

  it('runs several updates to catch up after a slow frame', () => {
    const clock = new FixedStepClock();
    expect(clock.advance(step * 3, step, 0.1)).toBe(3);
  });

  it('carries leftover time into the next frame', () => {
    const clock = new FixedStepClock();
    expect(clock.advance(step * 0.6, step, 0.1)).toBe(0);
    expect(clock.alpha).toBeCloseTo(0.6, 5);
    expect(clock.advance(step * 0.6, step, 0.1)).toBe(1);
    expect(clock.alpha).toBeCloseTo(0.2, 5);
  });

  it('never tries to catch up more than the maximum frame time', () => {
    const clock = new FixedStepClock();
    // A 5 second freeze (e.g. the window was dragged) only replays 0.1 s.
    expect(clock.advance(5, step, 0.1)).toBe(6);
  });

  it('ignores negative time', () => {
    const clock = new FixedStepClock();
    expect(clock.advance(-1, step, 0.1)).toBe(0);
  });

  it('runs exactly 60 updates over one second of 144 Hz frames', () => {
    const clock = new FixedStepClock();
    let total = 0;
    for (let i = 0; i < 144; i++) total += clock.advance(1 / 144, step, 0.1);
    expect(total).toBe(60);
  });
});
