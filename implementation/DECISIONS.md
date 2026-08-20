# Architecture and Product Decisions

Record decisions that materially affect implementation. Do not rewrite past entries; supersede them with a new entry.

## ADR-001 - Initial operating market

- Date: 2026-08-13
- Status: Superseded by ADR-004; retained as historical context only
- Context: The product-facing storefront, organization configuration, and current customer experience target Pune/India. The repository also contains older Nepal/NPR defaults, Nepal-specific phone normalization, payment providers, tax, maps, seed data, and copy.
- Decision: The initial production market is India, with INR, `en-IN`, `Asia/Kolkata`, GST context, Indian addresses/postal codes, and Indian mobile-number formatting. Nepal is not an MVP launch market.
- Consequences: Phase 01 must remove or isolate Nepal/NPR fallbacks from shared contracts and ensure catalog, checkout, POS, loyalty, tax, address, map, and content flows derive market settings from organization/store configuration. Nepal-specific IRD, fiscal-signature, eSewa, Khalti, Baato/Galli, and Nepal locale behavior remains disabled for this release.
- Alternatives considered: Nepal/NPR, or multi-market support in the first release. Nepal conflicts with the current storefront and organization target; multi-market is deferred until the single-market contract is stable.

## ADR-002 - Initial payment scope

- Date: 2026-08-13
- Status: Accepted; provider market wording superseded by ADR-004
- Context: Electronic providers are incomplete and fail closed in production.
- Decision: Ship COD for customer checkout and cash for POS first. Electronic payment providers are deferred until a Nepal-compatible provider is completed end to end and certified.
- Consequences: Checkout can launch safely before electronic payment integration is certified.
- Alternatives considered: Enabling existing sandbox-like provider behavior in production; rejected as unsafe.

## ADR-003 - MVP scope

- Date: 2026-08-13
- Status: Superseded by ADR-005; retained as historical context only
- Context: Phase 00 requires a narrowly defined first production release.
- Decision: MVP includes public catalog, customer OTP, persistent cart, COD checkout, basic loyalty, staff authentication, POS cash sales, receiving, transfers, shifts, core admin CRUD, and audit logs. Advanced electronic providers, maps, recommendations, segmentation, hardware, Nepal launch, and multi-market support are deferred.
- Consequences: Later phases must implement and verify the included journeys before release; deferred capabilities must remain visibly disabled or labelled as unavailable.
- Alternatives considered: Broad multi-country and multi-provider launch; rejected due to current implementation inconsistency and integration risk.

## ADR-004 - Nepal launch market supersedes ADR-001

- Date: 2026-08-14
- Status: Accepted
- Context: The business is based in Nepal and the launch configuration must match Nepalese customers, stores, tax, address, and payment conventions.
- Decision: Nepal is the active launch market: NPR, `en-NP`, `Asia/Kathmandu`, IRD/VAT context, Nepal mobile numbers and five-digit postal codes. Customer checkout remains COD and POS remains cash-first; eSewa, Khalti, Baato, and Galli stay disabled until each integration is certified.
- Consequences: Migration 016 supersedes legacy India defaults in live organization, store, price, and country configuration data. Historical migrations retain their checksums; fresh and existing environments converge through the new migration.

## ADR-005 - Production pilot scope supersedes ADR-003

- Date: 2026-08-19
- Status: Accepted
- Context: Loyalty, returns, advanced analytics, external tax/fiscal integrations, offline/device modules, electronic providers and related navigation are not certified.
- Decision: The Nepal pilot is limited to the public website, catalog/store selection, customer account/cart/COD checkout/pickup-delivery/order history, staff login, basic cash POS/shifts, inventory, procurement, staff, content/catalog, audit and required operations. All other modules are retained but fail closed behind production feature controls.
- Consequences: Deferred flags cannot be enabled in production without code/certification change. India remains a future registry entry and cannot become the active pilot market.
