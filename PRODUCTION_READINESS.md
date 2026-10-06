# Nepal COD release review — 2026-10-06

**Decision: NOT READY for live orders until the verification gates below pass.**
This report supersedes historical blocker lists; old PASS entries are not evidence
for this revision. Scope: NP / NPR / Asia/Kathmandu / IRD configuration, customer
COD and staff CASH only. IRD configuration does not certify fiscal compliance.

## Changes and why

- Production now requires an SMS provider and complete credentials. Render defaults
  to Twilio Verify. Explicit Twilio configuration works in development/staging too;
  provider errors never silently fall back to a local OTP. SMS error bodies are not
  copied into exceptions. Configured demo codes are never exposed by the API.
- Both checkout clients replace their cart snapshot in one authenticated,
  CSRF-protected transaction. Retrying this operation cannot double quantities or
  leave a partially synchronized cart. Backend derives prices and zero discounts.
- Concurrent requests with the same checkout key serialize before checking for an
  existing order. Unpublished products cannot silently disappear from checkout.
- Cart item reads use the actual product name column. Cart updates calculate totals
  from the NEW quantity/price, reset discounts, and respect price validity dates.
- Order reservations remain active until fulfilled/cancelled, including when staff
  take more than 30 minutes. Cancel stale/unfulfillable orders operationally.
- Delivery serializes with checkout/POS inventory access, deducts batches, and appends
  immutable inventory evidence. Migration 032 protects COD and cash-POS evidence.
- Cash POS drafts recalculate prices on the server in one transaction, require an
  idempotency key, and enforce NPR/CASH. Completion locks inventory and preserves
  online reservations; repeated completion cannot deduct twice. Completed sale
  void/return is deliberately blocked in this pilot (returns remain disabled).
- Readiness now requires migration 032; it previously checked only 030 despite 031
  already being in the manifest. Existing DB/Redis/shutdown readiness checks remain.
- Proxy network failures return 503 instead of pretending catalogs are empty or
  sessions are invalid. Host-only Secure/Lax cookies and CSRF controls are preserved.
- Production bootstrap uses explicit real business values and stable UUIDs, creates
  only a CLOSED/DRAFT store and Nepal geography, and can be repeated. It does not
  invent stock, prices, customers, credentials, delivery fees, or live service areas.
  Admin bootstrap requires an explicit store and email in production.
- Separate Flutter repository uses municipality/ward IDs, service areas and delivery
  quotes, removes city/state from strict checkout payloads, and uses atomic cart PUT.

## Remaining launch gates

1. Run the entire backend PostgreSQL suite on Node 22 and migration 032 from a clean
   database AND an upgraded copy. Test runtime role grants, bootstrap twice, and
   immutability denial. No historical tests substitute for this run.
2. Run Flutter analyze/tests and signed Android build. Flutter execution was blocked
   in this workspace by automatic approval review because the tool contacted a cloud
   instance metadata endpoint. No bypass was attempted. Run existing Codemagic gates
   in the trusted build environment; the changed mobile code is not runtime-certified.
3. Real Twilio delivery to Nepal numbers: success, incorrect/expired/reused code,
   resend/attempt limits, provider outage, and no OTP/PII in logs. Credentials and
   successful delivery were not provided or verified here.
4. Deploy backend/frontend, then test desktop/mobile browsers: OTP → cart snapshot →
   COD order → tracking → staff fulfillment → recorded cash → inventory/loyalty.
   Verify ownership denial, missing CSRF, cancellation, timeouts, duplicate checkout,
   concurrent last-item orders, POS versus reserved stock, and replayed completion.
5. Confirm real catalog prices, physically counted stock, correct legal identity,
   published store, active actual delivery wards/fees, and staff coverage. Migrations
   contain historical demo business records: review/quarantine them before publishing.
   Never run development_seed.sql on production.
6. Verify rate-limit client isolation through Vercel → Render, including forged and
   expired identity headers. Vercel signs the edge-supplied IP with PROXY_AUTH_SECRET;
   Render verifies it before selecting the rate bucket. Unsigned/invalid identities
   retain ordinary backend IP limits. Never forward untrusted X-Forwarded-For.
7. Prove backup restore, rollback, TLS, alert delivery, persistent data, and operator
   cash reconciliation. Obtain Nepal invoice/tax review. No deployment was performed.

