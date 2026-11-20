// The public Vercel production site stays browse-only until a separately
// approved release unlocks sign-up and ordering. Preview/QA remain testable.
export function isBrowseOnly(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === 'production' || env.PASALHO_BROWSE_ONLY === 'true';
}

export function isClosedCustomerRoute(pathname: string): boolean {
  return /^\/(?:checkout|cart|whatsapp-order|account|membership|creator|founders|loyalty|r|admin|operations|staff-login)(?:\/|$)/.test(pathname);
}
