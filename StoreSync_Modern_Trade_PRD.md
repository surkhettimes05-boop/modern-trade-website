# StoreSync Modern Trade Platform

## Product Requirements Document

**Scope:** Loyalty, customer website and future e-commerce, store networking, and management dashboards  
**Version:** 1.0  
**Status:** Implementation baseline  
**Prepared:** 9 August 2026  
**Primary market:** Nepal  

---

## Document purpose

This PRD defines how StoreSync will evolve from its current retail operations foundation into a connected modern-trade platform. It covers four coordinated capabilities: customer loyalty, a public website with a safe path to e-commerce, resilient store and warehouse networking, and role-based management dashboards.

The document is written as an implementation baseline. It specifies product intent, business rules, system boundaries, data guidance, integrations, security controls, measurable acceptance criteria, rollout stages, and operating requirements. Detailed user-interface designs, final commercial policies, and vendor contracts remain follow-on decisions.

## 1. Executive summary

StoreSync already provides the beginnings of a shared operational core: authentication, roles, products, categories, SKU/barcode management, per-location inventory, stock adjustments, an append-only inventory ledger, CSV catalog import, audit logging, and a basic inventory interface. The next customer and management capabilities must reuse that source of truth.

The product vision is one connected retail system in which a customer can identify themselves by phone number, earn and redeem benefits consistently, see trustworthy store and product information online, and eventually place an order against sellable inventory. Owners and managers should see the same activity through actionable dashboards. Stores must continue essential operations when internet connectivity is degraded.

The recommended sequence is:

1. Establish shared customer, consent, loyalty-ledger, event, and analytics foundations.
2. Launch an informational website, loyalty enrollment and account experience, and a management dashboard minimum viable product (MVP).
3. Pilot the system at one store with network monitoring, support procedures, and reconciled reporting.
4. Extend to campaign tools, advanced analytics, and e-commerce readiness.
5. Launch e-commerce only after purchasing, transfers, POS, offline billing, inventory reservations, and payment reconciliation are reliable.

## 2. Product vision and principles

### 2.1 Vision

StoreSync will be the trusted digital operating system for a multi-location Nepali mini-mart business: one product catalog, one inventory truth, one customer identity, one loyalty ledger, and one management view across stores, warehouse, web, and future digital channels.

### 2.2 Product principles

- **One operational core:** product, price, stock, customer, sale, payment, promotion, and audit data have defined systems of record.
- **Ledger-first correctness:** inventory, loyalty points, payment adjustments, and other balances are explainable through immutable transactions and reversals.
- **Offline-aware by design:** critical store workflows fail gracefully and reconcile deterministically.
- **Simple for the customer:** phone-first enrollment works without requiring a mobile app or email address.
- **Actionable management:** dashboards highlight exceptions and recommended actions, not only charts.
- **Privacy by default:** collect the minimum necessary personal data, capture consent purposefully, and enforce retention and access controls.
- **Nepal-ready:** support NPR, local phone conventions, Nepali/English content, local payments, variable connectivity, and local calendar/reporting needs.
- **Progressive delivery:** ship useful foundations early while avoiding premature e-commerce complexity.

## 3. Objectives, success measures, and non-goals

### 3.1 Objectives

| ID | Objective | Initial measure |
|---|---|---|
| O1 | Create a reliable shared customer identity | At least 95% of member lookups complete in under 2 seconds on a healthy connection; duplicate rate below 2% after cleanup |
| O2 | Increase identifiable repeat shopping | Member-linked sales rate and 30/60/90-day repeat rate trend upward after pilot baseline |
| O3 | Make loyalty financially controlled and explainable | 100% of balance changes trace to ledger entries; daily reconciliation variance equals zero |
| O4 | Give managers timely operational visibility | Core dashboard data no more than 15 minutes stale online; daily KPI reconciliation within agreed tolerance |
| O5 | Build a trustworthy public presence | Store information, policies, catalog highlights, and loyalty content are mobile-friendly and centrally maintained |
| O6 | Prepare safely for e-commerce | Shared APIs, inventory availability, pricing, customer, promotion, order, payment, and fulfillment boundaries are defined before checkout launch |
| O7 | Maintain operations through connectivity issues | Store network has monitored primary connectivity, backup path, protected power, and documented offline/recovery procedures |

### 3.2 Non-goals for the initial release

- A native iOS or Android customer application.
- A public marketplace or third-party seller platform.
- Full e-commerce checkout before POS, purchasing, transfers, and inventory reservation controls are production-ready.
- Advanced AI demand forecasting or automated purchasing decisions.
- Deep CCTV video management inside StoreSync; CCTV remains a separately secured infrastructure system with limited health links if needed.
- Replacement of accounting software; StoreSync will export controlled summaries and reconciliation data.
- Unrestricted points transfer between customers or cash conversion of points.
- Complex coalition loyalty across unrelated merchants in the first release.

## 4. Scope and system boundaries

### 4.1 In scope

- Customer profiles, phone verification, consent, household-safe duplicate handling, status, notes, and audit history.
- Loyalty accounts, configurable earning/redemption rules, tiers, points expiry, promotions, reversals, adjustments, fraud controls, and statements.
- Public responsive website, store locator, hours, services, catalog discovery, offers, loyalty enrollment/login, account summary, privacy and support pages.
- Future e-commerce architecture covering catalog publication, sellable inventory, cart, reservation, order, fulfillment, payment, returns, and customer communications.
- Owner, manager, warehouse, marketing/analyst, cashier, support, and customer dashboard experiences as appropriate.
- Network design standards for stores, warehouse, and central services; monitoring, segmentation, power protection, failover, and incident procedures.
- Events, APIs, analytics definitions, observability, backups, QA, deployment, and pilot operations.

### 4.2 Existing StoreSync remains authoritative for

- Staff authentication, roles, sessions, location restrictions, audit logging.
- Product, category, SKU, barcode, and location configuration.
- Inventory ledger and stock corrections.
- Future purchasing, receiving, batches/expiry, transfers, POS sales, returns, and payments.

### 4.3 External systems

- eSewa and Khalti payment services, introduced when payment workflows are ready.
- SMS provider for one-time passwords (OTP), enrollment confirmation, receipts, and service messages.
- Email provider for optional customer and management communication.
- Accounting/export destination where required.
- Network equipment, internet service providers, UPS devices, CCTV/NVR, and optional device-monitoring platform.

