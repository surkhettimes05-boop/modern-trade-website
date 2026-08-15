# Phase 05 — Storefront Unification

## Objective

Make all customer-facing commerce use one authoritative backend catalog and persistent cart.

## Work packages

- [x] Remove the hard-coded runtime catalog as an authority.
- [x] Connect homepage, shop, search, categories, details, offers, and recommendations to backend data.
- [x] Implement store selection and persisted location state.
- [x] Show store hours, services, stock, pickup, and delivery eligibility where backend data exists.
- [x] Connect search, filters, and sorting to the loaded backend catalog.
- [x] Implement persistent anonymous browser cart storage and backend cart pricing boundary.
- [ ] Merge carts after login; customer login/session contract remains a Phase 06 dependency.
- [x] Revalidate price and stock on cart mutations server-side.
- [x] Keep wishlist/save-for-later controls visibly non-authoritative until customer wishlist APIs are connected.
- [x] Replace placeholder store listing/map controls with backend store details and directions links.

## Acceptance gate

- [x] Product identity, price, image, and availability are sourced from the backend storefront catalog.
- [x] Cart survives refresh; login merge remains a follow-up dependency.
- [x] Search, category filters, and sorting operate on backend-loaded data.
- [x] Store selection and directions controls are wired; wishlist and checkout remain explicitly bounded by available APIs.

Phase boundary: storefront catalog, store selection, product availability/pricing, backend-price-validated cart mutations, and customer-facing route data are unified. Customer login cart merge, checkout, wishlist persistence, and browser/E2E validation remain release-gate follow-up work.