## Render → Vercel deployment (exact sequence)

1. Review/merge both readiness branches after CI passes. Pin the resulting SHAs.
   Deploy the backend first: the new clients require `PUT /api/shopping-cart/:cartId/items`.
2. Use Node **22**, managed PostgreSQL and Redis in the same region. The committed
   Render Blueprint remains `free` to avoid silently changing billing. For customer
   traffic select an always-on paid Web Service and persistent Key Value. Free web
   services sleep after 15 minutes, cold starts take about a minute, free Key Value
   loses data on restart, and free Render PostgreSQL expires after 30 days.
   See https://render.com/docs/free and https://render.com/docs/key-value .
3. As DB owner, run `psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/production_roles.sql`.
   Set separate random passwords for storesync_app and storesync_migrator using the
   provider secret console. This script transfers existing application ownership;
   back up existing production data before running it.
4. In an isolated release job/check-out, install/build backend:
   `npm ci --prefix backend` then `npm run build --prefix backend`.
   Load `backend/.env.migration.example` securely; set NODE_ENV=production,
   MIGRATION_DATABASE_URL to storesync_migrator, and durable DATABASE_BACKUP_DIR.
   From `backend/`, run `node dist/database/deployMigrate.js`. It backs up first;
   pg_dump must be installed and compatible with the PostgreSQL server. Preserve the
   dump off the ephemeral filesystem. Repeat migrations and verify no extra changes.
5. Supply real values in a private psql variable file or shell environment. From the
   repository root run (IDs are newly generated UUIDs, saved for subsequent runs):

   ```sh
   psql "$BOOTSTRAP_DATABASE_URL" -v ON_ERROR_STOP=1 \
     -v organization_id="$ORGANIZATION_ID" -v store_id="$STORE_ID" \
     -v organization_name="$ORGANIZATION_NAME" -v legal_name="$LEGAL_NAME" \
     -v store_name="$STORE_NAME" -v store_address="$STORE_ADDRESS" \
     -v store_phone="$STORE_PHONE" -f database/production_bootstrap.sql
   ```

   BOOTSTRAP_DATABASE_URL is the controlled migrator connection. Reuse the SAME IDs
   on rerun. Do not overwrite an existing business identity using different values.
6. Create one admin in the isolated backend job with DATABASE_URL=storesync_app,
   DATABASE_SSL=true and provider TLS settings, NODE_ENV=production,
   BOOTSTRAP_STORE_ID=$STORE_ID, BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_EMAIL,
   BOOTSTRAP_ADMIN_PASSWORD (unique, 12+ characters with upper/lower/number/symbol).
   Run `node dist/database/bootstrapAdmin.js`. Re-running rotates that username's
   password; do not use another employee's username. Remove bootstrap variables.
7. Create Render Blueprint or Docker Web Service: repository root context,
   `backend/Dockerfile`, Singapore, health path `/api/health/ready`.
   Load ALL keys from `backend/.env.production.example`; `render.yaml` supplies
   market constants and disabled feature flags. Set:

   | Setting | Value |
   |---|---|
   | DATABASE_URL | storesync_app connection, never owner/migrator |
   | DATABASE_RUNTIME_ROLE / DATABASE_MIGRATION_ROLE | storesync_app / storesync_migrator |
   | REQUIRE_LEAST_PRIVILEGE_DATABASE_ROLE | true |
   | DATABASE_SSL | true; use provider CA verification where supported |
   | REDIS_URL | private Render connection or rediss public TLS |
   | CORS_ORIGIN and APP_URL | identical exact `https://your-production-frontend` origins, no trailing slash |
   | JWT_SECRET, COOKIE_SECRET, ENCRYPTION_KEY, SIGNATURE_SECRET, OTP_HASH_SECRET | independent random 32+ byte values |
   | PAYMENT_ENCRYPTION_KEY | independent 64-character hex value, even with payments disabled |
   | PROXY_AUTH_SECRET | independent random 32+ byte secret, IDENTICAL in Render and Vercel server environment |
   | SMS_PROVIDER | twilio_verify |
   | TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_VERIFY_SERVICE_SID | private real Twilio credentials |

   Keep MIGRATION_DATABASE_URL and bootstrap secrets OFF the runtime. Run
   `node dist/database/verifyDatabaseRole.js` in the runtime environment. Do not
   disable role checks to make deployment green. A failed check is a blocker.
