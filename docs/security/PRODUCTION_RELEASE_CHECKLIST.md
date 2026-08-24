# Production Security Release Checklist

Complete this checklist against one immutable release digest. Attach evidence by
identifier/link, never secret value. The security approver must not be the sole
implementer of the highest-risk changes.

## Identity and data

- [ ] Historical seed use was investigated; affected accounts and sessions were
      disabled or rotated.
- [ ] Every production administrator has verified MFA and tested recovery.
- [ ] Runtime and migration database identities are distinct; runtime posture
      verification passes and schema changes fail under the runtime role.
- [ ] Cross-customer, cross-store, decoy-ID, normal-user/admin, CSRF, revoked
      session, and MFA negative tests pass with production-equivalent roles.
- [ ] Database/Redis are private and TLS certificate verification is enabled.

## Edge and abuse controls

- [ ] HTTPS/HSTS, exact CORS origin, trusted proxy depth, cookies, CSP report,
      cache policy, body/header/time limits, and origin shielding were verified.
- [ ] Distributed rate limits, WAF rules, provider fraud limits, and spend alerts
      were tested across more than one application instance.
- [ ] Deferred payment, analytics, promotion, offline, hardware, CMS/CDN, tax,
      and fiscal features remain disabled unless separately approved.

## Release artifacts

- [ ] Backend/frontend/Flutter checks and full browser release gate pass without
      unexplained failures or skips.
- [ ] Final non-root read-only containers pass startup, health, secret-content,
      vulnerability, SBOM, provenance, and graceful-shutdown checks.
- [ ] Production promotes the verified immutable artifact; it is not rebuilt by
      an untrusted workflow. Branch/environment protection and reviewers apply.
- [ ] Dependency, secret, workflow-pin, and migration checksum gates pass.

## Operations

- [ ] Central security alerts reached the on-call owner in a synthetic test.
- [ ] An isolated restore drill met approved recovery objectives.
- [ ] Credential/session revocation and incident tabletop exercises completed.
- [ ] Privacy retention, deletion, export, processor, region, and support-access
      decisions are implemented and tested.
- [ ] A reviewer independently retested every Critical/High/Medium finding.
- [ ] Residual risks have an accountable owner, deadline, compensating control,
      and written acceptance.

## Approval

- Release digest:
- QA evidence bundle:
- Database role verification:
- Image/SBOM/provenance references:
- Restore exercise reference:
- Security approver and date:
- Deployment decision: APPROVED / REJECTED
