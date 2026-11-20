# PASALHO staging handoff — Vercel + Render + Neon

Status: **configuration preparation only (20 November 2026)**. No cloud resource or production URL was created, no database was migrated, and no order was placed by this document. Keep the associated PR unmerged pending review.

## Deployment map

| Component | Intended staging service | Boundary |
| --- | --- | --- |
| Modern Trade Next.js customer website (`frontend/`) | Vercel Preview, **only if the account plan permits the use** | Server-side `/api/*` proxy; never give PostgreSQL credentials to Vercel |
| Modern Trade Fastify API (`backend/`) | Render Docker Web Service | Public HTTPS endpoint, production-mode configuration |
| Modern Trade cache/queue | Render Key Value (Redis-compatible) | Private network; free instances are **volatile** |
| Modern Trade PostgreSQL | Separate Neon PostgreSQL project/database | Application and migration identities must be distinct |
| Pasalho Lite | **One** complete Next.js application, not a standalone frontend plus new backend | Its own **separate** Neon PostgreSQL project/database; calls the Modern pricing API over authenticated HTTPS |

Do **not** share the two applications' databases or introduce a new Lite microservice. Modern Trade owns member pricing/creator reward logic. Lite owns POS stock, money and loyalty records and must use the Modern Trade authoritative pricing and signed-event interfaces.

## Free-plan boundaries (evaluation, not commercial launch)

- Vercel's **Hobby** terms restrict it to personal, non-commercial use. PASALHO is a commercial retail project: do not treat a Hobby deployment as approved for customer-facing trade, even if technically functional. Verify Vercel's permission/plan before a business staging Preview or choose another permitted frontend host. https://vercel.com/docs/plans/hobby
- Render Free Web Services sleep after 15 minutes idle and may take about one minute to resume. Existing Vercel proxy requests have a shorter timeout; first-load errors are expected after sleep. Render itself says Free instances are not for production applications. https://render.com/docs/free
- Render Free Key Value stores data only in memory; a restart loses it. One Free instance per workspace can also prevent creating a second isolated copy. Do not rely on this for durable queues, settlement, or live creator payout events. https://render.com/docs/key-value
- Neon Free is useful for testing, not an adequate independent recovery policy for operating a store. As of October/November 2026, free projects have 1 GB PostgreSQL storage, 100 CU-hours/month and a 6-hour instant-restore window. Independently test encrypted offsite backup/restore and set retention requirements before accepting real orders. https://neon.com/blog/neon-free-plan-1-gb-per-project
- No paid hosting or international payment gateway is required to review existing green CI. Keep electronic payments disabled, and use only controlled COD tests at first.

## Creation order and operator-supplied values