8. Configure a Twilio Verify service with six-digit SMS codes, Nepal destination
   permissions and an account authorized to send to the pilot numbers. Verify actual
   delivery and account/trial restrictions. TWILIO_FROM_NUMBER is not needed for
   Verify. See https://www.twilio.com/docs/verify/api and
   https://www.twilio.com/docs/verify/api/verification-check .
9. Confirm Render `/api/health/ready` returns HTTP 200 with database=ok,
   migrations=current, redis=ok. It confirms dependencies/schema, NOT SMS delivery
   or sufficient inventory. Do not use `/api/health` alone as a launch gate.
10. Vercel: use repository root and **Services** framework for the committed
    `vercel.json` (frontend service root `frontend/`). Alternatively import a
    standalone Next.js project with Root Directory `frontend` and its normal build.
    Do not mix these configurations. Set Node 22 and server-only
    `API_URL=https://your-render-service.onrender.com` with no `/api` suffix.
    Keep API_UPSTREAM_TIMEOUT_MS=20000 and NEXT_PUBLIC_REQUEST_TIMEOUT_MS=25000
    (the new defaults) so the web request can outlast Twilio's 15-second timeout.
    Set server-only PROXY_AUTH_SECRET to the same value as Render. Missing Vercel
    configuration fails API calls closed. Rotate both services together.
    Redeploy. Never place DB/Redis/Twilio secrets or credentials in NEXT_PUBLIC vars.
    See https://vercel.com/kb/guide/vercel-services .
11. Browser calls remain relative `/api/...`; Vercel proxies to Render and forwards
    Set-Cookie. Do NOT point browser JavaScript directly at the Render domain.
    Keep cookies host-only, HttpOnly session, Secure in production, SameSite=Lax,
    and send customer_csrf in x-csrf-token. Native Flutter manages these cookies
    in secure storage and calls the HTTPS backend directly.
    Preview deployments need their OWN backend/origin and test database; do not
    broaden production CORS to wildcard preview domains.
12. Publish only reviewed real store/catalog/stock and delivery coverage via staff
    operations. Complete the release journeys above before allowing real customers.
13. Build modern-trade-app using the existing Codemagic workflows and
    API_BASE_URL=https://your-render-service.onrender.com (no /api suffix).
    Supply signing secrets, support phone and legal URLs; install the signed build
    and repeat OTP/delivery/pickup/cancellation/retry checks.

## Temporary demo OTP versus production

Demo belongs on an isolated non-production backend/database, with no real customer
traffic. Set NODE_ENV=development, SMS_PROVIDER=demo, OTP_DEMO_PHONE to ONE Nepal
mobile, OTP_DEMO_CODE to a private six-digit code, OTP_DEMO_EXPIRES_AT to an ISO UTC
expiry less than seven days ahead, and EXPOSE_DEVELOPMENT_OTP=false. Supply normal
DB/session/OTP secrets. Enter the privately shared code manually; API does not return
it. All other phones fail. Remove the four demo variables after testing.
Do not set NODE_ENV=development on the live production service to bypass validation.

For real production set NODE_ENV=production and the four Twilio Verify variables
above, remove demo variables, keep EXPOSE_DEVELOPMENT_OTP=false and redeploy. Startup
rejects demo or missing/incomplete provider config. On provider outage stop login,
return a retryable failure, and restore the provider; never install a universal OTP.
The legacy SMS adapter (`SMS_PROVIDER=twilio` with TWILIO_FROM_NUMBER instead of
Verify Service SID) requires separate Nepal delivery validation; switching providers
invalidates pending attempts operationally—request fresh codes after the change.

## Verification recorded for this revision

See the final verification entry below. Passing mocked unit tests is not proof of
real database concurrency, successful SMS delivery, or production behavior.

### Recorded local results

- Backend type-check, lint and production build: PASS (Node 24.19.0 locally;
  repeat the Node 22 CI gate for the production runtime).
- Backend database-free Jest: 33 suites / 174 tests PASS, no forced exit.
- Frontend type-check and lint: PASS (one pre-existing unused-import warning).
  Production build: PASS including final signed-proxy identity changes.
- Root security static check: PASS. git diff --check: PASS.
- Full PostgreSQL Jest: BLOCKED at global setup, initdb not installed. Installation
  also failed due workspace filesystem restrictions. New integration journey and
  migration/seed/role behavior require CI evidence.
