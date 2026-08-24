# Production route security boundaries

This document covers only plugins registered by `backend/src/index.ts`. The
many deferred route modules in the repository are not production attack
surface unless their guarded feature flag is certified and enabled.

| Plugin | Boundary | Enforcement |
| --- | --- | --- |
| `healthRoutes` | Public read-only | No secret diagnostics in production; readiness exposes status only |
| `publicRoutes` | Public validated mutation | Strict schemas, bounded queries/bodies, rate-limited contact submission |
| `authRoutes` | Mixed explicit | Public OTP request/verify; authenticated session/logout/revocation; customer CSRF on mutations |
| `shoppingCartRoutes` | Customer session | Plugin-level customer authentication/CSRF; database ownership checks |
| `checkoutRoutes` | Customer session | Plugin-level customer authentication/CSRF; server-derived identity/pricing and transactional stock checks |
| `addressRoutes` | Mixed explicit | Per-route customer ownership; privileged MFA for verification; public administrative-division reads |
| `loyaltyMvpRoutes` | Mixed explicit | Customer self-service or staff session/capability/CSRF per route |
| `paymentWebhookRoutes` | Signed webhook | Disabled until certified; raw bounded body and provider signature verification |
| `operationsAuthRoutes` | Mixed explicit | Rate-limited login; revocable staff session; CSRF on logout |
| `protectedOperations` | Staff session | Plugin-wide staff authentication, CSRF, capability, store scope, and target-resource resolution |
| `webOrderRoutes` | Staff session | Plugin-wide staff authentication/CSRF, capability, and authoritative store scope |
| `privilegedAdministration` | Privileged staff MFA | Plugin-wide system capability, verified MFA, CSRF, and audit actor binding |

`productionRouteSecurity.test.ts` compares this policy registry with every
plugin registration in the production entrypoint. Adding a plugin without a
reviewed classification fails the unit security gate.

## Change rule

Every new route must document authentication, authorization capability,
ownership resolver, CSRF behavior, rate/resource limits, sensitive response
fields, and applicable feature flag. Every object route needs negative tests
for unauthenticated, cross-user, cross-store, and ordinary-user-to-admin access
as applicable.
