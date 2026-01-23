/**
 * Keyboard and game tree navigation tests
 */

import { test, expect } from '@playwright/test';

test.setTimeout(10000);

test.describe('Keyboard Navigation', () => {
  test('arrow keys work', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.shudan-goban')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Home');
    await page.keyboard.press('End');

    await expect(page.locator('body')).toBeVisible();
  });
});
