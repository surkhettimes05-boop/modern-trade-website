import {
  PILOT_FEATURES,
  creatorPayoutsEnabled,
  memberPricingEnabled,
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

  it("never enables creator payout recording in production", () => {
    expect(creatorPayoutsEnabled({ NODE_ENV: "production", ENABLE_CREATOR_PAYOUTS: "true" })).toBe(false);
    expect(creatorPayoutsEnabled({ NODE_ENV: "test" })).toBe(false);
    expect(creatorPayoutsEnabled({ NODE_ENV: "test", ENABLE_CREATOR_PAYOUTS: "true" })).toBe(true);
  });

  it("locks staging COD only on an explicit server-side setting", () => {
    expect(stagingCustomerOrdersBlocked({})).toBe(false);
    expect(stagingCustomerOrdersBlocked({ STAGING_DISABLE_CUSTOMER_ORDERS: "false" })).toBe(false);
    expect(stagingCustomerOrdersBlocked({ STAGING_DISABLE_CUSTOMER_ORDERS: "true" })).toBe(true);
  });
});
