/**
 * Edit tools tests - markers, labels, and setup stones
 */

import { test, expect } from '@playwright/test';

test.setTimeout(15000);

test.describe('Edit Toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.shudan-goban')).toBeVisible();

    // Enable edit mode by clicking the Edit button in header
    const editButton = page.getByRole('button', { name: 'Edit', exact: true });
    await expect(editButton).toBeVisible();
    await editButton.click();

    // Wait for edit toolbar to appear
    await expect(page.locator('.edit-toolbar')).toBeVisible();
  });

  test('edit toolbar is visible when edit mode is enabled', async ({ page }) => {
    await expect(page.locator('.edit-toolbar')).toBeVisible();
  });

  test('can place black and white setup stones', async ({ page }) => {
    // Click the "AB" toggle to ensure we're in setup mode (not play mode)
    // The toolbar should have a mode toggle button

    // Select black stone tool
    const blackTool = page.locator('.edit-toolbar button[title*="Black"]').first();
    if (await blackTool.isVisible()) {
      await blackTool.click();
    }

    // Place a black setup stone
    await page.locator('.shudan-vertex[data-x="3"][data-y="3"]').click();
    await expect(page.locator('.shudan-vertex[data-x="3"][data-y="3"]')).toHaveClass(
      /shudan-sign_1/
    );

    // Select white stone tool
    const whiteTool = page.locator('.edit-toolbar button[title*="White"]').first();
    if (await whiteTool.isVisible()) {
      await whiteTool.click();
    }

    // Place a white setup stone
    await page.locator('.shudan-vertex[data-x="15"][data-y="3"]').click();
    await expect(page.locator('.shudan-vertex[data-x="15"][data-y="3"]')).toHaveClass(
      /shudan-sign_-1/
    );
  });
});

