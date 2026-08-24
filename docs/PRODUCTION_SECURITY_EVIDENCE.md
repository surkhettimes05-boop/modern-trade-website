# Production Security Evidence Record

Complete this record for the exact immutable release candidate. Store evidence
in the approved restricted system; link sanitized results rather than copying
secrets or customer data into this file.

## Release identity

- Release/version:
- Git commit:
- Backend image digest:
- Frontend image digest:
- SBOM/provenance location:
- Change approver:
- Security approver:
- Planned deployment time:

## Identity and secrets

- [ ] Historical seed exposure investigated and recorded.
- [ ] Affected administrator credentials rotated/disabled.
- [ ] All production administrators have verified MFA and recovery ownership.
- [ ] Runtime service has no bootstrap or migration credential.
- [ ] Environment-specific secret separation verified.
- [ ] Secret scan result attached; values suppressed.

Evidence/owner/date:

## Database and storage

- [ ] `storesync_app` is the actual runtime identity.
- [ ] Runtime role posture command passes.
- [ ] Runtime role cannot create database/schema objects and owns no public objects.
- [ ] `storesync_migrator` is used only by the audited release job.
- [ ] RLS/runtime policies and cross-store tests pass.
- [ ] Database is private and uses certificate-verified TLS.
- [ ] Encrypted point-in-time restore drill passed.

Evidence/owner/date:

## Edge and application configuration

- [ ] Exact HTTPS `API_URL`, `APP_URL`, and CORS origin verified.
- [ ] Exact proxy hop count and forwarded-header overwrite behavior verified.
- [ ] Redis is private/authenticated and distributed limits fail closed.
- [ ] CDN/WAF limits and emergency blocking procedure tested.
- [ ] TLS renewal, HSTS, CSP, cache, cookie, and CSRF behavior verified.
- [ ] Deferred integrations are disabled.

Evidence/owner/date:

## Release gates

- [ ] Backend unit and DB-backed tests passed.
- [ ] Backend/frontend lint, type-check, production build, and audits passed.
- [ ] Full-stack desktop/mobile Playwright gate passed without unexplained skip.
- [ ] Docker images run non-root with dropped capabilities/read-only filesystem.
- [ ] Docker image vulnerability scan has no unresolved Critical/High issue.
- [ ] Flutter analysis, tests, and signed device release checks passed.
- [ ] Migration backup/forward/restore procedure validated.

Evidence/owner/date:

## Monitoring and response

- [ ] Security alerts reach primary and backup responders.
- [ ] Authentication, authorization, admin, database, webhook, WAF, and cost alerts tested.
- [ ] Log redaction and retention/access policy verified.
- [ ] Credential/session rotation exercise completed.
- [ ] Incident-response tabletop completed and follow-ups closed/owned.

Evidence/owner/date:

## Residual risk decision

- Open risks and compensating controls:
- Named owners and deadlines:
- Security decision: `APPROVE` / `REJECT` / `TIME-BOUNDED EXCEPTION`
- Approver/date:
- Exception expiry (if applicable):
