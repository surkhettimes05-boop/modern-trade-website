# Phase 07 integration contract

Last updated: 2026-08-14

The Nepal/NPR MVP is deliberately COD-only. eSewa, Khalti, card payments, refunds, reconciliation, and external payment verification remain disabled until a complete certified adapter is selected and sandbox-tested. Production startup rejects `ENABLE_ELECTRONIC_PAYMENTS=true`.

Notifications currently use a durable database outbox. Production email/SMS delivery requires a provider name and API key pair (`EMAIL_PROVIDER`/`EMAIL_PROVIDER_API_KEY`, `SMS_PROVIDER`/`SMS_PROVIDER_API_KEY`). Without a provider, OTP delivery fails closed and notification attempts become `DEAD_LETTER`; message bodies and OTPs are not logged in production.

Maps are disabled unless `DEFAULT_MAP_PROVIDER` is `Baato` or `Galli` and its matching API key is present. No provider is instantiated without credentials, and unavailable providers return `MAP_PROVIDER_UNAVAILABLE`.

Required checks: start with COD-only configuration; confirm electronic-payment enablement fails; confirm incomplete map and notification pairs fail; replay a signed webhook and verify the second request is ignored; send an unsigned production webhook and verify rejection. A future provider must pass sandbox intent, redirect, signed webhook replay, expiry, refund, and reconciliation smoke tests before production enablement.
