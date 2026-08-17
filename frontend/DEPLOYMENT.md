# Frontend Deployment Guide

## Environment Variables

```bash
API_URL=https://api.storesync.com
```

`API_URL` must be the absolute public URL of the separately deployed Fastify
backend. The Next.js `/api/*` route proxies browser requests server-side, so
the backend URL does not need to be exposed as a browser API base URL.

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
  storesync-frontend
```

## Vercel Deployment

The repository contains a root `vercel.json` for the `frontend/` Next.js
application. Connect the repository to Vercel and configure either the project
Root Directory as `frontend` or use the root configuration as-is.

Required Vercel environment variable:

```text
API_URL=https://api.your-domain.example
```

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
4. Set Vercel `API_URL` to that backend URL and deploy the frontend.
5. Verify the Vercel site, `/api/health/ready` proxy, customer authentication,
   checkout, and staff capabilities before promoting the deployment.

## Static Export

For static hosting:

```bash
npm run build
npm run export
```

Output will be in `out/` directory.

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

- Vercel Analytics (if using Vercel)
- Custom error tracking
- Performance monitoring
