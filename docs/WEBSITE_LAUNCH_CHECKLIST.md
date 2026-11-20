# Pasalho Website Launch Checklist

## Environment variables

- Backend: DATABASE_URL, JWT_SECRET, COOKIE_SECRET, CORS_ORIGIN, TRUST_PROXY_HOPS, REDIS_URL, session and OTP provider configuration.
- Frontend: API origin/proxy configuration and public/base URLs.
- Keep ENABLE_ADMIN_API, ENABLE_ELECTRONIC_PAYMENTS, and deferred return/refund flags disabled for the COD-only launch unless explicitly re-approved.
- Use Asia/Kathmandu, Nepal country code NP, and NPR.
- Replace every example/sandbox secret with environment-managed production or staging secrets.

## Database migrations

- Apply migrations 001-018, 020-050 in manifest order.
- Review migration 050 before application; it backfills legacy COD lifecycle states and adds batch_inventory quantity >= 0.
- Preflight batch_inventory for negative quantities and resolve/restore them before migration.
- Run migration runner once, verify schema_migrations, and rerun for idempotency.
- Use a transaction-capable staging database copy and a rollback-capable backup.

## Backend deployment requirements

- Node 22.x; PostgreSQL; Redis; production database role with least privilege.
- Run database role/security verification, build, unit tests, and migration verification.
- Enable CORS only for approved frontend origins.
- Enable secure cookies behind HTTPS and validate proxy trust.
- Enforce CSRF for mutations and retain customer/staff session separation.
- Keep COD-only payment behavior: PENDING payment then PAID only on confirmed delivered cash collection.

## Frontend deployment requirements

- Node 22.x and Next.js standalone build.
- Verify API rewrites/proxies preserve x-csrf-token and cookies.
- Verify catalog, search, cart persistence, checkout, order history, and tracking routes.
- Verify there are no visible eSewa, Khalti, Fonepay, card, or returns UI paths.
- Run desktop/mobile Playwright smoke tests.

## Authentication configuration

- Verify OTP SMS provider or explicitly keep development OTP disabled.
- Verify customer session max age, cookie Secure/SameSite, CSRF cookie, logout, and session validation.
- Verify staff MFA/MFA capability requirements for privileged administration.

## Production configuration risks

- Do not expose development OTP responses.
- Do not enable electronic payment feature flags.
- Do not enable deferred returns/refunds.
- Validate store IDs, delivery zones, Nepal geography IDs, opening inventory, and NPR prices.
- Confirm base/shipping fees and tax settings before launch.

## Monitoring

- API latency, 4xx/5xx rates, checkout failures, duplicate submissions, database pool saturation.
- Redis availability and rate-limit failures.
- OTP delivery failures and session/auth failures.
- Negative inventory attempts, stock reservation expirations, cancellation releases, and delivery deductions.
- Order lifecycle invalid-transition attempts and COD settlement discrepancies.

## Rollback procedure

1. Stop new deployments and route traffic to the last known-good backend/frontend.
2. Preserve database and application logs before rollback.
3. Restore the previous application images/workers.
4. Do not reverse migration 050 while launch orders or normalized lifecycle data exist unless DBA-reviewed.
5. Re-run migration/status and smoke checks.
6. Confirm carts and received COD orders remain readable.

## Outstanding blockers

- [ ] Clean/staging database migration replay.
- [ ] Real staging catalog and inventory data.
- [ ] Real delivery zones and store fulfillment assignments.
- [ ] OTP/SMS provider staging credentials.
- [ ] Frontend Playwright registration-to-tracking run.
- [ ] Operations and COD cash settlement staging run.
- [ ] Monitoring/alert destinations configured.
