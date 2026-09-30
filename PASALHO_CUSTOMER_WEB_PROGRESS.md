# Pasalho Customer Web Migration Progress

Branch: `feat/pasalho-customer-web-refresh`
Draft PR: #46 — Migrate customer storefront to Pasalho commerce UX

## Goal

Turn the existing customer-facing StoreSync/NOVA website into a Pasalho customer storefront that uses Pasalho OS as the customer-commerce source of truth, while keeping useful release-hardening and staff/admin functionality intact during migration.

## Completed

- Pasalho branding replaces NOVA MART on customer-facing surfaces.
- Customer commerce API proxy routes `/api/commerce/*` to Pasalho OS `/api/v1/commerce/*`.
- Legacy StoreSync API remains isolated for staff/admin/operations routes during migration.
- Store/serviceability context is resolved against Pasalho fulfillment locations.
- Product catalog and categories are loaded from Pasalho store-scoped commerce APIs.
- Customer search uses Pasalho store-scoped search.
- Customer cart uses Pasalho server-side cart APIs.
- Add/update/remove quantity actions are server-authoritative.
- Cart is restored using the Pasalho cart token.
- Customer home UX was simplified into fast location → search → add → cart flows.
- Product cards use compact quick-commerce actions with inline ADD / quantity controls.
- Customer cart page was reworked around Pasalho fulfillment context.
- Account/checkout/order effects were stabilized to avoid premature client-side initialization.
- Customer journey, SEO, route scans, location permission and homepage performance checks were added or updated.
- Public customer copy and metadata were migrated from NOVA/StoreSync toward Pasalho.

## Current architecture

```
Pasalho OS (NestJS + Prisma + PostgreSQL)
        ↓
/api/v1/commerce
        ↓
Next.js same-origin /api/commerce proxy
        ↓
Pasalho customer website
```

Legacy StoreSync backend is retained temporarily only where staff/admin/operations routes still depend on it.

## In progress

- Final CI / release-gate cleanup for the customer-web migration.
- Checkout/auth compatibility against Pasalho customer JWT/session contracts.
- Product/category detail correctness against live Pasalho catalog.
- Removal of stale legacy customer assumptions and hard-coded merchandising copy.
- Mobile/responsive UX polish.
- Accessibility/performance regression cleanup.
- Final exact-artifact verification before merge.

## Not started in this branch

- Flutter app migration to Pasalho OS.
- CEO dashboard integration.
- POS integration.
- Sales-rep integration.

## Merge condition

Do not merge until:
1. frontend lint passes;
2. frontend type-check passes;
3. frontend production build passes;
4. relevant browser/customer journey tests pass;
5. no customer-facing route depends on legacy StoreSync commerce for inventory, price, cart, checkout or order truth.
