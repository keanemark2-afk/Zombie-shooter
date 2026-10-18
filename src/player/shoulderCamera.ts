import { MathUtils, Vector3, type PerspectiveCamera } from 'three';
import { tuning } from '../config/tuning';
import type { World } from '../world/world';

const pivot = new Vector3();
const head = new Vector3();
const dir = new Vector3();
const right = new Vector3();
const desired = new Vector3();

/**
 * Over-the-right-shoulder camera. Pushes in while aiming, never lets walls
 * block the view, and carries the recoil kick (which settles back by itself).
 */
export class ShoulderCamera {
  /** Where the camera looks: 0 = north (-z), increasing turns left. */
  yaw = 0;
  /** Up/down look angle (radians, positive = up). */
  pitch = -0.08;
  /** 0 = normal view, 1 = fully zoomed in for aiming. */
  aimBlend = 0;
  private recoilPitch = 0;
  private recoilYaw = 0;
  private trauma = 0;
  private shakeTime = 0;
  /** How far the camera ended up from its pivot (small = squeezed against a wall). */
  distance = 0;
  /** Where the over-the-shoulder view is (the real camera may be elsewhere in debug views). */
  readonly eye = new Vector3();
  /** How quickly recoil settles (set from the gun in your hands). */
  recoilRecovery = 9;
  // Room left by walls, eased back out after a wall stops pushing in (no popping).
  private roomBehind = 10;
  private roomSide = 10;
  // Quick 180-degree turn, played smoothly every drawn frame.
  private turnLeft = 0;
  private turnTotal = 1;
  private turnDone = 0;

  constructor(readonly camera: PerspectiveCamera) {}

  /** Mouse / stick turning. */
  look(dYaw: number, dPitch: number): void {
    this.yaw += dYaw;
    const c = tuning.camera;
    this.pitch = MathUtils.clamp(this.pitch + dPitch, -MathUtils.degToRad(c.lookDownLimit), MathUtils.degToRad(c.lookUpLimit));
  }

  /** Swings the camera round 180 degrees over `seconds` (mouse turning still works meanwhile). */
  startQuickTurn(seconds: number): void {
    this.turnTotal = Math.max(0.01, seconds);
    this.turnLeft = this.turnTotal;
    this.turnDone = 0;
  }

  get quickTurning(): boolean {
    return this.turnLeft > 0;
  }

  /** Recoil from a shot: aim jumps up (and a little sideways), then settles back. */
  kick(upDegrees: number, sideDegrees: number): void {
    this.recoilPitch += MathUtils.degToRad(upDegrees);
    this.recoilYaw += MathUtils.degToRad(sideDegrees);
  }

  /** Adds camera shake (0..1). Shake doesn't move your aim, only the view. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Direction bullets go before reticle wobble: where the camera points, including recoil. */
  aimDirection(out: Vector3): Vector3 {
    const p = this.pitch + this.recoilPitch;
    const y = this.yaw + this.recoilYaw;
    return out.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
  }

  update(dt: number, playerPos: Vector3, aiming: boolean, world: World): void {
    const c = tuning.camera;
    const blendSpeed = 1 / Math.max(0.01, c.zoomTime);
    this.aimBlend = MathUtils.clamp(this.aimBlend + (aiming ? 1 : -1) * blendSpeed * dt, 0, 1);
    const a = this.aimBlend * this.aimBlend * (3 - 2 * this.aimBlend);

    if (this.turnLeft > 0) {
      this.turnLeft = Math.max(0, this.turnLeft - dt);
      const u = 1 - this.turnLeft / this.turnTotal;
      const turned = Math.PI * u * u * (3 - 2 * u);
      this.yaw += turned - this.turnDone;
      this.turnDone = turned;
    }

    const settle = Math.exp(-this.recoilRecovery * dt);
    this.recoilPitch *= settle;
    this.recoilYaw *= settle;

    const height = MathUtils.lerp(c.height, c.aimHeight, a);
    const offset = MathUtils.lerp(c.shoulderOffset, c.aimShoulderOffset, a);
    const distance = MathUtils.lerp(c.distance, c.aimDistance, a);
    const fov = MathUtils.lerp(c.fov, c.aimFov, a);
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    head.set(playerPos.x, playerPos.y + height, playerPos.z);

    // Walls push the camera in instantly (so they never block the view) and
    // release it gently (so it doesn't jump about).
    const ease = 1 - Math.exp(-c.wallEaseOut * dt);
    const settleRoom = (current: number, room: number, cap: number) =>
      room < current ? room : current + (Math.min(room, cap) - current) * ease;

    // Keep the shoulder offset itself out of walls.
    let sideRoom = 10;
    if (Math.abs(offset) > 0.01) {
      dir.copy(right).multiplyScalar(Math.sign(offset));
      const hit = world.raycast(head, dir, Math.abs(offset) + c.wallPadding);
      if (hit) sideRoom = Math.max(0, hit.distance - c.wallPadding);
    }
    this.roomSide = settleRoom(this.roomSide, sideRoom, Math.abs(offset) + 0.5);
    const side = Math.sign(offset) * Math.min(Math.abs(offset), this.roomSide);
    pivot.copy(head).addScaledVector(right, side);

    // Pull the camera in if something is between it and the player.
    const look = this.aimDirection(dir);
    desired.copy(look).negate();
    let behindRoom = 10;
    const hit = world.raycast(pivot, desired, distance + c.wallPadding);
    if (hit) behindRoom = Math.max(0.12, hit.distance - c.wallPadding);
    this.roomBehind = settleRoom(this.roomBehind, behindRoom, distance + 0.5);
    const dist = Math.max(0.12, Math.min(distance, this.roomBehind));
    this.distance = dist;
    this.eye.copy(pivot).addScaledVector(desired, dist);
    this.camera.position.copy(this.eye);

    // Shake: trauma squared feels natural (small hits barely shake).
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    this.shakeTime += dt;
    const s = this.trauma * this.trauma;
    const t = this.shakeTime * 32;
    const shakePitch = s * 0.035 * (Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5);
    const shakeYaw = s * 0.035 * (Math.sin(t * 1.3 + 1) + Math.sin(t * 2.9) * 0.5);
    const shakeRoll = s * 0.03 * Math.sin(t * 0.9 + 2);
    this.camera.rotation.set(
      this.pitch + this.recoilPitch + shakePitch,
      this.yaw + this.recoilYaw + shakeYaw,
      shakeRoll,
      'YXZ',
    );
  }
}
