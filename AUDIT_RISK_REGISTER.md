# Project finisher risk register

| ID | Severity | Area | Evidence and impact | Reproduction | Fix / verification |
|---|---|---|---|---|---|
| R-001 | P2 | Integration health reporting | `getIntegrationSnapshot` returned `MISCONFIGURED` for complete email/SMS and map configuration, producing false operational signals. | Call `getIntegrationSnapshot` with complete provider variables. | Corrected status classification in `backend/src/config/integrations.ts`; focused Jest tests assert enabled, disabled, and incomplete states. |
| R-002 | P1 | Deployment certification | Docker, Redis, fresh PostgreSQL migration, production-container, and browser gates cannot be executed in this workspace because Docker is not installed, the registered Ubuntu WSL distro cannot mount, and Playwright browsers are absent. | Run the documented QA Compose and Playwright commands after installing prerequisites. | Existing release blocker remains external; deployment is not claimed. |
| R-003 | P1 | Payment certification | Live eSewa/Khalti sandbox callbacks require provider credentials and public HTTPS; Fonepay adapter lacks an approved provider contract. | Run the provider sandbox matrix with approved credentials and callback URLs. | Existing provider unit/security tests pass; live certification remains external. |
| R-004 | P2 | End-to-end certification | The backend suite passes, but no real browser/backend/database/Redis stack smoke test was possible without the external runtime prerequisites. | Start QA Compose, install browsers, then run `npm run qa:verify` and Playwright projects. | Static checks, production builds, and backend tests pass; E2E remains unverified. |

## Task DAG

- T1: Correct integration status reporting — no dependencies — complete.
- T2: Run backend/frontend static checks, builds, and backend tests — depends on T1 — complete.
- T3: Start Docker QA stack and run migration/Redis/API certification — independent of T1, blocked by R-002.
- T4: Run browser E2E/accessibility smoke tests — depends on T3 and browser installation, blocked by R-002.
- T5: Run payment sandbox matrix — independent of T3, blocked by R-003.
- T6: Deploy and production-smoke-test — depends on T3–T5 and deployment credentials/authorization, not attempted.
