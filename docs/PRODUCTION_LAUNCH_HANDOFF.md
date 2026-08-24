# Production launch handoff

Reviewed: 2026-08-24

## Decision

**Application hardening is implemented; production promotion remains blocked on
deployment-environment evidence and business/operator approvals.** Do not label
the service live or production-approved until every external gate below has an
owner, evidence reference, and approval.

The approved launch scope is the Nepal/NPR COD and staff-cash pilot. Electronic
payments, external CMS/uploads, advanced analytics, returns, promotions,
segments, offline sync, hardware, and fiscal integrations remain fail-closed.

## Implemented engineering controls

- Fail-fast production configuration, independent cryptographic secrets,
  bounded request/rate/database/Redis timeouts, private-or-TLS Redis policy, and
  verified least-privilege database role expectations.
- Hashed sessions/OTPs, signed staff JWTs with issuer/audience checks, MFA and
  capability/store-scope authorization, CSRF protection, secure cookies,
  distributed Redis rate limits, parameterized SQL, and PII-safe logging.
- Non-root/read-only containers, bounded resources, 35-second Compose drain,
  separate one-shot migration job, health/readiness checks, and graceful
  dependency shutdown.
- Next.js static/SSG rendering where supported, Suspense/loading fallbacks,
  optimized images, locally bundled variable font, streaming bounded API proxy,
  resilient browser requests, accessible recovery/dialog behavior, SEO files,
  and Core Web Vitals RUM plus a Chromium launch budget.
- Optional OpenTelemetry traces and metrics with a Collector baseline that
  removes sensitive attributes before export. Structured logs apply independent
  application and Fastify redaction.
- CI type/build/test/lint/security gates, tracked-secret scan, dependency audits,
  SHA-pinned workflow actions, SHA-tagged images, SBOM/provenance publication,
  and Dependabot coverage for npm, Docker, and GitHub Actions.

## External gates that block promotion

1. Provision paid/HA application, private PostgreSQL, and private Redis capacity;
   configure autoscaling, regional placement, quotas, and spend alerts.
2. Populate unique production secrets in the provider secret manager. Runtime
   receives only `DATABASE_URL`; the release job alone receives
   `MIGRATION_DATABASE_URL`. Rotate/remove bootstrap credentials after use.
3. Enable managed PITR and encrypted immutable off-site backups; record a
   checksum-verified restore and rollback drill with approved RPO/RTO.
4. Configure the production domain, DNS, HTTPS/TLS policy, HSTS validation,
   CDN/WAF/body limits, exact CORS origin, trusted proxy depth, and distributed
   abuse controls.
5. Deploy the OpenTelemetry Collector, configure the external exporter and
   retention policy, create dashboards/SLOs, and prove primary/backup alert
   delivery with synthetic incidents.
6. Configure and certify the approved Nepal SMS provider. Exercise valid,
   invalid, expired, reused, rate-limited, locked, and provider-failure OTP paths.
7. Apply production roles/migrations, run `npm run verify:database-role`, and
   retain the immutable release digest, migration manifest, SBOM, and provenance.
8. Run the full staging browser gate, authorization/store-isolation negatives,
   concurrency/load/soak test, dependency-failure test, graceful-shutdown test,
   post-deploy smoke, and rollback rehearsal.
9. Obtain named engineering, operations, security, product, privacy, and Nepal
   VAT/IRD approvals. Fiscal outputs remain provisional until professional signoff.

## Promotion sequence

1. Freeze an immutable release SHA/digest after required CI checks pass.
2. Back up the database and run the one-shot migration job with the migrator role.
3. Verify schema checksums and runtime least privilege.
4. Deploy the verified backend artifact and wait for `/api/health/ready` HTTP 200.
5. Configure Vercel `API_URL`, optional approved `IMAGE_CDN_URL`, and production
   environment variables; deploy the verified frontend commit/build.
6. Run browser, API, authorization, checkout, telemetry, alert, and rollback smoke
   tests against the production domain before shifting traffic.
7. Monitor error rate, latency, saturation, database/Redis health, OTP delivery,
   checkout failures, and Core Web Vitals during a staged rollout.

No secret value, customer identifier, phone, email, address, session token, OTP,
or payment payload may be attached to the evidence bundle.
