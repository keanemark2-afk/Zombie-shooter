// Pure helpers behind the F1 tuning panel: reading the plain-English notes out of
// tuning.ts, picking slider ranges, and working out which values were changed.

export type TuningValue = number | string | boolean;

export interface TuningNote {
  comment: string;
  range?: { min: number; max: number };
  /** Choices for a drop-down list, from "[options: a, b, c]". */
  options?: string[];
}

export interface ParsedTuningSource {
  /** Notes for each value, keyed by dotted path such as "flyCamera.moveSpeed". */
  values: Map<string, TuningNote>;
  /** Notes written on the line above each group, keyed by group path. */
  groups: Map<string, string>;
  /** Paths of values that have no note. Every value is supposed to have one. */
  missing: string[];
}

const GROUP_OPEN = /^\s*(\w+)\s*:\s*\{\s*(?:\/\/.*)?$/;
const GROUP_CLOSE = /^\s*\}\s*,?\s*;?\s*$/;
const VALUE_LINE = /^\s*(\w+)\s*:\s*([^/]+?)\s*,?\s*(?:\/\/\s*(.*))?$/;
const LINE_COMMENT = /^\s*\/\/\s*(.*)$/;
const RANGE_HINT = /\[\s*(-?[\d.]+)\s+to\s+(-?[\d.]+)\s*\]\s*$/;
const OPTIONS_HINT = /\[\s*options:\s*([^\]]+)\]\s*$/i;

/** Reads the source text of tuning.ts and pulls out the note for every value. */
export function parseTuningSource(source: string): ParsedTuningSource {
  const values = new Map<string, TuningNote>();
  const groups = new Map<string, string>();
  const missing: string[] = [];

  const start = source.indexOf('export const tuning');
  if (start < 0) return { values, groups, missing };
  const lines = source.slice(start).split(/\r?\n/).slice(1);

  const stack: string[] = [];
  let pendingComment = '';

  for (const line of lines) {
    if (line.trim() === '') {
      pendingComment = '';
      continue;
    }
    const commentOnly = LINE_COMMENT.exec(line);
    if (commentOnly) {
      pendingComment = commentOnly[1].trim();
      continue;
    }
    const open = GROUP_OPEN.exec(line);
    if (open) {
      stack.push(open[1]);
      if (pendingComment) groups.set(stack.join('.'), pendingComment);
      pendingComment = '';
      continue;
    }
    if (GROUP_CLOSE.test(line)) {
      if (stack.length === 0) break; // end of the tuning object
      stack.pop();
      pendingComment = '';
      continue;
    }
    const value = VALUE_LINE.exec(line);
    if (value) {
      const path = [...stack, value[1]].join('.');
      const comment = (value[3] ?? '').trim();
      if (!comment) {
        missing.push(path);
      } else {
        const note: TuningNote = { comment };
        const hint = RANGE_HINT.exec(comment);
        if (hint) note.range = { min: Number(hint[1]), max: Number(hint[2]) };
        const options = OPTIONS_HINT.exec(comment);
        if (options) note.options = options[1].split(',').map((o) => o.trim()).filter(Boolean);
        values.set(path, note);
      }
    }
    pendingComment = '';
  }

  return { values, groups, missing };
}

/** Turns a nested settings object into a flat list of [dotted path, value]. */
export function flattenValues(obj: object, prefix = ''): Array<[string, TuningValue]> {
  const out: Array<[string, TuningValue]> = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      out.push(...flattenValues(value as object, path));
    } else if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      out.push([path, value]);
    }
  }
  return out;
}

export interface TuningChange {
  path: string;
  from: TuningValue;
  to: TuningValue;
}

/** Lists every value that differs from its default. */
export function diffValues(current: object, defaults: object): TuningChange[] {
  const before = new Map(flattenValues(defaults));
  const changes: TuningChange[] = [];
  for (const [path, to] of flattenValues(current)) {
    const from = before.get(path);
    if (from === undefined) continue;
    const same = typeof to === 'number' && typeof from === 'number' ? Math.abs(to - from) < 1e-9 : to === from;
    if (!same) changes.push({ path, from, to });
  }
  return changes;
}

/** Copies every value from `source` into `target`, keeping the same nested objects. */
export function assignValues(target: object, source: object): void {
  for (const [key, value] of Object.entries(source)) {
    const t = target as Record<string, unknown>;
    if (value !== null && typeof value === 'object' && t[key] !== null && typeof t[key] === 'object') {
      assignValues(t[key] as object, value as object);
    } else if (key in t) {
      t[key] = value;
    }
  }
}

function niceCeil(x: number): number {
  if (x <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(x));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * magnitude >= x) return m * magnitude;
  }
  return 10 * magnitude;
}

/** Picks a sensible slider range and step for a number. */
export function sliderRange(value: number, hint?: { min: number; max: number }): { min: number; max: number; step: number } {
  let min: number;
  let max: number;
  if (hint) {
    min = hint.min;
    max = hint.max;
  } else if (value === 0) {
    min = 0;
    max = 1;
  } else if (value > 0) {
    min = 0;
    max = niceCeil(value * 3);
  } else {
    max = niceCeil(-value * 3);
    min = -max;
  }
  const span = Math.max(max - min, 1e-6);
  const wholeNumbers = Number.isInteger(value) && Number.isInteger(min) && Number.isInteger(max) && span >= 20;
  const step = wholeNumbers ? 1 : 10 ** (Math.floor(Math.log10(span)) - 3);
  return { min, max, step };
}

function formatValue(v: TuningValue): string {
  if (typeof v === 'number') return String(Number(v.toPrecision(6)));
  if (typeof v === 'string') return `'${v}'`;
  return String(v);
}

/** Builds the text that "Copy values" puts on the clipboard. */
export function formatCopyText(changes: TuningChange[]): string {
  if (changes.length === 0) {
    return 'Dead Acre tuning: no values changed (everything is at its default).';
  }
  const lines = changes.map((c) => `${c.path}: ${formatValue(c.from)} -> ${formatValue(c.to)}`);
  const noun = changes.length === 1 ? 'value' : 'values';
  return [`Dead Acre tuning: ${changes.length} ${noun} changed (default -> mine)`, ...lines].join('\n');
}

/** "moveSpeed" -> "Move speed", for friendlier labels in the panel. */
export function prettyLabel(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
