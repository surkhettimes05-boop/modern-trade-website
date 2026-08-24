# Security Audit

## Executive Summary

This authorized defensive assessment reviewed the StoreSync/Modern Trade monorepo as a production internet-facing system. The most important confirmed risks were systemic cross-store authorization based on client-supplied store identifiers, insufficient protection around privileged staff-account operations, and development seed files capable of establishing a known administrator credential. Those three high-severity paths were remediated in the repository and covered by negative regression tests.

The assessment also hardened customer OTP behavior, staff MFA lockout, production integration validation, request/resource limits, CI permissions, container defaults, network bindings, mobile transport validation, secret handling, security headers, cache controls, proxy request buffering, database identities, and security-event persistence. No known dependency vulnerabilities were reported by the installed npm audits. A clean backend run passed 46 suites and 304 tests before the final second-pass additions; the final focused security/unit rerun is recorded below. Backend and frontend type-check/lint passed, and the Next.js production build generated 67 pages with the staff-route proxy enabled.

This audit does not prove absolute security. Production IAM, database networking/ownership, provider dashboards, deployed secrets, TLS/CDN/WAF behavior, backups, monitoring, and existing database contents were not available for direct verification. Flutter and Docker tooling were unavailable locally.

The audit records 0 critical, 3 high, 10 medium, 7 low, and 1 informational finding. All 20 vulnerability findings received repository mitigations; remaining launch risk is primarily deployed-environment and operational verification rather than an unpatched known Critical/High repository flaw.

## Risk Rating

MODERATE RISK

## Production Recommendation

Deploy only after the Required Manual Actions are completed. In particular, do not deploy until production secrets and OTP-provider configuration are verified, any environment ever initialized with the old development seed credential is remediated, least-privilege database access is established, and the fail-closed scoped-resource behavior is accepted or completed with authoritative resource resolvers.

## Scope

- Repository and local Git history available at assessment time.
- Next.js frontend, Fastify backend, Flutter client, PostgreSQL schemas/migrations, Redis rate limiting, Docker/Compose, Render/Vercel configuration, GitHub Actions, and Codemagic configuration.
- Authentication, authorization, customer/staff sessions, OTP/MFA, API behavior, business logic, payments/webhooks, secrets, dependencies, CI/CD, containers, database boundaries, logging, availability, and deployment defaults.
- Safe local tests, type checks, linting, builds, dependency audits, static searches, and defensive code changes.
- No production systems or unrelated hosts were accessed or tested.

## Architecture

```text
Browser / Flutter client (attacker-controlled input)
        |
        v
CDN / Vercel frontend and Next.js API proxy
        |
        v
Fastify API on Render/container
  |             |                 |
  v             v                 v
PostgreSQL      Redis             External providers
data/RLS        rate limits       (Twilio/payment integrations)
```

The backend exposes public catalog/contact and health routes, customer OTP/session/cart/checkout/address/loyalty routes, and separately authenticated staff operations. Administrative APIs are feature-gated. Electronic payments, advanced analytics, offline sync, promotion engine, and hardware integration are deferred and production validation is designed to keep uncertified features disabled.

No reachable GraphQL, WebSocket, file-upload, AI-agent, Kubernetes, Terraform, Helm, CloudFormation, or Pulumi surface was identified in the active application registration path.

## Trust Boundaries

1. Public internet to Next.js: all paths, headers, bodies, cookies, query strings, and browser state are untrusted.
2. Next.js proxy to Fastify: the proxy is transport, not an authorization boundary; Fastify must authenticate and authorize every operation.
3. Customer session to customer-owned objects: customer identity must come from the verified session, never a body or path owner ID.
4. Staff session to role/capability/scope: capability and authoritative resource ownership must both pass.
5. Fastify to PostgreSQL: parameterization and least-privilege DB credentials are required; owner connections can bypass RLS.
6. Application to Redis/providers: credentials and endpoints are deployment-controlled; provider responses/webhooks remain untrusted until verified.
7. CI/CD to registry/deployment: workflow code and dependencies can affect production artifacts and tokens.

## High-Value Assets

- Customer PII, addresses, orders, consent records, loyalty balances, and sessions.
- Staff and platform-administrator credentials, MFA state, session tokens, capabilities, and audit records.
- Store inventory, prices, purchase/receiving/transfer data, payments/refunds, and reconciliation state.
- PostgreSQL data and credentials; Redis; signing, encryption, OTP, webhook, SMS, and provider secrets.
- CI package/deployment tokens and built container artifacts.
- Paid SMS/payment capability and operational availability.

## Attack Surface

- Customer OTP request/verify, session validation/revocation, logout, cart, checkout, order access, addresses, consent, and loyalty.
- Staff login/MFA, session management, password verification/reset, staff lifecycle, store operations, privileged administration, and operational reports.
- Public catalog pagination/filtering, contact submission, health/readiness, and Next.js catch-all API proxies.
- Deferred payment/webhook and offline/analytics/provider integrations.
- PostgreSQL migrations/seeds, Docker images/Compose ports, CI workflows, environment examples, and frontend/mobile API configuration.

## Threat Model

The highest-value realistic attacker was a legitimate low-privilege staff member who could alter every request and substitute resource/store/staff IDs. Before remediation, that actor could use a permitted store ID as a decoy while targeting a resource in another store, and could reach dangerous staff-account operations. An unauthenticated attacker was most likely to automate OTP/contact/catalog/proxy requests for enumeration, provider cost, or resource exhaustion. A deployment operator could also unintentionally create compromise paths by running development seeds, enabling demo OTP in production, using an owner database role, or deploying permissive container/network defaults.

STRIDE and OWASP review emphasized spoofing through OTP/session defects, tampering and elevation through BOLA/BFLA, repudiation through incomplete operational alerting, information disclosure through enumeration/cache/errors, denial of service through unbounded work, and supply-chain/CI compromise.

## Findings Summary

