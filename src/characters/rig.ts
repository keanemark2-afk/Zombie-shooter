import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Zone } from '../combat/damage';
import type { CharacterLook } from './looks';

// A humanoid built from separate body parts hung on a skeleton of joints.
// The body-part meshes are also the hitboxes. The model faces -z (away from a
// camera placed behind it); its right side is +x.

export const JOINTS = [
  'hips', 'spine', 'neck', 'head',
  'shoulderL', 'elbowL', 'wristL',
  'shoulderR', 'elbowR', 'wristR',
  'hipL', 'kneeL', 'ankleL',
  'hipR', 'kneeR', 'ankleR',
] as const;
export type JointName = (typeof JOINTS)[number];

/** Standing hip height before scaling. */
export const HIP_HEIGHT = 0.95;

export interface Rig {
  /** On the ground; position = feet, rotation.y = facing. */
  root: Group;
  /** Whole-body tilt for falls, pivoting at the feet. */
  body: Group;
  joints: Record<JointName, Object3D>;
  /** Meshes bullets can hit; each has userData.zone. */
  parts: Mesh[];
  /** Attach points in the palms. */
  handR: Object3D;
  handL: Object3D;
  setHitboxView(on: boolean): void;
}

const ZONE_COLORS: Record<Zone, string> = {
  head: '#ff3b30',
  torso: '#ffcc00',
  armL: '#34c759',
  armR: '#30b0c7',
  legL: '#5856d6',
  legR: '#af52de',
};

const MOUTH = new MeshBasicMaterial({ color: '#1a0d0a' });

function capsule(radius: number, length: number): CapsuleGeometry {
  return new CapsuleGeometry(radius, Math.max(0.001, length - radius * 2), 4, 8);
}

