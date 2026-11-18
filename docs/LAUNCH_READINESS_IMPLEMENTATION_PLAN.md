# Pasalho Launch Readiness Implementation Plan

**Status:** Active implementation plan  
**Owner:** Pasalho launch team  
**Scope:** Launch-critical customer commerce, POS/warehouse operations, creator attribution, app, management visibility, and production verification.  
**Rule:** Do not declare launch-ready based on local tests alone. Production readiness requires evidence from deployed systems and a real end-to-end transaction.

## Executive objective

Move Pasalho from a fragmented set of repositories and open pull requests to a coherent, tested, deployed launch system that can safely accept customers and fulfil orders in Birendranagar.

Launch scope is deliberately constrained:
- Nepal only; NPR; Asia/Kathmandu.
- Cash on Delivery (COD) for online orders and cash POS.
- No launch dependency on card, eSewa, Khalti, Fonepay, online payment settlement, offline POS sync, returns automation beyond explicitly tested flows, or advanced promotions.
- Inventory and fulfilment must be server-authoritative.
- No feature is considered complete until integration and production evidence exists.

## Repository ownership map

| Repository | Launch responsibility | Required proof |
|---|---|---|
| `modern-trade-website` | Customer website, commerce APIs, customer identity, catalog/cart/checkout/orders, creator attribution and admin analytics | Fresh customer can browse, register, checkout COD, see order status; creator attribution and rewards are accurate |
| `modern-trade-app` | Flutter customer app consuming canonical commerce APIs | Same customer/order journey as web; release build and app-specific validation |
| `Pasalho-lite` | POS, store/warehouse operations, purchases, inventory, transfers, cash operations, creator POS events | Cash sale changes stock and records correct cost; purchase/transfer/return evidence reconciles |
| `ceodashboard` | Management reporting and operational visibility | Metrics reconcile against canonical sources; no misleading mock/stale totals |
| Creator integration across website + Lite + app | QR/referral attribution, purchase attribution, COGS/profit, reward ledger, approval and manual payout | One creator journey proven across online and offline sales, return reversal, payout evidence |

## Operating rules

1. **Production protection:** do not merge/deploy production-impacting changes without explicit approval. Prepare PRs, test them, and clearly identify the required approval.
2. **No blind PR merging:** overlapping checkout/COD/release PRs must be compared against current main and each other. Merge only a coherent dependency chain.
3. **Canonical contracts:** customer commerce is authoritative for customer/order identity and online orders. Lite is authoritative for POS/store operational events and local stock movement. Cross-system messages must be authenticated, idempotent, replay-safe, and observable.
4. **Inventory safety:** never trust client-supplied stock, price, fulfillment, reward, or cost values. Server-side validation and authoritative records must decide.
5. **Evidence:** every phase has a checklist, tests, a result, and links to commits/PRs/deployments. A test claimed by a PR must be rerun or verified against the relevant commit.
6. **Launch scope freeze:** defer nice-to-have features. Fix P0/P1 launch blockers first.

## Phase 0 — Establish baseline and protect production

### Tasks
- Inventory default branches, open PRs, commit freshness, CI status, deploy configuration, environment requirements, migrations, and existing release notes for every launch repo.
- Identify stale, duplicate, conflicting, and dependency-blocked PRs.
- Build a dependency graph for creator attribution/rewards/COGS/reversals and COD checkout/release hardening.
- Record current production and staging URLs, commit SHAs, deployment status, and health-check results.
- Confirm production data and secrets are not exposed in logs, screenshots, PRs, or tests.

### Exit criteria
- A baseline table exists with repo, branch/commit, CI, deploy, blockers, and risk.
- Every open launch PR is classified: merge candidate, rebase/fix, superseded, defer, or close.
- No production change has been made during audit.

## Phase 1 — Customer commerce and COD release path

### Website/backend tasks
- Reconcile overlapping COD checkout, Nepal COD readiness, customer identity, Google sign-in/phone linking, order alerts, fulfillment hardening, and V1 release PRs.
- Confirm checkout uses server-owned prices, catalog availability, inventory checks, fulfillment assignment, and order status.
- Confirm a new COD order is created in the correct state (received/accepted according to canonical state machine) and is not incorrectly marked pending online payment.
- Verify cart validation, duplicate submission protection, idempotency, address/phone validation, order confirmation, and customer order history.
- Confirm customer-facing error states and operational notifications do not leak secrets.
- Validate catalog completeness: real sellable products, correct names, MRP/selling price, units, images, and stock availability.

### Tests
- Unit/integration tests for checkout validation and order state transitions.
- Authenticated/unauthenticated checkout and customer order-history tests.
- Duplicate/replay submission tests.
- Stock unavailable, price changed, invalid address/phone, server error, and retry tests.
- Fresh COD order end-to-end against staging.

