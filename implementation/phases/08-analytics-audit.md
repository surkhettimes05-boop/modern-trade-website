# Phase 08 — Analytics, Audit, and Compliance

## Objective

Complete trustworthy operational metrics, immutable audit coverage, and reviewed compliance outputs.

## Status

Complete with risks. Analytics event processing, targeted refresh boundaries, metric documentation, tamper-evident audit search/export, retention controls, and provisional compliance labeling are implemented. Full reconciliation and professional tax review remain release gates.

## Work packages

- [x] Finish inventory analytics event processing.
- [x] Implement targeted projection refresh.
- [x] Define and document metric formulas and ownership.
- [ ] Reconcile dashboards with source transactions.
- [ ] Audit login, permissions, prices, inventory, orders, payments, refunds, staff, and roles.
- [x] Add audit search and export.
- [x] Implement data retention policies.
- [ ] Verify consent and data-request workflows.
- [x] Mark unreviewed tax/compliance outputs provisional.
- [ ] Obtain professional review for market-specific tax rules.

## Acceptance gate

- [ ] Metrics reconcile to source data.
- [ ] Every sensitive mutation records actor, scope, timestamp, and outcome.
- [ ] Audit records cannot be silently changed.
- [ ] Compliance reports distinguish verified from provisional fields.

## Remaining risks

- Inventory and sales refresh functions update freshness and materialized views, but source-to-dashboard reconciliation still needs seeded live-data evidence.
- Audit hash chaining is append-oriented but requires database permissions/triggers to fully prevent direct table updates in every deployment.
- Retention periods are documented in the release controls but deletion jobs and professional Nepal VAT/IRD review remain pending.
