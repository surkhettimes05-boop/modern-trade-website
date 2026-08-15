import { FastifyInstance } from "fastify";
import { z } from "zod";
import { AlertService } from "../services/alertService.js";

const alertService = new AlertService();

export async function alertRoutes(fastify: FastifyInstance) {
  // Alert: Create alert
  fastify.post("/alerts", async (request, reply) => {
    const schema = z.object({
      alert_type: z.string(),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
      entity_type: z.string().optional(),
      entity_id: z.string().uuid().optional(),
      store_id: z.string().uuid().optional(),
      threshold_config: z.any(),
      current_value: z.any(),
      message: z.string(),
      link_to_records: z.string().optional(),
      metadata: z.any().optional(),
    });

    const input = schema.parse(request.body);

    try {
      const alert = await alertService.createAlert(input);
      return reply.status(201).send(alert);
    } catch {
      return reply.status(500).send({ error: "Failed to create alert" });
    }
  });

  // Alert: Get alerts with filters
  fastify.get("/alerts", async (request, reply) => {
    const schema = z.object({
      alert_type: z.string().optional(),
      severity: z.string().optional(),
      status: z.string().optional(),
      store_id: z.string().uuid().optional(),
      entity_type: z.string().optional(),
      assigned_to: z.string().optional(),
      limit: z.coerce.number().optional(),
      offset: z.coerce.number().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const alerts = await alertService.getAlerts(filters);
      return reply.send(alerts);
    } catch {
      return reply.status(500).send({ error: "Failed to fetch alerts" });
    }
  });

  // Alert: Get alert by ID
  fastify.get("/alerts/:id", async (request, reply) => {
    const schema = z.object({
      id: z.string().uuid(),
    });

    const { id } = schema.parse(request.params);

    try {
      const alert = await alertService.getAlertById(id);
      if (!alert) {
        return reply.status(404).send({ error: "Alert not found" });
      }
      return reply.send(alert);
    } catch {
      return reply.status(500).send({ error: "Failed to fetch alert" });
    }
  });

  // Alert: Acknowledge alert
  fastify.post("/alerts/:id/acknowledge", async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string().uuid(),
    });

    const bodySchema = z.object({
      acknowledged_by: z.string(),
    });

    const { id } = paramsSchema.parse(request.params);
    const { acknowledged_by } = bodySchema.parse(request.body);

    try {
      const alert = await alertService.acknowledgeAlert(id, acknowledged_by);
      return reply.send(alert);
    } catch {
      return reply.status(500).send({ error: "Failed to acknowledge alert" });
    }
  });

  // Alert: Assign alert
  fastify.post("/alerts/:id/assign", async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string().uuid(),
    });

    const bodySchema = z.object({
      assigned_to: z.string(),
      assigned_by: z.string(),
    });

    const { id } = paramsSchema.parse(request.params);
    const { assigned_to, assigned_by } = bodySchema.parse(request.body);

    try {
      const alert = await alertService.assignAlert(
        id,
        assigned_to,
        assigned_by,
      );
      return reply.send(alert);
    } catch {
      return reply.status(500).send({ error: "Failed to assign alert" });
    }
  });

  // Alert: Resolve alert
  fastify.post("/alerts/:id/resolve", async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string().uuid(),
    });

    const bodySchema = z.object({
      resolved_by: z.string(),
      resolution_notes: z.string().optional(),
    });

    const { id } = paramsSchema.parse(request.params);
    const { resolved_by, resolution_notes } = bodySchema.parse(request.body);

    try {
      const alert = await alertService.resolveAlert(
        id,
        resolved_by,
        resolution_notes,
      );
      return reply.send(alert);
    } catch {
      return reply.status(500).send({ error: "Failed to resolve alert" });
    }
  });

  // Alert: Escalate alert
  fastify.post("/alerts/:id/escalate", async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string().uuid(),
    });

    const bodySchema = z.object({
      escalated_to: z.string(),
      escalated_by: z.string(),
    });

    const { id } = paramsSchema.parse(request.params);
    const { escalated_to, escalated_by } = bodySchema.parse(request.body);

    try {
      const alert = await alertService.escalateAlert(
        id,
        escalated_to,
        escalated_by,
      );
      return reply.send(alert);
    } catch {
      return reply.status(500).send({ error: "Failed to escalate alert" });
    }
  });

  // Alert: Get alert statistics
  fastify.get("/alerts/statistics", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const stats = await alertService.getAlertStatistics(filters);
      return reply.send(stats);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to fetch alert statistics" });
    }
  });
}
