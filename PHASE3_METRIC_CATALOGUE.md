# Phase 3 Metric Catalogue

## Overview
This catalogue defines all KPIs for Phase 3 management dashboards. Each metric includes business definition, formula, source tables, governance requirements, and implementation notes.

**Status Legend:**
- ✅ Ready to implement (data available)
- ⚠️ Partially ready (some data missing)
- ❌ Blocked (critical data missing)

---

## Sales KPIs

### Gross Sales
| Attribute | Value |
|-----------|-------|
| **Metric ID** | SALES_GROSS |
| **Name** | Gross Sales |
| **Business Definition** | Total value of all sales transactions before discounts |
| **Formula** | SUM(sales.total_amount) WHERE sale_status = 'COMPLETED' |
| **Source Tables** | sales |
| **Included Statuses** | COMPLETED |
| **Exclusions** | VOIDED, RETURNED, DRAFT, PENDING |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use sale_timestamp converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Finance Manager |
| **Data Quality Requirements** | No null total_amount, positive values only |
| **Drill-down Destination** | Sales detail report by store/date |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### Net Sales
| Attribute | Value |
|-----------|-------|
| **Metric ID** | SALES_NET |
| **Name** | Net Sales |
| **Business Definition** | Total value of sales after discounts |
| **Formula** | SUM(sales.total_amount - sales.discount_amount) WHERE sale_status = 'COMPLETED' |
| **Source Tables** | sales |
| **Included Statuses** | COMPLETED |
| **Exclusions** | VOIDED, RETURNED, DRAFT, PENDING |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use sale_timestamp converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Finance Manager |
| **Data Quality Requirements** | No null total_amount or discount_amount |
| **Drill-down Destination** | Sales detail report by store/date |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### Completed Transactions
| Attribute | Value |
|-----------|-------|
| **Metric ID** | SALES_TRANSACTIONS |
| **Name** | Completed Transactions |
| **Business Definition** | Count of completed sales transactions |
| **Formula** | COUNT(sales.id) WHERE sale_status = 'COMPLETED' |
| **Source Tables** | sales |
| **Included Statuses** | COMPLETED |
| **Exclusions** | VOIDED, RETURNED, DRAFT, PENDING |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use sale_timestamp converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Store Manager |
| **Data Quality Requirements** | Unique sale IDs |
| **Drill-down Destination** | Sales list by store/date |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### Average Basket Value
| Attribute | Value |
|-----------|-------|
| **Metric ID** | SALES_AVG_BASKET |
| **Name** | Average Basket Value |
| **Business Definition** | Average transaction value across completed sales |
| **Formula** | AVG(sales.total_amount) WHERE sale_status = 'COMPLETED' |
| **Source Tables** | sales |
| **Included Statuses** | COMPLETED |
| **Exclusions** | VOIDED, RETURNED, DRAFT, PENDING |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use sale_timestamp converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Store Manager |
| **Data Quality Requirements** | Exclude zero-value transactions |
| **Drill-down Destination** | Sales distribution by value ranges |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### Items Per Basket
| Attribute | Value |
|-----------|-------|
| **Metric ID** | SALES_ITEMS_PER_BASKET |
| **Name** | Items Per Basket |
| **Business Definition** | Average number of line items per transaction |
| **Formula** | AVG(item_count) WHERE sale_status = 'COMPLETED' |
| **Source Tables** | sales, sale_items |
| **Included Statuses** | COMPLETED |
| **Exclusions** | VOIDED, RETURNED, DRAFT, PENDING |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use sale_timestamp converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Store Manager |
| **Data Quality Requirements** | Count distinct sale_items per sale |
| **Drill-down Destination** | Sales with item count breakdown |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### Discounts
| Attribute | Value |
|-----------|-------|
| **Metric ID** | SALES_DISCOUNTS |
| **Name** | Total Discounts |
| **Business Definition** | Total discount amount across all sales |
| **Formula** | SUM(sales.discount_amount) WHERE sale_status = 'COMPLETED' |
| **Source Tables** | sales |
| **Included Statuses** | COMPLETED |
| **Exclusions** | VOIDED, RETURNED, DRAFT, PENDING |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use sale_timestamp converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Finance Manager |
| **Data Quality Requirements** | No null discount_amount |
| **Drill-down Destination** | Discount detail by store/date |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### Returns
| Attribute | Value |
|-----------|-------|
| **Metric ID** | SALES_RETURNS |
| **Name** | Returns |
| **Business Definition** | Total value of processed returns |
| **Formula** | SUM(returns.total_amount) WHERE return_status = 'PROCESSED' |
| **Source Tables** | returns |
| **Included Statuses** | PROCESSED |
| **Exclusions** | REQUESTED, APPROVED, REJECTED |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use return_timestamp converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Store Manager |
| **Data Quality Requirements** | No null total_amount |
| **Drill-down Destination** | Return detail by store/date |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### Voids
| Attribute | Value |
|-----------|-------|
| **Metric ID** | SALES_VOIDS |
| **Name** | Voids |
| **Business Definition** | Count and value of voided sales |
| **Formula** | COUNT(sales.id), SUM(sales.total_amount) WHERE sale_status = 'VOIDED' |
| **Source Tables** | sales |
| **Included Statuses** | VOIDED |
| **Exclusions** | COMPLETED, RETURNED, DRAFT, PENDING |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use voided_at converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Store Manager |
| **Data Quality Requirements** | Void reason required |
| **Drill-down Destination** | Void detail by store/date/reason |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### Tender Mix
| Attribute | Value |
|-----------|-------|
| **Metric ID** | SALES_TENDER_MIX |
| **Name** | Tender Mix |
| **Business Definition** | Breakdown of sales by payment method |
| **Formula** | GROUP BY sales.payment_method, SUM(total_amount) |
| **Source Tables** | sales |
| **Included Statuses** | COMPLETED |
| **Exclusions** | VOIDED, RETURNED, DRAFT, PENDING |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use sale_timestamp converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Finance Manager |
| **Data Quality Requirements** | No null payment_method |
| **Drill-down Destination** | Sales by tender type |
| **Version History** | v1.0 - Initial definition |
| **Status** | ⚠️ Partial (single payment_method field, no tender breakdown) |

