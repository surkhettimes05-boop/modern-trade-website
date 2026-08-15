import { FastifyInstance } from "fastify";
import { z } from "zod";
import { BatchService } from "../services/batchService.js";

const batchService = new BatchService();

export async function batchRoutes(fastify: FastifyInstance) {
  // Batch: Add batch inventory
  fastify.post("/batches/inventory", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid(),
      product_id: z.string().uuid(),
      batch_id: z.string().min(1),
      expiry_date: z.coerce.date(),
      quantity: z.number().positive(),
      cost: z.number().positive(),
    });

    const batchData = schema.parse(request.body);

    try {
      const batch = await batchService.addBatchInventory(batchData);
      return reply.status(201).send(batch);
    } catch {
      return reply.status(500).send({ error: "Failed to add batch inventory" });
    }
  });

  // Batch: Get batch inventory
  fastify.get("/batches/inventory", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
      product_id: z.string().uuid().optional(),
      batch_id: z.string().optional(),
      expiring_soon_days: z.number().positive().optional(),
      limit: z.coerce.number().optional(),
      offset: z.coerce.number().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const batches = await batchService.getBatchInventory(filters);
      return reply.send(batches);
    } catch {
      return reply.status(500).send({ error: "Failed to get batch inventory" });
    }
  });

  // Batch: Get product batches for FIFO
  fastify.get("/batches/product/:productId/fifo", async (request, reply) => {
    const schema = z.object({
      productId: z.string().uuid(),
      storeId: z.string().uuid(),
    });

    const { productId, storeId } = schema.parse({
      ...(request.params as Record<string, unknown>),
      ...(request.query as Record<string, unknown>),
    });

    try {
      const batches = await batchService.getProductBatchesForFIFO(
        productId,
        storeId,
      );
      return reply.send(batches);
    } catch {
      return reply.status(500).send({ error: "Failed to get product batches" });
    }
  });

  // Batch: Deduct from batch
  fastify.post("/batches/deduct", async (request, reply) => {
    const schema = z.object({
      product_id: z.string().uuid(),
      store_id: z.string().uuid(),
      quantity: z.number().positive(),
    });

    const data = schema.parse(request.body);

    try {
      const batches = await batchService.deductFromBatch(
        data.product_id,
        data.store_id,
        data.quantity,
      );
      return reply.send(batches);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Insufficient inventory across all batches"
      ) {
        return reply.status(400).send({ error: error.message });
      }
      return reply.status(500).send({ error: "Failed to deduct from batch" });
    }
  });

  // Batch: Get expiring batches
  fastify.get("/batches/expiring/:days", async (request, reply) => {
    const schema = z.object({
      days: z.coerce.number().positive(),
    });

    const querySchema = z.object({
      store_id: z.string().uuid().optional(),
    });

    const { days } = schema.parse(request.params);
    const { store_id } = querySchema.parse(request.query);

    try {
      const batches = await batchService.getExpiringBatches(days, store_id);
      return reply.send(batches);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get expiring batches" });
    }
  });

  // Batch: Get expired batches
  fastify.get("/batches/expired", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
    });

    const { store_id } = schema.parse(request.query);

    try {
      const batches = await batchService.getExpiredBatches(store_id);
      return reply.send(batches);
    } catch {
      return reply.status(500).send({ error: "Failed to get expired batches" });
    }
  });

  // Batch: Create quality exception
  fastify.post("/batches/quality-exceptions", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid(),
      product_id: z.string().uuid(),
      batch_id: z.string(),
      exception_type: z.enum([
        "DAMAGED",
        "EXPIRED",
        "WRONG_ITEM",
        "QUALITY_ISSUE",
      ]),
      quantity: z.number().positive(),
      reason: z.string().min(1),
      notes: z.string().optional(),
    });

    const exceptionData = schema.parse(request.body);

    try {
      const exception =
        await batchService.createQualityException(exceptionData);
      return reply.status(201).send(exception);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to create quality exception" });
    }
  });

  // Batch: Get quality exceptions
  fastify.get("/batches/quality-exceptions", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
      product_id: z.string().uuid().optional(),
      batch_id: z.string().optional(),
      status: z.enum(["OPEN", "RESOLVED"]).optional(),
      limit: z.coerce.number().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const exceptions = await batchService.getQualityExceptions(filters);
      return reply.send(exceptions);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get quality exceptions" });
    }
  });

  // Batch: Resolve quality exception
  fastify.post(
    "/batches/quality-exceptions/:exceptionId/resolve",
    async (request, reply) => {
      const paramsSchema = z.object({
        exceptionId: z.string().uuid(),
      });

      const bodySchema = z.object({
        resolved_by: z.string(),
        notes: z.string().optional(),
      });

      const { exceptionId } = paramsSchema.parse(request.params);
      const { resolved_by, notes } = bodySchema.parse(request.body);

      try {
        const exception = await batchService.resolveQualityException(
          exceptionId,
          resolved_by,
          notes,
        );
        return reply.send(exception);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to resolve quality exception" });
      }
    },
  );

  // Batch: Get batch summary
  fastify.get("/batches/summary", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
    });

    const { store_id } = schema.parse(request.query);

    try {
      const summary = await batchService.getBatchSummary(store_id);
      return reply.send(summary);
    } catch {
      return reply.status(500).send({ error: "Failed to get batch summary" });
    }
  });

  // Batch: Adjust batch quantity
  fastify.put("/batches/:batchId/adjust", async (request, reply) => {
    const paramsSchema = z.object({
      batchId: z.string().uuid(),
    });

    const bodySchema = z.object({
      adjustment: z.number(),
    });

    const { batchId } = paramsSchema.parse(request.params);
    const { adjustment } = bodySchema.parse(request.body);

    try {
      const batch = await batchService.adjustBatchQuantity(batchId, adjustment);
      return reply.send(batch);
    } catch (error) {
      if (error instanceof Error && error.message === "Batch not found") {
        return reply.status(404).send({ error: "Batch not found" });
      }
      if (
        error instanceof Error &&
        error.message === "Cannot reduce quantity below zero"
      ) {
        return reply.status(400).send({ error: error.message });
      }
      return reply
        .status(500)
        .send({ error: "Failed to adjust batch quantity" });
    }
  });

  // Batch: Merge batches
  fastify.post("/batches/merge", async (request, reply) => {
    const schema = z.object({
      target_batch_id: z.string().uuid(),
      source_batch_ids: z.array(z.string().uuid()).min(1),
    });

    const { target_batch_id, source_batch_ids } = schema.parse(request.body);

    try {
      const batch = await batchService.mergeBatches(
        target_batch_id,
        source_batch_ids,
      );
      return reply.send(batch);
    } catch {
      return reply.status(500).send({ error: "Failed to merge batches" });
    }
  });

  // Batch: Get batch history
  fastify.get("/batches/:batchId/history", async (request, reply) => {
    const paramsSchema = z.object({
      batchId: z.string().uuid(),
    });

    const querySchema = z.object({
      limit: z.coerce.number().optional(),
    });

    const { batchId } = paramsSchema.parse(request.params);
    const { limit = 50 } = querySchema.parse(request.query);

    try {
      const history = await batchService.getBatchHistory(batchId);
      return reply.send(history.slice(0, limit));
    } catch {
      return reply.status(500).send({ error: "Failed to get batch history" });
    }
  });
}
