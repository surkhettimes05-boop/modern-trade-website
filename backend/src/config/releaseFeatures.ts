export const PILOT_FEATURES = {
  publicWebsite: true,
  catalog: true,
  storeSelection: true,
  customerAccount: true,
  cart: true,
  codCheckout: true,
  pickupDelivery: true,
  orderHistory: true,
  staffLogin: true,
  basicPos: true,
  inventory: true,
  coreOperations: true,
  electronicPayments: false,
  loyalty: true,
  advancedAnalytics: false,
  externalTaxIntegration: false,
  returns: false,
  promotionEngine: false,
  memberPricing: false,
  customerSegments: false,
  offlineSync: false,
  hardwareDevices: false,
  externalCmsCdn: false,
  fiscalComplianceIntegration: false,
} as const;

const DEFERRED_ENV_FLAGS = [
  "ENABLE_ELECTRONIC_PAYMENTS",
  "ENABLE_ADVANCED_ANALYTICS",
  "ENABLE_EXTERNAL_TAX_INTEGRATION",
  "ENABLE_RETURNS",
  "ENABLE_PROMOTION_ENGINE",
  "ENABLE_CUSTOMER_SEGMENTS",
  "ENABLE_OFFLINE_SYNC",
  "ENABLE_HARDWARE_DEVICES",
  "ENABLE_EXTERNAL_CMS_CDN",
  "ENABLE_FISCAL_COMPLIANCE_INTEGRATION",
] as const;

export function validatePilotFeatureEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== "production") return;
  const enabled = DEFERRED_ENV_FLAGS.filter((key) => env[key] === "true");
  if (enabled.length) {
    throw new Error(
      `Deferred pilot features cannot be enabled in production: ${enabled.join(", ")}`,
    );
  }
}

export function deferredFeatureEnabled(
  envName: (typeof DEFERRED_ENV_FLAGS)[number],
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV !== "production" && env[envName] === "true";
}

export function memberPricingEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.ENABLE_MEMBER_PRICING === "true";
}

// A deliberate read-only public launch. No customer OTP, checkout, creator
// enrolment, membership writes, POS sales, or other HTTP mutations are accepted.
// Keeping this opt-in separate from SMS_PROVIDER prevents demo OTP in production.
export function publicCatalogOnly(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PUBLIC_CATALOG_ONLY === "true";
}

// Production is deployed for live verification with real customer orders
// unapproved. A later, separately reviewed release must remove this gate
// before accepting COD orders. Staging can also explicitly lock checkout.
// ENABLE_ELECTRONIC_PAYMENTS does not control cash-on-delivery orders.
export function stagingCustomerOrdersBlocked(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return publicCatalogOnly(env) || env.NODE_ENV === "production" || env.STAGING_DISABLE_CUSTOMER_ORDERS === "true";
}
