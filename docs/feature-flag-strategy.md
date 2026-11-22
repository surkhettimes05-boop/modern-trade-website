# Production pilot feature controls

The certified release surface is defined in `backend/src/config/releaseFeatures.ts` and mirrored for browser presentation in `frontend/src/lib/releaseFeatures.ts`.

Core pilot capabilities are public website/catalog/store selection, customer account/cart/COD checkout/pickup/delivery/order history, staff login, basic cash POS/shifts, inventory, Nepal loyalty MVP, procurement, staff, content/catalog, audit and required operations. Loyalty is not controlled by `ENABLE_LOYALTY`; only the authenticated MVP routes are registered. Legacy loyalty, unified loyalty, tiers, rewards, and campaigns remain unregistered.

The following environment flags default to false and cause production startup to fail if set to true:

- `ENABLE_ELECTRONIC_PAYMENTS`
- `ENABLE_ADVANCED_ANALYTICS`
- `ENABLE_EXTERNAL_TAX_INTEGRATION`
- `ENABLE_RETURNS`
- `ENABLE_PROMOTION_ENGINE`
- `ENABLE_MEMBER_PRICING`
- `ENABLE_CUSTOMER_SEGMENTS`
- `ENABLE_OFFLINE_SYNC`
- `ENABLE_HARDWARE_DEVICES`
- `ENABLE_EXTERNAL_CMS_CDN`
- `ENABLE_FISCAL_COMPLIANCE_INTEGRATION`

In non-production a deferred module may be registered only by deliberately setting its flag to `true`. UI hiding is presentation only; the production server does not register deferred routes. Promotion requires threat modeling, authorization and failure tests, operational runbooks, external contract verification where applicable, and a new full certification.

The member-pricing administration API remains available to authorized staff for draft review, but production startup rejects `ENABLE_MEMBER_PRICING=true`. Creating or activating a draft does not turn on the checkout/POS price override. Production promotion and member pricing remain disabled until a separate certification changes this gate.

## Public membership and creator portal visibility

The Next.js website separately gates the customer-facing `/membership` and `/creator` pages in `frontend/src/lib/publicLaunch.ts`. Set `NEXT_PUBLIC_ENABLE_MEMBERSHIP=true` to show free membership enrollment after the customer's mobile number is verified. Set `NEXT_PUBLIC_ENABLE_CREATOR_PORTAL=true` to show the sign-in page for existing active creators. Creator applications remain staff-managed; these flags do not open creator self-registration. The proxy permits only membership enrollment and the creator OTP request, OTP verification, and logout mutations when their corresponding flag is on. These page flags do not enable member-specific discounts or cash-out settlement.
