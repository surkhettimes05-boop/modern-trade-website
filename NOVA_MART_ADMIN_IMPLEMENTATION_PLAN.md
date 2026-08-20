# NOVA MART Admin & Operations Platform — Coding Agent Implementation Plan

## 1. Objective

Build a secure, role-aware internal platform that enables NOVA MART staff to manage the public website, catalog, stores, inventory, orders, promotions, customers, staff, finance, compliance, and daily store operations without editing code or directly accessing the database.

The existing customer storefront must remain independent and stable. Reuse the implemented Fastify services and routes where correct; do not replace working backend modules merely to fit a new UI.

## 2. Current Repository Baseline

### Frontend

- Next.js 16.3 App Router, React 19, TypeScript, Tailwind CSS 4.
- Public NOVA MART storefront exists in `frontend/src/app`.
- `/staff-login` provides username/password authentication.
- `/operations` is protected only by the presence of an `ops_session` cookie.
- The operations UI is one large client component with seven tabs: POS, inventory, suppliers, purchase orders, transfers, shifts, and payments.
- The current UI uses the first returned store, product, and supplier as implicit defaults. This is unsafe for real operations.
- There is no dedicated `/admin` frontend information architecture.

### Backend

- Fastify 5, PostgreSQL, Zod, JWT cookie authentication.
- Operations authentication issues an HTTP-only, same-site cookie valid for eight hours.
- Coarse backend roles currently include `CASHIER`, `INVENTORY`, `MANAGER`, and `ADMIN`.
- A `permissions` JSONB field exists on staff records but is not consistently enforced.
- Many mature API domains already exist: content pages, stores, products, customers, consent, POS, inventory/batches, suppliers, purchasing, receiving, transfers, shifts, tender reconciliation, staff, audit reports, web orders, delivery, promotions, loyalty, segmentation, analytics, notifications, support, devices, offline sync, observability, tax, compliance, and security incidents.
- Administrative APIs are enabled only when `ENABLE_ADMIN_API=true`.

## 3. Product decision

Nepal is the active production pilot: `NP`, `NPR`, `en-NP`, `Asia/Kathmandu`, IRD/VAT labels, Nepal phone/address rules, COD checkout and cash POS. India remains a future configurable market but is not activatable for this release. Financial, tax, payment and address interfaces must derive labels and behavior from the validated market contract and production feature controls.

## 4. Target Application Structure

Use two internal workspaces under a shared authenticated shell:

- `/admin`: head-office management and website administration.
- `/operations`: store-level daily execution.

Use nested routes rather than a tab-driven single page.

```text
/staff-login
/admin
  /dashboard
  /catalog/products
  /catalog/categories
  /catalog/brands
  /catalog/attributes
  /catalog/media
  /merchandising/promotions
  /merchandising/collections
  /merchandising/homepage
  /content/pages
  /content/navigation
  /content/seo
  /commerce/orders
  /commerce/returns
  /commerce/deliveries
  /commerce/payments
  /customers
  /customers/segments
  /customers/loyalty
  /stores
  /inventory/overview
  /inventory/batches
  /inventory/adjustments
  /procurement/suppliers
  /procurement/purchase-orders
  /procurement/receiving
  /organization/staff
  /organization/roles
  /reports
  /audit
  /settings
/operations
  /dashboard
  /pos
  /orders
  /inventory
  /receiving
  /transfers
  /shifts
  /reconciliation
  /devices
```

The route tree may hide unavailable modules by permission and feature flag, but server authorization must remain authoritative.

## 5. Information Architecture and Module Requirements

### 5.1 Internal dashboard

Provide a role-specific dashboard, not one universal dashboard.

Head-office cards:

- Gross sales, net sales, order count, average order value.
- Online versus store sales.
- Orders awaiting action, failed payments, return requests.
- Low-stock and expiring-stock counts.
- Promotion performance.
- Top products/categories/stores.
- Open support cases, security alerts, and system health.

Store dashboard:

- Current shift and register state.
- Today’s sales and tender summary.
- Pickup/delivery orders requiring action.
- Low stock, expiring batches, pending receiving, pending transfers.
- Cash variance and unresolved operational alerts.

