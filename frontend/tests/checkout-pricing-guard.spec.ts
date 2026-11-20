import { expect, test, type Page } from '@playwright/test';

const storeId = '11111111-1111-4111-8111-111111111111';
const sku = 'QA-OIL-1L';

async function mockCheckoutCatalog(page: Page) {
  await page.route('**/api/public/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data: Record<string, unknown[]> = {
      '/api/public/products': [{
        id: '22222222-2222-4222-8222-222222222222',
        sku,
        name: 'QA Soybean Oil 1L',
        price: 60,
        image_url: '/placeholder-product.svg',
        category_name: 'Oil',
        availability_status: 'AVAILABLE',
      }],
      '/api/public/categories': [{ id: '33333333-3333-4333-8333-333333333333', name_en: 'Oil', slug: 'oil' }],
      '/api/public/stores': [{ id: storeId, name: 'QA Birendranagar Store', is_temporarily_closed: false }],
      '/api/public/offers': [],
      '/api/public/campaigns': [],
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data[path] ?? []) });
  });
  await page.route('**/api/auth/session/validate', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/membership/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"membership":null}' }));
  await page.route('**/api/customer-pricing/web/prices', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"prices":[]}' }));
  await page.route('**/api/checkout/service-areas*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ id: 1, name_en: 'QA Municipality', wards: [{ id: 2, ward_number: 1 }] }]),
  }));
}

async function addProductAndChooseDelivery(page: Page) {
  await page.goto('/shop');
  const firstProduct = page.locator('.product-card').first();
  await expect(firstProduct).toBeVisible({ timeout: 15_000 });
  await firstProduct.getByRole('button', { name: 'Add to cart' }).click();
  await page.goto('/checkout');
  await expect(page.getByLabel('Municipality')).toContainText('QA Municipality');
  await page.getByLabel('Municipality').selectOption('1');
  await page.getByLabel('Ward').selectOption('2');
}

test('missing pricing endpoint explains the block without endlessly checking delivery', async ({ page }) => {
  await mockCheckoutCatalog(page);
  let deliveryQuoteRequests = 0;
  await page.route('**/api/customer-pricing/web/quotes', (route) => route.fulfill({
    status: 404,
    contentType: 'text/html',
    body: '<h1>Route not found</h1>',
  }));
  await page.route('**/api/checkout/delivery-quote', (route) => {
    deliveryQuoteRequests += 1;
    return route.fulfill({ status: 500, body: 'unexpected delivery request' });
  });

  await addProductAndChooseDelivery(page);

  await expect(page.getByRole('alert')).toContainText('Checkout pricing is unavailable on this backend.');
  await expect(page.getByText('Delivery pricing will appear when the product price quote is available.')).toBeVisible();
  await expect(page.getByText('Checking delivery availability…')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Place COD order' })).toBeDisabled();
  expect(deliveryQuoteRequests).toBe(0);
});

test('signed quote drives member prices, delivery fee, and checkout eligibility', async ({ page }) => {
  await mockCheckoutCatalog(page);
  let requestedSku = '';
  await page.route('**/api/customer-pricing/web/quotes', async (route) => {
    const body = route.request().postDataJSON() as { store_id: string; items: Array<{ sku: string; quantity: number }> };
    expect(body.store_id).toMatch(/^[0-9a-f-]{36}$/i);
    requestedSku = body.items[0]?.sku || '';
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ quote: {
        quoteId: '44444444-4444-4444-8444-444444444444',
        channel: 'WEB',
        items: [{ sku: requestedSku, quantity: '1', regularUnitPrice: '60.00', appliedUnitPrice: '55.00', lineDiscount: '5.00', lineTotal: '55.00', promotionSnapshot: null }],
        subtotal: '60.00',
        discountTotal: '5.00',
        finalTotal: '55.00',
        currency: 'NPR',
        membershipNumber: 123,
        membershipTier: 'REGISTERED_MEMBER',
        membershipStatus: 'ACTIVE',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        signedQuoteToken: 'qa-test-token-not-valid-for-orders',
      } }),
    });
  });
  await page.route('**/api/checkout/delivery-quote', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ serviceable: true, zone_name: 'QA Delivery Zone', delivery_fee: '15.00', estimated_delivery_hours: 2 }),
  }));

  await addProductAndChooseDelivery(page);

  await expect.poll(() => requestedSku).not.toBe('');
  await expect(page.getByText('Registered member', { exact: false })).toBeVisible();
  await expect(page.getByText('QA Delivery Zone', { exact: false })).toBeVisible();
  await expect(page.getByText(/NPR\s*70(?:\.00)?/).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Place COD order' })).toBeEnabled();
});
