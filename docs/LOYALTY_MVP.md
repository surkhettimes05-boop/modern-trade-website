# Nepal loyalty MVP

## Pilot contract

The active market is `NP`, currency `NPR`, locale `en-NP`, timezone `Asia/Kathmandu`. Loyalty applies only to cash POS and COD orders. Electronic payments, tiers, birthday rewards, coalition programs, point transfers, point-to-cash conversion, campaigns, AI, and segmentation remain deferred.

Migration `022_nepal_loyalty_mvp` extends the immutable `loyalty_ledger`, makes `customer_loyalty_accounts` the account record, and uses `loyalty_programs` only for the bounded base rule. The older `loyalty_point_transactions` and `unified_loyalty_transactions` APIs are not registered and are not sources of truth.

## Customer, earn, redeem, and reversal flows

- Customers use the existing Nepal phone/OTP login. SMS must be configured; non-test environments fail closed when unavailable.
- `POST /api/loyalty/enroll` derives the customer from the secure session, requires CSRF and verified OTP status, and creates at most one account per customer/program/organization.
- `GET /api/loyalty/me` accepts no customer/account identifier and returns a restricted ownership-safe DTO.
- POS earn is in the transaction changing a sale to `COMPLETED`; COD earn is in the transaction changing a COD order to `DELIVERED`.
- Points are `floor(authoritative NPR total / 100)`. Rule version, total, currency, source, store, explanation, and balance-after are stored.
- Source uniqueness and deterministic idempotency keys make lifecycle replay safe.
- `POST /api/loyalty/staff/sales/:saleId/redeem` accepts points and an idempotency key only. Customer, store, organization, amount, currency, and actor come from locked trusted records. It requires CSRF, `loyalty.redeem`, staff scope, a completed sale, configured limits, and sufficient balance. A database check prevents negative accounts.
- POS void/return and delivered-COD cancellation/refund create immutable compensating `REVERSAL` entries referencing the original earn. If points were already spent, reversal is limited to available points and becomes an operator-review exception; the account never goes negative.

Partial-refund amounts remain authoritative in the POS/order subsystem. Future partial automation must use this compensating pattern and must not reactivate the legacy client-driven endpoints.

## Authorization, audit, and reconciliation

Capabilities are `loyalty.read`, `loyalty.redeem`, and `loyalty.adjust`. Redemption validates organization/store scope and writes an `audit_events` record containing the authenticated actor, capabilities, scope, sale, points, and correlation key. Manual adjustment has no public route in this pilot; approved recovery uses an idempotent compensating entry, never an update/delete.

Run authenticated `GET /api/loyalty/staff/reconciliation` daily and alert on any negative account, account/ledger mismatch, posted orphan entry, or duplicate idempotency key.

Recovery: stop mutations for the affected organization, preserve ledger/audit evidence, find the first divergent source event, post an approved idempotent compensating entry, rerun reconciliation, and record the incident/correlation ID. Never rewrite ledger history.

## Controlled-pilot release gate

1. Migration and Nepal seed run twice successfully.
2. Backend lint, type-check, Jest, and build pass without skips, `only`, or forced exit.
3. Frontend lint, type-check, and production build pass.
4. Real Chromium desktop/mobile, Firefox, and WebKit cover OTP login, enrollment, POS earn/replay/void, delivered-COD earn/cancel, redemption, insufficient balance, ownership denial, and logout.
5. Axe finds no serious/critical issues on loyalty states.
6. PostgreSQL and Redis readiness pass.
7. A real SMS provider delivers Nepal OTPs; fake OTP success is prohibited.
8. Daily reconciliation scheduling and alert delivery are proven.
9. `git diff --check` passes and operators approve recovery/payment interaction docs.

Missing SMS, deployed-environment proof, scheduler/alert proof, or full browser journeys means **NOT READY** for a controlled loyalty pilot.
