import { describe, expect, it } from 'vitest';
import { calculateRank, pointsForKill, timeBonusForKill, ScoreAttackDirector } from '../../src/modes/scoreAttack';

describe('scoreAttack pointsForKill', () => {
  it('awards base points for combo 1', () => {
    expect(pointsForKill(1, 1000)).toBe(1000);
    expect(pointsForKill(0, 1000)).toBe(1000);
  });

  it('adds 500 points per combo up to 10', () => {
    expect(pointsForKill(2, 1000)).toBe(1500);
    expect(pointsForKill(5, 1000)).toBe(3000);
    expect(pointsForKill(10, 1000)).toBe(5500);
  });

  it('adds 1000 points per combo above 10', () => {
    expect(pointsForKill(11, 1000)).toBe(6500);
    expect(pointsForKill(15, 1000)).toBe(10500);
  });
});

describe('scoreAttack timeBonusForKill', () => {
  it('gives correct bonuses for different kill types', () => {
    expect(timeBonusForKill({ zone: 'head', isHeadshot: true, isMelee: false, isElite: false, isExplosion: false })).toBe(2);
    expect(timeBonusForKill({ zone: 'torso', isHeadshot: false, isMelee: true, meleeType: 'frontKick', isElite: false, isExplosion: false })).toBe(2);
    expect(timeBonusForKill({ zone: 'head', isHeadshot: false, isMelee: true, meleeType: 'suplex', isElite: false, isExplosion: false })).toBe(5);
    expect(timeBonusForKill({ zone: 'torso', isHeadshot: false, isMelee: false, isElite: false, isExplosion: true })).toBe(1);
    expect(timeBonusForKill({ zone: 'head', isHeadshot: true, isMelee: false, isElite: true, isExplosion: false })).toBe(10);
  });

  it('doubles time bonuses in Overdrive', () => {
    expect(timeBonusForKill({ zone: 'head', isHeadshot: true, isMelee: false, isElite: false, isExplosion: false }, true)).toBe(4);
    expect(timeBonusForKill({ zone: 'head', isHeadshot: false, isMelee: true, meleeType: 'suplex', isElite: false, isExplosion: false }, true)).toBe(10);
    expect(timeBonusForKill({ zone: 'head', isHeadshot: true, isMelee: false, isElite: true, isExplosion: false }, true)).toBe(20);
  });
});

describe('scoreAttack calculateRank', () => {
  it('calculates ranks based on thresholds', () => {
    expect(calculateRank(1_200_000)).toBe('S++');
    expect(calculateRank(600_000)).toBe('S+');
    expect(calculateRank(250_000)).toBe('S');
    expect(calculateRank(120_000)).toBe('A');
    expect(calculateRank(60_000)).toBe('B');
    expect(calculateRank(20_000)).toBe('C');
  });
});

describe('ScoreAttackDirector', () => {
  it('initializes with default starting time and zero score', () => {
    const director = new ScoreAttackDirector();
    expect(director.state.timeRemaining).toBe(120);
    expect(director.state.score).toBe(0);
    expect(director.state.kills).toBe(0);
    expect(director.state.combo).toBe(0);
  });

  it('increments combo, score, and adds time bonus on kill', () => {
    const director = new ScoreAttackDirector();
    const result = director.onKill({ zone: 'head', isHeadshot: true, isMelee: false, isElite: false, isExplosion: false });
    expect(result.points).toBe(1000);
    expect(result.timeBonus).toBe(2);
    expect(director.state.score).toBe(1000);
    expect(director.state.kills).toBe(1);
    expect(director.state.combo).toBe(1);
    expect(director.state.timeRemaining).toBe(122);
    expect(director.state.comboTimer).toBe(10);
  });

  it('resets combo when combo timer runs out', () => {
    const director = new ScoreAttackDirector();
    director.onKill({ zone: 'head', isHeadshot: false, isMelee: false, isElite: false, isExplosion: false });
    expect(director.state.combo).toBe(1);
    director.tick(11);
    expect(director.state.combo).toBe(0);
  });

  it('activates overdrive when gauge is full and provides double time bonuses', () => {
    const director = new ScoreAttackDirector();
    director.state.overdriveGauge = 1.0;
    expect(director.activateOverdrive()).toBe(true);
    expect(director.inOverdrive).toBe(true);
    expect(director.state.overdriveTimer).toBe(20);

    const kill = director.onKill({ zone: 'head', isHeadshot: true, isMelee: false, isElite: false, isExplosion: false });
    expect(kill.timeBonus).toBe(4); // doubled!
  });

  it('adds 30s when collecting time orbs', () => {
    const director = new ScoreAttackDirector();
    const initialTime = director.state.timeRemaining;
    const added = director.addTimeOrb();
    expect(added).toBe(30);
    expect(director.state.timeRemaining).toBe(initialTime + 30);
  });

  it('ends run on timeout or kill target and calculates leftover time bonus', () => {
    const director = new ScoreAttackDirector();
    director.state.score = 50_000;
    director.state.timeRemaining = 45;
    const summary = director.endRun('kills');
    expect(summary.endReason).toBe('kills');
    expect(summary.timeBonusScore).toBe(45_000);
    expect(summary.finalScore).toBe(95_000);
    expect(summary.rank).toBe('B');
  });
});
