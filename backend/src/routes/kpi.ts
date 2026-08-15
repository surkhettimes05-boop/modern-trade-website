import { FastifyInstance } from "fastify";
import { z } from "zod";
import { KPIService } from "../services/kpiService.js";

const kpiService = new KPIService();

export async function kpiRoutes(fastify: FastifyInstance) {
  // KPI: Get sales KPIs
  fastify.get("/kpi/sales", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
      business_date_from: z.coerce.date().optional(),
      business_date_to: z.coerce.date().optional(),
      limit: z.coerce.number().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const kpis = await kpiService.getSalesKPIs(filters);
      return reply.send(kpis);
    } catch {
      return reply.status(500).send({ error: "Failed to fetch sales KPIs" });
    }
  });

  // KPI: Get sales summary
  fastify.get("/kpi/sales/summary", async (request, reply) => {
    const schema = z.object({
      business_date_from: z.coerce.date().optional(),
      business_date_to: z.coerce.date().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const summary = await kpiService.getSalesKPISummary(filters);
      return reply.send(summary);
    } catch {
      return reply.status(500).send({ error: "Failed to fetch sales summary" });
    }
  });

  // KPI: Get customer KPIs
  fastify.get("/kpi/customers", async (request, reply) => {
    const schema = z.object({
      business_date_from: z.coerce.date().optional(),
      business_date_to: z.coerce.date().optional(),
      limit: z.coerce.number().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const kpis = await kpiService.getCustomerKPIs(filters);
      return reply.send(kpis);
    } catch {
      return reply.status(500).send({ error: "Failed to fetch customer KPIs" });
    }
  });

  // KPI: Get loyalty KPIs
  fastify.get("/kpi/loyalty", async (request, reply) => {
    const schema = z.object({
      business_date_from: z.coerce.date().optional(),
      business_date_to: z.coerce.date().optional(),
      limit: z.coerce.number().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const kpis = await kpiService.getLoyaltyKPIs(filters);
      return reply.send(kpis);
    } catch {
      return reply.status(500).send({ error: "Failed to fetch loyalty KPIs" });
    }
  });

  // KPI: Get returns KPIs
  fastify.get("/kpi/returns", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
      business_date_from: z.coerce.date().optional(),
      business_date_to: z.coerce.date().optional(),
      limit: z.coerce.number().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const kpis = await kpiService.getReturnsKPIs(filters);
      return reply.send(kpis);
    } catch {
      return reply.status(500).send({ error: "Failed to fetch returns KPIs" });
    }
  });

  // KPI: Get voids KPIs
  fastify.get("/kpi/voids", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
      business_date_from: z.coerce.date().optional(),
      business_date_to: z.coerce.date().optional(),
      limit: z.coerce.number().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const kpis = await kpiService.getVoidsKPIs(filters);
      return reply.send(kpis);
    } catch {
      return reply.status(500).send({ error: "Failed to fetch voids KPIs" });
    }
  });

  // KPI: Get offline queue KPIs
  fastify.get("/kpi/offline-queue", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
      business_date_from: z.coerce.date().optional(),
      business_date_to: z.coerce.date().optional(),
      limit: z.coerce.number().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const kpis = await kpiService.getOfflineQueueKPIs(filters);
      return reply.send(kpis);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to fetch offline queue KPIs" });
    }
  });

  // KPI: Get outstanding points
  fastify.get("/kpi/outstanding-points", async (_request, reply) => {
    try {
      const points = await kpiService.getOutstandingPoints();
      return reply.send({ outstanding_points: points });
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to fetch outstanding points" });
    }
  });

  // KPI: Get expiring points
  fastify.get("/kpi/expiring-points", async (request, reply) => {
    const schema = z.object({
      days: z.coerce.number().optional(),
    });

    const { days = 30 } = schema.parse(request.query);

    try {
      const points = await kpiService.getExpiringPoints(days);
      return reply.send({ expiring_points: points, days });
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to fetch expiring points" });
    }
  });

  // KPI: Get identified sales rate
  fastify.get("/kpi/identified-sales-rate", async (request, reply) => {
    const schema = z.object({
      business_date_from: z.coerce.date().optional(),
      business_date_to: z.coerce.date().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const rate = await kpiService.getIdentifiedSalesRate(filters);
      return reply.send({ identified_sales_rate: rate });
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to fetch identified sales rate" });
    }
  });

  // KPI: Get return/void rate
  fastify.get("/kpi/return-void-rate", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
      business_date_from: z.coerce.date().optional(),
      business_date_to: z.coerce.date().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const rates = await kpiService.getReturnVoidRate(filters);
      return reply.send(rates);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to fetch return/void rate" });
    }
  });

  // KPI: Get low stock count
  fastify.get("/kpi/low-stock", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const counts = await kpiService.getLowStockCount(filters.store_id);
      return reply.send(counts);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to fetch low stock count" });
    }
  });

  // KPI: Get stockout count
  fastify.get("/kpi/stockouts", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const counts = await kpiService.getStockoutCount(filters.store_id);
      return reply.send(counts);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to fetch stockout count" });
    }
  });

  // KPI: Get offline queue status
  fastify.get("/kpi/offline-queue-status", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const status = await kpiService.getOfflineQueueStatus(filters.store_id);
      return reply.send(status);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to fetch offline queue status" });
    }
  });

  // KPI: Get store sync status
  fastify.get("/kpi/store-sync-status", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const status = await kpiService.getStoreSyncStatus(filters.store_id);
      return reply.send(status);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to fetch store sync status" });
    }
  });

  // Dashboard: Owner summary
  fastify.get("/dashboard/owner/summary", async (_request, reply) => {
    try {
      const summary = await kpiService.getOwnerDashboardSummary();
      return reply.send(summary);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to fetch owner dashboard summary" });
    }
  });

  // Dashboard: Store Manager summary
  fastify.get("/dashboard/store-manager/summary", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid(),
    });

    const { store_id } = schema.parse(request.query);

    try {
      const summary =
        await kpiService.getStoreManagerDashboardSummary(store_id);
      return reply.send(summary);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to fetch store manager dashboard summary" });
    }
  });
}
