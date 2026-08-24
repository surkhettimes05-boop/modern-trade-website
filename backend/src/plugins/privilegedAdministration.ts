import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authenticateStaff } from "../middleware/authentication.js";
import { csrfMatches } from "../utils/csrf.js";
import { stockReservationRoutes } from "../routes/stockReservations.js";
import { deliveryZoneRoutes } from "../routes/deliveryZones.js";
import { codPolicyRoutes } from "../routes/codPolicies.js";
import { orderLifecycleRoutes } from "../routes/orderLifecycle.js";
import { productSearchRoutes } from "../routes/productSearch.js";
import { deliveryRoutes } from "../routes/deliveries.js";
import { notificationRoutes } from "../routes/notifications.js";
import { supportRoutes } from "../routes/support.js";
import { productionCacheRoutes } from "../routes/productionCache.js";
import { observabilityRoutes } from "../routes/observability.js";
import { auditTrailRoutes } from "../routes/auditTrails.js";
import { securityIncidentRoutes } from "../routes/securityIncidents.js";
import { encryptionRoutes } from "../routes/encryption.js";
import { promotionRoutes } from "../routes/promotions.js";
import { customerSegmentRoutes } from "../routes/customerSegments.js";
import { analyticsRoutes } from "../routes/analytics.js";
import { hardwarePeripheralRoutes } from "../routes/hardwarePeripherals.js";
import { offlineDataRoutes } from "../routes/offlineData.js";
import { strapiRoutes } from "../routes/strapi.js";
import { cloudflareRoutes } from "../routes/cloudflare.js";
import { irdTaxRoutes } from "../routes/irdTax.js";
import { fiscalSignatureRoutes } from "../routes/fiscalSignatures.js";
import { complianceReportRoutes } from "../routes/complianceReports.js";
import { deferredFeatureEnabled } from "../config/releaseFeatures.js";
import { bindAuthenticatedAuditActor } from "../utils/auditActor.js";
import { recordSecurityEvent } from "../services/securityEventService.js";

export async function requirePrivilegedAdministration(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await authenticateStaff(request, reply);
  if (reply.sent) return;

  const user = request.user as {
    roleKey?: string;
    capabilities?: string[];
    mfaEnabled?: boolean;
    mfaVerified?: boolean;
  };
  const privileged =
    user.roleKey === "platform_admin" ||
    user.capabilities?.includes("system.manage");
  if (!privileged) {
    await recordSecurityEvent(request, {
      eventType: "ADMIN_ACCESS_DENIED",
      entityType: "authorization",
      details: { route: request.url.split("?", 1)[0], reason: "capability" },
    });
    await reply.status(403).send({
      error: "Privileged administration access required",
      code: "ADMIN_CAPABILITY_REQUIRED",
    });
    return;
  }

  if (!user.mfaEnabled || !user.mfaVerified) {
    await recordSecurityEvent(request, {
      eventType: "ADMIN_ACCESS_DENIED",
      entityType: "authorization",
      details: { route: request.url.split("?", 1)[0], reason: "mfa" },
    });
    await reply.status(403).send({
      error: "Verified MFA is required for privileged administration",
      code: "MFA_REQUIRED",
    });
    return;
  }

  if (!csrfMatches(request)) {
    await recordSecurityEvent(request, {
      eventType: "ADMIN_ACCESS_DENIED",
      entityType: "authorization",
      details: { route: request.url.split("?", 1)[0], reason: "csrf" },
    });
    await reply.status(403).send({
      error: "CSRF validation failed",
      code: "CSRF_INVALID",
      requestId: request.id,
    });
  }
}

/**
 * Routes in this plugin operate on infrastructure, security material, or data
 * spanning customers/stores. Fastify encapsulation makes the guard apply to
 * every route registered here, including future handlers added to a module.
 */
export async function privilegedAdministration(fastify: FastifyInstance) {
  fastify.addHook("onRequest", requirePrivilegedAdministration);
  fastify.addHook("preHandler", async (request) => {
    bindAuthenticatedAuditActor(request);
  });
  fastify.addHook("onResponse", async (request, reply) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      reply.statusCode < 400 &&
      request.user
    ) {
      await recordSecurityEvent(request, {
        eventType: "PRIVILEGED_MUTATION",
        entityType: "administration",
        details: {
          route: request.routeOptions.url,
          method: request.method,
          statusCode: reply.statusCode,
        },
      });
    }
  });

  await fastify.register(stockReservationRoutes);
  await fastify.register(deliveryZoneRoutes);
  await fastify.register(codPolicyRoutes);
  await fastify.register(orderLifecycleRoutes);
  await fastify.register(productSearchRoutes);
  await fastify.register(deliveryRoutes);
  await fastify.register(notificationRoutes);
  await fastify.register(supportRoutes);
  await fastify.register(productionCacheRoutes);
  await fastify.register(observabilityRoutes);
  await fastify.register(auditTrailRoutes);
  await fastify.register(securityIncidentRoutes);
  await fastify.register(encryptionRoutes);

  if (deferredFeatureEnabled("ENABLE_PROMOTION_ENGINE")) {
    await fastify.register(promotionRoutes);
  }
  if (deferredFeatureEnabled("ENABLE_CUSTOMER_SEGMENTS")) {
    await fastify.register(customerSegmentRoutes);
  }
  if (deferredFeatureEnabled("ENABLE_ADVANCED_ANALYTICS")) {
    await fastify.register(analyticsRoutes);
  }
  if (deferredFeatureEnabled("ENABLE_HARDWARE_DEVICES")) {
    await fastify.register(hardwarePeripheralRoutes);
  }
  if (deferredFeatureEnabled("ENABLE_OFFLINE_SYNC")) {
    await fastify.register(offlineDataRoutes);
  }
  if (deferredFeatureEnabled("ENABLE_EXTERNAL_CMS_CDN")) {
    await fastify.register(strapiRoutes);
    await fastify.register(cloudflareRoutes);
  }
  if (deferredFeatureEnabled("ENABLE_EXTERNAL_TAX_INTEGRATION")) {
    await fastify.register(irdTaxRoutes);
  }
  if (deferredFeatureEnabled("ENABLE_FISCAL_COMPLIANCE_INTEGRATION")) {
    await fastify.register(fiscalSignatureRoutes);
    await fastify.register(complianceReportRoutes);
  }
}
