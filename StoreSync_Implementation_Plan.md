# StoreSync Modern Trade Implementation Plan

**Version:** 2.0  
**Original plan date:** 10 August 2026  
**Expansion update:** 13 August 2026  
**Delivery sequence:** Existing foundation → Core commerce → Payments and logistics → Omnichannel POS → Infrastructure → IRD compliance  
**Planning basis:** The StoreSync Modern Trade PRD

---

## 1. Plan purpose

This plan records the original four delivery phases and defines a new five-phase expansion roadmap for turning the implemented StoreSync foundation into a production omnichannel retail platform. The expansion covers Nepal-oriented commerce, payments and logistics, installable POS and loyalty, content and production infrastructure, and IRD-compliant fiscal operations.

The proposed schedule is approximately **36–48 weeks**. This is a planning range, not a fixed commitment. Final timing depends on team size, design approvals, the maturity of the existing StoreSync APIs, vendor onboarding, and progress on POS, purchasing, transfers, payments, and inventory accuracy.

## 2. Delivery principles

- Keep StoreSync as the single source of truth for products, locations, inventory, customers, sales, and loyalty.
- Build shared security, API, data, analytics, testing, and deployment foundations from Phase 1 rather than postponing them.
- Release each phase first to a controlled environment, then pilot, then expand.
- Use feature flags so incomplete capabilities remain hidden and can be disabled safely.
- Do not launch e-commerce checkout until sellable inventory, reservations, payments, returns, and fulfillment are reliable.
- Treat customer privacy, accessibility, monitoring, backups, and documentation as delivery work—not post-launch extras.

## 3. High-level roadmap

| Phase | Primary outcome | Indicative duration | Launch gate |
|---|---|---:|---|
| 1 | Public website and digital foundation | 10–12 weeks | Accessible, secure, mobile website with centrally managed store and product content |
| 2 | Customer identity and loyalty | 10–14 weeks | Phone-based enrollment, ledger-based earning/redemption, consent, statements, and reconciliation |
| 3 | Management dashboards | 8–10 weeks | Trusted role-based KPIs, drill-downs, alerts, exports, and freshness monitoring |
| 4 | Remaining works and rollout | 8–12+ weeks | Resilient network/offline operation, integrations, e-commerce readiness, hardening, deployment, and handover |

## 4. Governance and team structure

### Core roles

- **Business sponsor/owner:** approves scope, commercial rules, budget, and go-live decisions.
- **Product manager:** owns backlog, requirements, priorities, acceptance, and stakeholder communication.
- **Technical lead:** owns architecture, integration boundaries, engineering quality, and release readiness.
- **Frontend engineer:** website, customer account, and dashboard interfaces.
- **Backend engineer:** APIs, database, identity, loyalty ledger, event processing, and integrations.
- **UX/content lead:** journeys, accessibility, bilingual content, product/store content, and usability testing.
- **QA engineer:** automated, integration, end-to-end, security, accessibility, and regression testing.
- **DevOps/security owner:** environments, CI/CD, secrets, monitoring, backups, incident readiness, and security controls.
- **Data/finance owner:** KPI definitions, reconciliation, loyalty liability, and reporting sign-off.
- **Store champion:** cashier/manager workflow validation, training, pilot feedback, and operational readiness.

### Delivery rhythm

- Two-week implementation sprints.
- Weekly product demonstration and risk review.
- Backlog refinement once per sprint.
- Architecture/security review at the start and before every phase gate.
- Formal go/no-go review before public or store pilot releases.
- Pilot incident review daily during the first week and weekly thereafter.

## 5. Phase 1 — Website and digital foundation

### Objective

Launch a fast, mobile-first, accessible website that gives customers trustworthy information about the business, locations, products, offers, and future loyalty program. Build the shared web, content, API, security, analytics, and release foundations needed by later phases.

### In scope

- Brand and design system: typography, colors, components, responsive layout, bilingual content patterns, and accessibility standards.
- Public pages: home, about, stores, store detail, contact, FAQs, services, privacy, terms, and loyalty-coming-soon page.
- Store directory: hours, phone, map link, services, temporary closures, and announcements.
- Product/catalog discovery: categories, selected published products, product details, pack size, images, and location-aware availability language.
- Offers and campaign landing pages with scheduled publication and expiry.
- Content management workflow: draft, review, publish, schedule, rollback, and role permissions.
- Public API layer for stores, published catalog, offers, and content; no direct database access from the website.
- Search engine basics: titles, descriptions, sitemap, canonical URLs, redirects, structured store data, and social-sharing metadata.
- Contact/support form with rate limiting, spam controls, routing, and retention.
- Analytics with privacy-conscious event tracking and consent behavior.
- Environments, automated deployment, feature flags, logging, monitoring, backups, and rollback.

### Out of scope

- Customer accounts and active loyalty balances.
- Cart, checkout, online payment, delivery, and inventory reservations.
- Exact real-time public stock quantities.
- Advanced personalization or campaign segmentation.

### Workstreams and sequence

#### Weeks 1–2: discovery and architecture

- Confirm brand, target audiences, languages, content owners, domains, hosting, analytics, and approval workflow.
- Audit StoreSync product/location APIs and define publication fields.
- Produce sitemap, wireframes, content inventory, data classification, and threat model.
- Establish development, staging, and production environments plus CI/CD.

#### Weeks 3–5: design and foundation

