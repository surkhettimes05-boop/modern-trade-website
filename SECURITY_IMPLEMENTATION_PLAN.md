# Security Implementation Plan

## Objective

Bring StoreSync/Modern Trade to an evidence-backed production security baseline and maintain that baseline after release. Absolute security cannot be guaranteed; completion means every release-blocking control below is implemented, tested, independently verified, and supported by monitoring and incident-response procedures.

This plan is based on `SECURITY_AUDIT.md`. The current repository has no known critical finding, but production approval remains blocked by database privilege separation, historical seed remediation, deployed-environment verification, missing artifact validation, and incomplete operational controls.

## Implementation Status — 2026-08-24

| Phase | Repository status | External/production status |
| --- | --- | --- |
| 0 — Freeze unsafe paths | Implemented: production validators keep deferred features/demo OTP disabled | Verify deployed variables and approval controls |
| 1 — Credentials and identity | Seed/bootstrap guards, revocation, MFA enforcement, and rotation runbook implemented | Historical-environment investigation, rotations, and administrator MFA enrollment required |
| 2 — Database least privilege | Implemented: split-role SQL, separate migration entrypoint, role-identity/DDL checks, RLS backend policy, QA role test | Run role bootstrap and provider credential/network/TLS changes in production |
| 3 — Authorization | Implemented for active routes: fail-closed resource scope, negative tests, route-boundary registry and CI coverage gate | Independently retest each enabled workflow and accept intentionally denied unresolved workflows |
| 4 — Edge and abuse | Application URL/proxy validation, distributed limits, bounded bodies, stricter CSP/headers, private caching implemented | Configure and verify CDN/WAF, TLS/DNS, proxy chain, Redis, and provider limits |
| 5 — Containers and CI/CD | Non-root/read-only/capability controls, static security gate, immutable tags, SBOM/provenance, image builds and full-stack CI configured | Pin base-image digests and verify registry vulnerability policy/platform protections |
| 6 — Release verification | Backend/frontend checks pass locally; browser security tests pass; full-stack QA gate added to CI | Docker/Flutter/full-stack gate must execute successfully in the equipped CI environment |
| 7 — Deferred features | Fail-closed feature flags implemented | Separate provider certification required before any enablement |
| 8 — Operations | Monitoring, rotation, incident, privacy-evidence, and recovery runbooks implemented | Configure alerts, perform restore/rotation/tabletop exercises, record evidence |
| 9 — Independent verification | Evidence template and retest criteria implemented | Independent staging penetration test and security sign-off required |

Repository implementation does not mark the external column complete. The
production go-live checklist remains authoritative until evidence is attached.

## Target Outcome

Production may be approved only when:

- All Critical and High findings are `FIXED` or formally accepted by the accountable security owner.
- All Medium findings are `FIXED`, or a documented compensating control and remediation deadline exists.
- The runtime database identity is non-owner and least privilege.
- Production secrets, MFA, OTP, proxy, TLS, network, storage, and provider settings are verified without exposing values.
- Backend, frontend, database, Docker, Flutter, and full-stack security tests pass from clean release artifacts.
- Centralized monitoring, backup restoration, credential rotation, and incident-response exercises have evidence.
- A named security approver signs the release checklist.

## Roles

| Role | Responsibility |
| --- | --- |
| Security owner | Risk acceptance, threat-model review, final production approval |
| Backend owner | Authentication, authorization, database access, rate limiting, integrations |
| Frontend owner | Proxy boundary, browser security, CSP, caching, client data exposure |
| Mobile owner | Flutter transport, secure storage, release artifact validation |
| Platform/DevOps owner | IAM, secrets, networking, TLS, WAF, CI/CD, containers, monitoring |
| Database owner | Runtime/migration roles, grants, RLS, backups, restore testing |
| Product owner | Business-logic invariants and acceptable fail-closed behavior |

One person may hold multiple roles, but the final production review should include a second reviewer who did not implement the highest-risk changes.

## Phase 0 — Freeze Unsafe Release Paths

**Priority:** P0 — immediate  
**Production blocker:** Yes

### Actions

