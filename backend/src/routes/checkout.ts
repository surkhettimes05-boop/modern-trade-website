import { FastifyInstance } from "fastify";
import { z } from "zod";
import { SessionService } from "../services/sessionService.js";
import { CheckoutService } from "../services/checkoutService.js";

const sessions = new SessionService();
const checkout = new CheckoutService();
export async function checkoutRoutes(fastify: FastifyInstance) {
  async function customer(request: any, reply: any) {
    const token = request.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      reply.status(401).send({ error: "Customer login required" });
      return null;
    }
    const session = await sessions.validateSession(token);
    if (!session) {
      reply.status(401).send({ error: "Customer session expired" });
      return null;
    }
    return session;
  }
  fastify.get("/customer/orders", async (request, reply) => {
    const session = await customer(request, reply);
    if (!session) return;
    const result = await (
      await import("../database/connection.js")
    ).query(
      "SELECT * FROM web_orders WHERE customer_id = $1 ORDER BY order_date DESC",
      [session.customer_id],
    );
    return result.rows;
  });
  fastify.get("/customer/orders/:orderId", async (request, reply) => {
    const session = await customer(request, reply);
    if (!session) return;
    const { orderId } = z
      .object({ orderId: z.string().uuid() })
      .parse(request.params);
    const db = await import("../database/connection.js");
    const order = await db.query(
      "SELECT * FROM web_orders WHERE id = $1 AND customer_id = $2",
      [orderId, session.customer_id],
    );
    if (!order.rows[0])
      return reply.status(404).send({ error: "Order not found" });
    const items = await db.query(
      "SELECT * FROM web_order_items WHERE order_id = $1 ORDER BY created_at",
      [orderId],
    );
    const events = await db.query(
      "SELECT * FROM order_events WHERE order_id = $1 ORDER BY created_at",
      [orderId],
    );
    return { ...order.rows[0], items: items.rows, events: events.rows };
  });
  fastify.post("/customer/orders/:orderId/cancel", async (request, reply) => {
    const session = await customer(request, reply);
    if (!session) return;
    const { orderId } = z
      .object({ orderId: z.string().uuid() })
      .parse(request.params);
    const result = await (
      await import("../database/connection.js")
    ).query(
      "UPDATE web_orders SET status = 'CANCELLED', cancellation_reason = $1, cancelled_at = NOW(), cancelled_by = $2 WHERE id = $3 AND customer_id = $2 AND status IN ('PENDING_PAYMENT','CONFIRMED') RETURNING *",
      [
        (request.body as any)?.reason || "Cancelled by customer",
        session.customer_id,
        orderId,
      ],
    );
    if (!result.rows[0])
      return reply.status(400).send({ error: "Order cannot be cancelled" });
    return result.rows[0];
  });
  fastify.post("/checkout/cod", async (request, reply) => {
    const token = request.headers.authorization?.replace("Bearer ", "");
    if (!token)
      return reply.status(401).send({ error: "Customer login required" });
    const session = await sessions.validateSession(token);
    if (!session)
      return reply.status(401).send({ error: "Customer session expired" });
    const body = z
      .object({
        cart_id: z.string().uuid(),
        store_id: z.string().uuid(),
        idempotency_key: z.string().min(8).max(100),
        delivery_type: z.enum(["DELIVERY", "PICKUP"]),
        shipping_name: z.string().min(1),
        shipping_phone: z.string().min(7),
        shipping_address: z.string().min(1),
        shipping_city: z.string().min(1),
        shipping_state: z.string().min(1),
        shipping_postal_code: z.string().min(1),
        shipping_country: z.string().min(2),
        notes: z.string().optional(),
      })
      .parse(request.body);
    try {
      return reply.status(201).send(
        await checkout.createCodOrder({
          ...body,
          customerId: session.customer_id,
          storeId: body.store_id,
          cartId: body.cart_id,
          idempotencyKey: body.idempotency_key,
          deliveryType: body.delivery_type,
          shippingName: body.shipping_name,
          shippingPhone: body.shipping_phone,
          shippingAddress: body.shipping_address,
          shippingCity: body.shipping_city,
          shippingState: body.shipping_state,
          shippingPostalCode: body.shipping_postal_code,
          shippingCountry: body.shipping_country,
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Checkout failed";
      return reply
        .status(
          message.includes("stock") ||
            message.includes("Cart") ||
            message.includes("Price")
            ? 400
            : 500,
        )
        .send({ error: message });
    }
  });
}
