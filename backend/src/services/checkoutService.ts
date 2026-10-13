import { randomUUID } from "node:crypto";
import { getPool } from "../database/connection.js";
import { MARKET } from "../config/market.js";
import { DeliveryZoneService } from "./deliveryZoneService.js";

const deliveryZones = new DeliveryZoneService();

export class CheckoutService {
  async createCodOrder(input: {
    customerId: string;
    storeId: string;
    cartId: string;
    idempotencyKey: string;
    deliveryType: "DELIVERY" | "PICKUP";
    shippingName: string;
    shippingPhone: string;
    shippingAddress?: string;
    shippingMunicipalityId?: number;
    shippingWardId?: number;
    shippingPostalCode?: string;
    shippingCountry?: string;
    notes?: string;
    actorId?: string;
  }) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Serialize retries before looking up the result or locking a converted cart.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `checkout:${input.customerId}:${input.idempotencyKey}`,
      ]);
      const existing = await client.query(
        "SELECT * FROM web_orders WHERE idempotency_key = $1 AND customer_id = $2",
        [input.idempotencyKey, input.customerId],
      );
      if (existing.rows[0]) {
        await client.query("COMMIT");
        return existing.rows[0];
      }

      const storeResult = await client.query(
        `SELECT id, address_en, is_temporarily_closed
           FROM stores
          WHERE id = $1 AND status = 'PUBLISHED'
          FOR SHARE`,
        [input.storeId],
      );
      const store = storeResult.rows[0];
      if (!store || store.is_temporarily_closed) {
        throw new Error("Selected store is not accepting orders");
      }

      const cart = await client.query(
        "SELECT * FROM shopping_carts WHERE id = $1 AND customer_id = $2 AND store_id = $3 AND status = 'ACTIVE' FOR UPDATE",
        [input.cartId, input.customerId, input.storeId],
      );
      if (!cart.rows[0]) {
        throw new Error("Cart is not available for this customer and store");
      }

      const items = await client.query(
        `SELECT ci.*, p.name_en, p.status AS product_status,
                COALESCE(store_price.price, organization_price.price, 0) AS authoritative_price
           FROM cart_items ci
           JOIN products p ON p.id = ci.product_id
           LEFT JOIN LATERAL (
             SELECT price
               FROM product_prices
              WHERE product_id = p.id
                AND store_id = $2
                AND active = TRUE
                AND valid_from <= NOW()
                AND (valid_to IS NULL OR valid_to > NOW())
              ORDER BY valid_from DESC
              LIMIT 1
           ) store_price ON TRUE
           LEFT JOIN LATERAL (
             SELECT price
               FROM product_prices
              WHERE product_id = p.id
                AND store_id IS NULL
                AND active = TRUE
                AND valid_from <= NOW()
                AND (valid_to IS NULL OR valid_to > NOW())
              ORDER BY valid_from DESC
              LIMIT 1
           ) organization_price ON TRUE
          WHERE ci.cart_id = $1
          FOR UPDATE OF ci`,
        [input.cartId, input.storeId],
      );
      if (!items.rows.length) throw new Error("Cart is empty");

      const productIds = items.rows.map((item) => String(item.product_id));
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext(requested.product_id::text || ':' || $2))
           FROM unnest($1::uuid[]) AS requested(product_id)
          ORDER BY requested.product_id`,
        [productIds, input.storeId],
      );

      const stockResult = await client.query(
        `SELECT requested.product_id,
                COALESCE(inventory.stock, 0)::int AS stock,
                COALESCE(reservations.reserved, 0)::int AS reserved
           FROM unnest($1::uuid[]) AS requested(product_id)
           LEFT JOIN LATERAL (
             SELECT SUM(quantity)::int AS stock
               FROM batch_inventory
              WHERE product_id = requested.product_id AND store_id = $2
           ) inventory ON TRUE
           LEFT JOIN LATERAL (
             SELECT SUM(quantity)::int AS reserved
               FROM stock_reservations
              WHERE product_id = requested.product_id
                AND store_id = $2
                AND status = 'ACTIVE'
                AND (order_id IS NOT NULL OR expires_at > NOW())
           ) reservations ON TRUE`,
        [productIds, input.storeId],
      );

      const stockByProduct = new Map(
        stockResult.rows.map((row) => [String(row.product_id), row]),
      );

      // Product prices are the final customer-facing NPR prices. We do not add
      // a blanket 13% VAT on top because FMCG tax treatment varies by SKU.
      let subtotalPaisa = 0;
      const pricedItems = items.rows.map((item) => {
        if (
          item.product_status !== "PUBLISHED" ||
          !Number.isInteger(Number(item.quantity)) ||
          Number(item.quantity) < 1 ||
          Number(item.quantity) > 999
        ) {
          throw new Error(
            "Cart contains an unavailable product or invalid quantity",
          );
        }
        const stock = stockByProduct.get(String(item.product_id));
        const authoritativePrice = Number(item.authoritative_price);
        if (!Number.isFinite(authoritativePrice) || authoritativePrice <= 0) {
          throw new Error(`Price unavailable for ${item.name_en}`);
        }
        if (
          Number(stock?.stock || 0) - Number(stock?.reserved || 0) <
          Number(item.quantity)
        ) {
          throw new Error(`Insufficient stock for ${item.name_en}`);
        }
        const linePaisa =
          Math.round(authoritativePrice * 100) * Number(item.quantity);
        subtotalPaisa += linePaisa;
        return {
          ...item,
          lineTotal: linePaisa / 100,
          taxAmount: 0,
          lineTotalWithTax: linePaisa / 100,
        };
      });

      const subtotal = subtotalPaisa / 100;
      let shippingAddress: string | null = null;
      let shippingCity: string | null = null;
      let shippingState: string | null = null;
      let shippingPostalCode: string | null = null;
      let shippingCountry = MARKET.countryCode;
      let shippingMunicipalityId: number | null = null;
      let shippingWardId: number | null = null;
      let deliveryZoneId: string | null = null;
      let deliveryQuote: Record<string, unknown> | null = null;
      let shipping = 0;

      if (input.deliveryType === "PICKUP") {
        shippingAddress = store.address_en;
      } else {
        if (
          !input.shippingAddress ||
          !input.shippingMunicipalityId ||
          !input.shippingWardId ||
          !input.shippingPostalCode ||
          input.shippingCountry !== MARKET.countryCode
        ) {
          throw new Error("A complete Nepal delivery address is required");
        }

        const division = await client.query(
          `SELECT m.id AS municipality_id,
                  m.name_en AS municipality_name,
                  d.name_en AS district_name,
                  p.name_en AS province_name,
                  w.id AS ward_id,
                  w.ward_number
             FROM nepal_municipalities m
             JOIN nepal_districts d ON d.id = m.district_id
             JOIN nepal_provinces p ON p.id = d.province_id
             JOIN nepal_wards w
               ON w.id = $2
              AND w.municipality_id = m.id
            WHERE m.id = $1`,
          [input.shippingMunicipalityId, input.shippingWardId],
        );
        if (!division.rows[0]) {
          throw new Error("Delivery municipality and ward do not match");
        }

        const quote = await deliveryZones.getDeliveryQuote({
          municipality_id: input.shippingMunicipalityId,
          ward_id: input.shippingWardId,
          store_id: input.storeId,
          order_value: subtotal,
        });
        if (!quote.serviceable) {
          throw new Error(
            quote.reason || "Address is outside this store's delivery area",
          );
        }

        shippingAddress = input.shippingAddress;
        shippingCity = division.rows[0].municipality_name;
        shippingState = division.rows[0].province_name;
        shippingPostalCode = input.shippingPostalCode;
        shippingCountry = input.shippingCountry;
        shippingMunicipalityId = input.shippingMunicipalityId;
        shippingWardId = input.shippingWardId;
        deliveryZoneId = quote.zone_id;
        deliveryQuote = quote;
        shipping = Number(quote.delivery_fee || 0);
      }

      const tax = 0;
      const total = subtotal + shipping;

      const order = await client.query(
        `INSERT INTO web_orders (
          order_number, customer_id, store_id, fulfillment_store_id, cart_id,
          idempotency_key, status, subtotal, tax_amount, shipping_amount,
          delivery_fee, discount_amount, total_amount, currency, payment_method,
          payment_status, shipping_name, shipping_phone, shipping_address,
          shipping_city, shipping_state, shipping_postal_code, shipping_country,
          shipping_municipality_id, shipping_ward_id, delivery_type,
          delivery_zone_id, delivery_quote, notes
        )
        VALUES (
          'WO-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || '-' || SUBSTRING($1, 1, 8),
          $2, $3, $3, $4, $1, 'PENDING_PAYMENT', $5, $6, $7, $7, 0, $8,
          '${MARKET.currencyCode}', 'COD', 'PENDING', $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18, $19, $20::jsonb, $21
        )
        RETURNING *`,
        [
          input.idempotencyKey,
          input.customerId,
          input.storeId,
          input.cartId,
          subtotal,
          tax,
          shipping,
          total,
          input.shippingName,
          input.shippingPhone,
          shippingAddress,
          shippingCity,
          shippingState,
          shippingPostalCode,
          shippingCountry,
          shippingMunicipalityId,
          shippingWardId,
          input.deliveryType,
          deliveryZoneId,
          JSON.stringify(deliveryQuote),
          input.notes || null,
        ],
      );

      await client.query(
        `INSERT INTO web_order_items
          (order_id, product_id, product_name, quantity, unit_price,
           discount_amount, line_total, tax_amount, line_total_with_tax)
         SELECT $1, item.product_id, item.product_name, item.quantity,
                item.unit_price, 0, item.line_total, item.tax_amount,
                item.line_total_with_tax
           FROM unnest(
             $2::uuid[], $3::text[], $4::integer[], $5::numeric[],
             $6::numeric[], $7::numeric[], $8::numeric[]
           ) AS item(
             product_id, product_name, quantity, unit_price,
             line_total, tax_amount, line_total_with_tax
           )`,
        [
          order.rows[0].id,
          pricedItems.map((item) => item.product_id),
          pricedItems.map((item) => item.name_en),
          pricedItems.map((item) => item.quantity),
          pricedItems.map((item) => item.authoritative_price),
          pricedItems.map((item) => item.lineTotal),
          pricedItems.map((item) => item.taxAmount),
          pricedItems.map((item) => item.lineTotalWithTax),
        ],
      );

      await client.query(
        `INSERT INTO stock_reservations
          (reservation_id, order_id, product_id, store_id, quantity,
           reserved_at, expires_at, status)
         SELECT reservation.reservation_id, $1, reservation.product_id, $2,
                reservation.quantity, NOW(), NOW() + INTERVAL '30 minutes',
                'ACTIVE'
           FROM unnest($3::text[], $4::uuid[], $5::integer[])
                AS reservation(reservation_id, product_id, quantity)`,
        [
          order.rows[0].id,
          input.storeId,
          pricedItems.map(() => `RES-${randomUUID()}`),
          pricedItems.map((item) => item.product_id),
          pricedItems.map((item) => item.quantity),
        ],
      );

      await client.query(
        `UPDATE shopping_carts
            SET status = 'CONVERTED', updated_at = NOW()
          WHERE id = $1`,
        [input.cartId],
      );

      await client.query(
        `INSERT INTO order_events
          (order_id, event_type, from_status, to_status, reason, metadata, created_by)
         VALUES (
           $1, 'CREATED', NULL, 'PENDING_PAYMENT', 'COD checkout submitted',
           $2::jsonb, $3
         )`,
        [
          order.rows[0].id,
          JSON.stringify({
            delivery_type: input.deliveryType,
            delivery_zone_id: deliveryZoneId,
            shipping_amount: shipping,
            prices_tax_inclusive: true,
          }),
          input.actorId || input.customerId,
        ],
      );

      await client.query("COMMIT");
      return order.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505"
      ) {
        const existing = await pool.query(
          "SELECT * FROM web_orders WHERE idempotency_key = $1 AND customer_id = $2",
          [input.idempotencyKey, input.customerId],
        );
        if (existing.rows[0]) return existing.rows[0];
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async cancelCustomerOrder(
    orderId: string,
    authenticatedCustomerId: string,
    reason: string,
  ) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT * FROM web_orders
         WHERE id = $1 AND customer_id = $2 FOR UPDATE`,
        [orderId, authenticatedCustomerId],
      );
      const order = current.rows[0];
      if (
        !order ||
        !["PENDING", "PENDING_PAYMENT", "CONFIRMED"].includes(order.status)
      ) {
        throw new Error("Order cannot be cancelled");
      }
      const result = await client.query(
        `UPDATE web_orders
         SET status = 'CANCELLED', cancellation_reason = $1,
             cancelled_at = NOW(), cancelled_by = $2, updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [reason, authenticatedCustomerId, orderId],
      );
      await client.query(
        `UPDATE stock_reservations SET status = 'CANCELLED', updated_at = NOW()
         WHERE status = 'ACTIVE' AND (order_id = $1 OR cart_id = $2)`,
        [orderId, order.cart_id],
      );
      await client.query(
        `INSERT INTO order_events
          (order_id, event_type, from_status, to_status, reason, metadata, created_by)
         VALUES ($1, 'CANCELLED', $2, 'CANCELLED', $3, '{}'::jsonb, $4)`,
        [orderId, order.status, reason, authenticatedCustomerId],
      );
      await client.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
