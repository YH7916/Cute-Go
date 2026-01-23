/**
 * Gameplay tests - playing moves on the board
 */

import { test, expect } from '@playwright/test';

test.setTimeout(15000);

test.describe('Playing Moves', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for board to be ready
    await expect(page.locator('.shudan-goban')).toBeVisible();
  });

  test('can place a stone by clicking on the board', async ({ page }) => {
    // Click on vertex (3, 3) - D4 corner position
    const vertex = page.locator('.shudan-vertex[data-x="3"][data-y="3"]');
    await expect(vertex).toBeVisible();
    await vertex.click();

    // Verify a black stone was placed (black plays first)
    await expect(vertex).toHaveClass(/shudan-sign_1/);
  });

  test('can play alternating black and white stones', async ({ page }) => {
    // First move: Black at D4
    const vertex1 = page.locator('.shudan-vertex[data-x="3"][data-y="3"]');
    await vertex1.click();
    await expect(vertex1).toHaveClass(/shudan-sign_1/);

    // Second move: White at Q16
    const vertex2 = page.locator('.shudan-vertex[data-x="15"][data-y="3"]');
    await vertex2.click();
    await expect(vertex2).toHaveClass(/shudan-sign_-1/);

    // Third move: Black at D16
    const vertex3 = page.locator('.shudan-vertex[data-x="3"][data-y="15"]');
    await vertex3.click();
    await expect(vertex3).toHaveClass(/shudan-sign_1/);
  });

  test('cannot place stone on occupied intersection', async ({ page }) => {
    // Place a black stone at D4
    const vertex = page.locator('.shudan-vertex[data-x="3"][data-y="3"]');
    await vertex.click();
    await expect(vertex).toHaveClass(/shudan-sign_1/);

    // Try to click on the same spot - should still be black (not white)
    await vertex.click();
    await expect(vertex).toHaveClass(/shudan-sign_1/);
    // Should NOT have white stone
    await expect(vertex).not.toHaveClass(/shudan-sign_-1/);
  });

  test('can play multiple moves and navigate back', async ({ page }) => {
    // Play 3 moves
    await page.locator('.shudan-vertex[data-x="3"][data-y="3"]').click();
    await page.locator('.shudan-vertex[data-x="15"][data-y="3"]').click();
    await page.locator('.shudan-vertex[data-x="3"][data-y="15"]').click();

    // Navigate back with left arrow
    await page.keyboard.press('ArrowLeft');

    // The third stone should no longer be visible on the board
    // (we're now at move 2)
    const vertex3 = page.locator('.shudan-vertex[data-x="3"][data-y="15"]');
    await expect(vertex3).toHaveClass(/shudan-sign_0/);

    // Navigate forward
    await page.keyboard.press('ArrowRight');

    // Stone should be back
    await expect(vertex3).toHaveClass(/shudan-sign_1/);
  });

  test('can use Home and End to navigate to start/end', async ({ page }) => {
    // Play a few moves
    await page.locator('.shudan-vertex[data-x="3"][data-y="3"]').click();
    await page.locator('.shudan-vertex[data-x="15"][data-y="3"]').click();
    await page.locator('.shudan-vertex[data-x="3"][data-y="15"]').click();

    // Go to beginning
    await page.keyboard.press('Home');

    // All stones should be gone (empty board)
    await expect(page.locator('.shudan-vertex[data-x="3"][data-y="3"]')).toHaveClass(
      /shudan-sign_0/
    );
    await expect(page.locator('.shudan-vertex[data-x="15"][data-y="3"]')).toHaveClass(
      /shudan-sign_0/
    );
    await expect(page.locator('.shudan-vertex[data-x="3"][data-y="15"]')).toHaveClass(
      /shudan-sign_0/
    );

    // Go to end
    await page.keyboard.press('End');

    // All stones should be visible again
    await expect(page.locator('.shudan-vertex[data-x="3"][data-y="3"]')).toHaveClass(
      /shudan-sign_1/
    );
    await expect(page.locator('.shudan-vertex[data-x="15"][data-y="3"]')).toHaveClass(
      /shudan-sign_-1/
    );
    await expect(page.locator('.shudan-vertex[data-x="3"][data-y="15"]')).toHaveClass(
      /shudan-sign_1/
    );
  });
});

test.describe('Stone Capture', () => {
  test('can capture a single stone', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.shudan-goban')).toBeVisible();

    // Create a capture scenario:
    // White stone at E5 surrounded by black stones at D5, F5, E4, E6

    // Black D5 (x=3, y=4)
    await page.locator('.shudan-vertex[data-x="3"][data-y="4"]').click();

    // White E5 (x=4, y=4) - this will be captured
    await page.locator('.shudan-vertex[data-x="4"][data-y="4"]').click();

    // Black F5 (x=5, y=4)
    await page.locator('.shudan-vertex[data-x="5"][data-y="4"]').click();

    // White tenuki Q16
    await page.locator('.shudan-vertex[data-x="15"][data-y="3"]').click();

    // Black E4 (x=4, y=3)
    await page.locator('.shudan-vertex[data-x="4"][data-y="3"]').click();

    // White tenuki Q4
    await page.locator('.shudan-vertex[data-x="15"][data-y="15"]').click();

    // Black E6 (x=4, y=5) - capturing move
    await page.locator('.shudan-vertex[data-x="4"][data-y="5"]').click();

    // The white stone at E5 should be captured (empty now)
    await expect(page.locator('.shudan-vertex[data-x="4"][data-y="4"]')).toHaveClass(
      /shudan-sign_0/
    );
  });
});
