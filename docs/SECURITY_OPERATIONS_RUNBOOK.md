# Security Operations Runbook

## Purpose

This runbook covers the external controls that source code cannot complete:
credential rotation, deployed configuration verification, monitoring,
containment, evidence preservation, backup recovery, and provider shutdown.
Never record secret values in this document, tickets, logs, or screenshots.

## Security ownership

Assign named primary and backup responders for application, database, hosting,
identity/SMS, and customer communications. Maintain a private contact tree and
an out-of-band communication channel that does not depend on the affected
production accounts.

## Required alerts

Route the following structured events and platform signals to the monitored
security channel:

- OTP, password, and MFA failures or lockouts above the agreed threshold;
- unusual growth in SMS spend, request volume, 401/403/429 responses, or 5xx;
- cross-store scope denials and privileged-administration denials;
- administrator bootstrap, creation, enable/disable, password, MFA, role,
  capability, or session-revocation changes;
- database role-posture or migration identity failures;
- migration, backup, restore, readiness, Redis, or queue failures;
- invalid/replayed webhook signatures and reconciliation mismatches;
- unexpected enabling of a deferred feature;
- WAF, origin, TLS certificate, DNS, or deployment-provenance changes.

Every alert needs an owner, severity, response target, escalation path, and a
tested link to the relevant investigation procedure.

## Log safety and retention

Central logs may contain correlation IDs, actor/resource identifiers needed
for investigation, result codes, and timestamps. They must not contain
passwords, cookies, authorization headers, OTPs, reset URLs, secret values,
database/Redis URLs, full payment data, or unrestricted request bodies.

Restrict log access, enable tamper-resistant retention, record administrative
access, define retention by legal/business need, and test deletion. Provider
and edge logs must follow the same rules.

## Credential rotation order

1. Contain access: disable affected accounts/integrations and preserve logs.
2. Create a new secret in the provider secret manager without deleting the old
   value until dependent services are ready.
3. Deploy consumers of the new value and verify health/security behavior.
4. Revoke the old value and confirm it is rejected.
5. Revoke affected application sessions and rotate dependent signing material
   when compromise could permit token forgery.
6. Record identifier, owner, start/end time, affected environments, validation,
   and old-value revocation. Never record either value.

Database runtime and migration credentials must remain independent. JWT,
cookie, OTP-HMAC, encryption, payment, webhook, SMS, CI, and hosting secrets
must also be unique across production, preview, QA, and development.

## Administrator compromise

1. Disable the staff identity and revoke every server-side session.
2. Preserve authentication, authorization, audit, deployment, database, and
   provider logs using correlation IDs.
3. Rotate the account password and MFA enrollment; rotate application secrets
   if token signing or secret access may have been exposed.
4. Review role/capability, staff, store, order, inventory, loyalty, payment,
   webhook, and configuration changes made during the exposure window.
5. Restore affected records only through reviewed transactions/migrations.
6. Confirm clean login, MFA, least privilege, alerting, and session revocation
   before re-enabling the identity.

## Suspected data exposure

1. Stop the affected route or service without destroying evidence.
2. Preserve immutable logs and the exact deployed artifact digest.
3. Determine affected data types, subjects, stores, time range, and access path.
4. Rotate credentials and isolate database/provider access as appropriate.
5. Consult the responsible privacy/legal owner for notification obligations.
6. Patch and reproduce the fix in isolated QA, run regression/release gates,
   and independently review before redeployment.

## Payment or provider compromise

Electronic payments remain disabled until separately certified. If any
provider is suspected:

1. Disable its feature flag and revoke its credentials/callbacks.
2. Preserve provider IDs, signatures, timestamps, application correlation IDs,
   and reconciliation state without storing secret material.
3. Do not infer payment success from client state. Reconcile against the
   provider through an authenticated operator process.
4. Prevent duplicate refunds/fulfilment and require approval for corrective
   financial changes.

## Database recovery

Follow `docs/PRODUCTION_RECOVERY_RUNBOOK.md`. Restore into a new isolated
database, never over the damaged source. Use the migration role for schema
work and the runtime role for application smoke tests. Verify migration 027,
runtime role posture, RLS policies, row counts/invariants, cross-store tests,
and backup encryption/access before switching traffic.

## Evidence checklist

For every incident or exercise capture:

- incident/exercise identifier, severity, owner, and timeline;
- affected immutable artifact and configuration version;
- correlation IDs and sanitized provider/database evidence;
- containment and rotation actions;
- scope and customer/business impact;
- recovery validation and independent reviewer;
- follow-up owner, deadline, and regression test.

## Exercise schedule

- Monthly: privileged-access and deferred-feature review.
- Quarterly: secret/session rotation exercise and alert-routing test.
- Quarterly: encrypted point-in-time backup restore into isolation.
- Twice yearly: administrator takeover/data exposure tabletop.
- Annually and before major launch: independent staging penetration test.
- Every release: immutable artifact, role posture, full-stack test, and
  production configuration evidence.
