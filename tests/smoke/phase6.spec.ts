import { expect, test } from '@playwright/test';
import { fastMode, state, waitForFrames, watchErrors } from './helpers';

// Phase 6: Score Attack mode, combo scoring, overdrive, time orbs, settings and controls.

test('phase 6: score attack, difficulty and settings', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?autotest');
  await page.waitForFunction(() => window.__deadAcre?.ready === true, null, { timeout: 60_000 });
  await fastMode(page);

  // 1. Settings & Remap Controls from Main Menu
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('.menu-settings')).toBeVisible();

  // Change difficulty to Hard
  await page.locator('button[data-diff="hard"]').click();
  let s = await state(page);
  expect(s.difficulty).toBe('hard');

  // Toggle Invert Y and Graphics Quality
  await page.locator('button[data-inverty="on"]').click();
  await page.locator('button[data-graphics="low"]').click();
  s = await state(page);
  expect(s.invertY).toBe(true);
  expect(s.graphicsQuality).toBe('low');
  await page.screenshot({ path: 'test-results/phase6-settings.png' });

  // Open Remap Controls view
  await page.locator('button[data-action="open-remap"]').click();
  await expect(page.locator('.menu-remap')).toBeVisible();
  await page.screenshot({ path: 'test-results/phase6-remap.png' });

  // Back to Settings, then back to Main Menu
  await page.locator('button[data-action="back-remap"]').click();
  await page.locator('button[data-action="back"]').click();
  await expect(page.locator('.menu-main')).toBeVisible();

  // 2. Start Score Attack Mode
  await page.getByRole('button', { name: 'Score Attack' }).click();
  await waitForFrames(page, 5);

  s = await state(page);
  expect(s.mode).toBe('score');
  expect(s.timeRemaining).toBeGreaterThan(100);
  expect(s.kills).toBe(0);
  expect(s.combo).toBe(0);

  // HUD elements should be visible
  await expect(page.locator('.score-hud')).toBeVisible();
  await expect(page.locator('.score-clock')).toBeVisible();

  // 3. Enemy kill, score, and combo progression
  await page.evaluate(() => {
    window.__deadAcre!.spawn('shambler', 4, true, 0);
  });
  await waitForFrames(page, 3);
  await page.evaluate(() => {
    window.__deadAcre!.killAll();
  });
  await waitForFrames(page, 5);

  s = await state(page);
  expect(s.kills).toBeGreaterThanOrEqual(1);
  expect(s.score).toBeGreaterThan(0);
  expect(s.combo).toBeGreaterThanOrEqual(1);
  await page.screenshot({ path: 'test-results/phase6-score-hud.png' });

  // 4. Overdrive activation
  await page.evaluate(() => {
    const g = (window as unknown as { __game?: { scoreAttack: { state: { overdriveGauge: number } } } }).__game;
    if (g) g.scoreAttack.state.overdriveGauge = 1.0;
  });
  await page.keyboard.press('KeyQ');
  await waitForFrames(page, 5);

  s = await state(page);
  expect(s.overdrive).toBe(true);
  await expect(page.locator('.overdrive-box')).toHaveClass(/active/);
  await page.screenshot({ path: 'test-results/phase6-overdrive.png' });

  // 5. Time Orb collection (+30s)
  const timeBefore = s.timeRemaining;
  await page.evaluate(() => {
    const g = (window as unknown as {
      __game?: {
        pickups: { spawn: (drop: { type: string }, at: unknown, y: number) => { grace: number; landed: boolean; vel: { set: (x: number, y: number, z: number) => void } } };
        player: { position: { x: number; y: number; z: number } };
        world: { groundHeight: (x: number, z: number) => number };
      };
    }).__game;
    if (g) {
      const gy = g.world.groundHeight(g.player.position.x, g.player.position.z);
      const pk = g.pickups.spawn({ type: 'orb' }, g.player.position, gy);
      pk.grace = 0;
      pk.landed = true;
      pk.vel.set(0, 0, 0);
    }
  });
  await waitForFrames(page, 5);
  s = await state(page);
  // Time orb adds 30 seconds; accounting for frames ticked, remaining time should be significantly higher
  expect(s.timeRemaining).toBeGreaterThan(timeBefore + 20);

  // 6. Match Completion / Results Screen
  await page.evaluate(() => {
    const g = (window as unknown as { __game?: { scoreAttack: { state: { timeRemaining: number } } } }).__game;
    if (g) g.scoreAttack.state.timeRemaining = 0.05;
  });
  await waitForFrames(page, 15);

  s = await state(page);
  expect(s.deathScreen).toBe(true);
  await expect(page.locator('.death-screen')).toBeVisible();
  await expect(page.locator('.death-screen h1')).toHaveText(/TIME EXPIRED|TARGET COMPLETED|YOU DIED/);
  await page.screenshot({ path: 'test-results/phase6-results.png' });

  // Clean exit to menu
  await page.keyboard.press('Escape');
  await waitForFrames(page, 5);

  await expect(page.locator('.error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});
