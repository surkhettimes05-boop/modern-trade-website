# Release QA Report

Date: 2026-08-14  
Revision: current workspace revision

## Release recommendation

**FAIL — do not release this exact revision yet.**

The previously reproduced application defects are fixed and the automated application checks now pass. The release gate remains FAIL because Docker/Compose and Redis could not be exercised on this machine, provider sandbox callbacks and cross-browser coverage remain incomplete, and the final deployment topology has not been validated in a clean environment.

## Executive summary

The public catalog, Nepal bootstrap data, and cart reload behavior were fixed and reverified. A further HIGH defect was found during IDOR testing: customer order detail queried `order_events`, but that table was absent from the migration manifest. Migration `017_order_events` was added, applied to the QA database, and the owner/non-owner/anonymous order-detail cases now return 200/404/401 respectively.

The full backend suite now passes serially: 19 suites and 184 tests. The earlier timeout was caused by concurrent Jest processes contending for the same dedicated PostgreSQL test cluster; serial execution with open-handle diagnostics completes successfully. Backend TypeScript formatting is clean after formatting the source tree. Lint still reports warnings but no errors.

## Environment tested

- Node.js v24.15.0; project Dockerfiles target Node.js 20 Alpine.
- Frontend: Next.js 16.3.0, React 19.2.8; isolated live server on port 3022.
- Backend: Fastify 5; isolated QA servers on ports 3311–3313.
- Browser: Codex in-app Chromium only; Firefox/WebKit were not run.
- PostgreSQL: local PostgreSQL 18.4 service with disposable QA databases.
- Redis: unavailable; no Redis CLI and no listener on localhost:6379.
- Docker: unavailable; `docker` and `docker compose` commands were not found.
- Fresh QA migration sequence: 001–017. Seed verification: 2 stores, 3 products, 6 NPR price rows, 1 staff row.

## Final automated results

| Check | Result | Evidence |
|---|---|---|
| Frontend lint | PASS with 18 warnings | `npm run lint`, 0 errors |
| Frontend typecheck | PASS | `npm run type-check` |
| Frontend production build | PASS | `npm run build`, 26 routes generated |
| Backend lint | PASS with 474 warnings | `npm run lint`, 0 errors |
| Backend typecheck | PASS | `npm run type-check` |
| Backend production build | PASS | `npm run build` |
| Backend Prettier check | PASS | `npx prettier --check "src/**/*.ts"` |
| Full Jest suite | PASS | 19 suites, 184 tests, serial `--runInBand --forceExit --detectOpenHandles` |
| Payment-focused tests | PASS | 2 suites, 26 tests |
| Fresh migrations and seed | PASS | migrations 001–017; expected seed counts verified |
| Docker/Compose | NOT TESTED | Docker unavailable in environment |
| Redis | NOT TESTED | Redis unavailable in environment |

## Live/API evidence

- Public products endpoint: HTTP 200 after qualifying ambiguous product query columns.
- Customer OTP request/verify/session validation: PASS using seeded customer in isolated QA server.
- Staff login/session validation: PASS using seeded admin account in isolated QA server.
- IDOR/BOLA order-detail probe: owner 200, different customer 404, anonymous 401.
- Authentication/security Jest suite: 4/4 suites passed.
- Authorization Jest suite: 22/22 tests passed.
- Public route regression suite: passed as part of the final 19-suite run.
- Payment unit/provider tests: 26/26 passed; no real financial transaction was attempted.

## Browser evidence

- `/shop` rendered products, categories, filters, sorting, product links, and accessible add-to-cart controls.
- Cart persistence regression: add one item, reload, and cart remained at one item.
- Home, catalog, product, cart, and checkout shell were reviewed in the Chromium QA session.
- The invalid Next Image fill-parent warning was removed by the responsive image-container CSS fix.
- Remaining browser diagnostics are performance warnings for product-image LCP and width/height handling; they are not functional failures but should be cleaned before performance sign-off.
- Firefox, WebKit, axe, and a full keyboard/focus audit were not run.