| ID | Severity | Confidence | Finding | Status |
| --- | --- | --- | --- | --- |
| SEC-001 | HIGH | HIGH | Cross-store BOLA trusted client store IDs | FIXED |
| SEC-002 | HIGH | HIGH | Privileged staff-account operations enabled takeover/oracles | FIXED |
| SEC-003 | HIGH | HIGH | Development seeds could establish a known admin password | PARTIALLY FIXED |
| SEC-004 | MEDIUM | HIGH | Production could use shared static demo OTP | FIXED |
| SEC-005 | MEDIUM | HIGH | OTP purpose abuse, enumeration, and SMS-cost abuse | FIXED |
| SEC-006 | MEDIUM | HIGH | MFA failures did not contribute to login lockout | FIXED |
| SEC-007 | MEDIUM | MEDIUM | Development OTP disclosure could survive misdeployment | FIXED |
| SEC-008 | MEDIUM | HIGH | Unbounded queries/contact/proxy buffering enabled abuse | FIXED |
| SEC-009 | MEDIUM | HIGH | Container/network/default credential hardening gaps | PARTIALLY FIXED |
| SEC-010 | MEDIUM | HIGH | CI jobs had broader package-token permission than needed | FIXED |
| SEC-011 | MEDIUM | HIGH | DB owner connection can bypass RLS/least privilege | FIXED IN REPO; DEPLOYMENT REQUIRED |
| SEC-018 | MEDIUM | HIGH | Production API proxy allowed insecure or malformed backend URLs | FIXED |
| SEC-019 | MEDIUM | HIGH | Seed/bootstrap transactions were not pinned to one DB connection | FIXED |
| SEC-012 | LOW | HIGH | Security headers and private cache controls incomplete | FIXED |
| SEC-013 | LOW | HIGH | Flutter release builds could accept remote plaintext API | NEEDS FURTHER VERIFICATION |
| SEC-014 | LOW | HIGH | Offline crypto code had unsafe fallback secrets | FIXED |
| SEC-015 | LOW | MEDIUM | Existing stored external URLs may not meet new HTTPS policy | PARTIALLY FIXED |
| SEC-016 | LOW | HIGH | Webhook failure audit updates used incorrect SQL parameters | FIXED |
| SEC-020 | LOW | HIGH | Proxy-hop trust accepted unsafe deployment values | FIXED |
| SEC-021 | LOW | HIGH | Several legacy actor-attribution aliases remained client-controlled | FIXED |
| SEC-017 | INFORMATIONAL | HIGH | Monitoring and incident-response controls need production verification | MANUAL ACTION REQUIRED |

## Critical Findings

No confirmed critical finding remained within the assessed repository scope.

## High Findings

### SEC-001 — Cross-store BOLA trusted client store IDs

- **Severity / confidence / evidence state:** HIGH / HIGH / CONFIRMED
- **Category / CWE / OWASP:** Authorization; CWE-639; OWASP API1 Broken Object Level Authorization.
- **Affected files/components:** `backend/src/plugins/protectedOperations.ts`; protected staff resource routes.
- **Description/evidence:** The generic scope guard compared a caller-supplied `store_id` with the session scope without proving that an opaque target resource actually belonged to that store. A scoped Store A actor could supply Store A as a decoy while targeting a Store B purchase order, staff member, or other opaque resource ID.
- **Preconditions/scenario:** Valid scoped staff session plus knowledge/guess of another resource ID.
- **Impact:** Cross-store reads or mutations, inventory/procurement tampering, and possible tenant isolation failure.
- **Recommended fix:** Resolve target ownership server-side for every opaque resource and compare every authoritative store to the authenticated scope.
- **Fix applied:** YES. A central fail-closed resolver validates explicit store fields, resolves staff targets authoritatively, and rejects scoped opaque-resource operations that lack a resolver.
- **Verification:** Security tests prove decoy-store denial, two-sided transfer checks, authoritative staff-store resolution, and cross-user denial. The independent second pass also found and fixed a caller bypass that skipped target checks for globally scoped actors. Full backend tests passed.
- **Remaining risk:** Scoped opaque-resource endpoints without a resource resolver now deny access. Add resolvers and negative cross-store tests before relying on those workflows in production.

### SEC-002 — Privileged staff-account operations enabled takeover/oracles

- **Severity / confidence / evidence state:** HIGH / HIGH / CONFIRMED
- **Category / CWE / OWASP:** Authorization/authentication; CWE-862 and CWE-269; OWASP API5 Broken Function Level Authorization.
- **Affected files/components:** `backend/src/routes/staff.ts`, `backend/src/services/staffService.ts`, staff authorization middleware.
- **Description/evidence:** Target staff ownership was not authoritative, password verification could be used against another user, and platform-admin password/status/session/MFA operations lacked consistent system-level and MFA protections.
- **Preconditions/scenario:** Authenticated lower-privilege or scoped staff actor invoking API routes directly.
- **Impact:** Credential reset, session termination, disabling, password oracle behavior, or platform-administrator takeover/disruption.
- **Recommended fix:** Self-only verification/MFA changes; system capability plus verified MFA for platform-admin/other-account changes; atomic password change and session revocation.
- **Fix applied:** YES. Target protection, capabilities, MFA enforcement, password bounds/bcrypt cost, request limits, and atomic revocation were added.
- **Verification:** Tests prove scoped managers cannot change platform admins, verification is self-only, plaintext is not stored, and active sessions are revoked in the password-update statement.
- **Remaining risk:** Production administrator MFA enrollment and recovery procedures require operational verification.

### SEC-003 — Development seeds could establish a known admin password

- **Severity / confidence / evidence state:** HIGH / HIGH / CONFIRMED
- **Category / CWE / OWASP:** Security misconfiguration; CWE-798; OWASP A05 Security Misconfiguration.
- **Affected files/components:** `backend/src/database/seed.ts`, `database/development_seed.sql`, `database/staff_seed.sql`, documentation.
- **Description/evidence:** The normal seed command lacked a production/remote target guard, and SQL seeds contained a repository-known administrator password that could be created or reset on conflict.
- **Preconditions/scenario:** Operator or compromised CI runs the development seed against a production-like database.
- **Impact:** Predictable administrator access and full application compromise.
- **Recommended fix:** Refuse production/ambiguous targets, never seed usable shared credentials, bootstrap admins explicitly, and rotate any credential ever created from the old seed.
- **Fix applied:** YES. Environment/DB target assertions were added; seeds use an unusable random hash and no longer overwrite passwords; admin bootstrap is documented.
- **Verification:** Tests reject production and ambiguous remote targets while allowing dedicated local/test targets.
- **Remaining risk:** The old development value remains visible in Git history. Treat any environment where the old seed ran as compromised and rotate/disable the account.

