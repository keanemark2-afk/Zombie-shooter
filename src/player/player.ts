import { MathUtils, Quaternion, Vector3 } from 'three';
import { buildPistol, type PistolModel } from '../characters/handheld';
import { pointBoneAt, reachTwoBone } from '../characters/ik';
import { playerLook } from '../characters/looks';
import { buildRig, PoseBlender, type Euler3, type JointName, type Pose, type Rig } from '../characters/rig';
import { ReticleFocus, swayOffset } from '../combat/reticle';
import { tuning } from '../config/tuning';
import type { World } from '../world/world';
import type { ShoulderCamera } from './shoulderCamera';

/** One update's worth of player controls, from keyboard/mouse or gamepad. */
export interface PlayerInput {
  /** -1 (left) .. 1 (right). */
  moveX: number;
  /** -1 (back) .. 1 (forward). */
  moveY: number;
  aim: boolean;
  firePressed: boolean;
  reloadPressed: boolean;
  sprint: boolean;
  sprintPressed: boolean;
}

/** Things the player asks the rest of the game to do. */
export interface PlayerHost {
  /** Pull the trigger: the game traces the bullet and plays the effects. */
  fire(): void;
  dryFire(): void;
  reloadStep(step: 'out' | 'in' | 'rack'): void;
  footstep(pos: Vector3, sprinting: boolean): void;
}

const IK_JOINTS: JointName[] = ['shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR'];
const UPPER_ARM = 0.29;
const LOWER_ARM = 0.32;

const tmp = new Vector3();
const tmp2 = new Vector3();
const moveDir = new Vector3();