## 5. Personas, roles, and permissions

| Persona | Primary needs | Key permissions |
|---|---|---|
| Owner | Cross-business performance, policy, risk, profitability | All locations; loyalty policy approval; staff oversight; exports; audit review |
| Store manager | Daily sales, stock exceptions, staff and customer issues | Own location; approved customer correction; local campaigns; incident acknowledgement |
| Cashier | Fast lookup/enrollment, earn/redeem, transparent receipt | POS-linked customer lookup; limited enrollment; no arbitrary balance edits |
| Warehouse manager | Availability, transfers, expiry, fulfillment readiness | Warehouse and transfer views; no access to unnecessary customer details |
| Marketing/CRM operator | Segments, campaigns, retention, offer performance | Pseudonymous analysis by default; campaign and consent-scoped contact access |
| Finance/auditor | Tender, discounts, loyalty liability, reconciliation | Read/export reconciled financial and audit data; no campaign messaging |
| Support operator | Resolve account access, missing points, order questions | Masked profile access; ticket-linked corrections through approval workflow |
| Customer/member | Join, verify, view points and activity, manage consent | Own profile and transactions only |
| Guest visitor | Learn about stores, products, offers, and policies | Public content only |

Permissions must combine role, location, purpose, and action. Sensitive exports, manual points adjustments, rule publication, customer merges, and privacy requests require explicit permissions and complete audit records.

## 6. Core user journeys

### 6.1 Enroll at checkout

1. Cashier asks whether the customer wants to join and explains the essential benefit and consent.
2. Customer supplies a Nepali mobile number; the system normalizes it to a canonical format.
3. StoreSync checks for an existing profile without exposing unnecessary personal information.
4. For a new profile, the cashier records minimum fields and the selected communication consent; OTP verification may occur immediately or through a secure customer link.
5. The sale is attached to the customer, eligible points are posted after sale completion, and the receipt shows points earned and new available balance.
6. If offline, enrollment and earn activity are queued with clear pending status and idempotency keys, then reconciled when connectivity returns.

### 6.2 Identify and redeem at POS

1. Cashier searches by normalized phone number or scans a member identifier.
2. StoreSync returns a minimal identity confirmation and available/redeemable balance.
3. The customer requests redemption; step-up verification is required above configurable thresholds.
4. The POS obtains or records a redemption authorization, applies the benefit, and completes the sale atomically where online.
5. A `REDEEM` ledger entry references the sale and rule version. The receipt displays redeemed points and remaining balance.
6. Void or return operations create compensating entries; they never delete the original transaction.

### 6.3 Customer self-service

1. Customer enters a phone number on the website and receives an OTP.
2. After verification, the customer sees points balance, pending points, tier progress, expiry forecast, recent activity, available offers, and communication preferences.
3. The customer can correct permitted profile fields, opt in or out by channel, request data access/deletion review, and report a missing transaction.
4. Sensitive changes trigger re-verification and audit events.

### 6.4 Manager opens the daily dashboard

1. Manager selects an allowed location and business date.
2. The dashboard shows sales, transaction count, average basket, gross margin estimate where cost is available, discounts, returns, tender mix, low stock, inventory movements, member identification, redemptions, and system/network health.
3. Exceptions are ranked by urgency and link to source records.
4. Manager acknowledges or assigns an issue; the action is audited.

### 6.5 Future click-and-collect order

1. Customer chooses a pickup store and browses the store-specific sellable catalog.
2. Prices, promotions, and availability are calculated server-side.
3. Checkout verifies identity/contact, reserves stock, accepts a supported payment method or permitted pay-at-pickup option, and creates an order.
4. Store staff accept, pick, substitute only with customer permission, stage, and mark ready.
5. Pickup requires a code or verified identity. Final sale, inventory consumption, payment capture, loyalty earn, receipt, and order status reconcile through controlled events.

## 7. Functional requirements

### 7.1 Customer identity and consent

- **CUS-001:** Store a canonical unique phone identifier plus the user-entered display value; normalize `98XXXXXXXX`, `+97798XXXXXXXX`, spacing, and common punctuation.
- **CUS-002:** Support verified and unverified phone states. High-risk actions require a verified phone.
- **CUS-003:** Permit minimal enrollment with phone, preferred name, home store (optional), language preference, and consent choices.
- **CUS-004:** Email, birth date, gender, and address are optional and purpose-limited.
- **CUS-005:** Detect likely duplicates and provide a permissioned merge workflow that preserves references and audit history.
- **CUS-006:** Track status (`ACTIVE`, `SUSPENDED`, `CLOSED`, `ANONYMIZED`) and reason.
- **CUS-007:** Record consent by purpose, channel, policy version, capture source, timestamp, and withdrawal timestamp.
- **CUS-008:** Separate transactional/service messages from marketing consent.
- **CUS-009:** Support access, correction, export, suppression, and deletion/anonymization request workflows subject to legal and financial retention obligations.
- **CUS-010:** Mask phone/email in general views and logs.

### 7.2 Loyalty accounts and ledger

- **LOY-001:** Each eligible customer has one loyalty account with status, tier, available balance, pending balance, lifetime earned, and version.
- **LOY-002:** The immutable ledger is the source of truth. Cached balances must be reproducible from ledger entries.
- **LOY-003:** Supported transaction types: `EARN`, `REDEEM`, `EXPIRE`, `ADJUST`, `REVERSAL`, `TRANSFER_IN`, and `TRANSFER_OUT`; transfer types remain disabled initially.
- **LOY-004:** Every ledger row includes customer/account, signed points, effective and created timestamps, status, source type/id, location, rule and rule-version references, idempotency key, actor, reason code, and reversal reference where applicable.
- **LOY-005:** Posted ledger entries cannot be edited or deleted. Corrections use a new reversing or adjusting entry.
- **LOY-006:** Earn posting occurs only for completed eligible sales and is reversed proportionally for returns/voids according to policy.
- **LOY-007:** Redemptions cannot take an account below zero unless an explicitly approved exception policy exists.
- **LOY-008:** Points may be pending during return windows or offline reconciliation. Pending points cannot be redeemed.
- **LOY-009:** Expiry runs must be deterministic, previewable, approved, retry-safe, and customer-notified where consent/policy permits.
- **LOY-010:** Manual adjustments require a reason, evidence/reference, permission, and dual approval above a threshold.
- **LOY-011:** Account suspension blocks earn/redeem as configured while preserving history.
- **LOY-012:** Receipts and account statements show earned, redeemed, pending, expiring, and available values clearly.

