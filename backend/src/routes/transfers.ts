import { FastifyInstance } from "fastify";
import { z } from "zod";
import { TransferService } from "../services/transferService.js";

const transferService = new TransferService();

export async function transferRoutes(fastify: FastifyInstance) {
  // Transfer: Create transfer request
  fastify.post("/transfers", async (request, reply) => {
    const schema = z.object({
      from_store_id: z.string().uuid(),
      to_store_id: z.string().uuid(),
      from_warehouse_id: z.string().uuid().optional(),
      to_warehouse_id: z.string().uuid().optional(),
      items: z
        .array(
          z.object({
            product_id: z.string().uuid(),
            batch_id: z.string().optional(),
            expiry_date: z.coerce.date().optional(),
            quantity_requested: z.number().positive(),
            unit_cost: z.number().optional(),
            notes: z.string().optional(),
          }),
        )
        .min(1),
      notes: z.string().optional(),
      metadata: z.any().optional(),
      requested_by: z.string(),
    });

    const transferData = schema.parse(request.body);

    try {
      const transfer =
        await transferService.createTransferRequest(transferData);
      return reply.status(201).send(transfer);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to create transfer request" });
    }
  });

  // Transfer: Get transfer by ID
  fastify.get("/transfers/:transferId", async (request, reply) => {
    const schema = z.object({
      transferId: z.string().uuid(),
    });

    const { transferId } = schema.parse(request.params);

    try {
      const transfer = await transferService.getTransfer(transferId);
      if (!transfer) {
        return reply.status(404).send({ error: "Transfer not found" });
      }
      return reply.send(transfer);
    } catch {
      return reply.status(500).send({ error: "Failed to get transfer" });
    }
  });

  // Transfer: Get transfer by number
  fastify.get("/transfers/number/:transferNumber", async (request, reply) => {
    const schema = z.object({
      transferNumber: z.string(),
    });

    const { transferNumber } = schema.parse(request.params);

    try {
      const transfer =
        await transferService.getTransferByNumber(transferNumber);
      if (!transfer) {
        return reply.status(404).send({ error: "Transfer not found" });
      }
      return reply.send(transfer);
    } catch {
      return reply.status(500).send({ error: "Failed to get transfer" });
    }
  });

  // Transfer: Get all transfers
  fastify.get("/transfers", async (request, reply) => {
    const schema = z.object({
      from_store_id: z.string().uuid().optional(),
      to_store_id: z.string().uuid().optional(),
      from_warehouse_id: z.string().uuid().optional(),
      to_warehouse_id: z.string().uuid().optional(),
      status: z
        .enum([
          "REQUESTED",
          "APPROVED",
          "IN_TRANSIT",
          "COMPLETED",
          "CANCELLED",
          "REJECTED",
        ])
        .optional(),
      date_from: z.coerce.date().optional(),
      date_to: z.coerce.date().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).max(100_000).default(0),
    });

    const filters = schema.parse(request.query);

    try {
      const transfers = await transferService.getTransfers(filters);
      return reply.send(transfers);
    } catch {
      return reply.status(500).send({ error: "Failed to get transfers" });
    }
  });

  // Transfer: Get transfer items
  fastify.get("/transfers/:transferId/items", async (request, reply) => {
    const schema = z.object({
      transferId: z.string().uuid(),
    });

    const { transferId } = schema.parse(request.params);

    try {
      const items = await transferService.getTransferItems(transferId);
      return reply.send(items);
    } catch {
      return reply.status(500).send({ error: "Failed to get transfer items" });
    }
  });

  // Transfer: Approve transfer
  fastify.post("/transfers/:transferId/approve", async (request, reply) => {
    const paramsSchema = z.object({
      transferId: z.string().uuid(),
    });

    const bodySchema = z.object({
      approved_by: z.string(),
    });

    const { transferId } = paramsSchema.parse(request.params);
    const { approved_by } = bodySchema.parse(request.body);

    try {
      const transfer = await transferService.approveTransfer(
        transferId,
        approved_by,
      );
      return reply.send(transfer);
    } catch {
      return reply.status(500).send({ error: "Failed to approve transfer" });
    }
  });

  // Transfer: Reject transfer
  fastify.post("/transfers/:transferId/reject", async (request, reply) => {
    const paramsSchema = z.object({
      transferId: z.string().uuid(),
    });

    const bodySchema = z.object({
      approved_by: z.string(),
      notes: z.string().optional(),
    });

    const { transferId } = paramsSchema.parse(request.params);
    const { approved_by, notes } = bodySchema.parse(request.body);

    try {
      const transfer = await transferService.rejectTransfer(
        transferId,
        approved_by,
        notes,
      );
      return reply.send(transfer);
    } catch {
      return reply.status(500).send({ error: "Failed to reject transfer" });
    }
  });

  // Transfer: Ship transfer
  fastify.post("/transfers/:transferId/ship", async (request, reply) => {
    const paramsSchema = z.object({
      transferId: z.string().uuid(),
    });

    const bodySchema = z.object({
      shipped_by: z.string(),
      items: z
        .array(
          z.object({
            item_id: z.string().uuid(),
            quantity_shipped: z.number().positive(),
          }),
        )
        .optional(),
    });

    const { transferId } = paramsSchema.parse(request.params);
    const { shipped_by, items } = bodySchema.parse(request.body);

    try {
      const transfer = await transferService.shipTransfer(
        transferId,
        shipped_by,
        items,
      );
      return reply.send(transfer);
    } catch {
      return reply.status(500).send({ error: "Failed to ship transfer" });
    }
  });

  // Transfer: Receive transfer
  fastify.post("/transfers/:transferId/receive", async (request, reply) => {
    const paramsSchema = z.object({
      transferId: z.string().uuid(),
    });

    const bodySchema = z.object({
      received_by: z.string(),
      items: z
        .array(
          z.object({
            item_id: z.string().uuid(),
            quantity_received: z.number().positive(),
          }),
        )
        .optional(),
    });

    const { transferId } = paramsSchema.parse(request.params);
    const { received_by, items } = bodySchema.parse(request.body);

    try {
      const transfer = await transferService.receiveTransfer(
        transferId,
        received_by,
        items,
      );
      return reply.send(transfer);
    } catch {
      return reply.status(500).send({ error: "Failed to receive transfer" });
    }
  });

  // Transfer: Cancel transfer
  fastify.post("/transfers/:transferId/cancel", async (request, reply) => {
    const schema = z.object({
      transferId: z.string().uuid(),
    });

    const { transferId } = schema.parse(request.params);

    try {
      const transfer = await transferService.cancelTransfer(transferId);
      return reply.send(transfer);
    } catch {
      return reply.status(500).send({ error: "Failed to cancel transfer" });
    }
  });

  // Transfer: Update transfer item
  fastify.put("/transfers/items/:itemId", async (request, reply) => {
    const paramsSchema = z.object({
      itemId: z.string().uuid(),
    });

    const bodySchema = z.object({
      batch_id: z.string().optional(),
      expiry_date: z.coerce.date().optional(),
      quantity_requested: z.number().positive().optional(),
      quantity_shipped: z.number().positive().optional(),
      quantity_received: z.number().positive().optional(),
      unit_cost: z.number().optional(),
      notes: z.string().optional(),
    });

    const { itemId } = paramsSchema.parse(request.params);
    const updates = bodySchema.parse(request.body);

    try {
      const item = await transferService.updateTransferItem(itemId, updates);
      return reply.send(item);
    } catch (error) {
      if (error instanceof Error && error.message === "No fields to update") {
        return reply.status(400).send({ error: "No fields to update" });
      }
      return reply
        .status(500)
        .send({ error: "Failed to update transfer item" });
    }
  });

  // Transfer: Get summary
  fastify.get("/transfers/summary", async (request, reply) => {
    const schema = z.object({
      from_store_id: z.string().uuid().optional(),
      to_store_id: z.string().uuid().optional(),
      status: z
        .enum([
          "REQUESTED",
          "APPROVED",
          "IN_TRANSIT",
          "COMPLETED",
          "CANCELLED",
          "REJECTED",
        ])
        .optional(),
      date_from: z.coerce.date().optional(),
      date_to: z.coerce.date().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const summary = await transferService.getTransferSummary(filters);
      return reply.send(summary);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get transfer summary" });
    }
  });
}
