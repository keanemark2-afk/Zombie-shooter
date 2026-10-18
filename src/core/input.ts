/**
 * Keyboard and mouse state. Other code asks "is this key held?" or "was it
 * pressed this frame?" instead of listening to browser events directly.
 */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly buttons = new Set<number>();
  private readonly buttonsPressed = new Set<number>();
  private mouseDX = 0;
  private mouseDY = 0;
  private wheel = 0;
  private recentMove = 0;
  private lockChangedAt = 0;
  /** True on frames where the keyboard or mouse was used. */
  active = false;

  /** Keys the browser would otherwise use for itself (help page, find, scrolling). */
  private static readonly captured = new Set([
    'F1', 'F3', 'F4', 'Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  ]);

  /** Keys that work even while typing in a box (opening and closing panels). */
  private static readonly alwaysActive = new Set(['F1', 'F3']);

  constructor(private readonly target: HTMLElement) {
    // "true" = listen before anything else on the page sees the key, so menus
    // and the tuning panel can't swallow presses (or leave keys stuck down).
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('blur', this.onBlur);
    target.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.lockChangedAt = performance.now();
      this.recentMove = 0;
    });
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  anyDown(codes: readonly string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  anyPressed(codes: readonly string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }

  isMouseDown(button = 0): boolean {
    return this.buttons.has(button);
  }

  wasMousePressed(button = 0): boolean {
    return this.buttonsPressed.has(button);
  }

  anyMouseDown(): boolean {
    return this.buttons.size > 0;
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.target;
  }

  /** Captures the mouse so moving it turns the camera. Safe to call any time. */
  lockPointer(): void {
    if (this.pointerLocked) return;
    const plain = () => {
      try {
        const r = this.target.requestPointerLock() as unknown;
        if (r instanceof Promise) r.catch(() => {});
      } catch {
        // Some browsers refuse without a click; the menu asks the player to click.
      }
    };
    try {
      // Raw mouse movement: no Windows mouse acceleration, and far fewer of the
      // browser's sudden fake jumps. Falls back if the browser can't do it.
      const r = this.target.requestPointerLock({ unadjustedMovement: true }) as unknown;
      if (r instanceof Promise) r.catch(plain);
    } catch {
      plain();
    }
  }

  unlockPointer(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  /** Mouse movement since the last call, in pixels. */
  takeMouseDelta(): { dx: number; dy: number } {
    const d = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  /** Mouse wheel clicks since the last call: +1 per notch down, -1 per notch up. */
  takeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** Call at the very end of each frame. */
  endFrame(): void {
    this.pressed.clear();
    this.buttonsPressed.clear();
    this.active = false;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (isTypingInField(e.target) && !Input.alwaysActive.has(e.code)) return;
    if (Input.captured.has(e.code)) e.preventDefault();
    if (!e.repeat) this.pressed.add(e.code);
    this.down.add(e.code);
    this.active = true;
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.down.clear();
    this.buttons.clear();
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    this.buttons.add(e.button);
    this.buttonsPressed.add(e.button);
    this.active = true;
    this.target.focus?.();
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    this.buttons.delete(e.button);
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    const size = Math.hypot(e.movementX, e.movementY);
    // Right after the mouse is captured the browser can report one wild jump.
    if (performance.now() - this.lockChangedAt < 120) return;
    // Browsers on Windows occasionally report a single huge, fake movement
    // (it spins the camera). Real hand movement ramps up, so ignore lone spikes.
    if (size > 350 && size > this.recentMove * 8) return;
    this.recentMove = this.recentMove * 0.75 + size * 0.25;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
    if (size) this.active = true;
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (e.deltaY !== 0) this.wheel += Math.sign(e.deltaY);
    this.active = true;
  };
}

function isTypingInField(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && target.type !== 'checkbox';
}
