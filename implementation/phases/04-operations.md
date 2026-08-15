# Phase 04 — Store Operations Application

## Objective

Replace the single prototype console with complete store workflows.

## Routes

- [x] `/operations/dashboard`
- [x] `/operations/pos`
- [x] `/operations/orders`
- [x] `/operations/inventory`
- [x] `/operations/inventory/batches`
- [x] `/operations/inventory/adjustments`
- [x] `/operations/receiving`
- [x] `/operations/transfers`
- [x] `/operations/shifts`
- [x] `/operations/reconciliation`
- [x] `/operations/devices`
- [x] Redirect `/operations` to the dashboard.

## Workflows

- [ ] POS basket, cash tender, receipt, void, loyalty, and idempotency
- [ ] Inventory visibility, adjustments, batches, expiry, and movement history
- [ ] Purchase-order receiving with partials, damage, batches, and variances
- [ ] Transfer request, approval, dispatch, receipt, variance, and cancellation
- [ ] Shift open, cash movements, close, variance, and approval
- [x] Device and offline-sync status (live device endpoint registered and surfaced)
- [x] Logout and live profile/store context; notifications, end-shift, and quick actions remain follow-up controls

## Acceptance gate

- [x] No operations navigation link returns 404.
- [x] Cashier-facing shift-open and cash-sale actions are wired to real protected APIs; browser journey verification remains open.
- [x] Receiving and transfers are surfaced through their real protected APIs; end-to-end inventory mutation verification remains open.
- [x] Store-scope checks are enforced in the protected operations hook for explicit store identifiers.

Phase boundary: the operations application routes, live workbench states, device registration, capability gates, and explicit store-scope enforcement are complete. Browser/E2E cashier/receiving/transfer journeys and deeper database-level isolation audits remain release-gate work.
