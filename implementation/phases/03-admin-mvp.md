# Phase 03 — Admin Application MVP

## Objective

Turn the existing admin shell into a usable management application.

## Route work packages

- [x] `/admin/dashboard`
- [x] `/admin/catalog/products`
- [x] `/admin/catalog/categories`
- [x] `/admin/catalog/media`
- [x] `/admin/content/pages`
- [x] `/admin/merchandising/promotions`
- [x] `/admin/commerce/orders`
- [x] `/admin/commerce/returns`
- [x] `/admin/commerce/payments`
- [x] `/admin/customers`
- [x] `/admin/customers/loyalty`
- [x] `/admin/stores`
- [x] `/admin/inventory`
- [x] `/admin/procurement/suppliers`
- [x] `/admin/procurement/purchase-orders`
- [x] `/admin/procurement/receiving`
- [x] `/admin/organization/staff`
- [x] `/admin/organization/roles`
- [x] `/admin/reports`
- [x] `/admin/audit`
- [x] `/admin/settings`

## Shared components

- [x] Data table, search, filters, sort, and pagination
- [x] Accessible forms and field validation
- [x] Loading, empty, error, forbidden, and expired states
- [ ] Confirmation dialog and destructive-action safeguards
- [ ] Audit-history drawer
- [x] Store selector and date/currency controls

## Acceptance gate

- [x] No visible admin navigation link returns 404.
- [x] MVP CRUD uses real APIs and displays validation errors where backend CRUD exists; unsupported surfaces are explicitly marked unavailable.
- [x] Admin mutations use capability checks and existing audit paths; complete route-by-route audit remains a release risk.
- [x] Administrator, manager, and read-only roles are capability-filtered server/client-side; browser verification remains a release risk.

Phase boundary: this phase delivers the protected admin workbench and live resource surfaces. Destructive confirmation dialogs, audit-history drawer, and browser/E2E verification remain explicit follow-up items because their underlying workflows are not yet fully implemented.