### Gross Margin Estimate
| Attribute | Value |
|-----------|-------|
| **Metric ID** | SALES_MARGIN_GROSS |
| **Name** | Gross Margin Estimate |
| **Business Definition** | Estimated gross profit as percentage of sales |
| **Formula** | (SUM(sales.total_amount - cost) / SUM(sales.total_amount)) * 100 |
| **Source Tables** | sales, products (cost field missing) |
| **Included Statuses** | COMPLETED |
| **Exclusions** | VOIDED, RETURNED, DRAFT, PENDING |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use sale_timestamp converted to Nepal business date |
| **Refresh Frequency** | Daily |
| **Owner** | Finance Manager |
| **Data Quality Requirements** | Cost data required for all products |
| **Drill-down Destination** | Margin by product/category |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing product cost data) |

### Missing Cost Coverage
| Attribute | Value |
|-----------|-------|
| **Metric ID** | SALES_MISSING_COST |
| **Name** | Missing Cost Coverage |
| **Business Definition** | Percentage of sales with missing cost data |
| **Formula** | (COUNT(sales with missing cost) / COUNT(sales)) * 100 |
| **Source Tables** | sales, products (cost field missing) |
| **Included Statuses** | COMPLETED |
| **Exclusions** | VOIDED, RETURNED, DRAFT, PENDING |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use sale_timestamp converted to Nepal business date |
| **Refresh Frequency** | Daily |
| **Owner** | Finance Manager |
| **Data Quality Requirements** | N/A (this is a data quality metric) |
| **Drill-down Destination** | Sales with missing cost by product |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing product cost data) |

---

## Customer and Loyalty KPIs