## Bugs discovered and status

| ID | Severity | Area | Description | Status |
|---|---|---|---|---|
| BUG-001 | HIGH | Public API/catalog | Ambiguous joined product query caused HTTP 500. | Fixed and HTTP-200 verified |
| BUG-002 | HIGH | Database seed | Nepal seed predicates selected no stores/staff and lacked NPR price rows. | Fixed and fresh-seed verified |
| BUG-003 | HIGH | Cart state | Initial empty state could overwrite localStorage before hydration. | Fixed and browser-regression verified |
| BUG-004 | MEDIUM | Test/release gate | Full Jest appeared to time out under concurrent runs sharing one PostgreSQL test cluster. | Fixed operationally; serial run 184/184 passed |
| BUG-005 | LOW | Frontend performance | Product imagery still emits LCP/width-height optimization warnings. | Open, performance-only |
| BUG-006 | MEDIUM | Repository hygiene | Backend lint reports 474 existing warnings, including unused imports and error variables. | Open, no lint errors; formatting fixed |
| BUG-007 | HIGH environment/config | Port 3001 was occupied by an unrelated Next.js process during earlier checks. | Environment issue; clean deployment validation required |
| BUG-008 | HIGH | Database migration | `order_events` was used by customer order detail but missing from the migration manifest, causing owner requests to return 500 on a fresh schema. | Fixed with `017_order_events.sql`; owner/non-owner/anonymous regression verified |

## Security and payment findings

- Required production secrets, JWT/cookie/encryption configuration, Helmet, and credentialed CORS gates were reviewed.
- Authentication, authorization, session, and the tested order-level IDOR cases passed.
- Payment service/provider tests passed, including unit-level verification paths. Real or provider-sandbox eSewa, Khalti, and Fonepay callbacks, duplicate webhooks, tampered signatures, and end-to-end idempotency were not executed because provider credentials/sandboxes are not configured.
- A local frontend environment file contains a Vercel OIDC token. Confirm it is ignored and rotate it if it has ever been committed or shared.

## Release blockers remaining

1. Validate Docker image builds and Compose startup in CI or a clean host.
2. Validate Redis connection, cache/TTL behavior, queue behavior, restart handling, and unavailable-dependency fallback.
3. Execute provider sandbox callback and payment idempotency matrices without real funds.
4. Run Firefox and WebKit smoke journeys plus axe and keyboard/focus checks.
5. Resolve or formally accept the remaining frontend performance warnings and backend lint debt.
6. Repeat health, migration, boot, and port-ownership checks on the exact release artifact.

## Files changed in this QA pass

- `backend/src/database/migrations.json`
- `database/017_order_events.sql`
- `frontend/src/app/globals.css`
- Backend TypeScript files under `backend/src` were formatted with Prettier; no generated/build artifacts were intentionally formatted.
- Existing prior-pass fixes remain in `backend/src/routes/public.ts`, `database/development_seed.sql`, `backend/src/routes/__tests__/public.test.ts`, and `frontend/src/components/CommerceClient.tsx`.

## Final recommendation

Do not release this exact revision yet. Application-level regressions are green, but the release-critical infrastructure, external payment, and cross-browser evidence is incomplete. Re-run this report against a clean Docker/Redis-enabled environment and the exact release artifact before approval.

## QA infrastructure follow-up

The repository now contains a dedicated disposable stack in `docker-compose.qa.yml` with PostgreSQL 15, Redis 7, migration and seed completion gates, backend/frontend healthchecks, isolated ports and named volumes, and a verification script. The backend image now packages the full migration manifest, and backend startup establishes Redis before listening; `/api/health/ready` checks both PostgreSQL and Redis.

Added commands:

