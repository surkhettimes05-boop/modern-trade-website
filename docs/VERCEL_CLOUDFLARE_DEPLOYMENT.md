# Vercel frontend + Cloudflare Workers backend

This repository is configured for a Next.js frontend on Vercel and a Fastify API on Cloudflare Workers. The frontend keeps the Cloudflare URL server-side in `API_URL` and proxies browser requests through same-origin Next.js route handlers, so authentication cookies remain first-party.

## 1. Prepare PostgreSQL

Cloudflare Hyperdrive accelerates a PostgreSQL database; it does not create the database. Create a PostgreSQL database (a free managed plan is sufficient for a pilot), then create the two least-privilege roles described in `database/production_roles.sql`.

Run migrations with the migration role from a trusted machine or CI environment:

```bash
cd backend
npm ci
npm run build
NODE_ENV=production \
DATABASE_URL='postgresql://storesync_app:.../storesync' \
MIGRATION_DATABASE_URL='postgresql://storesync_migrator:.../storesync' \
DATABASE_RUNTIME_ROLE=storesync_app \
DATABASE_MIGRATION_ROLE=storesync_migrator \
DATABASE_SSL=true \
npm run deploy:migrate
```

Migration `029_pgcrypto_password_runtime` enables PostgreSQL `pgcrypto`. The migration role must be allowed to create this extension. Password hashing is deliberately performed by PostgreSQL because native Node bcrypt addons cannot run in Workers.

## 2. Create Hyperdrive

Authenticate Wrangler, then create Hyperdrive using the runtime-role connection string:

```bash
cd backend
npx wrangler login
npx wrangler hyperdrive create storesync-db \
  --connection-string='postgresql://storesync_app:.../storesync'
```

Copy the returned configuration id into `backend/wrangler.jsonc`, replacing the all-zero `HYPERDRIVE` id.

## 3. Configure the Worker

In `backend/wrangler.jsonc`, replace `CORS_ORIGIN` and `APP_URL` with the exact Vercel production origin, with no trailing slash.

Add the required secrets. Use a unique value for every secret:

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put COOKIE_SECRET
npx wrangler secret put ENCRYPTION_KEY
npx wrangler secret put SIGNATURE_SECRET
npx wrangler secret put OTP_HASH_SECRET
npx wrangler secret put PAYMENT_ENCRYPTION_KEY
```

`PAYMENT_ENCRYPTION_KEY` must be exactly 64 hexadecimal characters. The other five values must each be at least 32 bytes. Configure Twilio secrets only when SMS OTP delivery is enabled.

Validate and deploy:

```bash
npm run worker:types
npm run worker:type-check
npm run worker:check
npm run worker:deploy
```

The committed rate-limit bindings provide a general 100 requests/minute limit and a stricter 10 authentication requests/minute limit. The Worker does not require Redis; PostgreSQL-backed sessions and Cloudflare rate limiting remain distributed.

## 4. Deploy the frontend to Vercel

Import the GitHub repository into Vercel and set **Root Directory** to `frontend`. Vercel will detect Next.js and use `frontend/vercel.json`.

Add these Production and Preview environment variables:

```text
API_URL=https://storesync-api.<your-subdomain>.workers.dev
API_UPSTREAM_TIMEOUT_MS=8000
NEXT_PUBLIC_SITE_URL=https://your-project.vercel.app
NEXT_PUBLIC_ACTIVE_MARKET=NP
```

Do not create `NEXT_PUBLIC_API_URL` in Vercel. `API_URL` must remain server-only so browsers use the same-origin proxy.

After the first Vercel deployment, update `CORS_ORIGIN`, `APP_URL`, and `NEXT_PUBLIC_SITE_URL` to the final custom domain if one is attached, then redeploy both services.

## 5. Smoke test

```bash
curl -i https://storesync-api.<your-subdomain>.workers.dev/api/health/live
curl -i https://storesync-api.<your-subdomain>.workers.dev/api/health/ready
curl -i https://your-project.vercel.app/api/health/live
```

The first and third endpoints should return `200`; readiness should report the database and migration as current. Test staff login through the Vercel URL to confirm first-party cookies and CSRF handling.

## Free-tier operating note

The dry-run Worker bundle is below the free-plan compressed-size limit. The free Workers plan has tight per-request CPU limits, so this full Fastify application is suitable for a low-traffic pilot but should be monitored for CPU-limit exceptions and cold-start pressure. Upgrade the Worker plan if real traffic exceeds those limits; the code and deployment configuration remain the same.
