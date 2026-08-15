import { FastifyInstance } from "fastify";
import { z } from "zod";
import { auditTrailService } from "../services/auditTrailService.js";

export async function auditTrailRoutes(fastify: FastifyInstance) {
  // Audit Trails: Record entry
  fastify.post("/audit-trails", async (request, reply) => {
    const schema = z.object({
      user_id: z.string().optional(),
      user_type: z.string().optional(),
      session_id: z.string().optional(),
      action: z.string(),
      entity_type: z.string().optional(),
      entity_id: z.string().uuid().optional(),
      old_values: z.any().optional(),
      new_values: z.any().optional(),
      ip_address: z.string().optional(),
      user_agent: z.string().optional(),
      request_id: z.string().optional(),
    });

    const entryData = schema.parse(request.body);

    try {
      const entry = await auditTrailService.recordEntry(entryData);
      return reply.status(201).send(entry);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to record audit trail entry" });
    }
  });

  // Audit Trails: Get entity trails
  fastify.get(
    "/audit-trails/entity/:entityType/:entityId",
    async (request, reply) => {
      const schema = z.object({
        entityType: z.string(),
        entityId: z.string(),
        limit: z.coerce.number().int().positive().optional(),
      });

      const { entityType, entityId, limit = 50 } = schema.parse(request.params);

      try {
        const trails = await auditTrailService.getEntityTrails(
          entityType,
          entityId,
          limit,
        );
        return reply.send(trails);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get entity audit trails" });
      }
    },
  );

  // Audit Trails: Get user trails
  fastify.get("/audit-trails/user/:userId", async (request, reply) => {
    const schema = z.object({
      userId: z.string(),
      limit: z.coerce.number().int().positive().optional(),
    });

    const { userId, limit = 100 } = schema.parse(request.params);

    try {
      const trails = await auditTrailService.getUserTrails(userId, limit);
      return reply.send(trails);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get user audit trails" });
    }
  });

  // Audit Trails: Get trails by action
  fastify.get("/audit-trails/action/:action", async (request, reply) => {
    const schema = z.object({
      action: z.string(),
      limit: z.coerce.number().int().positive().optional(),
    });

    const { action, limit = 100 } = schema.parse(request.params);

    try {
      const trails = await auditTrailService.getTrailsByAction(action, limit);
      return reply.send(trails);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get audit trails by action" });
    }
  });

  // Audit Trails: Get trails by date range
  fastify.get("/audit-trails/date-range", async (request, reply) => {
    const schema = z.object({
      start_date: z.coerce.date(),
      end_date: z.coerce.date(),
      limit: z.coerce.number().int().positive().optional(),
    });

    const { start_date, end_date, limit = 500 } = schema.parse(request.query);

    try {
      const trails = await auditTrailService.getTrailsByDateRange(
        start_date,
        end_date,
        limit,
      );
      return reply.send(trails);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get audit trails by date range" });
    }
  });

  fastify.get("/audit-trails/search", async (request, reply) => {
    const filters = z
      .object({
        query: z.string().optional(),
        action: z.string().optional(),
        entity_type: z.string().optional(),
        user_id: z.string().optional(),
        start_date: z.coerce.date().optional(),
        end_date: z.coerce.date().optional(),
        limit: z.coerce.number().int().positive().max(2000).optional(),
      })
      .parse(request.query);
    return reply.send(
      await auditTrailService.search({
        query: filters.query,
        action: filters.action,
        entityType: filters.entity_type,
        userId: filters.user_id,
        startDate: filters.start_date,
        endDate: filters.end_date,
        limit: filters.limit,
      }),
    );
  });

  fastify.get("/audit-trails/export.csv", async (request, reply) => {
    const filters = z
      .object({
        query: z.string().optional(),
        action: z.string().optional(),
        entity_type: z.string().optional(),
        user_id: z.string().optional(),
        start_date: z.coerce.date().optional(),
        end_date: z.coerce.date().optional(),
        limit: z.coerce.number().int().positive().max(2000).optional(),
      })
      .parse(request.query);
    const csv = await auditTrailService.exportCsv({
      query: filters.query,
      action: filters.action,
      entityType: filters.entity_type,
      userId: filters.user_id,
      startDate: filters.start_date,
      endDate: filters.end_date,
      limit: filters.limit,
    });
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", 'attachment; filename="audit-trails.csv"')
      .send(csv);
  });
}
