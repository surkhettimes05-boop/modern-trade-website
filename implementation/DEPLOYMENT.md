# Phase 10 deployment and recovery runbook

Last updated: 2026-08-14

## Architecture

The compose stack contains PostgreSQL, Redis, the backend, and the Next.js frontend. The frontend is built with `API_URL=http://backend:3001`; it does not point at localhost inside the container. The backend starts only after `deploy:migrate` has created a custom-format PostgreSQL backup and applied the canonical migration manifest.

## Reproducible deployment

```text
docker compose -f backend/docker-compose.yml config
docker compose -f backend/docker-compose.yml build
docker compose -f backend/docker-compose.yml up -d
curl http://localhost:3001/api/health/ready
curl http://localhost:3000/
```

Production requires the core secrets validated by the application. `DEFAULT_MAP_PROVIDER` is empty by default; optional providers and electronic payments remain fail-closed.

## Backup and rollback

Before each migration, `deployMigrate` runs `pg_dump --format=custom` into `DATABASE_BACKUP_DIR` (default `/var/backups/storesync`). Preserve that directory on durable storage. To restore a backup, stop application writes, create a clean target database, run `pg_restore --clean --if-exists`, validate `/api/health/ready`, then redeploy the previously known-good image tag. Never roll back application code across an already-applied incompatible migration without restoring the database backup.

## Health and observability

`/api/health` is liveness; `/api/health/ready` checks database readiness; `/api/health/db` checks connectivity; `/api/health/integrations` reports non-secret provider state. Production logger entries are JSON with level, message, timestamp, and context. Container health checks use readiness, and CI publishes immutable image tags based on the commit SHA.

## Incident checks

For migration failure, keep the failed container stopped, retain the backup, inspect the migration error, and restore only after approval. For database or Redis degradation, remove the instance from traffic and use readiness plus logs. For queue/payment/notification/inventory failures, preserve source records and event IDs; replay only through the existing idempotent worker paths.
