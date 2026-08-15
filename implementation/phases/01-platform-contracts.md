# Phase 01 — Platform Contracts and Configuration

## Objective

Create consistent API, entity, market, and seed contracts before building more UI.

## Work packages

- [x] Define shared error, pagination, filtering, sorting, date, and currency contracts.
- [x] Create shared schemas/types for customer, staff session, product, store, inventory, cart, order, payment, supplier, transfer, shift, and capabilities.
- [x] Align frontend API clients with shared contracts.
- [x] Remove Nepal/India and NPR/INR inconsistencies for the selected market.
- [x] Create canonical development seed tooling.
- [x] Seed stores, roles, staff, products, inventory, suppliers, content, and sample customers.
- [x] Document environment variables and safe defaults.

## Acceptance gate

- [x] Frontend and backend agree on field names and response shapes.
- [x] Fresh local setup creates a usable environment.
- [x] Currency, phone, address, time zone, and locale are consistent.
- [x] API errors include stable codes and request identifiers.

Evidence: `backend/src/contracts/platform.ts`, `backend/src/utils/pagination.ts`, `backend/src/database/seed.ts`, `backend/src/database/migrations.json`, `backend/.env.example`, and the Phase 01 verification recorded in `implementation/STATUS.md`.
