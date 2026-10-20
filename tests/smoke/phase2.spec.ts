import { expect, test, type Page } from '@playwright/test';
import { fastMode, shootAt, state, waitForFrames, watchErrors } from './helpers';

// Phase 2: bursting heads and torn-off limbs, the new guns, kicks, the
// suplex, the knife finisher, slashing, parrying and breaking free of grabs.

async function restartRange(page: Page, settings: Record<string, number | string | boolean> = {}): Promise<void> {
  await page.evaluate((s) => {
    const t = window.__deadAcre!.tuning as unknown as Record<string, Record<string, unknown>>;
    for (const [path, value] of Object.entries(s)) {
      const [group, key] = path.split('.');
      t[group][key] = value;
    }
    window.__deadAcre!.start('range');
  }, settings);
  await waitForFrames(page, 3);
}

async function pickWeapon(page: Page, key: string, id: string): Promise<void> {
  await page.keyboard.press(key);
  await expect.poll(async () => (await state(page)).weapon, { timeout: 60_000 }).toBe(id);
  await waitForFrames(page, 3);
}

async function lastHit(page: Page): Promise<string> {
  return (await state(page)).stats.lastHit;
}

test('phase 2: gore, new weapons, kicks, knife, parry and grabs', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?autotest');
  await page.waitForFunction(() => window.__deadAcre?.ready === true, null, { timeout: 60_000 });
  await fastMode(page);

  // The Gore choice is in Settings.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('[data-gore="stylized"]').click();
  await expect(page.locator('[data-gore="stylized"]')).toHaveClass(/on/);
  await page.locator('[data-gore="full"]').click();
  await page.getByRole('button', { name: 'Back' }).click();
  expect((await state(page)).gore).toBe('full');

  await page.evaluate(() => {
    const t = window.__deadAcre!.tuning;
    Object.assign(t.range, { dummyDistance: 4, dummyHoldsWeapon: false, dummyRespawnDelay: 0 });
    Object.assign(t.reactions, { kneelTime: 20, headStaggerTime: 20, knockdownTime: 20, tripTime: 20 });
    t.postFx.grain = 0;
  });
  await page.getByRole('button', { name: 'Shooting range' }).click();
  await expect(page.locator('.menu')).toBeHidden();
  await waitForFrames(page, 3);

  // Big revolver to the head: the head bursts.
  await pickWeapon(page, 'Digit6', 'magnum');
  let s = await shootAt(page, 'head');
  expect(s.stats.lastHit).toContain('HEAD BURST');
  expect(s.zombies[0].headless).toBe(true);
  expect(s.zombies[0].alive).toBe(false);
  await page.screenshot({ path: 'test-results/phase2-head-burst.png' });

  // Pump shotgun to a leg: it comes off and the zombie crawls.
  await restartRange(page, { 'pumpShotgun.dismember': 1 });
  await pickWeapon(page, 'Digit2', 'pump');
  s = await shootAt(page, 'legL');
  expect(s.stats.lastHit).toContain('TORN OFF');
  expect(s.zombies[0].missing.length).toBeGreaterThan(0);
  await expect.poll(async () => (await state(page)).zombies[0].state, { timeout: 120_000 }).toBe('crawl');
  await page.screenshot({ path: 'test-results/phase2-crawler.png' });

  // It drags itself closer: finish it with the knife.
  await expect.poll(async () => (await state(page)).meleePrompt, { timeout: 180_000 }).toBe('finisher');
  for (let i = 0; i < 30 && !(await lastHit(page)).includes('FINISHER'); i++) {
    await page.keyboard.press('KeyF');
    await waitForFrames(page, 2);
  }
  expect(await lastHit(page)).toContain('KNIFE FINISHER');

  // Roundhouse kick on a head-staggered zombie: the prompt shows, F kicks it down.
  await restartRange(page, { 'range.dummyDistance': 1.3 });
  await page.evaluate(() => window.__deadAcre!.zombie('headStagger', 20));
  await expect.poll(async () => (await state(page)).meleePrompt, { timeout: 60_000 }).toBe('roundhouse');
  await expect(page.locator('.melee-prompt')).toBeVisible();
  await expect(page.locator('.melee-prompt')).toContainText('Kick');
  await page.screenshot({ path: 'test-results/phase2-kick-prompt.png' });
  // A staggered zombie stumbles backwards, so keep putting it back within reach until the kick lands.
  for (let i = 0; i < 12 && !(await lastHit(page)).includes('ROUNDHOUSE'); i++) {
    await page.evaluate(() => window.__deadAcre!.zombie('place', 1.3));
    await page.keyboard.press('KeyF');
    await waitForFrames(page, 2);
  }
  await expect.poll(() => lastHit(page), { timeout: 120_000 }).toContain('ROUNDHOUSE');
  expect(['knockdown', 'downBack']).toContain((await state(page)).zombies[0].state);

  // Suplex: kneeling with its back to you.
  await restartRange(page);
  await page.evaluate(() => window.__deadAcre!.zombie('kneelAway', 20));
  await expect.poll(async () => (await state(page)).meleePrompt, { timeout: 60_000 }).toBe('suplex');
  await page.keyboard.press('KeyF');
  await expect.poll(() => lastHit(page), { timeout: 120_000 }).toContain('SUPLEX');
  await expect.poll(async () => (await state(page)).melee, { timeout: 120_000 }).toBeNull();

  // Knife slash.
  await restartRange(page);
  await page.keyboard.press('KeyV');
  await expect.poll(() => lastHit(page), { timeout: 60_000 }).toContain('KNIFE');

  // Grabbed: the break-free bar appears; mashing F gets you out.
  await page.evaluate(() => window.__deadAcre!.zombie('grab'));
  await expect(page.locator('.grab-prompt')).toBeVisible();
  await page.screenshot({ path: 'test-results/phase2-grabbed.png' });
  for (let i = 0; i < 30 && (await state(page)).grabbed; i++) {
    await page.keyboard.press('KeyF');
    await waitForFrames(page, 1);
  }
  expect((await state(page)).grabbed).toBe(false);
  await expect(page.locator('.grab-prompt')).toBeHidden();

  // Parry: press the knife just before a swing lands (slow motion so the timing can be hit).
  await restartRange(page, { 'range.dummyBehavior': 'walk', 'range.dummyDistance': 1.4, 'grab.chance': 0, 'simulation.maxFrameTime': 0.02 });
  for (let i = 0; i < 400 && !(await lastHit(page)).includes('PARR'); i++) {
    const z = (await state(page)).zombies.find((zz) => zz.alive);
    if (z && z.state === 'windup' && z.stateTime > 0.7) {
      await page.keyboard.press('KeyV');
      await waitForFrames(page, 4);
    } else {
      await waitForFrames(page, 1);
    }
  }
  expect(await lastHit(page)).toMatch(/PARR/);
  expect((await state(page)).knife).toBeLessThan(100);
  await page.evaluate(() => (window.__deadAcre!.tuning.simulation.maxFrameTime = 0.5));

  // Submachine gun: keeps firing while the trigger is held.
  await restartRange(page, { 'range.dummyBehavior': 'stand', 'range.dummyDistance': 8, 'range.dummyInvincible': true, 'simulation.maxFrameTime': 0.1 });
  await pickWeapon(page, 'Digit4', 'smg');
  await page.mouse.down({ button: 'right' });
  await waitForFrames(page, 4);
  await page.evaluate(() => window.__deadAcre!.aimAt('torso'));
  await page.mouse.down({ button: 'left' });
  await waitForFrames(page, 8);
  await page.mouse.up({ button: 'left' });
  await page.mouse.up({ button: 'right' });
  expect((await state(page)).stats.shots).toBeGreaterThanOrEqual(3);

  // Rifle: aiming looks through the scope.
  await pickWeapon(page, 'Digit5', 'rifle');
  await page.mouse.down({ button: 'right' });
  await expect.poll(async () => (await state(page)).scoped, { timeout: 60_000 }).toBe(true);
  await expect(page.locator('.scope')).toBeVisible();
  await page.screenshot({ path: 'test-results/phase2-scope.png' });
  await page.mouse.up({ button: 'right' });
  await expect(page.locator('.scope')).toBeHidden();

  // Rocket launcher into a group: a blast that kills them.
  await restartRange(page, { 'range.dummyInvincible': false, 'range.dummyCount': 3, 'range.dummyDistance': 10, 'range.dummyRespawnDelay': 10 });
  await pickWeapon(page, 'Digit7', 'rocket');
  await shootAt(page, 'torso');
  await expect.poll(async () => (await state(page)).rockets, { timeout: 60_000 }).toBe(0);
  await expect.poll(() => lastHit(page), { timeout: 60_000 }).toContain('EXPLOSION');
  s = await state(page);
  expect(s.stats.kills).toBeGreaterThanOrEqual(2);
  expect(s.zombies.some((z) => z.gibbed || z.missing.length > 0) || s.goreChunks > 0).toBe(true);
  await page.screenshot({ path: 'test-results/phase2-rocket.png' });

  // Red barrel: one shot blows it up.
  await restartRange(page, { 'range.dummyCount': 1 });
  await pickWeapon(page, 'Digit1', 'pistol');
  await page.mouse.down({ button: 'right' });
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => {
      const g = (window as unknown as { __game: { world: { level: { root: { traverse: (f: (o: { userData: Record<string, unknown>; position: { x: number; y: number; z: number } }) => void) => void } } }; camera: { position: { x: number; y: number; z: number } }; cam: { yaw: number; pitch: number } } }).__game;
      let b: { x: number; y: number; z: number } | null = null;
      g.world.level.root.traverse((o) => {
        if (o.userData.barrel) b = o.position;
      });
      if (!b) return;
      const p = b as { x: number; y: number; z: number };
      const d = { x: p.x - g.camera.position.x, y: p.y + 0.45 - g.camera.position.y, z: p.z - g.camera.position.z };
      const l = Math.hypot(d.x, d.y, d.z);
      g.cam.yaw = Math.atan2(-d.x, -d.z);
      g.cam.pitch = Math.asin(d.y / l);
    });
    await waitForFrames(page, 1);
  }
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
  await expect.poll(async () => (await state(page)).barrelsExploded, { timeout: 60_000 }).toBe(1);
  await page.mouse.up({ button: 'right' });
  await waitForFrames(page, 2);
  await page.screenshot({ path: 'test-results/phase2-barrel.png' });

  await expect(page.locator('.error-overlay')).toHaveCount(0);
  expect(errors, 'the browser logged errors').toEqual([]);
});
