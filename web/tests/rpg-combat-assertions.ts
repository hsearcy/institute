import { expect, type Page } from '@playwright/test';
import type { RpgCombatEnemy } from '../../shared/src/rpg';

/** Observe every real animation frame, including attacks, corpses and room swaps. */
export async function observePopulationCap(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const key = 'rpg-test-population-audit';
    const prior = JSON.parse(sessionStorage.getItem(key) ?? '{"frames":0,"maximum":0,"violations":[]}');
    const audit = (window as any).__rpgPopulationAudit = prior;
    const sample = () => {
      const world = (window as any).__game?.world;
      if (world?.enemies) {
        audit.frames++;
        const count = world.enemies.length; // Includes dying actors, not just live health.
        audit.maximum = Math.max(audit.maximum, count);
        if (count > 10 && audit.violations.length < 8) audit.violations.push({ count, encounter: world.encounter });
      }
      requestAnimationFrame(sample);
    };
    addEventListener('pagehide', () => sessionStorage.setItem(key, JSON.stringify(audit)));
    requestAnimationFrame(sample);
  });
}

export async function expectPopulationCap(page: Page): Promise<void> {
  const audit = await page.evaluate(() => (window as any).__rpgPopulationAudit);
  expect(audit.frames, 'The population audit must observe actual rendered gameplay frames').toBeGreaterThan(0);
  expect(audit.maximum, 'Living and dying enemy slots together must stay within ten').toBeLessThanOrEqual(10);
  expect(audit.violations).toEqual([]);
}

export async function expectWorldHealth(page: Page, expected: readonly RpgCombatEnemy[]): Promise<void> {
  await expect.poll(() => page.evaluate(() => (window as any).__game.world.enemies.map((enemy: any) => ({
    id: enemy.id, hp: enemy.hp, maxHp: enemy.maxHp,
  }))), { timeout: 30_000 }).toEqual(expected);
  await expect.poll(() => page.evaluate(() => (window as any).__game.world.enemies.every((enemy: any) => enemy.hp > 0 || enemy.dead)), { timeout: 30_000 }).toBe(true);
}
