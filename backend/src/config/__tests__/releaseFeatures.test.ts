import {
  PILOT_FEATURES,
  memberPricingEnabled,
  publicCatalogOnly,
  stagingCustomerOrdersBlocked,
  validatePilotFeatureEnvironment,
} from "../releaseFeatures.js";

describe("pilot feature controls", () => {
  it("enables only the certified first-release surface", () => {
    expect(PILOT_FEATURES).toMatchObject({
      codCheckout: true,
      basicPos: true,
      inventory: true,
      electronicPayments: false,
      memberPricing: false,
      loyalty: true,
      advancedAnalytics: false,
      externalTaxIntegration: false,
      returns: false,
    });
  });

  it("fails closed when a deferred feature is enabled in production", () => {
    expect(() =>
      validatePilotFeatureEnvironment({
        NODE_ENV: "production",
        ENABLE_ELECTRONIC_PAYMENTS: "true",
      }),
    ).toThrow("Deferred pilot features cannot be enabled");
  });

  it("keeps member pricing off unless explicitly enabled", () => {
    expect(memberPricingEnabled({})).toBe(false);
    expect(memberPricingEnabled({ ENABLE_MEMBER_PRICING: "false" })).toBe(false);
    expect(memberPricingEnabled({ ENABLE_MEMBER_PRICING: "true" })).toBe(true);
  });

  it("locks staging COD only on an explicit server-side setting", () => {
    expect(stagingCustomerOrdersBlocked({})).toBe(false);
    expect(stagingCustomerOrdersBlocked({ STAGING_DISABLE_CUSTOMER_ORDERS: "false" })).toBe(false);
    expect(stagingCustomerOrdersBlocked({ STAGING_DISABLE_CUSTOMER_ORDERS: "true" })).toBe(true);
  });

  it("blocks production COD regardless of staging flag or a stray enable override", () => {
    expect(stagingCustomerOrdersBlocked({ NODE_ENV: "production" })).toBe(true);
    expect(stagingCustomerOrdersBlocked({
      NODE_ENV: "production",
      STAGING_DISABLE_CUSTOMER_ORDERS: "false",
      ENABLE_LIVE_CUSTOMER_ORDERS: "true",
    })).toBe(true);
  });

  it("requires an explicit read-only launch flag", () => {
    expect(publicCatalogOnly({})).toBe(false);
    expect(publicCatalogOnly({ PUBLIC_CATALOG_ONLY: "false" })).toBe(false);
    expect(publicCatalogOnly({ PUBLIC_CATALOG_ONLY: "true" })).toBe(true);
    expect(stagingCustomerOrdersBlocked({ PUBLIC_CATALOG_ONLY: "true" })).toBe(true);
  });
});
