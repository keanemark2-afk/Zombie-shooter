import { detectPadType, type PadType } from '../config/controls';

/** Removes stick drift: small movements count as zero, and the rest is rescaled smoothly. */
export function applyDeadzone(x: number, y: number, deadzone: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len <= deadzone) return { x: 0, y: 0 };
  const scaled = Math.min(1, (len - deadzone) / (1 - deadzone));
  // A gentle curve gives finer control for small stick movements.
  const curved = scaled * scaled * 0.4 + scaled * 0.6;
  return { x: (x / len) * curved, y: (y / len) * curved };
}

/** Reads the first connected gamepad once per frame. */
export class GamepadReader {
  connected = false;
  type: PadType = 'playstation';
  id = '';
  leftX = 0;
  leftY = 0;
  rightX = 0;
  rightY = 0;
  /** True on the frame there was any real input from the pad. */
  active = false;
  private held: boolean[] = [];
  private prevHeld: boolean[] = [];
  private analog: number[] = [];

  poll(deadzone: number): void {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) {
      if (p && p.connected) {
        pad = p;
        break;
      }
    }
    this.prevHeld = this.held;
    this.held = [];
    this.analog = [];
    this.active = false;
    if (!pad) {
      this.connected = false;
      this.leftX = this.leftY = this.rightX = this.rightY = 0;
      return;
    }
    if (pad.id !== this.id) {
      this.id = pad.id;
      this.type = detectPadType(pad.id);
    }
    this.connected = true;
    const l = applyDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0, deadzone);
    const r = applyDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, deadzone);
    this.leftX = l.x;
    this.leftY = l.y;
    this.rightX = r.x;
    this.rightY = r.y;
    pad.buttons.forEach((b, i) => {
      const value = typeof b === 'number' ? b : b.value;
      const pressed = typeof b === 'number' ? b > 0.5 : b.pressed || b.value > 0.35;
      this.held[i] = pressed;
      this.analog[i] = value;
      if (pressed) this.active = true;
    });
    if (l.x || l.y || r.x || r.y) this.active = true;
  }

  isDown(button: number): boolean {
    return this.held[button] ?? false;
  }

  wasPressed(button: number): boolean {
    return (this.held[button] ?? false) && !(this.prevHeld[button] ?? false);
  }

  value(button: number): number {
    return this.analog[button] ?? 0;
  }
}
