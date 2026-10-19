import { expect, test } from '@playwright/test';
import { fastMode, state, waitForFrames, waitForTicks, watchErrors, withGame } from './helpers';

// Phase 3: Survival. Waves of zombies that find their way to you, take turns
// attacking, hurt you, drop things, and a death screen.

test('survival: waves, turns, healing, drops and death', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?autotest');
  await page.waitForFunction(() => window.__deadAcre?.ready === true, null, { timeout: 60_000 });
  await fastMode(page);
  await page.evaluate(() => {
    const t = window.__deadAcre!.tuning;
    t.waves.startDelay = 1;
    t.drops.chance = 0; // drops are switched off while the exact item counts are checked
    t.drops.crateChance = 1;
  });

  await page.getByRole('button', { name: 'Survival' }).click();
  await expect(page.locator('.menu')).toBeHidden();
  let s = await state(page);
  expect(s.mode).toBe('survival');
  expect(s.health).toBe(100);
  expect(s.items).toEqual(['herb:G']);
  await expect(page.locator('.health-box')).toBeVisible();

  // The wave counts down, then zombies walk in through the gates.
  await expect.poll(async () => (await state(page)).waveState, { timeout: 120_000 }).toBe('active');
  await expect.poll(async () => (await state(page)).zombies.length, { timeout: 120_000 }).toBeGreaterThan(2);
  await page.screenshot({ path: 'test-results/survival-wave.png' });
  s = await state(page);
  expect(s.wave).toBe(1);
  expect(s.zombies.every((z) => z.aware)).toBe(true);

  // Take turns: a crowd closes in, but only a few attack at a time and the rest wait.
  await withGame(page, (g) => {
    g.health.reset(100000);
    g.zombies.forEach((z, i) => z.teleport(g.player.position.x + Math.cos(i * 1.3) * 5, g.player.position.z + Math.sin(i * 1.3) * 5, 0));
  });
  let maxAttackers = 0;
  let waiting = 0;
  for (let i = 0; i < 14; i++) {
    await waitForTicks(page, 40);
    const now = await state(page);
    maxAttackers = Math.max(maxAttackers, now.attackers);
    waiting = Math.max(waiting, now.zombies.filter((z) => z.alive && !z.hasToken && z.dist < 6).length);
  }
  const limit = await page.evaluate(() => window.__deadAcre!.tuning.ai.maxAttackers);
  expect(maxAttackers, 'someone should get to attack').toBeGreaterThan(0);
  expect(maxAttackers, 'only a few may attack at once').toBeLessThanOrEqual(limit);
  expect(waiting, 'the rest hang back and wait').toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/survival-crowd.png' });

  // A zombie that hasn't noticed you ambles about; when it notices you it roars and alerts its neighbours.
  await page.evaluate(() => window.__deadAcre!.killAll());
  await page.evaluate(() => {
    const t = window.__deadAcre!.tuning;
    t.waves.maxAliveStart = 0;
    t.ai.sightRange = 0;
    t.ai.hearRange = 9;
  });
  const first = await page.evaluate(() => window.__deadAcre!.spawn('shambler', 14, false));
  const second = await page.evaluate(() => window.__deadAcre!.spawn('shambler', 14, false, 9));
  await waitForTicks(page, 20);
  s = await state(page);
  expect(s.zombies.find((z) => z.id === first)?.aware, 'too far away to notice you yet').toBe(false);
  await page.evaluate(() => (window.__deadAcre!.tuning.ai.hearRange = 30));
  await expect.poll(async () => (await state(page)).zombies.find((z) => z.id === first)?.aware, { timeout: 120_000 }).toBe(true);
  await expect.poll(async () => (await state(page)).zombies.find((z) => z.id === second)?.aware, { timeout: 120_000 }).toBe(true);
  await page.evaluate(() => {
    const t = window.__deadAcre!.tuning;
    t.waves.maxAliveStart = 7;
    t.ai.sightRange = 26;
    t.ai.hearRange = 9;
  });

  // Being hit costs health; a green herb brings it back (and takes a moment).
  await withGame(page, (g) => g.health.reset(100));
  await page.evaluate(() => window.__deadAcre!.cheat('hurt', 55));
  expect((await state(page)).health).toBe(45);
  await page.evaluate(() => window.__deadAcre!.killAll());
  await waitForTicks(page, 60); // the hit's stun wears off
  await page.keyboard.press('KeyH');
  await expect.poll(async () => (await state(page)).healing, { timeout: 60_000 }).toBe(true);
  await expect.poll(async () => (await state(page)).healing, { timeout: 60_000 }).toBe(false);
  s = await state(page);
  expect(s.health).toBe(75);
  expect(s.items).toEqual([]);

  // Hit while healing: the herb is not used up.
  await page.evaluate(() => window.__deadAcre!.cheat('herb', 0, 'G'));
  await waitForTicks(page, 60);
  await page.keyboard.press('KeyH');
  await expect.poll(async () => (await state(page)).healing, { timeout: 60_000 }).toBe(true);
  await page.evaluate(() => window.__deadAcre!.cheat('hurt', 10));
  await waitForFrames(page, 2);
  s = await state(page);
  expect(s.healing).toBe(false);
  expect(s.items).toEqual(['herb:G']);
  expect(s.health).toBe(65);

  // Killed zombies drop things (the rules are unit-tested); walk over a pile of coins.
  const coinsBefore = (await state(page)).coins;
  await page.evaluate(() => window.__deadAcre!.cheat('dropHere', 250));
  await expect.poll(async () => (await state(page)).coins, { timeout: 60_000 }).toBeGreaterThanOrEqual(coinsBefore + 250);
  await expect(page.locator('.feed-line').first()).toBeVisible();

  // Smashing a crate releases a drop, and whatever is inside can be picked up.
  const cratesBefore = (await state(page)).crates;
  await page.evaluate(() => {
    const g = (window as unknown as { __game: { breakNearestCrate: () => void } }).__game;
    g.breakNearestCrate();
  });
  expect((await state(page)).crates).toBe(cratesBefore + 1);

  // Clear the wave: bonus coins, a short break, then wave 2.
  await page.evaluate(() => window.__deadAcre!.tuning.waves.firstWaveSize = 2);
  await page.evaluate(() => window.__deadAcre!.cheat('wave', 1));
  const coinsAtClear = (await state(page)).coins;
  for (let i = 0; i < 40 && (await state(page)).waveState !== 'intermission'; i++) {
    await page.evaluate(() => window.__deadAcre!.killAll());
    await waitForTicks(page, 60);
  }
  expect((await state(page)).waveState).toBe('intermission');
  expect((await state(page)).coins).toBeGreaterThan(coinsAtClear);
  await page.evaluate(() => window.__deadAcre!.cheat('skipBreak'));
  await expect.poll(async () => (await state(page)).wave, { timeout: 120_000 }).toBe(2);

  // Die: the screen fades in with a summary, and Enter starts again.
  await page.evaluate(() => window.__deadAcre!.cheat('hurt', 9999));
  await expect.poll(async () => (await state(page)).dead).toBe(true);
  await expect.poll(async () => (await state(page)).deathScreen, { timeout: 120_000 }).toBe(true);
  await expect(page.locator('.death-screen')).toContainText('Wave');
  await page.screenshot({ path: 'test-results/survival-death.png' });
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).dead).toBe(false);
  s = await state(page);
  expect(s.health).toBe(100);
  expect(s.wave).toBe(1);
  expect(s.deathScreen).toBe(false);

  await expect(page.locator('.error-overlay')).toHaveCount(0);
  expect(errors, 'the browser logged errors').toEqual([]);
});
