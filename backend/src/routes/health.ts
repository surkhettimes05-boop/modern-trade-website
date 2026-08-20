import { FastifyInstance } from "fastify";
import { getIntegrationSnapshot } from "../config/integrations.js";
import { redisService } from "../services/redisService.js";

export async function healthRoutes(fastify: FastifyInstance) {
  const liveness = async () => {
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

  fastify.get("/integrations", async () => ({
    status: "ok",
    integrations: getIntegrationSnapshot(),
  }));

  fastify.get("/ready", async (_, reply) => {
    try {
      const { query } = await import("../database/connection.js");
      await query("SELECT 1");
      const migration = await query(
        "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE migration_id = '020_explicit_deny_supabase_api') AS current",
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
