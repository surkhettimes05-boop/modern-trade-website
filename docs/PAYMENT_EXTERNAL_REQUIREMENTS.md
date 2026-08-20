# External payment requirements

The Nepal pilot enables only COD checkout and cash POS. No electronic provider is certified.

## eSewa

Required before enablement: approved merchant code and secret, provider-confirmed HMAC/base64 field contract, UAT API base URL, public HTTPS success/failure callbacks, allowlisting requirements, status lookup contract, refund contract, reconciliation report contract, expiry rules and replay/duplicate expectations. Amount, transaction UUID and product code must be verified server-side.

## Khalti

Required before enablement: approved secret/public keys, UAT initiation/lookup endpoints, public HTTPS return URL and website URL, provider-confirmed callback model, `pidx` lifecycle, amount-in-paisa verification, refund contract, reconciliation report contract, expiry rules and duplicate/replay expectations.

## Fonepay

Required before implementation: official merchant API/QR contract, signing/verification specification, sandbox credentials/endpoints, callback schema, status/refund/reconciliation contracts and public HTTPS callback requirements. The retained legacy adapter is deliberately fail-closed.

Credentials must be stored outside Git and never exposed to the browser or logs. Provider promotion also requires idempotency and valid/tampered/duplicate/expired/mismatched event tests plus live sandbox evidence. No live sandbox result is claimed.
