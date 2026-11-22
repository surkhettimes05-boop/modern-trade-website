import { expect, test } from '@playwright/test';

if (process.env.PASALHO_CHROMIUM_PATH) {
  test.use({ launchOptions: { executablePath: process.env.PASALHO_CHROMIUM_PATH } });
}

// Preview-only regression: exercise the customer-facing catalogue with a known
// incomplete import, without touching the actual Neon or Render resources.
test.describe('public catalogue preview', () => {
  test.skip(process.env.PASALHO_BROWSE_ONLY !== 'true', 'Requires PASALHO_BROWSE_ONLY=true on the web server');

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/public/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const response = path.endsWith('/products') ? [{
        id: 'preview-soybean', name: 'Soybean', sku: 'PUL-015', category_name: 'Pulses',
        description: 'Test catalog / stock import', price: 60, original_price: 80,
        availability_status: 'AVAILABLE',
      }] : path.endsWith('/categories') ? [{ id: 'pulses', name: 'Pulses', slug: 'pulses' }]
        : path.endsWith('/stores') ? [{ id: 'store-1', name: 'PASALHO Birendranagar' }]
          : path.endsWith('/campaigns') ? [{ id: 'test-hero', title_en: 'preety swestka offer', placements: ['HOME_HERO'] }]
            : [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
    });
  });

  test('hides unverified campaign, discounts and availability claims', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Discover PASALHO, closer to home.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'preety swestka offer' })).toHaveCount(0);
    await expect(page.getByText('LIVE OFFERS')).toHaveCount(0);
    await expect(page.getByText('Cash on delivery · Store pickup')).toHaveCount(0);
    await expect(page.getByText('Catalogue preview · WhatsApp requests only')).toBeVisible();

    await page.goto('/shop');
    const productCards = page.locator('.product-card');
    await expect(productCards.first()).toBeVisible();
    const stockLabels = page.locator('.product-card .stock');
    await expect(stockLabels.first()).toHaveText('Indicative price · Stock not yet confirmed');
    for (const stockLabel of await stockLabels.all()) {
      await expect(stockLabel).toHaveText('Indicative price · Stock not yet confirmed');
    }
    await expect(page.locator('.product-card .deal-badge')).toHaveCount(0);
    await expect(page.locator('.product-card .price-row del')).toHaveCount(0);

    const productHref = await productCards.first().locator('a').first().getAttribute('href');
    expect(productHref).toMatch(/^\/product\//);
    await page.goto(productHref!);
    const detailRequestButton = page.locator('.buy-box').getByRole('button', { name: 'Add to WhatsApp request' });
    await expect(detailRequestButton).toBeVisible();
    await page.getByRole('button', { name: 'Increase quantity' }).first().click();
    await expect(page.locator('.buy-box .quantity.standalone span')).toHaveText('2');
    await detailRequestButton.click();
    await expect(page.getByRole('dialog', { name: /Cart/ })).toBeVisible();
    await page.getByRole('link', { name: 'Prepare WhatsApp request' }).click();
    await expect(page).toHaveURL(/\/whatsapp-order$/);
    await expect(page.getByRole('heading', { name: 'Order through WhatsApp' })).toBeVisible();

    await page.goto('/checkout');
    await expect(page).toHaveURL(/\/launch-info/);
    await expect(page.getByText('29 practical departments')).toHaveCount(0);
  });

  test('keeps unpublished offers off the preview page', async ({ page }) => {
    await page.goto('/offers');
    await expect(page.getByRole('heading', { name: 'Offers are opening later' })).toBeVisible();
    await expect(page.getByText('preety swestka offer')).toHaveCount(0);
    await expect(page.locator('main').getByRole('link', { name: 'Browse published products' })).toBeVisible();
  });
});
