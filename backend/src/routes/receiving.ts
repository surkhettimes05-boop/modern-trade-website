import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ReceivingService } from "../services/receivingService.js";

const receivingService = new ReceivingService();

export async function receivingRoutes(fastify: FastifyInstance) {
  // Receiving: Create receiving record
  fastify.post("/receiving", async (request, reply) => {
    const schema = z.object({
      po_id: z.string().uuid().optional(),
      supplier_id: z.string().uuid(),
      store_id: z.string().uuid().optional(),
      warehouse_id: z.string().uuid().optional(),
      received_by: z.string(),
      notes: z.string().optional(),
      metadata: z.any().optional(),
    });

    const receivingData = schema.parse(request.body);

    try {
      const receiving = await receivingService.createReceiving(receivingData);
      return reply.status(201).send(receiving);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to create receiving record" });
    }
  });

  // Receiving: Get receiving by ID
  fastify.get("/receiving/:receivingId", async (request, reply) => {
    const schema = z.object({
      receivingId: z.string().uuid(),
    });

    const { receivingId } = schema.parse(request.params);

    try {
      const receiving = await receivingService.getReceiving(receivingId);
      if (!receiving) {
        return reply.status(404).send({ error: "Receiving record not found" });
      }
      return reply.send(receiving);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get receiving record" });
    }
  });

  // Receiving: Get receiving by number
  fastify.get("/receiving/number/:receivingNumber", async (request, reply) => {
    const schema = z.object({
      receivingNumber: z.string(),
    });

    const { receivingNumber } = schema.parse(request.params);

    try {
      const receiving =
        await receivingService.getReceivingByNumber(receivingNumber);
      if (!receiving) {
        return reply.status(404).send({ error: "Receiving record not found" });
      }
      return reply.send(receiving);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get receiving record" });
    }
  });

  // Receiving: Get all receiving records
  fastify.get("/receiving", async (request, reply) => {
    const schema = z.object({
      po_id: z.string().uuid().optional(),
      supplier_id: z.string().uuid().optional(),
      store_id: z.string().uuid().optional(),
      warehouse_id: z.string().uuid().optional(),
      status: z.enum(["IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
      date_from: z.coerce.date().optional(),
      date_to: z.coerce.date().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).max(100_000).default(0),
    });

    const filters = schema.parse(request.query);

    try {
      const receivingList = await receivingService.getReceivingList(filters);
      return reply.send(receivingList);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get receiving records" });
    }
  });

  // Receiving: Get receiving items
  fastify.get("/receiving/:receivingId/items", async (request, reply) => {
    const schema = z.object({
      receivingId: z.string().uuid(),
    });

    const { receivingId } = schema.parse(request.params);

    try {
      const items = await receivingService.getReceivingItems(receivingId);
      return reply.send(items);
    } catch {
      return reply.status(500).send({ error: "Failed to get receiving items" });
    }
  });

  // Receiving: Add receiving item
  fastify.post("/receiving/:receivingId/items", async (request, reply) => {
    const paramsSchema = z.object({
      receivingId: z.string().uuid(),
    });

    const bodySchema = z.object({
      po_item_id: z.string().uuid().optional(),
      product_id: z.string().uuid(),
      quantity_ordered: z.number().positive(),
      quantity_received: z.number().positive(),
      quantity_accepted: z.number().positive(),
      quantity_rejected: z.number().optional(),
      batch_id: z.string().optional(),
      expiry_date: z.coerce.date().optional(),
      manufacturing_date: z.coerce.date().optional(),
      unit_price: z.number().optional(),
      discrepancy_type: z
        .enum(["SHORTAGE", "OVERAGE", "DAMAGED", "WRONG_ITEM"])
        .optional(),
      discrepancy_quantity: z.number().optional(),
      discrepancy_notes: z.string().optional(),
      notes: z.string().optional(),
      metadata: z.any().optional(),
    });

    const { receivingId } = paramsSchema.parse(request.params);
    const itemData = bodySchema.parse(request.body);

    try {
      const item = await receivingService.addReceivingItem({
        ...itemData,
        receiving_id: receivingId,
      });
      return reply.status(201).send(item);
    } catch {
      return reply.status(500).send({ error: "Failed to add receiving item" });
    }
  });

  // Receiving: Update receiving item
  fastify.put("/receiving/items/:itemId", async (request, reply) => {
    const paramsSchema = z.object({
      itemId: z.string().uuid(),
    });

    const bodySchema = z.object({
      quantity_received: z.number().positive().optional(),
      quantity_accepted: z.number().positive().optional(),
      quantity_rejected: z.number().optional(),
      batch_id: z.string().optional(),
      expiry_date: z.coerce.date().optional(),
      manufacturing_date: z.coerce.date().optional(),
      unit_price: z.number().optional(),
      discrepancy_type: z
        .enum(["SHORTAGE", "OVERAGE", "DAMAGED", "WRONG_ITEM"])
        .optional(),
      discrepancy_quantity: z.number().optional(),
      discrepancy_notes: z.string().optional(),
      notes: z.string().optional(),
    });

    const { itemId } = paramsSchema.parse(request.params);
    const updates = bodySchema.parse(request.body);

    try {
      const item = await receivingService.updateReceivingItem(itemId, updates);
      return reply.send(item);
    } catch (error) {
      if (error instanceof Error && error.message === "No fields to update") {
        return reply.status(400).send({ error: "No fields to update" });
      }
      return reply
        .status(500)
        .send({ error: "Failed to update receiving item" });
    }
  });

  // Receiving: Perform quality check
  fastify.post(
    "/receiving/items/:itemId/quality-check",
    async (request, reply) => {
      const paramsSchema = z.object({
        itemId: z.string().uuid(),
      });

      const bodySchema = z.object({
        quality_check_status: z.enum(["PASSED", "FAILED"]),
        quality_check_notes: z.string().optional(),
        quality_checked_by: z.string(),
      });

      const { itemId } = paramsSchema.parse(request.params);
      const checkData = bodySchema.parse(request.body);

      try {
        const item = await receivingService.performQualityCheck(
          itemId,
          checkData,
        );
        return reply.send(item);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to perform quality check" });
      }
    },
  );

  // Receiving: Complete receiving
  fastify.post("/receiving/:receivingId/complete", async (request, reply) => {
    const schema = z.object({
      receivingId: z.string().uuid(),
    });

    const { receivingId } = schema.parse(request.params);

    try {
      const receiving = await receivingService.completeReceiving(receivingId);
      return reply.send(receiving);
    } catch {
      return reply.status(500).send({ error: "Failed to complete receiving" });
    }
  });

  // Receiving: Cancel receiving
  fastify.post("/receiving/:receivingId/cancel", async (request, reply) => {
    const schema = z.object({
      receivingId: z.string().uuid(),
    });

    const { receivingId } = schema.parse(request.params);

    try {
      const receiving = await receivingService.cancelReceiving(receivingId);
      return reply.send(receiving);
    } catch {
      return reply.status(500).send({ error: "Failed to cancel receiving" });
    }
  });

  // Receiving: Get summary
  fastify.get("/receiving/summary", async (request, reply) => {
    const schema = z.object({
      supplier_id: z.string().uuid().optional(),
      store_id: z.string().uuid().optional(),
      warehouse_id: z.string().uuid().optional(),
      date_from: z.coerce.date().optional(),
      date_to: z.coerce.date().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const summary = await receivingService.getReceivingSummary(filters);
      return reply.send(summary);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get receiving summary" });
    }
  });
}