## Medium Findings

### SEC-004 — Production could use shared static demo OTP

- **Severity / confidence / evidence state:** MEDIUM / HIGH / LIKELY
- **Category / CWE / OWASP:** Authentication; CWE-287; OWASP A07 Identification and Authentication Failures.
- **Affected component:** Production integration validation and OTP configuration.
- **Evidence/scenario/impact:** `SMS_PROVIDER=demo` could be accepted in production, making a shared static code an authentication factor for a configured account. Knowledge of the code could enable account access.
- **Fix applied / verification:** YES. Production configuration now rejects demo SMS; configuration tests pass.
- **Remaining risk:** Verify the deployed provider is Twilio Verify (or equivalent), not a legacy/static implementation.

### SEC-005 — OTP purpose abuse, enumeration, and SMS-cost abuse

- **Severity / confidence / evidence state:** MEDIUM / HIGH / CONFIRMED
- **Category / CWE / OWASP:** Authentication and unrestricted consumption; CWE-204/CWE-799; OWASP API4.
- **Affected component:** Customer OTP request/verify routes.
- **Evidence/scenario/impact:** Public callers could request unused enrollment/verification purposes and distinguish some existing-account behavior, enabling phone enumeration and automated paid SMS traffic.
- **Fix applied / verification:** YES. Public schemas accept `LOGIN` only, production responses are generic, invalid verification is generic, and regression tests reject other purposes.
- **Remaining risk:** Validate distributed Redis limits and provider-side fraud controls under real proxy/client-IP behavior.

### SEC-006 — MFA failures did not contribute to login lockout

- **Severity / confidence / evidence state:** MEDIUM / HIGH / CONFIRMED
- **Category / CWE / OWASP:** Authentication; CWE-307; OWASP A07.
- **Affected component:** Operations/staff login.
- **Evidence/scenario/impact:** Correct-password attempts with invalid/missing six-digit MFA were not counted, allowing automated MFA guessing independent of the password failure threshold.
- **Fix applied / verification:** YES. MFA failures increment the same bounded lockout state; security tests confirm behavior. The frontend login accepts the optional MFA code.
- **Remaining risk:** Add provider/edge anomaly detection and administrator alerts for distributed attempts.

### SEC-007 — Development OTP disclosure could survive misdeployment

- **Severity / confidence / evidence state:** MEDIUM / HIGH / CONFIRMED CONFIGURATION RISK
- **Category / CWE / OWASP:** Sensitive data exposure/misconfiguration; CWE-200.
- **Affected component:** OTP response behavior and environment validation.
- **Evidence/scenario/impact:** `NODE_ENV=development` alone caused OTP disclosure, so a development-mode deployment could expose authentication codes.
- **Fix applied / verification:** YES. Disclosure additionally requires explicit `EXPOSE_DEVELOPMENT_OTP=true`, and production validation rejects the flag.
- **Remaining risk:** Do not expose development deployments publicly and never enable the flag outside isolated local use.

### SEC-008 — Unbounded queries/contact/proxy buffering enabled abuse

- **Severity / confidence / evidence state:** MEDIUM / HIGH / CONFIRMED
- **Category / CWE / OWASP:** Resource consumption; CWE-400; OWASP API4.
- **Affected components:** Public product listing, contact submission, staff listing, Next.js catch-all proxies.
- **Evidence/scenario/impact:** Attacker-controlled pagination and buffered proxy bodies could trigger excessive DB/network/memory work; contact submission could be automated.
- **Fix applied:** YES. Limits/offsets are bounded and parameterized, contact has strict schema/body/rate limits, staff listing is bounded, and both proxies stream with a 1 MiB cap and return 413 on excess.
- **Verification:** Public negative tests, backend type/lint/full tests, and final frontend type/lint/build passed.
- **Remaining risk:** Edge/platform request limits and distributed rate limits require load-safe production verification; no denial-of-service testing was performed.

### SEC-009 — Container/network/default credential hardening gaps

- **Severity / confidence / evidence state:** MEDIUM / HIGH / CONFIRMED
- **Category / CWE / OWASP:** Deployment misconfiguration; CWE-250/CWE-284.
- **Affected files/components:** Dockerfiles, Compose files, `.dockerignore`.
- **Evidence/scenario/impact:** Images ran as root; Compose published services broadly and supplied a fallback DB password; build context could include sensitive local files.
- **Fix applied:** PARTIAL. Runtime users are non-root, ports bind loopback, DB password is mandatory, and nested env/Git/local artifacts are excluded.
- **Verification:** Static inspection and Compose CI configuration update only; Docker was unavailable locally.
- **Remaining risk:** Build/run the images, confirm writable paths and health checks, inspect effective capabilities/filesystem, and use managed private networking in production.

### SEC-010 — CI jobs had broader package-token permission than needed

- **Severity / confidence / evidence state:** MEDIUM / HIGH / CONFIRMED
- **Category / CWE / OWASP:** Supply-chain/CI least privilege; CWE-250.
- **Affected component:** GitHub Actions workflows.
- **Evidence/scenario/impact:** Package write permission was global instead of limited to the publishing job, increasing impact of compromised steps.
- **Fix applied / verification:** YES. Default permissions are read-only; package write is job-scoped, actions remain commit-SHA pinned, and Node is aligned with the backend engine.
- **Remaining risk:** Verify GitHub environment protection, branch protection, OIDC/secret scoping, and runner trust in repository settings.

### SEC-011 — DB owner connection can bypass RLS/least privilege