- `npm run qa:up` — build and start the QA stack.
- `npm run qa:verify` — verify backend readiness, frontend, frontend-to-backend proxying, PostgreSQL schema/seed counts, and Redis PONG.
- `npm run qa:restart` — restart services and run verification.
- `npm run qa:reset` — destroy only the named QA volumes and rebuild from an empty database.
- `npm run qa:down`, `npm run qa:status`, `npm run qa:logs`.

The stack could not be executed on this machine. `npm run qa:up` fails because `docker` is not recognized; `docker-compose` and `redis-cli` are also absent. Docker Desktop executable paths and a Docker service were not found. This is an external machine limitation, not a Compose or application-level validation result.

## Final release certification — 2026-08-14

### Release decision

**FAIL — SAFE TO RELEASE: NO.**

The exact revision could not be identified by Git because this workspace is not a Git checkout (`git rev-parse HEAD` failed). The tested artifact is therefore the current filesystem snapshot as of 2026-08-14, not a commit-addressable revision.

Required release-critical gates remain blocked or failed:

- Docker/Compose is unavailable (`docker` is not installed or callable), so clean image builds, fresh PostgreSQL/Redis startup, container health, and exact production-artifact deployment were not tested.
- Backend Prettier check failed for `backend/src/services/paymentService.ts`.
- Redis was not independently available for infrastructure/failure testing.
- Chromium mobile could not launch the cached browser executable.
- WebKit could not create a page because the cached binary is incompatible with the installed Playwright version (`Unknown setting: PushAPIEnabled`).
- eSewa, Khalti, and Fonepay sandboxes were not contacted; credentials/configuration are absent.
- The production frontend route sweep observed backend-proxy HTTP 500 responses and browser console 500 errors while the backend dependency was not available on the expected host port.

### Revision and working tree

| Item | Result |
|---|---|
| Git commit hash | NOT AVAILABLE — directory is not a Git repository |
| Working tree state | NOT AVAILABLE via Git; filesystem snapshot tested |
| Revision identity | `C:\Users\QCS\Desktop\modern trade website`, captured 2026-08-14 |

Snapshot identifiers (SHA-256): `docker-compose.qa.yml` = `AAA9ECFA4EF74478D64AD9E4D56EEA9B59D11C796684E90464F7BA74D45C5D05`; `backend/package-lock.json` = `FF855D214C3498289B6A11946D4E17735AD24C282190CA6D264D7C74D48B92EE`; `frontend/package-lock.json` = `96C9F5833F835C846B5745DB6B8871DDC65FE09DC193B9A6CF9F98BC6F59CEB7`.

### Static checks

| Check | Result | Evidence |
|---|---|---|
| Frontend ESLint | PASS | `npm run lint` |
| Frontend TypeScript | PASS | `npm run type-check` |
| Frontend production build | PASS | `npm run build`; 26 routes generated |
| Backend ESLint | PASS — 0 errors, 0 warnings | `npm run lint`; JSON-formatted recount confirmed 0/0 |
| Backend TypeScript | PASS | `npm run type-check` |
| Backend production build | PASS | `npm run build` |
| Backend Prettier | FAIL | `src/services/paymentService.ts` reported unformatted |

### Automated tests

- Complete Jest: **PASS — 20 suites, 193 tests**.
- Targeted payment/authorization: **PASS — 4 suites, 54 tests**.
- Integration/authentication/IDOR/database coverage: included in the complete suite and previously executed application-level tests; clean Docker-backed integration could not be rerun in this certification because Docker is unavailable.
- No release-critical test was silently skipped; unavailable gates are explicitly reported as blocked.

### Infrastructure and exact-artifact result

