import { FastifyInstance } from "fastify";
import { z } from "zod";
import { observabilityService } from "../services/observabilityService.js";

export async function observabilityRoutes(fastify: FastifyInstance) {
  // Observability: Record metric
  fastify.post("/observability/metrics", async (request, reply) => {
    const schema = z.object({
      name: z.string(),
      value: z.number(),
      timestamp: z.coerce.date().optional(),
      tags: z.record(z.string(), z.any()).optional(),
    });

    const metricData = schema.parse(request.body);

    try {
      await observabilityService.recordMetric({
        name: metricData.name,
        value: metricData.value,
        timestamp: metricData.timestamp || new Date(),
        tags: metricData.tags as Record<string, string> | undefined,
      });
      return reply.send({ success: true });
    } catch {
      return reply.status(500).send({ error: "Failed to record metric" });
    }
  });

  // Observability: Get metrics
  fastify.get("/observability/metrics/:name", async (request, reply) => {
    const paramsSchema = z.object({
      name: z.string(),
    });

    const querySchema = z.object({
      start_date: z.coerce.date().optional(),
      end_date: z.coerce.date().optional(),
      limit: z.coerce.number().int().positive().optional(),
    });

    const { name } = paramsSchema.parse(request.params);
    const options = querySchema.parse(request.query);

    try {
      const metrics = await observabilityService.getMetrics(name, options);
      return reply.send(metrics);
    } catch {
      return reply.status(500).send({ error: "Failed to get metrics" });
    }
  });

  // Observability: Log entry
  fastify.post("/observability/logs", async (request, reply) => {
    const schema = z.object({
      level: z.enum(["info", "warn", "error", "debug"]),
      message: z.string(),
      timestamp: z.coerce.date().optional(),
      context: z.any().optional(),
      tags: z.record(z.string(), z.any()).optional(),
    });

    const logData = schema.parse(request.body);

    try {
      await observabilityService.log({
        level: logData.level,
        message: logData.message,
        timestamp: logData.timestamp || new Date(),
        context: logData.context,
        tags: logData.tags as Record<string, string> | undefined,
      });
      return reply.send({ success: true });
    } catch {
      return reply.status(500).send({ error: "Failed to log entry" });
    }
  });

  // Observability: Get logs
  fastify.get("/observability/logs/:level", async (request, reply) => {
    const paramsSchema = z.object({
      level: z.string(),
    });

    const querySchema = z.object({
      start_date: z.coerce.date().optional(),
      end_date: z.coerce.date().optional(),
      limit: z.coerce.number().int().positive().optional(),
    });

    const { level } = paramsSchema.parse(request.params);
    const options = querySchema.parse(request.query);

    try {
      const logs = await observabilityService.getLogs(level, options);
      return reply.send(logs);
    } catch {
      return reply.status(500).send({ error: "Failed to get logs" });
    }
  });

  // Observability: Get system health
  fastify.get("/observability/health", async (request, reply) => {
    try {
      const health = await observabilityService.getSystemHealth();
      return reply.send(health);
    } catch {
      return reply.status(500).send({ error: "Failed to get system health" });
    }
  });

  // Observability: Get performance metrics
  fastify.get("/observability/performance", async (request, reply) => {
    try {
      const metrics = await observabilityService.getPerformanceMetrics();
      return reply.send(metrics);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get performance metrics" });
    }
  });

  // Observability: Get error rate
  fastify.get("/observability/error-rate", async (request, reply) => {
    const schema = z.object({
      minutes: z.coerce.number().int().positive().optional(),
    });

    const { minutes = 5 } = schema.parse(request.query);

    try {
      const errorRate = await observabilityService.getErrorRate(minutes);
      return reply.send(errorRate);
    } catch {
      return reply.status(500).send({ error: "Failed to get error rate" });
    }
  });

  // Observability: Get request statistics
  fastify.get("/observability/request-stats", async (request, reply) => {
    const schema = z.object({
      minutes: z.coerce.number().int().positive().optional(),
    });

    const { minutes = 5 } = schema.parse(request.query);

    try {
      const stats = await observabilityService.getRequestStatistics(minutes);
      return reply.send(stats);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get request statistics" });
    }
  });

  // Observability: Create alert
  fastify.post("/observability/alerts", async (request, reply) => {
    const schema = z.object({
      alert_type: z.string(),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
      message: z.string(),
      metadata: z.any().optional(),
    });

    const alertData = schema.parse(request.body);

    try {
      await observabilityService.createAlert(alertData);
      return reply.status(201).send({ success: true });
    } catch {
      return reply.status(500).send({ error: "Failed to create alert" });
    }
  });

  // Observability: Get active alerts
  fastify.get("/observability/alerts/active", async (request, reply) => {
    try {
      const alerts = await observabilityService.getActiveAlerts();
      return reply.send(alerts);
    } catch {
      return reply.status(500).send({ error: "Failed to get active alerts" });
    }
  });

  // Observability: Track API request
  fastify.post("/observability/api-logs", async (request, reply) => {
    const schema = z.object({
      endpoint: z.string(),
      method: z.string(),
      status_code: z.number(),
      response_time_ms: z.number(),
      user_id: z.string().optional(),
    });

    const logData = schema.parse(request.body);

    try {
      await observabilityService.trackApiRequest(logData);
      return reply.send({ success: true });
    } catch {
      return reply.status(500).send({ error: "Failed to track API request" });
    }
  });
}
