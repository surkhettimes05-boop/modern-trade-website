# ADR-001: Nepal-first validated market configuration

Status: accepted for the production pilot.

## Decision

The initial launch market is Nepal: `NP`, `NPR`, `en-NP`, `Asia/Kathmandu`, IRD/VAT labels, Nepal phone/address validation, COD checkout and cash POS. India (`IN`, `INR`, `en-IN`, `Asia/Kolkata`, GST) remains a future market definition only.

Production configuration is explicit and validated at startup. `ACTIVE_MARKET=IN`, missing market variables, or India defaults on the Nepal path stop startup. Adding an India definition does not certify or activate it.

The backend market registry owns country, currency, locale, timezone, tax regime/rate/labels, address labels, phone/postal validation and allowed launch payment methods. Database migration 016 and the repeatable development seed converge existing and fresh environments on Nepal. Historical migrations retain their checksums even where they contain superseded India defaults.

## Consequences

- Nepal is the only pilot path exercised by seeds, APIs, checkout, storefront and tests.
- Electronic providers are not part of the launch payment method list.
- Future India activation requires a separate decision, migration/data review, provider selection, legal/tax review and a new certification run.
- UI code formats prices from the browser-safe Nepal market contract and must not introduce independent country defaults.
