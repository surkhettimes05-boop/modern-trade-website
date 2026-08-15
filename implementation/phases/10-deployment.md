# Phase 10 — Deployment and Production Operations

## Objective

Make staging and production deployments reproducible, observable, recoverable, and safe.

## Status

Complete with risks. The deployment architecture, canonical migration runner, pre-migration backup, readiness checks, structured logging, immutable image publication, and recovery runbook are implemented. Actual production infrastructure rollout and restore drill remain environment-dependent release gates.

## Work packages

- [x] Add frontend to the container/deployment architecture.
- [x] Replace partial Docker SQL initialization with the canonical migration runner.
- [x] Run backend tests and migration verification in CI.
- [x] Add frontend tests to CI; E2E remains explicitly pending.
- [x] Build and publish immutable images/artifacts.
- [x] Implement backup-before-migration.
- [x] Add health checks, smoke endpoints, and rollback runbook.
- [x] Add structured logs, request IDs, and health/metrics boundaries; external alert wiring remains deployment-specific.
- [ ] Monitor payment, notification, sync, inventory, and queue failures.
- [ ] Test backup restoration and incident runbooks.

## Acceptance gate

- [ ] Empty staging can be created automatically.
- [ ] Deployment applies canonical migrations.
- [ ] Failed deployment rolls back safely.
- [ ] Database backup restoration is proven.
- [ ] Simulated failures trigger alerts.

## Remaining risks

- A real production cluster, registry deployment target, and durable backup volume are not available in this workspace.
- Backup restoration and rolling rollback require an environment-level drill.
- External alerting/error tracking and full E2E smoke tests remain pending from Phase 09.