1. Keep electronic payments, offline sync, advanced analytics, promotion engines, and hardware integrations disabled in every production environment.
2. Block production deployment until Phases 1–6 pass.
3. Restrict seed and administrator-bootstrap commands to an audited administrative workflow.
4. Prevent development or QA databases, Redis instances, credentials, and OTP settings from being referenced by production.
5. Capture the current production configuration inventory by variable name and provider setting only; never place secret values in tickets or logs.

### Acceptance criteria

- Production validators reject deferred features and demo/development OTP modes.
- Deployment has a documented go/no-go approval step.
- Only authorized operators can run migrations, seeds, or administrator bootstrap.
- A configuration inventory identifies the owner and rotation procedure for every secret.

## Phase 1 — Credential and Identity Remediation

**Priority:** P0  
**Production blocker:** Yes

### Actions

1. Identify every database where `development_seed.sql`, `staff_seed.sql`, or the previous application seed may have run.
2. Disable or rotate every administrator account that could have inherited the historical repository-known credential. Do not reuse the replacement anywhere.
3. Bootstrap a uniquely named production administrator through the guarded bootstrap workflow.
4. Enroll and verify MFA for all platform administrators before granting production access.
5. Revoke all existing sessions for rotated or disabled accounts.
6. Rotate production JWT, CSRF, OTP-HMAC, encryption, webhook, SMS, database, Redis, and deployment credentials if they were ever copied into source, logs, chat, test environments, or shared documents.
7. Store secrets only in the deployment platform’s encrypted secret manager. Separate production, preview, QA, and development values.
8. Document emergency rotation order so dependent services can be updated without disabling validation.

### Acceptance criteria

- No production account uses a seed, example, shared, or default password.
- Every platform administrator has MFA and a tested recovery process.
- Old sessions and credentials are demonstrably rejected.
- Secret values are absent from source, build output, browser bundles, logs, CI artifacts, and tickets.
- Rotation evidence records identifiers and timestamps, never secret values.

### Verification

- Test login with revoked sessions and old credentials; all must fail.
- Inspect production client bundles and source maps for server-only variable names and values.
- Run the repository’s secret scan plus the hosting/provider secret scanners.

## Phase 2 — PostgreSQL Least Privilege and Tenant Isolation

**Priority:** P0  
**Production blocker:** Yes

### Actions

1. Create separate PostgreSQL roles:
   - `migration_role`: schema changes only, used by a controlled deployment job.
   - `application_role`: non-owner runtime access with only required table, sequence, and function privileges.
   - `readonly_support_role`: optional, restricted operational diagnosis.
2. Ensure the backend runtime `DATABASE_URL` uses `application_role`, never the database owner or migration role.
3. Revoke public/default grants and unnecessary schema creation privileges.
4. Inventory every application query and grant only the required operations.
5. Validate RLS policies under the actual runtime role. Use `FORCE ROW LEVEL SECURITY` where compatible and ensure privileged functions cannot be abused to bypass policy.
6. Keep PostgreSQL on private networking with an explicit service allowlist. Require TLS certificate verification.
7. Separate migration execution from application startup so a compromised runtime cannot alter schema.
8. Add automated database tests that fail if the runtime role can create/alter/drop schema objects or access unauthorized tenant rows.

### Acceptance criteria

- The runtime role does not own application tables or the database.
- Runtime attempts to create, alter, or drop schema objects fail.
- Cross-store/customer negative tests pass while using the production-equivalent runtime role.
- Direct anonymous/authenticated Supabase-style access remains denied where applicable.
- Database connections use private networking and verified TLS.

### Verification examples

```sql
SELECT current_user;
SELECT tableowner FROM pg_tables WHERE schemaname = 'public';
```

Record only role names and pass/fail results. Do not copy connection strings into evidence.

## Phase 3 — Complete Server-Side Authorization Coverage

**Priority:** P0/P1  
**Production blocker:** Yes for every enabled workflow

### Actions

1. Inventory every non-public route and map it to:
   - authentication method;
   - required capability/role;
   - tenant/store ownership source;
   - target-resource resolver;
   - mutation CSRF/MFA requirement.
2. Add authoritative resource-to-store resolvers for each scoped opaque resource required in production.
3. Preserve fail-closed behavior for unresolved resources; do not restore trust in request-supplied store, user, tenant, role, price, or status fields.
4. Ensure platform-wide staff operations require the system capability and recent verified MFA.
5. Review every list/query response for field-level exposure and bound pagination.
6. Verify customer object ownership from the authenticated customer session at query time.
7. Add database constraints or transactions for one-time tokens, inventory, loyalty, payment, invitation, and quota operations where race conditions matter.

