# Production recovery runbook

## Before migration

Use `node dist/database/deployMigrate.js`. It creates a PostgreSQL custom-format dump in `DATABASE_BACKUP_DIR` before invoking the canonical migration runner. Confirm the dump is on durable storage and periodically test it with `pg_restore --list`. Never continue when backup creation fails.

## Restore and rollback

1. Remove the instance from traffic, preserve logs/request IDs, and stop writers/queues.
2. Create a new empty recovery database; do not overwrite the damaged database.
3. Run `pg_restore --clean --if-exists --no-owner --dbname=<recovery-url> <dump>`.
4. Run integrity, migration-state and smoke checks against recovery.
5. Point a canary at recovery, verify customer/staff scope and order totals, then switch traffic.
6. Application rollback uses the previous immutable image. Database rollback uses restore or a reviewed forward migration; never edit an applied checksum.

## Failure procedures

- Migration: the runner rolls back the current transaction. Keep traffic blocked and restore to a new database if validation shows external side effects.
- Database: readiness returns 503. Stop checkout/POS writes, fail over or restore, then verify migration 020.
- Redis: readiness returns 503 and startup fails closed. Restore Redis, verify `PING`, restart backend and confirm readiness.
- Payment: electronic routes are disabled. For COD, preserve the idempotency key and verify no order exists before retrying.
- Queue/notification: retain outbox rows, alert on oldest-pending age, restore the worker/provider, and replay idempotently. Never fabricate delivery success.
- Integration: disable its configuration, preserve request IDs/provider references, and continue only the certified core path.

## Monitoring and alerts

Probe `/api/health/live` for liveness and `/api/health/ready` for database/migration/Redis readiness. Alert on readiness failure, restart loops, migration/backup failure, authorization denial spikes, checkout error rate, outbox age, queue retry exhaustion and webhook signature failures. `/api/health/integrations` reports state without secrets.

Structured errors include request IDs. Logs must not contain authorization headers, cookies, credentials, phone numbers, email addresses or customer/address fields.
