import { expect, test, type Page } from '@playwright/test';
import { fastMode, shootAt, state, waitForFrames, waitForTicks, watchErrors } from './helpers';

// Phase 4: grenades, the new enemy types (shield, axe, dynamite, hulk,
// chainsaw), the parasite, and the two extra pistols.

type AnyGame = {
  zombies: Array<{ id: number; behavior: string; health: number; shield: { hp: number } | null }>;
  health: { reset: (n: number) => void; current: number };
};

/** Spawns an enemy in front of the player and (optionally) makes it stand still. */
async function place(page: Page, kind: string, distance: number, opts: { stand?: boolean; aware?: boolean; side?: number } = {}): Promise<number> {
  return page.evaluate(
    ([k, d, stand, aware, side]) => {
      const id = window.__deadAcre!.spawn(k as 'shambler', d as number, aware as boolean, side as number);
      if (stand) {
        const g = (window as unknown as { __game: AnyGame }).__game;
        g.zombies.find((z) => z.id === id)!.behavior = 'stand';
      }
      return id;
    },
    [kind, distance, opts.stand ?? true, opts.aware ?? false, opts.side ?? 0],
  );
}

async function zombie(page: Page, id: number) {
  const s = await state(page);
  return s.zombies.find((z) => z.id === id)!;
}

/** Is it still alive? (A body blown to pieces is gone from the list altogether.) */
async function isAlive(page: Page, id: number): Promise<boolean> {
  return (await state(page)).zombies.find((z) => z.id === id)?.alive ?? false;
}

async function restart(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__deadAcre!.start('survival');
    (window as unknown as { __game: AnyGame }).__game.health.reset(100000);
  });
  await waitForFrames(page, 3);
}

