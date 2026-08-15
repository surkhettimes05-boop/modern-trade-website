# Phase 3 Data Audit

## Overview
This document audits existing data sources to identify authoritative tables, lifecycle states, missing data, and KPI calculation readiness for Phase 3 management dashboards.

## Existing Data Sources

### Phase 1 Schema (Public Website & Content)
**Location:** `backend/src/database/schema.sql`

| Table | Purpose | Authoritative For | Lifecycle States | Notes |
|-------|---------|------------------|------------------|-------|
| `content_pages` | CMS content | Website content | DRAFT, REVIEW, PUBLISHED, SCHEDULED, UNPUBLISHED, EXPIRED | Bilingual (en/ne) |
| `stores` | Store locations | Store master data | DRAFT, PUBLISHED | Bilingual, hours, services, closure tracking |
| `categories` | Product categories | Category hierarchy | DRAFT, PUBLISHED | Bilingual, parent-child support |
| `products` | Product catalog | Product master data | DRAFT, PUBLISHED, SCHEDULED, EXPIRED | Bilingual, SKU, images, featured flag |
| `store_product_availability` | Store inventory status | Stock availability | AVAILABLE, LOW_STOCK, OUT_OF_STOCK | No exact quantities, status only |
| `offers` | Marketing campaigns | Campaign master data | DRAFT, PUBLISHED | Date ranges, terms, featured flag |
| `offer_products` | Campaign associations | Campaign-product mapping | N/A | Links offers to products/categories |
| `faqs` | FAQ content | FAQ master data | DRAFT, PUBLISHED | Bilingual, categorized |
| `services` | Service offerings | Service master data | DRAFT, PUBLISHED | Bilingual, icons |
| `contact_submissions` | Website contacts | Contact requests | NEW, IN_PROGRESS, RESOLVED, CLOSED | From website contact form |
| `content_audit_log` | Content audit trail | Content changes | N/A | Tracks all content operations |

### Phase 2 Schema (Customer & Loyalty)
**Location:** `database/phase2_schema.sql`

| Table | Purpose | Authoritative For | Lifecycle States | Notes |
|-------|---------|------------------|------------------|-------|
| `customers` | Customer profiles | Customer master data | ACTIVE, SUSPENDED, DELETED | Phone hashed/masked, merge support |
| `customer_merge_audit` | Merge history | Customer merge audit | N/A | Snapshots before/after merge |
| `customer_consent` | Consent records | Consent state | GRANTED, WITHDRAWN | GDPR compliance, channel-specific |
| `customer_data_requests` | Data requests | Privacy requests | PENDING, APPROVED, COMPLETED, REJECTED | Access/deletion/correction |
| `customer_otp` | OTP records | OTP audit | N/A | 5-min expiry, attempt tracking |
| `customer_sessions` | Session records | Session state | N/A | 24-hr expiry, revocation support |
| `loyalty_ledger` | Point transactions | Point balance (immutable) | POSTED, PENDING, FAILED | EARN, REDEEM, EXPIRE, ADJUST, REVERSAL |
| `loyalty_earn_lots` | Point expiry tracking | Point expiry | N/A | FIFO redemption, expiry dates |
| `loyalty_rules` | Loyalty rules | Rule configuration | DRAFT, PUBLISHED, RETIRED | Versioned, effective dates |
| `sales` | Sales transactions | Sales master data | DRAFT, PENDING, COMPLETED, VOIDED, RETURNED | Customer, points, payment tracking |
| `sale_items` | Sale line items | Sale details | N/A | Product, quantity, price, discount |
| `returns` | Return transactions | Return master data | REQUESTED, APPROVED, PROCESSED, REJECTED | Points reversal tracking |
| `return_items` | Return line items | Return details | N/A | Links to sale items |
| `offline_earn_queue` | Offline pending earns | Offline sync state | PENDING, UPLOADED, REJECTED, FAILED | Device tracking, retry logic |
| `customer_audit_log` | Customer audit trail | Customer changes | N/A | Tracks all customer operations |

## Domain Analysis

