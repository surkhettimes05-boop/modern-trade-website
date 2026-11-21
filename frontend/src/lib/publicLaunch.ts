// The public Vercel production site stays browse-only until a separately
// approved release unlocks sign-up and ordering. Preview/QA remain testable.
export function isBrowseOnly(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === 'production' || env.PASALHO_BROWSE_ONLY === 'true';
}

export function isClosedCustomerRoute(pathname: string): boolean {
  return /^\/(?:checkout|cart|whatsapp-order|account|membership|creator|founders|loyalty|r)(?:\/|$)/.test(pathname);
}

// Staff pages must remain reachable in production preview mode. They redirect
// unauthenticated users to staff sign-in, and the backend enforces staff auth,
// CSRF and capabilities before processing any management mutation.
export function isStaffManagementRoute(pathname: string): boolean {
  return /^\/(?:admin|operations|staff-login)(?:\/|$)/.test(pathname);
}

// Do not lift the browse-only restriction for customer checkout or registration.
// This is an explicit allowlist of staff-authenticated API namespaces.
export function isStaffManagementApi(pathname: string): boolean {
  return /^\/api\/(?:admin|operations-auth)(?:\/|$)/.test(pathname);
}

export function shouldBlockBrowseOnlyMutation(pathname: string, method: string): boolean {
  return pathname.startsWith('/api/') &&
    !['GET', 'HEAD', 'OPTIONS'].includes(method) &&
    !isStaffManagementApi(pathname);
}
