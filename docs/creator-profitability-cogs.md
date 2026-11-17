# Creator programme COGS and contribution reporting

## Cost evidence sources

- **Online commerce:** At delivery, the order fulfillment transaction records the extended cost of each order line from the FIFO batch inventory actually issued to fulfill it. The line snapshot is written to `web_order_items.cost_total_snapshot` with `cost_evidence_status`.
- **Physical POS:** Pasalho Lite calculates COGS from each finalized `SaleItem.unitCostSnapshot × quantity` and includes the total in the signed creator-attribution outbox payload. The central API stores the received amount and evidence status on `creator_purchase_events`.
- **Historical events:** Existing order lines and creator purchase events are marked `MISSING_COST`; no cost is backfilled from retail price, current catalog cost, or an estimate.

## Calculation

For cost-covered purchase events:

`gross profit = eligible merchandise spend − recorded COGS`

`creator contribution = eligible merchandise spend − recorded COGS − creator reward`

The leaderboard ranks creators with complete COGS evidence by creator contribution. If any attributed purchase for a creator lacks cost evidence in the selected period, that creator's gross profit and contribution are withheld and their status is `INCOMPLETE_COST_DATA`. Revenue and known cost remain visible, alongside cost coverage.

## What this is not

Creator contribution is **not net profit**. This version does not yet deduct returns/refunds, payment fees, delivery costs, shrinkage, store payroll, rent, marketing overhead or tax. POS and online return/reversal adjustments must be implemented before reward settlement is enabled for refunded purchases or before the contribution metric is used as final profitability.

## Release gates

1. Apply migration `043_creator_profitability_cogs`.
2. Verify online delivery writes cost snapshots from the exact batches decremented.
3. Verify POS sale outbox carries the sale-time cost snapshot and HMAC signature.
4. Confirm central ingestion persists POS cost evidence exactly once.
5. Validate complete and missing-cost scenarios in the PostgreSQL analytics integration test.
6. Confirm dashboard coverage, contribution ranking and the explicit pre-overhead/pre-refund caveat.
