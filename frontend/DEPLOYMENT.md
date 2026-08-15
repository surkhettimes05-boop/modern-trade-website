# Frontend Deployment Guide

## Environment Variables

```bash
NEXT_PUBLIC_API_URL=https://api.storesync.com
```

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
  -e NEXT_PUBLIC_API_URL=https://api.storesync.com \
  storesync-frontend
```

## Vercel Deployment

1. Connect repository to Vercel
2. Configure environment variables
3. Deploy automatically on push to main branch

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