- **Severity / confidence / evidence state:** MEDIUM / MEDIUM / POTENTIAL
- **Category / CWE / OWASP:** Database/IAM; CWE-250/CWE-284.
- **Affected component:** Production PostgreSQL role and RLS deployment.
- **Evidence/scenario/impact:** RLS and deny policies existed, but application behavior assumed a high-privilege/owner connection; PostgreSQL table owners can bypass ordinary RLS. A SQL injection or application compromise would therefore have a larger blast radius.
- **Fix applied:** YES IN REPOSITORY. The repository provisions distinct `storesync_migrator` and non-owner `storesync_app` roles, pre-provisions the required extension through the one-time owner workflow, applies an explicit backend RLS policy, makes security evidence append-only to runtime, removes migrations from runtime startup, requires separate role identities, and fails startup if the runtime role owns objects, has elevated/DDL privileges, belongs to the migration role, or resolves to an unexpected identity.
- **Verification:** In an explicitly disposable local PostgreSQL database, the owner script ran before migrations, all 27 migrations ran as `storesync_migrator`, runtime posture verification passed as `storesync_app`, and direct runtime attempts to create a table or update `audit_events` were denied. The disposable database and roles were removed afterward. Unit and DB-backed suites also passed.
- **Recommended action/remaining risk:** Apply the same workflow to the managed database with independent provider-managed credentials, private networking, and verified TLS; capture the runtime-posture result and perform a restore drill. The repository implementation is verified, but the production database is not.

### SEC-018 — Production API proxy allowed insecure or malformed backend URLs

- **Severity / confidence / evidence state:** MEDIUM / HIGH / CONFIRMED
- **Category / CWE / OWASP:** Transport and deployment misconfiguration; CWE-319; OWASP A05 Security Misconfiguration.
- **Affected files/components:** `frontend/src/lib/serverApiUrl.ts`, both Next.js API proxy routes, and server-side catalog fetches.
- **Description/evidence:** Server-side API configuration previously rejected production loopback hosts but did not consistently reject cleartext public HTTP, embedded credentials, query/fragment components, or non-HTTP schemes. A bad production value could route customer/staff cookies and API traffic over an attacker-observable or unintended channel.
- **Preconditions/scenario:** A deployment or environment-variable error sets the backend URL to an insecure or malformed destination; a network-positioned attacker then observes or modifies proxy traffic.
- **Impact:** Session/CSRF-token disclosure, request tampering, credential exposure, or service compromise.
- **Fix applied:** YES. One server-only URL parser now restricts schemes and URL components, requires HTTPS in production, and allows cleartext only through an explicit private-network/local-QA opt-in. Dynamic proxy path segments are encoded before URL construction.
- **Verification:** Frontend type-check, lint, and production build passed. Docker QA/local Compose explicitly opts into its private cleartext backend link.
- **Remaining risk:** Verify the deployed API URL, private service networking, DNS, and TLS validation. Do not use the cleartext override for a public or untrusted network.

### SEC-019 — Seed/bootstrap transactions were not pinned to one DB connection

- **Severity / confidence / evidence state:** MEDIUM / HIGH / CONFIRMED
- **Category / CWE / OWASP:** Data and privilege integrity; CWE-362/CWE-664; OWASP A04 Insecure Design.
- **Affected files/components:** `backend/src/database/bootstrapAdmin.ts`, `backend/src/database/seed.ts`.
- **Description/evidence:** `BEGIN`, the privileged writes, and `COMMIT`/`ROLLBACK` were issued through the pool abstraction. A pool does not guarantee those statements use the same PostgreSQL connection, so the apparent transaction could commit nothing or leave partial privileged seed/bootstrap state.
- **Preconditions/scenario:** Connection scheduling or an intermediate failure separates statements across pool clients during administrator bootstrap or data seeding.
- **Impact:** Partially applied accounts/roles/data, ineffective rollback, and unpredictable privileged access state.
- **Fix applied:** YES. Both workflows acquire one client, execute every transaction statement on it, and release it in `finally`.
- **Verification:** Backend type-check, lint, build, unit suite, and DB-backed test suite passed.
- **Remaining risk:** Restrict bootstrap/seed execution to an audited administrative process and independently verify the resulting administrator role and MFA state.

## Low Findings

### SEC-012 — Security headers and private cache controls incomplete

- **Severity / confidence / evidence state:** LOW / HIGH / CONFIRMED
- **Category:** Browser/cache hardening; CWE-693.
- **Evidence/scenario/impact:** HSTS, a baseline CSP, and explicit private no-store behavior were incomplete, increasing clickjacking/content-injection blast radius or cache ambiguity.
- **Fix applied / verification:** YES. HSTS, a restrictive same-origin CSP, frame/object/form protections, COOP/CORP, permissions/referrer/content-type controls, and private/no-store headers were added. Next production build and browser header tests passed.
- **Remaining risk:** CSP retains `unsafe-inline` for Next.js compatibility; move toward nonces/hashes after deployment testing. Verify the CDN does not override private responses.

### SEC-013 — Flutter release builds could accept remote plaintext API

- **Severity / confidence / evidence state:** LOW / HIGH / CONFIRMED
- **Category:** Transport security; CWE-319.
- **Evidence/scenario/impact:** Client base URL validation did not prevent a release build from targeting remote HTTP, exposing sessions/data to interception.
- **Fix applied:** YES. Only HTTP(S) URLs without credentials/query/fragment are accepted, and release builds reject remote HTTP while permitting loopback development.
- **Verification:** Dart tests were added, but Flutter/Dart SDK was unavailable locally.
- **Remaining risk:** Run `flutter analyze`, tests, and a signed release build/device check before shipping.

### SEC-014 — Offline crypto code had unsafe fallback secrets

- **Severity / confidence / evidence state:** LOW / HIGH / CONFIRMED
- **Category:** Cryptographic key management; CWE-321.
- **Evidence/scenario/impact:** Default fallback strings could make encryption/signatures predictable if offline sync were enabled without configuration.
- **Fix applied / verification:** YES. Required secrets fail closed; explicit test-only values are supplied by the isolated test harness. Backend tests passed.
- **Remaining risk:** Offline sync remains deferred; require cryptographic design review and managed key rotation before enablement.

### SEC-015 — Existing stored external URLs may not meet new HTTPS policy

