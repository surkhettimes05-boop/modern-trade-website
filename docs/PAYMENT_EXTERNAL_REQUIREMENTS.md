# External payment requirements

The Nepal pilot enables only COD checkout and cash POS. No electronic provider is certified.

## eSewa

Required before enablement: approved merchant code and secret, provider-confirmed HMAC/base64 field contract, UAT API base URL, public HTTPS success/failure callbacks, allowlisting requirements, status lookup contract, refund contract, reconciliation report contract, expiry rules and replay/duplicate expectations. Amount, transaction UUID and product code must be verified server-side.

## Khalti

Required before enablement: approved secret/public keys, UAT initiation/lookup endpoints, public HTTPS return URL and website URL, provider-confirmed callback model, `pidx` lifecycle, amount-in-paisa verification, refund contract, reconciliation report contract, expiry rules and duplicate/replay expectations.

## Fonepay

Required before implementation: official merchant API/QR contract, signing/verification specification, sandbox credentials/endpoints, callback schema, status/refund/reconciliation contracts and public HTTPS callback requirements. The retained legacy adapter is deliberately fail-closed.

Credentials must be stored outside Git and never exposed to the browser or logs. Provider promotion also requires idempotency and valid/tampered/duplicate/expired/mismatched event tests plus live sandbox evidence. No live sandbox result is claimed.


## Pasalho payment-engine sandbox

Development can proceed before provider credentials are issued. With
`ENABLE_ELECTRONIC_PAYMENTS=true` and `ENABLE_PAYMENT_MOCK=true` in a
non-production environment, staff can create `MOCK_QR` payment intents and
confirm them through the protected mock-confirm route.

Mock confirmation writes append-only `payment_evidence`, requires an exact
amount match, is idempotent by provider/source reference, and locks the payment
intent while completing it. Production rejects `MOCK_QR` even if the flag is
accidentally configured.

Promotion to a real provider must replace sandbox confirmation with the
provider's certified callback/status contract. Observer or customer evidence
may be retained for investigation but must not independently release goods.
