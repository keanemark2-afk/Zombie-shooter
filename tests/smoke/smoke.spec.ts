import { expect, test, type Page } from '@playwright/test';

// Loads the game in a real (hidden) browser, plays it with simulated keyboard
// and mouse for about 30 seconds, and fails if anything logs an error.

const TOTAL_SECONDS = Number(process.env.SMOKE_SECONDS ?? 30);

async function hold(page: Page, keys: string[], ms: number): Promise<void> {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of [...keys].reverse()) await page.keyboard.up(k);
}

/**
 * Waits until the game has drawn `count` more frames. The test browser has no
 * graphics card, so after heavy work (like rebuilding shaders) frames can take
 * a while; this keeps the test from racing ahead of the game.
 */
async function waitForFrames(page: Page, count: number): Promise<void> {
  const start = await page.evaluate(() => window.__deadAcre!.frames());
  await page.waitForFunction((target) => window.__deadAcre!.frames() >= target, start + count, { timeout: 120_000 });
}

async function cameraPos(page: Page): Promise<number[]> {
  return page.evaluate(() => window.__deadAcre!.cameraPosition());
}

test('game loads and plays for ~30 seconds without errors', async ({ page, context }) => {
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    if (msg.type() === 'warning') warnings.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`page error: ${err.message}`));
  page.on('requestfailed', (req) => errors.push(`failed to load: ${req.url()}`));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  const started = Date.now();
  await page.goto('/');
  await page.waitForFunction(() => window.__deadAcre?.ready === true, null, { timeout: 60_000 });
  await expect(page.locator('.error-overlay')).toHaveCount(0);

  // The picture should be a real scene, not a black or blank screen.
  const stats = await page.evaluate(() => window.__deadAcre!.screenStats());
  expect(stats.mean, 'screen is too dark - is anything rendering?').toBeGreaterThan(0.03);
  expect(stats.spread, 'screen is one flat colour - is anything rendering?').toBeGreaterThan(0.02);
  const framesAtStart = await page.evaluate(() => window.__deadAcre!.frames());

  const canvas = page.locator('#app canvas');
  await canvas.click({ position: { x: 640, y: 360 } });

  // Fly forward and check the camera actually moved.
  const before = await cameraPos(page);
  await hold(page, ['KeyW'], 3000);
  const after = await cameraPos(page);
  const moved = Math.hypot(after[0] - before[0], after[2] - before[2]);
  // (Only a small distance: the test browser draws just a few frames per second.)
  expect(moved, 'holding W should fly the camera forward').toBeGreaterThan(0.2);

  // Look around by dragging the mouse.
  await page.mouse.move(640, 360);
  await page.mouse.down();
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(640 + i * 12, 360 + Math.sin(i / 3) * 40);
    await page.waitForTimeout(80);
  }
  await page.mouse.up();

  await hold(page, ['ShiftLeft', 'KeyW'], 2000);
  await hold(page, ['KeyA'], 1000);
  await hold(page, ['Space'], 1000);
  await hold(page, ['KeyQ'], 1000);
  await hold(page, ['ArrowLeft'], 800);
  await hold(page, ['ArrowDown'], 500);

  // F3: FPS counter.
  await page.keyboard.press('F3');
  await expect(page.locator('.fps-counter')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.locator('.fps-counter')).toContainText('fps');

  // F1: tuning panel. Change the fog, copy the values, then reset.
  const panel = page.locator('.tuning-panel');
  await expect(panel).toBeHidden();
  await page.keyboard.press('F1');
  await expect(panel).toBeVisible();
  await panel.getByText('Atmosphere', { exact: true }).click();
  const fogInput = panel.locator('.lil-controller', { has: page.getByText('Fog density', { exact: true }) }).locator('input');
  await fogInput.fill('0.05');
  await fogInput.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__deadAcre!.tuning.atmosphere.fogDensity)).toBe(0.05);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/smoke-thick-fog.png' });

  await panel.getByText('Copy values (paste to Claude)').click();
  await expect(page.locator('.toast')).toContainText('Copied 1 changed value');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('atmosphere.fogDensity: 0.02 -> 0.05');

  // Switch shadows off and on again (this rebuilds every material).
  await panel.getByText('Graphics', { exact: true }).click();
  const shadowBox = panel.locator('.lil-controller', { has: page.getByText('Shadows', { exact: true }) }).locator('input');
  await shadowBox.click();
  await waitForFrames(page, 2);
  await shadowBox.click();
  await waitForFrames(page, 2);

  await panel.getByText('Reset everything to defaults').click();
  await expect.poll(() => page.evaluate(() => window.__deadAcre!.tuning.atmosphere.fogDensity)).toBe(0.02);
  await page.keyboard.press('F1');
  await expect(panel).toBeHidden();

  // Collider outlines debug view.
  await page.evaluate(() => (window.__deadAcre!.tuning.debug.showColliders = true));
  await waitForFrames(page, 2);
  await page.screenshot({ path: 'test-results/smoke-colliders.png' });
  await page.evaluate(() => (window.__deadAcre!.tuning.debug.showColliders = false));

  // H hides the help box.
  await page.keyboard.press('KeyH');
  await expect(page.locator('.help-overlay')).toBeHidden();
  await page.keyboard.press('KeyH');
  await expect(page.locator('.help-overlay')).toBeVisible();

  // Keep flying around until ~30 seconds have passed.
  const moves = [['KeyW'], ['KeyD'], ['KeyS'], ['KeyW', 'KeyA'], ['KeyE'], ['KeyC']];
  let i = 0;
  while ((Date.now() - started) / 1000 < TOTAL_SECONDS) {
    await hold(page, moves[i % moves.length], 700);
    i++;
  }

  const framesAtEnd = await page.evaluate(() => window.__deadAcre!.frames());
  expect(framesAtEnd - framesAtStart, 'the game should keep drawing new frames').toBeGreaterThan(10);
  await page.screenshot({ path: 'test-results/smoke-final.png' });
  await expect(page.locator('.error-overlay')).toHaveCount(0);

  if (warnings.length) console.log(`Browser warnings (not failures):\n  ${[...new Set(warnings)].join('\n  ')}`);
  console.log(`Played for ${((Date.now() - started) / 1000).toFixed(0)} s, ${framesAtEnd} frames drawn.`);
  expect(errors, 'the browser logged errors').toEqual([]);
});
