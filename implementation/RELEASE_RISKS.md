# Phase 00 - Release Risk Register

## R-018 — Phase 07 providers are not certified for production

- **Severity:** High
- **Status:** Open
- **Evidence:** COD remains the only enabled payment provider; eSewa/Khalti, external email/SMS, and map adapters are fail-closed.
- **Exit criterion:** Select one provider, implement real initiation/webhook verification/status/refund/reconciliation, and complete sandbox plus production smoke evidence.

## R-019 — Notification delivery and consent lifecycle incomplete

- **Severity:** High
- **Status:** Open
- **Evidence:** Failures are dead-lettered, but provider calls, delivery receipts, suppression, and consent enforcement are incomplete.
- **Exit criterion:** Implement provider adapters, retries/DLQ worker, delivery status, and consent/suppression tests.

## R-020 — Map provider methods contain placeholders

- **Severity:** Medium
- **Status:** Open
- **Evidence:** Providers are credential-gated, but Baato/Galli methods still return mock responses.
- **Exit criterion:** Implement real API calls, timeouts, outage behavior, and store-finder/delivery-zone smoke tests.

## R-021 — Analytics projections require live reconciliation

- **Severity:** High
- **Status:** Open
- **Evidence:** Inventory events and targeted refresh boundaries are implemented, but no seeded live run has reconciled dashboard values to source transactions.
- **Exit criterion:** Reconcile sales, orders, inventory, returns, and payments across representative stores and periods.

## R-022 — Tax outputs remain provisional

- **Severity:** Critical
- **Status:** Open
- **Evidence:** VAT/tax reports now carry `PROVISIONAL` status and explicitly require professional Nepal VAT/IRD review.
- **Exit criterion:** Obtain documented professional review before filing or representing outputs as statutory returns.

## R-023 — Automated quality coverage is incomplete

- **Severity:** High
- **Status:** Open
- **Evidence:** CI now runs type-check, backend tests, lint, frontend lint/type-check/build, and dependency audit, but critical browser journeys and accessibility/secret scanning are not yet automated.
- **Exit criterion:** Add seeded E2E coverage for customer, staff, POS, operations, admin, and store-isolation workflows; add accessibility and secret scanning jobs.

## R-024 — Lint warning debt obscures defects

- **Severity:** Medium
- **Status:** Open
- **Evidence:** The Phase 09 verification run reports 474 backend and 18 frontend warnings.
- **Exit criterion:** Reduce warnings to an approved zero/minimal baseline and enforce no-regression budgets in CI.

## R-025 — Production deployment and restore drill are environment-dependent

- **Severity:** Critical
- **Status:** Open
- **Evidence:** Docker, canonical migrations, pre-migration backups, readiness checks, and immutable image publication are implemented, but no production registry/cluster or durable backup target is configured in this workspace.
- **Exit criterion:** Deploy to staging, prove backup restore, execute rolling rollback, and retain smoke/alert evidence.

## R-026 — External alerting and error tracking are not wired

- **Severity:** High
- **Status:** Open
- **Evidence:** JSON logs, health checks, and internal observability boundaries exist; provider-specific alert destinations are not configured.
- **Exit criterion:** Connect error tracking, metrics dashboards, and alerts for payments, queues, inventory, notifications, sync, and readiness failures.

## R-027 — Production release gate is not approved

- **Severity:** Critical
- **Status:** Open
- **Evidence:** Phase 11 assessment is explicitly NOT READY; no approver has accepted the open functional, security, data, quality, and operations residual risks.
- **Exit criterion:** Close the blockers listed in `implementation/RELEASE_GATE.md` and obtain named product, engineering, operations, and tax approvals.

| ID | Risk | Impact | Owner | Mitigation / exit criterion | Status |
|---|---|---|---|---|---|
| R-001 | Legacy development database has schema objects without migration ledger entries; migration runner fails on existing enum. | High | Backend/platform | Use fresh production database or reviewed baseline/adoption migration; verify clean and repeated migration in deployment CI. | Open |
| R-002 | Legacy India defaults can conflict with the Nepal/NPR launch contract in historical migrations or unconverted environments. | Critical | Platform/contracts | Apply migration 016, use Nepal contract tests, and make organization/store configuration authoritative. | Open |
| R-003 | Staff session query/schema and administrator bootstrap are not canonical. | Critical | Identity/admin | Define one session schema, bootstrap path, protected layouts, and authorization tests. | Open |
| R-004 | Many route modules are imported but not registered in `src/index.ts`; lint exposes unused route imports. | High | Backend | Duplicate `posDeviceRoutes` registration removed; clean backend startup and `/api/health` smoke now pass. Remaining route registration audit stays covered by R-010. | Mitigated |
| R-005 | Admin and operations UI are incomplete; frontend builds but several routes are shells/placeholders. | High | Admin/operations | Implement and browser-test approved journeys before Phase 11. | Open |
| R-006 | Lint has 470 backend and 20 frontend warnings, including unused imports and placeholder provider code. | Medium | Engineering | Set a warning budget and reduce warnings on release-critical paths; prevent regression in CI. | Open |
| R-007 | Electronic providers and map adapters are incomplete or country-specific. | Medium | Integrations | Keep disabled; certify one Nepal provider and one map path later. | Deferred |
| R-008 | No frontend/E2E suite protects complete customer, staff, POS, and admin journeys. | High | QA | Add journey-level browser tests and run them in release gate. | Open |
| R-009 | Phase 02 browser redirect/forbidden flows have not yet been automated; backend authorization tests pass. | Medium | QA | Verify `/admin/**` and `/operations/**` with missing, expired, revoked, and insufficient-capability sessions in browser/E2E tests. | Open |
| R-010 | Protected route registration is centralized, but a complete mutation-by-mutation capability audit across all imported route modules remains outstanding. | High | Backend/security | Complete route capability matrix and enforce explicit capability/scope hooks before Phase 11. | Open |
| R-011 | Admin workbench uses explicit unavailable states for backend surfaces whose CRUD APIs do not yet exist; destructive confirmation and audit-history drawer are not implemented. | Medium | Admin/product | Implement the missing backend workflows and add confirmation/audit UI before release. | Open |
| R-012 | Operations route surfaces are live and protected, but no browser/E2E run has yet completed cashier shift/sale/reconciliation or receiving/transfer inventory journeys. | High | QA | Add a seeded browser journey suite and execute the Phase 04 acceptance gate before release. | Open |
| R-013 | Generic protected-operations store checks validate explicit request store identifiers; service-level filtering for every legacy list/read route still needs a complete mutation-by-mutation audit. | High | Backend/security | Complete route matrix review and add database-backed cross-store denial tests before Phase 11. | Open |
| R-014 | Storefront now consumes backend catalog and prices, but customer authentication/cart merge and checkout are not yet complete. | High | Commerce/identity | Complete Phase 06 customer session, merge, checkout, and browser journey coverage before release. | Open |
| R-015 | Product price/availability migration 013 must be applied to every deployed database and seeded with valid store pricing. | High | Data/platform | Run migration 013 in deployment CI and verify catalog/cart contract tests against a seeded database. | Open |
| R-016 | COD checkout is implemented with transaction locks and reservations, but no live database concurrency/browser journey has yet exercised duplicate submission and oversell behavior. | High | QA/backend | Add seeded integration and browser tests for concurrent checkout, idempotency replay, reservation expiry, and lifecycle transitions. | Open |
| R-017 | Promotions, loyalty redemption, returns/support UI, and staff fulfillment surfaces are not included in the COD checkout boundary. | Medium | Commerce/product | Complete the deferred workflow packages before the final release gate. | Open |
