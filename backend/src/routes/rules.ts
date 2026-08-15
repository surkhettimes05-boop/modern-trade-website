import { FastifyInstance } from "fastify";
import { z } from "zod";
import { RuleEngineService } from "../services/ruleEngineService.js";

const ruleEngineService = new RuleEngineService();

export async function ruleRoutes(fastify: FastifyInstance) {
  // Admin: Create rule
  fastify.post("/", async (request, reply) => {
    const schema = z.object({
      name: z.string().min(1),
      rule_type: z.enum([
        "base_earning",
        "product_multiplier",
        "category_multiplier",
        "campaign_bonus",
        "segment_multiplier",
        "redemption_conversion",
        "expiry_policy",
        "approval_threshold",
        "rounding",
      ]),
      config: z.any(),
      effective_from: z.string().or(z.date()).optional(),
      effective_to: z.string().or(z.date()).optional(),
      created_by: z.string(),
    });

    try {
      const body = schema.parse(request.body);

      const rule = await ruleEngineService.createRule({
        ...body,
        effective_from:
          typeof body.effective_from === "string"
            ? new Date(body.effective_from)
            : body.effective_from,
        effective_to:
          typeof body.effective_to === "string"
            ? new Date(body.effective_to)
            : body.effective_to,
      });

      return rule;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      if (error instanceof Error) {
        reply.status(400);
        return { error: error.message };
      }
      reply.status(500);
      return { error: "Failed to create rule" };
    }
  });

  // Admin: Update rule
  fastify.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      config: z.any().optional(),
      effective_from: z.string().or(z.date()).optional(),
      effective_to: z.string().or(z.date()).optional(),
      updated_by: z.string(),
    });

    try {
      const body = schema.parse(request.body);

      const rule = await ruleEngineService.updateRule(id, {
        ...body,
        effective_from:
          body.effective_from !== undefined
            ? typeof body.effective_from === "string"
              ? new Date(body.effective_from)
              : body.effective_from
            : undefined,
        effective_to:
          body.effective_to !== undefined
            ? typeof body.effective_to === "string"
              ? new Date(body.effective_to)
              : body.effective_to
            : undefined,
      });

      return rule;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      if (error instanceof Error) {
        reply.status(400);
        return { error: error.message };
      }
      reply.status(500);
      return { error: "Failed to update rule" };
    }
  });

  // Admin: Publish rule
  fastify.post("/:id/publish", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      published_by: z.string(),
    });

    try {
      const body = schema.parse(request.body);
      const rule = await ruleEngineService.publishRule(id, body.published_by);
      return rule;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      if (error instanceof Error) {
        reply.status(400);
        return { error: error.message };
      }
      reply.status(500);
      return { error: "Failed to publish rule" };
    }
  });

  // Admin: Retire rule
  fastify.post("/:id/retire", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      retired_by: z.string(),
    });

    try {
      const body = schema.parse(request.body);
      const rule = await ruleEngineService.retireRule(id, body.retired_by);
      return rule;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      if (error instanceof Error) {
        reply.status(400);
        return { error: error.message };
      }
      reply.status(500);
      return { error: "Failed to retire rule" };
    }
  });

  // Public: Get active rules
  fastify.get("/active", async (request, reply) => {
    const { rule_type } = request.query as { rule_type?: string };

    try {
      const rules = await ruleEngineService.getActiveRules(rule_type);
      return rules;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch active rules" };
    }
  });

  // Admin: Get rule by ID
  fastify.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const rule = await ruleEngineService.getRuleById(id);
      if (!rule) {
        reply.status(404);
        return { error: "Rule not found" };
      }
      return rule;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch rule" };
    }
  });

  // Admin: Get rule versions
  fastify.get("/versions/:name", async (request, reply) => {
    const { name } = request.params as { name: string };

    try {
      const versions = await ruleEngineService.getRuleVersions(name);
      return versions;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch rule versions" };
    }
  });

  // Public: Calculate points (simulator)
  fastify.post("/calculate", async (request, reply) => {
    const schema = z.object({
      items: z.array(
        z.object({
          product_id: z.string().uuid(),
          sku: z.string().optional(),
          category_id: z.string().uuid().optional(),
          quantity: z.number(),
          unit_price: z.number(),
          line_total: z.number(),
        }),
      ),
      total_amount: z.number(),
      currency: z.string().optional(),
      customer_id: z.string().uuid().optional(),
      store_id: z.string().uuid().optional(),
      channel: z.string().optional(),
    });

    try {
      const body = schema.parse(request.body);
      const result = await ruleEngineService.calculatePoints(body);
      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      reply.status(500);
      return { error: "Failed to calculate points" };
    }
  });

  // Admin: Rule statistics
  fastify.get("/stats", async (_request, reply) => {
    try {
      const stats = await ruleEngineService.getRuleStats();
      return stats;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch rule statistics" };
    }
  });
}
