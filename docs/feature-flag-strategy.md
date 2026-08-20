# Production pilot feature controls

The certified release surface is defined in `backend/src/config/releaseFeatures.ts` and mirrored for browser presentation in `frontend/src/lib/releaseFeatures.ts`.

Core pilot capabilities are public website/catalog/store selection, customer account/cart/COD checkout/pickup/delivery/order history, staff login, basic cash POS/shifts, inventory, Nepal loyalty MVP, procurement, staff, content/catalog, audit and required operations. Loyalty is not controlled by `ENABLE_LOYALTY`; only the authenticated MVP routes are registered. Legacy loyalty, unified loyalty, tiers, rewards, and campaigns remain unregistered.

The following environment flags default to false and cause production startup to fail if set to true:

- `ENABLE_ELECTRONIC_PAYMENTS`
- `ENABLE_ADVANCED_ANALYTICS`
- `ENABLE_EXTERNAL_TAX_INTEGRATION`
- `ENABLE_RETURNS`
- `ENABLE_PROMOTION_ENGINE`
- `ENABLE_CUSTOMER_SEGMENTS`
- `ENABLE_OFFLINE_SYNC`
- `ENABLE_HARDWARE_DEVICES`
- `ENABLE_EXTERNAL_CMS_CDN`
- `ENABLE_FISCAL_COMPLIANCE_INTEGRATION`

In non-production a deferred module may be registered only by deliberately setting its flag to `true`. UI hiding is presentation only; the production server does not register deferred routes. Promotion requires threat modeling, authorization and failure tests, operational runbooks, external contract verification where applicable, and a new full certification.