1. **Choose the staging URLs and provider accounts**, confirm the Vercel plan is permitted, and make sure the existing public Vercel/Render deployments will not be overwritten. The currently reachable website has shown the wrong **NOVA MART** branding and conflicting free-delivery thresholds; do not label it approved PASALHO staging.
2. **Create an isolated Neon Modern Trade project** in a location near Render's selected region. Record its **project ID and public host only** in the review thread; never paste connection strings or passwords into chat, GitHub PRs or screenshots. Create separate `storesync_app` and `storesync_migrator` credentials using `database/production_roles.sql` and verify provider support for all required grants.
3. **Create or select an isolated Render Web Service + private Key Value.** Check the free-instance and Key Value quotas before applying the Blueprint. The Blueprint is `render.yaml`. Runtime `DATABASE_URL` must authenticate as `storesync_app` with TLS; never supply the migration password to the runtime service. The one-time migration job must receive `MIGRATION_DATABASE_URL` as `storesync_migrator`.
4. **Configure required secrets only in provider secret stores.** Render requires `DATABASE_URL`, `CORS_ORIGIN`, `CUSTOMER_WEB_URL`, `APP_URL`, `PAYMENT_ENCRYPTION_KEY` (64 hex characters), `PROXY_AUTH_SECRET` (32+ bytes), `MEMBER_PRICING_SERVICE_TOKEN` (32+ bytes; the same token must be provisioned in Lite), plus valid Nepal SMS provider credentials. The Blueprint now declares `MEMBER_PRICING_QUOTE_SECRET` as an individually generated backend-only secret. Generated JWT, cookie, encryption, signature, OTP-hash and quote secrets must remain unique. Review `backend/src/config/environment.ts` and `backend/src/config/integrations.ts` for all startup gates.
5. **Real OTP is a prerequisite for public production-mode staging:** `SMS_PROVIDER=twilio_verify` needs `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_VERIFY_SERVICE_SID`. `SMS_PROVIDER=demo` is rejected in production mode. Keep demo OTP inside isolated CI/local QA; do not expose it on a public Render URL. An equivalent Nepal-capable SMS service needs separate code validation before use.
6. **Run audited migrations once**, after credentials/roles and a recoverable snapshot are verified. Do not run production migration or seed scripts against an unknown existing database. Verify migration count, `npm run verify:database-role`, `/api/health`, `/api/health/ready`, Postgres and Redis readiness.
7. **Configure Vercel website (root directory `frontend/`)**: set server-side `API_URL=https://<render-service>.onrender.com`; set `NEXT_PUBLIC_SITE_URL` to the actual frontend HTTPS origin. Also set server-side `PROXY_AUTH_SECRET` **identical** to the Render value; `frontend/src/lib/proxyClientIdentity.ts` signs forwarded client IP requests with it. Set `CORS_ORIGIN`, `APP_URL` and `CUSTOMER_WEB_URL` on Render to the **exact** approved Vercel origin without a path. Redeploy Preview only after these match. Never expose server-only secrets with a `NEXT_PUBLIC_` prefix.
8. **Deploy Lite separately when desired** as one Next.js server app backed by its own Neon database. It needs an approved HTTPS Modern Trade pricing URL, store UUID and secret token. No Lite host choice is forced by the Modern Trade plan.

## Supervised real-world acceptance gates

Record test operator, environment, build SHA, date/time, unique order/referral IDs (redacted), expected effect, actual effect, and rollback/reconciliation for each.

- [ ] HTTPS, branded PASALHO pages, correct catalog, SKU, stock, tax and free-delivery threshold on desktop and phone
- [ ] Render readiness 200, Neon connection, Redis healthy after wake; no auth/CORS/IP-forwarding errors
- [ ] Genuine Nepal SMS request, receipt and OTP verification from a test customer's consented phone
- [ ] Creator registration with correct six-digit OTP; generate first-party referral link and print QR; scan QR from a second physical phone
- [ ] Referral cookie survives catalog/cart/checkout; controlled COD order captures the intended creator (not another creator) and records **1% of eligible merchandise spend**, subject to the 14-day hold and approved payout policy
- [ ] Operator confirms, packs, dispatches, delivers and cancels test COD orders; reconcile stock, payment/cash and reward/void ledgers; reject duplicate webhook or replayed event
- [ ] Send a real signed Lite POS sale event from a controlled store; verify retries and idempotency in Modern Trade with a matching SKU/price and customer reference
- [ ] Restore an encrypted offsite database backup into a **different** isolated database, verify counts and integrity; practice Redis restart and app redeploy/rollback
- [ ] Check admin MFA, least-privilege database role, TLS certificate validation, audit log, rate limits, alert delivery and operational incident ownership
- [ ] Owner signs off on creator 1% **eligible spend vs profit margin** wording and cash payout controls

**Stop/rollback:** No open public checkout, real money, creator payout, unsolicited SMS or customer-data import until all supervised gates pass and the founder approves the hosting terms and launch date. Keep the existing public site untouched.

## Verified automation before staging

- Modern combined creator code: [QA-only draft PR #98](https://github.com/surkhettimes05-boop/modern-trade-website/pull/98); [full-stack CI #44668305192](https://github.com/surkhettimes05-boop/modern-trade-website/actions/runs/44668305192) passed: 384/384 PostgreSQL-backed tests, 53 migrations and 81 browser checks passed (one configured mobile COD skip). Desktop COD reconciliation passed in disposable containers.
- Pasalho Lite: [CI #44590418201](https://github.com/surkhettimes05-boop/Pasalho-lite/actions/runs/44590418201) passed, 135 tests and isolated backup/restore. PRs #26 and #27 remain review-only.

These are **synthetic release checks**, not evidence that live staging or physical QR/POS/SMS flows have passed.
