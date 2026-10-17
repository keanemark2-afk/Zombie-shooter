import { describe, expect, it } from 'vitest';
import tuningSource from '../../src/config/tuning.ts?raw';
import { tuning } from '../../src/config/tuning';
import {
  assignValues,
  diffValues,
  flattenValues,
  formatCopyText,
  parseTuningSource,
  prettyLabel,
  sliderRange,
} from '../../src/debug/tuningMeta';

describe('tuning.ts', () => {
  const parsed = parseTuningSource(tuningSource);

  it('gives every single value a plain-English note', () => {
    expect(parsed.missing).toEqual([]);
    for (const [path] of flattenValues(tuning)) {
      expect(parsed.values.has(path), `${path} needs a // note`).toBe(true);
    }
  });

  it('keeps every number inside the slider range written in its note', () => {
    for (const [path, value] of flattenValues(tuning)) {
      const range = parsed.values.get(path)?.range;
      if (typeof value === 'number' && range) {
        expect(value, path).toBeGreaterThanOrEqual(range.min);
        expect(value, path).toBeLessThanOrEqual(range.max);
      }
    }
  });

  it('writes text values as 6-digit colours or as one of the listed options', () => {
    for (const [path, value] of flattenValues(tuning)) {
      if (typeof value !== 'string') continue;
      const options = parsed.values.get(path)?.options;
      if (options) expect(options, path).toContain(value);
      else expect(value, path).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('parseTuningSource', () => {
  const source = `
export const tuning = {
  // Things about the player.
  player: {
    speed: 5, // How fast you walk. [1 to 10]
    colour: '#ff0000', // Jacket colour.
    mode: 'calm', // How it behaves. [options: calm, angry , sad]
    secret: 3,
    inner: {
      flag: true, // A switch.
    },
  },
};
export const other = { ignored: 1 };
`;
  const parsed = parseTuningSource(source);

  it('reads notes keyed by dotted path', () => {
    expect(parsed.values.get('player.speed')?.comment).toBe('How fast you walk. [1 to 10]');
    expect(parsed.values.get('player.colour')?.comment).toBe('Jacket colour.');
    expect(parsed.values.get('player.inner.flag')?.comment).toBe('A switch.');
  });

  it('reads slider ranges from [a to b]', () => {
    expect(parsed.values.get('player.speed')?.range).toEqual({ min: 1, max: 10 });
    expect(parsed.values.get('player.colour')?.range).toBeUndefined();
  });

  it('reads drop-down choices from [options: ...]', () => {
    expect(parsed.values.get('player.mode')?.options).toEqual(['calm', 'angry', 'sad']);
    expect(parsed.values.get('player.speed')?.options).toBeUndefined();
  });

  it('reads group notes from the line above a group', () => {
    expect(parsed.groups.get('player')).toBe('Things about the player.');
  });

  it('reports values with no note', () => {
    expect(parsed.missing).toEqual(['player.secret']);
  });

  it('stops at the end of the tuning object', () => {
    expect(parsed.values.has('ignored')).toBe(false);
    expect(parsed.missing).not.toContain('ignored');
  });
});

describe('diffValues and formatCopyText', () => {
  const defaults = { a: { speed: 5, name: '#ffffff', on: true }, b: { x: 0.1 } };

  it('finds nothing when values are untouched', () => {
    expect(diffValues(structuredClone(defaults), defaults)).toEqual([]);
    expect(formatCopyText([])).toMatch(/no values changed/);
  });

  it('lists only the values that changed', () => {
    const now = structuredClone(defaults);
    now.a.speed = 7.5;
    now.a.on = false;
    const changes = diffValues(now, defaults);
    expect(changes).toEqual([
      { path: 'a.speed', from: 5, to: 7.5 },
      { path: 'a.on', from: true, to: false },
    ]);
    const text = formatCopyText(changes);
    expect(text).toContain('2 values changed');
    expect(text).toContain('a.speed: 5 -> 7.5');
    expect(text).toContain('a.on: true -> false');
  });

  it('ignores tiny floating-point noise from sliders', () => {
    const now = structuredClone(defaults);
    now.b.x = 0.1 + 1e-12;
    expect(diffValues(now, defaults)).toEqual([]);
  });

  it('quotes colours in the copied text', () => {
    expect(formatCopyText([{ path: 'a.name', from: '#ffffff', to: '#000000' }])).toContain("a.name: '#ffffff' -> '#000000'");
  });
});

describe('assignValues', () => {
  it('copies values back in place, keeping the same objects', () => {
    const target = { a: { speed: 9 }, b: 2 };
    const inner = target.a;
    assignValues(target, { a: { speed: 5 }, b: 1 });
    expect(target).toEqual({ a: { speed: 5 }, b: 1 });
    expect(target.a).toBe(inner);
  });
});

describe('sliderRange', () => {
  it('uses the range from the note when there is one', () => {
    expect(sliderRange(60, { min: 40, max: 100 })).toMatchObject({ min: 40, max: 100, step: 1 });
  });

  it('guesses a range of roughly three times the value', () => {
    const r = sliderRange(0.25);
    expect(r.min).toBe(0);
    expect(r.max).toBeGreaterThanOrEqual(0.75);
    expect(r.step).toBeLessThan(0.01);
  });

  it('handles zero and negative numbers', () => {
    expect(sliderRange(0)).toMatchObject({ min: 0, max: 1 });
    const neg = sliderRange(-2);
    expect(neg.min).toBeLessThan(-2);
    expect(neg.max).toBeGreaterThan(2);
  });
});

describe('prettyLabel', () => {
  it('turns code names into readable labels', () => {
    expect(prettyLabel('moveSpeed')).toBe('Move speed');
    expect(prettyLabel('fov')).toBe('Fov');
    expect(prettyLabel('shadowMapSize')).toBe('Shadow map size');
  });
});
