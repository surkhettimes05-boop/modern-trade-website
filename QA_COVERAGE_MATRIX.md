# QA Coverage Matrix

Revision under test: current workspace revision, 2026-08-14.

| Area | Scope | Evidence | Status |
|---|---|---|---|
| Discovery | Frontend, backend, auth, DB, Redis, integrations, Docker, tests | Repository/configuration review | Complete |
| Static validation | Lint, Prettier, TypeScript, production builds | Final command matrix | Pass with warnings |
| Automated regression | Full backend Jest suite and focused provider tests | 19 suites/184 tests; payment 26/26 | Complete |
| Database | Fresh migrations, constraints, Nepal seed/bootstrap | Migrations 001–017; 2 stores, 3 products, 6 NPR prices, 1 staff | Complete |
| Redis/cache | Connection, TTL, queues, fallback, restart behavior | Service unavailable locally | Not tested |
| API | Health, public endpoints, validation, selected protected routes | Live QA API plus Jest | Partial |
| Authentication | OTP, staff login, session validation, cookies/logout | Live seeded-user probes and Jest | Pass for tested flows |
| Authorization/security | Headers, CORS, validation, IDOR/BOLA, error leakage | Jest plus order ownership probe | Partial; broader resource matrix pending |
| Browser E2E | Public home/catalog/product/cart/checkout shell | Chromium QA session; cart reload regression | Partial |
| Accessibility | Labels, semantic controls, focus review, axe | Manual spot checks only | Partial |
| Payments | Provider services, verification, idempotency boundaries | 26 focused tests; no provider sandbox | Partial |
| External integrations | Strapi, Cloudflare, maps, payment provider failures | Source/configuration review | Not fully tested |
| Cross-browser | Chromium, Firefox, WebKit | Chromium only | Not tested |
| Release topology | Docker/Compose, Redis, clean boot, port ownership | Dedicated `docker-compose.qa.yml` and `npm run qa:verify` added; Docker unavailable on host | Configured; execution blocked externally |
| Regression | Re-run after all fixes | Full Jest, builds, typechecks, formatting | Pass |

## Release-critical journeys

| Journey | Evidence | Status |
|---|---|---|
| Public home → catalog → product → cart → checkout | Live Chromium review; cart persistence verified | Pass with performance warnings |
| Staff login/session → protected operations | Live login/session probe; auth suites | Pass for tested flow |
| Customer auth → account/orders isolation | OTP/session probe; owner 200, other user 404, anonymous 401 | Pass for tested order flow |
| Payment creation/verification/callback idempotency | Unit/provider coverage only | Partial; sandbox required |
| Fresh database migration and backend boot with PostgreSQL/Redis | PostgreSQL verified; Redis/Docker unavailable | Partial |

## Remaining release evidence

- Docker/Compose image and startup verification.
- Redis cache, TTL, queue, restart, and failure behavior.
- eSewa/Khalti/Fonepay sandbox callback, signature, replay, and idempotency matrix.
- Firefox/WebKit smoke tests and automated axe scan.
- Exact release-artifact boot, health, migration, and port-ownership verification.

## QA infrastructure handoff

The dedicated QA stack is intentionally isolated to PostgreSQL database `storesync_qa`, ports 53000–53001/55432/56379, and named volumes `storesync_qa_*`. It runs migrations 001–017, including `017_order_events.sql`, then applies `database/development_seed.sql` before the backend is allowed to start. See the root `package.json` scripts and `docker-compose.qa.yml`.

Execution remains blocked until Docker Desktop with the WSL 2/Linux engine is installed and started on the host.

## Final certification matrix — 2026-08-14

| Gate | Result | Evidence / blocker |
|---|---|---|
| Exact revision | BLOCKED | Workspace is not a Git repository; no commit hash available |
| Working tree | BLOCKED | Git status unavailable for the same reason |
| Prettier | FAIL | Backend `src/services/paymentService.ts` unformatted |
| ESLint | PASS | Frontend clean; backend JSON-formatted recount 0 errors/0 warnings |
| TypeScript/build | PASS | Frontend and backend typechecks/builds completed |
| Jest | PASS | 20 suites, 193 tests |
| Targeted payment/authz | PASS | 4 suites, 54 tests |
| Fresh Docker DB/migrations/seeds | BLOCKED | Docker executable unavailable |
| Redis | BLOCKED | Docker/Redis unavailable |
| Chromium desktop | PARTIAL | Functional/a11y pass; route sweep failed on backend 500s |
| Chromium mobile | BLOCKED | Cached executable launch failure |
| Firefox desktop | PARTIAL | Functional/a11y pass; route sweep failed on dependency/error logging |
| WebKit desktop | BLOCKED | Cached binary incompatible with Playwright |
| Accessibility | PASS for executed browsers | 0 serious/critical violations after remediation |
| eSewa/Khalti/Fonepay sandbox | BLOCKED | No provider sandbox credentials/contact |
| Exact production artifact | BLOCKED | Docker unavailable |
| Release decision | FAIL | Critical validation remains blocked/failed |
