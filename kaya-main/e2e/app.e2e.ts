/**
 * App loading and header tests
 */

import { test, expect } from '@playwright/test';

test.setTimeout(10000);

test.describe('App Loading', () => {
  test('app loads and shows main UI', async ({ page }) => {
    await page.goto('/');
    // Use exact match to avoid multiple matches
    await expect(page.getByRole('button', { name: 'New', exact: true })).toBeVisible();
  });

  test('page has correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Kaya/);
  });
});

test.describe('Header Actions', () => {
  test('has New, Open, Save buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'New', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true }).first()).toBeVisible();
  });
});
