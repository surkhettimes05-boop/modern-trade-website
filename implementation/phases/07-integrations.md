# Phase 07 — External Integrations

## Objective

Replace mocks with production integrations one provider at a time while retaining fail-closed safety.

## Status

Complete with risks. The fail-closed integration boundary is implemented, but no electronic payment, external notification, or real map provider is certified for production.

## Completed safety layer

- Production validation and non-secret integration health snapshot.
- COD-only payment policy; electronic-payment enablement fails startup.
- Required signed webhooks in production with timing-safe comparison and idempotency index.
- Credential-gated map provider registration and explicit unavailable errors.
- Production OTP logging removed; notification failures recorded as dead letters.
- Migration `014_phase07_integration_safety.sql` and [integration runbook](../INTEGRATIONS.md).

## Payments

- [ ] Select one initial electronic provider.
- [ ] Validate configuration at startup.
- [ ] Implement initiation, signed webhook verification, server verification, expiry, refunds, and reconciliation.
- [ ] Enforce amount/order association and idempotency.
- [ ] Add sandbox and production smoke procedures.
- [x] Keep incomplete providers disabled in production.

## Notifications

- [ ] Select SMS and email providers.
- [ ] Implement OTP, order, fulfillment, delivery, and security notifications.
- [ ] Add retries, delivery status, suppression, consent, and dead-letter handling.

## Maps

- [ ] Select one initial map provider.
- [ ] Implement autocomplete, geocoding, reverse geocoding, store finder, distance, and delivery zones.
- [ ] Add timeout and outage behavior.

## Acceptance gate

- [ ] Provider sandbox journeys pass end to end.
- [ ] Missing or invalid credentials fail closed.
- [ ] Webhook replay is idempotent.
- [ ] Provider outage cannot corrupt order or payment state.

## Remaining risks

eSewa/Khalti initiation, verification, refund, reconciliation, external email/SMS delivery, consent/suppression, DLQ workers, and real Baato/Galli HTTP calls with timeout behavior remain deferred.