- **Severity / confidence / evidence state:** LOW / MEDIUM / POTENTIAL
- **Category:** Input/transport integrity; CWE-319.
- **Affected component:** Store map and product image URL data.
- **Evidence/scenario/impact:** New administrative writes now require HTTPS, but repository review cannot prove existing database rows comply; legacy HTTP or unexpected schemes could cause mixed-content/tracking risk.
- **Fix applied:** PARTIAL. New writes are HTTPS-only.
- **Verification:** Type/lint/tests passed; existing production data was not inspected.
- **Remaining risk:** Audit and migrate existing URL columns and enforce a DB constraint where compatible.

### SEC-016 — Webhook failure audit updates used incorrect SQL parameters

- **Severity / confidence / evidence state:** LOW / HIGH / CONFIRMED
- **Category / CWE / OWASP:** Security logging and monitoring; CWE-778; OWASP A09 Security Logging and Monitoring Failures.
- **Affected files/components:** `backend/src/services/paymentService.ts`; payment webhook processing log.
- **Description/evidence:** The invalid-signature update referenced `$2` while supplying one parameter, and the verified-processing failure path compared the webhook log ID column with the error-message parameter. Both paths could fail to mark the intended log record.
- **Preconditions/scenario:** A malformed webhook or a verified webhook that triggers downstream processing failure.
- **Impact:** Loss of reliable failure state, delayed incident detection, and weaker forensic/idempotency operations. It did not make an invalid webhook valid.
- **Recommended fix:** Use correct parameter indexes, keep errors bounded/redacted, and test both failure branches.
- **Fix applied:** YES. Both statements now target the correct log ID parameter.
- **Verification:** Payment service tests assert the SQL and arguments for invalid signatures and verified processing failures; final full backend suite passed.
- **Remaining risk:** Production alerts, log retention, provider reconciliation, and replay monitoring remain manual controls.

### SEC-020 — Proxy-hop trust accepted unsafe deployment values

- **Severity / confidence / evidence state:** LOW / HIGH / CONFIRMED
- **Category / CWE / OWASP:** Rate-limit/audit misconfiguration; CWE-441; OWASP A05 Security Misconfiguration.
- **Affected component:** `TRUST_PROXY_HOPS` production environment validation.
- **Description/evidence:** The production validator did not constrain this setting to a small numeric proxy depth. Values such as zero, a blanket trust value, or an excessive depth can make attacker-controlled forwarding headers influence client-IP attribution.
- **Preconditions/scenario:** A deployment supplies an unsafe trust-proxy value; attackers then spoof forwarded addresses to weaken IP-based throttling or audit attribution.
- **Impact:** Reduced effectiveness of login/OTP/contact rate limits and misleading security logs.
- **Fix applied:** YES. Production accepts only integer depths 1 through 3; regression tests cover rejected and accepted values.
- **Remaining risk:** Configure the exact observed hop count (normally one on the documented deployment) and validate it through the real CDN/load-balancer chain.

### SEC-021 — Several legacy actor-attribution aliases remained client-controlled

- **Severity / confidence / evidence state:** LOW / HIGH / CONFIRMED.
- **Category / CWE / OWASP:** Audit integrity and repudiation; CWE-345/CWE-778; OWASP A09.
- **Affected component:** Legacy protected/privileged request bodies and `backend/src/utils/auditActor.ts`.
- **Description/evidence:** The centralized authenticated-actor binder replaced common fields such as `approved_by`, but four accepted aliases (`acknowledged_by`, `escalated_by`, `performed_by`, and `withdrawn_by`) were absent. A permitted staff actor could forge attribution on affected workflows, reducing evidentiary reliability without gaining the underlying capability.
- **Preconditions/scenario:** A valid staff session and permission to perform the affected operation.
- **Impact:** Misattributed operational/audit records and weaker investigation/non-repudiation evidence.
- **Fix applied:** YES. All discovered attribution aliases are replaced with the authenticated staff ID before route validation; target fields such as `assigned_to` remain unchanged. The separate persistent security event also records the authenticated actor and request ID.
- **Verification:** Regression tests submit forged values for every missing alias and verify replacement with the session actor.
- **Remaining risk:** Future routes must use the route-boundary review and authenticated actor binder; production audit storage/retention remains an operational control.

## Informational Findings

### SEC-017 — Monitoring and incident-response controls need production verification

- **Severity / confidence / evidence state:** INFORMATIONAL / HIGH / CONFIRMED OBSERVATION
- **Category / CWE / OWASP:** Operational security; CWE-778; OWASP A09.
- **Affected components:** Central logging, alerts, credential rotation, backups, and incident runbooks outside the repository.
- **Description/evidence:** The repository contains structured logs, audit fields, and session revocation mechanisms, but it cannot demonstrate deployed alert routing, immutable retention, restore drills, or emergency credential rotation.
- **Preconditions/scenario:** Credential theft, distributed authentication abuse, unexpected privilege change, webhook failures, or destructive operational error.
- **Impact:** Slower detection/containment and incomplete forensic reconstruction.
- **Recommended fix:** Centralize security events, alert on defined abuse/admin patterns, document rotations and isolation, and exercise backup restoration and incident response.
- **Fix applied:** PARTIAL. Authentication failures, authorization denials, high-risk step-up failures, and successful protected/privileged mutations now produce redacted persistent events. Repository runbooks define monitoring, escalation, credential rotation, privacy decisions, restore drills, incident scenarios, and evidence-backed release approval. A weekly read-only workflow reruns secret and dependency gates.
- **Verification:** Security-event redaction and audit-sink failure behavior have regression tests; workflow/static checks passed. Alert delivery, centralized immutable retention, restore, and response exercises still require production systems.
- **Remaining risk:** Material until monitoring, ownership, escalation, retention, and response exercises are evidenced.

## Fixes Applied

