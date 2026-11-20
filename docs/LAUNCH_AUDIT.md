# Pasalho Website Launch Audit

## Scope

This audit traces the existing Next.js web frontend, Fastify backend, PostgreSQL migrations, and launch/admin workflows. It excludes the CEO Dashboard. The current launch target is Nepal commerce with NPR, Asia/Kathmandu, COD and cash POS; electronic payment, returns, and refund workflows are deferred.

## 1. Fully implemented features

- Nepal OTP login/registration, hashed OTP storage, customer sessions, CSRF protection, and logout/session validation.
- Customer address CRUD, Nepal province/district/municipality/ward data, saved default addresses, and owner-scoped address reads.
- Published product, category, store, and offer catalog routes.
- Browser cart persistence, store selection, cart quantity controls, server-synchronized cart items, search, and category navigation.
- Authoritative member pricing quotes with signed tokens and checkout quote re-validation.
- Delivery-zone resolution and address-to-store assignment.
- Transactional COD checkout with idempotency, fingerprinted retries, server-calculated NPR totals, and stock reservations.
- Customer order history/detail, order events, and customer cancellation for eligible states.
- Admin/staff capability checks, scoped order operations, order lifecycle events, reservation visibility, fulfillment assignment, COD settlement evidence, and inventory deduction on delivery.
- Batch inventory visibility and inventory transactions in existing operational services.
- Migration runner with ordered SQL migrations and database-role/security verification.
- Existing automated backend unit/security/integration coverage and frontend Playwright coverage.

## 2. Partially implemented features

- Customer profile editing is available in backend services, but the public launch surface should be considered incomplete until end-to-end profile tests are added.
- Product variants are represented in the catalog model only insofar as SKUs and pack metadata exist; no dedicated variant workflow is proven launch-ready.
- Product image handling supports URLs/image arrays but no launch image validation or CDN lifecycle workflow is documented.
- Store/fulfillment assignment exists, though operational runbooks and UI verification need staging evidence.
- Notifications have service scaffolding, but production SMS/email delivery depends on configured providers and templates.
- Order lifecycle is implemented for the six launch states, with failure/cancellation states; delivery and operations UI consume the transitions.

## 3. Missing features

- A dedicated customer profile API/UI regression suite.
- Automated E2E browser coverage of registration, address creation, cart persistence, checkout, COD receipt, and order tracking.
- A complete migration replay in a clean disposable PostgreSQL database after migration 050.
- Staging deployment and staging smoke evidence.
- Production monitoring dashboards and alert routing for commerce failures.

## 4. Broken features

- No unambiguously broken launch feature was confirmed during static audit and baseline tests. Any previously present PENDING_PAYMENT/PICKING/PACKED consumer mismatch is addressed by migration 050 and the updated route/service consumers.

## 5. Critical bugs

- Before this audit, COD creation could be represented as PENDING_PAYMENT despite not awaiting an online payment. It is now created as RECEIVED/PENDING.
- Legacy lifecycle names could diverge across backend and frontend. This is normalized for COD by migration 050 and updated in launch consumers.
- Address creation previously allowed missing municipality/ward values. It now requires a valid Nepal ward pair.
- Cart quantity updates did not consistently check all active stock. Server cart and checkout validation now apply available-stock checks.

## 6. Database migration risks

- Migration 050 backfills COD PENDING/PENDING_PAYMENT to RECEIVED and legacy PICKING/PACKED to PROCESSING/READY. Review historical status reporting before applying to a database with mixed commerce types.
- Migration 050 adds a non-negative check on batch_inventory. Existing negative values will cause migration failure; reconcile them before production migration.
- The migration manifest and database migration count must remain synchronized.
- Several schema files contain broad historical/payment/return features. They are not enabled at runtime; do not enable deferred feature flags.

## 7. API integration problems

- Electronic payment providers remain in source but must remain disabled. Production configuration must keep ENABLE_ELECTRONIC_PAYMENTS false.
- Customer-facing and staff-facing APIs use separate auth/session mechanisms; proxies must preserve both cookies and CSRF headers.
- Stripe-like/online-payment response shapes must not be used for COD.
- SMS, Twilio/Firebase, Redis, database, and observability integrations require production secrets and health checks.

## 8. Security risks

- Staff operations require scoped capabilities, CSRF, store scope, and privileged administration protections.
- Customer resources require customer-session authentication and owner checks.
- Public catalog remains public; mutation routes remain protected.
- Production secrets, JWT signing keys, OTP provider credentials, and database roles must not use example values.
- Production CORS, proxy trust, cookie secure flags, and rate limiting require deployment-specific validation.
- Legacy public/admin routes must remain governed by ENABLE_ADMIN_API and route-feature configuration.

## 9. Launch blockers

- Staging database migration replay and smoke evidence.
- Staging verification of COD lifecycle transitions and cash settlement.
- Production provider credentials and delivery-zone/store data verification.
- Confirmation of inventory and batch data, including non-negative quantities.
- Frontend Playwright checkout integration in a running environment.

## 10. Recommended implementation order

1. Replay migration 050 against a clean QA database and a database-role-verified copy.
2. Complete/profile and address E2E tests.
3. Complete catalog/cart/stock/delivery checkout E2E tests.
4. Test all lifecycle transitions and cancellation stock restoration.
5. Verify operations assignment and COD cash settlement on staging.
6. Run frontend and backend CI/build checks.
7. Create a verified PR; do not merge or deploy to production.
