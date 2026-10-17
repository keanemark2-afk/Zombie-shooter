import { Matrix4, Quaternion, Vector3, type Object3D } from 'three';

// Two-bone "reach" solver: bends a shoulder and elbow so the hand lands on a
// target point. Used to point the gun where you aim and to bring the other
// hand onto the grip.

const A = new Vector3();
const d = new Vector3();
const u = new Vector3();
const b = new Vector3();
const k = new Vector3();
const xAxis = new Vector3();
const yAxis = new Vector3();
const zAxis = new Vector3();
const basis = new Matrix4();
const parentQuat = new Quaternion();
const parentQuatInv = new Quaternion();
const targetQuat = new Quaternion();
const poleLocal = new Vector3();
const DOWN = new Vector3(0, -1, 0);

/**
 * `shoulder` and `elbow` are joints whose bones hang along their local -y and
 * whose elbow bends around local +x. `target` and `pole` are world-space;
 * `pole` is the direction the elbow should point. `weight` blends from the
 * current pose (0) to the solved pose (1).
 */
export function reachTwoBone(
  shoulder: Object3D,
  elbow: Object3D,
  upperLength: number,
  lowerLength: number,
  target: Vector3,
  pole: Vector3,
  weight: number,
): void {
  if (weight <= 0) return;
  const parent = shoulder.parent!;
  parent.updateWorldMatrix(true, false);
  parent.getWorldQuaternion(parentQuat);
  parentQuatInv.copy(parentQuat).invert();
  shoulder.getWorldPosition(A);
  // Work in the parent's frame (and its scale).
  const scale = parent.getWorldScale(new Vector3()).x;
  d.subVectors(target, A).applyQuaternion(parentQuatInv).divideScalar(scale);
  poleLocal.copy(pole).applyQuaternion(parentQuatInv);
  const L1 = upperLength;
  const L2 = lowerLength;
  const dist = Math.min(Math.max(d.length(), Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-4);
  d.normalize();

  // Angle between the upper arm and the straight line to the target.
  const cosA = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
  const angleA = Math.acos(Math.min(1, Math.max(-1, cosA)));
  // Elbow bend (0 = straight).
  const cosE = (L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2);
  const bend = Math.PI - Math.acos(Math.min(1, Math.max(-1, cosE)));

  // Push the upper arm away from the target line towards the pole side.
  b.copy(poleLocal).addScaledVector(d, -poleLocal.dot(d));
  if (b.lengthSq() < 1e-8) b.set(0, -1, 0).addScaledVector(d, d.y);
  b.normalize();
  k.crossVectors(d, b).normalize();
  u.copy(d).applyAxisAngle(k, angleA);

  // Shoulder frame: bone along -y, elbow bends so the forearm swings towards -z.
  yAxis.copy(u).negate();
  zAxis.copy(d).addScaledVector(u, -d.dot(u));
  if (zAxis.lengthSq() < 1e-8) zAxis.copy(b);
  zAxis.normalize().negate();
  xAxis.crossVectors(yAxis, zAxis).normalize();
  zAxis.crossVectors(xAxis, yAxis).normalize();
  basis.makeBasis(xAxis, yAxis, zAxis);
  targetQuat.setFromRotationMatrix(basis);
  shoulder.quaternion.slerp(targetQuat, weight);

  targetQuat.setFromAxisAngle(xAxis.set(1, 0, 0), bend);
  elbow.quaternion.slerp(targetQuat, weight);
}

/** Turns a joint so its local -y axis points at a world-space target. */
export function pointBoneAt(joint: Object3D, target: Vector3, weight: number): void {
  if (weight <= 0) return;
  const parent = joint.parent!;
  parent.updateWorldMatrix(true, false);
  parent.getWorldQuaternion(parentQuat);
  parentQuatInv.copy(parentQuat).invert();
  joint.getWorldPosition(A);
  d.subVectors(target, A).applyQuaternion(parentQuatInv).normalize();
  targetQuat.setFromUnitVectors(DOWN, d);
  joint.quaternion.slerp(targetQuat, weight);
}