| Area | Result |
|---|---|
| Docker image builds from scratch | BLOCKED — Docker unavailable |
| Fresh PostgreSQL database/migrations/seeds | BLOCKED in Docker certification; prior local PostgreSQL evidence remains in the earlier report only |
| Redis startup/connectivity/restart/failure | BLOCKED — Docker/Redis unavailable |
| Backend/frontend production containers | BLOCKED — Docker unavailable |
| Container healthchecks/log inspection | BLOCKED — Docker unavailable |
| Frontend → backend | FAIL in the current host route sweep: backend proxy produced HTTP 500s |
| Backend → PostgreSQL | NOT TESTED in the exact artifact |
| Backend → Redis | NOT TESTED in the exact artifact |
| Critical production-mode journey | PARTIAL: browser source/production server journeys passed where dependencies resolved; exact containers not tested |

Infrastructure failure cases (PostgreSQL unavailable, Redis unavailable, provider unavailable, external timeout) were not safely exercised against the production artifact because the required container environment and provider sandboxes were unavailable. Source-level/unit handling remains covered where tests exist.

### Browser and accessibility

| Browser | Result |
|---|---|
| Chromium desktop | 11 passed, 1 failed: route sweep detected backend 500/console errors; accessibility and functional journeys passed |
| Chromium mobile | BLOCKED: cached Chromium executable failed to launch |
| Firefox desktop | 11 passed, 1 failed: route sweep detected backend/provider error logging; accessibility and functional journeys passed |
| WebKit desktop | BLOCKED: incompatible cached WebKit binary (`PushAPIEnabled`) |

Accessibility scans executed in Chromium desktop and Firefox desktop across 9 routes. Serious/critical violations went from the previously identified cart ARIA, social-group, contrast, and unlabeled quantity-control violations to **0 remaining**. Keyboard checks covered product-image dialog Escape/focus, protected-page redirect, and account form focus.

### Payment provider certification

| Provider | Mock tests | Integration tests | Sandbox tests |
|---|---|---|---|
| eSewa | PASS — included in targeted 54-test run | NOT TESTED against live provider | BLOCKED — no sandbox contact/credentials |
| Khalti | PASS where covered by provider/security unit tests | NOT TESTED against live provider | BLOCKED — no sandbox contact/credentials |
| Fonepay | PASS where covered by provider/security unit tests | NOT TESTED against live provider | BLOCKED — no sandbox contact/credentials |

No real financial transaction was attempted. No provider sandbox result is called PASS.

### Security/auth/IDOR

Application-level authentication and authorization tests remain green in the Jest suite, including the existing order ownership/IDOR boundaries. Exact production-container auth/session/logout, resource matrix, and non-owner browser/API probes were not re-certified because Docker/backend infrastructure was unavailable. This is a release evidence gap, not a security PASS for the exact artifact.

### Previously discovered regressions

| Regression | Result |
|---|---|
| Ambiguous products SQL 500 | Prior application-level regression PASS; exact Docker artifact NOT TESTED |
| Nepal seeds creating no stores/staff | Prior fresh-local-PostgreSQL evidence PASS; exact Docker fresh-schema test BLOCKED |
| Cart clearing on refresh | Browser regression PASS in Chromium desktop and Firefox desktop |
| Missing `order_events` migration/order-detail 500 | Prior migration/order-detail regression PASS; exact Docker migration test BLOCKED |

### Remaining warnings and risks

- Backend Prettier failure in `src/services/paymentService.ts`.
- No backend ESLint warnings remain in the final JSON-formatted recount.
- Docker/Compose, Redis, and exact production artifact are unverified.
- Mobile Chromium and WebKit are unverified due local browser-runtime limitations.
- Payment sandbox, callback, replay, timeout, and idempotency behavior is not provider-certified.
- Backend proxy 500s were observed during the final browser route sweep when the expected backend dependency was unavailable.

**Final disposition: FAIL. Do not release this filesystem snapshot.**

Manual action required: install Docker Desktop for Windows, enable the WSL 2/Linux container engine, open a new terminal, and confirm `docker version` and `docker compose version` both succeed. Then run `npm run qa:reset`, `npm run qa:verify`, `npm run qa:restart`, and `npm run qa:logs` from the repository root. No production database or volume is referenced by the QA Compose file.
