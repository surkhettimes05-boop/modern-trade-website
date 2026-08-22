import { FastifyInstance } from "fastify";
import { z } from "zod";
import { analyticsService } from "../services/analyticsService.js";

export async function analyticsRoutes(fastify: FastifyInstance) {
  // Analytics: Track event
  fastify.post("/analytics/events", async (request, reply) => {
    const schema = z.object({
      event_type: z.string(),
      event_category: z.string().optional(),
      customer_id: z.string().uuid().optional(),
      store_id: z.string().uuid().optional(),
      order_id: z.string().uuid().optional(),
      product_id: z.string().uuid().optional(),
      event_data: z.any().optional(),
      metadata: z.any().optional(),
    });

    const eventData = schema.parse(request.body);

    try {
      const event = await analyticsService.trackEvent(eventData);
      return reply.status(201).send(event);
    } catch {
      return reply.status(500).send({ error: "Failed to track event" });
    }
  });

  // Analytics: Get events by type
  fastify.get("/analytics/events/:eventType", async (request, reply) => {
    const schema = z.object({
      eventType: z.string(),
      limit: z.coerce.number().int().positive().optional(),
    });

    const { eventType, limit = 100 } = schema.parse(request.params);

    try {
      const events = await analyticsService.getEventsByType(eventType, limit);
      return reply.send(events);
    } catch {
      return reply.status(500).send({ error: "Failed to get events" });
    }
  });

  // Analytics: Get events for customer
  fastify.get(
    "/analytics/customer/:customerId/events",
    async (request, reply) => {
      const schema = z.object({
        customerId: z.string().uuid(),
        limit: z.coerce.number().int().positive().optional(),
      });

      const { customerId, limit = 100 } = schema.parse(request.params);

      try {
        const events = await analyticsService.getEventsForCustomer(
          customerId,
          limit,
        );
        return reply.send(events);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get customer events" });
      }
    },
  );

  // Analytics: Get sales analytics
  fastify.get("/analytics/sales", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
      start_date: z.coerce.date().optional(),
      end_date: z.coerce.date().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const analytics = await analyticsService.getSalesAnalytics(filters);
      return reply.send(analytics);
    } catch {
      return reply.status(500).send({ error: "Failed to get sales analytics" });
    }
  });

  // Analytics: Get product analytics
  fastify.get("/analytics/products", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
      start_date: z.coerce.date().optional(),
      end_date: z.coerce.date().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const analytics = await analyticsService.getProductAnalytics(filters);
      return reply.send(analytics);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get product analytics" });
    }
  });

  // Analytics: Get customer analytics
  fastify.get("/analytics/customers", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
      start_date: z.coerce.date().optional(),
      end_date: z.coerce.date().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const analytics = await analyticsService.getCustomerAnalytics(filters);
      return reply.send(analytics);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get customer analytics" });
    }
  });

  // Analytics: Get daily sales trend
  fastify.get("/analytics/sales/trend", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
      start_date: z.coerce.date().optional(),
      end_date: z.coerce.date().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const trend = await analyticsService.getDailySalesTrend(filters);
      return reply.send(trend);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get daily sales trend" });
    }
  });

  // Analytics: Get top customers
  fastify.get("/analytics/customers/top", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
      start_date: z.coerce.date().optional(),
      end_date: z.coerce.date().optional(),
      limit: z.coerce.number().int().positive().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const customers = await analyticsService.getTopCustomersBySpend(filters);
      return reply.send(customers);
    } catch {
      return reply.status(500).send({ error: "Failed to get top customers" });
    }
  });

  // Reports: Create saved report
  fastify.post("/analytics/reports", async (request, reply) => {
    const schema = z.object({
      name: z.string(),
      description: z.string().optional(),
      report_type: z.enum([
        "SALES",
        "INVENTORY",
        "CUSTOMER",
        "LOYALTY",
        "DELIVERY",
      ]),
      query_config: z.object({}).strict().default({}),
      visualization_config: z.any().optional(),
      schedule_config: z.any().optional(),
      shared_with: z.any().optional(),
      metadata: z.any().optional(),
    });

    const reportData = schema.strict().parse(request.body);

    try {
      const report = await analyticsService.createSavedReport({
        ...reportData,
        created_by: (request.user as { id: string }).id,
      });
      return reply.status(201).send(report);
    } catch {
      return reply.status(500).send({ error: "Failed to create saved report" });
    }
  });

  // Reports: Get saved report
  fastify.get("/analytics/reports/:reportId", async (request, reply) => {
    const schema = z.object({
      reportId: z.string(),
    });

    const { reportId } = schema.parse(request.params);

    try {
      const report = await analyticsService.getSavedReport(reportId);
      if (!report) {
        return reply.status(404).send({ error: "Saved report not found" });
      }
      return reply.send(report);
    } catch {
      return reply.status(500).send({ error: "Failed to get saved report" });
    }
  });

  // Reports: Get saved reports by type
  fastify.get("/analytics/reports/type/:reportType", async (request, reply) => {
    const schema = z.object({
      reportType: z.enum([
        "SALES",
        "INVENTORY",
        "CUSTOMER",
        "LOYALTY",
        "DELIVERY",
      ]),
      created_by: z.string().optional(),
    });

    const { reportType, created_by } = schema.parse(request.params);

    try {
      const reports = await analyticsService.getSavedReportsByType(
        reportType,
        created_by,
      );
      return reply.send(reports);
    } catch {
      return reply.status(500).send({ error: "Failed to get saved reports" });
    }
  });

  // Reports: Execute report
  fastify.post(
    "/analytics/reports/:reportId/execute",
    async (request, reply) => {
      const schema = z.object({
        reportId: z.string(),
      });

      const bodySchema = z.object({}).strict();

      const { reportId } = schema.parse(request.params);
      bodySchema.parse(request.body || {});

      try {
        const result = await analyticsService.executeReport(reportId);
        return reply.send(result);
      } catch (error) {
        if (error instanceof Error && error.message === "Report not found") {
          return reply.status(404).send({ error: error.message });
        }
        return reply.status(500).send({ error: "Failed to execute report" });
      }
    },
  );
}
