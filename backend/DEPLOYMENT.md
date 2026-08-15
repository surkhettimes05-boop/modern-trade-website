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
