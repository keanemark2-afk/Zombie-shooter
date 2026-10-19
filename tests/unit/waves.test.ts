import { beforeEach, describe, expect, it } from 'vitest';
import { tuning } from '../../src/config/tuning';
import { assignValues } from '../../src/debug/tuningMeta';
import { EliteSchedule, planWave, WaveDirector } from '../../src/modes/waves';

const defaults = structuredClone(tuning);
beforeEach(() => assignValues(tuning, structuredClone(defaults)));

describe('planWave', () => {
  it('the first wave is plain zombies only', () => {
    const p = planWave(1);
    expect(p.counts).toEqual({ shambler: tuning.waves.firstWaveSize });
    expect(p.total).toBe(tuning.waves.firstWaveSize);
  });

  it('waves grow and bring new kinds in as they go', () => {
    expect(planWave(2).total).toBe(tuning.waves.firstWaveSize + tuning.waves.growthPerWave);
    expect(Object.keys(planWave(2).counts)).toContain('armed');
    expect(Object.keys(planWave(3).counts)).toContain('runner');
    expect(Object.keys(planWave(5).counts)).toContain('shield');
    expect(Object.keys(planWave(6).counts)).toContain('dynamite');
    expect(planWave(1).counts.runner).toBeUndefined();
  });

  it('counts always add up to the total', () => {
    for (let w = 1; w <= 30; w++) {
      const p = planWave(w);
      const sum = Object.values(p.counts).reduce((a, b) => a + (b ?? 0), 0);
      expect(sum).toBe(p.total);
    }
  });

  it('can be limited to kinds that exist', () => {
    const p = planWave(8, ['shambler', 'armed']);
    expect(Object.keys(p.counts).sort()).toEqual(['armed', 'shambler']);
  });

  it('lets more be alive at once, and quicker arrivals, as waves go on', () => {
    expect(planWave(10).maxAlive).toBeGreaterThan(planWave(1).maxAlive);
    expect(planWave(10).interval).toBeLessThan(planWave(1).interval);
    expect(planWave(100).maxAlive).toBeLessThanOrEqual(tuning.waves.maxAliveCap);
    expect(planWave(100).interval).toBeGreaterThanOrEqual(tuning.waves.minSpawnInterval);
  });

  it('can be made bigger or smaller for difficulty', () => {
    expect(planWave(3, null, 1.5).total).toBeGreaterThan(planWave(3).total);
  });
});

describe('WaveDirector', () => {
  /** Runs the director in 0.1 s steps; the "alive" count follows what it spawned. */
  function run(d: WaveDirector, seconds: number, state: { alive: number; spawned: string[] }, kill = 0): void {
    for (let t = 0; t < seconds; t += 0.1) {
      const u = d.update(0.1, state.alive);
      for (const k of u.spawn) {
        state.alive++;
        state.spawned.push(k);
      }
      if (kill > 0 && state.alive > 0 && Math.random() < kill) state.alive--;
    }
  }

  it('waits out the countdown, then lets zombies in', () => {
    const d = new WaveDirector();
    d.begin(1, 3);
    const s = { alive: 0, spawned: [] as string[] };
    run(d, 2.5, s);
    expect(s.spawned).toHaveLength(0);
    run(d, 1, s);
    expect(d.state).toBe('active');
    expect(s.spawned.length).toBeGreaterThan(0);
  });

  it('never has more alive than the wave allows', () => {
    const d = new WaveDirector();
    d.begin(1, 0);
    const s = { alive: 0, spawned: [] as string[] };
    run(d, 60, s);
    expect(s.alive).toBeLessThanOrEqual(planWave(1).maxAlive);
    expect(s.spawned.length).toBeLessThanOrEqual(planWave(1).total);
  });

  it('is cleared once everything has come and been killed', () => {
    const d = new WaveDirector();
    d.begin(1, 0);
    const s = { alive: 0, spawned: [] as string[] };
    let cleared = false;
    for (let t = 0; t < 400 && !cleared; t += 0.1) {
      const u = d.update(0.1, s.alive);
      for (const k of u.spawn) {
        s.alive++;
        s.spawned.push(k);
      }
      if (u.cleared) cleared = true;
      if (s.alive > 0 && t % 1 < 0.1) s.alive--; // the player kills one a second
    }
    expect(cleared).toBe(true);
    expect(s.spawned).toHaveLength(planWave(1).total);
    expect(d.state).toBe('intermission');
  });

  it('starts the next wave after the break, or sooner when skipped', () => {
    const d = new WaveDirector();
    d.begin(1, 0);
    let s = { alive: 0, spawned: [] as string[] };
    for (let t = 0; t < 400 && d.state !== 'intermission'; t += 0.1) {
      const u = d.update(0.1, s.alive);
      s.alive += u.spawn.length;
      if (s.alive > 0) s.alive--;
    }
    expect(d.state).toBe('intermission');
    d.skipBreak();
    d.update(0.1, 0);
    expect(d.state).toBe('countdown');
    expect(d.wave).toBe(2);
    s = { alive: 0, spawned: [] };
    run(d, 5, s);
    expect(d.state).toBe('active');
  });
});

describe('EliteSchedule', () => {
  it('sends an elite every so many kills, alternating kinds', () => {
    const e = new EliteSchedule(() => 50);
    expect(e.check(10)).toBeNull();
    expect(e.check(50)).toBe('brute');
    expect(e.check(51)).toBeNull();
    expect(e.check(100)).toBe('chainsaw');
    expect(e.check(150)).toBe('brute');
  });
});