- Build reusable responsive and accessible components.
- Implement public API/backend-for-frontend, caching, image handling, error behavior, and content schemas.
- Configure content roles, publication lifecycle, audit trail, and preview.
- Prepare English content and Nepali structure; translate priority content where approved.

#### Weeks 6–9: feature implementation

- Build public pages, store locator, catalog, offers, contact/support, legal pages, and SEO features.
- Connect approved StoreSync product/location data through publication controls.
- Add analytics, performance monitoring, error tracking, uptime checks, and operational dashboards.

#### Weeks 10–12: testing and launch

- Run cross-browser/mobile, accessibility, performance, security, content, API, backup, and rollback tests.
- Complete content approval, staff training, launch checklist, and support runbook.
- Soft launch, monitor, fix priority issues, then announce publicly.

### Phase 1 deliverables

- Production website and content-management process.
- Approved design system and reusable component library.
- Public API contracts and product/store publication model.
- SEO, analytics, monitoring, backup, incident, and deployment setup.
- Content ownership matrix, editor guide, support runbook, and launch report.
- Architecture foundations for customer authentication and later commerce.

### Phase 1 acceptance gate

- All required pages function on agreed mobile and desktop browsers.
- Priority journeys meet WCAG 2.2 AA expectations and keyboard testing passes.
- Public APIs cannot expose customer, staff, supplier, cost, exact internal stock, or unpublished data.
- Store hours and urgent closures can be updated without a code release.
- Core pages meet agreed mobile performance targets and have no critical security findings.
- Monitoring, backup, rollback, analytics, and content support procedures are tested.
- Business sponsor approves content, branding, privacy notice, and launch.

## 6. Phase 2 — Customer identity and loyalty

### Objective

Introduce a phone-number-based customer identity and a financially controlled loyalty program shared by POS and website. Every balance change must be explainable through an immutable ledger.

### Preconditions

- Phase 1 public website, environments, monitoring, and security foundations are stable.
- StoreSync sale, return, product, price, location, and staff-role integration points are documented.
- Business approves earn value, redemption value, expiry, caps, eligible items, stacking, tiers, and liability treatment.
- Privacy/consent language and SMS provider arrangements are approved.

### In scope

- Customer profiles, normalized Nepali phone numbers, verification status, duplicate detection, account status, and controlled merge.
- Consent by purpose/channel/policy version, including immediate marketing opt-out.
- OTP enrollment and login with enumeration protection, rate limits, expiry, and secure sessions.
- Loyalty account and immutable ledger with `EARN`, `REDEEM`, `EXPIRE`, `ADJUST`, and `REVERSAL` entries.
- Earn lots, pending/available points, expiry forecasting, and deterministic balance reconstruction.
- Versioned rule engine, simulator, effective dates, priority, exclusions, caps, approvals, and audit history.
- POS/customer lookup, enrollment, earn, redemption, receipt, return, void, and correction workflows.
- Website account: balance, pending points, tier progress, expiry, activity, profile, and consent.
- Reconciliation, fraud/abuse controls, manual-adjustment approval, finance liability reporting, and support tools.
- Offline earning queue; redemption remains disabled offline initially.

### Workstreams and sequence

#### Weeks 1–3: policy and data foundation

- Finalize loyalty economics, terms, privacy, consent, customer identity, duplicate/merge, return, expiry, and offline policies.
- Implement customer, identity, consent, loyalty account, ledger, earn-lot, rule-version, and adjustment schemas.
- Define APIs, domain events, idempotency, authorization, audit events, and reconciliation invariants.

#### Weeks 4–7: core loyalty engine

- Build enrollment/verification, customer lookup, ledger posting, cached balance, earning, reversal, expiry, adjustment, and rule simulation.
- Add transactional outbox/events, retry handling, dead-letter/replay tooling, and invariant monitoring.
- Integrate SMS sandbox and create bilingual templates.

#### Weeks 8–10: staff and customer experiences

- Build cashier/POS-linked flows and receipt content.
- Build website login/account, statement, consent, expiry, and support-request experiences.
- Build admin tools for rules, approvals, merges, adjustments, and audit review.

#### Weeks 11–14: testing and Store 1 pilot

- Run money/points, concurrency, retry, return, expiry, authorization, OTP abuse, privacy, accessibility, offline replay, and performance tests.
- Train Store 1 staff and pilot identification plus earning first.
- Enable redemption only after atomic sale integration and reconciliation pass.
- Operate four stable trading weeks before wider rollout.

### Phase 2 deliverables

- Customer and consent service.
- Loyalty ledger, balances, rule engine, reconciliation, and finance report.
- Cashier/POS-linked workflows and customer website account.
- Loyalty administration, support tools, audit events, and training materials.
- Store 1 pilot report and multi-store rollout recommendation.

### Phase 2 acceptance gate

- Retrying a sale, event, or API request never earns or redeems twice.
- Ledger totals and cached balances reconcile for every account.
- Returns and voids create correct compensating entries without editing history.
- Unauthorized staff cannot access other locations or perform adjustments/exports.
- OTP and account flows pass abuse, privacy, and accessibility testing.
- Offline earns show as pending and synchronize once; offline redemption is blocked.
- Store 1 completes the agreed stable pilot period with zero unresolved financial variance.

## 7. Phase 3 — Management dashboards

### Objective

