# Phase 06 — Checkout and Order Lifecycle

## Objective

Deliver a complete COD-first customer purchase journey with correct stock and order state.

## Work packages

- [x] Customer identity and address selection foundation (OTP session + checkout address form)
- [x] Store and fulfillment validation
- [x] Delivery/pickup selection
- [x] Cart price and stock revalidation
- [ ] Promotions and loyalty redemption; deferred to loyalty/promotion contract hardening
- [x] COD eligibility boundary; COD-first checkout rejects unavailable stock and requires authenticated customer
- [x] Order review and confirmation
- [x] Stock reservation with expiry and release primitives
- [x] Idempotent order submission
- [x] Enforced order state machine remains available for staff lifecycle transitions
- [x] Customer order list, detail, timeline, and cancellation
- [ ] Returns and support UI remain follow-up surfaces
- [ ] Staff fulfillment screens remain Phase 08/operations follow-up

## Acceptance gate

- [x] Authenticated customer can submit a COD order through `/checkout`.
- [x] Duplicate submissions with the same idempotency key return the existing order.
- [x] Checkout locks product/store keys transactionally and checks available stock before reservation.
- [x] Illegal lifecycle transitions are rejected and written transition events are available.
- [x] Customer order detail reads the same order/event records used by staff APIs.

Phase boundary: COD checkout, customer ownership, transactional price/stock validation, idempotency, reservations, order events, lifecycle-safe customer order views, and cancellation are implemented. Promotions/loyalty redemption, returns/support UI, staff fulfillment screens, database-backed concurrency tests, and browser/E2E checkout verification remain release-gate follow-up work.