test.describe('Marker Tools', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.shudan-goban')).toBeVisible();

    // Enable edit mode
    const editButton = page.getByRole('button', { name: 'Edit', exact: true });
    await editButton.click();
    await expect(page.locator('.edit-toolbar')).toBeVisible();
  });

  test('can add triangle marker', async ({ page }) => {
    // Select triangle tool
    const triangleTool = page.locator('.edit-toolbar button[title*="Triangle"]').first();
    await expect(triangleTool).toBeVisible();
    await triangleTool.click();

    // Click on an empty intersection to add triangle marker
    await page.locator('.shudan-vertex[data-x="9"][data-y="9"]').click();

    // Check that a marker was added (look for marker element)
    const marker = page.locator('.shudan-vertex[data-x="9"][data-y="9"] .shudan-marker');
    await expect(marker).toBeVisible();
  });

  test('can add square marker', async ({ page }) => {
    // Select square tool
    const squareTool = page.locator('.edit-toolbar button[title*="Square"]').first();
    await expect(squareTool).toBeVisible();
    await squareTool.click();

    // Click on an empty intersection
    await page.locator('.shudan-vertex[data-x="9"][data-y="9"]').click();

    // Check that a marker was added
    const marker = page.locator('.shudan-vertex[data-x="9"][data-y="9"] .shudan-marker');
    await expect(marker).toBeVisible();
  });

  test('can add circle marker', async ({ page }) => {
    // Select circle tool
    const circleTool = page.locator('.edit-toolbar button[title*="Circle"]').first();
    await expect(circleTool).toBeVisible();
    await circleTool.click();

    // Click on an empty intersection
    await page.locator('.shudan-vertex[data-x="9"][data-y="9"]').click();

    // Check that a marker was added
    const marker = page.locator('.shudan-vertex[data-x="9"][data-y="9"] .shudan-marker');
    await expect(marker).toBeVisible();
  });

  test('can add cross marker', async ({ page }) => {
    // Select cross tool
    const crossTool = page.locator('.edit-toolbar button[title*="Cross"]').first();
    await expect(crossTool).toBeVisible();
    await crossTool.click();

    // Click on an empty intersection
    await page.locator('.shudan-vertex[data-x="9"][data-y="9"]').click();

    // Check that a marker was added
    const marker = page.locator('.shudan-vertex[data-x="9"][data-y="9"] .shudan-marker');
    await expect(marker).toBeVisible();
  });

  test('can add alphabetic label', async ({ page }) => {
    // Select label-alpha tool (ABC button)
    const labelTool = page.locator('.edit-toolbar button[title*="ABC"]').first();
    await expect(labelTool).toBeVisible();
    await labelTool.click();

    // Click on intersections to add labels
    await page.locator('.shudan-vertex[data-x="3"][data-y="3"]').click();

    // Check that a label was added
    const label = page.locator('.shudan-vertex[data-x="3"][data-y="3"] .shudan-marker');
    await expect(label).toBeVisible();
    // First label should be "A"
    await expect(label).toContainText('A');
  });

  test('can add numeric label', async ({ page }) => {
    // Select label-num tool (123 button)
    const labelTool = page.locator('.edit-toolbar button[title*="123"]').first();
    await expect(labelTool).toBeVisible();
    await labelTool.click();

    // Click on intersections to add labels
    await page.locator('.shudan-vertex[data-x="3"][data-y="3"]').click();

    // Check that a label was added
    const label = page.locator('.shudan-vertex[data-x="3"][data-y="3"] .shudan-marker');
    await expect(label).toBeVisible();
    // First label should be "1"
    await expect(label).toContainText('1');
  });

  test('can add multiple sequential labels', async ({ page }) => {
    // Select label-alpha tool (ABC button)
    const labelTool = page.locator('.edit-toolbar button[title*="ABC"]').first();
    await labelTool.click();

    // Add labels at three positions
    await page.locator('.shudan-vertex[data-x="3"][data-y="3"]').click();
    await page.locator('.shudan-vertex[data-x="4"][data-y="3"]').click();
    await page.locator('.shudan-vertex[data-x="5"][data-y="3"]').click();

    // Check sequential labels
    await expect(
      page.locator('.shudan-vertex[data-x="3"][data-y="3"] .shudan-marker')
    ).toContainText('A');
    await expect(
      page.locator('.shudan-vertex[data-x="4"][data-y="3"] .shudan-marker')
    ).toContainText('B');
    await expect(
      page.locator('.shudan-vertex[data-x="5"][data-y="3"] .shudan-marker')
    ).toContainText('C');
  });

  test('can erase markers', async ({ page }) => {
    // First add a triangle marker
    const triangleTool = page.locator('.edit-toolbar button[title*="Triangle"]').first();
    await triangleTool.click();
    await page.locator('.shudan-vertex[data-x="9"][data-y="9"]').click();

    // Verify marker exists
    await expect(
      page.locator('.shudan-vertex[data-x="9"][data-y="9"] .shudan-marker')
    ).toBeVisible();

    // Select erase marker tool
    const eraseTool = page.locator('.edit-toolbar button[title*="Erase"]').first();
    await eraseTool.click();

    // Click on the marked vertex to erase
    await page.locator('.shudan-vertex[data-x="9"][data-y="9"]').click();

    // Marker should be gone
    await expect(
      page.locator('.shudan-vertex[data-x="9"][data-y="9"] .shudan-marker')
    ).not.toBeVisible();
  });
});

test.describe('Edit Mode with Existing Stones', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.shudan-goban')).toBeVisible();
  });

  test('can add markers on stones', async ({ page }) => {
    // First play a stone
    await page.locator('.shudan-vertex[data-x="3"][data-y="3"]').click();
    await expect(page.locator('.shudan-vertex[data-x="3"][data-y="3"]')).toHaveClass(
      /shudan-sign_1/
    );

    // Enable edit mode
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator('.edit-toolbar')).toBeVisible();

    // Select triangle tool
    const triangleTool = page.locator('.edit-toolbar button[title*="Triangle"]').first();
    await triangleTool.click();

    // Add triangle marker on the stone
    await page.locator('.shudan-vertex[data-x="3"][data-y="3"]').click();

    // Stone should still be there with a marker
    await expect(page.locator('.shudan-vertex[data-x="3"][data-y="3"]')).toHaveClass(
      /shudan-sign_1/
    );
    await expect(
      page.locator('.shudan-vertex[data-x="3"][data-y="3"] .shudan-marker')
    ).toBeVisible();
  });
});
