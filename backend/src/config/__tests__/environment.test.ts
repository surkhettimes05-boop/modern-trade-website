import {
  getDatabaseUrl,
  validateProductionEnvironment,
} from "../environment.js";
import { getActiveMarket } from "../market.js";

describe("environment safety", () => {
  it("requires an explicit test database URL", () => {
    expect(() => getDatabaseUrl({ NODE_ENV: "test" })).toThrow(
      "TEST_DATABASE_URL is required",
    );
  });

  it.each([
    "postgresql://user:pass@prod.example.com/storesync_test",
    "postgresql://user:pass@localhost/storesync",
  ])("rejects unsafe test database URL %s", (TEST_DATABASE_URL) => {
    expect(() =>
      getDatabaseUrl({ NODE_ENV: "test", TEST_DATABASE_URL }),
    ).toThrow("Refusing unsafe test database URL");
  });

  it("requires stable production encryption and signing keys", () => {
    expect(() =>
      validateProductionEnvironment({ NODE_ENV: "production" }),
    ).toThrow("Missing explicit production market configuration");
  });

  it("uses Nepal as the only certified pilot market", () => {
    expect(getActiveMarket({ ACTIVE_MARKET: "NP" })).toMatchObject({
      countryCode: "NP",
      currencyCode: "NPR",
      locale: "en-NP",
      timezone: "Asia/Kathmandu",
      taxRegime: "IRD",
    });
    expect(() => getActiveMarket({ ACTIVE_MARKET: "IN" })).toThrow(
      "is not certified",
    );
  });

  it("rejects a conflicting India default on the Nepal path", () => {
    expect(() =>
      getActiveMarket({
        ACTIVE_MARKET: "NP",
        DEFAULT_COUNTRY_CODE: "IN",
        DEFAULT_CURRENCY_CODE: "INR",
      }),
    ).toThrow("conflicts with ACTIVE_MARKET=NP");
  });
});
