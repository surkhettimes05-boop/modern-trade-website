# Phase 02 — Staff Authentication and Authorization

## Objective

Make admin and operations access secure, session-backed, and capability-aware.

## Work packages

- [x] Repair `/api/operations-auth/session` to match canonical tables and columns.
- [x] Decide whether an organization domain is required; implement or remove assumptions.
- [x] Add an idempotent `bootstrap-admin` command with strong password validation.
- [x] Audit administrator bootstrap and reject production defaults.
- [x] Build a frontend session provider.
- [x] Protect `/admin/**` and `/operations/**`.
- [x] Redirect missing/expired sessions to staff login.
- [x] Render forbidden state for insufficient capabilities.
- [x] Filter navigation by capabilities without relying on UI filtering for security.
- [x] Implement session rotation, revocation, idle expiry, and lockout.
- [x] Add CSRF protection for cookie-authenticated mutations.
- [x] Connect real staff/store/role/shift data to layouts.

## Required tests

- [x] Valid login and logout
- [x] Invalid credentials and lockout
- [x] Expired and revoked session
- [x] Admin allowed; normal staff denied
- [x] Store scope isolation
- [x] CSRF rejection
- [ ] Browser redirect/forbidden flows

## Acceptance gate

- [x] Fresh administrator can be securely bootstrapped and sign in.
- [x] Protected pages cannot render without a valid session.
- [x] Server-side capability and scope checks cover protected operations routes; full mutation-by-mutation route audit remains a Phase 09/11 gate.

The browser redirect/forbidden flow remains pending automated browser verification. See `implementation/RELEASE_RISKS.md` for the carried risk.
