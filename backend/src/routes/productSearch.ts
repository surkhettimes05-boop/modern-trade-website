import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ProductSearchService } from "../services/productSearchService.js";

const productSearchService = new ProductSearchService();

export async function productSearchRoutes(fastify: FastifyInstance) {
  // Product Search: Index product
  fastify.post("/product-search/index", async (request, reply) => {
    const schema = z.object({
      product_id: z.string().uuid(),
      name_en: z.string().min(1),
      name_ne: z.string().optional(),
      name_romanized: z.string().optional(),
      description_en: z.string().optional(),
      description_ne: z.string().optional(),
      description_romanized: z.string().optional(),
      synonyms: z.array(z.string()).optional(),
      sku: z.string().optional(),
      barcode: z.string().optional(),
      brand: z.string().optional(),
      category: z.string().optional(),
    });

    const productData = schema.parse(request.body);

    try {
      const index = await productSearchService.indexProduct(productData);
      return reply.status(201).send(index);
    } catch {
      return reply.status(500).send({ error: "Failed to index product" });
    }
  });

  // Product Search: Search products
  fastify.get("/product-search/search", async (request, reply) => {
    const schema = z.object({
      query: z.string().min(2),
      language: z.enum(["en", "ne", "romanized"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).max(100_000).default(0),
      store_id: z.string().uuid().optional(),
    });

    const searchParams = schema.parse(request.query);

    try {
      const results = await productSearchService.searchProducts(searchParams);

      // Log zero-result searches
      if (results.length === 0) {
        await productSearchService.logZeroResultSearch(
          searchParams.query,
          searchParams.language || "en",
        );
      }

      return reply.send(results);
    } catch {
      return reply.status(500).send({ error: "Failed to search products" });
    }
  });

  // Product Search: Fuzzy search
  fastify.get("/product-search/fuzzy", async (request, reply) => {
    const schema = z.object({
      query: z.string().min(2),
      language: z.enum(["en", "ne", "romanized"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).max(100_000).default(0),
      similarity_threshold: z.number().min(0).max(1).optional(),
    });

    const searchParams = schema.parse(request.query);

    try {
      const results =
        await productSearchService.searchProductsFuzzy(searchParams);
      return reply.send(results);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to perform fuzzy search" });
    }
  });

  // Product Search: Get product index
  fastify.get("/product-search/index/:productId", async (request, reply) => {
    const schema = z.object({
      productId: z.string().uuid(),
    });

    const { productId } = schema.parse(request.params);

    try {
      const index = await productSearchService.getProductIndex(productId);
      if (!index) {
        return reply
          .status(404)
          .send({ error: "Product not found in search index" });
      }
      return reply.send(index);
    } catch {
      return reply.status(500).send({ error: "Failed to get product index" });
    }
  });

  // Product Search: Add synonym
  fastify.post(
    "/product-search/:productId/synonyms",
    async (request, reply) => {
      const paramsSchema = z.object({
        productId: z.string().uuid(),
      });

      const bodySchema = z.object({
        synonym: z.string().min(1),
      });

      const { productId } = paramsSchema.parse(request.params);
      const { synonym } = bodySchema.parse(request.body);

      try {
        const index = await productSearchService.addSynonym(productId, synonym);
        return reply.send(index);
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          return reply.status(404).send({ error: error.message });
        }
        return reply.status(500).send({ error: "Failed to add synonym" });
      }
    },
  );

  // Product Search: Remove synonym
  fastify.delete(
    "/product-search/:productId/synonyms/:synonym",
    async (request, reply) => {
      const schema = z.object({
        productId: z.string().uuid(),
        synonym: z.string(),
      });

      const { productId, synonym } = schema.parse(request.params);

      try {
        const index = await productSearchService.removeSynonym(
          productId,
          synonym,
        );
        return reply.send(index);
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          return reply.status(404).send({ error: error.message });
        }
        return reply.status(500).send({ error: "Failed to remove synonym" });
      }
    },
  );

  // Product Search: Remove from index
  fastify.delete("/product-search/index/:productId", async (request, reply) => {
    const schema = z.object({
      productId: z.string().uuid(),
    });

    const { productId } = schema.parse(request.params);

    try {
      await productSearchService.removeFromIndex(productId);
      return reply.send({ message: "Product removed from search index" });
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to remove product from index" });
    }
  });

  // Product Search: Rebuild index
  fastify.post("/product-search/rebuild", async (_request, reply) => {
    try {
      const count = await productSearchService.rebuildSearchIndex();
      return reply.send({ indexed: count });
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to rebuild search index" });
    }
  });
}
