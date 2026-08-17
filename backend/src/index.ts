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
import { stockReservationRoutes } from "./routes/stockReservations.js";
import { deliveryZoneRoutes } from "./routes/deliveryZones.js";
import { codPolicyRoutes } from "./routes/codPolicies.js";
import { orderLifecycleRoutes } from "./routes/orderLifecycle.js";
import { productSearchRoutes } from "./routes/productSearch.js";
import { deliveryRoutes } from "./routes/deliveries.js";
import { loyaltyRoutes } from "./routes/loyalty.js";
import { promotionRoutes } from "./routes/promotions.js";
import { customerSegmentRoutes } from "./routes/customerSegments.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { notificationRoutes } from "./routes/notifications.js";
import { supportRoutes } from "./routes/support.js";
import { hardwarePeripheralRoutes } from "./routes/hardwarePeripherals.js";
import { offlineDataRoutes } from "./routes/offlineData.js";
import { unifiedLoyaltyRoutes } from "./routes/unifiedLoyalty.js";
import { strapiRoutes } from "./routes/strapi.js";
import { cloudflareRoutes } from "./routes/cloudflare.js";
import { productionCacheRoutes } from "./routes/productionCache.js";
import { observabilityRoutes } from "./routes/observability.js";
import { irdTaxRoutes } from "./routes/irdTax.js";
import { auditTrailRoutes } from "./routes/auditTrails.js";
import { fiscalSignatureRoutes } from "./routes/fiscalSignatures.js";
import { securityIncidentRoutes } from "./routes/securityIncidents.js";
import { encryptionRoutes } from "./routes/encryption.js";
import { complianceReportRoutes } from "./routes/complianceReports.js";
import { protectedOperations } from "./plugins/protectedOperations.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { logger } from "./utils/logger.js";
import { validateProductionEnvironment } from "./config/environment.js";
import { redisService } from "./services/redisService.js";

dotenv.config();

validateProductionEnvironment();

const fastify = Fastify({
  logger: true,
  trustProxy: process.env.TRUST_PROXY_HOPS
    ? Number.parseInt(process.env.TRUST_PROXY_HOPS, 10)
    : false,
});

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
  skipOnError: true,
});

await fastify.register(jwt, {
  secret: process.env.JWT_SECRET || (() => { throw new Error("JWT_SECRET is required"); })(),
  cookie: { cookieName: "ops_session", signed: false },
});

await fastify.register(cookie, {
  secret: process.env.COOKIE_SECRET || (() => { throw new Error("COOKIE_SECRET is required"); })(),
  hook: "onRequest",
});

// Register routes
await fastify.register(healthRoutes, { prefix: "/api/health" });
await fastify.register(publicRoutes, { prefix: "/api/public" });

await redisService.connect();
fastify.addHook("onClose", async () => {
  await redisService.disconnect();
});

if (process.env.ENABLE_ADMIN_API === "true") {
  await fastify.register(authRoutes, { prefix: "/api/auth" });
  await fastify.register(operationsAuthRoutes, {
    prefix: "/api/operations-auth",
  });
  await fastify.register(protectedOperations, { prefix: "/api" });
  await fastify.register(shoppingCartRoutes, { prefix: "/api" });
  await fastify.register(checkoutRoutes, { prefix: "/api" });
  await fastify.register(webOrderRoutes, { prefix: "/api" });
  await fastify.register(addressRoutes, { prefix: "/api" });
  await fastify.register(stockReservationRoutes, { prefix: "/api" });
  await fastify.register(deliveryZoneRoutes, { prefix: "/api" });
  await fastify.register(codPolicyRoutes, { prefix: "/api" });
  await fastify.register(orderLifecycleRoutes, { prefix: "/api" });
  await fastify.register(productSearchRoutes, { prefix: "/api" });
  await fastify.register(deliveryRoutes, { prefix: "/api" });
  await fastify.register(loyaltyRoutes, { prefix: "/api" });
  await fastify.register(promotionRoutes, { prefix: "/api" });
  await fastify.register(customerSegmentRoutes, { prefix: "/api" });
  await fastify.register(analyticsRoutes, { prefix: "/api" });
  await fastify.register(notificationRoutes, { prefix: "/api" });
  await fastify.register(supportRoutes, { prefix: "/api" });
  await fastify.register(hardwarePeripheralRoutes, { prefix: "/api" });
  await fastify.register(offlineDataRoutes, { prefix: "/api" });
  await fastify.register(unifiedLoyaltyRoutes, { prefix: "/api" });
  await fastify.register(strapiRoutes, { prefix: "/api" });
  await fastify.register(cloudflareRoutes, { prefix: "/api" });
  await fastify.register(productionCacheRoutes, { prefix: "/api" });
  await fastify.register(observabilityRoutes, { prefix: "/api" });
  await fastify.register(irdTaxRoutes, { prefix: "/api" });
  await fastify.register(auditTrailRoutes, { prefix: "/api" });
  await fastify.register(fiscalSignatureRoutes, { prefix: "/api" });
  await fastify.register(securityIncidentRoutes, { prefix: "/api" });
  await fastify.register(encryptionRoutes, { prefix: "/api" });
  await fastify.register(complianceReportRoutes, { prefix: "/api" });
}

// Error handler
fastify.setErrorHandler(errorHandler);

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
