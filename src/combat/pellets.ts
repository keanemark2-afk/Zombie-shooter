import { Vector3 } from 'three';

/** How much of a pellet's damage and push is left at a distance (1 = all of it). */
export function falloff(distance: number, start: number, end: number, min: number): number {
  if (distance <= start || end <= start) return distance <= start ? 1 : min;
  if (distance >= end) return min;
  const t = (distance - start) / (end - start);
  return 1 + (min - 1) * t;
}

const right = new Vector3();
const up = new Vector3();
const WORLD_UP = new Vector3(0, 1, 0);

/**
 * A random direction inside a cone around `dir` (half-angle in degrees),
 * spread evenly over the cone's circle. `random` returns 0..1.
 */
export function randomInCone(dir: Vector3, halfAngleDeg: number, out: Vector3, random: () => number = Math.random): Vector3 {
  out.copy(dir);
  if (halfAngleDeg <= 0) return out;
  right.crossVectors(dir, WORLD_UP);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  up.crossVectors(right, dir).normalize();
  const angle = (halfAngleDeg * Math.PI) / 180;
  const r = Math.tan(angle) * Math.sqrt(random());
  const theta = random() * Math.PI * 2;
  return out.addScaledVector(right, Math.cos(theta) * r).addScaledVector(up, Math.sin(theta) * r).normalize();
}

/**
 * Close-range shotgun blast push on a zombie `distance` metres away and
 * `angleDeg` off the aim line. Strongest point-blank, nothing past the range
 * or outside the angle.
 */
export function blastPush(distance: number, angleDeg: number, range: number, maxAngle: number, push: number): number {
  if (range <= 0 || push <= 0 || distance >= range || angleDeg > maxAngle) return 0;
  const near = distance / range;
  return push * (1 - near * near);
}
