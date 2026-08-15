import { FastifyInstance } from "fastify";
import { z } from "zod";
import { OrderLifecycleService } from "../services/orderLifecycleService.js";

const orderLifecycleService = new OrderLifecycleService();

export async function orderLifecycleRoutes(fastify: FastifyInstance) {
  // Order Lifecycle: Transition status
  fastify.post("/orders/:orderId/transition", async (request, reply) => {
    const paramsSchema = z.object({
      orderId: z.string().uuid(),
    });

    const bodySchema = z.object({
      to_status: z.enum([
        "DRAFT",
        "PENDING_PAYMENT",
        "CONFIRMED",
        "PICKING",
        "PACKED",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "RETURN_REQUESTED",
        "RETURNED",
        "REFUNDED",
        "CANCELLED",
      ]),
      reason: z.string().optional(),
      created_by: z.string().optional(),
      metadata: z.any().optional(),
    });

    const { orderId } = paramsSchema.parse(request.params);
    const transitionData = bodySchema.parse(request.body);

    try {
      const order = await orderLifecycleService.transitionOrderStatus(
        orderId,
        transitionData.to_status,
        transitionData,
      );
      return reply.send(order);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Invalid transition")
      ) {
        return reply.status(400).send({ error: error.message });
      }
      return reply
        .status(500)
        .send({ error: "Failed to transition order status" });
    }
  });

  // Order Lifecycle: Get order events
  fastify.get("/orders/:orderId/events", async (request, reply) => {
    const schema = z.object({
      orderId: z.string().uuid(),
    });

    const { orderId } = schema.parse(request.params);

    try {
      const events = await orderLifecycleService.getOrderEvents(orderId);
      return reply.send(events);
    } catch {
      return reply.status(500).send({ error: "Failed to get order events" });
    }
  });

  // Order Lifecycle: Cancel order
  fastify.post("/orders/:orderId/cancel", async (request, reply) => {
    const paramsSchema = z.object({
      orderId: z.string().uuid(),
    });

    const bodySchema = z.object({
      reason: z.string().optional(),
      cancelled_by: z.string().optional(),
    });

    const { orderId } = paramsSchema.parse(request.params);
    const cancelData = bodySchema.parse(request.body);

    try {
      const order = await orderLifecycleService.cancelOrder(
        orderId,
        cancelData,
      );
      return reply.send(order);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("cannot be cancelled")
      ) {
        return reply.status(400).send({ error: error.message });
      }
      return reply.status(500).send({ error: "Failed to cancel order" });
    }
  });

  // Order Lifecycle: Request return
  fastify.post("/orders/:orderId/request-return", async (request, reply) => {
    const paramsSchema = z.object({
      orderId: z.string().uuid(),
    });

    const bodySchema = z.object({
      reason: z.string().optional(),
      requested_by: z.string().optional(),
    });

    const { orderId } = paramsSchema.parse(request.params);
    const returnData = bodySchema.parse(request.body);

    try {
      const order = await orderLifecycleService.requestReturn(
        orderId,
        returnData,
      );
      return reply.send(order);
    } catch {
      return reply.status(500).send({ error: "Failed to request return" });
    }
  });

  // Order Lifecycle: Process refund
  fastify.post("/orders/:orderId/refund", async (request, reply) => {
    const paramsSchema = z.object({
      orderId: z.string().uuid(),
    });

    const bodySchema = z.object({
      refund_amount: z.number().nonnegative().optional(),
      refund_reason: z.string().optional(),
      processed_by: z.string().optional(),
    });

    const { orderId } = paramsSchema.parse(request.params);
    const refundData = bodySchema.parse(request.body);

    try {
      const order = await orderLifecycleService.processRefund(
        orderId,
        refundData,
      );
      return reply.send(order);
    } catch (error) {
      if (error instanceof Error && error.message.includes("cannot exceed")) {
        return reply.status(400).send({ error: error.message });
      }
      return reply.status(500).send({ error: "Failed to process refund" });
    }
  });

  // Order Lifecycle: Validate checkout
  fastify.post("/orders/validate-checkout", async (request, reply) => {
    const schema = z.object({
      cart_id: z.string().uuid(),
      customer_id: z.string().uuid().optional(),
      address_id: z.string().uuid().optional(),
      delivery_zone_id: z.string().uuid().optional(),
      store_id: z.string().uuid(),
      payment_method: z.string(),
    });

    const checkoutData = schema.parse(request.body);

    try {
      const validation =
        await orderLifecycleService.validateCheckout(checkoutData);
      return reply.send(validation);
    } catch {
      return reply.status(500).send({ error: "Failed to validate checkout" });
    }
  });
}
