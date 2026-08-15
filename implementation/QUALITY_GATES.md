# Phase 09 quality gates

Last updated: 2026-08-14

## Automated gates

The repository now has a single CI quality workflow covering backend type-check, Jest, lint, frontend type-check, frontend lint, frontend production build, and high-severity production dependency audit. Local equivalents are:

```text
npm run type-check --prefix backend
npm run test:ci --prefix backend
npm run lint:ci --prefix backend
npm run type-check --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
```

The backend Jest configuration retains global coverage thresholds at 70% for branches, functions, lines, and statements. Run `npm run test:coverage --prefix backend` when the dedicated PostgreSQL test cluster is available.

## Critical journey matrix

| Journey | Automated evidence | Status |
|---|---|---|
| Customer OTP | Backend auth/security tests; browser smoke pending | Partial |
| Catalog/search/cart | Backend public contract tests; browser smoke | Partial |
| COD checkout/order history | Backend checkout tests; browser smoke pending | Partial |
| Staff login/authorization | Backend authorization tests; browser smoke pending | Partial |
| POS/receiving/transfers/shifts | Service/route tests; seeded browser journeys pending | Partial |
| Admin publication | Route/service tests; seeded browser journey pending | Partial |
| Role/store isolation | Authorization tests; complete mutation matrix pending | Partial |
| Electronic payment sandbox | Intentionally disabled by Phase 07 policy | Deferred |

No deferred journey is represented as passing. Browser checks must capture URL, visible key elements, console errors, and API failures; release evidence belongs with the deployment record.

## Quality debt baseline

The existing lint debt remains warning-only: 474 backend warnings and 18 frontend warnings in the Phase 09 verification run. CI prevents command failures but does not falsely claim zero-warning status. The remaining cleanup is tracked as release risk R-024.
