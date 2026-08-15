import { FastifyInstance } from "fastify";
import { z } from "zod";
import { cloudflareService } from "../services/cloudflareService.js";

export async function cloudflareRoutes(fastify: FastifyInstance) {
  // Cloudflare: Purge cache by URL
  fastify.post("/cloudflare/cache/purge/url", async (request, reply) => {
    const schema = z.object({
      urls: z.array(z.string().url()),
    });

    const { urls } = schema.parse(request.body);

    try {
      const result = await cloudflareService.purgeCacheByUrl(urls);
      return reply.send(result);
    } catch {
      return reply.status(500).send({ error: "Failed to purge cache by URL" });
    }
  });

  // Cloudflare: Purge cache by prefix
  fastify.post("/cloudflare/cache/purge/prefix", async (request, reply) => {
    const schema = z.object({
      prefixes: z.array(z.string()),
    });

    const { prefixes } = schema.parse(request.body);

    try {
      const result = await cloudflareService.purgeCacheByPrefix(prefixes);
      return reply.send(result);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to purge cache by prefix" });
    }
  });

  // Cloudflare: Purge entire cache
  fastify.post("/cloudflare/cache/purge/all", async (request, reply) => {
    try {
      const result = await cloudflareService.purgeEntireCache();
      return reply.send(result);
    } catch {
      return reply.status(500).send({ error: "Failed to purge entire cache" });
    }
  });

  // Cloudflare: Get zone analytics
  fastify.get("/cloudflare/analytics", async (request, reply) => {
    const schema = z.object({
      since: z.coerce.date().optional(),
      until: z.coerce.date().optional(),
      metrics: z.array(z.string()).optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const analytics = await cloudflareService.getZoneAnalytics(filters);
      return reply.send(analytics);
    } catch {
      return reply.status(500).send({ error: "Failed to get zone analytics" });
    }
  });

  // Cloudflare: Set security level
  fastify.put("/cloudflare/security/level", async (request, reply) => {
    const schema = z.object({
      level: z.enum([
        "off",
        "essentially_off",
        "low",
        "medium",
        "high",
        "under_attack",
      ]),
    });

    const { level } = schema.parse(request.body);

    try {
      const result = await cloudflareService.setSecurityLevel(level);
      return reply.send(result);
    } catch {
      return reply.status(500).send({ error: "Failed to set security level" });
    }
  });

  // Cloudflare: Create firewall rule
  fastify.post("/cloudflare/firewall/rules", async (request, reply) => {
    const schema = z.object({
      name: z.string(),
      expression: z.string(),
      action: z.enum(["block", "challenge", "allow", "managed_challenge"]),
      description: z.string().optional(),
    });

    const rule = schema.parse(request.body);

    try {
      const result = await cloudflareService.createFirewallRule(rule);
      return reply.send(result);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to create firewall rule" });
    }
  });

  // Cloudflare: Get firewall rules
  fastify.get("/cloudflare/firewall/rules", async (request, reply) => {
    try {
      const rules = await cloudflareService.getFirewallRules();
      return reply.send(rules);
    } catch {
      return reply.status(500).send({ error: "Failed to get firewall rules" });
    }
  });

  // Cloudflare: Health check
  fastify.get("/cloudflare/health", async (request, reply) => {
    try {
      const healthy = await cloudflareService.healthCheck();
      return reply.send({ healthy });
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to check Cloudflare health" });
    }
  });
}