- Central fail-closed scoped-resource authorization and authoritative staff target resolution.
- System/MFA/self-only rules for sensitive staff lifecycle, credential, session, and MFA operations.
- Atomic password update plus session revocation; stronger password bounds and bcrypt cost.
- Production-safe seed guard and unusable seed credential behavior.
- Production rejection of demo OTP and explicit development OTP exposure flag.
- Generic OTP responses, login-only purpose, MFA lockout accounting, and endpoint rate limits.
- CSRF/MFA protection for administrative authentication maintenance.
- Bounded/parameterized pagination, contact limits, SMS timeout, and 1 MiB streaming proxy body cap.
- Non-root images, safer build context, loopback development ports, and mandatory Compose DB password.
- Least-privilege CI permissions and pinned action usage retained.
- HSTS, baseline CSP, private no-store cache controls, HTTPS URL validation, and Flutter release transport validation.
- Removal of offline-crypto default secrets and expansion of authenticated audit-actor binding.
- Server-only backend URL validation, encoded proxy path construction, and explicit private-network HTTP opt-in.
- Single-client transactions for administrator bootstrap and database seeding, plus bounded production proxy-hop trust.
- Split runtime/migration database roles, explicit backend RLS policy, runtime DDL/identity checks, and a migration-free application entrypoint.
- Production route-boundary inventory enforced by unit tests, repository static security checks, stricter browser headers, and bounded/allowlisted web-vitals logging.
- CI full-stack QA topology, disposable generated QA credentials, non-root image checks, SBOM/provenance publishing, and operational security/evidence runbooks.
- Persistent redacted security events, append-only runtime audit privileges, high-risk MFA step-up, and scheduled dependency/secret checks.
- Bounded enabled-route pagination, corrected store-filter parameter binding, and optimistic staff-page rejection in Next.js Proxy.

## Security Regression Tests

- Decoy `store_id` cannot authorize a resource in another store.
- Both source and destination stores are checked for transfers.
- Nested purchase-order items, quality exceptions, batches, shifts, reconciliations, and other opaque resources resolve authoritative stores.
- Staff target scope is loaded from the target record, not the request.
- Scoped manager cannot alter a platform administrator.
- Password verification is self-only; password change revokes active sessions atomically.
- Invalid/missing MFA contributes to lockout.
- Unsafe production API URLs and proxy-hop values fail closed.
- Non-login OTP purposes are rejected and production integration flags fail closed.
- Production/ambiguous databases reject development seeding.
- Unbounded public pagination is rejected.
- Administrative cleanup mutations require CSRF and MFA.
- Staff administration, refunds, payment reconciliation, and discrepancy resolution require verified MFA.
- Forged audit-attribution aliases are replaced with the authenticated staff ID.
- Product search binds store ownership independently from pagination and does not log raw search text.
- Runtime database DDL and security-log tampering are denied in a production-equivalent role test.
- Unauthenticated browser requests to staff pages redirect before rendering; backend checks remain authoritative.
- Flutter tests cover unsafe schemes, credentials, fragments/query, and remote release HTTP (not executed locally).

## Dependency / Supply-Chain Review

- Backend production and full `npm audit`: 0 reported vulnerabilities.
- Frontend production and full `npm audit`: 0 reported vulnerabilities.
- Lockfiles are present; GitHub Actions are pinned to commit SHAs.
- No high-confidence credential pattern was found in the current tracked tree or locally available 22-commit history. An ignored backend `.env` exists and was treated as sensitive; values were not printed.
- Audit results are time-bound and do not eliminate malicious-package, maintainer, registry, or future-CVE risk.

## Authentication Assessment

Customer authentication uses OTP hashing, bounded attempts/expiry, Redis-aware rate limiting, and HttpOnly/Secure/SameSite cookie behavior. Staff authentication uses password hashing, JWT verification, server-side sessions, MFA, CSRF, lockout, and session revocation. The audit fixed demo/static OTP production acceptance, OTP disclosure/enumeration, MFA lockout gaps, and sensitive staff credential operations. Production recovery, MFA enrollment, key rotation, and provider configuration remain manual controls.

## Authorization Assessment

Customer-owned resources generally derive identity from the authenticated session and include negative ownership tests. Staff operations use roles, capabilities, authoritative resource resolvers, scope, CSRF, and step-up MFA for high-risk actions. Enabled store-owned opaque workflows now resolve purchase orders/items, receiving/items, batches/quality exceptions/merges, transfers/items/both stores, shifts, tender reconciliations, audit reports, sales/returns, and enabled device/payment resources. Global supplier records lack trustworthy store ownership, so scoped access remains intentionally fail closed rather than trusting client input.

## Infrastructure / Cloud Assessment

Repository changes reduce container privilege, build-context leakage, default credential use, and local port exposure. Render/Vercel and GitHub configuration were reviewed statically. External IAM, firewall/security groups, WAF/CDN, DNS, TLS certificates, storage ACLs, and deployed service settings were not accessible and are not verified.

## Secret Management Assessment

Tracked examples use placeholders/required environment variables. Production validators reject missing/unsafe integration modes. Potential real local values were never printed or accessed externally. If the historical development seed credential was ever used, rotate it. Store production secrets in platform secret managers, scope them per service/environment, and document emergency rotation.

## CI/CD Assessment

Workflow permissions were narrowed; actions are SHA-pinned; quality steps use read-only repository permission. Manually verify protected environments, reviewer gates, branch protection, fork behavior, cache/artifact provenance, and that untrusted pull requests cannot access deployment secrets or privileged self-hosted runners.

## Data Privacy Assessment

High-risk data includes phone numbers, addresses, consent, orders, staff identity, sessions, and payment metadata. Private API responses now explicitly avoid shared caching. Error responses are sanitized and logs avoid deliberate credential output. Production retention/deletion, export controls, log redaction at providers, backup retention, and data-subject request operation require manual verification.

## Logging / Monitoring Assessment

The backend uses correlation IDs, structured redacted logging, server-side sessions, and persistent audit events for login/MFA outcomes, authorization denials, step-up failures, and successful protected/privileged mutations. Runtime database privileges cannot update/delete those events. `docs/security/MONITORING_AND_PRIVACY.md` defines required signals and ownership, but repository evidence cannot demonstrate deployed alert delivery, centralized immutable retention, or provider cost alerts.

## Incident Response Readiness

Session revocation and user disablement exist, and password changes revoke sessions. `docs/security/INCIDENT_RESPONSE.md` now covers credential theft, administrator takeover, cross-tenant access, database/provider compromise, availability attacks, evidence preservation, rotation order, recovery, and exercises. Operators must still run and evidence the tabletop, rotation, alert, and restore drills before launch.

## Remaining Risks

