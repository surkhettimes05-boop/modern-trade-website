import { expect, test } from '@playwright/test';

test('creator dashboard displays a first-party QR for the exact referral URL', async ({ page }) => {
  const referralUrl = 'https://pasalho.example/r/creator-42';
  await page.route('**/api/creator-portal/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ creator: {
      id: 'creator-id', code: 'CRT-42', name: 'Test Creator',
      phone_masked: '••••••1234', referral_slug: 'creator-42', referral_url: referralUrl,
    } }),
  }));
  await page.route('**/api/creator-portal/overview', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      summary: {
        clicks: 0, registrations: 0, purchases: 0, purchasing_customers: 0,
        attributed_sales_npr: '0', gross_rewards_npr: '0', verified_cogs_npr: '0',
        purchases_missing_cogs: 0, contribution_after_cogs_and_rewards_npr: null,
      },
      ledger: { balance_npr: '0', earned_npr: '0', reversed_npr: '0', paid_npr: '0' },
      purchases: [], profitability_status: 'NOT_AVAILABLE',
    }),
  }));

  await page.goto('/creator');
  await expect(page.getByText(referralUrl)).toBeVisible();
  await expect(page.locator('svg').filter({ has: page.locator('title:text-is("Creator referral QR code")') })).toBeVisible();
  await expect(page.locator('a[href*="qrserver.com"]')).toHaveCount(0);
});

test('creator dashboard does not produce a QR with a missing website URL', async ({ page }) => {
  await page.route('**/api/creator-portal/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ creator: {
      id: 'creator-id', code: 'CRT-42', name: 'Test Creator',
      phone_masked: '••••••1234', referral_slug: 'creator-42', referral_url: '',
    } }),
  }));
  await page.route('**/api/creator-portal/overview', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      summary: {
        clicks: 0, registrations: 0, purchases: 0, purchasing_customers: 0,
        attributed_sales_npr: '0', gross_rewards_npr: '0', verified_cogs_npr: '0',
        purchases_missing_cogs: 0, contribution_after_cogs_and_rewards_npr: null,
      },
      ledger: { balance_npr: '0', earned_npr: '0', reversed_npr: '0', paid_npr: '0' },
      purchases: [], profitability_status: 'NOT_AVAILABLE',
    }),
  }));

  await page.goto('/creator');
  await expect(page.getByText('Referral link is not configured yet.')).toBeVisible();
  await expect(page.locator('svg').filter({ has: page.locator('title:text-is("Creator referral QR code")') })).toHaveCount(0);
});
