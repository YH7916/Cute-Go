/**
 * Board display and interaction tests
 */

import { test, expect } from '@playwright/test';

test.setTimeout(10000);

test.describe('Board Display', () => {
  test('board is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.shudan-goban').first()).toBeVisible();
  });
});
