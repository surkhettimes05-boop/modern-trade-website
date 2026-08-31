import pg from "pg";
import { logger } from "../utils/logger.js";
import { getDatabaseUrl } from "../config/environment.js";
import { getResilienceConfig } from "../config/resilience.js";
import {
  currentRequestDatabasePool,
  currentRequestId,
  setCurrentRequestDatabasePool,
} from "../utils/requestContext.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

function createPool(): pg.Pool {
  const limits = getResilienceConfig();
  const createdPool = new Pool({
    connectionString: getDatabaseUrl(),
    ssl:
      process.env.CLOUDFLARE_WORKER !== "true" &&
      process.env.DATABASE_SSL === "true"
        ? {
            rejectUnauthorized:
              process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
          }
        : false,
    max: limits.databasePoolMax,
    idleTimeoutMillis: limits.databaseIdleTimeoutMs,
    connectionTimeoutMillis: limits.databaseConnectionTimeoutMs,
    statement_timeout: limits.databaseStatementTimeoutMs,
    query_timeout: limits.databaseQueryTimeoutMs,
    lock_timeout: limits.databaseLockTimeoutMs,
    idle_in_transaction_session_timeout:
      limits.databaseIdleTransactionTimeoutMs,
  });

  createdPool.on("error", (err: Error) => {
    logger.error("Unexpected error on idle client", err);
  });

  createdPool.on("connect", () => {
    logger.debug("New database client connected");
  });

  createdPool.on("remove", () => {
    logger.debug("Database client removed");
  });
  return createdPool;
}

export const getPool = (): pg.Pool => {
  if (process.env.CLOUDFLARE_WORKER === "true") {
    const requestPool = currentRequestDatabasePool();
    if (requestPool) return requestPool;
    const createdPool = createPool();
    setCurrentRequestDatabasePool(createdPool);
    return createdPool;
  }

  if (!pool) {
    pool = createPool();
  }

  return pool;
};

export const query = async (
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult> => {
  const start = Date.now();
  const limits = getResilienceConfig();
  const operation =
    text
      .trimStart()
      .match(/^([A-Za-z]+)/)?.[1]
      ?.toUpperCase() || "UNKNOWN";
  try {
    const result = await getPool().query(text, params);
    const duration = Date.now() - start;
    const metadata = {
      operation,
      duration,
      rows: result.rowCount,
      requestId: currentRequestId(),
    };
    if (duration >= limits.slowQueryMs) {
      logger.warn("Slow database query", metadata);
    } else {
      logger.debug("Executed query", metadata);
    }
    return result;
  } catch (error) {
    logger.error("Query error", {
      operation,
      duration: Date.now() - start,
      requestId: currentRequestId(),
      errorCode:
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "DATABASE_ERROR",
    });
    throw error;
  }
};

export const closePool = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info("Database pool closed");
  }
};
