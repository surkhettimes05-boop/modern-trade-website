import {
  getDatabaseUrl,
  validateProductionEnvironment,
} from "../environment.js";
import { getActiveMarket } from "../market.js";

const productionEnvironment = {
  NODE_ENV: "production",
  ACTIVE_MARKET: "NP",
  DEFAULT_COUNTRY_CODE: "NP",
  DEFAULT_CURRENCY_CODE: "NPR",
  DEFAULT_LOCALE: "en-NP",
  DEFAULT_TIMEZONE: "Asia/Kathmandu",
  DEFAULT_TAX_REGIME: "IRD",
  DATABASE_URL: "postgresql://user:password@database.example/storesync",
  DATABASE_SSL: "true",
  DATABASE_SSL_REJECT_UNAUTHORIZED: "true",
  REDIS_URL: "rediss://default:password@redis.example:6379",
  CORS_ORIGIN: "https://storesync.example",
  APP_URL: "https://storesync.example",
  JWT_SECRET: "j".repeat(32),
  COOKIE_SECRET: "c".repeat(32),
  ENCRYPTION_KEY: "e".repeat(32),
  SIGNATURE_SECRET: "s".repeat(32),
  OTP_HASH_SECRET: "o".repeat(32),
  PAYMENT_ENCRYPTION_KEY: "a".repeat(64),
  JWT_ISSUER: "storesync-backend",
  JWT_AUDIENCE: "storesync-operations",
} satisfies NodeJS.ProcessEnv;

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

  it("accepts a complete Nepal production configuration", () => {
    expect(() =>
      validateProductionEnvironment(productionEnvironment),
    ).not.toThrow();
  });

  it("rejects a missing explicit production market variable", () => {
    const env: NodeJS.ProcessEnv = { ...productionEnvironment };
    delete env.DEFAULT_TIMEZONE;
    expect(() => validateProductionEnvironment(env)).toThrow(
      "Missing explicit production market configuration: DEFAULT_TIMEZONE",
    );
  });

  it.each([
    ["DEFAULT_COUNTRY_CODE", "IN"],
    ["DEFAULT_CURRENCY_CODE", "INR"],
    ["DEFAULT_LOCALE", "en-IN"],
    ["DEFAULT_TIMEZONE", "Asia/Kolkata"],
    ["DEFAULT_TAX_REGIME", "GST"],
  ])("rejects mismatched Nepal setting %s", (key, value) => {
    expect(() =>
      validateProductionEnvironment({
        ...productionEnvironment,
        [key]: value,
      }),
    ).toThrow(`conflicts with ACTIVE_MARKET=NP`);
  });

  it("rejects an unsupported active production market", () => {
    expect(() =>
      validateProductionEnvironment({
        ...productionEnvironment,
        ACTIVE_MARKET: "IN",
      }),
    ).toThrow("is not certified");
  });

  it("rejects missing production secrets after market validation", () => {
    const env: NodeJS.ProcessEnv = { ...productionEnvironment };
    delete env.JWT_SECRET;
    expect(() => validateProductionEnvironment(env)).toThrow(
      "Missing required production configuration: JWT_SECRET",
    );
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
