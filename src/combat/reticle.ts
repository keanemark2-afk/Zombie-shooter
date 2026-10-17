// Reticle focus: the aim starts wide when you raise the gun and tightens while
// you hold still. Moving, swinging the camera or firing widens it again.
// The laser dot wanders inside the reticle, and the bullet goes exactly where
// the dot is, so a tighter reticle really is more accurate.

export interface FocusStats {
  focusTime: number;
  spreadWide: number;
  spreadTight: number;
  spreadMoving: number;
  fireBloom: number;
  turnBloom: number;
}

export class ReticleFocus {
  /** Current reticle radius, in degrees. */
  spread = 0;
  private aiming = false;

  /** 0 = wide open, 1 = fully focused. */
  focus(stats: FocusStats): number {
    const range = stats.spreadWide - stats.spreadTight;
    if (range <= 1e-6) return 1;
    return Math.max(0, Math.min(1, 1 - (this.spread - stats.spreadTight) / range));
  }

  /**
   * Call every update. `moving` = walking while aiming; `turnDegrees` = how far
   * the camera swung since the last update.
   */
  update(dt: number, aiming: boolean, moving: boolean, turnDegrees: number, stats: FocusStats): void {
    if (aiming && !this.aiming) this.spread = stats.spreadWide;
    this.aiming = aiming;
    if (!aiming) {
      this.spread = stats.spreadWide;
      return;
    }
    this.spread += Math.abs(turnDegrees) * stats.turnBloom;
    const target = moving ? Math.max(stats.spreadTight, stats.spreadMoving) : stats.spreadTight;
    const rate = (stats.spreadWide - stats.spreadTight) / Math.max(0.01, stats.focusTime);
    if (this.spread > target) this.spread = Math.max(target, this.spread - rate * dt);
    else this.spread = Math.min(target, this.spread + rate * dt * 2);
    this.spread = Math.min(this.spread, stats.spreadWide);
  }

  /** Each shot knocks the reticle open a little. */
  onFire(stats: FocusStats): void {
    this.spread = Math.min(stats.spreadWide, this.spread + stats.fireBloom);
  }
}

/**
 * Smooth wandering point inside a circle of radius 1, for the laser dot.
 * Uses a few overlapping sine waves so it never visibly repeats.
 */
export function swayOffset(time: number, seed = 0): { x: number; y: number } {
  const t = time + seed * 13.7;
  let x = Math.sin(t * 1.0) * 0.55 + Math.sin(t * 2.3 + 1.7) * 0.3 + Math.sin(t * 4.1 + 0.4) * 0.15;
  let y = Math.sin(t * 1.3 + 2.1) * 0.55 + Math.sin(t * 2.9 + 0.3) * 0.3 + Math.sin(t * 3.7 + 2.6) * 0.15;
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  return { x, y };
}