function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Player {
  readonly rig: Rig;
  readonly pistol: PistolModel;
  readonly reticle = new ReticleFocus();
  readonly position = new Vector3();
  readonly prevPosition = new Vector3();
  readonly velocity = new Vector3();
  yaw = 0;
  prevYaw = 0;

  aiming = false;
  sprinting = false;
  ammo: number;
  reserve: number;
  reloading = false;
  reloadTime = 0;
  reloadTotal = 0;
  /** Seconds left before the gun can fire again. */
  fireCooldown = 0;
  stunTime = 0;
  quickTurnTime = 0;

  private readonly blender = new PoseBlender();
  private readonly baseQuats = new Map<JointName, Quaternion>();
  private phase = 0;
  private aimWeight = 0;
  private recoilAnim = 0;
  private slideBack = 0;
  private swayTime = 0;
  private stepTimer = 0;
  private lastCameraYaw = 0;
  private lastCameraPitch = 0;
  private reloadSteps = 0;
  private emptyReload = false;
  private readonly push = new Vector3();
  private turnCamFrom = 0;
  private turnBodyFrom = 0;
  private turnBodyBy = 0;

  constructor() {
    this.rig = buildRig(playerLook());
    this.pistol = buildPistol();
    this.rig.handR.add(this.pistol.group);
    for (const j of IK_JOINTS) this.baseQuats.set(j, new Quaternion());
    this.ammo = tuning.pistol.capacity;
    this.reserve = tuning.pistol.spareAmmo;
  }

  get object() {
    return this.rig.root;
  }

  /** 0 = wide reticle, 1 = fully focused. */
  get focus(): number {
    return this.reticle.focus(tuning.pistol);
  }

  spawn(x: number, z: number, yaw: number, world: World): void {
    this.position.set(x, world.groundHeight(x, z), z);
    this.prevPosition.copy(this.position);
    this.velocity.set(0, 0, 0);
    this.yaw = this.prevYaw = yaw;
    this.ammo = tuning.pistol.capacity;
    this.reserve = tuning.pistol.spareAmmo;
    this.reloading = false;
    this.stunTime = 0;
    this.quickTurnTime = 0;
    this.blender.snap(this.pose());
    this.blender.apply(this.rig);
  }

  /** Where the laser points this instant: camera aim plus the reticle wobble. */
  laserDirection(cam: ShoulderCamera, out: Vector3): Vector3 {
    cam.aimDirection(out);
    const spread = MathUtils.degToRad(this.reticle.spread);
    if (spread <= 0) return out;
    const sway = swayOffset(this.swayTime * tuning.pistol.swaySpeed);
    const right = tmp.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
    const up = tmp2.crossVectors(right, out).normalize();
    return out.addScaledVector(right, Math.tan(spread) * sway.x).addScaledVector(up, Math.tan(spread) * sway.y).normalize();
  }

  /** A zombie hit us: brief stun and a shove. */
  hurt(from: Vector3): void {
    this.stunTime = tuning.player.hitStunTime;
    this.push.subVectors(this.position, from).setY(0).normalize().multiplyScalar(tuning.zombie.attackPush * 5);
    this.blender.kick('spine', 7, 0, 0);
    this.blender.kick('head', 6, 0, 0);
    this.aiming = false;
  }

  tick(dt: number, input: PlayerInput, cam: ShoulderCamera, world: World, host: PlayerHost): void {
    const p = tuning.player;
    const gun = tuning.pistol;
    this.prevPosition.copy(this.position);
    this.prevYaw = this.yaw;
    this.swayTime += dt;
    this.stunTime = Math.max(0, this.stunTime - dt);
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.recoilAnim *= Math.exp(-14 * dt);

    const stunned = this.stunTime > 0;
    const turning = this.quickTurnTime > 0;
    this.aiming = input.aim && !stunned && !turning;
    const moveLen = Math.min(1, Math.hypot(input.moveX, input.moveY));
    this.sprinting = input.sprint && !this.aiming && moveLen > 0.3 && !stunned;

    // Quick 180-degree turn: hold back and tap sprint. The camera swings round
    // and the character ends up facing the way the camera now looks.
    if (input.sprintPressed && input.moveY < -0.5 && !this.aiming && !turning && !stunned) {
      this.quickTurnTime = p.quickTurnTime;
      this.turnCamFrom = cam.yaw;
      this.turnBodyFrom = this.yaw;
      this.turnBodyBy = angleDiff(this.yaw, cam.yaw + Math.PI);
    }
    if (this.quickTurnTime > 0) {
      this.quickTurnTime = Math.max(0, this.quickTurnTime - dt);
      const u = 1 - this.quickTurnTime / p.quickTurnTime;
      const e = u * u * (3 - 2 * u);
      cam.yaw = this.turnCamFrom + Math.PI * e;
      this.yaw = this.turnBodyFrom + this.turnBodyBy * e;
      this.velocity.multiplyScalar(0.8);
    }

    // Movement relative to the camera.
    const camForward = tmp.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    const camRight = tmp2.set(-camForward.z, 0, camForward.x);
    moveDir.set(0, 0, 0).addScaledVector(camForward, input.moveY).addScaledVector(camRight, input.moveX);
    if (moveDir.lengthSq() > 1) moveDir.normalize();
    let speed = this.sprinting ? p.sprintSpeed : p.walkSpeed;
    if (this.aiming) speed = p.classicAim ? 0 : p.aimWalkSpeed;
    if (stunned || turning) speed = 0;
    const wish = moveDir.multiplyScalar(speed);
    const accel = 1 - Math.exp(-p.acceleration * dt);
    this.velocity.x += (wish.x - this.velocity.x) * accel;
    this.velocity.z += (wish.z - this.velocity.z) * accel;
    this.position.addScaledVector(this.velocity, dt);
    this.position.addScaledVector(this.push, dt);
    this.push.multiplyScalar(Math.exp(-8 * dt));
    world.resolveCircle(this.position, p.radius);
    this.position.y = world.groundHeight(this.position.x, this.position.z);

    // Facing: towards the aim while aiming, otherwise towards where we're going.
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (!turning) {
      let targetYaw: number | null = null;
      let rate = MathUtils.degToRad(p.turnSpeed);
      if (this.aiming) {
        targetYaw = cam.yaw;
        rate *= 2.5;
      } else if (horizSpeed > 0.3 && moveLen > 0.1) {
        targetYaw = Math.atan2(-this.velocity.x, -this.velocity.z);
      }
      if (targetYaw !== null) {
        const d = angleDiff(this.yaw, targetYaw);
        this.yaw += MathUtils.clamp(d, -rate * dt, rate * dt);
      }
    }

    // Reticle focus: swinging the camera or walking widens it.
    const turnDeg = MathUtils.radToDeg(Math.abs(angleDiff(this.lastCameraYaw, cam.yaw)) + Math.abs(cam.pitch - this.lastCameraPitch));
    this.lastCameraYaw = cam.yaw;
    this.lastCameraPitch = cam.pitch;
    this.reticle.update(dt, this.aiming, horizSpeed > 0.3, turning ? 0 : turnDeg, gun);

    this.updateGun(dt, input, cam, host);

    // Footsteps.
    this.stepTimer -= horizSpeed * dt;
    if (this.stepTimer <= 0 && horizSpeed > 0.5) {
      this.stepTimer = this.sprinting ? 1.1 : 0.8;
      host.footstep(this.position, this.sprinting);
    }

    const stride = this.sprinting ? 1.7 : 1.0;
    this.phase += (horizSpeed / stride) * Math.PI * dt;
    const weightTarget = this.aiming ? 1 : 0;
    this.aimWeight += (weightTarget - this.aimWeight) * (1 - Math.exp(-18 * dt));

    this.blender.update(this.pose(), dt, 12);
    this.blender.apply(this.rig);
    for (const j of IK_JOINTS) this.baseQuats.get(j)!.copy(this.rig.joints[j].quaternion);
  }

  private updateGun(dt: number, input: PlayerInput, cam: ShoulderCamera, host: PlayerHost): void {
    const gun = tuning.pistol;
    if (this.reloading) {
      this.reloadTime += dt;
      const u = this.reloadTime / this.reloadTotal;
      if (this.reloadSteps === 0 && u > 0.15) {
        this.reloadSteps = 1;
        host.reloadStep('out');
      }
      if (this.reloadSteps === 1 && u > 0.6) {
        this.reloadSteps = 2;
        host.reloadStep('in');
      }
      if (this.reloadSteps === 2 && this.emptyReload && u > 0.85) {
        this.reloadSteps = 3;
        host.reloadStep('rack');
        this.slideBack = 0;
      }
      if (this.reloadTime >= this.reloadTotal) {
        const need = gun.capacity - this.ammo;
        const take = gun.infiniteAmmo ? need : Math.min(need, this.reserve);
        this.ammo += take;
        if (!gun.infiniteAmmo) this.reserve -= take;
        this.reloading = false;
      }
    }

    const canReload = !this.reloading && this.ammo < gun.capacity && (gun.infiniteAmmo || this.reserve > 0);
    if (input.reloadPressed && canReload) this.startReload();

    if (input.firePressed && this.aiming && !this.reloading && this.fireCooldown <= 0 && this.stunTime <= 0) {
      if (this.ammo > 0) {
        this.ammo--;
        this.fireCooldown = gun.fireInterval;
        this.recoilAnim = 1;
        this.slideBack = this.ammo === 0 ? 1 : 0.9;
        host.fire();
        this.reticle.onFire(gun);
        cam.kick(gun.recoilKick, (Math.random() - 0.5) * 2 * gun.recoilSideways);
        this.blender.kick('spine', 1.5, 0, 0);
      } else {
        host.dryFire();
        this.fireCooldown = 0.25;
        if (canReload) this.startReload();
      }
    }
    // The slide snaps forward again unless the gun is empty.
    if (this.ammo > 0 && !this.reloading) this.slideBack *= Math.exp(-40 * dt);
    this.pistol.slide.position.y = -0.075 + this.slideBack * 0.035;
  }

  private startReload(): void {
    this.reloading = true;
    this.reloadTime = 0;
    this.emptyReload = this.ammo === 0;
    this.reloadTotal = this.emptyReload ? tuning.pistol.emptyReloadTime : tuning.pistol.reloadTime;
    this.reloadSteps = 0;
  }

  /** Called every rendered frame: smooth position, then point the arms at the aim point. */
  render(alpha: number, aimPoint: Vector3 | null, cam: ShoulderCamera): void {
    const root = this.rig.root;
    root.position.lerpVectors(this.prevPosition, this.position, alpha);
    root.rotation.y = this.prevYaw + angleDiff(this.prevYaw, this.yaw) * alpha;
    // Hide the body if the camera is squeezed right up against it.
    root.visible = cam.distance > 0.35;
    for (const j of IK_JOINTS) this.rig.joints[j].quaternion.copy(this.baseQuats.get(j)!);
    root.updateMatrixWorld(true);

    const w = this.aimWeight;
    if (w > 0.01 && aimPoint) {
      const j = this.rig.joints;
      // Right arm: nearly straight, pointing the gun at the aim point.
      j.shoulderR.getWorldPosition(tmp);
      tmp2.subVectors(aimPoint, tmp).normalize();
      const reach = tmp.clone().addScaledVector(tmp2, (UPPER_ARM + LOWER_ARM) * 0.93);
      const poleR = new Vector3(Math.cos(this.yaw) * 0.6, -1, -Math.sin(this.yaw) * 0.6);
      reachTwoBone(j.shoulderR, j.elbowR, UPPER_ARM, LOWER_ARM, reach, poleR, w);
      j.wristR.updateWorldMatrix(true, false);
      pointBoneAt(j.wristR, aimPoint, w);
      // Recoil flips the muzzle up for an instant.
      j.wristR.rotateX(this.recoilAnim * 0.35 * w);
      j.wristR.updateWorldMatrix(true, true);

      // Left hand supports the grip (unless it's busy reloading).
      const leftWeight = this.reloading ? w * 0.15 : w;
      const grip = this.pistol.group.localToWorld(tmp.set(-0.035, 0.0, 0.035));
      const poleL = new Vector3(-Math.cos(this.yaw), -1, Math.sin(this.yaw));
      reachTwoBone(j.shoulderL, j.elbowL, UPPER_ARM, LOWER_ARM, grip, poleL, leftWeight);
    }
  }

  // -------------------------------------------------------------------------

  private pose(): Pose {
    const j: Partial<Record<JointName, Euler3>> = {};
    const pose: Pose = { j };
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const moving = Math.min(1, speed / 2.5);
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);

    const legs = (amp: number, kneeAmp: number) => {
      j.hipL = [0.45 * amp * s, 0, 0];
      j.hipR = [-0.45 * amp * s, 0, 0];
      j.kneeL = [-(0.05 + kneeAmp * Math.max(0, c)), 0, 0];
      j.kneeR = [-(0.05 + kneeAmp * Math.max(0, -c)), 0, 0];
      j.ankleL = [0.2 * Math.max(0, c) * amp, 0, 0];
      j.ankleR = [0.2 * Math.max(0, -c) * amp, 0, 0];
    };

    if (this.sprinting) {
      legs(1.6, 1.4);
      j.spine = [-0.3, 0.1 * s, 0];
      j.neck = [0.15, 0, 0];
      j.head = [0.1, 0, 0];
      j.shoulderL = [-0.8 * s, 0, -0.1];
      j.elbowL = [1.3, 0, 0];
      j.shoulderR = [0.6 + 0.5 * s, 0, 0.1];
      j.elbowR = [1.5, 0, 0];
      j.wristR = [0.4, 0, 0];
      pose.hipsY = -0.05 + 0.05 * Math.abs(c);
    } else if (this.aiming || this.aimWeight > 0.5) {
      // Two-handed stance; the arms get pointed at the target separately.
      legs(moving * 0.6, moving * 0.6);
      if (moving < 0.1) {
        j.hipL = [0.12, 0, -0.08];
        j.hipR = [-0.15, 0, 0.08];
        j.kneeL = [-0.15, 0, 0];
        j.kneeR = [-0.2, 0, 0];
      }
      // Lean the upper body and head with the aim's up/down angle.
      const pitch = this.lastCameraPitch;
      j.spine = [-0.06 + pitch * 0.35, -0.1, 0];
      j.neck = [pitch * 0.2, 0.05, 0];
      j.head = [0.05 + pitch * 0.35, 0.05, 0];
      j.shoulderR = [1.45, 0, 0];
      j.shoulderL = [1.35, 0, 0.55];
      j.elbowL = [0.7, 0, 0];
      pose.hipsY = -0.03;
    } else {
      legs(moving, moving * 0.9);
      j.spine = [-0.04 - 0.08 * moving, 0.08 * s * moving, 0];
      j.neck = [0.03, 0, 0];
      j.shoulderL = [-0.45 * s * moving + 0.05, 0, -0.08];
      j.elbowL = [0.25 + 0.2 * moving, 0, 0];
      // Gun held low and ready.
      j.shoulderR = [0.35, 0, 0.12];
      j.elbowR = [0.95, 0, 0];
      j.wristR = [0.55, 0, 0];
      pose.hipsY = -0.02 + 0.03 * Math.abs(c) * moving;
    }

    if (this.reloading) {
      // Left hand goes to the belt for a fresh magazine, then back to the gun.
      const u = this.reloadTime / Math.max(0.01, this.reloadTotal);
      const toBelt = u < 0.4;
      if (!this.aiming) {
        j.shoulderR = [0.7, 0, -0.35];
        j.elbowR = [1.7, 0, 0];
        j.wristR = [0.2, 0, 0.3];
      }
      j.shoulderL = toBelt ? [-0.25, 0, -0.25] : [0.95, 0, 0.7];
      j.elbowL = toBelt ? [0.9, 0, 0] : [1.7, 0, 0];
      j.head = [-0.25, 0, 0];
    }

    if (this.stunTime > 0) {
      j.spine = [0.25, 0, 0];
      j.head = [0.2, 0, 0];
      j.shoulderL = [0.9, 0, -0.4];
      j.shoulderR = [0.9, 0, 0.4];
      j.elbowL = [1.2, 0, 0];
      j.elbowR = [1.2, 0, 0];
    }
    return pose;
  }
}