### Required regression matrix

For every sensitive resource, prove:

- unauthenticated access returns 401;
- authenticated but unauthorized access returns 403 without revealing existence;
- User A cannot read or mutate User B’s object;
- Store A staff cannot read or mutate Store B’s object;
- a request-supplied decoy store ID cannot bypass ownership;
- normal staff cannot invoke administrator functions;
- disabled, expired, or revoked sessions fail;
- permitted actors can still complete the intended workflow.

### Acceptance criteria

- Every enabled protected endpoint is present in the authorization matrix.
- Every opaque resource has authoritative ownership resolution or intentionally returns 403.
- Negative authorization tests run in CI and cannot be skipped for release.

## Phase 4 — Production Edge, Proxy, and Abuse Controls

**Priority:** P1  
**Production blocker:** Yes

### Actions

1. Set the production backend URL to an HTTPS origin or a documented private service address. Never enable `ALLOW_INSECURE_INTERNAL_API` across a public or shared network.
2. Set `TRUST_PROXY_HOPS` to the exact observed proxy depth and verify which component overwrites forwarded headers.
3. Confirm CORS allows only the exact production frontend origin with credentials.
4. Configure distributed Redis-backed limits for login, OTP request/verify, contact, search, checkout, uploads if introduced, and expensive administration/reporting operations.
5. Add provider-side OTP/SMS fraud controls, spend ceilings, geo restrictions where appropriate, and alerting.
6. Configure WAF rules for obvious scanning, malformed requests, excessive bodies, credential stuffing, and emergency IP/ASN blocking.
7. Set platform request-body, header, URL, execution-time, and response-size limits equal to or stricter than application limits.
8. Validate HTTPS redirects, HSTS, certificate renewal, DNS ownership, and origin shielding.
9. Verify private/authenticated responses are never stored in shared caches.
10. Introduce a nonce- or hash-based CSP after collecting violations in report-only mode; remove unnecessary script, style, image, and connection origins.

### Acceptance criteria

- Real client IPs are correct through the deployed proxy chain and attacker-supplied forwarding headers cannot override them.
- Rate limits remain effective across multiple instances and fail closed when Redis is unavailable on sensitive endpoints.
- Credentialed CORS requests from unapproved origins fail.
- Oversized bodies return 413 without excessive buffering.
- TLS, headers, and cache behavior pass an external configuration review.

## Phase 5 — Containers, CI/CD, and Supply Chain

**Priority:** P1  
**Production blocker:** Yes

### Actions

1. Build frontend and backend Docker images from a clean checkout.
2. Confirm the final images run as non-root, contain no `.env`, Git metadata, local-run files, tests, package-manager credentials, or source maps containing secrets.
3. Pin base images by digest through a controlled update process and scan the final image and OS packages for known vulnerabilities.
4. Use a read-only root filesystem where compatible; drop Linux capabilities and set resource limits.
5. Generate and retain an SBOM and image provenance/attestation for each release.
6. Ensure GitHub Actions default permissions are read-only, package/deployment permissions are job-scoped, and every third-party action remains pinned to a reviewed commit SHA.
7. Protect the production environment with required reviewers, protected branches, signed/verified release commits where practical, and no secret access from untrusted pull requests.
8. Prevent deployment from artifacts produced by untrusted workflows. Promote one verified immutable artifact rather than rebuilding for production.
9. Run dependency audits and lockfile integrity checks on every pull request and scheduled security workflow.

### Acceptance criteria

- Image scan contains no unresolved Critical or High vulnerability; Medium findings have a documented decision and deadline.
- Containers start successfully as non-root with the intended filesystem and capability restrictions.
- An SBOM, provenance record, and immutable image digest exist for the release.
- An untrusted pull request cannot read production secrets or publish/deploy an artifact.

## Phase 6 — Full Release Verification

**Priority:** P0 before launch  
**Production blocker:** Yes

### Required environment

Use an isolated QA stack with production-equivalent topology: frontend, Fastify backend, PostgreSQL runtime/migration roles, Redis, and test-only provider credentials. Do not point tests at production or third-party live accounts.

