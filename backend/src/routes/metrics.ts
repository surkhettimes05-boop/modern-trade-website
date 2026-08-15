import { FastifyInstance } from "fastify";
import { z } from "zod";
import { MetricGovernanceService } from "../services/metricGovernanceService.js";

const metricGovernanceService = new MetricGovernanceService();

export async function metricRoutes(fastify: FastifyInstance) {
  // Metrics: Create or update metric
  fastify.post("/metrics", async (request, reply) => {
    const schema = z.object({
      metric_id: z.string(),
      metric_name: z.string(),
      business_definition: z.string(),
      formula: z.string(),
      source_tables: z.array(z.string()),
      included_statuses: z.array(z.string()).optional(),
      exclusions: z.array(z.string()).optional(),
      timezone: z.string().optional(),
      business_date_behavior: z.string().optional(),
      refresh_frequency: z.string().optional(),
      metric_owner: z.string(),
      data_quality_requirements: z.string().optional(),
      drill_down_destination: z.string().optional(),
      version: z.string().optional(),
      updated_by: z.string(),
    });

    const input = schema.parse(request.body);

    // Validate metric definition
    const validation = metricGovernanceService.validateMetricDefinition(input);
    if (!validation.valid) {
      return reply.status(400).send({ errors: validation.errors });
    }

    try {
      const metric = await metricGovernanceService.upsertMetric(input);
      return reply.send(metric);
    } catch {
      return reply.status(500).send({ error: "Failed to upsert metric" });
    }
  });

  // Metrics: Get metric by ID
  fastify.get("/metrics/:metricId", async (request, reply) => {
    const schema = z.object({
      metricId: z.string(),
    });

    const { metricId } = schema.parse(request.params);

    try {
      const metric = await metricGovernanceService.getMetricById(metricId);
      if (!metric) {
        return reply.status(404).send({ error: "Metric not found" });
      }
      return reply.send(metric);
    } catch {
      return reply.status(500).send({ error: "Failed to fetch metric" });
    }
  });

  // Metrics: Get all active metrics
  fastify.get("/metrics", async (_request, reply) => {
    try {
      const metrics = await metricGovernanceService.getActiveMetrics();
      return reply.send(metrics);
    } catch {
      return reply.status(500).send({ error: "Failed to fetch metrics" });
    }
  });

  // Metrics: Get metrics by owner
  fastify.get("/metrics/owner/:owner", async (request, reply) => {
    const schema = z.object({
      owner: z.string(),
    });

    const { owner } = schema.parse(request.params);

    try {
      const metrics = await metricGovernanceService.getMetricsByOwner(owner);
      return reply.send(metrics);
    } catch {
      return reply.status(500).send({ error: "Failed to fetch metrics" });
    }
  });

  // Metrics: Deactivate metric
  fastify.post("/metrics/:metricId/deactivate", async (request, reply) => {
    const paramsSchema = z.object({
      metricId: z.string(),
    });

    const bodySchema = z.object({
      updated_by: z.string(),
    });

    const { metricId } = paramsSchema.parse(request.params);
    const { updated_by } = bodySchema.parse(request.body);

    try {
      const metric = await metricGovernanceService.deactivateMetric(
        metricId,
        updated_by,
      );
      return reply.send(metric);
    } catch {
      return reply.status(500).send({ error: "Failed to deactivate metric" });
    }
  });

  // Metrics: Activate metric
  fastify.post("/metrics/:metricId/activate", async (request, reply) => {
    const paramsSchema = z.object({
      metricId: z.string(),
    });

    const bodySchema = z.object({
      updated_by: z.string(),
    });

    const { metricId } = paramsSchema.parse(request.params);
    const { updated_by } = bodySchema.parse(request.body);

    try {
      const metric = await metricGovernanceService.activateMetric(
        metricId,
        updated_by,
      );
      return reply.send(metric);
    } catch {
      return reply.status(500).send({ error: "Failed to activate metric" });
    }
  });

  // Metrics: Get metrics by source table
  fastify.get("/metrics/source/:tableName", async (request, reply) => {
    const schema = z.object({
      tableName: z.string(),
    });

    const { tableName } = schema.parse(request.params);

    try {
      const metrics =
        await metricGovernanceService.getMetricsBySourceTable(tableName);
      return reply.send(metrics);
    } catch {
      return reply.status(500).send({ error: "Failed to fetch metrics" });
    }
  });

  // Metrics: Search metrics
  fastify.get("/metrics/search/:query", async (request, reply) => {
    const schema = z.object({
      query: z.string(),
    });

    const { query } = schema.parse(request.params);

    try {
      const metrics = await metricGovernanceService.searchMetrics(query);
      return reply.send(metrics);
    } catch {
      return reply.status(500).send({ error: "Failed to search metrics" });
    }
  });
}
