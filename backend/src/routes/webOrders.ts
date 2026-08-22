import { FastifyInstance } from "fastify";
import { z } from "zod";
import { WebOrderService } from "../services/webOrderService.js";
import { authenticateStaff } from "../middleware/authentication.js";
import { csrfMatches } from "../utils/csrf.js";
import { requireStoreAccess } from "../plugins/authorization.js";
import { query } from "../database/connection.js";
import { bindAuthenticatedAuditActor } from "../utils/auditActor.js";
import { CheckoutService } from "../services/checkoutService.js";

const webOrderService = new WebOrderService();
const checkoutService = new CheckoutService();

export async function webOrderRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authenticateStaff);
  fastify.addHook("preHandler", async (request, reply) => {
    if (!csrfMatches(request)) {
      return reply.status(403).send({
        error: "CSRF validation failed",
        code: "CSRF_INVALID",
      });
    }
    const user = request.user as { roleKey?: string; capabilities?: string[] };
    const privileged =
      user.roleKey === "platform_admin" ||
      user.capabilities?.includes("system.manage");
    const requestBody = (request.body || {}) as Record<string, unknown>;
    const path = request.url.split("?", 1)[0];
    const capability =
      request.method === "GET"
        ? "orders.read"
        : path.endsWith("/cancel") || requestBody.status === "CANCELLED"
          ? "orders.cancel"
          : path.endsWith("/payment-status") &&
              requestBody.payment_status === "REFUNDED"
            ? "refunds.approve"
            : path.endsWith("/status")
              ? "orders.fulfil"
              : "orders.modify";
    if (!privileged && !user.capabilities?.includes(capability)) {
      return reply.status(403).send({ error: "Order permission required" });
    }

    if (privileged) return;
    const scopedUser = request.user as {
      scopeType?: string;
      scopeOrganizationId?: string;
      scopeStoreIds?: string[];
      storeId?: string;
    };
    if (scopedUser.scopeType === "GLOBAL") return;

    const body = (request.body || {}) as Record<string, unknown>;
    const queryParams = (request.query || {}) as Record<string, unknown>;
    const params = (request.params || {}) as Record<string, unknown>;
    let targetStoreId =
      typeof body.store_id === "string"
        ? body.store_id
        : typeof queryParams.store_id === "string"
          ? queryParams.store_id
          : undefined;

    if (!targetStoreId && typeof params.orderId === "string") {
      const order = await query("SELECT store_id FROM web_orders WHERE id = $1", [
        params.orderId,
      ]);
      targetStoreId = order.rows[0]?.store_id;
    }
    if (!targetStoreId && typeof params.orderNumber === "string") {
      const order = await query(
        "SELECT store_id FROM web_orders WHERE order_number = $1",
        [params.orderNumber],
      );
      targetStoreId = order.rows[0]?.store_id;
    }
    if (!targetStoreId) {
      return reply.status(400).send({
        error: "Store ID is required for store-scoped order operations",
        code: "STORE_ID_REQUIRED",
      });
    }
    try {
      await requireStoreAccess(request, targetStoreId);
    } catch {
      return reply.status(403).send({
        error: "Store is outside the staff scope",
        code: "STORE_SCOPE_DENIED",
      });
    }
    bindAuthenticatedAuditActor(request);
  });
  // Web Order: Create order from cart
  fastify.post("/web-orders", async (request, reply) => {
    const schema = z.object({
      customer_id: z.string().uuid(),
      store_id: z.string().uuid(),
      cart_id: z.string().uuid(),
      payment_method: z.literal("COD"),
      idempotency_key: z.string().min(8).max(100),
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
    }).strict();

    const orderData = schema.parse(request.body);

    try {
      const order = await checkoutService.createCodOrder({
        customerId: orderData.customer_id,
        storeId: orderData.store_id,
        cartId: orderData.cart_id,
        idempotencyKey: orderData.idempotency_key,
        deliveryType: orderData.delivery_type,
        shippingName: orderData.shipping_name,
        shippingPhone: orderData.shipping_phone,
        shippingAddress: orderData.shipping_address,
        shippingCity: orderData.shipping_city,
        shippingState: orderData.shipping_state,
        shippingPostalCode: orderData.shipping_postal_code,
        shippingCountry: orderData.shipping_country,
        notes: orderData.notes,
        actorId: (request.user as { id: string }).id,
      });
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
          "PENDING_PAYMENT",
          "CONFIRMED",
          "PICKING",
          "PACKED",
          "OUT_FOR_DELIVERY",
          "DELIVERED",
          "RETURN_REQUESTED",
          "RETURNED",
          "CANCELLED",
          "REFUNDED",
        ])
        .optional(),
      payment_status: z
        .enum(["PENDING", "PAID", "FAILED", "REFUNDED"])
        .optional(),
      date_from: z.coerce.date().optional(),
      date_to: z.coerce.date().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).max(100_000).default(0),
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
        "PENDING_PAYMENT",
        "CONFIRMED",
        "PICKING",
        "PACKED",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "RETURN_REQUESTED",
        "RETURNED",
        "CANCELLED",
        "REFUNDED",
      ]),
      reason: z.string().trim().min(1).max(500).optional(),
    });

    const { orderId } = paramsSchema.parse(request.params);
    const { status, reason } = bodySchema.parse(request.body);

    try {
      const order = await webOrderService.updateWebOrderStatus(
        orderId,
        status,
        (request.user as { id: string }).id,
        reason,
      );
      return reply.send(order);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update order status";
      return reply.status(message.startsWith("Invalid transition") ? 409 : 500).send({ error: message });
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
        (request.user as { id: string }).id,
        payment_intent_id,
      );
      return reply.send(order);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update payment status";
      return reply.status(message.startsWith("Invalid payment transition") ? 409 : 500).send({ error: message });
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
      const order = await webOrderService.cancelWebOrder(
        orderId,
        (request.user as { id: string }).id,
        reason,
      );
      return reply.send(order);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to cancel order";
      return reply.status(message.startsWith("Invalid transition") ? 409 : 500).send({ error: message });
    }
  });
}
