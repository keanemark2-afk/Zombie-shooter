/**
 * Keyboard and mouse state. Other code asks "is this key held?" or "was it
 * pressed this frame?" instead of listening to browser events directly.
 * (Gamepad support and remappable controls arrive in Phase 1.)
 */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly buttons = new Set<number>();
  private mouseDX = 0;
  private mouseDY = 0;

  /** Keys the browser would otherwise use for itself (help page, find, scrolling). */
  private static readonly captured = new Set([
    'F1', 'F3', 'Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
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
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  isMouseDown(button = 0): boolean {
    return this.buttons.has(button);
  }

  anyMouseDown(): boolean {
    return this.buttons.size > 0;
  }

  /** Mouse movement since the last call, in pixels. */
  takeMouseDelta(): { dx: number; dy: number } {
    const d = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  /** Call at the very end of each frame. */
  endFrame(): void {
    this.pressed.clear();
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (isTypingInField(e.target) && !Input.alwaysActive.has(e.code)) return;
    if (Input.captured.has(e.code)) e.preventDefault();
    if (!e.repeat) this.pressed.add(e.code);
    this.down.add(e.code);
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
    this.target.focus?.();
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    this.buttons.delete(e.button);
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };
}

function isTypingInField(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && target.type !== 'checkbox';
}
