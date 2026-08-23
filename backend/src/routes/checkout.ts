import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  authenticateCustomer,
  customerId,
} from "../middleware/customerAuthentication.js";
import { CheckoutService } from "../services/checkoutService.js";
import { CodCheckoutBodySchema } from "../contracts/checkout.js";

const checkout = new CheckoutService();
export async function checkoutRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authenticateCustomer);
  fastify.get("/customer/orders", async (request) => {
    const { limit, offset } = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).max(100_000).default(0),
      })
      .strict()
      .parse(request.query);
    const result = await (
      await import("../database/connection.js")
    ).query(
      "SELECT * FROM web_orders WHERE customer_id = $1 ORDER BY order_date DESC LIMIT $2 OFFSET $3",
      [customerId(request), limit, offset],
    );
    return result.rows;
  });
  fastify.get("/customer/orders/:orderId", async (request, reply) => {
    const { orderId } = z
      .object({ orderId: z.string().uuid() })
      .parse(request.params);
    const db = await import("../database/connection.js");
    const order = await db.query(
      "SELECT * FROM web_orders WHERE id = $1 AND customer_id = $2",
      [orderId, customerId(request)],
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
    const { orderId } = z
      .object({ orderId: z.string().uuid() })
      .parse(request.params);
    const { reason } = z
      .object({ reason: z.string().trim().min(1).max(500).optional() })
      .strict()
      .parse(request.body || {});
    try {
      return await checkout.cancelCustomerOrder(
        orderId,
        customerId(request),
        reason || "Cancelled by customer",
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Order cannot be cancelled"
      ) {
        return reply.status(400).send({ error: error.message });
      }
      request.log.error({ error }, "Customer order cancellation failed");
      return reply.status(500).send({ error: "Failed to cancel order" });
    }
  });
  fastify.post("/checkout/cod", async (request, reply) => {
    const body = CodCheckoutBodySchema.parse(request.body);
    try {
      return reply.status(201).send(
        await checkout.createCodOrder({
          ...body,
          customerId: customerId(request),
          storeId: body.store_id,
          cartId: body.cart_id,
          idempotencyKey: body.idempotency_key,
          deliveryType: body.delivery_type,
          shippingName: body.shipping_name,
          shippingPhone: body.shipping_phone,
          shippingAddress:
            body.delivery_type === "DELIVERY"
              ? body.shipping_address
              : undefined,
          shippingCity:
            body.delivery_type === "DELIVERY" ? body.shipping_city : undefined,
          shippingState:
            body.delivery_type === "DELIVERY" ? body.shipping_state : undefined,
          shippingPostalCode:
            body.delivery_type === "DELIVERY"
              ? body.shipping_postal_code
              : undefined,
          shippingCountry:
            body.delivery_type === "DELIVERY"
              ? body.shipping_country
              : undefined,
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Checkout failed";
      const clientError =
        message.includes("stock") ||
        message.includes("Cart") ||
        message.includes("Price") ||
        message.includes("store") ||
        message.includes("delivery address");
      if (!clientError) request.log.error({ error }, "COD checkout failed");
      return reply
        .status(clientError ? 400 : 500)
        .send({ error: clientError ? message : "Checkout failed" });
    }
  });
}
