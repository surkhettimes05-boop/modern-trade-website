export interface ResilienceConfig {
  databasePoolMax: number;
  databaseIdleTimeoutMs: number;
  databaseConnectionTimeoutMs: number;
  databaseStatementTimeoutMs: number;
  databaseQueryTimeoutMs: number;
  databaseLockTimeoutMs: number;
  databaseIdleTransactionTimeoutMs: number;
  slowQueryMs: number;
  httpRequestTimeoutMs: number;
  httpConnectionTimeoutMs: number;
  httpKeepAliveTimeoutMs: number;
  shutdownTimeoutMs: number;
}

function boundedInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a whole number`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

export function getResilienceConfig(
  env: NodeJS.ProcessEnv = process.env,
): ResilienceConfig {
  const config: ResilienceConfig = {
    databasePoolMax: boundedInteger(env, "DATABASE_POOL_MAX", 20, 1, 100),
    databaseIdleTimeoutMs: boundedInteger(
      env,
      "DATABASE_IDLE_TIMEOUT_MS",
      30_000,
      1_000,
      300_000,
    ),
    databaseConnectionTimeoutMs: boundedInteger(
      env,
      "DATABASE_CONNECTION_TIMEOUT_MS",
      10_000,
      500,
      60_000,
    ),
    databaseStatementTimeoutMs: boundedInteger(
      env,
      "DATABASE_STATEMENT_TIMEOUT_MS",
      15_000,
      500,
      120_000,
    ),
    databaseQueryTimeoutMs: boundedInteger(
      env,
      "DATABASE_QUERY_TIMEOUT_MS",
      17_000,
      500,
      130_000,
    ),
    databaseLockTimeoutMs: boundedInteger(
      env,
      "DATABASE_LOCK_TIMEOUT_MS",
      5_000,
      100,
      60_000,
    ),
    databaseIdleTransactionTimeoutMs: boundedInteger(
      env,
      "DATABASE_IDLE_TRANSACTION_TIMEOUT_MS",
      30_000,
      1_000,
      300_000,
    ),
    slowQueryMs: boundedInteger(env, "DATABASE_SLOW_QUERY_MS", 750, 1, 60_000),
    httpRequestTimeoutMs: boundedInteger(
      env,
      "HTTP_REQUEST_TIMEOUT_MS",
      15_000,
      1_000,
      120_000,
    ),
    httpConnectionTimeoutMs: boundedInteger(
      env,
      "HTTP_CONNECTION_TIMEOUT_MS",
      10_000,
      500,
      60_000,
    ),
    httpKeepAliveTimeoutMs: boundedInteger(
      env,
      "HTTP_KEEP_ALIVE_TIMEOUT_MS",
      72_000,
      1_000,
      120_000,
    ),
    shutdownTimeoutMs: boundedInteger(
      env,
      "SHUTDOWN_TIMEOUT_MS",
      25_000,
      1_000,
      29_000,
    ),
  };

  if (config.databaseQueryTimeoutMs < config.databaseStatementTimeoutMs) {
    throw new Error(
      "DATABASE_QUERY_TIMEOUT_MS must be greater than or equal to DATABASE_STATEMENT_TIMEOUT_MS",
    );
  }
  return config;
}
