# Security Policy

## Reporting a vulnerability

Do not open a public issue containing exploit details, customer data, credentials,
or provider identifiers. Send a private report to the repository security owner
with the affected component, impact, safe reproduction steps, and suggested fix.
The project owner must configure a monitored private reporting address or enable
GitHub private vulnerability reporting before production launch.

The responder should acknowledge a report within two business days, assign a
severity and owner, preserve evidence without copying secret values, and provide
status updates until remediation or documented risk acceptance.

## Supported releases

Only the currently deployed immutable release digest is supported. Security
fixes are applied to the main branch and released through the protected
production environment after required checks and review.

## Safe handling

- Never paste credentials, session tokens, OTPs, database URLs, or personal data
  into issues, chat, CI logs, or screenshots.
- Do not test against production data or third-party systems without separate
  written authorization.
- Treat any committed live credential as compromised: revoke or rotate it first,
  then remove it from tracked source and assess history remediation.
- Follow `docs/security/INCIDENT_RESPONSE.md` when active compromise is suspected.
