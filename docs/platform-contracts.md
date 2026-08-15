# Platform Contracts and Local Configuration

The Phase 01 runtime contract is India-first: country `IN`, currency `INR`, locale `en-IN`, timezone `Asia/Kolkata`, GST tax context, Indian mobile numbers, and six-digit Indian PIN codes.

Backend contracts live in `backend/src/contracts/platform.ts`. API errors use `error: true`, a stable `code`, human-readable `message`, and `requestId`. Pagination uses `items`, `page`, `pageSize`, `total`, and `totalPages`.

Fresh local setup:

1. Start PostgreSQL and Redis using `backend/docker-compose.yml` or equivalent local services.
2. Copy `backend/.env.example` to `backend/.env` and replace local secrets as appropriate.
3. Run `npm run db:migrate` from `backend/`.
4. Run `npm run seed` from `backend/`.

The seed is repeatable and intended only for local development. It creates India organization/store configuration, roles from the canonical capability migration, local staff, products, inventory, supplier, content, and a sample customer. The local administrator password is documented only in the seed source and must never be used outside local development.