test('phase 4: grenades, new enemies, parasite and extra pistols', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?autotest');
  await page.waitForFunction(() => window.__deadAcre?.ready === true, null, { timeout: 60_000 });
  await fastMode(page);
  await page.evaluate(() => {
    const t = window.__deadAcre!.tuning;
    t.waves.startDelay = 99999; // no wave arrives: only the enemies the test places
    t.drops.chance = 0;
    t.pistol.critChance = 0;
    t.ai.sightRange = 0;
    t.ai.hearRange = 0;
  });

  // ---- Frag grenade: G throws it, it bounces, goes off and blows the group apart.
  await page.getByRole('button', { name: 'Survival' }).click();
  await restart(page);
  let s = await state(page);
  expect(s.grenades.frag).toBe(2);
  await expect(page.locator('.grenade-box')).toContainText('Frag');
  const a = await place(page, 'shambler', 9);
  await place(page, 'shambler', 9.8, { side: 0.9 });
  await page.evaluate(() => window.__deadAcre!.aimAt('torso'));
  await page.keyboard.press('KeyG');
  await expect.poll(async () => (await state(page)).launched.frag, { timeout: 120_000 }).toBe(1);
  await page.screenshot({ path: 'test-results/phase4-grenade-air.png' });
  await expect.poll(async () => (await state(page)).stats.lastHit, { timeout: 120_000 }).toContain('EXPLOSION');
  await expect.poll(async () => (await state(page)).thrown.length, { timeout: 120_000 }).toBe(0);
  s = await state(page);
  expect(s.grenades.frag).toBe(1);
  expect(s.stats.lastHit).toContain('EXPLOSION');
  expect(await isAlive(page, a)).toBe(false);
  await page.screenshot({ path: 'test-results/phase4-grenade-blast.png' });

  // ---- Flash grenade: blinds zombies (open to a kick); a parasite dies to it.
  await restart(page);
  await page.evaluate(() => window.__deadAcre!.cheat('grenade', 2, 'flash'));
  const f1 = await place(page, 'shambler', 8);
  await page.keyboard.press('KeyB'); // change type: frag -> flash
  await expect.poll(async () => (await state(page)).grenades.selected, { timeout: 60_000 }).toBe('flash');
  await page.evaluate(() => window.__deadAcre!.aimAt('torso'));
  await page.keyboard.press('KeyG');
  await expect.poll(async () => (await zombie(page, f1)).state, { timeout: 120_000 }).toBe('blinded');
  expect((await zombie(page, f1)).openTo).toBe('head');
  expect((await state(page)).stats.lastHit).toContain('FLASH');
  await page.screenshot({ path: 'test-results/phase4-flash.png' });

  // ---- Incendiary: flames on the ground set a zombie alight and burn it down.
  await restart(page);
  const burner = await place(page, 'shambler', 6);
  await page.evaluate(() => window.__deadAcre!.cheat('fire', 6));
  await expect.poll(async () => (await state(page)).fires, { timeout: 60_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await zombie(page, burner)).burning, { timeout: 60_000 }).toBe(true);
  await page.screenshot({ path: 'test-results/phase4-fire.png' });
  await expect.poll(() => isAlive(page, burner), { timeout: 180_000 }).toBe(false);

  // ---- Plank-bearer: the shield soaks up bullets; a kick breaks it.
  await restart(page);
  const shielded = await place(page, 'shield', 6);
  await page.evaluate(() => {
    window.__deadAcre!.tuning.pistol.damage = 200;
  });
  const hpBefore = (await zombie(page, shielded)).shield!;
  await shootAt(page, 'torso');
  const afterShot = await zombie(page, shielded);
  expect(afterShot.shield!).toBeLessThan(hpBefore);
  expect((await state(page)).stats.lastHit).toContain('SHIELD');
  await page.screenshot({ path: 'test-results/phase4-shield.png' });
  await page.evaluate(() => window.__deadAcre!.zombie('place', 1.2));
  await expect.poll(async () => (await state(page)).meleePrompt, { timeout: 60_000 }).toBe('frontKick');
  await page.keyboard.press('KeyF');
  await expect.poll(async () => (await zombie(page, shielded)).shield, { timeout: 120_000 }).toBe(0);
  expect((await state(page)).stats.lastHit).toContain('SHIELD');

  // ---- Axe thrower: raises an axe, throws it, and it hurts.
  await restart(page);
  await page.evaluate(() => {
    const t = window.__deadAcre!.tuning;
    t.axeThrower.chance = 1;
    t.axeThrower.minRange = 3;
    (window as unknown as { __game: AnyGame }).__game.health.reset(100);
  });
  await place(page, 'armed', 11, { stand: false, aware: true });
  await expect.poll(async () => (await state(page)).launched.axe, { timeout: 180_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await state(page)).health, { timeout: 120_000 }).toBeLessThan(100);
  await page.screenshot({ path: 'test-results/phase4-axe.png' });

  // ---- Dynamite thrower: lights a stick and lobs it; it goes off.
  await restart(page);
  await page.evaluate(() => {
    const t = window.__deadAcre!.tuning;
    t.dynamiteThrower.minRange = 3;
    t.dynamiteThrower.fuse = 2.2;
  });
  await place(page, 'dynamite', 13, { stand: false, aware: true });
  await expect.poll(async () => (await state(page)).launched.dynamite, { timeout: 180_000 }).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/phase4-dynamite.png' });
  await expect.poll(async () => (await state(page)).thrown.length, { timeout: 180_000 }).toBe(0);

  // ---- Hulk: shrugs off body shots, a headshot staggers it.
  await restart(page);
  const hulk = await place(page, 'brute', 6);
  const hulkHealth = (await zombie(page, hulk)).health;
  await shootAt(page, 'torso');
  let h = await zombie(page, hulk);
  expect(h.health).toBeLessThan(hulkHealth);
  expect(['idle', 'walk']).toContain(h.state);
  await shootAt(page, 'head');
  await expect.poll(async () => (await zombie(page, hulk)).state, { timeout: 60_000 }).toBe('headStagger');
  h = await zombie(page, hulk);
  expect(h.headless).toBe(false);
  await page.screenshot({ path: 'test-results/phase4-hulk.png' });

  // ---- Sawyer: a heavy hit on Normal; instant death on Hard.
  await restart(page);
  await page.evaluate(() => {
    window.__deadAcre!.difficulty('normal');
    (window as unknown as { __game: AnyGame }).__game.health.reset(100);
  });
  await place(page, 'chainsaw', 2.4, { stand: false, aware: true });
  await expect.poll(async () => (await state(page)).health, { timeout: 180_000 }).toBeLessThan(100);
  s = await state(page);
  expect(s.dead).toBe(false);
  expect(s.stats.lastHit).toContain('CHAINSAW');
  await page.screenshot({ path: 'test-results/phase4-sawyer.png' });
  await restart(page);
  await page.evaluate(() => {
    window.__deadAcre!.difficulty('hard');
    (window as unknown as { __game: AnyGame }).__game.health.reset(100);
  });
  await place(page, 'chainsaw', 2.4, { stand: false, aware: true });
  await expect.poll(async () => (await state(page)).dead, { timeout: 180_000 }).toBe(true);
  await page.evaluate(() => window.__deadAcre!.difficulty('normal'));

  // ---- Parasite: a headshot that isn't overkill lets one out; it whips; a flash kills it.
  await restart(page);
  await page.evaluate(() => {
    const t = window.__deadAcre!.tuning;
    t.parasite.baseChance = 1;
    t.parasite.maxChance = 1;
    t.zombie.health = 200;
    t.pistol.damage = 100;
    t.ai.sightRange = 40;
    t.ai.hearRange = 40;
  });
  const host = await place(page, 'shambler', 6, { stand: true, aware: false });
  await shootAt(page, 'head');
  await expect.poll(async () => (await zombie(page, host)).parasite, { timeout: 60_000 }).toBe(true);
  expect(await isAlive(page, host)).toBe(true);
  expect((await zombie(page, host)).headless).toBe(true);
  await page.screenshot({ path: 'test-results/phase4-mutate.png' });
  // Free the parasite to hunt (it was standing still for the shot).
  await page.evaluate((id) => {
    const g = (window as unknown as { __game: AnyGame }).__game;
    g.zombies.find((z) => z.id === id)!.behavior = 'hunt';
  }, host);
  await expect.poll(async () => (await zombie(page, host)).state, { timeout: 180_000 }).toMatch(/whip/);
  await page.screenshot({ path: 'test-results/phase4-whip.png' });
  await page.evaluate(() => window.__deadAcre!.cheat('grenade', 1, 'flash'));
  for (let i = 0; i < 3 && (await state(page)).grenades.selected !== 'flash'; i++) {
    await page.keyboard.press('KeyB');
    await waitForFrames(page, 2);
  }
  await page.evaluate(() => window.__deadAcre!.aimAt('parasite'));
  await page.keyboard.press('KeyG');
  await expect.poll(async () => (await state(page)).launched.flash, { timeout: 180_000 }).toBeGreaterThan(1);

  // ---- The two extra pistols.
  await page.evaluate(() => window.__deadAcre!.start('range'));
  await waitForFrames(page, 3);
  for (const [key, id] of [['Digit8', 'heavy'], ['Digit9', 'swift']] as const) {
    await page.keyboard.press(key);
    await expect.poll(async () => (await state(page)).weapon, { timeout: 60_000 }).toBe(id);
    await waitForFrames(page, 3);
    const before = (await state(page)).stats.shots;
    await shootAt(page, 'torso');
    expect((await state(page)).stats.shots).toBeGreaterThan(before);
  }
  await page.screenshot({ path: 'test-results/phase4-pistols.png' });

  await waitForTicks(page, 5);
  await expect(page.locator('.error-overlay')).toHaveCount(0);
  expect(errors, 'the browser logged errors').toEqual([]);
});
