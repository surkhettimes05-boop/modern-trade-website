import { expect, test } from '@playwright/test';

const indexableRoutes = [
  '/', '/shop', '/offers', '/stores', '/about', '/services', '/faq', '/contact',
  '/category/rice', '/product/premium-basmati-rice-5kg',
];

test.describe('SEO release gate', () => {
  for (const route of indexableRoutes) {
    test(`${route} has complete indexable metadata`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page).toHaveTitle(/NOVA MART/);
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(description?.trim().length || 0).toBeGreaterThanOrEqual(40);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(new URL(canonical || 'https://invalid.local').pathname).toBe(route);
      const robots = await page.locator('meta[name="robots"]').getAttribute('content');
      expect(robots || '').not.toContain('noindex');
    });
  }

  test('catalog content and links are present without client JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Shop all products' })).toBeVisible();
    await expect(page.locator('a[href="/product/premium-basmati-rice-5kg"]').first()).toBeVisible();
    await page.goto('/category/rice', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Rice', exact: true })).toBeVisible();
    await context.close();
  });

  test('structured data is valid JSON on entity pages', async ({ page }) => {
    for (const route of ['/', '/shop', '/offers', '/stores', '/faq', '/category/rice', '/product/premium-basmati-rice-5kg']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
      expect(blocks.length, `${route} JSON-LD blocks`).toBeGreaterThan(0);
      for (const block of blocks) expect(() => JSON.parse(block)).not.toThrow();
    }
  });

  test('private routes are noindex', async ({ page }) => {
    for (const route of ['/account', '/cart', '/checkout', '/staff-login', '/loyalty', '/privacy', '/terms']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    }
  });

  test('missing and legacy products use real HTTP status codes', async ({ request }) => {
    const missing = await request.get('/product/does-not-exist-for-seo-test');
    expect(missing.status()).toBe(404);
    const legacy = await request.get('/products/opening-rice-5kg', { maxRedirects: 0 });
    expect(legacy.status()).toBe(308);
    expect(legacy.headers().location).toBe('/product/premium-basmati-rice-5kg');
  });

  test('sitemap includes canonical catalog URLs and excludes private routes', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const xml = await response.text();
    expect(xml).toContain('/category/rice');
    expect(xml).toContain('/product/premium-basmati-rice-5kg');
    const sitemapPaths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
    for (const path of ['/account', '/admin', '/cart', '/checkout', '/privacy', '/terms']) expect(sitemapPaths).not.toContain(path);
  });

  test('every sitemap page is linked within three clicks of the homepage', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text();
    const indexable = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname));
    const visited = new Set<string>();
    let frontier = ['/'];
    for (let depth = 0; depth <= 3 && frontier.length; depth += 1) {
      const next = new Set<string>();
      for (const path of frontier) {
        if (visited.has(path)) continue;
        visited.add(path);
        const response = await request.get(path);
        expect(response.status(), path).toBe(200);
        const html = await response.text();
        for (const match of html.matchAll(/href=["']([^"'#?]+)["']/g)) {
          const linkedPath = new URL(match[1], 'https://storesync.com').pathname;
          if (indexable.has(linkedPath) && !visited.has(linkedPath)) next.add(linkedPath);
        }
      }
      frontier = [...next];
    }
    expect([...indexable].filter((path) => !visited.has(path)), 'orphaned or deep sitemap URLs').toEqual([]);
  });
});
