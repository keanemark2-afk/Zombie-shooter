import { expect, test } from '@playwright/test';
import { frames, hold, installFakePad, padButton, padTap, shootAt, state, waitForDummyState, waitForFrames, watchErrors } from './helpers';

// Loads the game in a real (hidden) browser and plays it with simulated
// keyboard, mouse and gamepad input. Any error in the browser fails the test.
// The test browser has no graphics card (only a few frames per second), so
// steps wait for the game to draw frames rather than for fixed times.

const TOTAL_SECONDS = Number(process.env.SMOKE_SECONDS ?? 30);

test('shooting range: aiming, reactions, reload and respawn', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?autotest');
  await page.waitForFunction(() => window.__deadAcre?.ready === true, null, { timeout: 60_000 });
  await expect(page.locator('.menu')).toBeVisible();

  const stats = await page.evaluate(() => window.__deadAcre!.screenStats());
  expect(stats.mean, 'screen is too dark - is anything rendering?').toBeGreaterThan(0.03);
  expect(stats.spread, 'screen is one flat colour - is anything rendering?').toBeGreaterThan(0.02);

  // Settings: pick the corner-brackets crosshair in yellow, then go back.
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('.menu-settings')).toBeVisible();
  await expect(page.locator('.menu-settings .crosshairs svg')).toHaveCount(6);
  await page.getByRole('button', { name: /Brackets$/ }).click();
  await page.getByRole('button', { name: 'Yellow' }).click();
  await expect(page.locator('[data-crosshair="brackets"]')).toHaveClass(/on/);
  await expect(page.locator('.set-preview polyline')).toHaveCount(4);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.menu-settings')).toBeHidden();
  expect((await state(page)).crosshair).toBe('brackets');

  await page.getByRole('button', { name: 'Shooting range' }).click();
  await expect(page.locator('.menu')).toBeHidden();
  // Clicking the menu switches the sound on, and the recorded gunshots load.
  await expect.poll(async () => (await state(page)).audioRunning).toBe(true);
  await expect.poll(async () => (await state(page)).soundsLoaded, { timeout: 60_000 }).toBe(12);
  await expect(page.locator('.ammo')).toBeVisible();
  expect((await state(page)).mode).toBe('range');
  await page.evaluate(() => (window.__deadAcre!.tuning.range.dummyDistance = 8));
  await waitForFrames(page, 3);

  // Walk forward a little.
  const startPos = (await state(page)).player;
  await hold(page, ['KeyW'], 6);
  const moved = (await state(page)).player;
  expect(Math.hypot(moved[0] - startPos[0], moved[2] - startPos[2]), 'W should walk forward').toBeGreaterThan(0.2);

  // Headshot: a basic zombie always staggers (classic rules).
  // The chosen crosshair shows while aiming.
  await page.mouse.down({ button: 'right' });
  await waitForFrames(page, 3);
  await expect(page.locator('.hud .crosshair polyline')).toHaveCount(4);
  await expect(page.locator('.hud .crosshair')).toBeVisible();
  await page.mouse.up({ button: 'right' });

  let s = await shootAt(page, 'head');
  expect(s.stats.headshots).toBe(1);
  expect(s.stats.lastHit).toContain('HEAD');
  expect(s.zombies[0].state).toBe('headStagger');
  await page.screenshot({ path: 'test-results/smoke-headshot.png' });
  await waitForDummyState(page, ['idle']);

  // Leg shot: drops to one knee.
  s = await shootAt(page, 'legL');
  expect(s.stats.lastHit).toContain('LEFT LEG');
  expect(['kneel', 'getUp']).toContain(s.zombies[0].state);
  await waitForDummyState(page, ['idle']);

  // Arm shot: drops its farm tool.
  s = await shootAt(page, 'armR');
  expect(s.stats.lastHit).toContain('RIGHT ARM');
  expect(s.zombies[0].holdingTool).toBe(false);
  await waitForDummyState(page, ['idle']);

  // Finish it off with headshots, then a new dummy appears.
  for (let i = 0; i < 4 && (await state(page)).zombies.some((z) => z.alive); i++) await shootAt(page, 'head');
  s = await state(page);
  expect(s.stats.kills).toBe(1);
  await page.screenshot({ path: 'test-results/smoke-kill.png' });
  await expect.poll(async () => (await state(page)).zombies.some((z) => z.alive), { timeout: 120_000 }).toBe(true);

  // Reload: R starts it, and the magazine ends up full.
  expect(s.ammo).toBeLessThan(10);
  await page.keyboard.press('KeyR');
  await expect.poll(async () => (await state(page)).reloading, { timeout: 60_000 }).toBe(true);
  await expect.poll(async () => (await state(page)).ammo, { timeout: 120_000 }).toBe(10);

  // Quick turn: from standing (facing away from the camera), back + sprint swings round.
  const yawBefore = (await state(page)).cameraYaw;
  await page.keyboard.down('KeyS');
  await page.keyboard.press('ShiftLeft');
  await waitForFrames(page, 6);
  await page.keyboard.up('KeyS');
  const turned = Math.abs((await state(page)).cameraYaw - yawBefore);
  expect(turned, 'quick turn should swing the camera about 180 degrees').toBeGreaterThan(2.5);
  await waitForFrames(page, 4);

  // But running back towards the camera and then sprinting must NOT spin you round.
  const yawRunning = (await state(page)).cameraYaw;
  await page.keyboard.down('KeyS');
  await waitForFrames(page, 8);
  await page.keyboard.down('ShiftLeft');
  await waitForFrames(page, 6);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyS');
  const drift = Math.abs((await state(page)).cameraYaw - yawRunning);
  expect(drift, 'sprinting while running back should not quick-turn').toBeLessThan(0.3);

  // Shotgun: restart the range with three dummies close together, then key 2
  // swaps to the pump shotgun and a close blast knocks them flat.
  await page.evaluate(() => {
    const t = window.__deadAcre!.tuning;
    t.range.dummyCount = 3;
    t.range.dummyDistance = 2.5;
    t.range.dummyRespawnDelay = 0;
    window.__deadAcre!.start('range');
  });
  await waitForFrames(page, 2);
  await page.keyboard.press('Digit2');
  await expect.poll(async () => (await state(page)).weapon, { timeout: 60_000 }).toBe('pump');
  await expect.poll(async () => (await state(page)).zombies.filter((z) => z.alive).length, { timeout: 120_000 }).toBe(3);
  await waitForFrames(page, 4);
  s = await shootAt(page, 'torso');
  expect(s.stats.lastHit).toContain('pellets');
  // A close blast bowls over the whole group, not just the one in the middle.
  await expect
    .poll(async () => (await state(page)).zombies.filter((z) => ['knockdown', 'downBack'].includes(z.state) || !z.alive).length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: 'test-results/smoke-shotgun.png' });

  // Shell-by-shell reload.
  const shells = (await state(page)).ammo;
  expect(shells).toBe(5);
  await page.keyboard.press('KeyR');
  await expect.poll(async () => (await state(page)).ammo, { timeout: 120_000 }).toBe(6);

  // Key 3: the drum shotgun.
  await page.keyboard.press('Digit3');
  await expect.poll(async () => (await state(page)).weapon, { timeout: 60_000 }).toBe('drum');

  await expect(page.locator('.error-overlay')).toHaveCount(0);
  expect(errors, 'the browser logged errors').toEqual([]);
});

