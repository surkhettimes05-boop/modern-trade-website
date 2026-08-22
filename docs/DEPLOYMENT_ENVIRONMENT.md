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
and replace every placeholder. The application fails before opening its port
when an explicit Nepal market value, `DATABASE_URL`, `REDIS_URL`,
`CORS_ORIGIN`, `APP_URL`, JWT issuer/audience, or a required security key is
missing or malformed. On Render, the checked-in Blueprint supplies the six
non-secret Nepal constants and prompts for deployment-specific values.

For Twilio OTP delivery, configure `SMS_PROVIDER=twilio_verify` together with
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID`.
Twilio Verify manages the sender, so no `TWILIO_FROM_NUMBER` is required. For email
notifications, configure both `EMAIL_PROVIDER` and `EMAIL_PROVIDER_API_KEY`.
Leave optional payment and map provider variables unset until the corresponding
integration is approved.

`CORS_ORIGIN` and `APP_URL` must be HTTPS origins without paths and should
match the deployed frontend origin. Production requires `DATABASE_SSL=true`
and rejects `DATABASE_SSL_REJECT_UNAUTHORIZED=false`; `REDIS_URL` should use
`rediss://` when the provider requires TLS.
