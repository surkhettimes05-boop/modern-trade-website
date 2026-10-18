import { FastifyInstance } from "fastify";
import { z } from "zod";
import { WebOrderService } from "../services/webOrderService.js";
import { authenticateStaff } from "../middleware/authentication.js";
import { csrfMatches } from "../utils/csrf.js";
import { requireStoreAccess } from "../plugins/authorization.js";
import { getPool, query } from "../database/connection.js";
import { bindAuthenticatedAuditActor } from "../utils/auditActor.js";

const webOrderService = new WebOrderService();

export async function webOrderRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authenticateStaff);
  fastify.addHook("preHandler", async (request, reply) => {
    if (!csrfMatches(request)) {
      return reply.status(403).send({
        error: "CSRF validation failed",
        code: "CSRF_INVALID",
      });
    }
    bindAuthenticatedAuditActor(request);
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
      const order = await query(
        "SELECT store_id FROM web_orders WHERE id = $1",
        [params.orderId],
      );
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
  });
  // Order creation is intentionally handled only by /checkout/cod.
  // Staff routes below operate on already-created orders.

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
      search: z.string().trim().max(100).optional(),
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

  // Web Order: Get reservation state for fulfillment/reconciliation.
  // This inherits order read capability and authoritative store scoping from
  // the route-level preHandler instead of requiring privileged-admin MFA.
  fastify.get("/web-orders/:orderId/reservations", async (request, reply) => {
    const schema = z.object({ orderId: z.string().uuid() });
    const { orderId } = schema.parse(request.params);
    const result = await query(
      `SELECT reservation_id, product_id, store_id, quantity, status,
              reserved_at, expires_at, updated_at
         FROM stock_reservations
        WHERE order_id = $1
        ORDER BY reserved_at, reservation_id`,
      [orderId],
    );
    return reply.send(result.rows);
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

  // Web Order: Assign delivery. web_orders remains the lifecycle source of truth;
  // order_fulfillment stores assignment/tracking evidence only.
  fastify.post("/web-orders/:orderId/fulfillment/assign", async (request, reply) => {
    const { orderId } = z.object({ orderId: z.string().uuid() }).parse(request.params);
    const body = z.object({
      assigned_to: z.string().trim().min(1).max(100),
      idempotency_key: z.string().trim().min(8).max(200),
      notes: z.string().trim().max(500).optional(),
    }).parse(request.body);

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const orderResult = await client.query(
        "SELECT id, status, delivery_type FROM web_orders WHERE id = $1 FOR UPDATE",
        [orderId],
      );
      const order = orderResult.rows[0];
      if (!order) {
        await client.query("ROLLBACK");
        return reply.status(404).send({ error: "Order not found" });
      }
      if (order.delivery_type !== "DELIVERY") {
        await client.query("ROLLBACK");
        return reply.status(409).send({ error: "Pickup orders do not require delivery assignment" });
      }
      if (order.status !== "PACKED") {
        await client.query("ROLLBACK");
        return reply.status(409).send({ error: "Order must be PACKED before delivery assignment" });
      }

      const existing = await client.query(
        `SELECT * FROM order_fulfillment
          WHERE order_id = $1 AND status <> 'CANCELLED'
          ORDER BY created_at DESC LIMIT 1`,
        [orderId],
      );
      if (existing.rows.length) {
        await client.query("COMMIT");
        return reply.send(existing.rows[0]);
      }

      const result = await client.query(
        `INSERT INTO order_fulfillment
          (order_id, fulfillment_type, status, assigned_to, assigned_at, notes,
           idempotency_key, metadata)
         VALUES ($1, 'DELIVERY', 'ASSIGNED', $2, NOW(), $3, $4, $5::jsonb)
         ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
         RETURNING *`,
        [
          orderId,
          body.assigned_to,
          body.notes || null,
          body.idempotency_key,
          JSON.stringify({ assigned_by: (request.user as { id: string }).id }),
        ],
      );
      if (!result.rows.length) {
        const replay = await client.query(
          "SELECT * FROM order_fulfillment WHERE idempotency_key = $1",
          [body.idempotency_key],
        );
        if (replay.rows[0]?.order_id !== orderId) {
          throw new Error("Idempotency key already belongs to another order");
        }
        await client.query("COMMIT");
        return reply.send(replay.rows[0]);
      }
      await client.query("COMMIT");
      return reply.status(201).send(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      request.log.error({ err: error, orderId }, "Delivery assignment failed");
      return reply.status(500).send({ error: "Failed to assign delivery" });
    } finally {
      client.release();
    }
  });

  fastify.post("/web-orders/:orderId/cod-settlement", async (request, reply) => {
    const { orderId } = z.object({ orderId: z.string().uuid() }).parse(request.params);
    const body = z.object({
      counted_amount: z.coerce.number().nonnegative(),
      idempotency_key: z.string().trim().min(8).max(200),
      reason: z.string().trim().min(1).max(500).optional(),
    }).parse(request.body);
    const user = request.user as { id: string; roleKey?: string; capabilities?: string[] };
    const allowed = user.roleKey === "platform_admin" ||
      user.capabilities?.includes("system.manage") ||
      user.capabilities?.includes("reconciliation.manage");
    if (!allowed) return reply.status(403).send({ error: "COD reconciliation permission required" });

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(
        "SELECT * FROM cod_cash_collections WHERE order_id = $1 FOR UPDATE", [orderId],
      );
      const collection = found.rows[0];
      if (!collection) {
        await client.query("ROLLBACK");
        return reply.status(409).send({ error: "COD cash has not been collected for this order" });
      }
      const prior = await client.query(
        "SELECT * FROM cod_cash_settlements WHERE collection_id = $1", [collection.id],
      );
      if (prior.rows.length) {
        await client.query("COMMIT");
        return reply.send(prior.rows[0]);
      }
      const expected = Number(collection.amount);
      const variance = body.counted_amount - expected;
      const status = Math.abs(variance) < 0.005 ? "MATCHED" : "DISCREPANCY";
      if (status === "DISCREPANCY" && !body.reason) {
        await client.query("ROLLBACK");
        return reply.status(400).send({ error: "Reason is required for a COD cash discrepancy" });
      }
      const inserted = await client.query(
        `INSERT INTO cod_cash_settlements
          (collection_id, store_id, settled_by, expected_amount, counted_amount,
           variance, status, reason, idempotency_key, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
         ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`,
        [collection.id, collection.store_id, user.id, expected, body.counted_amount,
         variance, status, body.reason || null, body.idempotency_key,
         JSON.stringify({ order_id: orderId })],
      );
      if (!inserted.rows.length) {
        const replay = await client.query(
          "SELECT * FROM cod_cash_settlements WHERE idempotency_key = $1", [body.idempotency_key],
        );
        if (replay.rows[0]?.collection_id !== collection.id) throw new Error("Idempotency conflict");
        await client.query("COMMIT");
        return reply.send(replay.rows[0]);
      }
      await client.query("COMMIT");
      return reply.status(201).send(inserted.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      request.log.error({ err: error, orderId }, "COD settlement failed");
      return reply.status(500).send({ error: "Failed to reconcile COD cash" });
    } finally {
      client.release();
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
        "CANCELLED",
      ]),
      reason: z.string().trim().min(1).max(500).optional(),
      cod_received: z.boolean().optional().default(false),
    });

    const { orderId } = paramsSchema.parse(request.params);
    const { status, reason, cod_received } = bodySchema.parse(request.body);

    try {
      const order = await webOrderService.updateWebOrderStatus(
        orderId,
        status,
        (request.user as { id: string }).id,
        reason,
        cod_received,
      );
      return reply.send(order);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update order status";
      const clientError =
        message.startsWith("Invalid transition") ||
        message.includes("COD cash receipt") ||
        message.includes("Insufficient inventory");
      if (!clientError) {
        request.log.error(
          { err: error, orderId, requestedStatus: status },
          "Web order status transition failed",
        );
      }
      return reply.status(clientError ? 409 : 500).send({ error: message });
    }
  });

  // Web Order: Update payment status
  fastify.put("/web-orders/:orderId/payment-status", async (request, reply) => {
    const paramsSchema = z.object({
      orderId: z.string().uuid(),
    });

    const bodySchema = z.object({
      payment_status: z.enum(["PENDING", "PAID", "FAILED"]),
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
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update payment status";
      return reply
        .status(message.startsWith("Invalid payment transition") ? 409 : 500)
        .send({ error: message });
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
      const message =
        error instanceof Error ? error.message : "Failed to cancel order";
      return reply
        .status(message.startsWith("Invalid transition") ? 409 : 500)
        .send({ error: message });
    }
  });
}
