import { FastifyInstance } from "fastify";
import { z } from "zod";
import { productionCacheService } from "../services/productionCacheService.js";

export async function productionCacheRoutes(fastify: FastifyInstance) {
  // Cache: Get value
  fastify.get("/cache/:key", async (request, reply) => {
    const schema = z.object({
      key: z.string(),
    });

    const { key } = schema.parse(request.params);

    try {
      const value = await productionCacheService.get(key);
      if (value === null) {
        return reply.status(404).send({ error: "Cache key not found" });
      }
      return reply.send({ value });
    } catch {
      return reply.status(500).send({ error: "Failed to get cache value" });
    }
  });

  // Cache: Set value
  fastify.post("/cache/:key", async (request, reply) => {
    const paramsSchema = z.object({
      key: z.string(),
    });

    const bodySchema = z.object({
      value: z.any(),
      ttl: z.number().int().positive().optional(),
      tags: z.array(z.string()).optional(),
    });

    const { key } = paramsSchema.parse(request.params);
    const { value, ttl, tags } = bodySchema.parse(request.body);

    try {
      await productionCacheService.set(key, value, { ttl, tags });
      return reply.send({ success: true });
    } catch {
      return reply.status(500).send({ error: "Failed to set cache value" });
    }
  });

  // Cache: Delete value
  fastify.delete("/cache/:key", async (request, reply) => {
    const schema = z.object({
      key: z.string(),
    });

    const { key } = schema.parse(request.params);

    try {
      await productionCacheService.delete(key);
      return reply.send({ success: true });
    } catch {
      return reply.status(500).send({ error: "Failed to delete cache value" });
    }
  });

  // Cache: Invalidate by tag
  fastify.post("/cache/invalidate/tag/:tag", async (request, reply) => {
    const schema = z.object({
      tag: z.string(),
    });

    const { tag } = schema.parse(request.params);

    try {
      const count = await productionCacheService.invalidateByTag(tag);
      return reply.send({ invalidated_count: count });
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to invalidate cache by tag" });
    }
  });

  // Cache: Invalidate by tags
  fastify.post("/cache/invalidate/tags", async (request, reply) => {
    const schema = z.object({
      tags: z.array(z.string()),
    });

    const { tags } = schema.parse(request.body);

    try {
      const count = await productionCacheService.invalidateByTags(tags);
      return reply.send({ invalidated_count: count });
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to invalidate cache by tags" });
    }
  });

  // Cache: Get statistics
  fastify.get("/cache/statistics", async (request, reply) => {
    try {
      const stats = await productionCacheService.getStatistics();
      return reply.send(stats);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get cache statistics" });
    }
  });

  // Cache: Clear all
  fastify.post("/cache/clear", async (request, reply) => {
    try {
      await productionCacheService.clearAll();
      return reply.send({ success: true });
    } catch {
      return reply.status(500).send({ error: "Failed to clear cache" });
    }
  });
}
