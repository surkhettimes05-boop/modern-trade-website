# Phase 00 — Baseline and Scope

## Objective

Freeze a trustworthy baseline and define exactly what the first production release includes.

## Work packages

- [x] Re-run backend tests, typecheck, and build.
- [x] Re-run frontend lint and build.
- [x] Verify clean and repeated migrations.
- [x] Inventory backend endpoints by production status.
- [x] Map each MVP journey to UI, API, service, and tables.
- [x] Confirm the initial market, currency, locale, tax context, and phone format.
- [x] Confirm MVP features and explicit deferrals.
- [x] Record accepted decisions in `DECISIONS.md`.
- [x] Create release-risk register with owners.

## Recommended MVP

Include public catalog, customer OTP, persistent cart, COD checkout, basic loyalty, staff authentication, POS cash sales, receiving, transfers, shifts, core admin CRUD, and audit logs.

Defer multiple electronic providers, multiple map providers, advanced recommendations, advanced segmentation, and nonessential hardware integrations.

## Acceptance gate

- [x] Baseline commands pass.
- [x] MVP scope is approved.
- [x] Market decision is accepted.
- [x] Every MVP journey has measurable acceptance criteria.
- [x] Deferred features are not presented as functional production features.

See `implementation/PHASE00_BASELINE.md` and `implementation/RELEASE_RISKS.md` for evidence, journey criteria, and open release risks.