Every metric must show scope, time range, source freshness, and comparison period. Never show fabricated data.

### 5.2 Catalog management

Staff must be able to:

- Create, edit, duplicate, archive, and publish products.
- Manage SKU, barcode, brand, category hierarchy, descriptions, images, dimensions, tax class, dietary/type attributes, tags, specifications, SEO fields, and publication state.
- Manage regular price, sale price, member price, unit price, effective dates, and store/channel-specific pricing.
- Assign products to categories and merchandising collections.
- Validate required fields before publication.
- Preview the product detail page before publishing.
- Bulk import/export products through validated CSV with an error report and dry-run stage.
- Perform bulk publish, archive, category assignment, and price changes with confirmation.

The public storefront currently reads static mock data. Replace that dependency only after the catalog APIs expose a storefront-compatible read model. Provide a safe fallback during migration.

### 5.3 Website and content management

Provide interfaces for:

- Homepage hero and supporting campaign cards.
- Homepage category ordering and featured product collections.
- Navigation and mega-menu hierarchy.
- Editorial campaign sections and promotional banners.
- Static pages such as About, Sustainability, Careers, Help, Terms, and Privacy.
- SEO title, description, canonical URL, indexability, and social image.
- Draft, review, scheduled, published, expired, and unpublished states.
- Preview links and revision history.

Do not create a free-form page builder in the first release. Use typed content blocks with schema validation to protect the storefront layout.

### 5.4 Promotions and merchandising

Support:

- Percentage, fixed-price, multibuy, bundle, cart-threshold, member, category, and store-specific offers.
- Start/end scheduling and timezone handling.
- Eligibility, usage limits, customer segments, channels, stores, and product scope.
- Conflict detection and promotion priority.
- Approval workflow for high-impact promotions.
- Preview of customer-facing labels and calculated price.
- Post-launch performance reporting.

### 5.5 Orders, fulfilment, returns, and payments

Order workspace requirements:

- Search by order number, customer, phone, store, status, payment state, and date.
- Timeline containing order, payment, fulfilment, refund, and staff events.
- Pick/pack/ready/dispatch/deliver/cancel transitions with allowed-state validation.
- Delivery and pickup details.
- Item substitution and stock-reservation visibility.
- Printable pick list, packing slip, and invoice where legally applicable.
- Return/refund initiation with reason, item condition, refund destination, and approval.
- Payment failure and reconciliation queues.
- No direct arbitrary order-status edits.

### 5.6 Inventory and procurement

Inventory requirements:

- Inventory by store/product with available, reserved, damaged, in-transit, and on-hand quantities.
- Stock adjustment with reason code, evidence/note, permission, and audit event.
- Low-stock, out-of-stock, negative-stock, and expiry queues.
- Batch/lot and expiry tracking.
- Transfer request, approval, dispatch, receipt, and discrepancy workflow.
- Supplier records, catalogs, payment terms, status, and contacts.
- Purchase-order drafting, approval, sending, receiving, partial receiving, and closure.
- Receiving workflow with quality check and discrepancy capture.

Replace all implicit “first store/product/supplier” behavior with explicit searchable selectors and server-validated IDs.

### 5.7 Store administration

Support:

- Store profile, address, coordinates, timezone, currency, locale, tax regime, contact details, opening hours, holidays, and services.
- Delivery/pickup availability and service zones.
- Store publication state for the public store finder.
- Registers, POS devices, peripherals, and offline-sync health.
- Store-specific inventory, pricing, promotions, and staffing.

### 5.8 Customer service and loyalty

Support:

- Customer lookup with masked sensitive data by default.
- Profile, addresses, orders, returns, loyalty balance, consent, and support history.
- Notes with author and timestamp.
- Customer segmentation and promotion eligibility.
- Loyalty adjustments requiring reason and elevated permission.
- Data export/deletion request workflow.
- Strict separation between support permissions and full customer-data access.

### 5.9 Staff, roles, and permissions

Replace coarse path-prefix authorization with capability-based authorization.

Initial roles:

