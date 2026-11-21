import {
  PILOT_FEATURES,
  memberPricingEnabled,
  realCustomerOrdersEnabled,
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

  it("fails closed for production customer orders until explicitly enabled", () => {
    expect(realCustomerOrdersEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(
      realCustomerOrdersEnabled({
        NODE_ENV: "production",
        ENABLE_REAL_CUSTOMER_ORDERS: "false",
      }),
    ).toBe(false);
    expect(
      realCustomerOrdersEnabled({
        NODE_ENV: "production",
        ENABLE_REAL_CUSTOMER_ORDERS: "true",
      }),
    ).toBe(true);
    expect(realCustomerOrdersEnabled({ NODE_ENV: "test" })).toBe(true);
  });
});