test('village, gamepad, menu and tuning panel for ~30 seconds', async ({ page, context }) => {
  const errors = watchErrors(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await installFakePad(page);
  const started = Date.now();
  await page.goto('/?autotest');
  await page.waitForFunction(() => window.__deadAcre?.ready === true, null, { timeout: 60_000 });

  // Plug in the PlayStation pad: the menu shows PlayStation buttons.
  await page.evaluate(() => ((window as unknown as { __fakePad: { connected: boolean } }).__fakePad.connected = true));
  await waitForFrames(page, 2);
  await expect(page.locator('.menu-controls')).toContainText('PlayStation controller');
  await expect(page.locator('.menu-controls')).toContainText('R2');

  // Triangle on the pad starts the village.
  await padTap(page, 3);
  await expect.poll(async () => (await state(page)).mode).toBe('village');
  expect((await state(page)).padType).toBe('playstation');

  // Aim with L2 and fire with R2.
  await padButton(page, 6, 1);
  await waitForFrames(page, 4);
  expect((await state(page)).aiming).toBe(true);
  await padTap(page, 7);
  await padButton(page, 6, 0);
  expect((await state(page)).stats.shots).toBe(1);
  expect((await state(page)).lastDevice).toBe('gamepad');

  // D-pad right swaps to the next weapon.
  await padTap(page, 15);
  await expect.poll(async () => (await state(page)).weapon, { timeout: 60_000 }).toBe('pump');

  // Left stick walks.
  const before = (await state(page)).player;
  await page.evaluate(() => ((window as unknown as { __fakePad: { axes: number[] } }).__fakePad.axes[1] = -1));
  await waitForFrames(page, 6);
  await page.evaluate(() => ((window as unknown as { __fakePad: { axes: number[] } }).__fakePad.axes[1] = 0));
  const after = (await state(page)).player;
  expect(Math.hypot(after[0] - before[0], after[2] - before[2]), 'left stick should walk').toBeGreaterThan(0.2);

  // Options pauses; the menu offers Resume.
  await padTap(page, 9);
  await expect(page.locator('.menu')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('.menu')).toBeHidden();

  // F3: FPS counter.
  await page.keyboard.press('F3');
  await expect(page.locator('.fps-counter')).toBeVisible();

  // F1: tuning panel. Make the zombies run, copy the change, then reset.
  const panel = page.locator('.tuning-panel');
  await page.keyboard.press('F1');
  await expect(panel).toBeVisible();
  await panel.locator('.lil-title', { hasText: /^Range$/ }).click();
  await panel.locator('.lil-controller', { has: page.getByText('Dummy behavior', { exact: true }) }).locator('select').selectOption('run');
  await expect.poll(() => page.evaluate(() => window.__deadAcre!.tuning.range.dummyBehavior)).toBe('run');
  await panel.getByText('Copy values (paste to Claude)').click();
  await expect(page.locator('.toast')).toContainText('Copied 1 changed value');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("range.dummyBehavior: 'stand' -> 'run'");
  await panel.getByText('Reset everything to defaults').click();
  await expect.poll(() => page.evaluate(() => window.__deadAcre!.tuning.range.dummyBehavior)).toBe('stand');
  await page.keyboard.press('F1');
  await expect(panel).toBeHidden();

  // More zombies, then keep playing with the keyboard and mouse until ~30 s.
  await page.evaluate(() => (window.__deadAcre!.tuning.village.zombieCount = 3));
  const moves = [['KeyW'], ['KeyD'], ['KeyW', 'ShiftLeft'], ['KeyA'], ['KeyS']];
  let i = 0;
  while ((Date.now() - started) / 1000 < TOTAL_SECONDS) {
    await hold(page, moves[i % moves.length], 3);
    if (i % 2 === 0) await shootAt(page, 'torso');
    i++;
  }
  expect((await state(page)).zombies.length).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/smoke-village.png' });

  await expect(page.locator('.error-overlay')).toHaveCount(0);
  console.log(`Played for ${((Date.now() - started) / 1000).toFixed(0)} s, ${await frames(page)} frames drawn.`);
  expect(errors, 'the browser logged errors').toEqual([]);
});