### Identified Sales Rate
| Attribute | Value |
|-----------|-------|
| **Metric ID** | CUST_IDENTIFIED_RATE |
| **Name** | Identified Sales Rate |
| **Business Definition** | Percentage of sales with enrolled customer |
| **Formula** | (COUNT(sales WHERE customer_id IS NOT NULL) / COUNT(sales)) * 100 |
| **Source Tables** | sales |
| **Included Statuses** | COMPLETED |
| **Exclusions** | VOIDED, RETURNED, DRAFT, PENDING |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use sale_timestamp converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Loyalty Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Sales by customer enrollment status |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### New Members
| Attribute | Value |
|-----------|-------|
| **Metric ID** | CUST_NEW_MEMBERS |
| **Name** | New Members |
| **Business Definition** | Count of new customer enrollments in period |
| **Formula** | COUNT(customers) WHERE enrolled_at IN period |
| **Source Tables** | customers |
| **Included Statuses** | ACTIVE |
| **Exclusions** | SUSPENDED, DELETED |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use enrolled_at converted to Nepal business date |
| **Refresh Frequency** | Daily |
| **Owner** | Loyalty Manager |
| **Data Quality Requirements** | Unique customer IDs |
| **Drill-down Destination** | New member list by store/source |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### Active Members
| Attribute | Value |
|-----------|-------|
| **Metric ID** | CUST_ACTIVE_MEMBERS |
| **Name** | Active Members |
| **Business Definition** | Count of customers with activity in period |
| **Formula** | COUNT(DISTINCT customer_id) FROM sales WHERE sale_timestamp IN period |
| **Source Tables** | sales |
| **Included Statuses** | COMPLETED |
| **Exclusions** | VOIDED, RETURNED |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use sale_timestamp converted to Nepal business date |
| **Refresh Frequency** | Daily |
| **Owner** | Loyalty Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Active customer list |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### Repeat Rate
| Attribute | Value |
|-----------|-------|
| **Metric ID** | CUST_REPEAT_RATE |
| **Name** | Repeat Rate |
| **Business Definition** | Percentage of customers with multiple purchases in period |
| **Formula** | (COUNT(customers with >1 sale) / COUNT(customers with any sale)) * 100 |
| **Source Tables** | sales |
| **Included Statuses** | COMPLETED |
| **Exclusions** | VOIDED, RETURNED |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use sale_timestamp converted to Nepal business date |
| **Refresh Frequency** | Daily |
| **Owner** | Loyalty Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Repeat customer list |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### Earn Rate
| Attribute | Value |
|-----------|-------|
| **Metric ID** | LOYALTY_EARN_RATE |
| **Name** | Earn Rate |
| **Business Definition** | Average points earned per sale |
| **Formula** | AVG(sales.points_earned) WHERE sale_status = 'COMPLETED' |
| **Source Tables** | sales |
| **Included Statuses** | COMPLETED |
| **Exclusions** | VOIDED, RETURNED |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use sale_timestamp converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Loyalty Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Points earned by store/date |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### Redemption Rate
| Attribute | Value |
|-----------|-------|
| **Metric ID** | LOYALTY_REDEEM_RATE |
| **Name** | Redemption Rate |
| **Business Definition** | Average points redeemed per sale |
| **Formula** | AVG(sales.points_redeemed) WHERE sale_status = 'COMPLETED' |
| **Source Tables** | sales |
| **Included Statuses** | COMPLETED |
| **Exclusions** | VOIDED, RETURNED |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use sale_timestamp converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Loyalty Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Points redeemed by store/date |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### Expiry
| Attribute | Value |
|-----------|-------|
| **Metric ID** | LOYALTY_EXPIRY |
| **Name** | Points Expiring |
| **Business Definition** | Total points expiring in next 30 days |
| **Formula** | SUM(loyalty_earn_lots.remaining_points) WHERE expiry_date BETWEEN NOW() AND NOW() + 30 days |
| **Source Tables** | loyalty_earn_lots |
| **Included Statuses** | All (not expired) |
| **Exclusions** | is_expired = TRUE |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use expiry_date converted to Nepal business date |
| **Refresh Frequency** | Daily |
| **Owner** | Loyalty Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Expiring lots by customer/date |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### Outstanding Points
| Attribute | Value |
|-----------|-------|
| **Metric ID** | LOYALTY_OUTSTANDING |
| **Name** | Outstanding Points |
| **Business Definition** | Total available points across all customers |
| **Formula** | SUM(loyalty_ledger.points_signed) WHERE entry_type IN ('EARN', 'REDEEM') |
| **Source Tables** | loyalty_ledger |
| **Included Statuses** | POSTED |
| **Exclusions** | PENDING, FAILED, REVERSAL |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | N/A (current balance) |
| **Refresh Frequency** | Hourly |
| **Owner** | Loyalty Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Balance by customer/tier |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### Estimated Loyalty Liability
| Attribute | Value |
|-----------|-------|
| **Metric ID** | LOYALTY_LIABILITY |
| **Name** | Estimated Loyalty Liability |
| **Business Definition** | Estimated monetary value of outstanding points |
| **Formula** | SUM(loyalty_ledger.points_signed) * points_to_currency_rate |
| **Source Tables** | loyalty_ledger |
| **Included Statuses** | POSTED |
| **Exclusions** | PENDING, FAILED, REVERSAL |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | N/A (current balance) |
| **Refresh Frequency** | Daily |
| **Owner** | Finance Manager |
| **Data Quality Requirements** | Points-to-currency conversion rate required |
| **Drill-down Destination** | Liability by customer/tier |
| **Version History** | v1.0 - Initial definition |
| **Status** | ⚠️ Partial (missing conversion rate configuration) |