Give owners and managers a trusted, role-based view of sales, customers, loyalty, inventory, operations, finance, data quality, and system health. Each metric must be defined, fresh, reconcilable, and actionable.

### Preconditions

- Website, customer, and loyalty event data are stable and monitored.
- StoreSync sales, inventory, tender, return, and adjustment data have clear source-of-truth definitions.
- Finance and operations approve the metric catalogue and business-date rules.

### In scope

- Owner overview and store-manager dashboard.
- Loyalty/CRM, inventory, operations, finance/reconciliation, and system-health views.
- Filters by date, location, channel, category, product, customer segment, tier, tender, and promotion where supported.
- Previous-period and same-weekday comparison.
- KPI definitions, freshness timestamps, provisional/final labels, and drill-downs to evidence.
- Alerts for sales anomalies, low stock, adjustment/return spikes, loyalty irregularities, stale data, offline locations, queue backlog, and reconciliation exceptions.
- Permission-scoped exports with audit logging.
- Data-quality dashboard covering missing cost, duplicate customer, unmapped category, delayed events, and incomplete shifts.

### Priority KPI set

- Net sales, transaction count, average basket value, items per basket, discounts, returns, voids, and tender mix.
- Gross-margin estimate with visible data-quality limitations.
- Identified sales rate, active members, repeat rate, earn/redemption/expiry rate, tier movement, and outstanding loyalty liability.
- On-hand/available stock, low-stock items, stockout rate, inventory adjustments, and expiry risk when batch data exists.
- Website usage and future commerce funnel metrics where applicable.
- Data freshness, API errors, location connectivity, last sync, queue depth/age, and monitoring status.

### Workstreams and sequence

#### Weeks 1–2: metric governance and design

- Approve formulas, sources, exclusions, refresh frequency, owners, and comparison rules.
- Prototype owner and manager layouts and exception workflows.
- Define analytics projections, retention, partitioning, refresh, and backfill approach.

#### Weeks 3–6: data and dashboard implementation

- Build event consumers/aggregations, KPI APIs, authorization, filters, caching, and freshness tracking.
- Build overview, sales, customer/loyalty, inventory, finance, data-quality, and health views.
- Add drill-downs, alerts, acknowledgement, resolution notes, and audited exports.

#### Weeks 7–8: reconciliation and usability

- Reconcile test days and locations against source sales, tender, loyalty, inventory, and return records.
- Validate role/location boundaries and sensitive-data masking.
- Conduct owner/manager usability testing and tune information hierarchy.

#### Weeks 9–10: pilot and rollout

- Pilot with owner and Store 1 manager, monitor adoption and query performance.
- Train users on definitions, filters, freshness, exceptions, and exports.
- Resolve discrepancies before adding further stores.

### Phase 3 deliverables

- Governed KPI catalogue and data ownership matrix.
- Role-based dashboard suite with drill-downs, alerts, and exports.
- Analytics projections/pipelines, freshness monitoring, and backfill tools.
- Reconciliation pack, user guide, alert runbooks, and adoption report.

### Phase 3 acceptance gate

- Exact sales, tender, return, and loyalty totals reconcile to certified source records.
- Provisional margin or incomplete data is clearly labeled.
- Users see only permitted locations and details; exports match the same scope.
- Every KPI displays definition, period basis, freshness, and drill-down.
- Stale data and pipeline failures trigger actionable alerts.
- Owner and pilot manager formally accept usability and accuracy.

## 8. Phase 4 — Remaining works, resilience, and commerce readiness

### Objective

Complete the operational and technical work needed for reliable multi-store use and prepare StoreSync for future e-commerce without prematurely launching checkout.

### Work package A: networking and store resilience

- Survey every store and warehouse; document diagrams, devices, ISP, IP plan, ports, and support owners.
- Segment POS/business, staff, guest, CCTV/IoT, and management networks using VLANs and firewall rules.
- Install/test UPS protection and primary/backup internet paths.
- Centralize secure configuration backup, firmware lifecycle, named administration, MFA/VPN, and device monitoring.
- Test isolation, ISP failover, replacement-router recovery, graceful restart, and escalation.

### Work package B: offline and synchronization completion

- Complete offline billing/POS queues, globally unique IDs, device identity, ordered local sequences, reference-data versions, checksums, retries, acknowledgements, and exception handling.
- Show online/degraded/offline state, last sync, queue depth, oldest pending item, and rejection reasons.
- Conduct long-outage, replay, duplicate, clock-drift, corrupted-cache, power-loss, and device-replacement tests.

### Work package C: StoreSync operational modules and integrations

- Complete suppliers, purchasing, receiving, batches/expiry, warehouse transfers, POS, returns, tender reconciliation, and administration gaps.
- Integrate eSewa and Khalti using server verification, signed callbacks, replay protection, idempotency, and daily reconciliation.
- Finalize accounting/tax exports and validate Nepal VAT/PAN/fiscal requirements with qualified advisers.

### Work package D: e-commerce readiness

- Add publication-quality catalog and media, pricing/promotion service boundaries, sellable inventory, safety stock, and availability projections.
- Build future cart, inventory reservation, order, payment, fulfillment, return, refund, and notification domains behind feature flags.
- Start with click-and-collect at one store only after concurrency, payment, fulfillment, cancellation, substitution, pickup verification, and returns pass.
- Add delivery later after service zones, fees, capacity, addresses, proof of delivery, cash handling, and reverse logistics are approved.

