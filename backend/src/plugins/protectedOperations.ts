import { FastifyInstance } from "fastify";
import { adminRoutes } from "../routes/admin.js";
import { customerRoutes } from "../routes/customers.js";
import { consentRoutes } from "../routes/consent.js";
import { ruleRoutes } from "../routes/rules.js";
import { posRoutes } from "../routes/pos.js";
import { offlineRoutes } from "../routes/offline.js";
import { alertRoutes } from "../routes/alerts.js";
import { metricRoutes } from "../routes/metrics.js";
import { kpiRoutes } from "../routes/kpi.js";
import { offlineSyncRoutes } from "../routes/offlineSync.js";
import { syncStatusRoutes } from "../routes/syncStatus.js";
import { paymentRoutes } from "../routes/payments.js";
import { supplierRoutes } from "../routes/suppliers.js";
import { purchaseOrderRoutes } from "../routes/purchaseOrders.js";
import { receivingRoutes } from "../routes/receiving.js";
import { batchRoutes } from "../routes/batches.js";
import { transferRoutes } from "../routes/transfers.js";
import { shiftRoutes } from "../routes/shifts.js";
import { tenderReconciliationRoutes } from "../routes/tenderReconciliation.js";
import { staffRoutes } from "../routes/staff.js";
import { auditReportRoutes } from "../routes/auditReports.js";
import { posDeviceRoutes } from "../routes/posDevices.js";
import { authenticateStaff } from "../middleware/authentication.js";
import { csrfMatches } from "../utils/csrf.js";
import { deferredFeatureEnabled } from "../config/releaseFeatures.js";
import { bindAuthenticatedAuditActor } from "../utils/auditActor.js";
import {
  assertProtectedResourceScope,
  ProtectedResourceScopeError,
} from "./protectedResourceScope.js";
import { recordSecurityEvent } from "../services/securityEventService.js";

const roleAccess: Record<string, string[]> = {
  CASHIER: ["/pos", "/shifts", "/payments"],
  INVENTORY: ["/batches", "/transfers", "/receiving"],
  MANAGER: [
    "/pos",
    "/shifts",
    "/payments",
    "/batches",
    "/transfers",
    "/receiving",
    "/suppliers",
    "/purchase-orders",
    "/alerts",
    "/metrics",
    "/kpi",
    "/audit",
  ],
  ADMIN: ["*"],
  STORE_MANAGER: [
    "/pos",
    "/shifts",
    "/payments",
    "/batches",
    "/transfers",
    "/receiving",
    "/suppliers",
    "/purchase-orders",
    "/alerts",
    "/metrics",
    "/kpi",
    "/audit",
  ],
  INVENTORY_CONTROLLER: ["/batches", "/transfers", "/receiving"],
  PLATFORM_ADMIN: ["*"],
  HEAD_OFFICE_ADMIN: ["*"],
};

const capabilityAccess: Array<{
  prefix: string;
  read: string[];
  write: string[];
}> = [
  { prefix: "/pos", read: ["pos.execute"], write: ["pos.execute"] },
  { prefix: "/shifts", read: ["shifts.manage"], write: ["shifts.manage"] },
  {
    prefix: "/tender-reconciliations",
    read: ["reconciliation.read", "reconciliation.manage"],
    write: ["reconciliation.manage"],
  },
  {
    prefix: "/pos-devices",
    read: ["devices.manage"],
    write: ["devices.manage"],
  },
  {
    prefix: "/sync-status",
    read: ["devices.manage"],
    write: ["devices.manage"],
  },
  {
    prefix: "/offline-sync",
    read: ["devices.manage"],
    write: ["devices.manage"],
  },
  { prefix: "/batches", read: ["inventory.read"], write: ["inventory.adjust"] },
  {
    prefix: "/transfers",
    read: ["transfers.request", "transfers.approve"],
    write: ["transfers.request", "transfers.approve"],
  },
  {
    prefix: "/receiving",
    read: ["procurement.read"],
    write: ["procurement.manage"],
  },
  {
    prefix: "/suppliers",
    read: ["procurement.read"],
    write: ["procurement.manage"],
  },
  {
    prefix: "/purchase-orders",
    read: ["procurement.read"],
    write: ["procurement.manage"],
  },
  {
    prefix: "/payments",
    read: ["orders.read"],
    write: ["orders.modify"],
  },
  { prefix: "/staff", read: ["staff.read"], write: ["staff.manage"] },
];

export function requiresStepUpMfa(method: string, routePath: string): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return false;
  return (
    routePath === "/staff" ||
    routePath.startsWith("/staff/") ||
    /^\/payments\/.+\/refund$/.test(routePath) ||
    routePath === "/payments/reconcile" ||
    /\/tender-reconciliations\/[^/]+\/(?:resolve|status)$/.test(routePath)
  );
}