### Tier Movement
| Attribute | Value |
|-----------|-------|
| **Metric ID** | LOYALTY_TIER_MOVEMENT |
| **Name** | Tier Movement |
| **Business Definition** | Count of customers moving between tiers in period |
| **Formula** | COUNT(customers WHERE tier_changed_at IN period) |
| **Source Tables** | customers (tier field missing) |
| **Included Statuses** | ACTIVE |
| **Exclusions** | SUSPENDED, DELETED |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use tier_changed_at converted to Nepal business date |
| **Refresh Frequency** | Daily |
| **Owner** | Loyalty Manager |
| **Data Quality Requirements** | Tier system must be implemented |
| **Drill-down Destination** | Tier movement detail |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing tier system) |

### Missing-Points Cases
| Attribute | Value |
|-----------|-------|
| **Metric ID** | LOYALTY_MISSING_POINTS |
| **Name** | Missing-Points Cases |
| **Business Definition** | Count of open missing-points support requests |
| **Formula** | COUNT(customer_data_requests) WHERE request_type = 'CORRECTION' AND request_status IN ('PENDING', 'APPROVED') |
| **Source Tables** | customer_data_requests |
| **Included Statuses** | PENDING, APPROVED |
| **Exclusions** | COMPLETED, REJECTED |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use requested_at converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Loyalty Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Open requests list |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### Adjustment Activity
| Attribute | Value |
|-----------|-------|
| **Metric ID** | LOYALTY_ADJUSTMENTS |
| **Name** | Loyalty Adjustments |
| **Business Definition** | Count and value of manual point adjustments |
| **Formula** | COUNT(loyalty_ledger), SUM(points_signed) WHERE entry_type = 'ADJUST' |
| **Source Tables** | loyalty_ledger |
| **Included Statuses** | POSTED |
| **Exclusions** | PENDING, FAILED |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use effective_timestamp converted to Nepal business date |
| **Refresh Frequency** | Daily |
| **Owner** | Loyalty Manager |
| **Data Quality Requirements** | Actor must be non-SYSTEM for manual adjustments |
| **Drill-down Destination** | Adjustment detail by actor/reason |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

---

## Inventory KPIs

### On-Hand Quantity
| Attribute | Value |
|-----------|-------|
| **Metric ID** | INV_ON_HAND |
| **Name** | On-Hand Quantity |
| **Business Definition** | Total physical inventory quantity by store/product |
| **Formula** | SUM(inventory_transactions.quantity) WHERE transaction_type = 'RECEIPT' - SUM(quantity) WHERE transaction_type = 'ISSUE' |
| **Source Tables** | inventory_transactions (missing) |
| **Included Statuses** | All |
| **Exclusions** | N/A |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use transaction_timestamp converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Warehouse Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Inventory detail by store/product |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing inventory transaction table) |

### Available Quantity
| Attribute | Value |
|-----------|-------|
| **Metric ID** | INV_AVAILABLE |
| **Name** | Available Quantity |
| **Business Definition** | Quantity available for sale (on-hand minus allocated) |
| **Formula** | on_hand_quantity - allocated_quantity |
| **Source Tables** | inventory_transactions (missing) |
| **Included Statuses** | All |
| **Exclusions** | N/A |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use transaction_timestamp converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Warehouse Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Inventory detail by store/product |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing inventory transaction table) |

### Low-Stock Products
| Attribute | Value |
|-----------|-------|
| **Metric ID** | INV_LOW_STOCK |
| **Name** | Low-Stock Products |
| **Business Definition** | Count of products below reorder threshold |
| **Formula** | COUNT(store_product_availability) WHERE availability_status = 'LOW_STOCK' |
| **Source Tables** | store_product_availability |
| **Included Statuses** | LOW_STOCK |
| **Exclusions** | AVAILABLE, OUT_OF_STOCK |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use last_updated converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Warehouse Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Low-stock product list by store |
| **Version History** | v1.0 - Initial definition |
| **Status** | ⚠️ Partial (status only, no exact quantities) |