export function buildRig(look: CharacterLook): Rig {
  const root = new Group();
  const body = new Group();
  root.add(body);
  root.scale.setScalar(look.height);

  const joints = {} as Record<JointName, Object3D>;
  const parts: Mesh[] = [];
  const originals = new Map<Mesh, Material>();
  const w = look.build;

  const joint = (name: JointName, parent: Object3D, x: number, y: number, z: number): Object3D => {
    const j = new Object3D();
    j.name = name;
    j.position.set(x, y, z);
    parent.add(j);
    joints[name] = j;
    return j;
  };

  const part = (parent: Object3D, geo: BufferGeometry, mat: Material, zone: Zone | null, x: number, y: number, z: number): Mesh => {
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    if (zone) {
      m.userData.zone = zone;
      parts.push(m);
      originals.set(m, mat);
    } else {
      m.raycast = () => {}; // decoration only, bullets pass through
    }
    return m;
  };

  // Torso.
  const hips = joint('hips', body, 0, HIP_HEIGHT, 0);
  part(hips, new RoundedBoxGeometry(0.34 * w, 0.22, 0.21, 2, 0.06), look.pants, 'torso', 0, -0.02, 0);
  part(hips, new BoxGeometry(0.36 * w, 0.05, 0.23), look.shoes, null, 0, 0.08, 0); // belt
  const spine = joint('spine', hips, 0, 0.1, 0);
  part(spine, new RoundedBoxGeometry(0.4 * w, 0.52, 0.24, 2, 0.08), look.shirt, 'torso', 0, 0.24, 0);
  const neck = joint('neck', spine, 0, 0.5, 0.0);
  part(neck, new CylinderGeometry(0.05, 0.06, 0.12, 8), look.skin, 'head', 0, 0.04, 0);
  const head = joint('head', neck, 0, 0.1, 0);
  const headMesh = part(head, new SphereGeometry(0.115, 14, 12), look.skin, 'head', 0, 0.1, -0.01);
  headMesh.scale.set(0.92, 1.08, 1);
  if (look.hair) {
    const cap = part(head, new SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), look.hair, null, 0, 0.105, 0.005);
    cap.scale.set(0.95, 1.1, 1.02);
    cap.rotation.x = 0.45;
  }
  for (const sx of [-1, 1]) {
    part(head, new SphereGeometry(0.018, 8, 6), look.eyes, null, sx * 0.04, 0.12, -0.105);
  }
  part(head, new BoxGeometry(0.06, 0.012, 0.02), MOUTH, null, 0, 0.045, -0.105);
  if (!look.zombie) {
    // Jacket collar for a readable silhouette from behind.
    part(spine, new BoxGeometry(0.3 * w, 0.08, 0.2), look.shirt, null, 0, 0.5, 0.03);
  }

  // Arms.
  for (const side of ['L', 'R'] as const) {
    const sx = side === 'R' ? 1 : -1;
    const zone: Zone = side === 'R' ? 'armR' : 'armL';
    const shoulder = joint(`shoulder${side}`, spine, sx * 0.22 * w, 0.44, 0);
    part(shoulder, capsule(0.058, 0.3), look.sleeves, zone, 0, -0.14, 0);
    const elbow = joint(`elbow${side}`, shoulder, 0, -0.29, 0);
    part(elbow, capsule(0.047, 0.27), look.forearms, zone, 0, -0.12, 0);
    const wrist = joint(`wrist${side}`, elbow, 0, -0.25, 0);
    part(wrist, new BoxGeometry(0.075, 0.1, 0.04), look.hands, zone, 0, -0.05, 0);
  }

  // Legs.
  for (const side of ['L', 'R'] as const) {
    const sx = side === 'R' ? 1 : -1;
    const zone: Zone = side === 'R' ? 'legR' : 'legL';
    const hip = joint(`hip${side}`, hips, sx * 0.1 * w, -0.05, 0);
    part(hip, capsule(0.078, 0.46), look.pants, zone, 0, -0.21, 0);
    const knee = joint(`knee${side}`, hip, 0, -0.44, 0);
    part(knee, capsule(0.062, 0.44), look.pants, zone, 0, -0.2, 0);
    const ankle = joint(`ankle${side}`, knee, 0, -0.41, 0);
    part(ankle, new BoxGeometry(0.1, 0.075, 0.25), look.shoes, zone, 0, -0.01, -0.05);
  }

  const handR = new Object3D();
  handR.position.set(0, -0.07, 0);
  joints.wristR.add(handR);
  const handL = new Object3D();
  handL.position.set(0, -0.07, 0);
  joints.wristL.add(handL);

  const hitboxMats = new Map<Zone, Material>();
  return {
    root,
    body,
    joints,
    parts,
    handR,
    handL,
    setHitboxView(on: boolean) {
      for (const m of parts) {
        const zone = m.userData.zone as Zone;
        if (on) {
          let mat = hitboxMats.get(zone);
          if (!mat) {
            mat = new MeshBasicMaterial({ color: ZONE_COLORS[zone] });
            hitboxMats.set(zone, mat);
          }
          m.material = mat;
        } else {
          m.material = originals.get(m)!;
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Poses and blending

export type Euler3 = [number, number, number];

/** A full-body pose: joint rotations plus whole-body offsets. Missing joints are 0. */
export interface Pose {
  j: Partial<Record<JointName, Euler3>>;
  /** Hip height change (negative = crouch / kneel). */
  hipsY?: number;
  /** Hip shift forward (-) or back (+). */
  hipsZ?: number;
  /** Whole-body forward (-) / backward (+) topple around the feet, for falls. */
  bodyPitch?: number;
  /** Whole-body sideways topple. */
  bodyRoll?: number;
  /** Lift the whole body (keeps a lying body above the ground). */
  bodyLift?: number;
  /** Shift the whole body forward (-) / back (+). */
  bodyZ?: number;
}

const BODY_KEYS = ['hipsY', 'hipsZ', 'bodyPitch', 'bodyRoll', 'bodyLift', 'bodyZ'] as const;
type BodyKey = (typeof BODY_KEYS)[number];

interface Spring {
  v: Vector3;
  vel: Vector3;
}

/**
 * Smoothly moves a rig towards whatever pose the animation asks for, and adds
 * springy "flinch" kicks on top (each hit jolts a joint, which wobbles back).
 */
export class PoseBlender {
  private readonly cur = {} as Record<JointName, Vector3>;
  private readonly body: Record<BodyKey, number> = { hipsY: 0, hipsZ: 0, bodyPitch: 0, bodyRoll: 0, bodyLift: 0, bodyZ: 0 };
  private readonly springs = {} as Record<JointName, Spring>;
  stiffness = 160;
  damping = 13;

  constructor() {
    for (const name of JOINTS) {
      this.cur[name] = new Vector3();
      this.springs[name] = { v: new Vector3(), vel: new Vector3() };
    }
  }

  /** Jumps straight to a pose with no blending (e.g. on spawn). */
  snap(pose: Pose): void {
    for (const name of JOINTS) {
      const t = pose.j[name];
      this.cur[name].set(t?.[0] ?? 0, t?.[1] ?? 0, t?.[2] ?? 0);
    }
    for (const k of BODY_KEYS) this.body[k] = pose[k] ?? 0;
  }

  /** Blends towards `pose`. Higher `rate` = snappier. */
  update(pose: Pose, dt: number, rate: number, bodyRate = rate): void {
    const a = 1 - Math.exp(-rate * dt);
    for (const name of JOINTS) {
      const t = pose.j[name];
      const c = this.cur[name];
      c.x += ((t?.[0] ?? 0) - c.x) * a;
      c.y += ((t?.[1] ?? 0) - c.y) * a;
      c.z += ((t?.[2] ?? 0) - c.z) * a;
    }
    const b = 1 - Math.exp(-bodyRate * dt);
    for (const k of BODY_KEYS) this.body[k] += ((pose[k] ?? 0) - this.body[k]) * b;

    for (const name of JOINTS) {
      const s = this.springs[name];
      s.vel.addScaledVector(s.v, -this.stiffness * dt).multiplyScalar(Math.max(0, 1 - this.damping * dt));
      s.v.addScaledVector(s.vel, dt);
    }
  }

  /** A sudden jolt to one joint (radians per second of spin). */
  kick(name: JointName, x: number, y: number, z: number): void {
    this.springs[name].vel.x += x;
    this.springs[name].vel.y += y;
    this.springs[name].vel.z += z;
  }

  apply(rig: Rig): void {
    for (const name of JOINTS) {
      const c = this.cur[name];
      const s = this.springs[name].v;
      rig.joints[name].rotation.set(c.x + s.x, c.y + s.y, c.z + s.z);
    }
    rig.joints.hips.position.set(0, HIP_HEIGHT + this.body.hipsY, this.body.hipsZ);
    rig.body.rotation.set(this.body.bodyPitch, 0, this.body.bodyRoll);
    rig.body.position.set(0, this.body.bodyLift, this.body.bodyZ);
  }
}