- Repository database least-privilege behavior is locally verified; the production role, RLS state, TLS, and network exposure remain unverified.
- The exact production proxy chain, backend URL, TLS/DNS path, and real client-IP behavior are unverified.
- Scoped supplier/global-resource endpoints without trustworthy ownership intentionally deny access.
- Flutter and Docker changes were not executable in this environment.
- Provider, CDN/WAF, DNS/TLS, GitHub environment, backup/restore, and monitoring settings are unverified.
- Existing database URLs and any historical seeded accounts require inspection.
- Deferred payments/offline/analytics features must remain disabled until separately certified.

## Manual Production Verification

1. Inspect effective Render/Vercel environment variables without exposing values: strong unique secrets, exact HTTPS origins, correct proxy settings, TLS-verified DB URL, production OTP provider, and all deferred features off.
2. Confirm PostgreSQL uses a non-owner least-privilege application role, private networking/firewall, forced/tested tenant policies where applicable, encrypted backups, and a successful restore drill.
3. Verify Twilio/provider anti-fraud limits, webhook signature/timestamp/replay behavior, allowed callbacks, and credential scopes in provider dashboards.
4. Verify CDN/WAF rate limits, cache keys, private response bypass, HSTS/CSP behavior, trusted hosts, and real client-IP handling.
5. Verify GitHub branch/environment protection, token scopes, runner trust, deployment approvals, and artifact provenance.
6. Build and run Docker images as the declared non-root user; validate health, writable paths, port exposure, secrets absence, image scanning, and Compose configuration.
7. Run Flutter analyze/tests and a signed release build on a device; verify network security and session storage.

## Manual Actions Required

1. Rotate/disable every administrator credential in any environment where the old development/staff seed was ever executed; bootstrap a unique administrator and enroll MFA.
2. Apply the verified non-owner/migration role workflow to production; verify private networking/TLS and complete a restore drill.
3. Configure/verify production secrets and a real OTP provider; ensure demo/development OTP settings and deferred features are off.
4. Decide whether scoped staff should access global supplier resources; add an organization ownership model before enabling that access, or explicitly accept the current 403 behavior.
5. Complete Docker and Flutter validation unavailable in this environment.
6. Sanitize existing stored external URLs and review existing privileged accounts/sessions.
7. Configure centralized security monitoring/alerts and exercise credential/session rotation and incident response.
8. Keep electronic payments and other deferred modules disabled until provider-specific security certification is complete.

## Production Security Checklist

- [x] No known critical repository vulnerability remained after remediation.
- [x] Confirmed high findings have repository fixes and regression coverage.
- [x] Current tracked tree/history scan found no high-confidence production secret pattern.
- [ ] Historical seed credential rotation confirmed for every environment.
- [x] Customer ownership and staff authorization negative tests pass in the local suite.
- [x] Enabled store-owned opaque-resource resolvers and negative tests are implemented.
- [x] Sensitive admin/staff operations require server-side authorization and MFA where implemented.
- [x] Installed npm audits report no known vulnerabilities.
- [x] Production demo/development OTP modes are rejected by configuration.
- [x] Cookies/CSRF/token validation reviewed and hardened.
- [ ] Distributed rate limiting and real proxy client-IP behavior verified in production.
- [x] Upload surface is absent from active routes; proxy bodies are constrained.
- [x] Deferred webhooks/payments fail closed while disabled.
- [x] Application logs/errors do not intentionally expose credentials or stack traces in production.
- [ ] Production DB private networking, deployed role posture, RLS behavior, and IAM verified (repository role workflow passed locally).
- [x] CI workflow permissions minimized in source.
- [ ] Backups and restore drill verified.
- [ ] Central monitoring and security alerts configured.
- [ ] Incident-response rotation/revocation drill completed.
- [x] Repository configuration requires HTTPS for public production application/API paths.
- [ ] Provider-side, CDN/WAF, DNS, and certificate settings manually verified.
- [ ] Docker and Flutter final artifacts independently validated.
- [ ] Full-stack Playwright release gate passes with Fastify, PostgreSQL, Redis, and seeded test identities running.

## Commands Executed

- `git status --short`, branch/config/history inspection, `git diff --check`: baseline preserved; final diff check passed.
- Architecture/route/dependency/config searches with `rg`; data-flow review of authentication, authorization, resource IDs, SQL, fetches, crypto, files, containers, CI, and deployment configuration.
- High-confidence current/history secret-pattern scan across 22 locally available commits: no matching tracked production credential pattern; values were never printed.
- Backend `npm run test:unit`: PASS — 28 suites, 144 tests.
- Backend `npm run test:ci`: PASS — 46 suites, 306 tests.
- Backend `npm run type-check`: PASS.
- Backend `npm run lint`: PASS.
- Frontend `npm run type-check`: PASS.
- Frontend `npm run lint`: PASS.
- Frontend `npm run build`: PASS — compiled and generated 67 pages.
- Focused Playwright browser-security run: PASS — 2/2 Chromium tests covering deployed headers, private API caching, telemetry validation, allowlisted logging, and the 16 KiB telemetry body limit.
- Playwright frontend-only Chromium desktop/mobile run: PARTIAL — 62 passed and 6 failed. Failures were backend-dependent `networkidle`/staff-login scenarios because the Fastify/PostgreSQL stack and seeded staff account were not running; static, accessibility, cart, SEO, and WhatsApp scenarios passed. A full-stack release-gate rerun remains required.
- Backend and frontend `npm audit --omit=dev --audit-level=high`: PASS — 0 reported vulnerabilities.
- Backend and frontend full `npm audit --audit-level=high`: PASS — 0 reported vulnerabilities.
- Repository `npm run security:static`: PASS — 588 files checked for sensitive filenames, high-confidence secret patterns, unsafe public-variable names, unpinned Actions, and `pull_request_target`; the dedicated credential scan also passed for 543 tracked files.
- Disposable PostgreSQL production-role exercise: PASS — owner provisioning ran before migrations; all 27 migrations ran as `storesync_migrator`; runtime posture passed as `storesync_app`; runtime DDL and `audit_events` update attempts were denied; the test database and roles were removed afterward.
- Workflow/deployment YAML parse: PASS for quality, deploy, scheduled security, Render, and QA Compose definitions.
- Earlier intermediate full test run: 39/41 suites passed; failures exposed a test helper missing the production error handler and missing explicit test-only offline secrets. Both harness issues were corrected. A later `initdb` run timed out before tests; the final clean full run passed.
- Flutter/Dart commands: NOT RUN — SDK unavailable.
- Docker/Compose image execution: NOT RUN — Docker unavailable.

