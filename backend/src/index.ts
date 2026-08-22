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

dotenv.config();

validateProductionEnvironment();

const fastify = Fastify({
  logger: true,
  requestIdHeader: "x-request-id",
  trustProxy: process.env.TRUST_PROXY_HOPS
    ? Number.parseInt(process.env.TRUST_PROXY_HOPS, 10)
    : false,
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
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"),
  timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"),
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
  await redisService.disconnect();
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
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || "3001");
    const host = process.env.HOST || "0.0.0.0";

    await fastify.listen({ port, host });
    logger.info(`Server listening on ${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
