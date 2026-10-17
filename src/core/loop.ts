/**
 * Fixed-step game clock. The game world always updates in equal slices of time
 * (e.g. 60 per second) no matter how fast the screen redraws, which keeps
 * physics, timings and hit-stop consistent on every computer.
 */
export class FixedStepClock {
  private accumulator = 0;

  /** How far (0..1) we are between the last world update and the next one. */
  alpha = 0;

  /**
   * Feeds in the real time since the last frame and returns how many fixed
   * world updates should run now.
   */
  advance(frameSeconds: number, stepSeconds: number, maxFrameSeconds: number): number {
    const dt = Math.min(Math.max(frameSeconds, 0), maxFrameSeconds);
    this.accumulator += dt;
    let steps = 0;
    // A tiny tolerance stops floating-point rounding from skipping a step.
    while (this.accumulator >= stepSeconds - 1e-9) {
      this.accumulator -= stepSeconds;
      steps++;
    }
    if (this.accumulator < 0) this.accumulator = 0;
    this.alpha = this.accumulator / stepSeconds;
    return steps;
  }

  reset(): void {
    this.accumulator = 0;
    this.alpha = 0;
  }
}
