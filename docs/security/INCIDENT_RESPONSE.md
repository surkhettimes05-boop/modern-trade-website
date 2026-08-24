# Incident Response Runbook

## Activation and ownership

Declare an incident for suspected credential theft, administrator takeover,
cross-store/customer access, data exposure, payment abuse, destructive database
activity, provider compromise, or sustained availability attack. Assign an
incident commander, security lead, operations lead, communications owner, and
scribe. Record times in UTC and identifiers only; never copy secret values into
the incident record.

## First 30 minutes

1. Preserve relevant immutable logs, release digests, audit-event IDs, provider
   event IDs, and database snapshots. Do not destroy the affected environment.
2. Contain the smallest safe scope: disable the affected account/integration or
   feature flag, revoke sessions/API keys, and block confirmed abusive sources.
3. If integrity is uncertain, stop privileged mutations or place the product in
   maintenance mode while preserving read-only evidence access.
4. Identify the last known-good release and configuration version.
5. Notify the accountable security owner and legal/privacy owner when personal
   or payment data may be involved.

## Credential compromise order

Rotate high-impact credentials in dependency order so new validation remains
available: deployment/cloud identity, database migration role, database runtime
role, JWT signing secret, cookie secret, OTP hash secret, encryption/signature
keys, Redis, SMS/email/payment/webhook providers, then lower-privilege API keys.
Revoke old values and sessions; do not merely create a second active key. Confirm
the old credential is rejected and record only key IDs and timestamps.

If encryption keys protect stored data, use a reviewed key-version migration;
never delete an old decrypt key before protected records have been re-encrypted
and recovery tested.

## Scenario containment

- **Administrator takeover:** disable the account, revoke all sessions, rotate
  recovery/MFA material, inspect role/capability and staff mutations, and require
  a second administrator to restore access.
- **Cross-tenant access:** disable the affected endpoint if necessary, preserve
  authorization-denial and audit events, identify resource IDs touched, verify
  authoritative scope resolvers, and notify impacted data owners as required.
- **Database compromise:** remove runtime traffic, revoke the compromised role,
  rotate both DB identities, inspect schema/object ownership and audit evidence,
  restore into an isolated environment, and compare against the last known-good
  migration manifest.
- **Payment/provider abuse:** keep electronic payments disabled, revoke provider
  credentials/webhooks, reconcile provider records against server-authoritative
  orders, and require manual approval before re-enablement.
- **Availability/cost attack:** enable edge attack controls, tighten distributed
  rate limits and provider spend caps, preserve samples, and avoid blocking broad
  customer populations without review.

## Recovery and closure

Restore only an immutable reviewed artifact. Run health, authentication,
authorization, migration, dependency, and browser release gates before traffic
returns. Monitor elevated signals for at least 24 hours. Complete a timeline,
root cause, affected-data assessment, required notifications, corrective actions,
owners, and deadlines. A different reviewer must verify high-severity fixes.

Run a tabletop exercise before launch and at least twice yearly. Exercise session
revocation, a key rotation, provider shutdown, evidence export, and isolated
database restore.