### 7.3 Loyalty rules and promotions

Rules are configuration, not POS code. Each rule is versioned, has an effective window, priority, eligibility, funding/owner, calculation, caps, exclusions, and stacking behavior.

Initial rule model:

- Base earn example: 1 point per NPR 100 of eligible net spend, with configurable rounding.
- Minimum qualifying spend, eligible stores/channels, product/category/brand inclusion or exclusion, and tender restrictions.
- Bonus points by date, day/time, location, category, SKU, customer segment, tier, first purchase, or visit frequency.
- Redemption conversion (for example, points per NPR benefit), minimum increment, minimum remaining spend, per-sale and per-day caps.
- Tier qualification by rolling eligible spend, visits, or lifetime points; tier benefits and downgrade grace period.
- Points expiry by earning-lot age, fixed date, or inactivity. The chosen policy must be disclosed before launch.
- Promotion stacking matrix: base earn, bonus earn, member price, coupon, and redemption interactions.

Controls:

- A simulator must test representative baskets before publication.
- Rule versions are immutable after activation; changes create a new version.
- Conflicts are resolved with explicit priority and exclusivity, never incidental code order.
- The engine returns a human-readable explanation and a machine-readable calculation trace.
- Finance reports outstanding points and estimated liability under the approved valuation method.

### 7.4 Website MVP

- **WEB-001:** Responsive, accessible, fast pages for home, about, store locations/hours, contact/support, services, offers, loyalty, privacy, terms, and FAQs.
- **WEB-002:** Store pages are managed centrally and show map link, contact, hours, temporary closures, facilities, and service availability.
- **WEB-003:** Product discovery may show curated or published catalog items; availability claims must be location-specific and timestamped.
- **WEB-004:** Product content supports English and Nepali fields, images, pack size, unit, allergens/warnings where relevant, and publication status.
- **WEB-005:** Loyalty enrollment/login uses phone OTP with abuse controls.
- **WEB-006:** Customer account shows loyalty activity and consent controls but never internal notes or risk flags.
- **WEB-007:** Content management supports draft, review, publish, schedule, expiry, and rollback.
- **WEB-008:** SEO basics include descriptive metadata, sitemap, canonical URLs, structured store data, clean redirects, and analytics consent behavior.
- **WEB-009:** No public index exposes staff, customer, supplier, cost, or internal stock data.
- **WEB-010:** Contact forms are spam-protected, rate-limited, routed to an accountable queue, and retained according to policy.

### 7.5 Management dashboards

- **DAS-001:** Role- and location-scoped landing views for owner, store manager, warehouse manager, marketing/CRM, and finance.
- **DAS-002:** Every KPI has a visible definition, timezone/business-date basis, freshness timestamp, and drill-down.
- **DAS-003:** Filters include date/business period, location, channel, category, product, customer segment, tier, tender, and promotion where relevant.
- **DAS-004:** Current-period comparisons support previous period and same weekday; later phases may add year-over-year.
- **DAS-005:** Exports respect the same permissions and filters and are audit logged.
- **DAS-006:** Threshold alerts support owner, severity, acknowledgement, resolution note, and escalation.
- **DAS-007:** Financial KPIs reconcile to source sales, returns, tender, and discount data; dashboards never silently mix provisional and finalized figures.
- **DAS-008:** Data-quality widgets show missing costs, unmapped categories, duplicate customers, delayed events, unreconciled shifts, and stale locations.
- **DAS-009:** Network/system health shows store connectivity, last sync, queue depth, API error rate, device status where integrated, and backup/failover state.
- **DAS-010:** Personally identifying leaderboards or cashier comparisons are restricted and designed to prevent inappropriate surveillance.

### 7.6 Networking and infrastructure

- **NET-001:** Each location has a documented network diagram, device inventory, ISP details, configuration backup, cable/port labels, and support owner.
- **NET-002:** Business-critical devices use wired Ethernet where practical; managed Wi-Fi is used for mobility.
- **NET-003:** Networks are segmented at minimum into POS/business, staff, guest, CCTV/IoT, and network-management zones using VLANs and firewall rules.
- **NET-004:** Guest users cannot reach POS, StoreSync devices, printers, NVRs, or management interfaces.
- **NET-005:** CCTV/IoT devices cannot initiate access to customer or POS networks; remote viewing uses secure vendor-independent controls or VPN, not exposed ports.
- **NET-006:** Router, switch, access point, POS, local edge device, and NVR receive UPS protection sized for an agreed outage window.
- **NET-007:** Primary business internet has a tested backup path (second ISP or cellular) at pilot and production stores.
- **NET-008:** DNS, DHCP, NTP, IP plans, Wi-Fi security, firmware lifecycle, admin credentials, and configuration backups follow central standards.
- **NET-009:** Monitoring records uptime, latency, packet loss, failover, device health, WAN address changes, and last contact without capturing customer browsing content.
- **NET-010:** StoreSync displays a simple online/degraded/offline state and the last successful synchronization time.
- **NET-011:** Remote administration requires named accounts, MFA where supported, encrypted access, least privilege, and audit logs.
- **NET-012:** A quarterly recovery test validates replacement router configuration, backup connectivity, UPS runtime, and escalation contacts.

### 7.7 Notifications and support

- Customers receive only policy-required or consent-permitted messages.
- Templates are versioned, bilingual where required, and tested for GSM/Unicode SMS length and cost.
- Delivery status, provider message ID, purpose, and failure reason are retained without placing secrets or full message bodies in general logs.
- Support cases link to customer, sale/order, loyalty transaction, and evidence with access controls.
- Campaign suppression applies immediately after consent withdrawal.

## 8. Dashboard KPI catalogue