### Stockouts
| Attribute | Value |
|-----------|-------|
| **Metric ID** | INV_STOCKOUTS |
| **Name** | Stockouts |
| **Business Definition** | Count of products with zero availability |
| **Formula** | COUNT(store_product_availability) WHERE availability_status = 'OUT_OF_STOCK' |
| **Source Tables** | store_product_availability |
| **Included Statuses** | OUT_OF_STOCK |
| **Exclusions** N/A |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use last_updated converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Warehouse Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Stockout product list by store |
| **Version History** | v1.0 - Initial definition |
| **Status** | ⚠️ Partial (status only, no stockout events tracking) |

### Inventory Adjustments
| Attribute | Value |
|-----------|-------|
| **Metric ID** | INV_ADJUSTMENTS |
| **Name** | Inventory Adjustments |
| **Business Definition** | Count and value of inventory adjustments |
| **Formula** | COUNT(inventory_transactions), SUM(quantity) WHERE transaction_type = 'ADJUSTMENT' |
| **Source Tables** | inventory_transactions (missing) |
| **Included Statuses** | All |
| **Exclusions** | N/A |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use transaction_timestamp converted to Nepal business date |
| **Refresh Frequency** | Daily |
| **Owner** | Warehouse Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Adjustment detail by store/product/reason |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing inventory transaction table) |

### Transfer Activity
| Attribute | Value |
|-----------|-------|
| **Metric ID** | INV_TRANSFERS |
| **Name** | Transfer Activity |
| **Business Definition** | Count and value of inter-store transfers |
| **Formula** | COUNT(inventory_transfers), SUM(quantity) |
| **Source Tables** | inventory_transfers (missing) |
| **Included Statuses** | All |
| **Exclusions** | N/A |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use transfer_timestamp converted to Nepal business date |
| **Refresh Frequency** | Daily |
| **Owner** | Warehouse Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Transfer detail by from/to store |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing transfer table) |

### Expiry Risk
| Attribute | Value |
|-----------|-------|
| **Metric ID** | INV_EXPIRY_RISK |
| **Name** | Expiry Risk |
| **Business Definition** | Value of inventory expiring in next 90 days |
| **Formula** | SUM(batch_inventory.quantity * batch_inventory.cost) WHERE expiry_date BETWEEN NOW() AND NOW() + 90 days |
| **Source Tables** | batch_inventory (missing) |
| **Included Statuses** | All |
| **Exclusions** | N/A |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use expiry_date converted to Nepal business date |
| **Refresh Frequency** | Daily |
| **Owner** | Warehouse Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Expiring batch detail |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing batch tracking) |

### Data-Quality Exceptions
| Attribute | Value |
|-----------|-------|
| **Metric ID** | INV_DATA_QUALITY |
| **Name** | Inventory Data Quality Exceptions |
| **Business Definition** | Count of inventory data quality issues |
| **Formula** | COUNT(inventory_quality_exceptions) |
| **Source Tables** | inventory_quality_exceptions (missing) |
| **Included Statuses** | All |
| **Exclusions** | RESOLVED |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use detected_at converted to Nepal business date |
| **Refresh Frequency** | Daily |
| **Owner** | Warehouse Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Exception detail by type |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing quality exception table) |

---

## Operations and Finance KPIs

### Return and Void Rate
| Attribute | Value |
|-----------|-------|
| **Metric ID** | OPS_RETURN_VOID_RATE |
| **Name** | Return and Void Rate |
| **Business Definition** | Percentage of sales that were returned or voided |
| **Formula** | ((COUNT(voids) + COUNT(returns)) / COUNT(sales)) * 100 |
| **Source Tables** | sales, returns |
| **Included Statuses** | VOIDED, PROCESSED returns |
| **Exclusions** | DRAFT, PENDING |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use voided_at/return_timestamp converted to Nepal business date |
| **Refresh Frequency** | Daily |
| **Owner** | Store Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Void/return detail by store/reason |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### Cash and Digital Tender Totals
| Attribute | Value |
|-----------|-------|
| **Metric ID** | OPS_TENDER_TOTALS |
| **Name** | Cash and Digital Tender Totals |
| **Business Definition** | Total value by tender type (cash vs digital) |
| **Formula** | SUM(tenders.amount) GROUP BY tender_type |
| **Source Tables** | tenders (missing) |
| **Included Statuses** | All |
| **Exclusions** | VOIDED sales |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use tender_timestamp converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Finance Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Tender detail by store/date |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing tender table) |