### Sales Domain
**Authoritative Tables:** `sales`, `sale_items`

**Lifecycle States:**
- DRAFT → PENDING → COMPLETED (happy path)
- COMPLETED → VOIDED (full reversal)
- COMPLETED → RETURNED (partial/full return)
- PENDING → VOIDED (cancellation before completion)

**Available Data:**
- ✅ Sale number, timestamp, status
- ✅ Customer ID (if enrolled)
- ✅ Store ID
- ✅ Total amount, currency
- ✅ Discount amount
- ✅ Payment method
- ✅ Points earned/redeemed
- ✅ Sale items (product, quantity, price, discount)
- ✅ Void/reverse tracking

**Missing Data for KPIs:**
- ❌ Tender breakdown (payment_method is single field, no tender table)
- ❌ Cost of goods sold (no cost field in products)
- ❌ Tax breakdown (no tax fields)
- ❌ Staff/ cashier tracking (no staff_id in sales)
- ❌ Shift tracking (no shift_id in sales)
- ❌ Business date (only UTC timestamps)
- ❌ Gross margin calculation (missing cost data)

**KPI Readiness:**
- ✅ Gross sales (total_amount)
- ✅ Net sales (total_amount - discount_amount)
- ✅ Completed transactions (status = COMPLETED)
- ✅ Average basket value (total_amount / count)
- ✅ Items per basket (sale_items.quantity)
- ✅ Discounts (discount_amount)
- ✅ Returns (returns table)
- ✅ Voids (status = VOIDED)
- ❌ Tender mix (missing tender breakdown)
- ❌ Margin (missing cost data)

### Returns Domain
**Authoritative Tables:** `returns`, `return_items`

**Lifecycle States:**
- REQUESTED → APPROVED → PROCESSED (happy path)
- REQUESTED → REJECTED (denied)

**Available Data:**
- ✅ Return number, timestamp, status
- ✅ Original sale ID
- ✅ Customer ID
- ✅ Store ID
- ✅ Total amount
- ✅ Points reversed
- ✅ Redemption reversed
- ✅ Return items (quantity, amount)

**Missing Data for KPIs:**
- ❌ Return reason (no reason field)
- ❌ Return type (defective, preference, etc.)

**KPI Readiness:**
- ✅ Return rate (returns / sales)
- ✅ Return amount totals
- ❌ Return reason analysis (missing reason field)

### Customer & Loyalty Domain
**Authoritative Tables:** `customers`, `loyalty_ledger`, `loyalty_earn_lots`

**Lifecycle States:**
- Customers: ACTIVE, SUSPENDED, DELETED
- Ledger: POSTED, PENDING, FAILED

**Available Data:**
- ✅ Customer ID, phone (hashed/masked)
- ✅ Enrollment date, source, location
- ✅ Verification status
- ✅ Home store
- ✅ Ledger entries (points, type, source, timestamp)
- ✅ Earn lots (original, remaining, expiry)
- ✅ Consent records
- ✅ Session activity

**Missing Data for KPIs:**
- ❌ Customer tier/segment (no tier field)
- ❌ Customer lifetime value (needs calculation)
- ❌ RFM segmentation (needs calculation)
- ❌ Loyalty liability (needs points-to-currency conversion rate)
- ❌ Tier movement (no tier system)

**KPI Readiness:**
- ✅ Identified sales rate (sales with customer_id / total sales)
- ✅ New members (customers enrolled in period)
- ✅ Active members (customers with activity in period)
- ✅ Repeat rate (customers with >1 sale in period)
- ✅ Earn rate (total EARN points / sales)
- ✅ Redemption rate (total REDEEM points / sales)
- ✅ Expiry (expired earn lots)
- ✅ Outstanding points (ledger balance)
- ❌ Estimated loyalty liability (missing conversion rate)
- ❌ Tier movement (no tier system)
- ✅ Missing-points cases (customer_data_requests)
- ✅ Adjustment activity (ledger ADJUST entries)

### Inventory Domain
**Authoritative Tables:** `store_product_availability`, `products`

