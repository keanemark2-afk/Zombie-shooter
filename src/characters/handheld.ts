import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
  Vector3,
} from 'three';

// Things characters hold. In a hand's own frame, -y points out past the
// fingers (along the arm) and +z points out of the bottom of the fist.

const gunMetal = new MeshStandardMaterial({ color: '#25272a', roughness: 0.45, metalness: 0.8 });
const gunGrip = new MeshStandardMaterial({ color: '#1c1a18', roughness: 0.8, metalness: 0.1 });
const laserBody = new MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.5, metalness: 0.5 });
const wood = new MeshStandardMaterial({ color: '#5a4330', roughness: 0.9 });
const rustyBlade = new MeshStandardMaterial({ color: '#6b5b4e', roughness: 0.55, metalness: 0.6 });

export interface PistolModel {
  group: Group;
  slide: Mesh;
  /** End of the barrel, where bullets and the muzzle flash come from. */
  muzzle: Object3D;
  /** Front of the laser module under the barrel. */
  laser: Object3D;
  /** Where spent casings fly out. */
  ejectionPort: Object3D;
}

export function buildPistol(): PistolModel {
  const group = new Group();
  const noHit = (m: Mesh) => {
    m.castShadow = true;
    m.raycast = () => {};
    return m;
  };
  const slide = noHit(new Mesh(new BoxGeometry(0.03, 0.19, 0.038), gunMetal));
  slide.position.set(0, -0.075, -0.05);
  group.add(slide);
  const frame = noHit(new Mesh(new BoxGeometry(0.027, 0.15, 0.025), gunMetal));
  frame.position.set(0, -0.06, -0.022);
  group.add(frame);
  const grip = noHit(new Mesh(new BoxGeometry(0.029, 0.045, 0.11), gunGrip));
  grip.position.set(0, 0.0, 0.03);
  grip.rotation.x = -0.25;
  group.add(grip);
  const guard = noHit(new Mesh(new BoxGeometry(0.01, 0.05, 0.03), gunMetal));
  guard.position.set(0, -0.04, 0.0);
  group.add(guard);
  const laserBox = noHit(new Mesh(new BoxGeometry(0.022, 0.05, 0.022), laserBody));
  laserBox.position.set(0, -0.115, -0.012);
  group.add(laserBox);

  const muzzle = new Object3D();
  muzzle.position.set(0, -0.172, -0.05);
  group.add(muzzle);
  const laser = new Object3D();
  laser.position.set(0, -0.142, -0.012);
  group.add(laser);
  const ejectionPort = new Object3D();
  ejectionPort.position.set(0.02, -0.06, -0.07);
  group.add(ejectionPort);
  return { group, slide, muzzle, laser, ejectionPort };
}

export type ToolKind = 'sickle' | 'club';

/** A farm tool a zombie can carry (and drop when shot in the arm). */
export function buildTool(kind: ToolKind): Group {
  const g = new Group();
  const add = (m: Mesh) => {
    m.castShadow = true;
    m.raycast = () => {};
    g.add(m);
    return m;
  };
  if (kind === 'sickle') {
    const handle = add(new Mesh(new CylinderGeometry(0.018, 0.02, 0.3, 6), wood));
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, 0, -0.1);
    const blade = add(new Mesh(new TorusGeometry(0.13, 0.012, 4, 14, Math.PI * 1.1), rustyBlade));
    blade.scale.set(1, 1, 2.2);
    blade.rotation.y = Math.PI / 2;
    blade.position.set(0, -0.12, -0.25);
  } else {
    const club = add(new Mesh(new CylinderGeometry(0.035, 0.022, 0.6, 7), wood));
    club.rotation.x = Math.PI / 2;
    club.position.set(0, 0, -0.25);
  }
  return g;
}

/** A dropped tool tumbling to the ground. */
export class FallingProp {
  readonly velocity = new Vector3();
  readonly spin = new Vector3();
  resting = false;

  constructor(readonly object: Object3D) {}

  update(dt: number, groundHeight: number): void {
    if (this.resting) return;
    this.velocity.y -= 9.8 * dt;
    this.object.position.addScaledVector(this.velocity, dt);
    this.object.rotation.x += this.spin.x * dt;
    this.object.rotation.y += this.spin.y * dt;
    this.object.rotation.z += this.spin.z * dt;
    if (this.object.position.y <= groundHeight + 0.03) {
      this.object.position.y = groundHeight + 0.03;
      if (Math.abs(this.velocity.y) < 1.2) {
        // Settle flat on the ground.
        this.resting = true;
        this.object.rotation.set(0, this.object.rotation.y, Math.PI / 2);
      } else {
        this.velocity.y *= -0.3;
        this.velocity.x *= 0.5;
        this.velocity.z *= 0.5;
        this.spin.multiplyScalar(0.5);
      }
    }
  }
}