### Reconciliation Exceptions
| Attribute | Value |
|-----------|-------|
| **Metric ID** | OPS_RECONCILIATION_EXCEPTIONS |
| **Name** | Reconciliation Exceptions |
| **Business Definition** | Count of payment reconciliation exceptions |
| **Formula** | COUNT(reconciliation_exceptions) WHERE status = 'OPEN' |
| **Source Tables** | reconciliation_exceptions (missing) |
| **Included Statuses** | OPEN |
| **Exclusions** | RESOLVED |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use detected_at converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Finance Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Exception detail by type/store |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing reconciliation table) |

### Unclosed Shifts
| Attribute | Value |
|-----------|-------|
| **Metric ID** | OPS_UNCLOSED_SHIFTS |
| **Name** | Unclosed Shifts |
| **Business Definition** | Count of shifts not closed within expected time |
| **Formula** | COUNT(shifts) WHERE status = 'OPEN' AND expected_close_time < NOW() |
| **Source Tables** | shifts (missing) |
| **Included Statuses** | OPEN |
| **Exclusions** | CLOSED |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use shift_date converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Store Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Unclosed shift detail by store |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing shift table) |

### Unmatched Payments
| Attribute | Value |
|-----------|-------|
| **Metric ID** | OPS_UNMATCHED_PAYMENTS |
| **Name** | Unmatched Payments |
| **Business Definition** | Count of payments not matched to sales |
| **Formula** | COUNT(payments) WHERE matched_to_sale IS NULL AND payment_timestamp < NOW() - 1 hour |
| **Source Tables** | payments (missing) |
| **Included Statuses** | All |
| **Exclusions** | Matched payments |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use payment_timestamp converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Finance Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Unmatched payment detail |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing payment table) |

### Suspicious Adjustment Patterns
| Attribute | Value |
|-----------|-------|
| **Metric ID** | OPS_SUSPICIOUS_ADJUSTMENTS |
| **Name** | Suspicious Adjustment Patterns |
| **Business Definition** | Detection of unusual adjustment patterns |
| **Formula** | COUNT(adjustments) WHERE (quantity > threshold OR frequency > threshold) |
| **Source Tables** | inventory_transactions (missing) |
| **Included Statuses** | All |
| **Exclusions** | N/A |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use adjustment_timestamp converted to Nepal business date |
| **Refresh Frequency** | Daily |
| **Owner** | Finance Manager |
| **Data Quality Requirements** | Thresholds configurable |
| **Drill-down Destination** | Suspicious adjustment detail |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing adjustment table) |

---

## Website and Digital KPIs

### Store-Page Engagement
| Attribute | Value |
|-----------|-------|
| **Metric ID** | WEB_STORE_ENGAGEMENT |
| **Name** | Store-Page Engagement |
| **Business Definition** | Page views and time on store pages |
| **Formula** | COUNT(page_views), AVG(time_on_page) WHERE page_type = 'STORE' |
| **Source Tables** | web_analytics (missing) |
| **Included Statuses** | All |
| **Exclusions** | Bots (user_agent filter) |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use page_view_timestamp converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Marketing Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Page view detail by store/page |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing analytics table) |

### Product Discovery
| Attribute | Value |
|-----------|-------|
| **Metric ID** | WEB_PRODUCT_DISCOVERY |
| **Name** | Product Discovery |
| **Business Definition** | Product page views and searches |
| **Formula** | COUNT(product_page_views), COUNT(product_searches) |
| **Source Tables** | web_analytics (missing) |
| **Included Statuses** | All |
| **Exclusions** | Bots |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use event_timestamp converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Marketing Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Product view/search detail |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing analytics table) |

### Offer Engagement
| Attribute | Value |
|-----------|-------|
| **Metric ID** | WEB_OFFER_ENGAGEMENT |
| **Name** | Offer Engagement |
| **Business Definition** | Offer clicks and conversions |
| **Formula** | COUNT(offer_clicks), COUNT(offer_conversions) |
| **Source Tables** | web_analytics (missing) |
| **Included Statuses** | All |
| **Exclusions** | Bots |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use event_timestamp converted to Nepal business date |
| **Refresh Frequency** | Hourly |
| **Owner** | Marketing Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Offer engagement detail |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing analytics table) |

