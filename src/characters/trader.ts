import { CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, SphereGeometry, type Object3D } from 'three';
import { traderLook } from './looks';
import { buildRig, PoseBlender, type Euler3, type JointName, type Pose, type Rig } from './rig';

// The Trader: a hooded figure who stands behind the stall between waves.
// Built from the same body parts as everyone else, with a cloak and hood on
// top, and a slow idle: breathing, a tilt of the head, a gesture now and then.

const cloakMat = new MeshStandardMaterial({ color: '#2d202d', roughness: 0.95, side: DoubleSide });
const hoodInner = new MeshStandardMaterial({ color: '#07050a', roughness: 1 });

export class TraderNpc {
  readonly object: Group;
  private readonly rig: Rig;
  private readonly blender = new PoseBlender();
  private time = Math.random() * 10;
  private gesture = 0;
  private gestureTimer = 3;
  /** Which way to look: a little towards the player when one is close. */
  lookYaw = 0;

  constructor() {
    this.rig = buildRig(traderLook());
    this.object = this.rig.root;
    const dress = (parent: Object3D, geo: ConstructorParameters<typeof Mesh>[0], mat: MeshStandardMaterial, x: number, y: number, z: number): Mesh => {
      const m = new Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.raycast = () => {};
      parent.add(m);
      return m;
    };
    // A long cloak from the shoulders down to the boots.
    const spine = this.rig.joints.spine;
    const hips = this.rig.joints.hips;
    dress(spine, new CylinderGeometry(0.2, 0.27, 0.62, 12, 1, true), cloakMat, 0, 0.2, 0.01);
    dress(hips, new CylinderGeometry(0.25, 0.31, 0.78, 12, 1, true), cloakMat, 0, -0.42, 0.01);
    // The hood: a pointed shell round the head with a black hollow where the face is.
    const head = this.rig.joints.head;
    const shell = dress(head, new SphereGeometry(0.15, 14, 12), cloakMat, 0, 0.11, 0.012);
    shell.scale.set(1.0, 1.15, 1.1);
    dress(head, new SphereGeometry(0.1, 10, 8), hoodInner, 0, 0.1, -0.075).scale.set(0.95, 1.1, 0.7);
    dress(head, new CylinderGeometry(0.0, 0.1, 0.2, 10), cloakMat, 0, 0.27, 0.05).rotation.x = -0.35;
    // A cowl over the shoulders.
    const cowl = dress(spine, new SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), cloakMat, 0, 0.52, 0);
    cowl.scale.set(1.6, 0.9, 1.3);
    this.object.visible = false;
    this.blender.snap(this.pose());
    this.blender.apply(this.rig);
  }

  set visible(v: boolean) {
    this.object.visible = v;
  }

  get visible(): boolean {
    return this.object.visible;
  }

  /** Where the Trader stands. */
  place(x: number, y: number, z: number, yaw: number): void {
    this.object.position.set(x, y, z);
    this.object.rotation.set(0, yaw, 0);
  }

  update(dt: number): void {
    if (!this.object.visible) return;
    this.time += dt;
    this.gestureTimer -= dt;
    if (this.gestureTimer <= 0) {
      this.gesture = 1.2;
      this.gestureTimer = 4 + Math.random() * 5;
    }
    this.gesture = Math.max(0, this.gesture - dt);
    this.blender.update(this.pose(), dt, 6, 8);
    this.blender.apply(this.rig);
    this.object.updateMatrixWorld(true);
  }

  private pose(): Pose {
    const t = this.time;
    const j: Partial<Record<JointName, Euler3>> = {};
    const g = Math.sin(Math.min(1, this.gesture / 1.2) * Math.PI);
    const breathe = Math.sin(t * 1.6) * 0.02;
    j.spine = [-0.12 + breathe, 0.05 * Math.sin(t * 0.5), 0];
    j.neck = [0.12, 0, 0];
    j.head = [0.1 + 0.05 * Math.sin(t * 0.8), this.lookYaw * 0.6 + 0.2 * Math.sin(t * 0.35), 0.05 * Math.sin(t * 0.45)];
    // Hands resting on the counter, one lifting now and then.
    j.shoulderL = [0.75, 0, 0.14];
    j.elbowL = [0.9, 0, 0];
    j.shoulderR = [0.75 + 0.8 * g, 0, -0.14 - 0.2 * g];
    j.elbowR = [0.9 - 0.3 * g, 0, 0];
    j.wristR = [0.2 * g, 0, 0];
    j.hipL = [0.02, 0, -0.04];
    j.hipR = [-0.02, 0, 0.04];
    return { j, hipsY: -0.02 };
  }
}
