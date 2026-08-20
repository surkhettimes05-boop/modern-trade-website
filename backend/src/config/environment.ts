const TEST_DATABASE_PATTERN = /(^|[_-])test($|[_-])/i;
import { validateProductionIntegrations } from "./integrations.js";
import { MARKET, validateMarketEnvironment } from "./market.js";
import { validatePilotFeatureEnvironment } from "./releaseFeatures.js";

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

export function validateProductionEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): void {
  validateMarketEnvironment(env);
  validatePilotFeatureEnvironment(env);
  if (env.NODE_ENV !== "production") return;
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
  ] as const;
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length)
    throw new Error(
      `Missing required production configuration: ${missing.join(", ")}`,
    );
  for (const name of ["DATABASE_URL", "REDIS_URL", "CORS_ORIGIN", "APP_URL"] as const) {
    try {
      const value = new URL(env[name]!);
      if (name === "CORS_ORIGIN" && !["http:", "https:"].includes(value.protocol)) {
        throw new Error("CORS_ORIGIN must use http or https");
      }
    } catch {
      throw new Error(`${name} must be a valid absolute URL`);
    }
  }
  if (!/^[a-f0-9]{64}$/i.test(env.PAYMENT_ENCRYPTION_KEY!)) {
    throw new Error(
      "PAYMENT_ENCRYPTION_KEY must be exactly 64 hexadecimal characters",
    );
  }
  if (
    Buffer.byteLength(env.ENCRYPTION_KEY!, "utf8") < 32 ||
    Buffer.byteLength(env.SIGNATURE_SECRET!, "utf8") < 32
  ) {
    throw new Error(
      "ENCRYPTION_KEY and SIGNATURE_SECRET must each be at least 32 bytes",
    );
  }
  validateProductionIntegrations(env);
}
