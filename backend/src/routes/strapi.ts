import { FastifyInstance } from "fastify";
import { z } from "zod";
import { strapiService } from "../services/strapiService.js";

export async function strapiRoutes(fastify: FastifyInstance) {
  // Strapi: Get products
  fastify.get("/strapi/products", async (request, reply) => {
    const schema = z.object({
      category: z.string().optional(),
      limit: z.coerce.number().int().positive().optional(),
    });

    const query = schema.parse(request.query);

    try {
      const products = await strapiService.getProducts(query);
      return reply.send(products);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get products from Strapi" });
    }
  });

  // Strapi: Get categories
  fastify.get("/strapi/categories", async (request, reply) => {
    const schema = z.object({
      limit: z.coerce.number().int().positive().optional(),
    });

    const { limit } = schema.parse(request.query);

    try {
      const categories = await strapiService.getCategories({ limit });
      return reply.send(categories);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get categories from Strapi" });
    }
  });

  // Strapi: Get banners
  fastify.get("/strapi/banners", async (request, reply) => {
    const schema = z.object({
      location: z.string().optional(),
      limit: z.coerce.number().int().positive().optional(),
    });

    const query = schema.parse(request.query);

    try {
      const banners = await strapiService.getBanners(query);
      return reply.send(banners);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get banners from Strapi" });
    }
  });

  // Strapi: Get page
  fastify.get("/strapi/pages/:slug", async (request, reply) => {
    const schema = z.object({
      slug: z.string(),
    });

    const { slug } = schema.parse(request.params);

    try {
      const page = await strapiService.getPage(slug);
      if (!page) {
        return reply.status(404).send({ error: "Page not found" });
      }
      return reply.send(page);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get page from Strapi" });
    }
  });

  // Strapi: Get settings
  fastify.get("/strapi/settings", async (request, reply) => {
    try {
      const settings = await strapiService.getSettings();
      return reply.send(settings);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get settings from Strapi" });
    }
  });

  // Strapi: Clear cache
  fastify.post("/strapi/cache/clear", async (request, reply) => {
    try {
      await strapiService.clearCache();
      return reply.send({ success: true });
    } catch {
      return reply.status(500).send({ error: "Failed to clear Strapi cache" });
    }
  });

  // Strapi: Health check
  fastify.get("/strapi/health", async (request, reply) => {
    try {
      const healthy = await strapiService.healthCheck();
      return reply.send({ healthy });
    } catch {
      return reply.status(500).send({ error: "Failed to check Strapi health" });
    }
  });
}
