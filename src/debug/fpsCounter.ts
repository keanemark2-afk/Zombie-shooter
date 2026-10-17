import type { WebGLRenderer } from 'three';

/** Small frames-per-second readout in the top-left corner. F3 shows or hides it. */
export class FpsCounter {
  readonly element: HTMLDivElement;
  private frames = 0;
  private elapsed = 0;
  private worstFrame = 0;

  constructor(private readonly renderer: WebGLRenderer) {
    this.element = document.createElement('div');
    this.element.className = 'fps-counter';
    this.element.hidden = true;
    this.element.textContent = '-- fps';
    document.body.appendChild(this.element);
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  toggle(): void {
    this.element.hidden = !this.element.hidden;
  }

  /** Call once per rendered frame with the real time that frame took, in seconds. */
  frame(seconds: number): void {
    this.frames++;
    this.elapsed += seconds;
    this.worstFrame = Math.max(this.worstFrame, seconds);
    if (this.elapsed < 0.5) return;
    const fps = this.frames / this.elapsed;
    const avgMs = (this.elapsed / this.frames) * 1000;
    const info = this.renderer.info.render;
    this.element.textContent =
      `${Math.round(fps)} fps  ${avgMs.toFixed(1)} ms  (worst ${(this.worstFrame * 1000).toFixed(0)} ms)\n` +
      `${info.calls} draw calls  ${(info.triangles / 1000).toFixed(0)}k triangles`;
    this.element.classList.toggle('slow', fps < 50);
    this.frames = 0;
    this.elapsed = 0;
    this.worstFrame = 0;
  }
}
