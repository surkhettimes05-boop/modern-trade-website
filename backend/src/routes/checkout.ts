import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  authenticateCustomer,
  customerId,
} from "../middleware/customerAuthentication.js";
import { CheckoutService } from "../services/checkoutService.js";
import { CodCheckoutBodySchema } from "../contracts/checkout.js";
import { DeliveryZoneService } from "../services/deliveryZoneService.js";

const checkout = new CheckoutService();
const deliveryZones = new DeliveryZoneService();
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
  fastify.get("/checkout/service-areas", async (request) => {
    const { store_id } = z
      .object({ store_id: z.string().uuid() })
      .strict()
      .parse(request.query);
    const db = await import("../database/connection.js");
    const result = await db.query(
      `WITH active_zones AS (
         SELECT included_municipalities, included_wards
           FROM delivery_zones
          WHERE store_id = $1
            AND is_active = TRUE
            AND (effective_date IS NULL OR effective_date <= CURRENT_DATE)
            AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
       )
       SELECT m.id,
              m.name_en,
              COALESCE(
                json_agg(
                  DISTINCT jsonb_build_object(
                    'id', w.id,
                    'ward_number', w.ward_number,
                    'name_en', w.name_en
                  )
                ) FILTER (WHERE w.id IS NOT NULL),
                '[]'::json
              ) AS wards
         FROM nepal_municipalities m
         JOIN nepal_wards w ON w.municipality_id = m.id
        WHERE EXISTS (
          SELECT 1
            FROM active_zones z
           WHERE (
             m.id = ANY(COALESCE(z.included_municipalities, ARRAY[]::integer[]))
             OR w.id = ANY(COALESCE(z.included_wards, ARRAY[]::integer[]))
           )
             AND (
               COALESCE(cardinality(z.included_wards), 0) = 0
               OR w.id = ANY(z.included_wards)
             )
        )
        GROUP BY m.id, m.name_en
        ORDER BY m.name_en`,
      [store_id],
    );
    return result.rows;
  });

  fastify.post("/checkout/delivery-quote", async (request, reply) => {
    const body = z
      .object({
        store_id: z.string().uuid(),
        municipality_id: z.coerce.number().int().positive(),
        ward_id: z.coerce.number().int().positive(),
        order_value: z.coerce.number().nonnegative(),
      })
      .strict()
      .parse(request.body);
    const quote = await deliveryZones.getDeliveryQuote({
      store_id: body.store_id,
      municipality_id: body.municipality_id,
      ward_id: body.ward_id,
      order_value: body.order_value,
    });
    return reply.status(quote.serviceable ? 200 : 400).send(quote);
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
          shippingMunicipalityId:
            body.delivery_type === "DELIVERY"
              ? body.shipping_municipality_id
              : undefined,
          shippingWardId:
            body.delivery_type === "DELIVERY"
              ? body.shipping_ward_id
              : undefined,
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
        message.includes("delivery") ||
        message.includes("municipality") ||
        message.includes("Address");
      if (!clientError) request.log.error({ error }, "COD checkout failed");
      return reply
        .status(clientError ? 400 : 500)
        .send({ error: clientError ? message : "Checkout failed" });
    }
  });
}