### Exit criteria
- A fresh customer can complete COD checkout on the deployed web system.
- Order appears in admin/operations with correct status and details.
- No payment-provider dependency exists for COD.
- Evidence includes request/order IDs, timestamps, deployment commit, and screenshots or sanitized logs.

## Phase 2 — POS, warehouse, purchasing, and inventory

### Tasks
- Reconcile Pasalho-lite launch runtime, canonical pricing, database migration, Vercel compatibility, and purchase/transfer PRs.
- Verify fresh database migration sequence and rollback/recovery expectations.
- Verify purchase receipt increases stock and captures cost.
- Verify weighted-average cost calculations are correct and deterministic.
- Verify warehouse-to-store transfer: source decrement, destination increment, in-transit/received state as designed, and audit trail.
- Verify POS sale decrements inventory and records cash tender, customer receipt, and cost snapshot.
- Verify stock adjustment permissions, audit log, and duplicate action protection.
- Confirm operational UX supports the launch team without hidden/mock data.

### Tests
- Fresh PostgreSQL migration run.
- Purchase receipt, transfer, POS sale, return/refund, and stock adjustment tests.
- Weighted-average cost calculations and missing-cost behavior.
- Concurrent sale/stock validation and idempotency.
- Canonical pricing/checkout E2E.

### Exit criteria
- Warehouse purchase → store transfer → POS sale is proven on staging.
- Inventory and cash movement reconcile exactly.
- No mock pricing or mock inventory is used in launch paths.

## Phase 3 — Creator attribution and profitability

### Tasks
- Reconcile creator attribution/rewards PRs across website and Lite in dependency order.
- Verify creator profile, referral link, QR code, first-touch attribution rules, registration attribution, attribution expiry, and anti-self-referral rules.
- Verify online paid/COD lifecycle events are attributed exactly once according to reward policy.
- Verify POS sales are signed and delivered through authenticated, replay-safe event ingestion.
- Verify COGS snapshots for online order lines and POS sales.
- Verify reward ledger is append-only; approvals and manual payouts are auditable.
- Verify POS returns/refunds reverse the corresponding creator reward once, without reversing unrelated or already-reversed events.
- Creator admin dashboard must show revenue, attributed transactions, cost coverage, gross profit/contribution, reward liability, approvals, and payout history. Rankings must exclude incomplete cost evidence where policy requires.
- Creator-facing dashboard/app must expose only the creator's own data and use secure sessions.

### Tests
- QR/referral visit → registration → online order → attribution → reward accrual.
- QR/referral visit → registration → POS sale → attribution → cost evidence → reward accrual.
- Return/refund → reward reversal exactly once.
- Approval → manual payout record → balance reconciliation.
- HMAC signature failure, replay, duplicate event, missing COGS, partial cost coverage, and cross-creator authorization tests.

### Exit criteria
- One complete online and one complete POS creator journey pass against deployed staging.
- COGS and contribution calculations reconcile to underlying sale lines.
- Reward ledger, reversals, approvals, and manual payouts reconcile.
- Admin and creator dashboards are verified against real attributed transactions, not fixtures.

## Phase 4 — Customer app release readiness

### Tasks
- Reconcile app V1 release PRs, COD delivery/retry contract, campaign integration, Google sign-in, and creator dashboard PR.
- Ensure app uses the canonical backend and shares customer/order semantics with web.
- Validate OTP/authentication, Google sign-in (if launch-enabled), catalog, cart, checkout, order history, notifications, and error/retry behavior.
- Keep app feature scope aligned with Nepal COD launch; disable or remove unsupported payment paths.
- Run Flutter formatting, analyzer, unit/widget tests, release build, and device/emulator smoke tests.

### Exit criteria
- App release build is reproducible.
- Customer can complete a COD order and see it in order history.
- App and web use the same canonical customer/order backend.
- All launch-enabled authentication flows are verified; unverified flows are disabled.

## Phase 5 — CEO dashboard and operational visibility

### Tasks
- Audit `ceodashboard` for mocked data, stale APIs, incorrect multi-store aggregation, and mismatched business definitions.
- Validate sales, order counts, inventory, purchase, transfer, cash, receivables, creator performance, reward liabilities, and contribution metrics against source systems.
- Ensure filters/store selection do not mix data or double count.
- Clearly label unavailable, stale, or incomplete data. No fake zeroes or fabricated success states.
- Add actionable operational signals: what needs action, why, owner, and next step.

### Tests
- API/data contract tests.
- Store isolation and multi-store aggregation tests.
- Reconciliation tests against known fixture/source totals.
- Empty, stale, unavailable, and partial-data behavior.

### Exit criteria
- CEO dashboard figures reconcile to source records for at least one controlled dataset and deployed staging environment.
- Dashboard can distinguish healthy, stale, incomplete, and failed data.

## Phase 6 — Security, configuration, and production readiness