**Lifecycle States:**
- Availability: AVAILABLE, LOW_STOCK, OUT_OF_STOCK

**Available Data:**
- ✅ Store ID, product ID
- ✅ Availability status
- ✅ Last updated timestamp
- ✅ Product master data (SKU, category, pack size)

**Missing Data for KPIs:**
- ❌ On-hand quantity (status only, no exact quantity)
- ❌ Available quantity (no quantity field)
- ❌ Low-stock threshold (hardcoded in status)
- ❌ Stockout events (no stockout table)
- ❌ Inventory adjustments (no adjustment table)
- ❌ Transfer activity (no transfer table)
- ❌ Batch/expiry data (no batch tracking)
- ❌ Cost data (no cost field)

**KPI Readiness:**
- ❌ On-hand quantity (missing quantity data)
- ❌ Available quantity (missing quantity data)
- ⚠️ Low-stock products (status only, no threshold config)
- ❌ Stockouts (no stockout tracking)
- ❌ Inventory adjustments (no adjustment table)
- ❌ Transfer activity (no transfer table)
- ❌ Expiry risk (no batch data)
- ❌ Data-quality exceptions (no quality checks)

### Operations & Finance Domain
**Authoritative Tables:** `sales`, `returns`, `offline_earn_queue`

**Available Data:**
- ✅ Sales, returns, voids
- ✅ Payment method (single field)
- ✅ Offline queue status

**Missing Data for KPIs:**
- ❌ Cash/digital tender totals (missing tender breakdown)
- ❌ Reconciliation exceptions (no reconciliation table)
- ❌ Unclosed shifts (no shift table)
- ❌ Unmatched payments (no payment table)
- ❌ Suspicious adjustment patterns (no adjustment table)

**KPI Readiness:**
- ✅ Return/void rate (from sales/returns)
- ❌ Cash and digital tender totals (missing tender breakdown)
- ❌ Reconciliation exceptions (no reconciliation table)
- ❌ Unclosed shifts (no shift table)
- ❌ Unmatched payments (no payment table)
- ❌ Suspicious adjustment patterns (no adjustment table)
- ⚠️ Offline queue count (queue_status = PENDING)
- ⚠️ Oldest queued transaction (created_at)

### Website & Digital Domain
**Authoritative Tables:** `contact_submissions`, `customer_sessions`, `customer_otp`

**Available Data:**
- ✅ Contact submissions (from website)
- ✅ Customer sessions (website login)
- ✅ OTP requests (website enrollment)

**Missing Data for KPIs:**
- ❌ Page views (no analytics table)
- ❌ Store-page engagement (no engagement tracking)
- ❌ Product discovery (no product view tracking)
- ❌ Offer engagement (no offer click tracking)
- ❌ Loyalty enrollment funnel (no funnel tracking)
- ❌ Account-login success/failure (no login analytics)

**KPI Readiness:**
- ❌ Store-page engagement (no tracking)
- ❌ Product discovery (no tracking)
- ❌ Offer engagement (no tracking)
- ⚠️ Loyalty enrollment funnel (OTP purpose = ENROLLMENT)
- ⚠️ Account-login success (session creation)
- ✅ Contact/support completion (contact_submissions status)

### System Health Domain
**Authoritative Tables:** `offline_earn_queue`, `customer_otp`

**Available Data:**
- ✅ Offline queue status
- ✅ OTP records

**Missing Data for KPIs:**
- ❌ Data freshness (no freshness tracking table)
- ❌ Location connectivity (no connectivity table)
- ❌ Last successful synchronization (no sync status table)
- ❌ Event-processing failures (no event queue table)
- ❌ API errors (no error logging table)
- ❌ Monitoring status (no monitoring table)

**KPI Readiness:**
- ❌ Data freshness (no tracking)
- ❌ Location connectivity (no tracking)
- ❌ Last successful synchronization (no tracking)
- ⚠️ Offline queue count (queue_status = PENDING)
- ⚠️ Oldest queued transaction (created_at)
- ❌ Event-processing failures (no event queue)
- ❌ API errors (no error logging)
- ❌ Monitoring status (no monitoring)