| Domain | KPI | Definition / decision use |
|---|---|---|
| Sales | Net sales | Gross item sales less discounts and returns, excluding tax treatment as defined by finance |
| Sales | Transactions | Count of completed non-void sales |
| Sales | Average basket value | Net sales divided by completed transactions |
| Sales | Items per basket | Net quantity sold divided by transactions |
| Margin | Gross margin estimate | Net sales less recognized item cost; labeled provisional when cost is incomplete |
| Customer | Identified sales rate | Completed sales linked to a valid customer divided by eligible completed sales |
| Customer | Active members | Members with qualifying activity in selected period |
| Customer | Repeat rate | Customers purchasing again within the defined 30/60/90-day window |
| Loyalty | Earn rate | Points earned per eligible NPR and per member transaction |
| Loyalty | Redemption rate | Redeemed points divided by available/issued points under the approved definition |
| Loyalty | Outstanding liability | Unexpired redeemable points multiplied by approved expected-cost or face-value method |
| Loyalty | Breakage/expiry | Points expired in period and rate against eligible issued points |
| Promotion | Incremental performance | Campaign cohort outcome versus control or comparable baseline, labeled as estimated |
| Inventory | On-hand / available | Ledger-derived stock; available subtracts reservations and non-sellable quantities |
| Inventory | Low-stock SKU count | SKUs below location reorder threshold |
| Inventory | Stockout rate | Time or item-location observations unavailable for sale |
| Inventory | Shrink/adjustment | Net adjustment quantity/value by reason and approver |
| Inventory | Expiry risk | Batch quantity/value approaching expiry once batch tracking exists |
| Operations | Return/void rate | Returned or voided value/transactions relative to completed sales |
| Payments | Tender mix | Net settled sales by cash, card, eSewa, Khalti, and other tender |
| Payments | Reconciliation exceptions | Unmatched, duplicated, failed, or amount-mismatched tender records |
| Digital | Product/detail conversion | Views to cart/order progression once e-commerce launches |
| Digital | Fulfillment SLA | Accepted-to-ready and ready-to-collected time by store |
| System | Data freshness | Current time minus latest complete processed event per source/location |
| System | Offline queue age | Oldest unprocessed local action and total queued count |
| Network | Store availability | Monitored reachable minutes divided by scheduled minutes, with planned outages separated |

KPI definitions must live in a governed metrics catalog with owner, formula, exclusions, source fields, refresh frequency, and change history.

## 9. Data model guidance

### 9.1 Customer and consent entities

- `customers`: id, canonical phone hash/lookup key, encrypted phone value, display name, optional email, date of birth, language, home location, status, verified timestamps, joined source/location, timestamps.
- `customer_identities`: customer, identity type, normalized value/hash, verified state, primary flag, timestamps.
- `customer_consents`: customer, purpose, channel, state, policy version, capture source, evidence, granted/withdrawn timestamps.
- `customer_addresses`: optional labeled addresses with structured locality fields; encrypted and access-limited.
- `customer_merge_records`: survivor, merged identity, actor, reason, timestamp, source mapping.

### 9.2 Loyalty entities

- `loyalty_accounts`: customer, status, tier, cached available/pending/lifetime values, row version.
- `loyalty_ledger_entries`: signed points, type, state, source, rule version, earn lot, expiry, effective timestamp, idempotency key, actor, reversal reference, metadata.
- `loyalty_earn_lots`: original earned amount, remaining amount, earned/available/expiry dates, source sale.
- `loyalty_rules` and `loyalty_rule_versions`: effective dates, priority, JSON/structured conditions and actions, approval and publication state.
- `loyalty_tiers` and `customer_tier_history`: qualification period, thresholds, effective dates, benefit set.
- `loyalty_adjustment_requests`: requested change, reason, evidence, requester, approver, outcome.

### 9.3 Web and commerce entities

- `content_pages`, `content_versions`, `media_assets`, `store_public_profiles`, and `catalog_publications`.
- Future: `carts`, `cart_items`, `inventory_reservations`, `orders`, `order_items`, `order_status_history`, `fulfillment_tasks`, `payment_intents`, `payment_transactions`, `refunds`, `shipments/pickups`, and `customer_notifications`.

### 9.4 Analytics and operations entities

- `domain_events` or outbox rows, immutable and partitionable.
- `metric_definitions`, `daily_location_metrics`, and purpose-built aggregates; derived tables are rebuildable.
- `alerts`, `alert_events`, `acknowledgements`, and `resolution_notes`.
- `locations_network_assets`, `network_health_samples`, `connectivity_incidents`, and `configuration_backup_records`; secrets are stored separately.

### 9.5 Data rules

- Use UUID/ULID-style globally unique identifiers suitable for offline creation.
- Store money in exact decimal or minor units with explicit currency (`NPR` initially).
- Store timestamps in UTC; apply Nepal Time (`Asia/Kathmandu`, UTC+05:45) for display and business-date rules.
- Use optimistic versioning and idempotency for write APIs.
- Enforce foreign keys and uniqueness at the database layer where practical.
- Separate operational data from analytics projections; projections can lag but must expose freshness.
- Avoid putting sensitive data in generic JSON fields, event payloads, URLs, or logs.

## 10. APIs and domain events

### 10.1 API standards

- Versioned HTTPS JSON APIs; authenticated staff endpoints use existing StoreSync session/CSRF controls or an approved service-token flow.
- Customer APIs use short-lived verified sessions, secure cookies, CSRF protection, rate limits, and device/session visibility.
- Every mutating request accepts an idempotency key and returns a stable resource/operation result.
- Authorization is server-side and resource-scoped; clients never decide location access.
- Validation errors are field-specific; internal errors use correlation IDs without exposing stack traces.
- Pagination, filtering, sorting, and date semantics are consistent.
- OpenAPI documentation and contract tests are required for published endpoints.

### 10.2 Initial API groups

- `/customers`: enroll, verify, lookup, update permitted fields, consent, merge request.
- `/loyalty/accounts/{customerId}`: summary and statement.
- `/loyalty/quote`: explain expected earn/redemption for a basket without posting.
- `/loyalty/transactions`: post earn/redeem/reversal through trusted sale workflows.
- `/loyalty/rules`: draft, simulate, approve, publish, retire.
- `/public/stores`, `/public/catalog`, `/public/offers`, `/public/content`.
- `/analytics/kpis`, `/analytics/exceptions`, `/alerts`.
- Future `/carts`, `/availability`, `/orders`, `/payments`, and `/fulfillment`.

### 10.3 Required events

Events use a durable transactional outbox so database state and publication cannot diverge. Each envelope includes event id, event type/version, aggregate type/id, occurred timestamp, producer, location, correlation/causation id, and privacy-classified payload.

