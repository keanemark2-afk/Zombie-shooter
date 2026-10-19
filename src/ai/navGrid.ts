import type { Collider } from '../world/colliders';

// A flat grid laid over the arena so zombies can find their way round fences,
// sheds and crates. One "flow field" is worked out from the player outwards
// (every cell learns how far it is from the player), and each zombie just
// walks downhill. That is cheap even with a whole horde.

// Walking costs are whole numbers (10 for a straight step, 14 for a diagonal), which
// lets the search use a fast bucket queue instead of a heap.
const DX = [1, -1, 0, 0, 1, -1, 1, -1];
const DZ = [0, 0, 1, -1, 1, 1, -1, -1];
const COST = [10, 10, 10, 10, 14, 14, 14, 14];
const INF = 1_000_000_000;
const BUCKETS = 15;

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private readonly blocked: Uint8Array;
  private readonly dist: Int32Array;
  private readonly buckets: number[][] = Array.from({ length: BUCKETS }, () => []);
  /** The cell the current flow field leads to (-1 = none yet). */
  private goal = -1;

  constructor(
    readonly minX: number,
    readonly minZ: number,
    readonly maxX: number,
    readonly maxZ: number,
    readonly cell = 0.5,
  ) {
    this.cols = Math.ceil((maxX - minX) / cell);
    this.rows = Math.ceil((maxZ - minZ) / cell);
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.dist = new Int32Array(n).fill(INF);
  }

  private index(cx: number, cz: number): number {
    return cz * this.cols + cx;
  }

  cellX(x: number): number {
    return Math.floor((x - this.minX) / this.cell);
  }

  cellZ(z: number): number {
    return Math.floor((z - this.minZ) / this.cell);
  }

  inside(cx: number, cz: number): boolean {
    return cx >= 0 && cz >= 0 && cx < this.cols && cz < this.rows;
  }

  /** Marks every cell touched by a solid shape (grown by `inflate`, the walker's radius) as blocked. */
  setObstacles(colliders: readonly Collider[], inflate: number): void {
    this.blocked.fill(0);
    for (const c of colliders) {
      let hx: number;
      let hz: number;
      if (c.kind === 'circle') {
        hx = hz = c.radius + inflate;
      } else {
        const cos = Math.abs(Math.cos(c.rotY));
        const sin = Math.abs(Math.sin(c.rotY));
        hx = c.halfW * cos + c.halfD * sin + inflate;
        hz = c.halfW * sin + c.halfD * cos + inflate;
      }
      const x0 = Math.max(0, this.cellX(c.x - hx));
      const x1 = Math.min(this.cols - 1, this.cellX(c.x + hx));
      const z0 = Math.max(0, this.cellZ(c.z - hz));
      const z1 = Math.min(this.rows - 1, this.cellZ(c.z + hz));
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          const px = this.minX + (cx + 0.5) * this.cell;
          const pz = this.minZ + (cz + 0.5) * this.cell;
          if (this.hits(c, px, pz, inflate)) this.blocked[this.index(cx, cz)] = 1;
        }
      }
    }
    this.goal = -1; // the old flow field no longer fits
  }

  private hits(c: Collider, px: number, pz: number, inflate: number): boolean {
    if (c.kind === 'circle') {
      const r = c.radius + inflate;
      return (px - c.x) ** 2 + (pz - c.z) ** 2 < r * r;
    }
    const cos = Math.cos(c.rotY);
    const sin = Math.sin(c.rotY);
    const rx = px - c.x;
    const rz = pz - c.z;
    // Same frame the collision code uses.
    const lx = rx * cos - rz * sin;
    const lz = rx * sin + rz * cos;
    return Math.abs(lx) < c.halfW + inflate && Math.abs(lz) < c.halfD + inflate;
  }

  isWalkable(x: number, z: number): boolean {
    const cx = this.cellX(x);
    const cz = this.cellZ(z);
    return this.inside(cx, cz) && this.blocked[this.index(cx, cz)] === 0;
  }

  /** The closest walkable cell to a point (searching outwards), or -1. */
  private nearestWalkable(cx: number, cz: number): number {
    if (this.inside(cx, cz) && !this.blocked[this.index(cx, cz)]) return this.index(cx, cz);
    for (let r = 1; r < 12; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (this.inside(x, z) && !this.blocked[this.index(x, z)]) return this.index(x, z);
        }
      }
    }
    return -1;
  }

  /** Works out, for every cell, how far it is from (x, z) by walking round obstacles. */
  flowFrom(x: number, z: number): void {
    const start = this.nearestWalkable(this.cellX(x), this.cellZ(z));
    if (start < 0) return;
    if (start === this.goal) return;
    this.goal = start;
    this.dist.fill(INF);
    for (const b of this.buckets) b.length = 0;
    const { cols, rows, blocked, dist, buckets } = this;
    dist[start] = 0;
    buckets[0].push(start);
    let pending = 1;
    for (let d = 0; pending > 0; d++) {
      const bucket = buckets[d % BUCKETS];
      while (bucket.length > 0) {
        const cur = bucket.pop()!;
        pending--;
        if (dist[cur] !== d) continue; // an older, longer route to this cell
        const cx = cur % cols;
        const cz = (cur - cx) / cols;
        for (let k = 0; k < 8; k++) {
          const nx = cx + DX[k];
          const nz = cz + DZ[k];
          if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
          const n = nz * cols + nx;
          if (blocked[n] !== 0) continue;
          // No cutting corners through a pinch point.
          if (k >= 4 && (blocked[cz * cols + nx] !== 0 || blocked[nz * cols + cx] !== 0)) continue;
          const nd = d + COST[k];
          if (nd < dist[n]) {
            dist[n] = nd;
            buckets[nd % BUCKETS].push(n);
            pending++;
          }
        }
      }
    }
  }

  /** How many metres (roughly) the walk from here to the flow field's goal is. Infinity if there is no way. */
  distanceAt(x: number, z: number): number {
    const c = this.nearestWalkable(this.cellX(x), this.cellZ(z));
    return c < 0 || this.dist[c] >= INF ? Infinity : (this.dist[c] / 10) * this.cell;
  }

  /** True if a straight line between two points crosses no blocked cell. */
  lineClear(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (this.cell * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = this.cellX(ax + dx * t);
      const cz = this.cellZ(az + dz * t);
      if (!this.inside(cx, cz) || this.blocked[this.index(cx, cz)]) return false;
    }
    return true;
  }

  /**
   * Where to head from (x, z) to reach the goal: walks several cells downhill
   * and aims at the furthest one that can be reached in a straight line, so
   * paths are smooth rather than stepping cell by cell. Returns false if
   * there is no way through.
   */
  steer(x: number, z: number, out: { x: number; z: number }): boolean {
    let cur = this.nearestWalkable(this.cellX(x), this.cellZ(z));
    if (cur < 0 || this.dist[cur] >= INF) return false;
    const { cols, blocked, dist } = this;
    let bestX = x;
    let bestZ = z;
    let found = false;
    for (let step = 0; step < 10; step++) {
      const cx = cur % cols;
      const cz = (cur - cx) / cols;
      let next = -1;
      let nextD = dist[cur];
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k];
        const nz = cz + DZ[k];
        if (!this.inside(nx, nz)) continue;
        const n = nz * cols + nx;
        if (blocked[n] !== 0) continue;
        if (k >= 4 && (blocked[cz * cols + nx] !== 0 || blocked[nz * cols + cx] !== 0)) continue;
        if (dist[n] < nextD) {
          nextD = dist[n];
          next = n;
        }
      }
      if (next < 0) break;
      const ncx = next % cols;
      const ncz = (next - ncx) / cols;
      const px = this.minX + (ncx + 0.5) * this.cell;
      const pz = this.minZ + (ncz + 0.5) * this.cell;
      if (step > 0 && !this.lineClear(x, z, px, pz)) break;
      bestX = px;
      bestZ = pz;
      found = true;
      cur = next;
      if (dist[cur] === 0) break;
    }
    out.x = bestX;
    out.z = bestZ;
    return found;
  }
}
