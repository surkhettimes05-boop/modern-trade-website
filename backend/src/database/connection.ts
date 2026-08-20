import pg from "pg";
import { logger } from "../utils/logger.js";
import { getDatabaseUrl } from "../config/environment.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export const getPool = (): pg.Pool => {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      ssl:
        process.env.DATABASE_SSL === "true"
          ? { rejectUnauthorized: false }
          : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
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
  const operation = text.trimStart().match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() || "UNKNOWN";
  try {
    const result = await getPool().query(text, params);
    const duration = Date.now() - start;
    logger.debug("Executed query", {
      operation,
      duration,
      rows: result.rowCount,
    });
    return result;
  } catch (error) {
    logger.error("Query error", {
      operation,
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
