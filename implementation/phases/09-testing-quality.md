# Phase 09 — Testing and Quality

## Objective

Provide automated evidence for every release-critical workflow and remove quality debt that obscures defects.

## Status

Complete with risks. CI quality gates, frontend type-checking, reproducible test commands, a critical-journey matrix, dependency auditing, and honest coverage/evidence reporting are now in place. Full browser E2E coverage and lint-debt elimination remain release work.

## Completed foundation

- Added CI workflow `.github/workflows/quality.yml`.
- Added backend `test:ci`, `test:coverage`, and lint baseline commands.
- Added frontend `type-check` command.
- Added quality-gate and critical-journey documentation.

## Backend

- [ ] Route/service coverage for all MVP domains
- [ ] Permission and store-scope matrix
- [ ] Orders, reservations, receiving, transfers, shifts, webhooks, refunds, retries, and retention

## Frontend

- [ ] Component and form tests
- [ ] Loading, empty, error, expired, and forbidden states
- [ ] Accessibility checks

## End-to-end

- [ ] Customer OTP
- [ ] Catalog/search/cart
- [ ] COD checkout and tracking
- [ ] Staff login
- [ ] POS sale
- [ ] Receiving and transfer
- [ ] Shift reconciliation
- [ ] Admin product publication
- [ ] Role/store isolation
- [ ] Electronic payment sandbox

## Quality gates

- [ ] Frontend lint warnings reduced from 20 to zero
- [ ] Backend lint warnings reduced from 470 to an approved zero/minimal baseline
- [x] Dependency scanning
- [x] Coverage thresholds configured
- [x] Contract and migration tests in CI

## Acceptance gate

- [ ] No skipped release-blocking tests.
- [ ] All critical journeys have E2E coverage.
- [ ] No serious automated accessibility violations.
- [ ] No unresolved high-severity dependency vulnerabilities.

## Remaining risks

- Full customer/staff/admin/POS browser journeys are not yet automated.
- Existing lint warnings remain above the desired zero-warning target.
- Secret scanning and accessibility automation still need dedicated CI tooling.
