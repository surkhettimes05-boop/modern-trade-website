# Release blocker state

**2026-10-06: NOT READY.** Current blocker/evidence list is
[PRODUCTION_READINESS.md](PRODUCTION_READINESS.md). Entries below are historical.
Electronic-payment certification is excluded from the COD-only launch scope.

This file is updated during release remediation.

## Current blocker update — 2026-10-09

The PR worktree is locally validated, but the release remains **NOT READY**.
The active blockers are:

- Real Twilio Verify delivery and all OTP failure/reuse/rate-limit journeys are
  unverified; no production SMS credentials were supplied.
- No reachable Render readiness response, production migration-032 evidence,
  least-privilege role proof, authenticated COD order, inventory deduction, or
  cash reconciliation evidence is available.
- Vercel project access exists, but production has no server-only
  `PROXY_AUTH_SECRET`; no deployment/configuration mutation was made.
- Docker is unavailable for the clean/upgraded database, backup/restore,
  rollback, and dependency-failure drills.
- Frontend full `npm audit` remains red on the high-severity `braces` advisory
  inherited through `eslint-config-next`; there is no official fixed release,
  and no safe non-breaking remediation was available.

The returns/refunds feature is now explicitly disabled at web-order, POS, and
legacy privileged lifecycle route entry points. This closes a code-level blocker
but does not replace the missing production evidence above.

| Blocker | Status | Attempted remediation | Result | Remaining dependency | Exact next action |
|---|---|---|---|---|---|
| Backend Prettier | VERIFIED | Formatted paymentService.ts; reran check, lint, typecheck, Jest, and build | PASS | None | None |
| Frontend API proxy 500s | VERIFIED | Replaced opaque Next rewrite with controlled proxy fallback | Public endpoints return 200 fallback data when backend is unavailable | Backend stack still required for real API certification | Run route sweep against production stack |
| Docker Desktop | EXTERNAL ACTION REQUIRED | Checked installation paths, services, processes, WSL2, virtualization, and attempted official winget install | Docker is not installed; winget attempt timed out | Installation and Docker Desktop initialization | Install Docker Desktop, then verify docker version and docker compose version |
| WSL2/Ubuntu | EXTERNAL ACTION REQUIRED | Ran wsl status/listing and attempted `wsl -d Ubuntu -- true` | WSL2 is installed, but Ubuntu cannot mount its registered VHDX (`ERROR_PATH_NOT_FOUND`) | Repair/reinstall the Ubuntu distro; do not unregister it until data is confirmed disposable | Run `wsl --update`, reboot if requested, then repair Ubuntu from Windows Settings or install a fresh disposable distro; verify `wsl -l -v` and `wsl -d Ubuntu -- true` |
| Playwright browsers | EXTERNAL ACTION REQUIRED | Confirmed Playwright 1.62.1 and attempted matching browser install | Revisions 1234/1538/2336 absent; install incomplete | CDN/download access | Run npx playwright install chromium firefox webkit |
| Playwright project config | FIXED | Removed machine-specific executable paths; retained supported device descriptors | All four projects list correctly | Compatible binaries | Run projects after installation |
| Redis certification | EXTERNAL ACTION REQUIRED | Reviewed Compose and Redis integration paths | Cannot run without Docker/Redis 7 | Docker engine | Start QA Compose stack and run Redis certification |
| Fresh PostgreSQL certification | EXTERNAL ACTION REQUIRED | Reviewed migration runner, manifest, and migration 017 | Exact clean-container run unavailable | Docker/PostgreSQL 15 | Run QA reset and verify migration tracking from zero |
| Exact production artifact | EXTERNAL ACTION REQUIRED | Frontend/backend production builds pass; Compose artifact not built | Container artifact not executed | Docker engine | Build and run docker-compose.qa.yml |
| Payment sandbox credentials | EXTERNAL ACTION REQUIRED | Audited source and created sandbox template | No live transaction possible | Credentials and public HTTPS callbacks | Populate secrets outside repository and run provider matrix |
| eSewa/Khalti initiation and verification | VERIFIED | Implemented eSewa HMAC/base64 form signing and status verification; implemented Khalti initiation and lookup with amount/pidx checks; added deterministic tests | Backend tests pass 195/195 | Live sandbox credentials/callbacks; refunds/reconciliation still need provider contracts | Run sandbox matrix once credentials and public HTTPS callback exist |
| Fonepay live adapter | EXTERNAL ACTION REQUIRED | Audited provider class and searched official/repository contracts | Adapter still has placeholder QR/signature/verification behavior; no safe contract available to implement | Fonepay merchant API contract and signing specification | Supply the official Fonepay sandbox/API contract, then implement and test it |
| Git revision identity | EXTERNAL ACTION REQUIRED | Confirmed workspace has no .git directory | No immutable commit identity | Release-process decision | Initialize local Git only if approved; do not publish |
