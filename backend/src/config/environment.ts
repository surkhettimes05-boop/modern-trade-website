const TEST_DATABASE_PATTERN = /(^|[_-])test($|[_-])/i;
import { validateProductionIntegrations } from "./integrations.js";
import { MARKET, validateMarketEnvironment } from "./market.js";
import { validatePilotFeatureEnvironment } from "./releaseFeatures.js";
import { getResilienceConfig } from "./resilience.js";

export const DEFAULT_MARKET = MARKET;

export function getDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NODE_ENV === "test") {
    const value = env.TEST_DATABASE_URL;
    if (!value)
      throw new Error("TEST_DATABASE_URL is required when NODE_ENV=test");
    const url = new URL(value);
    const databaseName = url.pathname.replace(/^\//, "");
    if (
      !TEST_DATABASE_PATTERN.test(databaseName) ||
      /prod(uction)?/i.test(`${url.hostname}/${databaseName}`)
    ) {
      throw new Error(
        "Refusing unsafe test database URL: database must be explicitly test-scoped and non-production",
      );
    }
    return value;
  }
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return env.DATABASE_URL;
}

export function getMigrationDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (env.NODE_ENV === "production") {
    if (!env.MIGRATION_DATABASE_URL) {
      throw new Error("MIGRATION_DATABASE_URL is required in production");
    }
    return env.MIGRATION_DATABASE_URL;
  }
  return env.MIGRATION_DATABASE_URL || getDatabaseUrl(env);
}

const DATABASE_ROLE_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

export function validateProductionDatabaseRoles(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== "production") return;
  const runtimeRole = env.DATABASE_RUNTIME_ROLE?.trim();
  const migrationRole = env.DATABASE_MIGRATION_ROLE?.trim();
  if (!runtimeRole || !migrationRole) {
    throw new Error(
      "DATABASE_RUNTIME_ROLE and DATABASE_MIGRATION_ROLE are required in production",
    );
  }
  if (
    !DATABASE_ROLE_PATTERN.test(runtimeRole) ||
    !DATABASE_ROLE_PATTERN.test(migrationRole)
  ) {
    throw new Error("Production database role names are invalid");
  }
  if (runtimeRole === migrationRole) {
    throw new Error("Runtime and migration database roles must be different");
  }
  if (
    runtimeRole !== "storesync_app" ||
    migrationRole !== "storesync_migrator"
  ) {
    throw new Error(
      "Production database roles must be storesync_app and storesync_migrator",
    );
  }
}

export function assertDevelopmentSeedEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to run the development seed in production");
  }
  const value = getDatabaseUrl(env);
  const url = new URL(value);
  const databaseName = url.pathname.replace(/^\//, "");
  const localHost = ["localhost", "127.0.0.1", "::1", "postgres"].includes(
    url.hostname,
  );
  const explicitlyNonProduction = /(^|[_-])(dev|local|test|qa)($|[_-])/i.test(
    databaseName,
  );
  if (
    (!localHost && !explicitlyNonProduction) ||
    /prod(uction)?/i.test(`${url.hostname}/${databaseName}`)
  ) {
    throw new Error(
      "Refusing unsafe development seed database: use a local or explicitly dev/test/qa database",
    );
  }
}