- Platform administrator.
- Head-office administrator.
- E-commerce manager.
- Catalog manager.
- Merchandiser.
- Customer-support agent.
- Finance/reconciliation user.
- Compliance auditor.
- Regional manager.
- Store manager.
- Inventory controller.
- Receiving clerk.
- Cashier.

Capability examples:

- `catalog.read`, `catalog.write`, `catalog.publish`.
- `pricing.read`, `pricing.write`, `pricing.approve`.
- `orders.read`, `orders.fulfil`, `orders.cancel`, `refunds.request`, `refunds.approve`.
- `inventory.read`, `inventory.adjust`, `transfers.request`, `transfers.approve`.
- `staff.read`, `staff.manage`, `roles.manage`.
- `reports.financial`, `customers.pii`, `audit.read`, `settings.manage`.

Permissions must also include scope: organization, region, assigned stores, or own register. Enforce permissions in backend handlers and filter data queries by scope. Hiding navigation is not authorization.

### 5.10 Reports, audit, compliance, and system health

Provide:

- Sales, inventory, promotion, order, fulfilment, customer, loyalty, supplier, reconciliation, and tax reports.
- Saved filters and CSV export subject to permission.
- Immutable audit-event viewer with actor, entity, before/after values, IP, timestamp, and correlation ID.
- Security incident queue and assignment workflow.
- Integration health, sync status, background-job failures, payment-webhook health, and cache status.
- Country-specific tax/compliance modules behind feature flags.

## 6. Shared UX System

Build an internal design system distinct from the customer storefront while retaining NOVA MART brand recognition.

Required reusable components:

- `AdminShell`, `Sidebar`, `Topbar`, `CommandSearch`, `Breadcrumbs`.
- `PermissionGate` for presentation only; server checks remain required.
- `DataTable` with server pagination, sorting, filtering, column controls, row selection, and empty/error/loading states.
- `FilterBar`, `DateRangePicker`, `StoreSelector`, `StatusBadge`.
- `FormField`, `FormSection`, `CurrencyInput`, `ProductPicker`, `StaffPicker`.
- `Drawer`, `Dialog`, `ConfirmationDialog`, `UnsavedChangesGuard`.
- `MetricCard`, `ChartCard`, `ActivityTimeline`, `AuditDiff`.
- `BulkActionBar`, `ImportWizard`, `ExportDialog`.
- `Toast`, inline validation, retry state, skeleton, and permission-denied state.

Desktop should prioritize information density. Store operations must work well on tablets. Critical actions require clear labels, not icon-only controls.

## 7. Technical Architecture

### Frontend rules

- Use Server Components for route shells and initial data wherever practical.
- Use Client Components only for interactive tables, filters, editors, charts, and dialogs.
- Create a typed API client under `frontend/src/lib/admin-api` rather than scattering raw `fetch` calls.
- Define shared domain types and Zod response schemas. Do not use `Record<string, unknown>` for domain records.
- Use route-level `loading.tsx`, `error.tsx`, and appropriate not-found states.
- Use URL search parameters for table filters, pagination, and sorting so views are shareable.
- Use Server Actions only when they provide a clear benefit; authenticate and authorize them exactly like API routes.
- Keep the internal shell out of the public storefront layout using route groups or dedicated layouts.

### Backend rules

- Centralize authentication and capability checks in a reusable authorization plugin.
- Add `GET /api/operations-auth/session` as the canonical session/bootstrap endpoint, returning safe profile, role, capabilities, scopes, store assignment, and feature flags.
- Remove duplicate/inconsistent JWT verification in nested route modules.
- Add pagination, filtering, sorting, and stable response envelopes to list endpoints.
- Add idempotency keys for sensitive mutations where retries could duplicate actions.
- Add optimistic concurrency/version checks for catalog, promotion, order, and configuration updates.
- Record audit events automatically for all administrative mutations.
- Return stable machine-readable error codes alongside safe messages.
- Never expose password hashes, encryption keys, secret material, complete payment credentials, or unnecessary PII.

Suggested response envelope:

```ts
type ApiListResponse<T> = {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  meta?: { generatedAt: string; storeId?: string; currency?: string };
};
```

## 8. Security Requirements

