import { expect, test } from '@playwright/test';
import {
  isBrowseOnly,
  isClosedCustomerRoute,
  isStaffManagementApi,
  isStaffManagementRoute,
  shouldBlockBrowseOnlyMutation,
} from '../src/lib/publicLaunch';

test('production preview keeps staff pages reachable without opening customer routes', () => {
  expect(isBrowseOnly({ ...process.env, VERCEL_ENV: 'production' })).toBe(true);

  for (const path of ['/staff-login', '/admin', '/admin/content/campaigns', '/operations/dashboard']) {
    expect(isStaffManagementRoute(path)).toBe(true);
    expect(isClosedCustomerRoute(path)).toBe(false);
  }

  for (const path of ['/checkout', '/cart', '/account', '/membership', '/creator', '/r/example']) {
    expect(isClosedCustomerRoute(path)).toBe(true);
    expect(isStaffManagementRoute(path)).toBe(false);
  }
});

test('only staff API namespaces may mutate during preview', () => {
  for (const path of ['/api/operations-auth/login', '/api/operations-auth/logout', '/api/admin/products', '/api/admin/campaigns']) {
    expect(isStaffManagementApi(path)).toBe(true);
    expect(shouldBlockBrowseOnlyMutation(path, 'POST')).toBe(false);
  }

  for (const path of ['/api/checkout', '/api/orders', '/api/auth/register', '/api/admin-malicious/products', '/api/creator-portal/signup']) {
    expect(isStaffManagementApi(path)).toBe(false);
    expect(shouldBlockBrowseOnlyMutation(path, 'POST')).toBe(true);
    expect(shouldBlockBrowseOnlyMutation(path, 'GET')).toBe(false);
  }
});
