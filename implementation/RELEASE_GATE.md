# Nepal pilot production release gate

Decision: **NOT READY**

Reviewed: 2026-08-19

Scope: Nepal (`NP`) / NPR / `en-NP` / `Asia/Kathmandu`; customer COD and staff cash POS only.

## Verified evidence

| Area | Result | Evidence |
|---|---|---|
| Market configuration | Pass | Nepal is the only launch market. Production startup rejects India, conflicting locale/currency/timezone/tax settings, and enabled deferred features. India remains a future registry entry only. |
| Launch scope | Pass | COD/cash core paths remain registered. Electronic payments, loyalty, advanced analytics, returns, promotions, segments, offline sync, hardware, CMS/CDN, and fiscal integration are disabled by default and fail closed in production. |
| Native dependencies | Pass | Local PostgreSQL accepted all 20 migrations, the Nepal seed, application queries, and readiness checks. The Redis-compatible local service returned `PONG`; backend readiness included database, migration, and Redis checks. |
| Backend quality | Pass | Full Jest suite, TypeScript, lint, and production build complete without forced Jest exit. Focused auth, payment, market, health, error-envelope, and redaction tests pass. |
| Frontend quality | Pass | TypeScript, lint, and production build pass. All 16 release journeys passed across Chromium desktop, Chromium mobile, Firefox, and WebKit; all 9 Chromium axe scans reported no serious or critical violations. |
| Staff authentication | Pass for tested scope | Seeded platform admin login, session lookup, scoped operations entry, and CSRF-protected logout passed in every browser engine. The role migration restores required shift/reconciliation/device capabilities. |
| Payment safety | Pass for COD/cash scope | Electronic initiation, callback, reconciliation, and refund paths reject unavailable or uncertified provider contracts. No mock success URL or refund ID is returned. |
| Recovery/operations | Implemented, drill open | Backup/migrate/restore/rollback and dependency-failure procedures are documented; readiness fails when a required dependency fails. Docker drill evidence is unavailable on this host. |

## Release blockers

1. Docker and Docker Compose are not installed on the certification host. The Docker QA topology, dependency stop/start drill, backup, restore, rollback, and immutable-image deployment therefore remain unverified.
2. No real SMS provider is configured. Customer OTP delivery and the complete authenticated COD order/tracking browser journey cannot be certified. The backend now fails delivery closed and invalidates an undelivered OTP.
3. No Nepal-approved electronic payment provider credentials or certified callback/refund contract are available. Electronic payment features must remain disabled; see `docs/PAYMENT_EXTERNAL_REQUIREMENTS.md`.
4. Staff POS sale, purchase receiving, stock adjustment/transfer, cash reconciliation, and admin publication still need end-to-end browser evidence against a production-equivalent deployment.
5. Nepal VAT/IRD interpretation and receipt/invoice content require professional review before any claim of fiscal compliance.
6. Restore/rollback, alert delivery, centralized log retention, TLS/domain, secrets manager, and production backup retention require deployment-environment evidence.

## Required approval evidence

1. Run `npm run qa:certify` on a host with Docker Compose; retain the already passing Chromium, Firefox, WebKit, and axe results in the deployment evidence bundle.
2. Execute and retain a successful database backup/restore and application rollback drill using immutable image tags.
3. Configure an approved Nepal SMS provider and pass valid, invalid, expired, reused, rate-limited, and delivery-failure OTP journeys without logging PII or codes.
4. Complete seeded customer, staff, and admin journeys, including denied cross-role and cross-store attempts.
5. Record alert simulations, centralized log/redaction review, TLS/domain verification, and professional Nepal VAT/IRD sign-off.

## Approval record

- Approver: Unassigned
- Decision: **NOT READY**
- Accepted residual risks: None