### Loyalty Enrollment Funnel
| Attribute | Value |
|-----------|-------|
| **Metric ID** | WEB_ENROLLMENT_FUNNEL |
| **Name** | Loyalty Enrollment Funnel |
| **Business Definition** | Conversion rates through enrollment steps |
| **Formula** | (OTP requests / page views) * 100, (Verifications / OTP requests) * 100 |
| **Source Tables** | customer_otp, web_analytics (missing) |
| **Included Statuses** | All |
| **Exclusions** | N/A |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use created_at converted to Nepal business date |
| **Refresh Frequency** | Daily |
| **Owner** | Loyalty Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Funnel step detail |
| **Version History** | v1.0 - Initial definition |
| **Status** | ⚠️ Partial (OTP data available, missing page views) |

### Account-Login Success
| Attribute | Value |
|-----------|-------|
| **Metric ID** | WEB_LOGIN_SUCCESS |
| **Name** | Account-Login Success Rate |
| **Business Definition** | Percentage of successful logins |
| **Formula** | (COUNT(sessions) / COUNT(OTP verifications)) * 100 |
| **Source Tables** | customer_sessions, customer_otp |
| **Included Statuses** | All |
| **Exclusions** | Revoked sessions |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use created_at converted to Nepal business date |
| **Refresh Frequency** | Daily |
| **Owner** | Loyalty Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Login attempt detail |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### Contact/Support Completion
| Attribute | Value |
|-----------|-------|
| **Metric ID** | WEB_SUPPORT_COMPLETION |
| **Name** | Contact/Support Completion Rate |
| **Business Definition** | Percentage of contact requests resolved |
| **Formula** | (COUNT(contact_submissions WHERE status = 'RESOLVED') / COUNT(contact_submissions)) * 100 |
| **Source Tables** | contact_submissions |
| **Included Statuses** | All |
| **Exclusions** | N/A |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use created_at converted to Nepal business date |
| **Refresh Frequency** | Daily |
| **Owner** | Customer Service Manager |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Contact submission detail by status |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

---

## System Health KPIs

### Data Freshness
| Attribute | Value |
|-----------|-------|
| **Metric ID** | SYS_DATA_FRESHNESS |
| **Name** | Data Freshness |
| **Business Definition** | Time since last data update for each projection |
| **Formula** | NOW() - last_updated_at FROM data_freshness_tracking |
| **Source Tables** | data_freshness_tracking (missing) |
| **Included Statuses** | All |
| **Exclusions** | N/A |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | N/A (current status) |
| **Refresh Frequency** | Every 5 minutes |
| **Owner** | System Administrator |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Freshness detail by projection |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing freshness tracking table) |

### Location Connectivity
| Attribute | Value |
|-----------|-------|
| **Metric ID** | SYS_LOCATION_CONNECTIVITY |
| **Name** | Location Connectivity |
| **Business Definition** | Status of store connectivity to central system |
| **Formula** | COUNT(stores) WHERE last_heartbeat > NOW() - 5 minutes / COUNT(stores) |
| **Source Tables** | stores (heartbeat field missing) |
| **Included Statuses** | All |
| **Exclusions** | Temporarily closed stores |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | N/A (current status) |
| **Refresh Frequency** | Every 5 minutes |
| **Owner** | System Administrator |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Connectivity detail by store |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing heartbeat field) |

### Last Successful Synchronization
| Attribute | Value |
|-----------|-------|
| **Metric ID** | SYS_LAST_SYNC |
| **Name** | Last Successful Synchronization |
| **Business Definition** | Time since last successful sync for each store |
| **Formula** | NOW() - last_successful_sync FROM store_sync_status |
| **Source Tables** | store_sync_status (missing) |
| **Included Statuses** | All |
| **Exclusions** | N/A |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | N/A (current status) |
| **Refresh Frequency** | Every 5 minutes |
| **Owner** | System Administrator |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Sync status detail by store |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing sync status table) |

### Offline Queue Count
| Attribute | Value |
|-----------|-------|
| **Metric ID** | SYS_OFFLINE_QUEUE |
| **Name** | Offline Queue Count |
| **Business Definition** | Number of pending offline transactions |
| **Formula** | COUNT(offline_earn_queue) WHERE queue_status = 'PENDING' |
| **Source Tables** | offline_earn_queue |
| **Included Statuses** | PENDING |
| **Exclusions** | UPLOADED, REJECTED, FAILED |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | N/A (current status) |
| **Refresh Frequency** | Every 5 minutes |
| **Owner** | System Administrator |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Queue entry detail by store/device |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### Oldest Queued Transaction
| Attribute | Value |
|-----------|-------|
| **Metric ID** | SYS_OLDEST_QUEUE |
| **Name** | Oldest Queued Transaction |
| **Business Definition** | Age of oldest pending offline transaction |
| **Formula** | NOW() - MIN(created_at) FROM offline_earn_queue WHERE queue_status = 'PENDING' |
| **Source Tables** | offline_earn_queue |
| **Included Statuses** | PENDING |
| **Exclusions** | UPLOADED, REJECTED, FAILED |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | N/A (current status) |
| **Refresh Frequency** | Every 5 minutes |
| **Owner** | System Administrator |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Oldest queue entry detail |
| **Version History** | v1.0 - Initial definition |
| **Status** | ✅ Ready |