### Required checks

1. Backend unit and DB-backed suites.
2. Backend and frontend type checks, lint, and production builds.
3. Backend and frontend full dependency audits.
4. Full Playwright desktop/mobile release gate with the entire stack running.
5. Explicit cross-customer, cross-store, privilege-escalation, CSRF, revoked-session, MFA-lockout, pagination, oversized-body, and error-redaction tests.
6. Docker image startup, health, graceful shutdown, read-only filesystem, and non-root checks.
7. `flutter analyze`, Flutter unit tests, and a signed release build on representative devices.
8. Mobile HTTPS enforcement, certificate behavior, token storage, logout/session revocation, deep-link validation, and screenshot/background privacy review.
9. A production-like migration followed by rollback/recovery validation using disposable data.
10. A short, authorized load test of rate limits and key resource bounds in QA only.

### Acceptance criteria

- All security and release-gate tests pass with zero unexplained failure or skip.
- No Critical or High dependency/image finding remains.
- Release artifacts are the same immutable artifacts approved for production.
- QA logs contain no passwords, cookies, authorization headers, OTPs, reset links, database URLs, or secret values.

## Phase 7 — Payments and Deferred Features

**Priority:** P1 before enabling each feature  
**Production blocker:** No while disabled; Yes before enablement

Create a separate security review for each deferred feature. Electronic payment enablement must include:

1. Provider-documentation verification of signature construction and canonicalization.
2. Signature verification before parsing or processing trusted fields.
3. Constant-time signature comparison where the provider flow requires local comparison.
4. Timestamp/freshness enforcement and replay rejection.
5. Unique event/idempotency constraints and atomic state transitions.
6. Server-derived amount, currency, order, customer, and merchant identity.
7. Transactional reconciliation that cannot mark an order paid from client state alone.
8. Duplicate, reordered, delayed, invalid-signature, wrong-amount, and processing-failure tests.
9. Refund capability separation and dual approval above a defined threshold.
10. Provider dashboards configured with minimal credentials, approved callback origins, alerts, and rotation.

Uploads, external URL fetching, WebSockets, OAuth, AI endpoints, or new admin interfaces require threat-model updates before release because they introduce new attack surfaces not covered by the current approval.

## Phase 8 — Monitoring, Privacy, Backup, and Incident Response

**Priority:** P1  
**Production blocker:** Yes for launch readiness

### Monitoring

Centralize and protect events for:

- repeated OTP/login/MFA failures and lockouts;
- cross-store or administrator authorization denials;
- administrator creation, role changes, password resets, MFA changes, and session revocation;
- unusual checkout, inventory, loyalty, refund, or reconciliation activity;
- webhook signature/replay/processing failures;
- configuration-validation failures, rate-limit backend failures, and sudden error/cost spikes.

Logs must use correlation IDs and avoid passwords, cookies, authorization headers, OTPs, reset URLs, provider secrets, full personal data, and database URLs.

### Privacy and retention

1. Define retention and deletion periods for customer PII, addresses, orders, consent, staff records, audit logs, and backups.
2. Limit support access and record privileged data access.
3. Verify export/deletion workflows and backup-retention implications.
4. Document data processors, regions, and contractual/security requirements.

### Backup and incident response

1. Encrypt backups and restrict restore/delete permissions.
2. Perform and record a successful point-in-time restore into an isolated environment.
3. Create runbooks for credential theft, administrator takeover, data exposure, payment abuse, provider compromise, and destructive database activity.
4. Exercise session invalidation, key rotation, provider shutdown, evidence preservation, containment, recovery, and notification decisions.

### Acceptance criteria

- Alerts reach a monitored owner and have tested escalation paths.
- A restore drill meets documented recovery objectives.
- At least one tabletop incident exercise is completed before launch.
- Privacy retention and access-control decisions are documented and implemented.

## Phase 9 — Independent Verification

**Priority:** P1 before initial launch, then recurring

1. Have a reviewer who did not implement the fixes re-review authentication, staff authorization, scoped resources, checkout, seed/bootstrap, and deployment configuration.
2. Perform an authorized staging penetration test with production-equivalent controls and synthetic data.
3. Retest every High/Medium finding in `SECURITY_AUDIT.md`.
4. Confirm the deployed artifact digest matches the reviewed release.
5. Record residual risks, accountable owners, compensating controls, and expiration dates.

