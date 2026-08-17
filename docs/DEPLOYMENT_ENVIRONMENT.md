# Deployment environment variables

The frontend and backend are deployed separately:

- Vercel hosts `frontend/`.
- A persistent Node.js host runs `backend/`.
- Managed PostgreSQL and Redis are required by the backend.

## Vercel

Set `API_URL` in both Preview and Production environments:

```text
API_URL=https://api.example.com
```

Do not set it to localhost, a Docker hostname, or a private LAN address.
Vercel must be able to resolve and reach this URL publicly; a private DNS
target produces `DNS_HOSTNAME_RESOLVED_PRIVATE` and the API proxy cannot work.

## Backend

Copy `backend/.env.production.example` into the backend host's secret manager
and replace every placeholder. The application now fails at startup when
`DATABASE_URL`, `REDIS_URL`, `CORS_ORIGIN`, `APP_URL`, or a required security
key is missing or malformed.

For customer OTP login, configure both `SMS_PROVIDER` and
`SMS_PROVIDER_API_KEY`. For email notifications, configure both
`EMAIL_PROVIDER` and `EMAIL_PROVIDER_API_KEY`. Leave optional payment and map
provider variables empty until the corresponding integration is approved.

`CORS_ORIGIN` must exactly match the deployed Vercel origin. `DATABASE_SSL`
should normally be `true` for managed PostgreSQL, and `REDIS_URL` should use
`rediss://` when the provider requires TLS.