## Files Modified

- `.dockerignore`
- `.github/workflows/deploy.yml`
- `.github/workflows/quality.yml`
- `.github/workflows/security.yml`
- `README.md`
- `SECURITY.md`
- `SECURITY_AUDIT.md`
- `backend/.env.example`
- `backend/.env.production.example`
- `backend/.env.migration.example`
- `backend/DEPLOYMENT.md`
- `backend/Dockerfile`
- `backend/docker-compose.yml`
- `backend/jest.unit.config.js`
- `backend/src/config/__tests__/environment.test.ts`
- `backend/src/config/__tests__/integrations.test.ts`
- `backend/src/config/environment.ts`
- `backend/src/config/integrations.ts`
- `backend/src/config/productionRouteSecurity.ts`
- `backend/src/config/__tests__/productionRouteSecurity.test.ts`
- `backend/src/database/bootstrapAdmin.ts`
- `backend/src/database/databaseSecurity.ts`
- `backend/src/database/__tests__/databaseSecurity.test.ts`
- `backend/src/database/migrate.ts`
- `backend/src/database/migrationRunner.ts`
- `backend/src/database/migrations.json`
- `backend/src/database/seed.ts`
- `backend/src/start.ts`
- `backend/src/database/verifyDatabaseRole.ts`
- `backend/src/middleware/authentication.ts`
- `backend/src/middleware/customerAuthentication.ts`
- `backend/src/plugins/authorization.ts`
- `backend/src/plugins/privilegedAdministration.ts`
- `backend/src/plugins/protectedOperations.ts`
- `backend/src/plugins/__tests__/privilegedAdministration.security.test.ts`
- `backend/src/plugins/__tests__/protectedOperations.security.test.ts`
- `backend/src/plugins/protectedResourceScope.ts`
- `backend/src/plugins/__tests__/protectedResourceScope.security.test.ts`
- `backend/src/routes/__tests__/authSecurity.test.ts`
- `backend/src/routes/__tests__/helper.ts`
- `backend/src/routes/__tests__/operationsAuth.security.test.ts`
- `backend/src/routes/__tests__/public.test.ts`
- `backend/src/routes/admin.ts`
- `backend/src/routes/auditReports.ts`
- `backend/src/routes/batches.ts`
- `backend/src/routes/auth.ts`
- `backend/src/routes/operationsAuth.ts`
- `backend/src/routes/public.ts`
- `backend/src/routes/productSearch.ts`
- `backend/src/routes/purchaseOrders.ts`
- `backend/src/routes/receiving.ts`
- `backend/src/routes/shifts.ts`
- `backend/src/routes/staff.ts`
- `backend/src/routes/suppliers.ts`
- `backend/src/routes/tenderReconciliation.ts`
- `backend/src/routes/transfers.ts`
- `backend/src/routes/webOrders.ts`
- `backend/src/services/securityEventService.ts`
- `backend/src/services/__tests__/securityEventService.security.test.ts`
- `backend/src/services/__tests__/productSearchService.security.test.ts`
- `backend/src/services/__tests__/staffService.security.test.ts`
- `backend/src/services/__tests__/paymentService.test.ts`
- `backend/src/services/offlineSyncService.ts`
- `backend/src/services/otpService.ts`
- `backend/src/services/paymentService.ts`
- `backend/src/services/staffService.ts`
- `backend/src/utils/auditActor.ts`
- `backend/src/utils/__tests__/auditActor.test.ts`
- `backend/test/global-setup.ts`
- `backend/test/setup-env.cjs`
- `database/development_seed.sql`
- `database/027_runtime_database_role.sql`
- `database/create-qa-role.sql`
- `database/docker-init-qa-role.sh`
- `database/production_roles.sql`
- `database/staff_seed.sql`
- `docker-compose.qa.yml`
- `frontend/Dockerfile`
- `frontend/next.config.ts`
- `frontend/src/app/api/[...path]/route.ts`
- `frontend/src/app/api/operations-auth/[...path]/route.ts`
- `frontend/src/app/api/web-vitals/route.ts`
- `frontend/src/app/admin/layout.tsx`
- `frontend/src/app/operations/layout.tsx`
- `frontend/src/app/staff-login/page.tsx`
- `frontend/src/lib/proxyRequestBody.ts`
- `frontend/src/lib/serverApiUrl.ts`
- `frontend/src/lib/serverCatalog.ts`
- `frontend/src/proxy.ts`
- `frontend/tests/security.spec.ts`
- `modern_trade_flutter/lib/core/api_client.dart`
- `modern_trade_flutter/test/api_client_test.dart`
- `render.yaml`
- `docs/PRODUCTION_SECURITY_EVIDENCE.md`
- `docs/SECURITY_OPERATIONS_RUNBOOK.md`
- `docs/production-security-boundaries.md`
- `docs/security/INCIDENT_RESPONSE.md`
- `docs/security/MONITORING_AND_PRIVACY.md`
- `docs/security/PRODUCTION_RELEASE_CHECKLIST.md`
- `package.json`
- `scripts/qa-compose.mjs`
- `scripts/qa-dependency-failure.mjs`
- `scripts/qa-reset.mjs`
- `scripts/qa-verify.mjs`
- `scripts/security-static-check.mjs`
- `SECURITY_IMPLEMENTATION_PLAN.md`

Pre-existing unrelated user modifications and untracked files observed at baseline were preserved and are not claimed as audit changes.

## Final Security Verdict

No known critical vulnerability remained in the assessed repository after the implemented fixes. The application is not approved for immediate production solely from repository evidence because important production controls are unverified and the highest-priority Required Manual Actions materially affect compromise likelihood and blast radius. After those actions, a passing full-stack release gate, completed Docker/Flutter validation, and an explicit decision on global supplier access, the repository is a reasonable production candidate with normal residual security risk and ongoing monitoring.
