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

  for (const path of ['/checkout', '/account', '/membership', '/creator', '/r/example']) {
    expect(isClosedCustomerRoute(path)).toBe(true);
    expect(isStaffManagementRoute(path)).toBe(false);
  }

  for (const path of ['/cart', '/whatsapp-order']) {
    expect(isClosedCustomerRoute(path)).toBe(false);
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

test('membership and approved creator portal open only with their production flags', () => {
  const production = { ...process.env, VERCEL_ENV: 'production' };
  expect(isClosedCustomerRoute('/membership', production)).toBe(true);
  expect(isClosedCustomerRoute('/creator', production)).toBe(true);
  expect(isClosedCustomerRoute('/founders', {
    ...production,
    NEXT_PUBLIC_ENABLE_MEMBERSHIP: 'true',
    NEXT_PUBLIC_ENABLE_CREATOR_PORTAL: 'true',
  })).toBe(true);

  const membership = { ...production, NEXT_PUBLIC_ENABLE_MEMBERSHIP: 'true' };
  expect(isClosedCustomerRoute('/membership', membership)).toBe(false);
  expect(shouldBlockBrowseOnlyMutation('/api/membership/enroll', 'POST', membership)).toBe(false);
  expect(shouldBlockBrowseOnlyMutation('/api/membership/admin', 'POST', membership)).toBe(true);

  const creator = { ...production, NEXT_PUBLIC_ENABLE_CREATOR_PORTAL: 'true' };
  expect(isClosedCustomerRoute('/creator', creator)).toBe(false);
  expect(shouldBlockBrowseOnlyMutation('/api/creator-portal/otp/request', 'POST', creator)).toBe(false);
  expect(shouldBlockBrowseOnlyMutation('/api/creator-portal/otp/verify', 'POST', creator)).toBe(false);
  expect(shouldBlockBrowseOnlyMutation('/api/creator-portal/logout', 'POST', creator)).toBe(false);
  expect(shouldBlockBrowseOnlyMutation('/api/creator-portal/overview', 'POST', creator)).toBe(true);
});
