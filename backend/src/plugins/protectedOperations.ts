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
import { requireStoreAccess } from "./authorization.js";
import { deferredFeatureEnabled } from "../config/releaseFeatures.js";

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
  { prefix: "/payments", read: ["orders.read"], write: ["orders.read"] },
];

function routeStoreId(request: any): string | undefined {
  const body =
    request.body && typeof request.body === "object" ? request.body : {};
  const params =
    request.params && typeof request.params === "object" ? request.params : {};
  const query =
    request.query && typeof request.query === "object" ? request.query : {};
  return (
    body.store_id ||
    body.storeId ||
    params.storeId ||
    query.store_id ||
    query.storeId
  );
}

export async function protectedOperations(fastify: FastifyInstance) {
  fastify.addHook("onRequest", async (request, reply) => {
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
    } catch {
      return reply.status(401).send({ error: "Staff authentication required" });
    }

    const user = request.user as {
      roleKey?: string;
      role?: string;
      capabilities?: string[];
      scopeType?: string;
      storeId?: string;
    };
    const routePath = request.url.replace(/^\/api/, "").split("?")[0];
    const resource = capabilityAccess.find(
      (item) =>
        routePath === item.prefix || routePath.startsWith(`${item.prefix}/`),
    );
    const hasSystemAccess =
      user.roleKey === "platform_admin" ||
      user.capabilities?.includes("system.manage");
    if (resource) {
      const required = ["GET", "HEAD"].includes(request.method)
        ? resource.read
        : resource.write;
      if (
        !hasSystemAccess &&
        !required.some((capability) => user.capabilities?.includes(capability))
      ) {
        return reply.status(403).send({
          error: "Your staff capabilities do not permit this operation",
          requiredCapabilities: required,
        });
      }
      const storeId = routeStoreId(request);
      if (storeId) {
        try {
          await requireStoreAccess(request, storeId);
        } catch {
          return reply.status(403).send({
            error: "Store is outside the staff scope",
            code: "STORE_SCOPE_DENIED",
          });
        }
      } else if (["STORE", "OWN_REGISTER"].includes(String(user.scopeType))) {
        return reply.status(400).send({
          error: "Store ID is required for store-scoped operations",
          code: "STORE_ID_REQUIRED",
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
      return reply
        .status(403)
        .send({ error: "Your staff role does not permit this operation" });
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
