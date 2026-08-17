# Backend Deployment Guide

## Environment Variables

Required environment variables for production:

```bash
DATABASE_URL=postgresql://user:password@host:5432/storesync
DATABASE_SSL=true
PORT=3001
HOST=0.0.0.0
NODE_ENV=production
JWT_SECRET=your-production-secret
CORS_ORIGIN=https://storesync.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
ENABLE_ADMIN_API=true
ENABLE_CONTENT_SCHEDULING=true
```

## Docker Deployment

## Render Deployment

The repository includes `render.yaml` for a repeatable Render Blueprint. It
creates the backend Docker Web Service and a private Redis-compatible Key Value
service. Supabase remains the PostgreSQL provider; Render will prompt for the
Supabase `DATABASE_URL` during the initial Blueprint setup.

Review the plan and region in `render.yaml` before creating the Blueprint.

Render can build this repository's `backend/Dockerfile` directly; Docker does
not need to be installed on your laptop.

### 1. Create the data services

In the same Render region, create:

- A Render Postgres database named `storesync-db`.
- A Render Key Value instance named `storesync-redis`.

Use the internal connection URLs from each service's Connect panel. Render
recommends internal URLs when services share a region because traffic stays on
the private network.

### 2. Create the backend Web Service

Choose **New → Web Service**, connect this repository, and use:

```text
Language: Docker
Dockerfile Path: backend/Dockerfile
Docker Context: repository root (.)
Region: same region as Postgres and Key Value
Health Check Path: /api/health/ready
```

The Dockerfile already installs `pg_dump`, runs the compiled deployment
migration command, and starts the Fastify server. Do not add a separate start
command unless you intentionally replace the Dockerfile `CMD`.

### 3. Add Render environment variables

Start from `backend/.env.production.example`. In Render's **Environment** tab,
add the following values:

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=10000
ENABLE_ADMIN_API=true
DATABASE_URL=<Render Postgres internal connection URL>
DATABASE_SSL=true
REDIS_URL=<Render Key Value internal connection URL>
REDIS_NAMESPACE=storesync-production
CORS_ORIGIN=https://<your-vercel-domain>
APP_URL=https://<your-vercel-domain>
JWT_SECRET=<generated secret>
COOKIE_SECRET=<different generated secret>
ENCRYPTION_KEY=<at least 32 random bytes>
SIGNATURE_SECRET=<at least 32 random bytes>
PAYMENT_ENCRYPTION_KEY=<exactly 64 hexadecimal characters>
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
ENABLE_ELECTRONIC_PAYMENTS=false
```

Also configure `SMS_PROVIDER` and `SMS_PROVIDER_API_KEY` before expecting real
customer OTP login to work. Configure both email variables together if email
notifications are enabled. Leave optional map and payment provider variables
empty until those integrations are approved.

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
