# Frontend Deployment Guide

## Environment Variables

```bash
# Legacy admin/operations backend
API_URL=https://api.storesync.com

# Pasalho OS customer-commerce backend origin (no /api/v1 suffix)
PASALHO_API_URL=https://api.pasalho.com
```

`API_URL` remains the legacy Fastify backend for admin/operations routes. `PASALHO_API_URL` is required for customer commerce and must point to the deployed NestJS Pasalho backend origin. Browser commerce requests stay same-origin and are proxied server-side to `/api/v1/commerce/*`; neither backend URL should be exposed as a browser API base URL.

## Docker Deployment

### Build Image

```bash
docker build -t storesync-frontend .
```

### Run Container

```bash
docker run -d \
  --name storesync-frontend \
  -p 3000:3000 \
  -e API_URL=https://api.storesync.com \
  -e PASALHO_API_URL=https://api.pasalho.com \
  storesync-frontend
```

## Vercel Deployment

The repository contains a root `vercel.json` for the `frontend/` Next.js
application. Connect the repository to Vercel and configure either the project
Root Directory as `frontend` or use the root configuration as-is.

Required Vercel environment variables:

```text
API_URL=https://legacy-api.your-domain.example
PASALHO_API_URL=https://api.pasalho.com
```

`PASALHO_API_URL` is mandatory for the customer storefront. Without it, location resolution, live catalogue, cart, authentication, checkout and order tracking intentionally fail closed rather than falling back to StoreSync inventory.

Set it for Preview and Production. Do not use `http://127.0.0.1`, `localhost`,
or a private Docker hostname in Vercel.

The Fastify backend must be deployed separately because it requires persistent
PostgreSQL and Redis connections. Set its `CORS_ORIGIN` to the exact Vercel
production URL (and any approved preview URL), and configure all required
production secrets described in `backend/.env.example` and
`backend/.env.production.example` and `docs/DEPLOYMENT_ENVIRONMENT.md`.

Recommended release order:

1. Provision managed PostgreSQL and Redis.
2. Deploy the backend and run `npm run build` followed by the migration process
   from `backend/DEPLOYMENT.md`.
3. Verify `https://api.your-domain.example/api/health/ready` returns HTTP 200.
4. Deploy Pasalho OS and verify `/api/v1/commerce/serviceability/resolve` and the commerce catalogue endpoints.
5. Set Vercel `API_URL` for legacy admin/operations and `PASALHO_API_URL` for customer commerce, then deploy the frontend.
6. Verify location permission, serviceability, live catalogue, server cart, OTP authentication, checkout preview, idempotent COD order placement, order tracking, and staff capabilities before promoting the deployment.

## Runtime requirement

This application is not compatible with a static export: its same-origin API
proxy, Web Vitals ingestion route, staff-route proxy, and dynamic account routes
require a Next.js server runtime. Deploy it to Vercel or run the verified
standalone container behind a reverse proxy/CDN.

## Performance Optimization

- Images are optimized via Next.js Image component
- CSS is bundled and minified
- JavaScript is code-split by route
- Static assets are cached

## CDN Configuration

Configure CDN to cache:
- Static assets (images, fonts)
- API responses (with appropriate cache headers)
- HTML pages (with revalidation)

## Monitoring

- The built-in Web Vitals endpoint emits bounded, structured LCP/INP/CLS data.
- Configure a Vercel Drain or an approved error/telemetry provider before launch.
- Performance monitoring