### Acceptance criteria

- No unresolved Critical or High issue.
- Every Medium issue is fixed or has signed, time-bounded risk acceptance.
- Findings are reproducibly closed with evidence, not only marked complete in a ticket.

## CI Security Gates

Every pull request should require:

- backend/frontend type checking and linting;
- unit and authorization regression tests;
- database-backed integration tests;
- production builds;
- dependency and secret scanning;
- migration validation;
- changed-route authorization-matrix review;
- changed-dependency and changed-workflow review.

Every release should additionally require:

- full Playwright release gate;
- immutable Docker image scan and SBOM;
- Flutter release verification when mobile code changed;
- clean configuration validation for the target environment;
- migration backup/rollback readiness;
- security-owner approval.

Do not weaken or skip a security gate to make a release pass. An emergency exception must be documented, time-limited, approved, monitored, and followed by remediation.

## Recommended Execution Order

| Sequence | Workstream | Suggested duration | Exit condition |
| --- | --- | --- | --- |
| 1 | Freeze unsafe features and inventory environments | 1–2 days | Unsafe paths disabled; owners assigned |
| 2 | Rotate historical credentials and enforce admin MFA | 1–3 days | Old access rejected; MFA verified |
| 3 | Split DB roles, grants, migrations, networking, and RLS tests | 3–7 days | Runtime least-privilege tests pass |
| 4 | Complete scoped-resource resolvers and authorization matrix | 3–10 days | Every enabled protected route has negative tests |
| 5 | Configure proxy, TLS, WAF, CORS, Redis limits, and provider controls | 2–5 days | Deployed edge checks pass |
| 6 | Validate containers, CI/CD, SBOM, and immutable artifacts | 2–5 days | Release artifact approved |
| 7 | Run complete backend/frontend/mobile/full-stack release gate | 2–4 days | Zero unexplained failures/skips |
| 8 | Configure monitoring, restore drill, privacy controls, and incident exercise | 3–7 days | Operational evidence approved |
| 9 | Independent staging retest and production decision | 2–5 days | Security owner signs go-live checklist |

Durations are estimates and can overlap only where dependencies permit. Do not parallelize production rollout ahead of the database, identity, authorization, and release-gate blockers.

## Production Go-Live Checklist

- [ ] Historical seed exposure investigated; affected credentials rotated or disabled.
- [ ] Unique production administrator created; MFA and recovery verified.
- [ ] Runtime DB role is non-owner and least privilege; migrations use a separate role.
- [ ] RLS and cross-tenant tests pass using the real runtime role.
- [ ] Database, Redis, and backend services use private networking and verified TLS.
- [ ] Production backend URL and exact trusted-proxy depth verified.
- [ ] CORS, CSRF, cookies, CSP, HSTS, cache policy, and request limits verified in deployment.
- [ ] Distributed application and provider-side abuse controls verified.
- [ ] Every enabled protected route appears in the authorization matrix with negative tests.
- [ ] Deferred features remain disabled or have a separate completed security review.
- [ ] Backend unit/DB tests, frontend checks/build, and npm audits pass.
- [ ] Full-stack Playwright desktop/mobile release gate passes.
- [ ] Docker images pass non-root, secret-content, vulnerability, SBOM, and startup checks.
- [ ] Flutter analysis/tests and signed device release verification pass.
- [ ] CI/CD permissions, protected environments, approvals, and artifact provenance verified.
- [ ] Central security alerts tested and assigned to responders.
- [ ] Backup restoration and incident-response exercises completed.
- [ ] Existing stored external URLs and existing privileged accounts/sessions reviewed.
- [ ] Independent security retest completed with no unresolved Critical or High finding.
- [ ] Residual Medium risks have named owners, deadlines, and signed acceptance.
- [ ] Security owner gives written production approval for the immutable release digest.

## Definition of Done

The project reaches the intended security baseline when every checked production blocker has objective evidence, the immutable candidate artifact passes the complete release gate, no Critical or High vulnerability remains, and the security owner accepts the documented residual risk. Security work then moves to continuous dependency updates, monitoring, periodic access reviews, restore drills, incident exercises, and recurring penetration testing.
