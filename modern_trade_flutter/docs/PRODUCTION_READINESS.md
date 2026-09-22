# NOVA MART production-readiness evidence

This document records implemented controls and external launch blockers. A
checked item means the control exists in this Flutter repository; it does not
certify the backend or cloud environment.

## Flutter client controls

- [x] Production API configuration is explicit and HTTPS-only.
- [x] Release binaries cannot use the implicit development environment.
- [x] Session and CSRF values use encrypted Android storage and
  non-migrating, unlocked-device-only iOS Keychain storage.
- [x] Android production traffic rejects cleartext connections.
- [x] Android application data backup is disabled.
- [x] GET requests retry one transient gateway/service failure; mutations are
  never automatically replayed.
- [x] API telemetry exposes only method, status, duration, and bounded outcome.
- [x] Android release builds use R8 shrinking and resource removal.
- [x] The release pipeline applies Dart obfuscation and retains debug symbols.
- [x] CI enforces formatting, analysis, tests, compilation, and secret scans.
- [x] Signing material is supplied only through a protected CI environment.
- [ ] Complete manual MASVS/MASTG evidence on physical Android and iOS devices.
- [ ] Complete accessibility, poor-network, background/resume, and device-matrix
  testing.
- [ ] Connect the privacy-safe metric callback to the selected production
  telemetry exporter after the collector endpoint and data-processing agreement
  are approved.
- [ ] Implement and verify the account-deletion API and UI.
- [ ] Complete Play Data Safety and Apple privacy manifests/questionnaires.

## Backend launch blockers

- [x] Replace the supported customer-ID address contract with a session-derived
  route; remove the compatibility route after the client migration window.
- [ ] Complete ASVS 5.0 Level 2 control mapping and independent penetration test.
- [ ] Enforce object-level authorization on every customer resource.
- [ ] Verify OTP throttling, expiry, replay prevention, and enumeration safety.
- [ ] Prove transactional checkout and database-enforced idempotency.
- [x] Configure bounded database pools, connection/idle timeouts, and statement
  timeouts.
- [ ] Add slow-query alerts and N+1 query regression tests for high-traffic
  relational endpoints.
- [ ] Offload slow work to durable, monitored workers.
- [x] Add separate liveness, readiness, and startup probes.
- [x] Drain requests and transactions during the configured termination window.
- [x] Redact PII and prompt-like payloads at the OpenTelemetry Collector before
  export.

## Infrastructure and operations launch blockers

- [x] Version Cloudflare DNS, custom WAF, optional managed WAF, and edge rate
  limits in Terraform with a CI validation gate.
- [ ] Import existing Cloudflare state, review a production plan, and apply it
  through an approved deployment environment.
- [ ] Version the remaining application, database, Redis, secrets, and
  observability infrastructure in Terraform and require peer-reviewed plans.
- [ ] Deploy stateless API and worker replicas across failure domains.
- [ ] Protect the origin behind a CDN/WAF; restrict direct origin ingress.
- [ ] Store runtime secrets in a managed secrets service with workload identity.
- [ ] Enable managed database encryption, point-in-time recovery, and tested
  restores.
- [ ] Quarantine and malware-scan user uploads in private, non-executable object
  storage.
- [ ] Define SLOs and alerts for availability, latency, checkout success, queue
  depth, database saturation, and mobile crash-free sessions.
- [ ] Rehearse rollback, database restoration, key rotation, and incident
  response.
- [ ] Pass load tests at twice forecast peak traffic and a controlled staged
  rollout.

Production approval requires evidence for every applicable open item or a
documented, time-bounded risk acceptance signed by the accountable owner.
