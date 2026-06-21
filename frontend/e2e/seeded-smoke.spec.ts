import { expect, test } from '@playwright/test';

const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:3000';

test('manager can log in and see seeded demo data', async ({ page }) => {
  await page.goto(`${baseUrl}/auth`);
  await page.locator('input[type="email"]').fill('manager@example.com');
  await page.locator('input[type="password"]').fill('Test123!');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/($|setup$)/, { timeout: 15_000 });

  await page.goto(`${baseUrl}/customers`);
  await expect(page.getByText('Modern Building Company').first()).toBeVisible();
  await expect(page.getByText('Ahmad Mansour').first()).toBeVisible();

  await page.goto(`${baseUrl}/orders`);
  await expect(page.getByText('Modern Building Renovation Demo').first()).toBeVisible();
  await expect(page.locator('tbody').getByText('Modern Building Company').first()).toBeVisible();

  await page.goto(`${baseUrl}/employees`);
  await expect(page.getByText('Lena Weber').first()).toBeVisible();
  await expect(page.getByText('Omar Khaled').first()).toBeVisible();

  await page.goto(`${baseUrl}/workshops`);
  await expect(page.getByText('Levant Paint & Finish').first()).toBeVisible();
  await expect(page.getByText('Damascus Tile Studio').first()).toBeVisible();

  await page.goto(`${baseUrl}/work-entries`);
  await expect(page.locator('tbody').getByText('Lena Weber').first()).toBeVisible();
  await expect(page.locator('tbody').getByText('Second floor bathroom').first()).toBeVisible();

  await page.goto(`${baseUrl}/invoices`);
  await expect(page.getByText('RE 26-0001').first()).toBeVisible();
  await expect(page.getByText('Modern Building Company').first()).toBeVisible();
});
