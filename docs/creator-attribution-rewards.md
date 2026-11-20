# Creator Attribution & Rewards — Commerce System Contract

Status: approved implementation contract. Initial reward rate: **1.00%**.

## System ownership
- `modern-trade-website` is the central attribution and reward ledger.
- `Pasalho-lite` remains authoritative for physical POS sales, payments, returns and customer phone identity.
- Commerce orders remain authoritative in the commerce database.
- No third backend, shared database, Redis dependency or synchronous cross-database transaction.

## Customer acquisition
- Admin creates a creator with a unique immutable creator code and referral slug.
- Public referral route records a random opaque visit token; store only its SHA-256 hash.
- Referral link and QR resolve to the same route.
- Referral visit is valid for 30 days.
- On successful verified customer registration, the registration flow atomically attaches the creator to that customer only if no existing attribution exists and the visit is within its validity window.
- A customer may have exactly one acquisition creator. Attribution is immutable after registration; admin corrections require audited override workflow.
- Manual POS referral code is permitted only for an un-attributed customer, with an explicit cashier input and admin-auditable evidence.

## Reward calculation
- Default reward rate is 1.00%, configurable by an authorized administrator.
- Calculate from server-authoritative eligible net merchandise spend, in NPR, after discounts and excluding delivery, cancelled items, refunds and non-merchandise charges.
- Use decimal arithmetic and round half-up to 2 decimal places.
- Rate is snapshotted on each purchase event; later setting changes do not rewrite history.
- Create a pending reward event only for a successfully completed/paid transaction.
- Make rewards available after the configured hold period (initially 14 days).
- Full/partial refunds create compensating negative ledger entries; never edit or delete historical reward evidence.
- Purchase event idempotency key is (source system, source transaction ID). Same ID with a different payload hash is a conflict.
- No creator credit for anonymous customers, unverified registrations, self-referrals, duplicate customer accounts or failed/cancelled orders.

## Cross-system integration
- POS sends signed HTTPS event to commerce backend after successful sale finalization; POS must not wait for the network to commit a sale.
- POS uses a durable outbox in its own PostgreSQL database; retry with exponential backoff and stable event key.
- HMAC-SHA256 signature covers timestamp + raw request body; reject stale timestamps and invalid signatures. Store secret only in deployment environment.
- Event contains customer external ID/normalized phone hash, transaction ID, net eligible spend, currency, completion timestamp and payload version. Do not send full phone number unless required for customer identity resolution.
- Commerce backend validates signature, deduplicates event, resolves customer by privacy-safe stable identifier, looks up immutable attribution, computes reward and writes purchase event + reward ledger atomically.
- Commerce-to-POS customer identity mapping must be deterministic and verified; never match by unverified phone text.
- A retry after timeout must return the original accepted result.

## Admin and creator views
- Admin: create/pause creator, copy referral URL, download QR, inspect scans, registered customers, first buyers, online/offline sales, net attributed spend, pending/available/paid rewards, refunds and audit trail.
- Creator self-service portal is a later phase; V1 admin can export/share creator statements.
- Creator sees aggregate metrics only, never customer phone numbers or personally identifiable purchase details.

## Acceptance gates
1. Referral link and QR resolve to same creator and record visit.
2. Verified registration attributes once; duplicate registration cannot overwrite creator.
3. Expired referral, paused creator and unverified customer do not attribute.
4. Online paid order creates exactly one pending reward.
5. POS event creates exactly one pending reward; timeout/retry creates no duplicate.
6. Same source transaction with altered payload is rejected.
7. Partial/full refund reverses the corresponding reward proportionally.
8. Hold-period approval is idempotent.
9. Creator cannot read another creator's customers or sales.
10. POS sale finalization succeeds when commerce attribution service is unavailable; outbox retries later.
11. No rewards for anonymous or unmatched customers.
12. Decimal rounding, concurrency, signature replay, unauthorized admin and audit tests pass.