export function validateProductionEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): void {
  validateMarketEnvironment(env);
  validatePilotFeatureEnvironment(env);
  getResilienceConfig(env);
  if (env.NODE_ENV !== "production") return;
  if (env.EXPOSE_DEVELOPMENT_OTP === "true") {
    throw new Error("EXPOSE_DEVELOPMENT_OTP cannot be enabled in production");
  }
  const required = [
    "DATABASE_URL",
    "REDIS_URL",
    "CORS_ORIGIN",
    "APP_URL",
    "JWT_SECRET",
    "COOKIE_SECRET",
    "ENCRYPTION_KEY",
    "SIGNATURE_SECRET",
    "PAYMENT_ENCRYPTION_KEY",
    "OTP_HASH_SECRET",
    "JWT_ISSUER",
    "JWT_AUDIENCE",
    "DATABASE_RUNTIME_ROLE",
    "DATABASE_MIGRATION_ROLE",
  ] as const;
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length)
    throw new Error(
      `Missing required production configuration: ${missing.join(", ")}`,
    );
  for (const name of [
    "DATABASE_URL",
    "REDIS_URL",
    "CORS_ORIGIN",
    "APP_URL",
  ] as const) {
    try {
      const value = new URL(env[name]!);
      if (
        ["DATABASE_URL", "MIGRATION_DATABASE_URL"].includes(name) &&
        !["postgres:", "postgresql:"].includes(value.protocol)
      ) {
        throw new Error("DATABASE_URL must use postgres or postgresql");
      }
      if (
        name === "REDIS_URL" &&
        !["redis:", "rediss:"].includes(value.protocol)
      ) {
        throw new Error("REDIS_URL must use redis or rediss");
      }
      if (["CORS_ORIGIN", "APP_URL"].includes(name)) {
        if (value.protocol !== "https:") {
          throw new Error(`${name} must use https in production`);
        }
        if (value.origin !== env[name] || value.username || value.password) {
          throw new Error(
            `${name} must be an origin without credentials or a path`,
          );
        }
      }
    } catch {
      throw new Error(`${name} must be a valid absolute URL`);
    }
  }
  const runtimeDatabase = new URL(env.DATABASE_URL!);
  if (runtimeDatabase.username !== env.DATABASE_RUNTIME_ROLE) {
    throw new Error("DATABASE_URL username must match DATABASE_RUNTIME_ROLE");
  }
  if (env.MIGRATION_DATABASE_URL) {
    let migrationDatabase: URL;
    try {
      migrationDatabase = new URL(env.MIGRATION_DATABASE_URL);
    } catch {
      throw new Error("MIGRATION_DATABASE_URL must be a valid absolute URL");
    }
    if (!["postgres:", "postgresql:"].includes(migrationDatabase.protocol)) {
      throw new Error("MIGRATION_DATABASE_URL must use postgres or postgresql");
    }
    if (migrationDatabase.username !== env.DATABASE_MIGRATION_ROLE) {
      throw new Error(
        "MIGRATION_DATABASE_URL username must match DATABASE_MIGRATION_ROLE",
      );
    }
  }
  if (!/^[a-f0-9]{64}$/i.test(env.PAYMENT_ENCRYPTION_KEY!)) {
    throw new Error(
      "PAYMENT_ENCRYPTION_KEY must be exactly 64 hexadecimal characters",
    );
  }
  const secretNames = [
    "JWT_SECRET",
    "COOKIE_SECRET",
    "ENCRYPTION_KEY",
    "SIGNATURE_SECRET",
    "OTP_HASH_SECRET",
    "PAYMENT_ENCRYPTION_KEY",
  ] as const;
  const normalizedSecrets = secretNames.map((name) => env[name]!.trim());
  if (new Set(normalizedSecrets).size !== normalizedSecrets.length) {
    throw new Error("Production cryptographic secrets must be unique");
  }
  const obviousSecret =
    /^(change[-_ ]?me|password|secret|example|placeholder|development|test|storesync)$/i;
  if (normalizedSecrets.some((value) => obviousSecret.test(value))) {
    throw new Error(
      "Production cryptographic secrets cannot use placeholder values",
    );
  }
  const redisUrl = new URL(env.REDIS_URL!);
  if (redisUrl.protocol !== "rediss:") {
    const explicitlyPrivate =
      env.REDIS_ALLOW_PLAINTEXT_PRIVATE === "true" &&
      (/^(localhost|127\.0\.0\.1|::1)$/i.test(redisUrl.hostname) ||
        !redisUrl.hostname.includes(".") ||
        /\.(internal|local)$/i.test(redisUrl.hostname));
    if (!explicitlyPrivate) {
      throw new Error(
        "REDIS_URL must use rediss in production unless an explicitly private network exception is configured",
      );
    }
  }
  const rateLimitMax = Number(env.RATE_LIMIT_MAX_REQUESTS ?? "100");
  const rateLimitWindowMs = Number(env.RATE_LIMIT_WINDOW_MS ?? "900000");
  if (
    !Number.isSafeInteger(rateLimitMax) ||
    rateLimitMax < 10 ||
    rateLimitMax > 10_000
  ) {
    throw new Error(
      "RATE_LIMIT_MAX_REQUESTS must be an integer between 10 and 10000",
    );
  }
  if (
    !Number.isSafeInteger(rateLimitWindowMs) ||
    rateLimitWindowMs < 1_000 ||
    rateLimitWindowMs > 86_400_000
  ) {
    throw new Error(
      "RATE_LIMIT_WINDOW_MS must be an integer between 1000 and 86400000",
    );
  }
  if (env.DATABASE_SSL !== "true") {
    throw new Error("DATABASE_SSL=true is required in production");
  }
  if (env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false") {
    throw new Error(
      "DATABASE_SSL_REJECT_UNAUTHORIZED cannot be false in production",
    );
  }
  if (env.REQUIRE_LEAST_PRIVILEGE_DATABASE_ROLE !== "true") {
    throw new Error(
      "REQUIRE_LEAST_PRIVILEGE_DATABASE_ROLE=true is required in production",
    );
  }
  validateProductionDatabaseRoles(env);
  if (
    env.TRUST_PROXY_HOPS !== undefined &&
    !/^[1-3]$/.test(env.TRUST_PROXY_HOPS)
  ) {
    throw new Error("TRUST_PROXY_HOPS must be an integer from 1 to 3");
  }
  if (
    Buffer.byteLength(env.JWT_SECRET!, "utf8") < 32 ||
    Buffer.byteLength(env.COOKIE_SECRET!, "utf8") < 32 ||
    Buffer.byteLength(env.ENCRYPTION_KEY!, "utf8") < 32 ||
    Buffer.byteLength(env.SIGNATURE_SECRET!, "utf8") < 32 ||
    Buffer.byteLength(env.OTP_HASH_SECRET!, "utf8") < 32
  ) {
    throw new Error(
      "JWT_SECRET, COOKIE_SECRET, ENCRYPTION_KEY, SIGNATURE_SECRET, and OTP_HASH_SECRET must each be at least 32 bytes",
    );
  }
  validateProductionIntegrations(env);
}
