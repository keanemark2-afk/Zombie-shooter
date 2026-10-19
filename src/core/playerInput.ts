import { bindings, moveKeys, slotKeys, type Action } from '../config/controls';
import { tuning } from '../config/tuning';
import type { PlayerInput } from '../player/player';
import type { GamepadReader } from './gamepad';
import type { Input } from './input';

export type Device = 'keyboard' | 'gamepad';

/**
 * Turns raw keyboard, mouse and gamepad state into player controls.
 * Camera turning is read every frame (for smoothness); button presses are
 * remembered until the next game-world update uses them, so none get lost.
 */
export class PlayerInputReader {
  lastDevice: Device = 'keyboard';
  private pendingFire = false;
  private pendingReload = false;
  private pendingSprint = false;
  private pendingMelee = false;
  private pendingHeal = false;
  private pendingGrenade = false;
  private pendingGrenadeCycle = false;
  private pendingCase = false;
  private pendingInteract = false;
  private pendingKnife = false;
  private pendingPause = false;
  private pendingSlot: number | null = null;
  private pendingCycle = 0;

  constructor(
    private readonly input: Input,
    private readonly pad: GamepadReader,
  ) {}

  private held(action: Action): boolean {
    const b = bindings[action];
    if (this.input.anyDown(b.keys)) return true;
    if (b.mouse !== undefined && this.input.isMouseDown(b.mouse)) return true;
    if (b.pad !== undefined && this.pad.isDown(b.pad)) return true;
    return false;
  }

  private pressed(action: Action): boolean {
    const b = bindings[action];
    if (this.input.anyPressed(b.keys)) return true;
    if (b.mouse !== undefined && this.input.wasMousePressed(b.mouse)) return true;
    if (b.pad !== undefined && this.pad.wasPressed(b.pad)) return true;
    return false;
  }

  /**
   * Call once per frame. Returns how far to turn the camera (radians).
   * `mouseActive` is false while the mouse is free for menus.
   */
  frame(dt: number, mouseActive: boolean, aiming: boolean, lookScale = 1): { yaw: number; pitch: number } {
    if (this.pad.active) this.lastDevice = 'gamepad';
    else if (this.input.active) this.lastDevice = 'keyboard';

    this.pendingFire ||= this.pressed('fire');
    this.pendingReload ||= this.pressed('reload');
    this.pendingSprint ||= this.pressed('sprint');
    this.pendingMelee ||= this.pressed('melee');
    this.pendingHeal ||= this.pressed('heal');
    this.pendingGrenade ||= this.pressed('grenade');
    this.pendingGrenadeCycle ||= this.pressed('nextGrenade');
    this.pendingCase ||= this.pressed('caseOpen');
    this.pendingInteract ||= this.pressed('interact');
    this.pendingKnife ||= this.pressed('knife');
    this.pendingPause ||= this.pressed('pause');
    slotKeys.forEach((key, i) => {
      if (this.input.wasPressed(key)) this.pendingSlot = i + 1;
    });
    this.pendingCycle += this.input.takeWheel();
    if (this.pressed('nextWeapon')) this.pendingCycle += 1;
    if (this.pressed('prevWeapon')) this.pendingCycle -= 1;

    const c = tuning.controls;
    const aimScale = (aiming ? c.aimSensitivity : 1) * lookScale;
    const invert = c.invertY ? -1 : 1;
    let yaw = 0;
    let pitch = 0;
    const { dx, dy } = this.input.takeMouseDelta();
    if (mouseActive) {
      const k = c.mouseSensitivity * 0.01 * aimScale;
      yaw -= dx * k;
      pitch -= dy * k * invert;
    }
    const stick = (c.stickLookSpeed * Math.PI) / 180;
    yaw -= this.pad.rightX * stick * aimScale * dt;
    pitch -= this.pad.rightY * stick * aimScale * dt * invert;
    return { yaw, pitch };
  }

  /** Was the case asked for (Tab / Create)? Clears the request. */
  takeCase(): boolean {
    const c = this.pendingCase;
    this.pendingCase = false;
    return c;
  }

  /** Was "use / talk" pressed (E / Cross)? Clears the request. */
  takeInteract(): boolean {
    const c = this.pendingInteract;
    this.pendingInteract = false;
    return c;
  }

  /** Was pause asked for (gamepad Options/Menu)? Clears the request. */
  takePause(): boolean {
    const p = this.pendingPause;
    this.pendingPause = false;
    return p;
  }

  /** Controls for one game-world update. Clears the remembered presses. */
  take(): PlayerInput {
    let moveX = 0;
    let moveY = 0;
    if (this.input.anyDown(moveKeys.right)) moveX += 1;
    if (this.input.anyDown(moveKeys.left)) moveX -= 1;
    if (this.input.anyDown(moveKeys.forward)) moveY += 1;
    if (this.input.anyDown(moveKeys.back)) moveY -= 1;
    const keyLen = Math.hypot(moveX, moveY);
    if (keyLen > 1) {
      moveX /= keyLen;
      moveY /= keyLen;
    }
    if (this.pad.connected && (this.pad.leftX || this.pad.leftY)) {
      moveX = this.pad.leftX;
      moveY = -this.pad.leftY;
    }
    const result: PlayerInput = {
      moveX,
      moveY,
      aim: this.held('aim'),
      firePressed: this.pendingFire,
      fireHeld: this.held('fire'),
      reloadPressed: this.pendingReload,
      sprint: this.held('sprint'),
      sprintPressed: this.pendingSprint,
      meleePressed: this.pendingMelee,
      healPressed: this.pendingHeal,
      grenadePressed: this.pendingGrenade,
      grenadeHeld: this.held('grenade'),
      grenadeCycle: this.pendingGrenadeCycle,
      knifePressed: this.pendingKnife,
      knifeHeld: this.held('knife'),
      weaponSlot: this.pendingSlot,
      weaponCycle: Math.sign(this.pendingCycle),
    };
    this.pendingFire = false;
    this.pendingReload = false;
    this.pendingSprint = false;
    this.pendingMelee = false;
    this.pendingHeal = false;
    this.pendingGrenade = false;
    this.pendingGrenadeCycle = false;
    this.pendingKnife = false;
    this.pendingSlot = null;
    this.pendingCycle = 0;
    return result;
  }

  /** Forget any remembered presses (e.g. when the game is paused). */
  clear(): void {
    this.pendingFire = this.pendingReload = this.pendingSprint = this.pendingPause = false;
    this.pendingMelee = this.pendingKnife = this.pendingHeal = this.pendingGrenade = this.pendingGrenadeCycle = false;
    this.pendingCase = this.pendingInteract = false;
    this.pendingSlot = null;
    this.pendingCycle = 0;
  }
}
