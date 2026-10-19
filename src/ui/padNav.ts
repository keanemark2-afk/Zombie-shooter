import { PAD } from '../config/controls';
import type { GamepadReader } from '../core/gamepad';

// Moving the highlight round a menu with the D-pad, the left stick or the
// arrow keys, and "pressing" the highlighted thing with Cross / Enter.
// Anything with a `data-nav` attribute inside the root can be highlighted.

export type NavDir = 'up' | 'down' | 'left' | 'right';

export class PadNav {
  focused: HTMLElement | null = null;
  private stickDir: NavDir | null = null;
  private stickTimer = 0;

  constructor(private readonly root: () => HTMLElement) {}

  /** The things that can be highlighted right now (visible ones). */
  items(): HTMLElement[] {
    return [...this.root().querySelectorAll<HTMLElement>('[data-nav]')].filter((el) => el.offsetParent !== null && !(el as HTMLButtonElement).disabled);
  }

  /** Highlights one thing (and un-highlights the last). */
  focus(el: HTMLElement | null): void {
    if (this.focused) this.focused.classList.remove('nav-focus');
    this.focused = el;
    if (el) {
      el.classList.add('nav-focus');
      el.scrollIntoView({ block: 'nearest' });
    }
  }

  /** Makes sure something is highlighted (the first thing, if nothing is). */
  ensure(): void {
    const items = this.items();
    if (this.focused && items.includes(this.focused)) return;
    this.focus(items[0] ?? null);
  }

  move(dir: NavDir): void {
    const items = this.items();
    if (items.length === 0) return;
    if (!this.focused || !items.includes(this.focused)) {
      this.focus(items[0]);
      return;
    }
    const from = this.focused.getBoundingClientRect();
    const fx = from.left + from.width / 2;
    const fy = from.top + from.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of items) {
      if (el === this.focused) continue;
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - fx;
      const dy = r.top + r.height / 2 - fy;
      const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
      const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
      if (along <= 1) continue;
      const score = along + across * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) this.focus(best);
  }

  /** "Presses" the highlighted thing. */
  activate(): void {
    this.focused?.click();
  }

  /** Call every frame while the menu is open. */
  poll(pad: GamepadReader, dt: number): void {
    if (!pad.connected) return;
    if (pad.wasPressed(PAD.up)) this.move('up');
    if (pad.wasPressed(PAD.down)) this.move('down');
    if (pad.wasPressed(PAD.left)) this.move('left');
    if (pad.wasPressed(PAD.right)) this.move('right');
    // The left stick repeats while held.
    const x = pad.leftX;
    const y = pad.leftY;
    let dir: NavDir | null = null;
    if (Math.abs(x) > 0.6 || Math.abs(y) > 0.6) dir = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up';
    if (dir === null) {
      this.stickDir = null;
      this.stickTimer = 0;
    } else if (dir !== this.stickDir) {
      this.stickDir = dir;
      this.stickTimer = 0.35;
      this.move(dir);
    } else {
      this.stickTimer -= dt;
      if (this.stickTimer <= 0) {
        this.stickTimer = 0.14;
        this.move(dir);
      }
    }
    if (pad.wasPressed(PAD.south)) this.activate();
  }

  /** Arrow keys and Enter. Returns true if the key was used. */
  key(code: string): boolean {
    switch (code) {
      case 'ArrowUp':
        this.move('up');
        return true;
      case 'ArrowDown':
        this.move('down');
        return true;
      case 'ArrowLeft':
        this.move('left');
        return true;
      case 'ArrowRight':
        this.move('right');
        return true;
      case 'Enter':
      case 'NumpadEnter':
        if (!this.focused) return false;
        this.activate();
        return true;
      default:
        return false;
    }
  }

  clear(): void {
    this.focus(null);
    this.stickDir = null;
  }
}
