import { FastifyInstance } from "fastify";
import { z } from "zod";
import { WebOrderService } from "../services/webOrderService.js";

const webOrderService = new WebOrderService();

export async function webOrderRoutes(fastify: FastifyInstance) {
  // Web Order: Create order from cart
  fastify.post("/web-orders", async (request, reply) => {
    const schema = z.object({
      customer_id: z.string().uuid(),
      store_id: z.string().uuid(),
      cart_id: z.string().uuid(),
      payment_method: z.string(),
      payment_intent_id: z.string().optional(),
      shipping_name: z.string().min(1),
      shipping_phone: z.string(),
      shipping_address: z.string().min(1),
      shipping_city: z.string(),
      shipping_state: z.string(),
      shipping_postal_code: z.string(),
      shipping_country: z.string(),
      delivery_type: z.enum(["DELIVERY", "PICKUP"]),
      delivery_date: z.coerce.date().optional(),
      delivery_time_slot: z.string().optional(),
      notes: z.string().optional(),
      metadata: z.any().optional(),
    });

    const orderData = schema.parse(request.body);

    try {
      const order = await webOrderService.createWebOrder(orderData);
      return reply.status(201).send(order);
    } catch (error) {
      if (error instanceof Error && error.message === "Cart is empty") {
        return reply.status(400).send({ error: "Cart is empty" });
      }
      return reply.status(500).send({ error: "Failed to create web order" });
    }
  });

  // Web Order: Get order by ID
  fastify.get("/web-orders/:orderId", async (request, reply) => {
    const schema = z.object({
      orderId: z.string().uuid(),
    });

    const { orderId } = schema.parse(request.params);

    try {
      const order = await webOrderService.getWebOrder(orderId);
      if (!order) {
        return reply.status(404).send({ error: "Order not found" });
      }
      return reply.send(order);
    } catch {
      return reply.status(500).send({ error: "Failed to get order" });
    }
  });

  // Web Order: Get order by number
  fastify.get("/web-orders/number/:orderNumber", async (request, reply) => {
    const schema = z.object({
      orderNumber: z.string(),
    });

    const { orderNumber } = schema.parse(request.params);

    try {
      const order = await webOrderService.getWebOrderByNumber(orderNumber);
      if (!order) {
        return reply.status(404).send({ error: "Order not found" });
      }
      return reply.send(order);
    } catch {
      return reply.status(500).send({ error: "Failed to get order" });
    }
  });

  // Web Order: Get all orders
  fastify.get("/web-orders", async (request, reply) => {
    const schema = z.object({
      customer_id: z.string().uuid().optional(),
      store_id: z.string().uuid().optional(),
      status: z
        .enum([
          "PENDING",
          "CONFIRMED",
          "PROCESSING",
          "SHIPPED",
          "DELIVERED",
          "CANCELLED",
          "REFUNDED",
        ])
        .optional(),
      payment_status: z
        .enum(["PENDING", "PAID", "FAILED", "REFUNDED"])
        .optional(),
      date_from: z.coerce.date().optional(),
      date_to: z.coerce.date().optional(),
      limit: z.coerce.number().optional(),
      offset: z.coerce.number().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const orders = await webOrderService.getWebOrders(filters);
      return reply.send(orders);
    } catch {
      return reply.status(500).send({ error: "Failed to get orders" });
    }
  });

  // Web Order: Get order items
  fastify.get("/web-orders/:orderId/items", async (request, reply) => {
    const schema = z.object({
      orderId: z.string().uuid(),
    });

    const { orderId } = schema.parse(request.params);

    try {
      const items = await webOrderService.getWebOrderItems(orderId);
      return reply.send(items);
    } catch {
      return reply.status(500).send({ error: "Failed to get order items" });
    }
  });

  // Web Order: Update order status
  fastify.put("/web-orders/:orderId/status", async (request, reply) => {
    const paramsSchema = z.object({
      orderId: z.string().uuid(),
    });

    const bodySchema = z.object({
      status: z.enum([
        "PENDING",
        "CONFIRMED",
        "PROCESSING",
        "SHIPPED",
        "DELIVERED",
        "CANCELLED",
        "REFUNDED",
      ]),
    });

    const { orderId } = paramsSchema.parse(request.params);
    const { status } = bodySchema.parse(request.body);

    try {
      const order = await webOrderService.updateWebOrderStatus(orderId, status);
      return reply.send(order);
    } catch {
      return reply.status(500).send({ error: "Failed to update order status" });
    }
  });

  // Web Order: Update payment status
  fastify.put("/web-orders/:orderId/payment-status", async (request, reply) => {
    const paramsSchema = z.object({
      orderId: z.string().uuid(),
    });

    const bodySchema = z.object({
      payment_status: z.enum(["PENDING", "PAID", "FAILED", "REFUNDED"]),
      payment_intent_id: z.string().optional(),
    });

    const { orderId } = paramsSchema.parse(request.params);
    const { payment_status, payment_intent_id } = bodySchema.parse(
      request.body,
    );

    try {
      const order = await webOrderService.updatePaymentStatus(
        orderId,
        payment_status,
        payment_intent_id,
      );
      return reply.send(order);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to update payment status" });
    }
  });

  // Web Order: Cancel order
  fastify.post("/web-orders/:orderId/cancel", async (request, reply) => {
    const paramsSchema = z.object({
      orderId: z.string().uuid(),
    });

    const bodySchema = z.object({
      reason: z.string().optional(),
    });

    const { orderId } = paramsSchema.parse(request.params);
    const { reason } = bodySchema.parse(request.body);

    try {
      const order = await webOrderService.cancelWebOrder(orderId, reason);
      return reply.send(order);
    } catch {
      return reply.status(500).send({ error: "Failed to cancel order" });
    }
  });
}
