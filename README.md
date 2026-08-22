# StoreSync — Nepal production pilot

StoreSync is a Next.js 16 and Fastify retail platform prepared for an initial Nepal pilot. Nepal is the only certified active market. India remains represented in the market registry for future expansion, but startup validation rejects India activation for this release.

The controlled Nepal loyalty MVP is active. OTP-verified customers can enroll and view their own balance/history at `/loyalty`; completed POS sales and delivered COD orders earn 1 point per authoritative NPR 100. Scoped staff can redeem points against a completed POS sale. See [docs/LOYALTY_MVP.md](docs/LOYALTY_MVP.md) for the ledger, reversal, reconciliation, API, recovery, and release-gate contract.

## Pilot market

| Setting | Active value |
|---|---|
| Country | Nepal (`NP`) |
| Currency | Nepalese rupee (`NPR`) |
| Locale | `en-NP` |
| Timezone | `Asia/Kathmandu` |
| Tax labels | IRD/VAT |
| Customer phone | Nepal mobile (`+977`, prefixes 96–99) |
| Address | Nepal province, district, municipality, ward, tole/locality |
| Checkout payment | Cash on delivery only |
| POS tender | Cash |

The backend source of truth is `backend/src/config/market.ts`; the browser-safe display contract is `frontend/src/lib/market.ts`. Production must explicitly set every market variable shown in `backend/.env.production.example`. Contradictory values fail startup.

## Certified pilot scope

Enabled: public website, catalog/search/filter, store selection, customer account and OTP flow, cart, COD checkout, pickup/delivery selection, order history/detail/cancellation, staff login/logout, role/store-scoped admin and operations, basic cash POS and shifts, inventory, procurement, staff, content/catalog, audit and required operational support.

Deferred and fail-closed: eSewa, Khalti, Fonepay, card payments, electronic refunds/reconciliation, loyalty, returns workflow, advanced analytics, customer segments, promotion engine, external IRD integration, fiscal signatures/compliance integration, offline sync/devices, and external CMS/CDN integrations. Their code is retained but their production routes and navigation are not registered.

## Render deployment

Use the root `render.yaml` Blueprint and then complete the prompted values in
**Render Dashboard → Service → Environment**. The Blueprint supplies the fixed
Nepal market configuration and generates most secrets. The operator must
provide `DATABASE_URL`, the HTTPS `APP_URL` and `CORS_ORIGIN`, and an exactly
64-character hexadecimal `PAYMENT_ENCRYPTION_KEY`. See
[`backend/DEPLOYMENT.md`](backend/DEPLOYMENT.md) for the full variable groups,
optional integration rules, migration startup behavior, and health checks.

## Local development

Prerequisites: Node.js 22+, PostgreSQL 14+, and a Redis 7-compatible service.

```bash
cd backend
npm ci
copy .env.example .env
npm run db:migrate
npm run seed
npm run dev
```

```bash
cd frontend
npm ci
copy .env.example .env.local
npm run dev
```

Never commit populated `.env` files. Use the existing migration manifest and runner; do not apply SQL files manually or create a second migration path.

## Release verification

Static and unit gates: `npm run qa:release`.

Disposable PostgreSQL/Redis/container certification: `npm run qa:certify`.

Native Windows QA, when PostgreSQL, Memurai and Playwright browsers are installed: `npm run qa:local`.

The Compose stack performs a backup before migration, applies the canonical migration manifest, seeds Nepal data, waits for PostgreSQL and Redis health, and does not start the frontend until backend readiness passes. Readiness checks database connectivity, migration 020, and Redis. Liveness is `/api/health/live`; integration state is `/api/health/integrations`.

See `implementation/RELEASE_GATE.md`, `docs/PRODUCTION_RECOVERY_RUNBOOK.md`, and `docs/PAYMENT_EXTERNAL_REQUIREMENTS.md` before approving a pilot release. A command is not certified until its result is recorded in the release evidence.