### Work package E: security, operations, and scale

- Complete penetration testing, dependency/secret scanning, data retention, privacy-request workflows, quarterly access reviews, and incident exercises.
- Validate backup restoration, point-in-time recovery, multi-location rollout, performance, capacity, and disaster recovery targets.
- Finish documentation, training, support ownership, vendor contacts, service levels, maintenance calendar, and project handover.

### Indicative sequence

| Weeks | Main activity |
|---|---|
| 1–3 | Store surveys, architecture gap review, vendor/procurement decisions, detailed readiness backlog |
| 4–6 | Network segmentation/failover, offline sync completion, operational module integration |
| 7–9 | Payment reconciliation, security hardening, recovery tests, commerce domain foundations |
| 10–12+ | Store 1 end-to-end pilot, multi-store rollout, commerce readiness gate, handover |

### Phase 4 deliverables

- Standardized and monitored store/warehouse network with recovery evidence.
- Certified offline synchronization and multi-store operating procedures.
- Completed operational dependencies and payment reconciliation.
- E-commerce-ready architecture and click-and-collect pilot backlog or controlled pilot.
- Security/recovery assessment, support model, training, documentation, and formal handover.

### Phase 4 acceptance gate

- Guest and CCTV/IoT networks cannot reach StoreSync/POS systems.
- WAN failover and offline recovery do not duplicate or lose transactions.
- Backups and network configurations restore successfully in isolated tests.
- Payments, returns, inventory, loyalty, and finance reports reconcile end to end.
- No critical security findings remain open.
- Commerce launch gate passes before checkout is exposed publicly.
- Business, operations, finance, security, and technical owners approve multi-store production readiness.

## 9. Cross-phase work that must continue throughout

- Product management, requirements traceability, design research, accessibility, bilingual content, and stakeholder communication.
- Database migration discipline, API contracts, domain events, idempotency, and audit logging.
- Automated testing, code review, security review, performance testing, and regression testing.
- Monitoring, privacy-safe logs, alerts, backups, restore tests, incident response, and release rollback.
- Training, support preparation, documentation, vendor management, and adoption measurement.
- Data quality, reconciliation, KPI ownership, and risk review.

## 10. Master dependencies and critical path

1. Phase 1 must establish stable hosting, public APIs, publication controls, design system, security, analytics, and deployment.
2. Phase 2 depends on approved loyalty economics, customer privacy/consent, SMS/OTP, and reliable sale/return integration.
3. Phase 3 depends on stable events and certified source data from StoreSync and Phase 2.
4. Phase 4 commerce readiness depends on purchasing, transfers, POS, offline billing, payments, returns, sellable inventory, and fulfillment operations.
5. Multi-store rollout depends on Store 1 pilot evidence, network readiness, support capacity, recovery tests, and staff training.

## 11. Major risks and controls

| Risk | Control |
|---|---|
| Website becomes disconnected from StoreSync | Use publication APIs and shared IDs; prohibit duplicate uncontrolled catalog databases |
| Loyalty rules cause financial loss | Simulator, versioning, caps, approvals, ledger reconciliation, and anomaly alerts |
| Dashboard figures are distrusted | Governed definitions, source drill-down, freshness labels, and finance reconciliation |
| Phase 4 becomes an unlimited catch-all | Divide into named work packages with owners, acceptance gates, and separate backlog estimates |
| E-commerce launches too early | Enforce the commerce readiness gate and start with controlled click-and-collect |
| Store connectivity disrupts operations | Network segmentation, backup WAN, UPS, offline queues, monitoring, and recovery drills |
| Privacy or security incident | Data minimization, consent, least privilege, MFA, encryption, audit, testing, and incident response |
| Team is spread across too many fronts | One primary phase outcome at a time; carry only essential platform and support work in parallel |

## 12. Reporting and success measures

### Weekly delivery report

- Completed work and demonstrated outcome.
- Current sprint goal and next milestone.
- Scope, schedule, budget, quality, security, and dependency status.
- Decisions required, blockers, owner, and due date.
- Test pass rate, defects by severity, and release readiness.

### Phase outcome measures

- **Website:** mobile performance, availability, accessibility, content freshness, search traffic, store-page actions, and support-form completion.
- **Loyalty:** member identification, enrollment completion, repeat rate, ledger accuracy, posting latency, redemption, liability, missing-points cases, and fraud exceptions.
- **Dashboard:** active users, data freshness, reconciliation accuracy, alert resolution, export usage, and manager satisfaction.
- **Remaining works:** store/network availability, failover success, offline queue age, recovery success, payment exceptions, security findings, and commerce readiness.

## 13. Immediate next 30-day action plan

1. Appoint the business sponsor, product manager, technical lead, content owner, and Store 1 champion.
2. Confirm the Phase 1 budget, team capacity, target launch range, domain/hosting, and approval process.
3. Audit the existing StoreSync repository for location, product, publication, authentication, and deployment readiness.
4. Approve the website sitemap, brand direction, languages, MVP catalog scope, and content ownership.
5. Produce wireframes and public API contracts for stores, catalog, offers, and content.
6. Establish development, staging, production, CI/CD, feature flags, monitoring, backups, and security baselines.
7. Create the Phase 1 backlog with two-week sprints, named owners, estimates, dependencies, and acceptance criteria.
8. Begin Store 1 network survey early so Phase 4 risks and procurement lead times are visible.
9. Start loyalty policy decisions in parallel without building Phase 2 features yet.
10. Schedule the Phase 1 launch gate and define measurable stop/go conditions.

