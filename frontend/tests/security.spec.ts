import { expect, test } from '@playwright/test';

test.describe('security boundaries', () => {
  test('sets browser hardening and private API cache headers', async ({ request }) => {
    const page = await request.get('/');
    expect(page.headers()['x-content-type-options']).toBe('nosniff');
    expect(page.headers()['x-frame-options']).toBe('DENY');
    expect(page.headers()['content-security-policy']).toContain("default-src 'self'");
    expect(page.headers()['content-security-policy']).toContain("frame-ancestors 'none'");

    const api = await request.get('/api/health/live');
    expect(api.headers()['cache-control']).toContain('no-store');
  });

  test('bounds and validates public web-vitals submissions', async ({ request }) => {
    const valid = await request.post('/api/web-vitals', {
      data: {
        id: 'qa-metric',
        name: 'LCP',
        value: 123,
        delta: 12,
        rating: 'good',
        navigationType: 'navigate',
        path: '/account/orders/00000000-0000-4000-8000-000000000001',
        authorization: 'must-not-be-logged',
      },
    });
    expect(valid.status()).toBe(204);

    const invalid = await request.post('/api/web-vitals', {
      data: { id: 'bad', name: 'UNKNOWN', value: 1, delta: 1, rating: 'good' },
    });
    expect(invalid.status()).toBe(400);

    const oversized = await request.post('/api/web-vitals', {
      data: {
        id: 'large',
        name: 'LCP',
        value: 1,
        delta: 1,
        rating: 'good',
        padding: 'x'.repeat(20 * 1024),
      },
    });
    expect(oversized.status()).toBe(413);
  });
});
