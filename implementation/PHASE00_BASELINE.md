# Phase 00 - Baseline and Scope Record

Date: 2026-08-13  
Status: Complete with release risks carried forward

## Baseline commands

| Area | Command | Result |
|---|---|---|
| Backend tests | `npm test -- --runInBand` | PASS - 16 suites, 172 tests |
| Backend typecheck | `npm run type-check` | PASS |
| Backend build | `npm run build` | PASS |
| Backend lint | `npm run lint` | PASS - 470 warnings, 0 errors |
| Frontend lint | `npm run lint` | PASS - 20 warnings, 0 errors |
| Frontend build | `npm run build` | PASS - 24 generated routes |
| Clean migrations | `npm run db:migrate` in isolated schema | PASS - 11 migrations applied |
| Repeated migrations | second `npm run db:migrate` in same isolated schema | PASS - database up to date |

The existing development database was not used as the clean migration target. It contains pre-existing schema objects without matching `schema_migrations` rows; running the migration runner there fails on the already-existing `publication_status` enum. This is recorded as R-001 in the release-risk register.

## Accepted MVP scope

The first production release includes public India catalog and store discovery; customer OTP authentication and sessions; persistent cart and COD checkout/order creation; basic loyalty; staff authentication; POS cash sales and shift/tender handling; receiving; inventory transfers; core admin CRUD; and audit trails.

Deferred from MVP: multiple electronic payment providers; multiple map providers and advanced geospatial capabilities; advanced recommendations, segmentation, and personalization; nonessential hardware; Nepal launch, Nepal tax/fiscal integrations, and multi-market support.

## MVP journey acceptance criteria

| Journey | Measurable acceptance criteria | Current status |
|---|---|---|
| Browse catalog | Public user loads catalog/store data and opens a product/category without staff authentication. | Partial - storefront/API contract conflicts |
| Customer OTP | Valid Indian mobile number requests/verifies one OTP; invalid, expired, and replayed OTPs are rejected; session persists. | Partial - India phone contract pending |
| Cart and COD checkout | Customer persists cart items, submits address, selects COD, creates one idempotent order, and receives a stable order reference. | Partial - end-to-end UI incomplete |
| Loyalty | Authenticated customer views balance/history and qualifying sale creates exactly one ledger result. | Partial |
| Staff authentication | Staff login creates protected session; unauthorized requests are rejected; logout invalidates session. | Blocked - session/schema/bootstrap mismatch |
| POS cash sale | Authorized cashier records cash sale against active shift/register. | Partial - UI/authorization wiring incomplete |
| Receiving | Authorized staff receives purchase order and inventory increases by accepted quantity. | Partial |
| Transfer | Authorized staff requests, approves, ships, and receives a transfer with inventory movement recorded. | Partial |
| Admin CRUD | Authorized admin creates, updates, lists, and audits catalog/store/staff records. | Blocked - admin UI/endpoints incomplete |
| Audit logs | Privileged user queries actor, action, entity, timestamp, and outcome for MVP mutations. | Partial |

Partial and blocked journeys are scope commitments, not claims of production readiness; they remain gates for later phases.

## Endpoint production-status inventory

The detailed inventory remains in [`docs/route-inventory-api-matrix.md`](../docs/route-inventory-api-matrix.md). Usable foundation includes health/public data, authentication primitives, POS/shift/reconciliation primitives, metrics/alerts, and audit/security primitives. Catalog, customer, loyalty, cart/order, receiving, transfers, procurement, delivery, analytics, and most admin routes require extension before release. Nepal-specific tax/fiscal/payment behavior is country-disabled for India. Dashboard, content admin, roles/organization configuration, media/attributes, and several bulk workflows are new or incomplete.

## Scope gate

- [x] Baseline commands pass.
- [x] MVP scope is approved and documented.
- [x] India/INR market decision is accepted.
- [x] Every MVP journey has measurable acceptance criteria.
- [x] Deferred features are explicitly identified and must not be presented as production functionality.