## 14. Definition of phase completion

A phase is complete only when its agreed business outcome is operating in the intended environment; acceptance criteria and security/privacy requirements pass; source data reconciles; monitoring, backups, rollback, and runbooks are tested; training and documentation are delivered; critical defects are closed; and the accountable business owner signs the phase acceptance record.

---

**Recommended starting point:** Begin Phase 1 with the 30-day actions above and protect the phase boundary. The website should establish the customer-facing and platform foundations that loyalty and dashboards will reuse.

---

# Part II — Five-Phase Omnichannel Expansion Roadmap

## 15. Expansion baseline

The expansion starts from the implemented StoreSync foundation:

- Next.js public website and protected Operations Console.
- Fastify and TypeScript REST API.
- PostgreSQL transactional database.
- Products, stores, inventory batches, suppliers, purchase orders, transfers, shifts, POS sales, payments, customers, and loyalty schemas.
- Staff authentication using HTTP-only JWT cookies and role-based access.
- English and Nepali content fields.
- Offline synchronization, analytics, alerts, reconciliation, audit, and KPI foundations.

The expansion must improve this foundation incrementally. A coding agent must not replace working modules without a documented migration and rollback plan.

## 16. Mandatory coding-agent instructions

For every work package, the coding agent must:

1. Inspect existing routes, services, schemas, tests, environment files, and project instructions before editing.
2. Preserve public-site behavior and staff authorization boundaries.
3. Create repeatable, backward-compatible database migrations.
4. Validate external and client input with Zod.
5. Perform price, tax, discount, delivery, stock, loyalty, and payment calculations on the server.
6. Use PostgreSQL as the transactional source of truth.
7. Keep credentials in environment variables or an approved secret manager.
8. Add structured logging without recording passwords, tokens, full payment data, or unnecessary PII.
9. Add unit, integration, migration, authorization, and end-to-end workflow tests.
10. Update `.env.example`, API documentation, runbooks, and acceptance records.
11. Run frontend type-check/lint, backend type-check/build/tests, migration verification, and browser smoke tests.
12. Stop and request business input when rules, vendor credentials, hardware specifications, or regulatory requirements are missing.

## 17. Expansion roadmap

| Expansion phase | Primary outcome | Indicative range | External dependencies |
|---|---|---:|---|
| 1 | Nepal-oriented core commerce and localization | 10–14 weeks | Address/delivery policies, Redis environment |
| 2 | Payments, maps, logistics, and reconciliation | 10–16 weeks | eSewa, Khalti, FonePay, map-provider credentials |
| 3 | Installable POS, hardware, offline operation, and unified loyalty | 14–22 weeks | Target store hardware and pilot store |
| 4 | Strapi, Cloudflare, production caching, deployment, and observability | 8–14 weeks | Domain/DNS control and hosting accounts |
| 5 | IRD compliance, fiscal integrity, and production hardening | 10–18+ weeks | IRD specification/approval and accounting sign-off |

The estimates are planning ranges. Vendor onboarding, hardware procurement, policy approval, security review, and IRD approval can extend them.

## 18. Expansion Phase 1 — Core commerce and localization

### Objective

Deliver a complete Nepal-oriented cart, checkout, delivery, order, search, typography, and caching foundation.

### Work package 1A: Nepal address model

- Add normalized province, district, municipality, municipality type, ward, tole/locality, landmark, street, house number, phone, coordinates, and delivery-instruction fields.
- Keep postal code optional.
- Support multiple addresses per customer and one default address.
- Add address verification status, serviceability result, map-provider reference, timestamps, and audit fields.
- Import and version approved Nepal administrative data.
- Add server-side ward and municipality validation.
- Encrypt sensitive address data where appropriate and restrict staff visibility by role.

### Work package 1B: Cart and stock reservations

- Complete guest and authenticated carts using secure session identifiers.
- Implement add, update, remove, clear, merge-after-login, and cart-expiry workflows.
- Recalculate prices, discounts, taxes, and eligibility on the server.
- Validate product publication, availability, quantity limits, and current offers.
- Add time-limited stock reservations with transactional allocation and expiry cleanup.
- Prevent duplicate checkout and overselling through idempotency keys and row locking.

### Work package 1C: Delivery zones and fees

- Add delivery zones, zone/store assignments, minimum orders, base fees, surcharges, free-delivery thresholds, restricted areas, and estimated windows.
- Implement address-to-zone resolution and fulfillment-store selection.
- Provide a quote API returning serviceability, fulfillment store, delivery fee, minimum order, and estimated window.
- Store the accepted quote on the order so later configuration changes do not alter confirmed totals.

### Work package 1D: COD policy engine

- Add configurable COD ceilings, zone restrictions, category restrictions, high-value-item rules, failed-delivery thresholds, customer-risk flags, and prepaid-only conditions.
- Require auditable manager approval for overrides.
- Return clear customer-safe rejection reasons.
- Never hard-code NPR 5,000 or another threshold without business approval.

### Work package 1E: Checkout and order lifecycle

