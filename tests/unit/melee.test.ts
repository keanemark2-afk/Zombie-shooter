import { describe, expect, it } from 'vitest';
import { blastFalloff, GrabStruggle, judgeParry, Knife, meleeMoveFor, pickMeleeTarget, type MeleeCandidate } from '../../src/combat/melee';

describe('melee follow-ups', () => {
  it('a head-staggered zombie gets the roundhouse kick', () => {
    expect(meleeMoveFor('head', false)).toBe('roundhouse');
    expect(meleeMoveFor('head', true)).toBe('roundhouse');
  });

  it('a kneeling zombie is kicked from the front and suplexed from behind', () => {
    expect(meleeMoveFor('kneel', false)).toBe('frontKick');
    expect(meleeMoveFor('kneel', true)).toBe('suplex');
  });

  it('a zombie on the ground gets the knife finisher', () => {
    expect(meleeMoveFor('down', false)).toBe('finisher');
  });

  it('a zombie that is not stunned gets nothing', () => {
    expect(meleeMoveFor(null, false)).toBeNull();
  });

  it('a shield held up in front of you can be kicked apart, but not from behind', () => {
    expect(meleeMoveFor('shield', false)).toBe('frontKick');
    expect(meleeMoveFor('shield', true)).toBeNull();
  });
});

describe('picking the melee target', () => {
  const z = (o: Partial<MeleeCandidate> & { id: number }): MeleeCandidate & { id: number } => ({
    openTo: 'head',
    distance: 1.5,
    angleOff: 0,
    facingAway: false,
    ...o,
  });

  it('chooses the nearest stunned zombie in reach and in view', () => {
    const picked = pickMeleeTarget([z({ id: 1, distance: 2 }), z({ id: 2, distance: 1.2 }), z({ id: 3, distance: 0.8, openTo: null })], 2.2, 75);
    expect(picked?.target.id).toBe(2);
    expect(picked?.move).toBe('roundhouse');
  });

  it('ignores zombies too far away or behind you', () => {
    expect(pickMeleeTarget([z({ id: 1, distance: 3 })], 2.2, 75)).toBeNull();
    expect(pickMeleeTarget([z({ id: 1, angleOff: 120 })], 2.2, 75)).toBeNull();
  });
});

describe('parry timing', () => {
  const rules = { parryWindow: 0.4, perfectParryWindow: 0.15 };

  it('pressing the knife just before the hit is a perfect parry', () => {
    expect(judgeParry(0.1, false, 50, rules)).toBe('perfect');
  });

  it('pressing a bit earlier is a normal parry', () => {
    expect(judgeParry(0.3, false, 50, rules)).toBe('parry');
  });

  it('pressing far too early does nothing, unless the button is still held', () => {
    expect(judgeParry(0.8, false, 50, rules)).toBe('none');
    expect(judgeParry(0.8, true, 50, rules)).toBe('parry');
    expect(judgeParry(null, false, 50, rules)).toBe('none');
  });

  it('a broken knife cannot parry', () => {
    expect(judgeParry(0.05, true, 0, rules)).toBe('none');
  });
});

describe('knife wear', () => {
  it('wears down and breaks, and can be repaired', () => {
    const k = new Knife(20);
    k.wear(15);
    expect(k.broken).toBe(false);
    expect(k.condition).toBeCloseTo(0.25);
    k.wear(15);
    expect(k.durability).toBe(0);
    expect(k.broken).toBe(true);
    k.repair();
    expect(k.durability).toBe(20);
  });

  it('never wears down when unbreakable', () => {
    const k = new Knife(20);
    k.wear(15, true);
    expect(k.durability).toBe(20);
  });
});

describe('breaking free of a grab', () => {
  const rules = { mashPerPress: 0.25, wigglePerFlick: 0.1, drain: 0.2, biteTime: 2 };

  it('mashing fast enough breaks free before the bite', () => {
    const g = new GrabStruggle(rules);
    let result = 'struggling';
    for (let i = 0; i < 6 && result === 'struggling'; i++) {
      g.mash();
      result = g.tick(0.1);
    }
    expect(result).toBe('free');
  });

  it('doing nothing gets you bitten', () => {
    const g = new GrabStruggle(rules);
    let result = 'struggling';
    for (let t = 0; t < 3 && result === 'struggling'; t += 0.1) result = g.tick(0.1);
    expect(result).toBe('bitten');
  });

  it('the bar drains when you stop mashing', () => {
    const g = new GrabStruggle(rules);
    g.mash();
    g.tick(1);
    expect(g.progress).toBeCloseTo(0.05);
  });
});

describe('blast falloff', () => {
  it('is full at the centre, half way at half the radius, nothing at the edge', () => {
    expect(blastFalloff(0, 6)).toBe(1);
    expect(blastFalloff(3, 6)).toBeCloseTo(0.5);
    expect(blastFalloff(6, 6)).toBe(0);
    expect(blastFalloff(9, 6)).toBe(0);
  });
});
