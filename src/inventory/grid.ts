// The attache case: items of different shapes laid out on a grid. Pure rules
// (no graphics), so they can be unit-tested. An item may be turned on its side.

export interface GridItem {
  id: number;
  /** Top-left square the item sits on (unset while it is not in the case). */
  x?: number;
  y?: number;
  /** Turned on its side. */
  rot?: boolean;
}

export interface Size {
  w: number;
  h: number;
}

export interface Spot {
  x: number;
  y: number;
  rot: boolean;
}

export class CaseGrid<T extends GridItem> {
  private readonly placed: T[] = [];

  constructor(
    public width: number,
    public height: number,
    /** How big the item is before turning (width and height in squares). */
    private readonly sizeOf: (item: T) => Size,
  ) {}

  /** The squares the item covers, allowing for being turned on its side. */
  footprint(item: T, rot = item.rot ?? false): Size {
    const s = this.sizeOf(item);
    return rot ? { w: s.h, h: s.w } : s;
  }

  get items(): readonly T[] {
    return this.placed;
  }

  /** Squares nobody is sitting on. */
  get freeCells(): number {
    let used = 0;
    for (const it of this.placed) {
      const f = this.footprint(it);
      used += f.w * f.h;
    }
    return this.width * this.height - used;
  }

  has(item: T): boolean {
    return this.placed.includes(item);
  }

  /** Which item covers this square (null if empty). */
  itemAt(x: number, y: number, ignore?: T): T | null {
    for (const it of this.placed) {
      if (it === ignore) continue;
      const f = this.footprint(it);
      const ix = it.x ?? 0;
      const iy = it.y ?? 0;
      if (x >= ix && x < ix + f.w && y >= iy && y < iy + f.h) return it;
    }
    return null;
  }

  /** Could the item sit here (inside the case and not on top of another item)? `ignore` is the item itself when it is being moved. */
  canPlace(item: T, x: number, y: number, rot: boolean, ignore?: T): boolean {
    const f = this.footprint(item, rot);
    if (x < 0 || y < 0 || x + f.w > this.width || y + f.h > this.height) return false;
    for (const other of this.placed) {
      if (other === ignore || other === item) continue;
      const o = this.footprint(other);
      const ox = other.x ?? 0;
      const oy = other.y ?? 0;
      if (x < ox + o.w && x + f.w > ox && y < oy + o.h && y + f.h > oy) return false;
    }
    return true;
  }

  /** Puts the item on the grid at this spot. Returns false (and changes nothing) if it doesn't fit. */
  place(item: T, x: number, y: number, rot: boolean): boolean {
    if (!this.canPlace(item, x, y, rot)) return false;
    item.x = x;
    item.y = y;
    item.rot = rot;
    if (!this.placed.includes(item)) this.placed.push(item);
    return true;
  }

  /** Moves an item already in the case. If the new spot is blocked, it stays where it was. */
  move(item: T, x: number, y: number, rot: boolean): boolean {
    if (!this.placed.includes(item) || !this.canPlace(item, x, y, rot, item)) return false;
    item.x = x;
    item.y = y;
    item.rot = rot;
    return true;
  }

  remove(item: T): void {
    const i = this.placed.indexOf(item);
    if (i >= 0) this.placed.splice(i, 1);
    item.x = undefined;
    item.y = undefined;
  }

  /** The first free spot (reading left to right, top to bottom), trying the item both ways round. */
  findSpot(item: T): Spot | null {
    const s = this.sizeOf(item);
    const options: boolean[] = s.w === s.h ? [false] : item.rot ? [true, false] : [false, true];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        for (const rot of options) if (this.canPlace(item, x, y, rot)) return { x, y, rot };
      }
    }
    return null;
  }

  /** Adds the item in the first free spot. */
  autoPlace(item: T): boolean {
    const spot = this.findSpot(item);
    return spot ? this.place(item, spot.x, spot.y, spot.rot) : false;
  }

  /** Is there room for something of this size anywhere? */
  hasRoomFor(item: T): boolean {
    return this.findSpot(item) !== null;
  }

  /** Packs everything again, biggest first, so the free space ends up in one piece. Returns false (and leaves things alone) if it would not all fit. */
  sort(): boolean {
    const items = [...this.placed].sort((a, b) => {
      const sa = this.sizeOf(a);
      const sb = this.sizeOf(b);
      return sb.w * sb.h - sa.w * sa.h || Math.max(sb.w, sb.h) - Math.max(sa.w, sa.h) || a.id - b.id;
    });
    const before = items.map((it) => ({ it, x: it.x, y: it.y, rot: it.rot }));
    this.placed.length = 0;
    for (const it of items) it.x = it.y = undefined;
    for (const it of items) {
      if (!this.autoPlace(it)) {
        // Could not repack: put everything back as it was.
        this.placed.length = 0;
        for (const b of before) {
          b.it.x = b.x;
          b.it.y = b.y;
          b.it.rot = b.rot;
          this.placed.push(b.it);
        }
        return false;
      }
    }
    return true;
  }

  /** Makes the case bigger (it never shrinks). */
  resize(width: number, height: number): void {
    this.width = Math.max(this.width, width);
    this.height = Math.max(this.height, height);
  }

  clear(): void {
    for (const it of this.placed) it.x = it.y = undefined;
    this.placed.length = 0;
  }
}