- `CustomerEnrolled`, `CustomerVerified`, `CustomerUpdated`, `ConsentChanged`, `CustomerMerged`.
- `SaleCompleted`, `SaleVoided`, `ReturnCompleted` from future POS.
- `LoyaltyEarned`, `LoyaltyRedeemed`, `LoyaltyExpired`, `LoyaltyAdjusted`, `LoyaltyReversed`, `TierChanged`.
- `InventoryChanged`, `InventoryReserved`, `ReservationReleased`, `StockoutDetected`.
- `PriceChanged`, `PromotionPublished`, `CatalogPublicationChanged`.
- Future `OrderPlaced`, `OrderAccepted`, `OrderReady`, `OrderCompleted`, `OrderCancelled`, `PaymentAuthorized`, `PaymentCaptured`, `PaymentFailed`, `RefundCompleted`.
- `LocationOffline`, `LocationRecovered`, `SyncBacklogThresholdExceeded`, `DataFreshnessBreached`.

Consumers must be idempotent, tolerate duplicates and out-of-order delivery where documented, and dead-letter failures with replay tooling.

## 11. Integration with existing StoreSync

| Existing capability | New use | Required change |
|---|---|---|
| Authentication and roles | Dashboard and administration access | Add granular permissions for loyalty, CRM, exports, and network views |
| Location restrictions | Scope manager data and actions | Apply consistently to analytics, customer lookup, and exports |
| Products/categories/SKUs | Web catalog, loyalty conditions, KPI dimensions | Add publication fields, images, bilingual content, tax/eligibility flags |
| Per-location inventory | Public availability and future order promise | Add sellable/available calculation and later reservations |
| Inventory ledger | Availability, audit, order fulfillment | Preserve append-only model; introduce reservation projection separately |
| Audit log | Rule changes, customer access, exports, corrections | Add structured action types and sensitive-data access events |
| Idempotency foundations | Offline sync, ledger posting, payments | Standardize keys, retention, replay response, and conflict handling |
| CSV import | Catalog enrichment and customer migration | Validate privacy, deduplication, dry run, error report, and rollback strategy |

Purchasing, suppliers, batch/expiry, transfers, POS, offline billing, payments, and returns are upstream dependencies for trustworthy e-commerce and complete dashboard reporting. The loyalty module may be built earlier, but production earn/redeem must integrate with a certified sale lifecycle.

## 12. Offline and network resilience

### 12.1 Operating modes

- **Online:** real-time authorization, ledger posting, dashboards, and sync.
- **Degraded:** high latency or partial dependency failure; read caches and queued non-critical actions are permitted.
- **Offline:** local POS continues approved essential sale functions. Customer lookup uses a minimal encrypted cache; new loyalty actions are visibly pending.

### 12.2 Offline loyalty policy

- Offline earning is permitted for completed local sales and posts later using the sale id plus deterministic idempotency key.
- Offline redemption is disabled in the safest initial policy. A later controlled allowance may use a short-lived signed balance token, low daily cap, verified identity, and risk checks.
- The interface must never present pending earn as redeemable.
- Conflicts are resolved server-side; balances are recalculated from accepted ledger entries.
- Failed items enter a visible exception queue with reason and operator workflow; they are not silently dropped.

### 12.3 Synchronization

- Local changes use globally unique IDs, monotonically ordered local sequence numbers, device identity, and original occurrence timestamps.
- Uploads are encrypted, batched, retryable with exponential backoff, and safe to replay.
- Server acknowledgements are durable before local queue removal.
- Reference-data downloads are versioned and signed/checksummed.
- Clock drift is monitored; financial sequence and server receipt timestamps remain authoritative where required.
- Recovery dashboards show queue depth, oldest age, rejected records, last successful sync, and software/config version.

### 12.4 Recovery targets

Proposed targets to confirm during architecture review:

- Central transactional service: RPO no more than 15 minutes; RTO no more than 4 hours.
- Store local sale continuity: essential offline capability during WAN outage for at least one trading day, constrained by device power/storage.
- Customer website: RTO 4 hours for dynamic account services; public static content may be served from cache.
- Analytics: RPO 1 hour; RTO 8 hours, while source transactions remain unaffected.

## 13. Future e-commerce architecture

### 13.1 Recommended architecture

Use a modular monolith around the existing Fastify/PostgreSQL stack until scale or team boundaries justify separate services. Maintain explicit domains and APIs: catalog, pricing/promotions, customer/loyalty, inventory availability, cart, order, payment, fulfillment, and notification. Publish domain events through an outbox and build read-optimized projections for website and dashboards.

The website should consume public/read APIs through a web backend or backend-for-frontend rather than connect directly to the operational database. Static and media content should use a CDN. Sensitive account and checkout actions always return to controlled StoreSync services.

### 13.2 Commerce invariants

- Price displayed, price charged, promotion applied, tax, fulfillment location, and rule versions are recorded on the order line.
- Inventory shown publicly is an availability projection with safety stock, not raw on-hand quantity.
- Checkout creates expiring reservations atomically; cancellation, timeout, payment failure, and fulfillment release them.
- Order state changes are append-only and validated against allowed transitions.
- Payment intent, provider callback, capture, refund, and StoreSync tender records reconcile independently and idempotently.
- Loyalty earn normally posts after completion/collection, not merely order placement.
- Returns reverse sale, inventory, payment, and loyalty effects according to original line allocations.

### 13.3 Suggested order states

`DRAFT -> PENDING_PAYMENT -> PLACED -> ACCEPTED -> PICKING -> READY -> COMPLETED`

Terminal/exception states include `CANCELLED`, `REJECTED`, `PAYMENT_FAILED`, `EXPIRED`, and `REFUNDED`. Every transition records actor, timestamp, reason, and source.

### 13.4 Initial fulfillment model

Start with click-and-collect at one pilot store. Add delivery only after address quality, service zones, fees, capacity, substitutions, proof of delivery, failed delivery, cash handling, and reverse logistics are defined.

## 14. Nepal-specific considerations

