# Monitoring, Backup, and Privacy Controls

## Security event routing

Drain backend structured logs and PostgreSQL `audit_events` to an access-controlled
central system. Alert on repeated `STAFF_LOGIN_FAILURE`, `STAFF_MFA_FAILURE`,
`SCOPE_ACCESS_DENIED`, `CAPABILITY_DENIED`, `ADMIN_ACCESS_DENIED`, and
`STEP_UP_MFA_REQUIRED`; unexpected `PRIVILEGED_MUTATION`; audit-write failures;
Redis/rate-limit failures; webhook validation failures; health/readiness failures;
and unusual checkout, refund, reconciliation, SMS, or infrastructure cost volume.

Every alert needs an owner, severity, threshold, paging destination, runbook link,
and tested acknowledgement path. Test alerts with synthetic QA events before
launch and quarterly. Monitor absence of expected audit events as well as spikes.

Never ingest authorization headers, cookies, JWTs, passwords, OTPs, recovery
links, provider secrets, database URLs, full payment data, or unnecessary personal
data. Limit log access, make security evidence append-only, record privileged
access, and alert on retention/export failures.

## Minimum operational queries

Operators should dashboard counts by event type, actor, store, route, result, and
time window without exposing request bodies. Investigations should correlate the
application request ID with immutable audit-event IDs and provider event IDs.
Thresholds must be based on QA/load-test baselines and reviewed after launch;
hard-coded universal thresholds would create either blind spots or alert fatigue.

## Backup and restore

- Use provider-managed encrypted backups and point-in-time recovery on private
  networking. Separate backup restore/delete permissions from application roles.
- Define and approve recovery point and recovery time objectives.
- At least quarterly, restore a production-equivalent backup into an isolated
  non-public environment, rotate imported credentials, validate migration
  checksums, run integrity checks and security tests, then securely expire it.
- Record backup identifier, dates, operators, duration, results, and deletion
  confirmation without recording data or credentials.

## Privacy decisions required before launch

The privacy owner must define justified retention and deletion periods for
customer identity/contact data, addresses, carts, orders, consent, loyalty,
staff records, security audit events, support exports, and backups. Document data
processors, processing regions, support access, legal bases/consent, deletion and
export handling, and backup-expiry implications. Production approval is blocked
until these decisions are implemented and tested with synthetic accounts.
