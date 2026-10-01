import dotenv from "dotenv";

import { buildApp } from "./app.js";
import { getResilienceConfig } from "./config/resilience.js";
import { logger } from "./utils/logger.js";
import { createShutdownHandler } from "./utils/lifecycle.js";

dotenv.config();

const resilience = getResilienceConfig();
const fastify = await buildApp("node");

try {
  const port = Number.parseInt(process.env.PORT || "3001", 10);
  const host = process.env.HOST || "0.0.0.0";
  await fastify.listen({ port, host });
  logger.info(`Server listening on ${host}:${port}`);
} catch (error) {
  fastify.log.error(error);
  await fastify.close().catch((closeError: unknown) => {
    logger.error("Failed to clean up after startup error", {
      error:
        closeError instanceof Error
          ? closeError.message
          : "UNKNOWN_STARTUP_CLEANUP_ERROR",
    });
  });
  process.exit(1);
}

const shutdown = createShutdownHandler({
  fastify,
  timeoutMs: resilience.shutdownTimeoutMs,
});
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
