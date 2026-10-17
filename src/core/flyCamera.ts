import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { tuning } from '../config/tuning';
import type { Input } from './input';

/**
 * Phase 0 free-flying camera: hold a mouse button and drag to look around,
 * WASD to fly, Space / E to rise, Q / C to sink, Shift to go faster.
 * (Ctrl is avoided on purpose: Ctrl+W closes the browser tab.)
 * It gets replaced by the over-the-shoulder camera in Phase 1.
 */
export class FlyCamera {
  private yaw: number;
  private pitch: number;
  private readonly velocity = new Vector3();

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly input: Input,
    private readonly groundHeight: (x: number, z: number) => number,
  ) {
    this.yaw = 0;
    this.pitch = 0;
    this.lookFrom(camera.position, new Vector3(0, 0, -1).add(camera.position));
  }

  /** Jumps the camera to `position`, facing `target`. */
  lookFrom(position: Vector3, target: Vector3): void {
    this.camera.position.copy(position);
    const dir = new Vector3().subVectors(target, position).normalize();
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = Math.asin(MathUtils.clamp(dir.y, -1, 1));
    this.velocity.set(0, 0, 0);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  update(dt: number): void {
    const t = tuning.flyCamera;
    const { dx, dy } = this.input.takeMouseDelta();
    if (this.input.anyMouseDown()) {
      const turn = t.lookSensitivity * 0.01;
      this.yaw -= dx * turn;
      this.pitch -= dy * turn;
    }
    const keyTurn = 1.8 * dt;
    if (this.input.isDown('ArrowLeft')) this.yaw += keyTurn;
    if (this.input.isDown('ArrowRight')) this.yaw -= keyTurn;
    if (this.input.isDown('ArrowUp')) this.pitch += keyTurn;
    if (this.input.isDown('ArrowDown')) this.pitch -= keyTurn;
    this.pitch = MathUtils.clamp(this.pitch, -1.45, 1.45);

    const forward = new Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new Vector3(-forward.z, 0, forward.x);
    const wish = new Vector3();
    if (this.input.isDown('KeyW')) wish.add(forward);
    if (this.input.isDown('KeyS')) wish.sub(forward);
    if (this.input.isDown('KeyD')) wish.add(right);
    if (this.input.isDown('KeyA')) wish.sub(right);
    if (this.input.isDown('Space') || this.input.isDown('KeyE')) wish.y += 1;
    if (this.input.isDown('KeyQ') || this.input.isDown('KeyC')) wish.y -= 1;
    if (wish.lengthSq() > 0) wish.normalize();

    const fast = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const speed = t.moveSpeed * (fast ? t.fastMultiplier : 1);
    // Ease towards the wanted speed so starting and stopping feel smooth.
    const blend = 1 - Math.exp(-10 * dt);
    this.velocity.lerp(wish.multiplyScalar(speed), blend);

    const p = this.camera.position;
    p.addScaledVector(this.velocity, dt);
    p.x = MathUtils.clamp(p.x, -90, 90);
    p.z = MathUtils.clamp(p.z, -90, 90);
    p.y = MathUtils.clamp(p.y, this.groundHeight(p.x, p.z) + 0.4, 40);

    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    if (this.camera.fov !== t.fov) {
      this.camera.fov = t.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
