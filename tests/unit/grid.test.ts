import { describe, expect, it } from 'vitest';
import { CaseGrid, type GridItem } from '../../src/inventory/grid';

interface Thing extends GridItem {
  w: number;
  h: number;
}

let next = 1;
const thing = (w: number, h: number): Thing => ({ id: next++, w, h });
const grid = (w: number, h: number) => new CaseGrid<Thing>(w, h, (t) => ({ w: t.w, h: t.h }));

describe('the case grid', () => {
  it('places an item in the first free spot, top-left first', () => {
    const g = grid(4, 3);
    const a = thing(2, 2);
    const b = thing(2, 2);
    expect(g.autoPlace(a)).toBe(true);
    expect(g.autoPlace(b)).toBe(true);
    expect([a.x, a.y]).toEqual([0, 0]);
    expect([b.x, b.y]).toEqual([2, 0]);
    expect(g.freeCells).toBe(12 - 8);
  });

  it('never lets two items overlap or poke out of the case', () => {
    const g = grid(4, 4);
    const a = thing(3, 3);
    expect(g.place(a, 0, 0, false)).toBe(true);
    expect(g.canPlace(thing(2, 2), 2, 2, false)).toBe(false);
    expect(g.canPlace(thing(2, 2), 3, 3, false)).toBe(false);
    expect(g.canPlace(thing(1, 1), 3, 0, false)).toBe(true);
    expect(g.canPlace(thing(2, 2), -1, 0, false)).toBe(false);
  });

  it('turns an item on its side when that is the only way it fits', () => {
    const g = grid(2, 5);
    const long = thing(5, 2);
    const spot = g.findSpot(long);
    expect(spot).toEqual({ x: 0, y: 0, rot: true });
    expect(g.autoPlace(long)).toBe(true);
    expect(g.footprint(long)).toEqual({ w: 2, h: 5 });
  });

  it('refuses an item when there is no room anywhere', () => {
    const g = grid(2, 2);
    expect(g.autoPlace(thing(2, 2))).toBe(true);
    const extra = thing(1, 1);
    expect(g.hasRoomFor(extra)).toBe(false);
    expect(g.autoPlace(extra)).toBe(false);
    expect(g.items).toHaveLength(1);
  });

  it('finds which item is on a square', () => {
    const g = grid(5, 5);
    const a = thing(2, 1);
    g.place(a, 1, 2, false);
    expect(g.itemAt(2, 2)).toBe(a);
    expect(g.itemAt(3, 2)).toBeNull();
    expect(g.itemAt(1, 3)).toBeNull();
  });

  it('moves an item, including onto squares it already covers, but not onto others', () => {
    const g = grid(5, 5);
    const a = thing(2, 2);
    const b = thing(2, 2);
    g.place(a, 0, 0, false);
    g.place(b, 3, 0, false);
    expect(g.move(a, 1, 0, false)).toBe(true); // slides over its own squares
    expect(g.move(a, 2, 0, false)).toBe(false); // would land on b
    expect([a.x, a.y]).toEqual([1, 0]); // stays where it was
    expect(g.move(a, 0, 3, true)).toBe(true);
  });

  it('frees the squares when an item is removed', () => {
    const g = grid(2, 2);
    const a = thing(2, 2);
    g.autoPlace(a);
    g.remove(a);
    expect(g.freeCells).toBe(4);
    expect(a.x).toBeUndefined();
    expect(g.autoPlace(thing(2, 2))).toBe(true);
  });

  it('sorts big items first so the free space ends up together', () => {
    const g = grid(4, 4);
    const small = thing(1, 1);
    const big = thing(3, 3);
    const mid = thing(2, 1);
    expect(g.place(small, 3, 3, false)).toBe(true);
    expect(g.place(mid, 2, 0, false)).toBe(true);
    expect(g.place(big, 0, 1, false)).toBe(true);
    expect(g.sort()).toBe(true);
    expect([big.x, big.y]).toEqual([0, 0]);
    expect(g.items).toHaveLength(3);
    // Nothing overlaps afterwards.
    for (const a of g.items) for (const b of g.items) if (a !== b) expect(g.canPlace(a, a.x!, a.y!, a.rot ?? false, a)).toBe(true);
  });

  it('can be made bigger, never smaller', () => {
    const g = grid(7, 10);
    g.resize(7, 12);
    expect([g.width, g.height]).toEqual([7, 12]);
    g.resize(5, 5);
    expect([g.width, g.height]).toEqual([7, 12]);
  });
});