- Require strong production `JWT_SECRET` and `COOKIE_SECRET`; application startup must fail when defaults are used in production.
- Retain HTTP-only, secure, same-site cookies and add CSRF protection for mutations.
- Implement MFA for administrators, finance, compliance, and staff-management roles.
- Implement session rotation, idle timeout, absolute timeout, forced logout, and password-reset flow.
- Rate-limit authentication and sensitive operations.
- Require re-authentication or step-up MFA for role changes, large refunds, high-value price changes, key rotation, and destructive actions.
- Use approval workflows for refunds, price changes, promotions, inventory write-offs, supplier approval, and staff privilege elevation according to configured thresholds.
- Implement field-level PII masking and access logging.
- Make destructive operations recoverable where possible; prefer archive/deactivate over delete.
- Test horizontal privilege boundaries between stores and vertical privilege boundaries between roles.

## 9. Work Packages and Coding Order

### WP0 — Architecture and market configuration

Deliverables:

- Architecture decision record for India-only versus multi-country operation.
- Canonical organization/store configuration model.
- Currency, locale, timezone, tax-regime, and payment-provider configuration.
- Route inventory and API contract matrix.
- Feature-flag strategy.

Acceptance:

- No new admin screen hardcodes INR/NPR, GST/IRD, or a payment provider.
- Every existing API domain is classified as usable, requires extension, or country-disabled.

### WP1 — Authentication, authorization, and internal shell

Deliverables:

- Hardened staff authentication and session bootstrap.
- Capability and scope model with database migration.
- Backend authorization helpers and tests.
- `/admin` and revised `/operations` layouts.
- Role-aware sidebar, top bar, store switcher, command search, account menu.
- Unauthorized, expired-session, and feature-disabled states.

Acceptance:

- Direct URL access is denied server-side without required capability.
- Store-scoped users cannot request another store’s data.
- Public storefront routes remain unaffected.
- Keyboard navigation and WCAG-conscious focus behavior pass.

### WP2 — Admin dashboard and shared data components

Deliverables:

- Role-aware dashboards.
- Reusable server-driven data table and filters.
- Shared form, dialog, status, activity, and error-state components.
- Dashboard aggregation endpoints where necessary.

Acceptance:

- Dashboard values identify scope and freshness.
- Loading, empty, partial-error, and retry states are implemented.
- Tables support accessible keyboard operation and responsive tablet layouts.

### WP3 — Catalog and website management

Deliverables:

- Product, category, brand, attribute, media, price, and publication workflows.
- Typed homepage/navigation/content configuration.
- Preview and revision history.
- CSV import/export with dry run.
- Storefront catalog read model and gradual migration from mock data.

Acceptance:

- A catalog manager can create a draft, preview it, publish it, and see it on the storefront.
- Invalid/incomplete products cannot be published.
- Changes are audited and safely reversible through revision restoration or archive.

### WP4 — Promotions and merchandising

Deliverables:

- Promotion creation, eligibility, scheduling, conflict checking, approval, and reporting.
- Collections and homepage merchandising assignments.
- Customer-facing promotion preview.

Acceptance:

- Price calculation is identical between preview, cart, and order creation.
- Conflicting or expired promotions cannot silently publish.

### WP5 — Orders, fulfilment, returns, and customer service

Deliverables:

- Order queue/detail/timeline.
- Pickup, delivery, cancellation, substitution, return, and refund workflows.
- Customer support workspace with scoped PII.
- Notification and support-case integration.

Acceptance:

- Every transition follows an explicit state machine.
- Refund approval thresholds and audit records are enforced.
- Support agents cannot access unrelated financial or staff controls.

### WP6 — Inventory, procurement, and store operations

Deliverables:

- Inventory overview, batch/expiry, adjustments, transfer lifecycle.
- Supplier, purchase-order, and receiving workflows.
- Shift, tender reconciliation, devices, and sync health.
- Replace the current monolithic operations prototype with routed modules.

Acceptance:

- All mutations use explicit store/product/supplier selection.
- Inventory movements reconcile across available, reserved, and in-transit quantities.
- Store staff can complete their primary workflows on a tablet.