- Implement address, delivery, promotion, loyalty, payment, inventory reservation, order creation, confirmation, cancellation, return, and refund stages.
- Support `DRAFT`, `PENDING_PAYMENT`, `CONFIRMED`, `PICKING`, `PACKED`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`, `RETURN_REQUESTED`, `RETURNED`, and `REFUNDED` states.
- Enforce valid state transitions in one service.
- Record an order-event history for every transition.
- Release reservations on payment expiry or cancellation.

### Work package 1F: Romanized and phonetic Nepali search

- Add normalized English, Devanagari, romanized, synonym, SKU, barcode, brand, and category search fields.
- Maintain a versioned transliteration/synonym dictionary such as `chiura → चिउरा → beaten rice` and `noon/nun → नुन → salt`.
- Start with PostgreSQL full-text search, `pg_trgm`, weighted ranking, and typo tolerance.
- Log zero-result searches without storing unnecessary customer identity.
- Add staff tooling for approved synonym additions.

### Work package 1G: Devanagari typography

- Add Noto Sans Devanagari through `next/font` or approved self-hosted files.
- Select fonts by language and apply `lang="ne"` where appropriate.
- Use a readable Nepali base size and approximately 1.6 line height.
- Test mixed English/Devanagari content, wrapping, buttons, forms, tables, and mobile navigation.

### Work package 1H: Redis foundation

- Introduce a Redis client with environment-specific namespaces and graceful fallback.
- Cache public products, categories, delivery-zone lookups, and safe reference data.
- Use short-lived keys for reservations and distributed locks where justified.
- Add cache invalidation on product, offer, inventory, and delivery-configuration changes.
- Monitor hit rate, miss rate, latency, memory, and failures.
- Never treat Redis as the permanent source for orders, payments, inventory, or loyalty.

### Phase 1 acceptance gate

- A customer can complete a COD order using a Nepal-specific address.
- Delivery charges and COD eligibility are calculated server-side.
- Concurrent checkout cannot oversell reserved stock.
- Romanized searches return relevant Nepali/English products.
- Nepali typography passes mobile and accessibility review.
- Redis failure degrades performance without losing transactional correctness.
- Cart, order, stock, delivery, and policy workflows pass integration and browser tests.

## 19. Expansion Phase 2 — Payments, maps, and logistics

### Objective

Deliver production-grade Nepalese payment integrations, local map/address support, delivery operations, refunds, and daily reconciliation.

### Preconditions

- Obtain eSewa, Khalti, and FonePay production or certified sandbox credentials.
- Select Baato Maps or Galli Maps and obtain API credentials and terms.
- Provide HTTPS callback and webhook URLs.
- Approve refund, cancellation, delivery, COD collection, and reconciliation policies.

### Work package 2A: Payment provider abstraction

- Define common create-intent, verify, webhook, refund, cancel, and reconcile interfaces.
- Isolate eSewa, Khalti, FonePay, cash, and card-terminal adapters.
- Store provider-independent status and provider-specific metadata separately.
- Use idempotency keys on payment and refund requests.

### Work package 2B: FonePay QR

- Implement dynamic QR creation with bound amount, order reference, and expiry.
- Add status polling only as a supplement to signed server verification.
- Verify webhook signatures, amount, currency, merchant identity, transaction reference, and replay protection.
- Handle expired, failed, duplicate, reversed, and refunded payments.
- Never mark an order paid from a browser redirect alone.

### Work package 2C: Payment security and recovery

- Encrypt credentials and rotate secrets without redeployment where possible.
- Store raw webhook metadata safely with redaction and retention controls.
- Add duplicate-webhook prevention and retry-safe processing.
- Implement payment/order mismatch queues and manual resolution with audit logging.
- Add provider outage and delayed-confirmation workflows.

### Work package 2D: Map-provider abstraction

- Define provider-neutral autocomplete, geocoding, reverse-geocoding, route, distance, and landmark interfaces.
- Integrate the chosen primary provider and allow a future secondary provider.
- Add map pin selection and landmark-assisted address capture.
- Cache safe geocoding results within provider terms.
- Preserve manual addressing when provider services fail.

### Work package 2E: Kataho/offline location support

- Integrate offline location codes only when an approved API/specification is available.
- Store the code with the normalized address and coordinates.
- Support delivery-agent lookup and manual fallback.
- Test poor-connectivity behavior and cached address retrieval.

### Work package 2F: Delivery operations

- Add delivery agents, assignments, route batches, pickup, attempts, OTP confirmation, failure reasons, proof of delivery, COD collection, and return-to-store workflows.
- Provide protected dispatcher and delivery-agent interfaces.
- Restrict agents to assigned orders and minimum customer data.
- Track custody changes and timestamps.

### Work package 2G: Reconciliation

- Reconcile eSewa, Khalti, FonePay, cash, COD, and card-terminal totals daily.
- Identify missing webhooks, duplicate transactions, amount mismatches, unmatched references, refunds, reversals, and late settlements.
- Provide manager resolution actions and immutable audit records.
- Alert on unresolved high-value discrepancies.

### Phase 2 acceptance gate

- Each configured payment provider completes a certified end-to-end transaction.
- Webhook processing is signed, idempotent, replay-resistant, and amount-verified.
- Map-assisted Nepal addresses produce serviceability and delivery quotes.
- Dispatch, delivery attempt, COD collection, proof, and return workflows operate end to end.
- Refund and reconciliation totals match provider reports and internal orders.
- Provider or map outages have tested fallback behavior.

## 20. Expansion Phase 3 — Omnichannel POS and loyalty

### Objective

Deliver a dedicated installable POS for store computers with barcode/hardware support, offline operation, unified inventory, and production omnichannel loyalty.

### Work package 3A: Dedicated POS experience

- Build a separate full-screen `/pos` interface without the public website header/footer.
- Provide staff login, shift opening, scan/search, cart, customer lookup, discounts, payments, receipt, returns, shift close, and sync status.
- Optimize for keyboard/scanner operation and touch screens.
- Keep cashier flows distinct from the management Operations Console.

### Work package 3B: Barcode model and scanning

- Add multiple barcodes per product, barcode type, unit/pack mapping, active dates, and weighted-item rules.
- Support EAN-8, EAN-13, UPC-A, Code 128, internal codes, and approved scale labels.
- Handle USB scanners as keyboard input with buffered scan detection.
- Add unknown-barcode and duplicate-barcode workflows.

### Work package 3C: Installable application

- Start with a PWA including manifest, service worker, app icons, updates, and install guidance.
- Add a local hardware bridge for devices unavailable through safe browser APIs.
- Use Electron only after testing proves it is required.
- Sign desktop releases and provide controlled update/rollback procedures.

### Work package 3D: Hardware adapters

- Define adapters for receipt printers, cash drawers, scanners, customer displays, weighing scales, and payment terminals.
- Select and document supported Windows versions and exact hardware models.
- Add connection diagnostics and operator-friendly error recovery.
- Keep hardware calls outside pricing, payment, inventory, and loyalty business logic.

### Work package 3E: Offline POS

- Cache approved catalogue, barcode, price, promotion, tax, and staff reference data locally.
- Store offline cash transactions in IndexedDB or an approved local database.
- Encrypt local data, sign payloads, assign device/sequence identifiers, and preserve original occurrence timestamps.
- Implement retry, conflict, duplicate, quarantine, and supervisor-resolution workflows.
- Do not report unverified digital payments as successful offline.

### Work package 3F: Unified inventory

- Maintain on-hand, reserved, available-to-sell, damaged, expired, in-transit, and quarantined quantities by store/batch.
- Connect POS sales, online reservations, receiving, transfers, returns, damage, wastage, and stock counts.
- Add transactional locking and reconciliation jobs.
- Surface stale inventory and sync lag clearly.

### Work package 3G: Omnichannel loyalty

- Finalize earning, redemption, minimum balance, expiry, returns, reversals, promotional multipliers, and fraud rules.
- Use the immutable loyalty ledger as the source of truth.
- Synchronize verified phone identity across POS and online accounts.
- Restrict offline redemption or define approved risk limits.
- Reconcile sales, returns, earn lots, redemption, expiry, and liability.

### Work package 3H: Staff controls

- Enforce cashier, inventory, supervisor, manager, and administrator permissions.
- Require approved overrides for price changes, discounts, returns, voids, drawer operations, and cash variances.
- Record staff, device, shift, reason, and before/after values.

### Phase 3 acceptance gate

- Supported barcodes add the correct products reliably.
- The POS installs and runs on the approved store computer.
- Supported printer and cash-drawer operations pass hardware tests.
- Offline cash sales synchronize without duplication after connectivity returns.
- POS and online commerce share accurate inventory.
- Loyalty balances and reversals reconcile across store and online channels.
- End-to-end sale, return, refund, shift, receipt, and recovery tests pass in the pilot store.

## 21. Expansion Phase 4 — Content and production infrastructure

### Objective

Add Strapi CMS, Cloudflare, production Redis, independent deployment, monitoring, backup, and recovery capabilities.

### Work package 4A: Strapi CMS

- Use Strapi for homepage content, store editorial pages, offers, banners, FAQs, services, legal pages, campaigns, and bilingual content.
- Keep orders, payments, inventory, loyalty, POS, and financial records in StoreSync PostgreSQL.
- Define draft/review/publish roles, scheduling, preview, media, audit, and rollback behavior.

### Work package 4B: Content migration and Next.js integration

- Build repeatable import scripts preserving slugs, languages, publication state, dates, and media references.
- Add a typed server-side Strapi client, draft preview, webhook revalidation, cache tags, and safe CMS-unavailable fallback.
- Validate migration counts and content rendering before cutover.

### Work package 4C: Cloudflare

- Configure DNS, TLS, CDN, WAF, bot controls, rate limits, image optimization, and static caching.
- Bypass public caching for staff pages, customer sessions, cart, checkout, orders, payments, loyalty, and operational APIs.
- Test cache keys, invalidation, security headers, origin protection, and rollback.

### Work package 4D: Production Redis

- Configure managed Redis, encrypted connections, environment namespaces, TTL policy, memory limits, monitoring, and failover behavior.
- Implement stampede protection and observable invalidation.
- Test transactional correctness during Redis outage.

### Work package 4E: Deployment and CI/CD

- Deploy frontend, Fastify API, Strapi, PostgreSQL, Redis, and workers independently.
- Maintain isolated development, staging, and production environments.
- Automate lint, type-check, tests, build, migration validation, security scan, staging deployment, smoke tests, approval, production deployment, and post-deployment checks.
- Define rollback for application and database changes.

### Work package 4F: Observability and recovery

- Add structured logs, traces, error tracking, uptime checks, payment alerts, database/Redis health, stock-sync lag, and offline-queue monitoring.
- Configure encrypted backups and point-in-time database recovery.
- Run restoration, provider-outage, Redis-outage, and rollback drills.
- Maintain incident ownership and escalation runbooks.

### Phase 4 acceptance gate

- Editors can publish approved bilingual content without a code deployment.
- Next.js invalidates only affected content.
- Cloudflare improves public delivery without caching private data.
- Staging and production deploy independently with protected secrets.
- Monitoring detects critical payment, database, inventory, and sync failures.
- Backup restoration and deployment rollback are demonstrated successfully.

## 22. Expansion Phase 5 — IRD compliance and production hardening

### Objective

Deliver verified Nepal fiscal billing, accounting integrity, security hardening, operational readiness, and launch approval.

### Mandatory external prerequisites

- Confirm PAN/VAT registration and legal entity details.
- Obtain the current IRD electronic billing specification, credentials, and approval path.
- Confirm fiscal invoice, credit-note, offline, retention, and reporting requirements with a Nepal tax/accounting specialist.
- Do not implement assumed IRD behavior from memory or unofficial examples.

### Work package 5A: Fiscal invoice model

- Store immutable invoice number, fiscal year, seller/customer tax identities, store, line items, taxable values, VAT rates/amounts, discounts, total, payment split, original sale, credit-note reference, IRD status/reference, timestamps, and integrity hash.
- Separate commercial order state from fiscal-document state.
- Prohibit deletion or silent rewriting of issued fiscal documents.

### Work package 5B: Fiscal numbering

- Implement concurrency-safe sequences according to approved fiscal rules.
- Preserve voided numbers and produce gap reports.
- Apply fiscal-year rollover rules only after written confirmation.
- Record every allocation, failure, retry, and override.

### Work package 5C: IRD adapter

- Isolate authentication, signing, submission, verification, cancellation/credit note, retry, and response archiving.
- Add idempotency and duplicate prevention.
- Encrypt credentials and log only redacted metadata.
- Implement approved behavior for IRD downtime and delayed submission.

### Work package 5D: Returns and credit notes

- Reference the original invoice and returned lines.
- Reverse tax, payment, inventory, and loyalty consistently.
- Create and submit the legally required credit note without modifying the original invoice.
- Reconcile refund and fiscal status.

### Work package 5E: Accounting and compliance exports

- Produce approved daily sales, VAT register, purchase register, payment reconciliation, cash reconciliation, returns, credit notes, inventory valuation, loyalty liability, and supplier balance exports.
- Restrict exports by role and audit every generation/download.
- Reconcile report totals to transactional records.

### Work package 5F: Security hardening

- Rotate all bootstrap and development secrets.
- Require strong passwords and MFA for privileged staff.
- Apply least-privilege database and service accounts.
- Complete authorization, CSRF, cookie, CSP, dependency, container, PII encryption, log-redaction, backup-encryption, and penetration reviews.
- Add device/session revocation and credential-compromise procedures.

### Work package 5G: Operational readiness

- Finalize runbooks for payment, IRD, database, Redis, network, inventory, POS-device, credential, refund, duplicate-transaction, and restore incidents.
- Train store, finance, customer-service, IT, and management teams.
- Run production-like load, failover, offline recovery, security, and disaster-recovery exercises.

### Phase 5 acceptance gate

- IRD behavior is verified against current official requirements and approved by accountable business/accounting owners.
- Fiscal numbering and documents are immutable, auditable, and concurrency-safe.
- Returns generate correct credit notes and reconcile tax, payment, inventory, and loyalty.
- POS, website, providers, fiscal records, and accounting reports reconcile.
- Privileged users use MFA and production secrets are rotated.
- Security review, recovery drill, training, and legal/business/technical sign-offs are complete.

## 23. Expansion critical path and phase controls

The controlled delivery sequence is:

```text
Phase 1: Core commerce and localization
    ↓
