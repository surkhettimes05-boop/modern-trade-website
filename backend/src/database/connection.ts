import pg from "pg";
import { logger } from "../utils/logger.js";
import { getDatabaseUrl } from "../config/environment.js";
import { getResilienceConfig } from "../config/resilience.js";
import { currentRequestId } from "../utils/requestContext.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export const getPool = (): pg.Pool => {
  if (!pool) {
    const limits = getResilienceConfig();
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      ssl:
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

    pool.on("error", (err: Error) => {
      logger.error("Unexpected error on idle client", err);
    });

    pool.on("connect", () => {
      logger.debug("New database client connected");
    });

    pool.on("remove", () => {
      logger.debug("Database client removed");
    });
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