- Currency is NPR with exact arithmetic and consistent rounding. Display `रु` or `Rs/NPR` according to tested customer comprehension; store `NPR` internally.
- Use Nepal Time (`Asia/Kathmandu`, UTC+05:45). Business-day close may differ from midnight and must be configurable per location.
- Support Gregorian dates internally and optionally display Bikram Sambat where users need it; never mix calendars without labels.
- Normalize Nepali mobile numbers and design OTP flows for shared devices, SIM changes, SMS delay, and retry abuse.
- Support Nepali (Unicode Devanagari) and English content. Test fonts, search, sorting, SMS length, receipts, and exports.
- Integrate eSewa and Khalti only through documented merchant flows, server-side verification, signature validation, idempotent callbacks, and daily reconciliation. Never trust the browser redirect alone as payment proof.
- Cash remains a primary tender and must reconcile by shift/store.
- VAT invoices, PAN/VAT fields, fiscal records, retention, and tax calculations require validation by a qualified Nepal tax/accounting adviser before production.
- Privacy notices, consent, retention, cross-border hosting, and direct marketing practices require review against applicable Nepal law and business policy before launch.
- Maps and addresses should tolerate landmarks, wards, municipalities, and less standardized street addressing.
- Plan for load shedding/power instability through UPS sizing, surge protection, graceful shutdown, and tested restart procedures.
- Device selection and UI density should suit lower-cost Android phones and variable-bandwidth networks.

## 15. Security and privacy

### 15.1 Security requirements

- MFA for owner, privileged administrators, remote network administration, and sensitive approval roles.
- Least-privilege role/location authorization and deny-by-default service access.
- Secure, signed, HttpOnly, SameSite cookies; CSRF protection; short session lifetimes for sensitive customer flows.
- Strong password storage, login/OTP throttling, enumeration-resistant responses, bot detection, and lockout safeguards.
- TLS in transit; database, backup, and device-cache encryption at rest. Keys and secrets live in a managed secrets facility, not source code or device images.
- Dependency, container, and OS patching with severity-based service levels; software composition and secret scanning in CI.
- Input validation, output encoding, parameterized queries, restrictive content security policy, secure file upload, and malware scanning.
- Provider webhooks require signature verification, replay protection, timestamp tolerance, idempotency, and source validation where supported.
- Administrative and customer-sensitive actions generate tamper-evident audit records.
- Production data is not copied into development; test data is synthetic or irreversibly anonymized.

### 15.2 Privacy requirements

- Maintain a data inventory identifying purpose, legal/business basis, owner, sensitivity, access, retention, and deletion method.
- Default reports and analytics to aggregation or pseudonymization. Reveal contact details only for a permitted operational purpose.
- Collect no national identity document for routine loyalty unless a reviewed use case makes it necessary.
- Provide clear notices at enrollment and website collection points.
- Consent withdrawal must propagate to campaign systems promptly while preserving necessary transactional suppression records.
- Define retention: sales/tax/audit per legal advice; OTPs and raw network samples short-lived; inactive marketing profiles reviewed; customer deletion requests anonymize links where retention must continue.
- Log and periodically review sensitive exports, customer searches, merges, adjustments, and permission changes.

### 15.3 Threat scenarios to test

- Cashier tests many phone numbers to discover balances.
- Attacker intercepts or brute-forces OTPs.
- Duplicate webhook credits payment or loyalty twice.
- Offline device replays old earns or redemptions.
- Staff exports customers outside business purpose.
- Promotion configuration creates unlimited points.
- Compromised IoT/CCTV device attempts lateral movement to POS.
- Public catalog endpoint exposes cost, exact inventory, or unpublished products.
- Stolen POS device reveals cached customer data.

## 16. Non-functional requirements

| Area | Requirement |
|---|---|
| Availability | Transactional services target 99.9% monthly availability excluding planned maintenance; offline store path covers WAN failure |
| Performance | P95 customer lookup and loyalty quote under 2 seconds online; dashboard landing under 3 seconds for common 30-day views; public pages meet practical mobile performance budgets |
| Scale | Design for at least 3 stores plus warehouse initially, 20 locations without redesign, 100 concurrent staff sessions, and multi-million-row ledgers through indexing/partition planning |
| Correctness | Monetary and points calculations deterministic; idempotent writes; reconciliation jobs and invariant monitoring |
| Accessibility | Website and customer account target WCAG 2.2 AA; keyboard, contrast, focus, labels, error recovery, and language metadata tested |
| Usability | Cashier identity and loyalty steps add minimal time; common action completes with scanner/keyboard and limited typing |
| Maintainability | Typed schemas, migration discipline, modular domains, OpenAPI contracts, event versions, feature flags, and runbooks |
| Observability | Structured redacted logs, metrics, traces/correlation IDs, business invariants, synthetic checks, actionable alerts |
| Compatibility | Current supported Chrome/Edge plus common Android browsers; tested receipt printers/scanners for POS-linked flows |
| Localization | English/Nepali strings externalized; NPR, Nepal Time, calendars, numerals, and Unicode tested |
| Data quality | Required ownership and validation for master data; freshness and completeness visible to users |

## 17. Acceptance criteria

### 17.1 Loyalty MVP

- A cashier can find or create a customer by phone within the performance target without seeing unrelated personal data.
- Duplicate normalized phone identities are blocked; authorized merge preserves sales and ledger history.
- Completed eligible sales post exactly one earn entry even if the request/event is retried.
- Return/void creates correct compensating entries and never edits the original.
- Redemption respects available balance, caps, verification, rule version, and atomic sale completion.
- Ledger-derived and cached balances reconcile for every account in automated tests and daily production checks.
- Customer statement and receipt explain changes in plain language.
- Rule simulator, approval, activation window, conflict priority, and audit trail work for base and bonus examples.
- Offline earns visibly remain pending and later reconcile once; offline redemption is blocked in phase one.

### 17.2 Website and customer account MVP

- All required public pages work on agreed mobile/desktop browsers and pass accessibility checks.
- Store hours and closures can be updated without a code deployment and show publication timestamps.
- OTP flows resist enumeration and rate-limit abuse; expired/reused OTPs fail safely.
- Verified customers see only their own points/activity and can manage consent.
- Unpublished items, costs, internal stock, and staff/customer data cannot be retrieved through public APIs.
- Analytics honors consent configuration and excludes sensitive form values.

### 17.3 Dashboard MVP

- Owner and location manager see only authorized locations and documented KPIs.
- Net sales, transactions, returns, tender, and loyalty totals reconcile to source records for selected test days.
- Each card shows definition/freshness and drills to evidence or an exception list.
- Stale data and incomplete costs are clearly labeled, not presented as final.
- Export scope matches screen scope and produces an audit event.
- Offline/store network incident and recovery appear within the monitoring SLA.

### 17.4 Network pilot

