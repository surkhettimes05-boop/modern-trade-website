import {
  assertDevelopmentSeedEnvironment,
  getDatabaseUrl,
  getMigrationDatabaseUrl,
  validateProductionDatabaseRoles,
  validateProductionEnvironment,
} from "../environment.js";
import { getActiveMarket } from "../market.js";
import { getResilienceConfig } from "../resilience.js";

const productionEnvironment = {
  NODE_ENV: "production",
  ACTIVE_MARKET: "NP",
  DEFAULT_COUNTRY_CODE: "NP",
  DEFAULT_CURRENCY_CODE: "NPR",
  DEFAULT_LOCALE: "en-NP",
  DEFAULT_TIMEZONE: "Asia/Kathmandu",
  DEFAULT_TAX_REGIME: "IRD",
  DATABASE_URL:
    "postgresql://storesync_app:password@database.example/storesync",
  MIGRATION_DATABASE_URL:
    "postgresql://storesync_migrator:password@database.example/storesync",
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
  REQUIRE_LEAST_PRIVILEGE_DATABASE_ROLE: "true",
  DATABASE_RUNTIME_ROLE: "storesync_app",
  DATABASE_MIGRATION_ROLE: "storesync_migrator",
} satisfies NodeJS.ProcessEnv;

describe("environment safety", () => {
  it("requires an explicit test database URL", () => {
    expect(() => getDatabaseUrl({ NODE_ENV: "test" })).toThrow(
      "TEST_DATABASE_URL is required",
    );
  });

  it("requires a separate production migration database URL", () => {
    expect(() =>
      getMigrationDatabaseUrl({
        NODE_ENV: "production",
        DATABASE_URL: productionEnvironment.DATABASE_URL,
      }),
    ).toThrow("MIGRATION_DATABASE_URL is required in production");
  });

  it("requires distinct, valid production database roles", () => {
    expect(() =>
      validateProductionDatabaseRoles({
        NODE_ENV: "production",
        DATABASE_RUNTIME_ROLE: "storesync_app",
        DATABASE_MIGRATION_ROLE: "storesync_app",
      }),
    ).toThrow("must be different");
    expect(() =>
      validateProductionDatabaseRoles({
        NODE_ENV: "production",
        DATABASE_RUNTIME_ROLE: "unsafe-role",
        DATABASE_MIGRATION_ROLE: "storesync_migrator",
      }),
    ).toThrow("role names are invalid");
    expect(() =>
      validateProductionDatabaseRoles({
        NODE_ENV: "production",
        DATABASE_RUNTIME_ROLE: "custom_app",
        DATABASE_MIGRATION_ROLE: "custom_migrator",
      }),
    ).toThrow("must be storesync_app and storesync_migrator");
  });

  it("allows migration credentials to be absent from the runtime process", () => {
    expect(() =>
      validateProductionEnvironment({
        ...productionEnvironment,
        MIGRATION_DATABASE_URL: undefined,
      }),
    ).not.toThrow();
  });

  it("rejects reuse of the runtime database role for migrations", () => {
    expect(() =>
      validateProductionEnvironment({
        ...productionEnvironment,
        MIGRATION_DATABASE_URL: productionEnvironment.DATABASE_URL,
      }),
    ).toThrow("username must match DATABASE_MIGRATION_ROLE");
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

  it("requires TLS for public Redis and only permits an explicit private exception", () => {
    expect(() =>
      validateProductionEnvironment({
        ...productionEnvironment,
        REDIS_URL: "redis://redis.example:6379",
      }),
    ).toThrow("REDIS_URL must use rediss");
    expect(() =>
      validateProductionEnvironment({
        ...productionEnvironment,
        REDIS_URL: "redis://storesync-redis:6379",
        REDIS_ALLOW_PLAINTEXT_PRIVATE: "true",
      }),
    ).not.toThrow();
  });

  it("allows TLS require mode for a managed database without a CA bundle", () => {
    expect(() =>
      validateProductionEnvironment({
        ...productionEnvironment,
        DATABASE_SSL_REJECT_UNAUTHORIZED: "false",
      }),
    ).not.toThrow();
  });

  it("still requires encrypted database transport in production", () => {
    expect(() =>
      validateProductionEnvironment({
        ...productionEnvironment,
        DATABASE_SSL: "false",
      }),
    ).toThrow("DATABASE_SSL=true is required in production");
  });

  it("requires unique cryptographic secrets and bounded rate limits", () => {
    expect(() =>
      validateProductionEnvironment({
        ...productionEnvironment,
        COOKIE_SECRET: productionEnvironment.JWT_SECRET,
      }),
    ).toThrow("cryptographic secrets must be unique");
    expect(() =>
      validateProductionEnvironment({
        ...productionEnvironment,
        RATE_LIMIT_MAX_REQUESTS: "0",
      }),
    ).toThrow("RATE_LIMIT_MAX_REQUESTS");
    expect(() =>
      validateProductionEnvironment({
        ...productionEnvironment,
        RATE_LIMIT_WINDOW_MS: "999",
      }),
    ).toThrow("RATE_LIMIT_WINDOW_MS");
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

  it("rejects development OTP disclosure in production", () => {
    expect(() =>
      validateProductionEnvironment({
        ...productionEnvironment,
        EXPOSE_DEVELOPMENT_OTP: "true",
      }),
    ).toThrow("EXPOSE_DEVELOPMENT_OTP cannot be enabled in production");
  });

  it("requires production database least-privilege enforcement", () => {
    expect(() =>
      validateProductionEnvironment({
        ...productionEnvironment,
        REQUIRE_LEAST_PRIVILEGE_DATABASE_ROLE: "false",
      }),
    ).toThrow("REQUIRE_LEAST_PRIVILEGE_DATABASE_ROLE=true");
  });

  it.each(["0", "-1", "4", "all", "1.5"])(
    "rejects unsafe proxy trust depth %s",
    (TRUST_PROXY_HOPS) => {
      expect(() =>
        validateProductionEnvironment({
          ...productionEnvironment,
          TRUST_PROXY_HOPS,
        }),
      ).toThrow("TRUST_PROXY_HOPS must be an integer from 1 to 3");
    },
  );

  it("accepts an explicit single trusted production proxy", () => {
    expect(() =>
      validateProductionEnvironment({
        ...productionEnvironment,
        TRUST_PROXY_HOPS: "1",
      }),
    ).not.toThrow();
  });

  it("uses bounded reliability defaults", () => {
    expect(getResilienceConfig({})).toMatchObject({
      databasePoolMax: 20,
      databaseStatementTimeoutMs: 15_000,
      databaseQueryTimeoutMs: 17_000,
      httpRequestTimeoutMs: 15_000,
      shutdownTimeoutMs: 25_000,
    });
  });

  it("rejects invalid or contradictory reliability limits", () => {
    expect(() =>
      getResilienceConfig({ DATABASE_POOL_MAX: "0" }),
    ).toThrow("DATABASE_POOL_MAX must be between");
    expect(() =>
      getResilienceConfig({
        DATABASE_STATEMENT_TIMEOUT_MS: "20000",
        DATABASE_QUERY_TIMEOUT_MS: "10000",
      }),
    ).toThrow("DATABASE_QUERY_TIMEOUT_MS must be greater than or equal");
    expect(() =>
      getResilienceConfig({ SHUTDOWN_TIMEOUT_MS: "30000" }),
    ).toThrow("SHUTDOWN_TIMEOUT_MS must be between");
  });

  it("refuses to seed production or ambiguous remote databases", () => {
    expect(() =>
      assertDevelopmentSeedEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@database.example/storesync",
      }),
    ).toThrow("Refusing to run the development seed in production");
    expect(() =>
      assertDevelopmentSeedEnvironment({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://user:pass@database.example/storesync",
      }),
    ).toThrow("Refusing unsafe development seed database");
  });

  it("allows an explicitly local development seed", () => {
    expect(() =>
      assertDevelopmentSeedEnvironment({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://user:pass@127.0.0.1/storesync",
      }),
    ).not.toThrow();
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
