# Backend Deployment Guide

## Environment Variables

Production startup validates all required configuration before connecting to
Redis or opening the HTTP listener. Use `backend/.env.production.example` as
the complete template; never commit populated secrets.

## Docker Deployment

## Render Deployment

The repository includes `render.yaml` for a repeatable Render Blueprint. It
creates the backend Docker Web Service and a private Redis-compatible Key Value
service. Render prompts for the deployment-specific PostgreSQL and frontend
values during initial Blueprint setup.

Review the plan and region in `render.yaml` before creating the Blueprint.

Render can build this repository's `backend/Dockerfile` directly; Docker does
not need to be installed on your laptop.

### 1. Create the data services

The Blueprint creates `storesync-redis`. Supply `DATABASE_URL` for a managed
PostgreSQL database reachable by the Web Service. Use a private/internal URL
when the database shares the Render region; otherwise use the provider's TLS
URL. The deployment migration command requires a PostgreSQL URL and working
TLS certificate validation.

### 2. Create the backend Web Service

Choose **New → Web Service**, connect this repository, and use:

```text
Language: Docker
Dockerfile Path: backend/Dockerfile
Docker Context: repository root (.)
Region: same region as Postgres and Key Value
Health Check Path: /api/health/ready
```

The Node 22 Dockerfile installs `pg_dump`, runs the compiled deployment
migration command, and starts `dist/index.js`. Do not add a separate start
command unless you intentionally replace the Dockerfile `CMD`. Fastify reads
Render's `PORT` and binds to `0.0.0.0`.

### 3. Add Render environment variables

Start from `backend/.env.production.example`. In **Render Dashboard → Service
→ Environment**, verify the following values.

The Blueprint commits these safe, fixed Nepal launch constants:

```text
ACTIVE_MARKET=NP
DEFAULT_COUNTRY_CODE=NP
DEFAULT_CURRENCY_CODE=NPR
DEFAULT_LOCALE=en-NP
DEFAULT_TIMEZONE=Asia/Kathmandu
DEFAULT_TAX_REGIME=IRD
```

The Blueprint also supplies the fixed runtime policy (`NODE_ENV`, `HOST`,
`PORT`, SSL policy, JWT issuer/audience, rate limits, and disabled deferred
features), connects `REDIS_URL`, and generates five independent secrets.

Render requires the operator to supply these deployment-specific values:

```text
DATABASE_URL=<managed PostgreSQL connection URL>
CORS_ORIGIN=https://<your-vercel-domain>
APP_URL=https://<your-vercel-domain>
PAYMENT_ENCRYPTION_KEY=<exactly 64 hexadecimal characters>
```

`DATABASE_URL`, `CORS_ORIGIN`, and `APP_URL` are deployment-specific
configuration. `PAYMENT_ENCRYPTION_KEY` is a secret; generate it with a
cryptographically secure generator (for example, `openssl rand -hex 32`) and
enter it only in Render. Render generates `JWT_SECRET`, `COOKIE_SECRET`,
`ENCRYPTION_KEY`, `SIGNATURE_SECRET`, and `OTP_HASH_SECRET`; do not overwrite
them with shared or placeholder values.

Optional integrations should remain absent unless intentionally enabled. For
customer OTP delivery with Twilio Verify, configure the complete group
`SMS_PROVIDER=twilio_verify`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and
`TWILIO_VERIFY_SERVICE_SID`. Verify manages the SMS sender, so
`TWILIO_FROM_NUMBER` is not required. Configure both `EMAIL_PROVIDER` and
`EMAIL_PROVIDER_API_KEY` together. A map provider
requires `DEFAULT_MAP_PROVIDER=Baato` plus `BAATO_API_KEY`, or
`DEFAULT_MAP_PROVIDER=Galli` plus `GALLI_API_KEY`. Electronic payment providers
remain uncertified and `ENABLE_ELECTRONIC_PAYMENTS` must stay `false`.

For short-lived testing without SMS, set `SMS_PROVIDER=demo` together with one
existing customer's `OTP_DEMO_PHONE`, a private six-digit `OTP_DEMO_CODE`, and
an ISO `OTP_DEMO_EXPIRES_AT` no more than seven days ahead. The API never
returns the configured code and rejects every other phone. Remove all four
values immediately after testing; never use demo mode for customer traffic.

### 4. Deploy and verify

After the first deploy, open the Render service URL and verify:

```text
https://<service-name>.onrender.com/api/health
https://<service-name>.onrender.com/api/health/ready
```

The readiness endpoint must return HTTP 200 with both database and Redis marked
`ok`. If it fails, inspect the deploy logs first; the most common causes are an
incorrect internal connection URL, a missing required secret, or services in
different regions.

### 5. Connect Vercel

In Vercel Project Settings → Environment Variables, set `API_URL` to the
public Render service URL, for example:

```text
API_URL=https://<service-name>.onrender.com
```

Set it for Preview and Production, redeploy Vercel, then test the Vercel
frontend's `/api/health/ready`, customer OTP flow, cart, and checkout. Never
put Render's internal Postgres or Redis URL into Vercel.

### Using Docker Compose

```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### Manual Docker Build

```bash
# Build image
docker build -t storesync-backend .

# Run container
docker run -d \
  --name storesync-backend \
  -p 3001:3001 \
  --env-file .env \
  storesync-backend
```

## Database Setup

1. Create PostgreSQL database
2. Run schema migrations:
```bash
psql -U your_user -d storesync -f database/schema.sql
```

## Health Checks

- `GET /api/health` - Application health
- `GET /api/health/db` - Database connectivity

## Monitoring

The application includes:
- Structured logging
- Error tracking (configure with external service)
- Health check endpoints
- Request/response logging in development

## Backup Strategy

- Database backups should be configured via PostgreSQL tools
- Application logs should be retained per policy
- Configuration backups via version control

## Rollback Procedure

1. Stop current deployment
2. Deploy previous version
3. Run database migrations if needed
4. Verify health checks
5. Monitor logs for errors