export async function protectedOperations(fastify: FastifyInstance) {
  fastify.addHook("preHandler", async (request, reply) => {
    try {
      await authenticateStaff(request, reply);
      if (reply.sent) return;
      if (!csrfMatches(request)) {
        return reply.status(403).send({
          error: "CSRF validation failed",
          code: "CSRF_INVALID",
          requestId: request.id,
        });
      }
      bindAuthenticatedAuditActor(request);
    } catch {
      return reply.status(401).send({ error: "Staff authentication required" });
    }

    const user = request.user as {
      roleKey?: string;
      role?: string;
      capabilities?: string[];
      scopeType?: string;
      storeId?: string;
      mfaEnabled?: boolean;
      mfaVerified?: boolean;
    };
    const routePath = request.url.replace(/^\/api/, "").split("?")[0];
    try {
      // Global actors still require self/system/MFA target protections. The
      // resolver itself skips only the store-membership portion for them.
      await assertProtectedResourceScope(request);
    } catch (error) {
      const scopedError =
        error instanceof ProtectedResourceScopeError ? error : undefined;
      await recordSecurityEvent(request, {
        eventType: "SCOPE_ACCESS_DENIED",
        entityType: "authorization",
        details: {
          route: routePath,
          method: request.method,
          code: scopedError?.code || "STORE_SCOPE_DENIED",
        },
      });
      return reply.status(403).send({
        error: scopedError?.message || "Store is outside the staff scope",
        code: scopedError?.code || "STORE_SCOPE_DENIED",
      });
    }
    const resource = capabilityAccess.find(
      (item) =>
        routePath === item.prefix || routePath.startsWith(`${item.prefix}/`),
    );
    const hasSystemAccess =
      user.roleKey === "platform_admin" ||
      user.capabilities?.includes("system.manage");
    if (resource) {
      let required = ["GET", "HEAD"].includes(request.method)
        ? resource.read
        : resource.write;
      if (resource.prefix === "/payments") {
        if (routePath.includes("/refund")) required = ["refunds.approve"];
        else if (routePath.includes("/reconcile"))
          required = ["reconciliation.manage"];
      }
      if (
        !hasSystemAccess &&
        !required.some((capability) => user.capabilities?.includes(capability))
      ) {
        await recordSecurityEvent(request, {
          eventType: "CAPABILITY_DENIED",
          entityType: "authorization",
          details: { route: routePath, method: request.method, required },
        });
        return reply.status(403).send({
          error: "Your staff capabilities do not permit this operation",
          requiredCapabilities: required,
        });
      }
      if (
        requiresStepUpMfa(request.method, routePath) &&
        (!user.mfaEnabled || !user.mfaVerified)
      ) {
        await recordSecurityEvent(request, {
          eventType: "STEP_UP_MFA_REQUIRED",
          entityType: "authorization",
          details: { route: routePath, method: request.method },
        });
        return reply.status(403).send({
          error: "Verified MFA is required for this high-risk operation",
          code: "MFA_REQUIRED",
        });
      }
      return;
    }

    const allowed =
      roleAccess[String(user.roleKey || user.role || "").toUpperCase()] || [];
    if (
      !allowed.includes("*") &&
      !allowed.some((prefix) => routePath.startsWith(prefix))
    ) {
      await recordSecurityEvent(request, {
        eventType: "ROLE_ACCESS_DENIED",
        entityType: "authorization",
        details: { route: routePath, method: request.method },
      });
      return reply
        .status(403)
        .send({ error: "Your staff role does not permit this operation" });
    }
  });

  fastify.addHook("onResponse", async (request, reply) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      reply.statusCode < 400 &&
      request.user
    ) {
      await recordSecurityEvent(request, {
        eventType: "OPERATION_MUTATION",
        entityType: "staff_operation",
        details: {
          route: request.routeOptions.url,
          method: request.method,
          statusCode: reply.statusCode,
        },
      });
    }
  });

  await fastify.register(adminRoutes, { prefix: "/admin" });
  await fastify.register(customerRoutes, { prefix: "/customers" });
  await fastify.register(consentRoutes, { prefix: "/consent" });
  await fastify.register(posRoutes, { prefix: "/pos" });
  await fastify.register(supplierRoutes);
  await fastify.register(purchaseOrderRoutes);
  await fastify.register(receivingRoutes);
  await fastify.register(batchRoutes);
  await fastify.register(transferRoutes);
  await fastify.register(shiftRoutes);
  await fastify.register(tenderReconciliationRoutes);
  await fastify.register(staffRoutes);
  await fastify.register(auditReportRoutes);
  if (deferredFeatureEnabled("ENABLE_PROMOTION_ENGINE")) {
    await fastify.register(ruleRoutes, { prefix: "/rules" });
  }
  if (deferredFeatureEnabled("ENABLE_OFFLINE_SYNC")) {
    await fastify.register(offlineRoutes, { prefix: "/offline" });
    await fastify.register(offlineSyncRoutes);
    await fastify.register(syncStatusRoutes);
  }
  if (deferredFeatureEnabled("ENABLE_ADVANCED_ANALYTICS")) {
    await fastify.register(alertRoutes, { prefix: "/alerts" });
    await fastify.register(metricRoutes, { prefix: "/metrics" });
    await fastify.register(kpiRoutes);
  }
  if (deferredFeatureEnabled("ENABLE_ELECTRONIC_PAYMENTS")) {
    await fastify.register(paymentRoutes);
  }
  if (deferredFeatureEnabled("ENABLE_HARDWARE_DEVICES")) {
    await fastify.register(posDeviceRoutes);
  }
}
