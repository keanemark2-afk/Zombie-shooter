import { expect, test } from '@playwright/test';
import { fastMode, state, waitForFrames, watchErrors } from './helpers';

// Phase 5: the attache case and the Trader's menu.

test('phase 5: case and trader', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?autotest');
  await page.waitForFunction(() => window.__deadAcre?.ready === true, null, { timeout: 60_000 });
  await fastMode(page);
  await page.evaluate(() => {
    window.__deadAcre!.tuning.waves.startDelay = 99999;
  });
  await page.getByRole('button', { name: 'Survival' }).click();
  await waitForFrames(page, 3);
  let s = await state(page);
  expect(s.caseSize).toEqual([7, 10]);
  expect(s.gunItems).toEqual(['pistol']);

  // Tab opens the case; it shows the items; Tab closes it.
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await state(page)).ui).toBe('case');
  await expect(page.locator('.case-item')).toHaveCount(4); // pistol, herb, 2 grenades
  await page.screenshot({ path: 'test-results/phase5-case.png' });
  await page.locator('[data-act="sort"]').click();
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await state(page)).ui).toBe(null);

  // The Trader: buy a herb, a gun and an upgrade.
  await page.evaluate(() => {
    window.__deadAcre!.cheat('coins', 20000);
    window.__deadAcre!.ui('trader');
  });
  await expect(page.locator('.trader-screen')).toBeVisible();
  await page.screenshot({ path: 'test-results/phase5-trader.png' });
  await page.locator('.trade-row', { hasText: 'Green herb' }).click();
  await page.locator('.trade-row', { hasText: 'BRAMBLE 12' }).first().click();
  s = await state(page);
  expect(s.gunItems).toContain('pump');
  expect(s.coins).toBeLessThan(20000);
  await page.locator('[data-tab="upgrade"]').click();
  await page.locator('.trade-row', { hasText: 'Firepower' }).first().click();
  await page.screenshot({ path: 'test-results/phase5-upgrade.png' });
  await page.locator('[data-tab="sell"]').click();
  await expect(page.locator('.trade-row').first()).toBeVisible();
  await page.locator('[data-act="leave"]').click();
  await expect.poll(async () => (await state(page)).ui).toBe(null);
  await page.keyboard.press('Digit2');
  await expect.poll(async () => (await state(page)).weapon, { timeout: 60_000 }).toBe('pump');

  await expect(page.locator('.error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});