- VLAN isolation tests prove guest and CCTV networks cannot reach POS/business systems.
- Primary ISP failure triggers the backup path within the agreed interval and StoreSync reconnects without duplicate postings.
- UPS test meets the documented runtime and produces a graceful shutdown/restart procedure.
- Monitoring detects WAN loss, device loss, excessive latency, and sync backlog; alerts reach the assigned owner.
- Router/switch/access-point configuration can be restored to replacement hardware from a secured backup.

### 17.5 Future commerce launch gate

- Inventory reservation concurrency tests prevent overselling at the agreed safety-stock policy.
- Price/promotion/order totals reproduce from recorded versions.
- Payment callbacks, retries, delays, duplicates, and refunds reconcile correctly in sandbox and controlled production tests.
- Full order lifecycle, cancellation, substitution, pickup verification, returns, inventory, payment, and loyalty effects pass end-to-end testing.
- Pilot store staffing, fulfillment capacity, customer support, terms, privacy, refund policy, and incident runbooks are approved.

## 18. QA strategy

- Unit tests for points, money, rounding, expiry, tier qualification, promotion precedence, availability, and state transitions.
- Property/invariant tests: ledger sum equals balance; no double posting; reservation quantity never negative; reversal references valid original entries.
- API contract and authorization matrix tests for every role/location/customer boundary.
- Integration tests with PostgreSQL, outbox/event consumers, SMS sandbox, and payment sandboxes.
- Offline tests covering sudden disconnect, long outage, clock drift, queue replay, duplicate upload, conflict, corrupted local cache, and device replacement.
- End-to-end tests for enrollment, earn, redeem, return, consent, dashboard reconciliation, content publication, and future order lifecycle.
- Performance/load tests using realistic product, customer, ledger, sales, and dashboard data volumes.
- Security tests aligned to OWASP web/API risks, privilege escalation, OTP abuse, webhook replay, export controls, and network segmentation.
- Accessibility testing with automated tools plus keyboard and screen-reader checks.
- Localization testing for Nepali/English, Unicode search, receipts/SMS, NPR rounding, Nepal Time boundaries, and optional Bikram Sambat display.
- Backup restoration, disaster recovery, failover, and configuration recovery exercises before pilot approval.
- User acceptance testing with owner, managers, cashiers, support, warehouse, and representative customers.

Release evidence includes test results, known limitations, migration rehearsal, rollback decision, KPI reconciliation, security review, and signed business acceptance.

## 19. Deployment, monitoring, and backups

### 19.1 Environments and release

- Separate development, test/staging, and production environments with distinct credentials and non-production data.
- Automated build, test, security checks, migration validation, and artifact provenance.
- Backward-compatible database and event changes; expand/migrate/contract pattern for risky migrations.
- Feature flags by environment and location for loyalty earn, redeem, customer account, dashboard modules, and future commerce.
- Canary at internal/test location, then Store 1 pilot, monitored rollout, and explicit go/no-go gates.
- Rollback includes application version, feature disablement, database compatibility, queue handling, and customer communication.

### 19.2 Monitoring

- Technical: uptime, latency percentiles, error rate, database connections/locks/replication, queue depth/age, cache, storage, provider availability, SSL expiry.
- Business invariants: duplicate ledger sources, negative balances, unbalanced reversals, sales without loyalty outcome, payment mismatch, reservation leak, stale location data.
- Customer: OTP failure rate, enrollment funnel, statement errors, page performance, contact-case volume.
- Network: location heartbeat, WAN loss, failover, latency/packet loss, device health, UPS alerts where supported.
- Alerts have severity, owner, threshold, playbook, escalation, and post-incident review criteria. Avoid noisy unactionable alerts.

### 19.3 Backup and recovery

- Encrypted automated PostgreSQL backups with point-in-time recovery where available; copies stored in a separate failure domain/account.
- Retention tiers to be approved (example: daily 35 days, monthly 12 months) in line with legal and cost requirements.
- Back up media metadata/content, infrastructure configuration, network-device configuration, encryption-key recovery material under split access, and deployment definitions.
- Do not rely on application replicas as backups.
- Run automated backup-success checks and quarterly restore tests to an isolated environment; record achieved RPO/RTO.
- Store devices retain only the minimum encrypted offline data; local queues are backed by server acknowledgement and recovery procedures, not ad hoc file copies.

## 20. Phased roadmap and implementation priorities

### Phase A — Decisions and foundations (4–6 weeks)

Priority P0. Confirm loyalty economics, consent/privacy policy, customer identity, KPI definitions, business-date rules, network standard, event/outbox pattern, and StoreSync domain boundaries. Add permission matrix, threat model, data classification, and architecture decision records.

Exit: approved policies and schemas; prototype ledger/rule calculations; Store 1 network survey; baseline metrics captured.

### Phase B — Customer and loyalty core (6–10 weeks)

Priority P0. Build customer/consent services, OTP, loyalty ledger, earn lots, rule versions/simulator, earn/reversal, audit and reconciliation. Integrate with a controlled sale test harness until POS completion.

Exit: invariants and security tests pass; daily reconciliation works; cashier workflow validated.

### Phase C — Website and dashboard MVP (6–10 weeks, overlaps late Phase B)

Priority P1. Launch public content/store pages, loyalty information/enrollment/account, owner/store dashboard, governed KPI catalog, data freshness and export audit.

Exit: accessibility, performance, authorization, content operations, and KPI reconciliation accepted.

### Phase D — Store 1 infrastructure and loyalty pilot (4–6 weeks)

Priority P0. Install/standardize network segmentation, backup WAN, UPS, monitoring, device inventory, support runbooks. Pilot identification, earning, self-service, and dashboards with feature flags. Redemption starts only after POS integration and controls pass.

Exit: at least four stable trading weeks, zero unresolved ledger variance, acceptable cashier time, support load understood, recovery test passed.

### Phase E — Multi-store loyalty and optimization (6–8 weeks)

Priority P1. Roll out across stores; add redemption, tiers, expiry communication, targeted offers, cohort reporting, liability reporting, and data-quality workflows.

Exit: controlled rules, finance sign-off, multi-location reporting, measured customer outcomes.

### Phase F — Commerce readiness (dependent on core roadmap)

Priority P1/P2. Complete purchasing, receiving, batches/expiry, transfers, POS/offline billing, payments, returns, sellable inventory, reservations, order/payment/fulfillment domains, and click-and-collect operations.

Exit: future commerce launch gate in section 17.5 passes.

### Phase G — E-commerce pilot and scale

