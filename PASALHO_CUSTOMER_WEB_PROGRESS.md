# Pasalho Customer Web Migration — Live Progress

Branch: `feat/pasalho-customer-web-refresh`  
Draft PR: #46 — **Migrate customer storefront to Pasalho commerce UX**

## Objective

Convert the existing customer website into the real Pasalho customer storefront while keeping useful operational/admin functionality intact during migration.

Pasalho OS is the customer-commerce source of truth:

```
Pasalho OS
NestJS + Prisma + PostgreSQL
        ↓
/api/v1/commerce
        ↓
Next.js same-origin /api/commerce proxy
        ↓
Pasalho customer website
```

The legacy StoreSync backend remains only for staff/admin/operations functionality that has not yet moved to Pasalho OS.

## Uploaded to GitHub

All work described below is committed to this branch and visible in PR #46.

Current PR footprint before this status update:
- 52 changed files
- 49 commits
- GitHub reports the PR as mergeable
- customer web code, tests, dependency repairs, QA stub and deployment configuration are all in GitHub

## Customer-commerce work completed

### Pasalho backend integration
- Customer `/api/commerce/*` traffic is routed to Pasalho OS `/api/v1/commerce/*`.
- Customer commerce and legacy staff/admin APIs are separated at the proxy boundary.
- Store/serviceability resolution uses Pasalho fulfillment locations.
- Store-scoped catalog and category APIs are used.
- Catalog pagination loads beyond the first 60 SKUs.
- Product detail can resolve against live Pasalho commerce instead of relying only on an initial page.
- Search uses store-scoped Pasalho search.
- Fabricated fallback products/stock were removed.

### Cart and checkout
- Cart uses Pasalho server-side cart APIs.
- Add/update/remove quantity operations are server-authoritative.
- Cart token is restored across reload.
- Cart is scoped to the resolved fulfillment store/service zone.
- Checkout uses Pasalho customer-commerce contracts.
- Checkout keeps delivery coordinates explicit.
- Idempotency is preserved for order placement and cancellation retries.
- Customer order history/detail pages use Pasalho order APIs.
- Active order tracking refreshes automatically.

### Customer auth/session
- Pasalho customer session proxy boundary is implemented.
- OTP/session flows are wired into the website.
- Browser tests cover the real Pasalho proxy/session boundary.
- Protected customer pages are separated from staff authentication.

### UX/UI
- Customer-facing NOVA/StoreSync branding and copy were migrated to Pasalho.
- Homepage was redesigned around:
  location → search → category → inline ADD → cart → checkout.
- Product cards use compact quick-commerce interactions.
- Mobile quick-cart bar added.
- Store/location context is visible to the customer.
- Product/category routes were reworked for live Pasalho data.
- Cart, checkout, account, order and service pages received Pasalho-specific UX cleanup.
- Customer-facing claims were corrected to avoid unsupported delivery/payment/stock promises.
- The UI is Blinkit-inspired in interaction density and shopping speed, but uses Pasalho branding and operational truth.

### SEO, accessibility and QA work
- SEO metadata/customer copy migrated toward Pasalho.
- Catalog pagination/product-detail tests added.
- Pasalho proxy/session security test added.
- Release-gate, accessibility, performance and SEO tests were updated.
- QA uses a Pasalho commerce stub for deterministic browser testing.
- Next.js upgraded to patched 16.3.6.
- Frontend/backend audited dependency lockfiles were repaired.

## Current CI state

### PASS — Quality gates
Latest **Quality gates** workflow: PASS.

The latest build/publish verification also passed all of these before the browser gate:
- security static checks
- backend npm install
- frontend npm install
- backend type-check
- backend tests
- frontend type-check
- frontend lint
- frontend production build
- backend Docker Compose config
- QA Docker Compose config
- final backend/frontend Docker image builds
- non-root runtime-user verification
- Chromium installation

### FAIL — final full-stack Chromium release gate

The final browser gate is the remaining blocker. Current failures are:

1. **Customer COD order E2E**
   - desktop and mobile time out during the final sign-in/checkout path.
   - needs selector/flow correction against the current customer-auth UI and Pasalho QA stub.

2. **Staff sign-in E2E**
   - desktop and mobile remain on `/staff-login` instead of reaching `/operations/dashboard`.
   - staff auth is legacy functionality and must be repaired without reconnecting customer commerce to StoreSync.

3. **Accessibility contrast**
   - homepage has a borderline contrast ratio (~4.47:1 where 4.5:1 is required).
   - fix is CSS-only.

4. **SEO/catalog expectation**
   - test still expects legacy `/category/rice` while the migrated category source no longer guarantees that fabricated category slug.
   - test must validate real Pasalho categories rather than a hard-coded StoreSync opening assortment.

5. **Legacy canonical redirect**
   - one legacy URL expected HTTP 308 but currently returns 404.
   - either restore the intended redirect or remove the obsolete canonical expectation.

6. **Sitemap reachability**
   - seven sitemap URLs are reported as orphaned/deeper than the release rule allows.
   - navigation/sitemap contract must be reconciled.

Current browser summary: **12 failing tests** across desktop/mobile, concentrated in the six categories above.

## Merge condition

PR #46 must remain draft until all of the following are true:

1. Quality gates remain green.
2. Full-stack Chromium desktop/mobile release gate is green.
3. Customer COD order can complete end-to-end against the Pasalho QA commerce boundary.
4. Customer authentication/session behavior is green.
5. No customer inventory, price, cart, checkout or order truth comes from legacy StoreSync.
6. Accessibility serious/critical violations are zero.
7. SEO tests reflect the real Pasalho catalog and canonical route policy.
8. Production build and final Docker images remain green.

## Next execution sequence

1. Fix homepage contrast violation.
2. Fix customer COD E2E timeout.
3. Repair legacy staff-login E2E without touching customer commerce architecture.
4. Replace hard-coded `/category/rice` SEO expectation with real Pasalho catalog behavior.
5. Repair/retire the broken legacy canonical redirect.
6. Fix sitemap reachability/orphan-route test.
7. Rerun the full release gate.
8. Keep PR draft until both workflows are fully green.

## Not part of this branch

These are intentionally separate projects and are not claimed complete here:
- Flutter customer app migration to Pasalho OS
- CEO dashboard integration
- POS integration
- sales-representative integration
