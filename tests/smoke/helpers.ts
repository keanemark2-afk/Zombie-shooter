import { expect, type Page } from '@playwright/test';

// Shared helpers for the browser tests. The test browser has no graphics card
// (only a few frames per second), so steps wait for the game to draw frames
// rather than for fixed times.

export type State = Awaited<ReturnType<NonNullable<Window['__deadAcre']>['state']>>;

export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`page error: ${err.message}`));
  page.on('requestfailed', (req) => errors.push(`failed to load: ${req.url()}`));
  return errors;
}

/** A fake PlayStation controller the test can press buttons on. */
export async function installFakePad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pad = {
      id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
      index: 0,
      connected: false,
      mapping: 'standard',
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    (window as unknown as { __fakePad: typeof pad }).__fakePad = pad;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad.connected ? pad : null], configurable: true });
  });
}

export async function frames(page: Page): Promise<number> {
  return page.evaluate(() => window.__deadAcre!.frames());
}

export async function waitForFrames(page: Page, count: number): Promise<void> {
  const start = await frames(page);
  await page.waitForFunction((target) => window.__deadAcre!.frames() >= target, start + count, { timeout: 120_000 });
}

export async function state(page: Page): Promise<State> {
  return page.evaluate(() => window.__deadAcre!.state());
}

export async function hold(page: Page, keys: string[], frameCount: number): Promise<void> {
  for (const k of keys) await page.keyboard.down(k);
  await waitForFrames(page, frameCount);
  for (const k of [...keys].reverse()) await page.keyboard.up(k);
}

export async function padButton(page: Page, button: number, value: number): Promise<void> {
  await page.evaluate(
    ([b, v]) => {
      const pad = (window as unknown as { __fakePad: { buttons: Array<{ pressed: boolean; value: number }> } }).__fakePad;
      pad.buttons[b].pressed = v > 0.5;
      pad.buttons[b].value = v;
    },
    [button, value],
  );
}

export async function padTap(page: Page, button: number): Promise<void> {
  await padButton(page, button, 1);
  await waitForFrames(page, 2);
  await padButton(page, button, 0);
  await waitForFrames(page, 1);
}

/** Holds aim, steadies the reticle on a body part, and fires once. */
export async function shootAt(page: Page, zone: 'head' | 'torso' | 'armL' | 'armR' | 'legL' | 'legR'): Promise<State> {
  await page.mouse.down({ button: 'right' });
  for (let i = 0; i < 25; i++) {
    await page.evaluate((z) => window.__deadAcre!.aimAt(z), zone);
    await waitForFrames(page, 1);
    const s = await state(page);
    if (s.aiming && s.focus > 0.97) break;
  }
  await page.evaluate((z) => window.__deadAcre!.aimAt(z), zone);
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
  await waitForFrames(page, 2);
  const after = await state(page);
  await page.mouse.up({ button: 'right' });
  return after;
}

export async function waitForDummyState(page: Page, states: string[]): Promise<void> {
  await expect
    .poll(async () => (await state(page)).zombies.find((z) => z.alive)?.state ?? 'none', { timeout: 120_000 })
    .toMatch(new RegExp(`^(${states.join('|')})$`));
}

/** Makes the test browser run the game faster than real time (no shadows or glow, long catch-up steps). */
export async function fastMode(page: Page): Promise<void> {
  await page.evaluate(() => {
    const t = window.__deadAcre!.tuning;
    t.graphics.shadows = false;
    t.postFx.enabled = false;
    t.postFx.grain = 0;
    t.simulation.maxFrameTime = 0.5;
  });
}

type Game = {
  player: { give: (id: string, n: number) => void; position: { x: number; z: number; y: number }; yaw: number };
  health: { reset: (n: number) => void; heal: (n: number) => void; current: number };
  zombies: Array<{ teleport: (x: number, z: number, yaw: number) => void; alive: boolean; invincible: boolean }>;
  supplies: { items: unknown[]; coins: number };
};

/** Runs a function inside the page with the Game object (only available with ?autotest). */
export async function withGame<T>(page: Page, fn: (g: Game) => T): Promise<T> {
  return page.evaluate(`(${fn.toString()})(window.__game)`) as Promise<T>;
}

export async function waitForTicks(page: Page, count: number): Promise<void> {
  const start = await page.evaluate(() => window.__deadAcre!.ticks());
  await page.waitForFunction((target) => window.__deadAcre!.ticks() >= target, start + count, { timeout: 240_000 });
}