Priority P2. Pilot click-and-collect at one store, then selected stores. Add delivery only after operational readiness. Optimize search, merchandising, conversion, fulfillment, and retention based on evidence.

## 21. Dependencies and decision register

### 21.1 Dependencies

- Reliable sale, return, price, promotion, inventory, payment, and location records.
- POS/offline billing integration for production loyalty redemption.
- Supplier/purchasing/transfers/batches for accurate availability and future expiry reporting.
- SMS provider coverage, sender/registration needs, costs, delivery reporting, and service levels.
- eSewa/Khalti merchant onboarding and sandbox/production credentials for future payments.
- Store 1 network survey, hardware procurement, ISP/backup coverage, and local installation support.
- Nepal legal, tax, privacy, loyalty-terms, and consumer-policy review.
- Product images/content ownership and bilingual content capability.
- Named product owner, engineering owner, data/KPI owner, security owner, network owner, finance approver, and store champions.

### 21.2 Decisions required before build lock

- Earn and redemption value, eligible spend basis, rounding, caps, expiry, and liability method.
- Whether OTP is mandatory at enrollment or only before sensitive actions.
- Customer duplicate/household policy and minimum age/guardian policy if relevant.
- Customer-visible languages and Bikram Sambat scope.
- Hosting location/provider, cross-border data position, RPO/RTO, and operational ownership.
- Network vendors, backup connectivity approach, UPS runtime, and support SLA.
- Dashboard cost/margin source and definition of final versus provisional data.
- First commerce fulfillment method, store, assortment, payment/tender, substitution, and cancellation policy.

## 22. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Loyalty launches before certified sale lifecycle | Duplicate or incorrect balances | Use test harness only; gate production posting on POS state and reconciliation |
| Poor phone data creates duplicate customers | Wrong account/balance and privacy incidents | Canonical normalization, verification, duplicate detection, controlled merge |
| Rules are too generous or conflict | Financial loss and customer disputes | Versioning, simulator, caps, approvals, precedence, real-time anomaly alerts |
| Offline replay or concurrency | Double earn/redeem | Idempotency, signed device identity, atomic posting, ledger invariants |
| Dashboard numbers are distrusted | Low adoption and bad decisions | Metric catalog, freshness, drill-down, reconciliation, named data owner |
| Public availability overpromises | Cancelled orders and lost trust | Safety stock, reservations, timestamp, substitution/cancellation process |
| Weak store networks | Sales interruption and corrupted sync assumptions | Segmentation, UPS, backup WAN, monitoring, recovery tests |
| IoT/CCTV compromise | Lateral access to POS/customer data | Separate VLAN/firewall, no exposed admin ports, patching and unique credentials |
| SMS/payment provider outage | Enrollment/payment failure | Clear degraded modes, retry, alternate flows, provider monitoring and reconciliation |
| Privacy misuse or over-collection | Legal/reputation harm | Minimization, purpose controls, consent, masking, export audit, retention |
| E-commerce distracts from core operations | Delayed POS/inventory quality | Enforce launch dependencies and click-and-collect pilot gate |
| Lack of operational ownership | Alerts and exceptions remain unresolved | Named owners, SLAs, runbooks, escalation, weekly pilot review |

## 23. Governance and operating model

- Product council: owner/business sponsor, product lead, engineering, operations, finance, marketing/CRM, security/privacy, and store representative.
- Weekly build review; daily pilot incident review; monthly KPI and loyalty-finance review; quarterly security, access, backup, and network recovery review.
- Changes to loyalty value, expiry, stacking, customer terms, KPI definitions, or payment behavior require documented impact, approval, effective date, customer communication plan, and rollback.
- Access reviews occur quarterly and on staff role/termination changes.
- Every production incident records timeline, impact, customer/financial reconciliation, root cause, corrective actions, and owner.

## 24. Definition of done

A feature is done only when requirements and acceptance criteria are traceable; code and migrations are reviewed; automated and user tests pass; security/privacy and accessibility checks are complete; metrics, alerts, audit events, and runbooks exist; data migration/reconciliation and rollback have been rehearsed; documentation/training is delivered; and the accountable business owner signs off.

## Appendix A — Example loyalty ledger

| Time | Type | Source | Points | Available effect | Explanation |
|---|---|---|---:|---:|---|
| 1 Sep 2026 | EARN | Sale S-10012 | +25 | +25 | Base earn under rule v1 |
| 7 Sep 2026 | EARN | Sale S-10184 | +18 | +18 | Base earn under rule v1 |
| 12 Sep 2026 | REDEEM | Sale S-10240 | -20 | -20 | Customer redemption |
| 14 Sep 2026 | REVERSAL | Return R-10240-1 | +5 | +5 | Partial return reversed allocated redemption |
| 30 Sep 2027 | EXPIRE | Earn lot S-10012 | -25 | -25 | Unused lot expired under disclosed policy |

The displayed balance is a projection of posted, non-reversed ledger effects. Earn lots support deterministic expiry and proportional returns. Cached account balances are performance aids, not independent truth.

## Appendix B — Pilot go-live checklist

- Business rules, terms, privacy notice, consent scripts, and staff SOP approved.
- Customer, consent, loyalty, event, and KPI migrations applied and reconciled.
- Test customer cleanup complete; production access roles reviewed.
- Store 1 VLANs, firewall, UPS, backup WAN, monitoring, and configuration backups verified.
- POS/customer lookup/receipt flows tested on real devices and printers.
- Offline outage and recovery drill completed without duplicate transactions.
- Dashboard source-day reconciliation signed by finance/operations.
- SMS delivery, rate limits, support escalation, and customer messaging verified.
- Feature flags, rollback, backups, restore evidence, on-call contacts, and incident channel ready.
- Pilot success thresholds and stop conditions documented.

## Appendix C — Suggested pilot success thresholds

- Zero unreconciled loyalty balance variance at daily close.
- At least 99.5% of eligible earn postings complete automatically within 15 minutes when online.
- P95 phone lookup below 2 seconds on healthy Store 1 connectivity.
- No critical security/privacy incident and no unauthorized cross-location access.
- Network availability and backup-path performance meet the agreed trading-hours target.
- Dashboard sales/tender totals match certified source reports within zero tolerance for exact totals; margin estimates show approved data-quality limitations.
- Cashier training completion is 100%; observed workflow meets the agreed transaction-time impact.
- Customer complaint and missing-points rates remain below a threshold set after the first baseline week.

---

**End of PRD**