### Tasks
- Verify all required environment variables, secret consistency across systems, rotation procedure, and production/staging separation.
- Verify OTP, session, Google auth, HMAC event security, API authorization, rate limits, and replay protection.
- Confirm database backup/restore and migration process.
- Confirm monitoring/logging, error alerting, and health checks.
- Confirm CORS, webhook verification, PII handling, and safe logs.
- Verify Nepal configuration: NPR, phone formats, timezone, address/fulfillment, and legal/operational constraints.
- Confirm deployment rollback procedures and owner access.

### Exit criteria
- Security checklist passes.
- Required secrets/configuration are present in production and not exposed.
- Health checks, logs, and alerts are usable.
- Backup and rollback procedure is documented and tested or explicitly risk-accepted.

## Phase 7 — Staging end-to-end certification

Run the following scenarios on deployed staging, using fresh test identities and real integration paths:

1. Customer registration/login.
2. Browse real catalog and add items to cart.
3. COD checkout.
4. Order appears in operations with correct state and fulfillment.
5. POS cash sale with stock decrement and COGS.
6. Warehouse purchase receipt.
7. Warehouse-to-store transfer.
8. Store POS sale after transfer.
9. Creator QR/referral registration.
10. Creator-attributed online sale.
11. Creator-attributed POS sale.
12. Creator return/refund and reward reversal.
13. Creator reward approval and manual payout evidence.
14. Admin/CEO dashboard reconciles against these transactions.
15. App journey mirrors web journey.
16. Failure tests: duplicate request, bad signature, unavailable stock, server failure, retry, and unauthorized access.

### Evidence package
For each scenario record:
- scenario ID and result;
- commit SHA and deployment URL;
- sanitized order/event/transaction IDs;
- timestamp and environment;
- expected vs actual state;
- test output or screenshot;
- unresolved issue, if any.

## Phase 8 — Launch decision and controlled production smoke test

### GO criteria (all mandatory)
- No unresolved P0/P1 launch blocker.
- All migrations applied successfully and database state verified.
- Production deployment corresponds to reviewed commits.
- Website COD journey passes.
- POS cash sale and inventory reconciliation pass.
- Warehouse purchase/transfer path passes.
- App release build and COD journey pass, or app is explicitly excluded from launch.
- Creator features are either fully certified or explicitly disabled for launch.
- Dashboard metrics are verified or clearly excluded from launch operations.
- Security/configuration checklist passes.
- Rollback and incident owner are known.
- Production smoke test is performed with a controlled low-risk transaction and reconciled/voided according to policy.

### NO-GO conditions
- Orders can be lost, duplicated, or incorrectly charged.
- Inventory can go negative or be double-consumed.
- COD order state is incorrect.
- Production API health is unstable.
- Creator rewards can be duplicated, unreversed, or calculated without required evidence.
- Cross-store data leaks or dashboard figures materially mislead.
- Required production secrets/configuration are missing.
- No rollback or operational owner exists.

## Work sequence and dependency order

1. Phase 0 baseline and PR dependency map.
2. Website COD/commerce release chain.
3. Lite launch runtime + canonical pricing + migrations.
4. POS/warehouse purchase, transfer, sale, cost evidence.
5. Creator attribution foundation across website/Lite.
6. Creator profitability/COGS + returns/reversals + reward ledger.
7. Admin creator analytics and creator-facing app/dashboard.
8. Customer app release reconciliation.
9. CEO dashboard correctness.
10. Security/configuration hardening.
11. Staging certification.
12. Production GO/NO-GO and controlled smoke test.

## Definition of done for every PR

- Scope is launch-relevant and documented.
- PR is based on current target branch and dependency PRs.
- Conflicts are reconciled, not blindly resolved.
- CI passes; relevant tests are rerun.
- Migration has been tested on a fresh database and upgrade path where applicable.
- Integration tests cover real contracts.
- Security and authorization reviewed.
- Deployment behavior is verified on staging.
- PR includes evidence, risk, rollback, and remaining limitations.
- Merge is approved by repository owner.

## Launch tracking template

| Workstream | Status | PR/commit | CI | Staging proof | Blocker | Owner/next action |
|---|---|---|---|---|---|---|
| Website COD | Not started | | | | | |
| Lite runtime/POS | Not started | | | | | |
| Purchasing/transfers | Not started | | | | | |
| Creator attribution | Not started | | | | | |
| Creator COGS/reversals/payout | Not started | | | | | |
| Customer app | Not started | | | | | |
| CEO dashboard | Not started | | | | | |
| Security/config | Not started | | | | | |
| Staging certification | Not started | | | | | |
| Production GO/NO-GO | Not started | | | | | |

## Immediate next actions

1. Recheck current PRs and branches against this plan; the prior audit snapshot is not treated as current until refreshed.
2. Build the PR dependency/reconciliation matrix and identify the smallest safe merge sequence.
3. Start with the highest-risk launch path: fresh COD order on website → operational visibility → fulfillment → stock/cash reconciliation.
4. Do not deploy to production or merge production-impacting PRs without approval.