- Docker/container/browser certification: NOT RUN. Flutter: BLOCKED as above.
- Real SMS, production secrets and deployment: NOT VERIFIED, no live deployment.

### Every changed website file

| File | Fix / purpose |
|---|---|
| PRODUCTION_READINESS.md | Current decision, evidence, exact deployment and OTP runbook |
| implementation/RELEASE_GATE.md | Current NOT READY decision linked to current evidence |
| RELEASE_BLOCKERS.md | Marks old blocker list as historical |
| AUDIT_FIX_PROGRESS.md | Records this remediation and report |
| backend/DEPLOYMENT.md | Mandatory SMS and current deployment sequence |
| render.yaml | Explicit Twilio Verify default; free billing unchanged |
| backend/jest.unit.config.js | Adds safety and lifecycle suites to unit gate |
| backend/src/config/integrations.ts | Reject missing production SMS provider |
| backend/src/config/__tests__/integrations.test.ts | Regression for missing SMS |
| backend/src/config/__tests__/environment.test.ts | Valid production fixture includes SMS |
| backend/src/database/bootstrapAdmin.ts | Explicit production store/email; avoids arbitrary first-store admin |
| backend/src/database/migrationRunner.ts | Readiness requires latest migration 032 |
| backend/src/database/migrations.json | Registers additive migration 032 |
| database/032_cod_inventory_evidence.sql | Prevents rewriting COD/cash-POS stock evidence |
| database/production_bootstrap.sql | Repeatable real-identity closed-store and Nepal geography bootstrap |
| backend/src/routes/auth.ts | Never exposes provider/demo code via development flag |
| backend/src/routes/shoppingCart.ts | Strict authenticated atomic snapshot endpoint |
| backend/src/services/otpService.ts | Provider-aware staging, demo expiry check, safe errors |
| backend/src/services/shoppingCartService.ts | Atomic snapshots, correct product column, price dates and recalculated totals |
| backend/src/services/checkoutService.ts | Retry serialization, unavailable-product rejection, durable order reservations |
| backend/src/services/stockReservationService.ts | Does not expire reservations attached to orders |
| backend/src/services/webOrderService.ts | Serializes fulfillment stock and records immutable deductions |
| backend/src/services/posService.ts | Authoritative cash pricing, transactional creation and reservation-aware completion |
| backend/src/services/__tests__/checkoutService.security.test.ts | Updated inventory and retry-lock assertions |
| backend/src/services/__tests__/codReadiness.security.test.ts | Cart, ownership, retry, POS price/reservation and provider regressions |
| backend/src/services/__tests__/codJourney.integration.test.ts | PostgreSQL OTP/cart/COD concurrency/tracking/cancellation journey |
| frontend/src/app/api/[...path]/route.ts | Honest 503 response on unavailable backend |
| frontend/src/app/checkout/page.tsx | Atomic cart upload instead of clear-plus-add loop |
| frontend/src/lib/serverApiUrl.ts | Proxy timeout now outlasts Twilio provider timeout |
| frontend/src/lib/resilientFetch.ts | Browser timeout now outlasts proxy timeout |
| frontend/src/lib/proxyClientIdentity.ts | Signs Vercel edge IP for per-client backend limits |
| frontend/src/app/api/operations-auth/[...path]/route.ts | Applies signed identity to staff proxy too |
| backend/src/utils/proxyClientIdentity.ts | Verifies signature/expiry or falls back to backend IP |
| backend/src/utils/__tests__/proxyClientIdentity.test.ts | Forgery, expiry and missing-header regressions |
| backend/src/app.ts | Uses authenticated client identity for rate limits |
| backend/src/config/environment.ts | Requires independent proxy secret in production |
| backend/.env.production.example | Documents shared server-only proxy secret |

vercel.json was inspected and retained: its Services routing is supported; correct
project framework/root selection is documented above. No deferred feature was enabled.

Vercel edge IP contract: https://vercel.com/docs/headers/request-headers .

## Delivery status

Changes are committed locally on `fix/nepal-cod-readiness`. Automatic approval review
blocked publishing the branch because explicit authorization to push this payload
to GitHub was required. No merge or deployment is claimed. Approve pushing both
repository branches and opening draft PRs to continue remote review/CI.