### WP7 — Organization, staff, reports, audit, and compliance

Deliverables:

- Staff lifecycle, roles, capabilities, scopes, MFA administration.
- Reports and permission-controlled exports.
- Audit viewer, incidents, observability, integration status.
- Country-specific compliance areas.

Acceptance:

- Privilege changes require step-up authentication and are audited.
- Auditors receive read-only access.
- Export permissions and PII masking are enforced.

### WP8 — Production hardening and rollout

Deliverables:

- Unit, integration, contract, and end-to-end tests.
- Accessibility review.
- Performance and query profiling.
- Security testing and dependency audit.
- Operational runbooks, training guides, staged rollout, monitoring, and rollback plan.

Acceptance:

- Build, lint, typecheck, and all tests pass.
- No critical/high authorization findings remain.
- Core admin pages meet agreed performance budgets.
- Pilot staff complete defined workflows without developer intervention.

## 10. Testing Strategy

### Unit tests

- Authorization decisions and scope resolution.
- Currency/tax configuration.
- Promotion calculations and conflicts.
- Order transition rules.
- Inventory movement calculations.
- Form schemas and response parsers.

### Backend integration tests

- Login, logout, expiry, MFA, and session rotation.
- Role/capability/store-scope matrix.
- Catalog draft-to-publish workflow.
- Promotion approval and price calculation.
- Order fulfilment/return/refund lifecycle.
- Purchase-order/receiving/inventory reconciliation.
- Audit generation for mutations.

### Browser end-to-end tests

- Admin login and role-appropriate redirect.
- Product create → preview → publish → storefront verification.
- Promotion create → approval → storefront/cart verification.
- Web order → pick → ready → fulfilled.
- Transfer request → approval → dispatch → receiving.
- Staff creation → role assignment → access verification.
- Session expiry and permission-denied behavior.
- 390px, tablet, laptop, and 1440px layouts.

### Non-functional tests

- WCAG 2.2 AA checks on critical workflows.
- API load testing for dashboards, search, and order queues.
- SQL query-plan review for large list endpoints.
- CSRF, IDOR/store-boundary, privilege-escalation, session, and brute-force tests.

## 11. Definition of Done for Every Module

A module is not complete until it has:

- Server-enforced authorization and scope filtering.
- Typed request/response contracts and Zod validation.
- List, detail, create/edit, and lifecycle actions required by the workflow.
- Loading, empty, error, retry, unauthorized, and success states.
- Pagination/filtering for potentially large datasets.
- Audit events for mutations.
- Accessible keyboard and screen-reader behavior.
- Responsive tablet and desktop behavior.
- Unit/integration tests and at least one browser happy-path test.
- Documentation for permissions, workflow, configuration, and support.

## 12. Coding-Agent Guardrails

- Inspect the relevant service, route, schema, and existing tests before changing a domain.
- Preserve unrelated storefront, account, backend, and database behavior.
- Do not implement the whole system in one client component.
- Do not bypass APIs with direct frontend database access.
- Do not rely on hiding buttons for authorization.
- Do not use mock metrics in production routes.
- Do not expose all records and filter only in the browser.
- Do not silently change financial, stock, order, or permission data.
- Do not hard-delete business records unless retention requirements explicitly permit it.
- Do not use generic `Record<string, unknown>` domain models.
- Use migrations for schema changes and make them reversible when practical.
- Keep each work package independently buildable, testable, and reviewable.

## 13. Recommended First Coding Sprint

Implement only WP0 and WP1 first.

Sprint sequence:

1. Resolve market/multi-country decision and record it.
2. Create endpoint/capability/scope matrix.
3. Add capability and store-scope migrations.
4. Refactor backend authentication/authorization and add matrix tests.
5. Extend the session endpoint with safe user/capability/feature data.
6. Create separate authenticated layouts for `/admin` and `/operations`.
7. Build role-aware navigation and permission-denied states.
8. Redirect login by role and last permitted workspace.
9. Verify direct-route denial, cross-store isolation, session expiry, desktop, and tablet behavior.

Do not begin catalog or order UI development until this security and navigation foundation passes its acceptance criteria.