## Missing Data Summary

### Critical Missing Tables for Phase 3

1. **Tenders/Transactions** - Payment breakdown, cash/digital tracking
2. **Inventory Transactions** - Adjustments, transfers, stockouts
3. **Inventory Quantities** - On-hand, available, cost
4. **Batches** - Expiry tracking for inventory
5. **Shifts** - Shift management, cash reconciliation
6. **Reconciliation** - Payment reconciliation, exceptions
7. **Products Cost** - Cost of goods sold for margin
8. **Customer Tiers** - Loyalty tier system
9. **Website Analytics** - Page views, engagement tracking
10. **System Monitoring** - Connectivity, sync status, API errors
11. **Data Freshness** - Last update timestamps for all aggregates
12. **Event Queue** - Event processing, replay queue

### Missing Fields in Existing Tables

1. **sales** - staff_id, shift_id, business_date, tender_breakdown
2. **returns** - return_reason, return_type
3. **products** - cost, tax_rate
4. **store_product_availability** - on_hand_qty, available_qty, low_stock_threshold

## Data Volume & Performance Considerations

### Estimated Volumes (Based on Typical Retail)

| Entity | Daily Volume | Annual Volume | Growth Rate |
|--------|--------------|---------------|-------------|
| Sales | 1,000 - 10,000 | 365,000 - 3.65M | 10-20% |
| Sale Items | 5,000 - 50,000 | 1.8M - 18M | 10-20% |
| Customers | 50 - 200 | 18K - 73K | 5-10% |
| Ledger Entries | 2,000 - 20,000 | 730K - 7.3M | 10-20% |
| Sessions | 500 - 2,000 | 182K - 730K | 10-20% |

### Query Performance Considerations

1. **Balance Calculation** - Requires summing ledger entries (indexed by customer_id)
2. **Sales Aggregates** - Requires grouping by store/date (indexed by store_id, sale_timestamp)
3. **Inventory Status** - Status only, no quantity calculations needed
4. **Customer Analytics** - Requires joins across customers, sales, ledger
5. **Timezone Conversion** - UTC storage, Asia/Kathmandu for display (needs business date logic)

## Recommendations

### Immediate Actions for Phase 3

1. **Create Phase 3 Schema** - Add missing tables for:
   - Tenders/transactions
   - Inventory transactions
   - Shifts
   - Reconciliation
   - System monitoring
   - Data freshness tracking
   - Website analytics

2. **Add Missing Fields** - Extend existing tables:
   - sales: staff_id, shift_id, business_date
   - returns: return_reason
   - products: cost, tax_rate

3. **Implement Business Date Logic** - Add function to convert UTC to Nepal business date

4. **Create Analytics Projections** - Materialized views for:
   - Daily sales by store
   - Daily customer metrics
   - Daily inventory status
   - Daily loyalty metrics

5. **Implement Data Freshness Tracking** - Table to track last update of each projection

### Deferred to Future Phases

1. **Customer Tier System** - Requires business rule definition
2. **Batch/Expiry Tracking** - Requires inventory system enhancement
3. **Advanced Website Analytics** - Requires analytics integration
4. **RFM Segmentation** - Requires customer analytics maturity

## Conclusion

**Current State:** Phase 1 and Phase 2 provide solid foundation for customer, loyalty, and basic sales analytics. However, critical gaps exist for inventory, finance, operations, and system health KPIs.

**Readiness Assessment:**
- **Customer/Loyalty KPIs:** 70% ready (missing tier system, liability calculation)
- **Sales KPIs:** 60% ready (missing tender breakdown, margin data)
- **Inventory KPIs:** 20% ready (missing quantities, transactions)
- **Operations/Finance KPIs:** 30% ready (missing reconciliation, shifts)
- **Website/Digital KPIs:** 10% ready (missing analytics tracking)
- **System Health KPIs:** 20% ready (missing monitoring, freshness)

**Next Steps:** Proceed with creating Phase 3 schema to fill critical gaps before implementing dashboards.
