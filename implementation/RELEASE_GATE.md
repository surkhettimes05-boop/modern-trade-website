# Production release gate

Decision: **NOT READY**  
Reviewed: 2026-08-14  
Scope: Nepal / NPR / `en-NP` MVP with COD customer checkout and cash POS.

## Gate evidence

| Area | Result | Evidence / blocker |
|---|---|---|
| Functional routes | Partial | Clean frontend smoke returns HTTP 200 for `/`, and the clean backend returns HTTP 200 for `/api/health`; catalog API and full browser navigation still require a running PostgreSQL-backed staging environment. |
| COD checkout | Partial | Authenticated checkout, idempotency, price/stock revalidation, reservations, order events, and order history are implemented; live DB concurrency and browser evidence are open. |
| Authentication/security | Partial | Staff sessions, lockout, revocation, CSRF, capability checks, store-scope boundaries, and production secret validation exist; complete mutation matrix and browser denial tests are open. |
| Payments | Pass for launch scope | COD/cash only; electronic providers fail closed and are not part of this release. |
| Migrations/data | Partial | Canonical manifest, checksum tracking, backup-before-migration, and repeat-safe migration design exist; staging clean/repeat and restore evidence are open. |
| Audit/compliance | Partial | Hash-linked audit records, search/export, retention policy, and provisional tax labels exist; professional Nepal VAT/IRD review and deployment-level immutability are open. |
| Quality | Partial | Backend/frontend typechecks, builds, lint baselines, and dependency audits pass; backend has 474 warnings, frontend 18 warnings, and full E2E/accessibility coverage is open. |
| Operations | Partial | Readiness health, JSON logs, immutable image workflow, and runbooks exist; Docker image/Compose, alert, rollback, and restore drills require staging infrastructure. |

## Release blockers

The release must not be promoted until risks R-021, R-023, R-025, and R-026 are closed, and R-022 receives professional approval. R-004 is mitigated by the duplicate-route fix. R-018–R-020 remain deferred capabilities and must stay disabled or visibly unavailable.

## Required approval evidence

1. Seeded staging run covering customer OTP, catalog/search/cart, COD checkout/tracking, staff login, POS cash sale, receiving, transfer, shift reconciliation, admin publication, and role/store isolation.
2. Clean migration, repeated migration, backup restore, and rollback evidence using immutable image tags.
3. Security review of authentication, authorization, CSRF, cookies, secrets, audit immutability, and sensitive mutation coverage.
4. Source-to-projection reconciliation for orders, payments, inventory, returns, and dashboard metrics.
5. Accessibility and performance results for primary customer and staff routes.
6. Alert simulations for readiness, database, queue, inventory, payment, notification, and sync failures.
7. Professional Nepal VAT/IRD tax review and sign-off.

## Decision record

- Approver: Unassigned
- Date: 2026-08-14
- Decision: NOT READY
- Accepted residual risks: None approved; open risks remain release blockers.
