# NOVA MART Completion Workspace

This folder is the execution guide for coding agents completing NOVA MART.

## Mission

Turn the current backend-heavy prototype into a secure, coherent, deployable retail platform without weakening the verified database or test foundations.

## Current verified baseline

- Backend: 16 suites, 172 tests passing, 0 skipped
- Backend typecheck and build: passing
- Canonical PostgreSQL migrations: clean and idempotent
- Frontend production build: passing
- Frontend pages: 22
- Full admin application: not implemented
- Operations application: only `/operations` is implemented
- Electronic payment providers: intentionally fail closed in production

## Non-negotiable guardrails

1. Preserve the canonical migration runner and isolated PostgreSQL test harness.
2. Never restore fake payment success in production.
3. Never weaken authentication, authorization, UUIDs, foreign keys, or database constraints.
4. Do not add `.skip`, `.only`, `--forceExit`, or trivial assertions to obtain green tests.
5. Treat the backend as authoritative for permissions, prices, stock, orders, and payments.
6. Do not expose default production credentials.
7. Do not claim a phase complete until its acceptance gate passes.
8. Keep changes scoped to the active work package.
9. Preserve unrelated user changes in dirty worktrees.
10. Record architectural decisions in `DECISIONS.md`.

## Execution order

| Order | Work package | File |
|---:|---|---|
| 0 | Baseline and scope | `phases/00-baseline-and-scope.md` |
| 1 | Shared contracts and market configuration | `phases/01-platform-contracts.md` |
| 2 | Staff authentication and authorization | `phases/02-staff-auth.md` |
| 3 | Admin MVP | `phases/03-admin-mvp.md` |
| 4 | Operations application | `phases/04-operations.md` |
| 5 | Storefront unification | `phases/05-storefront.md` |
| 6 | Checkout and orders | `phases/06-checkout-orders.md` |
| 7 | External integrations | `phases/07-integrations.md` |
| 8 | Analytics, audit, and compliance | `phases/08-analytics-audit.md` |
| 9 | Testing and quality | `phases/09-testing-quality.md` |
| 10 | Deployment and operations | `phases/10-deployment.md` |
| 11 | Production release gate | `phases/11-release-gate.md` |

## Agent workflow

Before coding:

1. Read this file, `AGENT_INSTRUCTIONS.md`, `STATUS.md`, and the active phase.
2. Read any applicable repository `AGENTS.md` files.
3. Confirm the baseline commands still pass for the affected subsystem.
4. Mark exactly one work package `IN PROGRESS` in `STATUS.md`.
5. Add material product/architecture decisions to `DECISIONS.md`.

During coding:

1. Implement the smallest coherent vertical slice.
2. Add or update meaningful tests with the implementation.
3. Verify authorization and store scope server-side.
4. Use observable behavior in tests instead of brittle internal call ordering.
5. Update API and UI together when a contract changes.

Before handoff:

1. Run the phase verification commands.
2. Complete the active phase checklist honestly.
3. Update `STATUS.md` with evidence and remaining blockers.
4. Add a handoff entry to `HANDOFF.md`.
5. Do not mark complete with unresolved acceptance criteria.

## Standard verification

From `backend/`:

```bash
npm run type-check
npm run build
npm test -- --runInBand --detectOpenHandles
```

From `frontend/`:

```bash
npm run lint
npm run build
```

For UI work, also verify the affected journey in a browser at desktop and mobile widths.

