import { FastifyInstance } from "fastify";
import { getIntegrationSnapshot } from "../config/integrations.js";
import { redisService } from "../services/redisService.js";
import { LATEST_MIGRATION_ID } from "../database/migrationRunner.js";
import { isShuttingDown } from "../utils/lifecycle.js";

export async function healthRoutes(fastify: FastifyInstance) {
  const liveness = async () => {
    if (process.env.NODE_ENV === "production") return { status: "ok" };
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
    };
  };
  fastify.get("/", liveness);
  fastify.get("/live", liveness);

  fastify.get("/db", async (_, reply) => {
    try {
      const { query } = await import("../database/connection.js");
      await query("SELECT 1");
      return {
        status: "ok",
        database: "connected",
      };
    } catch {
      reply.status(503);
      return {
        status: "error",
        database: "disconnected",
      };
    }
  });

  fastify.get("/integrations", async (_, reply) => {
    if (process.env.NODE_ENV === "production") {
      return reply.status(404).send({ error: "Not found" });
    }
    return { status: "ok", integrations: getIntegrationSnapshot() };
  });

  fastify.get("/ready", async (_, reply) => {
    if (isShuttingDown()) {
      reply.status(503);
      return {
        status: "not_ready",
        checks: { application: "shutting_down" },
      };
    }
    try {
      const { query } = await import("../database/connection.js");
      await query("SELECT 1");
      const migration = await query(
        "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE migration_id = $1) AS current",
        [LATEST_MIGRATION_ID],
      );
      if (!migration.rows[0]?.current) {
        reply.status(503);
        return {
          status: "not_ready",
          checks: { database: "ok", migrations: "outdated", redis: "unknown" },
        };
      }
      const redisOk = await redisService.healthCheck();
      if (!redisOk) {
        reply.status(503);
        return {
          status: "not_ready",
          checks: { database: "ok", migrations: "current", redis: "failed" },
        };
      }
      return {
        status: "ready",
        checks: { database: "ok", migrations: "current", redis: "ok" },
      };
    } catch {
      reply.status(503);
      return {
        status: "not_ready",
        checks: { database: "failed", redis: "unknown" },
      };
    }
  });
}
