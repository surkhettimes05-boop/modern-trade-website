import { FastifyInstance } from "fastify";
import { z } from "zod";
import { PurchaseOrderService } from "../services/purchaseOrderService.js";

const purchaseOrderService = new PurchaseOrderService();

export async function purchaseOrderRoutes(fastify: FastifyInstance) {
  // Purchase Order: Create PO
  fastify.post("/purchase-orders", async (request, reply) => {
    const schema = z.object({
      supplier_id: z.string().uuid(),
      store_id: z.string().uuid().optional(),
      warehouse_id: z.string().uuid().optional(),
      expected_delivery_date: z.coerce.date().optional(),
      items: z
        .array(
          z.object({
            product_id: z.string().uuid(),
            supplier_sku: z.string().optional(),
            product_name: z.string().min(1),
            quantity_ordered: z.number().positive(),
            unit_price: z.number().positive(),
            tax_amount: z.number().optional(),
            discount_amount: z.number().optional(),
            batch_id: z.string().optional(),
            expiry_date: z.coerce.date().optional(),
            notes: z.string().optional(),
          }),
        )
        .min(1),
      tax_amount: z.number().optional(),
      discount_amount: z.number().optional(),
      shipping_amount: z.number().optional(),
      currency: z.string().optional(),
      reference_number: z.string().optional(),
      notes: z.string().optional(),
      idempotency_key: z.string().optional(),
      metadata: z.any().optional(),
      created_by: z.string(),
    });

    const poData = schema.parse(request.body);

    try {
      const po = await purchaseOrderService.createPurchaseOrder(poData);
      return reply.status(201).send(po);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to create purchase order" });
    }
  });

  // Purchase Order: Get PO by ID
  fastify.get("/purchase-orders/:poId", async (request, reply) => {
    const schema = z.object({
      poId: z.string().uuid(),
    });

    const { poId } = schema.parse(request.params);

    try {
      const po = await purchaseOrderService.getPurchaseOrder(poId);
      if (!po) {
        return reply.status(404).send({ error: "Purchase order not found" });
      }
      return reply.send(po);
    } catch {
      return reply.status(500).send({ error: "Failed to get purchase order" });
    }
  });

  // Purchase Order: Get PO by number
  fastify.get("/purchase-orders/number/:poNumber", async (request, reply) => {
    const schema = z.object({
      poNumber: z.string(),
    });

    const { poNumber } = schema.parse(request.params);

    try {
      const po = await purchaseOrderService.getPurchaseOrderByNumber(poNumber);
      if (!po) {
        return reply.status(404).send({ error: "Purchase order not found" });
      }
      return reply.send(po);
    } catch {
      return reply.status(500).send({ error: "Failed to get purchase order" });
    }
  });

  // Purchase Order: Get all POs
  fastify.get("/purchase-orders", async (request, reply) => {
    const schema = z.object({
      supplier_id: z.string().uuid().optional(),
      store_id: z.string().uuid().optional(),
      warehouse_id: z.string().uuid().optional(),
      status: z
        .enum([
          "DRAFT",
          "SENT",
          "ACKNOWLEDGED",
          "PARTIAL_RECEIVED",
          "RECEIVED",
          "CANCELLED",
        ])
        .optional(),
      approval_status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
      date_from: z.coerce.date().optional(),
      date_to: z.coerce.date().optional(),
      limit: z.coerce.number().optional(),
      offset: z.coerce.number().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const pos = await purchaseOrderService.getPurchaseOrders(filters);
      return reply.send(pos);
    } catch {
      return reply.status(500).send({ error: "Failed to get purchase orders" });
    }
  });

  // Purchase Order: Get PO items
  fastify.get("/purchase-orders/:poId/items", async (request, reply) => {
    const schema = z.object({
      poId: z.string().uuid(),
    });

    const { poId } = schema.parse(request.params);

    try {
      const items = await purchaseOrderService.getPurchaseOrderItems(poId);
      return reply.send(items);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get purchase order items" });
    }
  });

  // Purchase Order: Update PO
  fastify.put("/purchase-orders/:poId", async (request, reply) => {
    const paramsSchema = z.object({
      poId: z.string().uuid(),
    });

    const bodySchema = z.object({
      expected_delivery_date: z.coerce.date().optional(),
      actual_delivery_date: z.coerce.date().optional(),
      tax_amount: z.number().optional(),
      discount_amount: z.number().optional(),
      shipping_amount: z.number().optional(),
      reference_number: z.string().optional(),
      notes: z.string().optional(),
      metadata: z.any().optional(),
    });

    const { poId } = paramsSchema.parse(request.params);
    const updates = bodySchema.parse(request.body);

    try {
      const po = await purchaseOrderService.updatePurchaseOrder(poId, updates);
      return reply.send(po);
    } catch (error) {
      if (error instanceof Error && error.message === "No fields to update") {
        return reply.status(400).send({ error: "No fields to update" });
      }
      return reply
        .status(500)
        .send({ error: "Failed to update purchase order" });
    }
  });

  // Purchase Order: Approve PO
  fastify.post("/purchase-orders/:poId/approve", async (request, reply) => {
    const paramsSchema = z.object({
      poId: z.string().uuid(),
    });

    const bodySchema = z.object({
      approved_by: z.string(),
    });

    const { poId } = paramsSchema.parse(request.params);
    const { approved_by } = bodySchema.parse(request.body);

    try {
      const po = await purchaseOrderService.approvePurchaseOrder(
        poId,
        approved_by,
      );
      return reply.send(po);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to approve purchase order" });
    }
  });

  // Purchase Order: Reject PO
  fastify.post("/purchase-orders/:poId/reject", async (request, reply) => {
    const paramsSchema = z.object({
      poId: z.string().uuid(),
    });

    const bodySchema = z.object({
      approved_by: z.string(),
    });

    const { poId } = paramsSchema.parse(request.params);
    const { approved_by } = bodySchema.parse(request.body);

    try {
      const po = await purchaseOrderService.rejectPurchaseOrder(
        poId,
        approved_by,
      );
      return reply.send(po);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to reject purchase order" });
    }
  });

  // Purchase Order: Send PO
  fastify.post("/purchase-orders/:poId/send", async (request, reply) => {
    const schema = z.object({
      poId: z.string().uuid(),
    });

    const { poId } = schema.parse(request.params);

    try {
      const po = await purchaseOrderService.sendPurchaseOrder(poId);
      return reply.send(po);
    } catch {
      return reply.status(500).send({ error: "Failed to send purchase order" });
    }
  });

  // Purchase Order: Acknowledge PO
  fastify.post("/purchase-orders/:poId/acknowledge", async (request, reply) => {
    const schema = z.object({
      poId: z.string().uuid(),
    });

    const { poId } = schema.parse(request.params);

    try {
      const po = await purchaseOrderService.acknowledgePurchaseOrder(poId);
      return reply.send(po);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to acknowledge purchase order" });
    }
  });

  // Purchase Order: Cancel PO
  fastify.post("/purchase-orders/:poId/cancel", async (request, reply) => {
    const schema = z.object({
      poId: z.string().uuid(),
    });

    const { poId } = schema.parse(request.params);

    try {
      const po = await purchaseOrderService.cancelPurchaseOrder(poId);
      return reply.send(po);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to cancel purchase order" });
    }
  });

  // Purchase Order: Update item received quantity
  fastify.put(
    "/purchase-orders/items/:itemId/received",
    async (request, reply) => {
      const paramsSchema = z.object({
        itemId: z.string().uuid(),
      });

      const bodySchema = z.object({
        quantity_received: z.number().min(0),
      });

      const { itemId } = paramsSchema.parse(request.params);
      const { quantity_received } = bodySchema.parse(request.body);

      try {
        const item = await purchaseOrderService.updateItemReceivedQuantity(
          itemId,
          quantity_received,
        );
        return reply.send(item);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to update item received quantity" });
      }
    },
  );

  // Purchase Order: Update PO status after receiving
  fastify.post(
    "/purchase-orders/:poId/update-status",
    async (request, reply) => {
      const schema = z.object({
        poId: z.string().uuid(),
      });

      const { poId } = schema.parse(request.params);

      try {
        const po =
          await purchaseOrderService.updatePOStatusAfterReceiving(poId);
        return reply.send(po);
      } catch {
        return reply.status(500).send({ error: "Failed to update PO status" });
      }
    },
  );

  // Purchase Order: Get summary
  fastify.get("/purchase-orders/summary", async (request, reply) => {
    const schema = z.object({
      supplier_id: z.string().uuid().optional(),
      store_id: z.string().uuid().optional(),
      warehouse_id: z.string().uuid().optional(),
      date_from: z.coerce.date().optional(),
      date_to: z.coerce.date().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const summary =
        await purchaseOrderService.getPurchaseOrderSummary(filters);
      return reply.send(summary);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get purchase order summary" });
    }
  });
}
