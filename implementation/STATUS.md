# Implementation Status

Last updated: 2026-08-14

Active market: Nepal — NPR, `en-NP`, `Asia/Kathmandu`, IRD/VAT; COD customer checkout and cash POS.

## Baseline

| Check | Status | Evidence |
|---|---|---|
| Backend Jest | PASS | 19 suites / 183 tests |
| Backend typecheck | PASS | `npm run type-check` |
| Backend build | PASS | `npm run build` |
| PostgreSQL migrations | PASS | Clean and idempotent through migration 016; Nepal seed and market conversion migration added |
| Frontend build | PASS | 24 generated routes including framework routes |
| Frontend lint | PASS WITH WARNINGS | 19 warnings |
| Backend lint | PASS WITH WARNINGS | 470 warnings |

## Phase tracker

| Phase | State | Blockers / notes |
|---:|---|---|
| 00 Baseline and scope | COMPLETE WITH RISKS | Nepal/NPR MVP supersedes the original India decision; migration adoption, staff bootstrap, admin UI, and E2E coverage remain release risks |
| 01 Platform contracts | COMPLETE WITH RISKS | Canonical Nepal contracts, phone validation, market migration, and seed tooling added; existing legacy provider adapters and broad route/UI adoption remain for later phases |
| 02 Staff authentication | COMPLETE WITH RISKS | Database-backed staff sessions, lockout/revocation/idle expiry, CSRF, bootstrap-admin, protected layouts, and capability navigation implemented; browser/E2E verification and full route mutation audit remain |
| 03 Admin MVP | COMPLETE WITH RISKS | Protected live-data admin workbench, dashboard, resource routes, search/create surfaces, capability states, and no-404 catch-all implemented; destructive confirmation, audit drawer, and browser/E2E coverage remain |
| 04 Operations | COMPLETE WITH RISKS | Route-complete live operations workbench, redirect, device registration, capability gates, and explicit store-scope enforcement; browser/E2E workflow verification and full DB isolation audit remain |
| 05 Storefront | COMPLETE WITH RISKS | Backend-authoritative catalog/pricing/availability, store selection, real product/category/search surfaces, persistent browser cart, and server-side cart revalidation implemented; login cart merge, checkout, wishlist APIs, and browser/E2E coverage remain |
| 06 Checkout/orders | COMPLETE WITH RISKS | Authenticated COD checkout, idempotency, transactional price/stock validation, reservations, order events, customer order history/detail/cancellation, and lifecycle boundary implemented; promotions, returns/support, staff fulfillment, and browser/concurrency verification remain |
| 07 Integrations | COMPLETE WITH RISKS | Fail-closed provider validation, webhook safety, notification dead letters, map credential gating, migration 014, and runbook added; certified external providers remain deferred |
| 08 Analytics/audit | COMPLETE WITH RISKS | Inventory event processing, targeted projection refresh, metric contract, tamper-evident audit search/export, retention policy, and provisional compliance labeling added; live reconciliation and professional tax review remain |
| 09 Testing/quality | COMPLETE WITH RISKS | CI quality workflow, frontend type-check, repeatable backend tests/coverage commands, dependency audit, and critical-journey matrix added; browser E2E, accessibility, secret scanning, and lint cleanup remain |
| 10 Deployment | COMPLETE WITH RISKS | Four-service compose architecture, canonical migration/backup entrypoint, readiness health, structured logs, immutable GHCR image workflow, and recovery runbook added; infrastructure restore/rollback drills remain |
| 11 Release gate | COMPLETE — NOT READY | Formal gate assessment and evidence matrix recorded; browser E2E, restore/rollback, alerts, live reconciliation, provider/tax review, and security closure remain blockers |

## Current highest-priority slice

1. Decide the initial market and release scope.
2. Repair staff session contracts.
3. Add secure administrator bootstrap.
4. Enforce protected admin and operations layouts.
5. Implement `/admin/dashboard`.
