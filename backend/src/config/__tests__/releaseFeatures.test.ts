import { PILOT_FEATURES, validatePilotFeatureEnvironment } from "../releaseFeatures.js";

describe("pilot feature controls", () => {
  it("enables only the certified first-release surface", () => {
    expect(PILOT_FEATURES).toMatchObject({
      codCheckout: true,
      basicPos: true,
      inventory: true,
      electronicPayments: false,
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
});
