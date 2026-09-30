import { expect, test } from '@playwright/test';

test.describe('security boundaries', () => {
  test('sets browser hardening and private API cache headers', async ({ request }) => {
    const page = await request.get('/');
    expect(page.headers()['x-content-type-options']).toBe('nosniff');
    expect(page.headers()['x-frame-options']).toBe('DENY');
    expect(page.headers()['content-security-policy']).toContain("default-src 'self'");
    expect(page.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(page.headers()['permissions-policy']).toContain('geolocation=(self)');

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

  test('Pasalho proxy keeps customer tokens HttpOnly and forwards authenticated commerce', async ({ request }) => {
    const categories = await request.get(
      '/api/commerce/categories?locationId=33333333-3333-4333-8333-333333333333',
    );
    expect(categories.status()).toBe(200);
    const categoryPayload = await categories.json();
    expect(categoryPayload.data?.[0]?.slug).toBe('instant-noodles');

    const verify = await request.post('/api/commerce/auth/verify-otp', {
      data: {
        challengeId: '55555555-5555-4555-8555-555555555555',
        phone: '9812345678',
        otp: '123456',
      },
    });
    expect(verify.status()).toBe(201);
    const verifyPayload = await verify.json();
    expect(verifyPayload.data?.customer?.phone).toBe('+9779812345678');
    expect(verifyPayload.data?.accessToken).toBeUndefined();
    expect(verifyPayload.data?.refreshToken).toBeUndefined();
    expect(verify.headers()['set-cookie']).toContain('pasalho_customer_access=');
    expect(verify.headers()['set-cookie']).toContain('HttpOnly');

    const me = await request.get('/api/commerce/me');
    expect(me.status()).toBe(200);
    const mePayload = await me.json();
    expect(mePayload.data?.fullName).toBe('QA Pasalho Customer');

    const logout = await request.post('/api/commerce/auth/logout', { data: {} });
    expect(logout.status()).toBe(201);

    const afterLogout = await request.get('/api/commerce/me');
    expect(afterLogout.status()).toBe(401);
  });

});
