import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import dotenv from "dotenv";

import { healthRoutes } from "./routes/health.js";
import { publicRoutes } from "./routes/public.js";
import { authRoutes } from "./routes/auth.js";
import { shoppingCartRoutes } from "./routes/shoppingCart.js";
import { webOrderRoutes } from "./routes/webOrders.js";
import { operationsAuthRoutes } from "./routes/operationsAuth.js";
import { checkoutRoutes } from "./routes/checkout.js";
import { addressRoutes } from "./routes/addresses.js";
import { protectedOperations } from "./plugins/protectedOperations.js";
import { privilegedAdministration } from "./plugins/privilegedAdministration.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { logger } from "./utils/logger.js";
import { validateProductionEnvironment } from "./config/environment.js";
import { redisService } from "./services/redisService.js";
import { loyaltyMvpRoutes } from "./routes/loyaltyMvp.js";
import { paymentWebhookRoutes } from "./routes/payments.js";
import { deferredFeatureEnabled } from "./config/releaseFeatures.js";
import { verifyDatabaseSecurityPosture } from "./database/databaseSecurity.js";
import { getResilienceConfig } from "./config/resilience.js";
import { closePool } from "./database/connection.js";
import { runWithRequestContext } from "./utils/requestContext.js";
import { createShutdownHandler } from "./utils/lifecycle.js";
import { shutdownObservability } from "./instrumentation.js";

dotenv.config();

validateProductionEnvironment();
await verifyDatabaseSecurityPosture();
const resilience = getResilienceConfig();

const fastify = Fastify({
  logger: {
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "request.headers.authorization",
        "request.headers.cookie",
        "res.headers.set-cookie",
        "response.headers.set-cookie",
        "body.password",
        "body.otp_code",
        "body.phone",
        "body.email",
        "*.password",
        "*.token",
        "*.secret",
      ],
      censor: "[REDACTED]",
    },
  },
  // Keep a bounded default for every route; sensitive/public routes may set
  // stricter per-route limits below. This prevents unbounded buffering when a
  // newly added endpoint forgets to declare its own body limit.
  bodyLimit: 1024 * 1024,
  requestIdHeader: "x-request-id",
  requestTimeout: resilience.httpRequestTimeoutMs,
  connectionTimeout: resilience.httpConnectionTimeoutMs,
  keepAliveTimeout: resilience.httpKeepAliveTimeoutMs,
  return503OnClosing: true,
  trustProxy: process.env.TRUST_PROXY_HOPS
    ? Number.parseInt(process.env.TRUST_PROXY_HOPS, 10)
    : false,
});

fastify.addHook("onRequest", (request, _reply, done) => {
  runWithRequestContext(request.id, done);
});

await redisService.connect();

// Register plugins
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true,
});

await fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    },
  },
});

await fastify.register(rateLimit, {
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS || "100"),
  timeWindow: Number(process.env.RATE_LIMIT_WINDOW_MS || "900000"),
  redis: redisService.getClient(),
  skipOnError: false,
});

await fastify.register(jwt, {
  secret:
    process.env.JWT_SECRET ||
    (() => {
      throw new Error("JWT_SECRET is required");
    })(),
  cookie: { cookieName: "ops_session", signed: false },
  sign: {
    iss: process.env.JWT_ISSUER || "storesync-backend",
    aud: process.env.JWT_AUDIENCE || "storesync-operations",
  },
  verify: {
    allowedIss: process.env.JWT_ISSUER || "storesync-backend",
    allowedAud: process.env.JWT_AUDIENCE || "storesync-operations",
  },
});

await fastify.register(cookie, {
  secret:
    process.env.COOKIE_SECRET ||
    (() => {
      throw new Error("COOKIE_SECRET is required");
    })(),
  hook: "onRequest",
});

// Install the handler before registering encapsulated route plugins so their
// validation and runtime errors inherit the production-safe response policy.
fastify.setErrorHandler(errorHandler);

// Register routes
await fastify.register(healthRoutes, { prefix: "/api/health" });
await fastify.register(publicRoutes, { prefix: "/api/public" });
if (deferredFeatureEnabled("ENABLE_ELECTRONIC_PAYMENTS")) {
  await fastify.register(paymentWebhookRoutes, { prefix: "/api" });
}

fastify.addHook("onClose", async () => {
  const results = await Promise.allSettled([
    redisService.disconnect(),
    closePool(),
    shutdownObservability(),
  ]);
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failures.length) {
    throw new AggregateError(
      failures.map((failure) => failure.reason),
      "One or more backend dependencies failed to close",
    );
  }
});

await fastify.register(authRoutes, { prefix: "/api/auth" });
await fastify.register(shoppingCartRoutes, { prefix: "/api" });
await fastify.register(checkoutRoutes, { prefix: "/api" });
await fastify.register(addressRoutes, { prefix: "/api" });
await fastify.register(loyaltyMvpRoutes, { prefix: "/api" });

if (process.env.ENABLE_ADMIN_API === "true") {
  await fastify.register(operationsAuthRoutes, {
    prefix: "/api/operations-auth",
  });
  await fastify.register(protectedOperations, { prefix: "/api" });
  await fastify.register(webOrderRoutes, { prefix: "/api" });
  await fastify.register(privilegedAdministration, { prefix: "/api" });
}

// Start server
const start = async (): Promise<void> => {
  try {
    const port = parseInt(process.env.PORT || "3001");
    const host = process.env.HOST || "0.0.0.0";

    await fastify.listen({ port, host });
    logger.info(`Server listening on ${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
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
};

await start();

const shutdown = createShutdownHandler({
  fastify,
  timeoutMs: resilience.shutdownTimeoutMs,
});
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
