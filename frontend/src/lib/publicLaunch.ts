// Public production can opt into the narrowly scoped COD checkout pilot while
// keeping unrelated customer features behind their existing launch gates.
export function isBrowseOnly(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === 'production' || env.PASALHO_BROWSE_ONLY === 'true';
}

export function isWebsiteCheckoutEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NEXT_PUBLIC_ENABLE_WEB_CHECKOUT === 'true';
}

export function isMembershipPortalEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NEXT_PUBLIC_ENABLE_MEMBERSHIP === 'true';
}

export function isCreatorPortalEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NEXT_PUBLIC_ENABLE_CREATOR_PORTAL === 'true';
}

export function isClosedCustomerRoute(
  pathname: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isWebsiteCheckoutEnabled(env) && /^\/(?:checkout|account)(?:\/|$)/.test(pathname)) return false;
  if (isMembershipPortalEnabled(env) && pathname === '/account') return false;
  if (isMembershipPortalEnabled(env) && /^\/membership(?:\/|$)/.test(pathname)) return false;
  if (isCreatorPortalEnabled(env) && /^\/creator(?:\/|$)/.test(pathname)) return false;
  return /^\/(?:checkout|account|membership|creator|founders|loyalty|r)(?:\/|$)/.test(pathname);
}

// Staff pages must remain reachable in production preview mode. They redirect
// unauthenticated users to staff sign-in, and the backend enforces staff auth,
// CSRF and capabilities before processing any management mutation.
export function isStaffManagementRoute(pathname: string): boolean {
  return /^\/(?:admin|operations|staff-login)(?:\/|$)/.test(pathname);
}

// Manual WhatsApp requests are prepared entirely in the browser. Keep every
// customer API mutation blocked; only staff-authenticated API routes pass.
export function isStaffManagementApi(pathname: string): boolean {
  return (
    /^\/api\/(?:admin|operations-auth)(?:\/|$)/.test(pathname) ||
    /^\/api\/web-orders\/[^/]+\/(?:status|payment-status|cancel|cod-settlement|fulfillment\/assign)$/.test(
      pathname,
    )
  );
}

export function shouldBlockBrowseOnlyMutation(
  pathname: string,
  method: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const webCheckoutApi =
    (method === 'POST' &&
      /^\/api\/(?:auth\/(?:otp\/(?:request|verify)|google(?:\/link)?)|customer-pricing\/web\/quotes|checkout\/(?:cart\/validate|delivery-quote|cod)|shopping-cart|addresses)$/.test(
        pathname,
      )) ||
    (method === 'PUT' &&
      /^\/api\/shopping-cart\/[0-9a-f-]+\/items$/i.test(pathname));
  const membershipApi = isMembershipPortalEnabled(env) &&
    method === 'POST' && /^\/api\/(?:membership\/enroll|auth\/otp\/(?:request|verify))$/.test(pathname);
  const creatorPortalApi = isCreatorPortalEnabled(env) &&
    method === 'POST' &&
    /^\/api\/creator-portal\/(?:otp\/(?:request|verify)|logout)$/.test(pathname);
  return pathname.startsWith('/api/') &&
    !['GET', 'HEAD', 'OPTIONS'].includes(method) &&
    !isStaffManagementApi(pathname) &&
    !(isWebsiteCheckoutEnabled(env) && webCheckoutApi) &&
    !membershipApi &&
    !creatorPortalApi;
}