### Event-Processing Failures
| Attribute | Value |
|-----------|-------|
| **Metric ID** | SYS_EVENT_FAILURES |
| **Name** | Event-Processing Failures |
| **Business Definition** | Count of failed event processing attempts |
| **Formula** | COUNT(event_queue) WHERE status = 'FAILED' |
| **Source Tables** | event_queue (missing) |
| **Included Statuses** | FAILED |
| **Exclusions** | PROCESSED, PENDING |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use failed_at converted to Nepal business date |
| **Refresh Frequency** | Every 5 minutes |
| **Owner** | System Administrator |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Failed event detail |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing event queue table) |

### API Errors
| Attribute | Value |
|-----------|-------|
| **Metric ID** | SYS_API_ERRORS |
| **Name** | API Errors |
| **Business Definition** | Count of API errors in last hour |
| **Formula** | COUNT(api_error_log) WHERE error_timestamp > NOW() - 1 hour |
| **Source Tables** | api_error_log (missing) |
| **Included Statuses** | All |
| **Exclusions** | N/A |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | Use error_timestamp converted to Nepal business date |
| **Refresh Frequency** | Every 5 minutes |
| **Owner** | System Administrator |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Error detail by endpoint/type |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing error log table) |

### Monitoring Status
| Attribute | Value |
|-----------|-------|
| **Metric ID** | SYS_MONITORING_STATUS |
| **Name** | Monitoring Status |
| **Business Definition** | Overall system health status |
| **Formula** | Aggregated status from all monitoring checks |
| **Source Tables** | system_monitoring (missing) |
| **Included Statuses** | All |
| **Exclusions** | N/A |
| **Timezone** | UTC (storage), Asia/Kathmandu (display) |
| **Business Date Behavior** | N/A (current status) |
| **Refresh Frequency** | Every 5 minutes |
| **Owner** | System Administrator |
| **Data Quality Requirements** | N/A |
| **Drill-down Destination** | Monitoring check detail |
| **Version History** | v1.0 - Initial definition |
| **Status** | ❌ Blocked (missing monitoring table) |

---

## Summary

### Metric Readiness by Category

| Category | Ready | Partial | Blocked | Total |
|----------|-------|---------|---------|-------|
| Sales | 8 | 2 | 2 | 12 |
| Customer/Loyalty | 8 | 1 | 1 | 10 |
| Inventory | 0 | 1 | 7 | 8 |
| Operations/Finance | 1 | 0 | 5 | 6 |
| Website/Digital | 2 | 1 | 4 | 7 |
| System Health | 2 | 0 | 6 | 8 |
| **Total** | **21** | **5** | **25** | **51** |

### Critical Missing Tables for Implementation

1. **inventory_transactions** - For all inventory KPIs
2. **inventory_transfers** - For transfer activity
3. **batch_inventory** - For expiry risk
4. **inventory_quality_exceptions** - For data quality
5. **tenders** - For tender mix and cash/digital totals
6. **reconciliation_exceptions** - For reconciliation
7. **shifts** - For shift management
8. **payments** - For unmatched payments
9. **web_analytics** - For website engagement
10. **data_freshness_tracking** - For freshness monitoring
11. **store_sync_status** - For sync monitoring
12. **event_queue** - For event processing
13. **api_error_log** - For API error tracking
14. **system_monitoring** - For monitoring status

### Next Steps

1. **Create Phase 3 Schema** - Add missing tables for blocked KPIs
2. **Add Missing Fields** - Extend existing tables (cost, tax_rate, return_reason, etc.)
3. **Implement Business Date Function** - UTC to Nepal business date conversion
4. **Create Analytics Projections** - Materialized views for ready KPIs
5. **Implement Data Freshness Tracking** - Table to track projection updates
