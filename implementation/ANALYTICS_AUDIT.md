# Analytics and audit contract

Last updated: 2026-08-14

## Metric ownership and formulas

| Metric | Formula | Source | Owner | Status |
|---|---|---|---|---|
| Gross sales | Sum of source transaction `total_amount` | `sales`, `web_orders` | Finance | Provisional until reconciliation |
| Net sales | Gross sales minus discounts | `sales` projection | Finance | Provisional |
| Order count | Count of source orders in the selected period | `web_orders` | Commerce | Provisional |
| Average order value | Gross revenue / order count | `web_orders` | Commerce | Provisional |
| Inventory movement | Sum of signed inventory transaction quantities by store/product/date | `inventory_transactions` | Operations | Provisional |

All dates must use the configured market business timezone. Metrics are read-only projections; event processing never mutates source transactions. Inventory events validate required source identifiers and refresh the inventory projection boundary.

## Audit and retention

Sensitive mutations should record actor, role/type, session, request/correlation ID, entity, before/after values, scope, timestamp, and outcome. Audit records include a previous-hash/audit-hash chain and support bounded search plus CSV export. Production retention defaults: audit records 7 years, payment evidence 7 years, operational analytics 24 months, and customer analytics only while required for the stated purpose; legal holds override deletion.

## Compliance

VAT and tax summaries are labeled `PROVISIONAL` until a Nepal-specific professional review confirms VAT/IRD treatment, invoice requirements, filing mappings, and applicable exemptions. They must not be submitted as filed returns based solely on this implementation.
