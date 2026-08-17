# Audit Fix Progress

## Findings fixed

- Customer login sessions are issued in `HttpOnly`, `Secure` (in production), `SameSite=Lax` cookies instead of returning a bearer token for `localStorage`.
- Customer logout, cart mutations, checkout, and customer order cancellation require the CSRF cookie/header pair.
- Cart endpoints require an authenticated customer and verify cart/item ownership; client-controlled customer IDs, session IDs, unit prices, and discounts are no longer accepted by the cart API.
- Cart prices are recalculated from the authoritative store/catalog price on the server.
- Legacy web-order endpoints require authenticated staff and order capabilities; customer order reads/mutations remain customer-scoped in checkout routes.
- Removed the client-controlled `x-auth-time` step-up signal.
- Organization-scoped store access no longer defaults to allowing every store.
- Removed unsafe default JWT/cookie secrets, bounded `trustProxy`, enabled Next standalone output, restricted remote image hosts, and passed `API_URL` into the frontend runtime image.
- Unified the visible frontend brand/metadata around StoreSync and `storesync.com`.

## Files changed

See `git diff --stat`; the main areas are backend authentication/authorization/cart/order routes and services, frontend account/checkout session handling, Docker/Next configuration, and SEO metadata.

## Tests executed

- `backend`: `npm run type-check` — passed.
- `backend`: `npm run lint` — passed.
- `frontend`: `npm run type-check` — passed.
- `frontend`: `npm run lint` — passed.
- `backend`: the original unbounded Jest run and `frontend`: the original unbounded build were diagnosed as environment/process issues; both now have bounded, logged verification paths.
- `docker compose -f docker-compose.qa.yml config` — blocked because Docker is not installed in the environment (explicit executable check exit code 1).
- `backend`: `npm run test:unit` — passed: 7 suites, 27 tests, `--detectOpenHandles --verbose`.
- `backend`: `npm test -- --runInBand --detectOpenHandles --verbose --testTimeout=10000` — passed: 22 suites, 200 tests, exit code 0. Global setup initialized a temporary PostgreSQL cluster, ran migrations, and global teardown completed.
- `backend`: targeted authorization suite with open-handle detection — passed: 1 suite, 24 tests.
- `frontend`: `npm run build` (`next build --webpack`) — passed; TypeScript, static generation (26 pages), standalone output, and build traces completed.
- `frontend`: `npx playwright test tests/release-gate.spec.ts --project=chromium-desktop --reporter=line` — passed: 3 tests against the local production server.
- `frontend`: `npx playwright test tests/accessibility.spec.ts --project=chromium-desktop --reporter=line` — passed: 9 tests with no serious/critical Axe violations.
- `frontend`: standalone server smoke initially exposed missing local static assets; `npm start` now uses `next start` for local verification while Docker continues to use the standalone server layout.
- `frontend`: `npm start` now uses `scripts/start-standalone.mjs`, which copies `public/` and `.next/static/` into the standalone tree before starting it; local smoke returned HTTP 200 and verified both asset directories.
- `backend`: final `npm run lint` — passed, exit code 0.
- `frontend`: final `npm run type-check` and `npm run lint` — passed, exit code 0.
- Root: `npm run qa:local` — passed, exit code 0. This used the installed PostgreSQL 14/18 service and Memurai (`pg_isready` ready; `memurai-cli ping` returned `PONG`), created/used the isolated `storesync_local_qa` database, applied all migrations, seeded the Nepal development data, started the backend on `127.0.0.1:3001`, built the frontend with a 180-second timeout, started the production server on `127.0.0.1:3032`, verified both health endpoints, then ran 3 Chromium desktop release tests and 9 Chromium desktop accessibility tests. All 12 browser tests passed and all accessibility scans reported no serious/critical Axe violations.
- Root: native QA also confirmed the frontend-to-backend proxy at `/api/health/ready` returned HTTP 200. The local runner uses regular `next start` on Windows; standalone output remains enabled for the container build because Next file tracing can stall on this local filesystem.
- Vercel readiness: added root `vercel.json`, a server-side `API_URL` contract, production security headers, and an explicit regular Next.js output for Vercel. Docker opts into standalone output with `NEXT_STANDALONE=1`.
- Deployment variables: added `backend/.env.production.example` and `docs/DEPLOYMENT_ENVIRONMENT.md`; production startup now validates `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGIN`, `APP_URL`, and all security keys as real configuration values.
- Deployed login diagnosis: `https://storesync-modern-trade.vercel.app/api/health/ready` returned Vercel `404 DNS_HOSTNAME_RESOLVED_PRIVATE`, confirming the configured backend target is private/unreachable. The frontend proxy now converts non-JSON upstream responses to a clear JSON 502, and the account page no longer crashes while parsing HTML as JSON.
- Product detail visual fix: removed the unused thumbnail grid column from the gallery layout and forced the main product image to fill the gallery width; this fixes the narrow image strip/large blank area shown on the deployed product page.
- Render deployment runbook: documented Dockerfile-based Web Service settings, managed Postgres/Key Value setup, internal connection URLs, `/api/health/ready`, environment variables, migrations, and Vercel `API_URL` wiring in `backend/DEPLOYMENT.md`.
- Render hosting preparation: added `render.yaml` to provision the backend Docker Web Service and private Redis-compatible Key Value while accepting Supabase PostgreSQL through a secret `DATABASE_URL`.

## Remaining blockers

- Docker image build, Compose startup, and container health checks remain unverified because the Docker executable is unavailable (explicit check exit code 1).
- Full OTP-driven authenticated browser checkout/order flows remain unverified because the existing Playwright release gate has no complete customer-login/payment scenario; backend security tests cover the authorization and pricing controls, and the native browser gate covers public storefront, cart UI persistence, protected-page redirects, and accessibility against a live seeded backend.
- Vercel cannot host the current persistent Fastify/PostgreSQL/Redis backend unchanged; the backend must be deployed separately and configured through the documented `API_URL` and `CORS_ORIGIN` values.
- Additional legacy customer-scoped routes (notably consent/data-request APIs) should be migrated to the shared customer authentication helper before release.
- A complete MFA verification flow and a server-minted step-up claim still need implementation before enabling MFA-dependent staff operations.

## Next action

Run the Compose-backed authenticated checkout/order flow and Docker smoke checks in CI, then complete the remaining consent-route customer authorization migration and server-minted MFA step-up flow.
## 2026-08-17 — Render no-card deployment path

- Changed both Render Blueprint services from the paid `starter` plan to `free` in `render.yaml` so the backend can be created without payment information.
- The free path is suitable for testing/preview only: the backend may spin down after inactivity, and free Render Key Value is in-memory and may lose Redis data after restarts.
- Render documentation confirms that free Web Services and Key Value instances are available without payment details.