Phase 2: Payments, maps, and logistics
    ↓
Phase 3: Installable POS, hardware, offline operation, and loyalty
    ↓
Phase 4: Strapi, Redis, Cloudflare, deployment, and observability
    ↓
Phase 5: IRD compliance, fiscal integrity, and production hardening
```

Important controls:

- Phase 2 can begin vendor onboarding during Phase 1, but production payment work cannot close without credentials and certification.
- Phase 3 hardware discovery and procurement must begin early, but POS acceptance requires the exact pilot hardware.
- Phase 4 hosting/domain procurement can run in parallel, but no CDN rule may expose or cache private data.
- Phase 5 regulatory discovery should begin early, but implementation must follow verified current IRD requirements.
- Every phase deploys to staging and receives a signed acceptance record before production expansion or the next phase gate.

## 24. Expansion definition of done

An expansion phase is complete only when:

- Its business outcome works end to end in the intended environment.
- Database migrations pass on a clean database and an upgraded copy.
- Authorization and privacy tests pass.
- Unit, integration, reconciliation, offline/failure, and browser tests meet the agreed threshold.
- Monitoring, alerting, backup, restore, rollback, and incident procedures are tested where applicable.
- Documentation, environment-variable references, training, and runbooks are updated.
- Critical and high-severity defects are closed or explicitly accepted by accountable owners.
- Business, technical, security, finance/accounting, and regulatory owners sign the applicable acceptance gate.
