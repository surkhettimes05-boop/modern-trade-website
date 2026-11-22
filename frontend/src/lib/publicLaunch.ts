// The public Vercel production site stays browse-only until a separately
// approved release unlocks sign-up and ordering. Preview/QA remain testable.
export function isBrowseOnly(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === 'production' || env.PASALHO_BROWSE_ONLY === 'true';
}

export function isClosedCustomerRoute(pathname: string): boolean {
  // The local cart only prepares a manual WhatsApp request. Online checkout,
  // accounts, and customer enrollment remain closed until separately approved.
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

export function shouldBlockBrowseOnlyMutation(pathname: string, method: string): boolean {
  return pathname.startsWith('/api/') &&
    !['GET', 'HEAD', 'OPTIONS'].includes(method) &&
    !isStaffManagementApi(pathname);
}
