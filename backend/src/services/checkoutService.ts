import { randomUUID } from "node:crypto";
import { getPool } from "../database/connection.js";

export class CheckoutService {
  async createCodOrder(input: {
    customerId: string;
    storeId: string;
    cartId: string;
    idempotencyKey: string;
    deliveryType: "DELIVERY" | "PICKUP";
    shippingName: string;
    shippingPhone: string;
    shippingAddress: string;
    shippingCity: string;
    shippingState: string;
    shippingPostalCode: string;
    shippingCountry: string;
    notes?: string;
  }) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query(
        "SELECT * FROM web_orders WHERE idempotency_key = $1 AND customer_id = $2",
        [input.idempotencyKey, input.customerId],
      );
      if (existing.rows[0]) {
        await client.query("COMMIT");
        return existing.rows[0];
      }
      const cart = await client.query(
        "SELECT * FROM shopping_carts WHERE id = $1 AND customer_id = $2 AND store_id = $3 AND status = 'ACTIVE' FOR UPDATE",
        [input.cartId, input.customerId, input.storeId],
      );
      if (!cart.rows[0])
        throw new Error("Cart is not available for this customer and store");
      const items = await client.query(
        `SELECT ci.*, p.name_en, COALESCE(pp.price, 0) AS authoritative_price, bi.available_quantity
        FROM cart_items ci JOIN products p ON p.id = ci.product_id AND p.status = 'PUBLISHED'
        LEFT JOIN LATERAL (SELECT price FROM product_prices WHERE product_id = p.id AND store_id = $2 AND active = TRUE ORDER BY valid_from DESC LIMIT 1) pp ON TRUE
        LEFT JOIN LATERAL (SELECT COALESCE(SUM(quantity), 0)::int AS available_quantity FROM batch_inventory WHERE product_id = p.id AND store_id = $2) bi ON TRUE
        WHERE ci.cart_id = $1 FOR UPDATE`,
        [input.cartId, input.storeId],
      );
      if (!items.rows.length) throw new Error("Cart is empty");
      let subtotal = 0;
      for (const item of items.rows) {
        await client.query(
          `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))`,
          [item.product_id, input.storeId],
        );
        const stock = await client.query(
          `SELECT COALESCE(SUM(bi.quantity), 0)::int AS stock, COALESCE((SELECT SUM(sr.quantity) FROM stock_reservations sr WHERE sr.product_id = $1 AND sr.store_id = $2 AND sr.status = 'ACTIVE' AND sr.expires_at > NOW()), 0)::int AS reserved FROM batch_inventory bi WHERE bi.product_id = $1 AND bi.store_id = $2`,
          [item.product_id, input.storeId],
        );
        if (Number(item.authoritative_price) <= 0)
          throw new Error(`Price unavailable for ${item.name_en}`);
        if (
          Number(stock.rows[0].stock) - Number(stock.rows[0].reserved) <
          Number(item.quantity)
        )
          throw new Error(`Insufficient stock for ${item.name_en}`);
        subtotal += Number(item.authoritative_price) * Number(item.quantity);
      }
      const shipping = input.deliveryType === "DELIVERY" ? 100 : 0;
      const tax = subtotal * 0.13;
      const total = subtotal + tax + shipping;
      const order = await client.query(
        `INSERT INTO web_orders (order_number, customer_id, store_id, cart_id, idempotency_key, status, subtotal, tax_amount, shipping_amount, discount_amount, total_amount, currency, payment_method, payment_status, shipping_name, shipping_phone, shipping_address, shipping_city, shipping_state, shipping_postal_code, shipping_country, delivery_type, notes)
        VALUES ('WO-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || '-' || SUBSTRING($1, 1, 8), $2, $3, $4, $1, 'PENDING_PAYMENT', $5, $6, $7, 0, $8, 'NPR', 'COD', 'PENDING', $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`,
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
          input.shippingAddress,
          input.shippingCity,
          input.shippingState,
          input.shippingPostalCode,
          input.shippingCountry,
          input.deliveryType,
          input.notes || null,
        ],
      );
      for (const item of items.rows) {
        await client.query(
          `INSERT INTO web_order_items (order_id, product_id, product_name, quantity, unit_price, discount_amount, line_total, tax_amount, line_total_with_tax) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8)`,
          [
            order.rows[0].id,
            item.product_id,
            item.name_en,
            item.quantity,
            item.authoritative_price,
            Number(item.authoritative_price) * Number(item.quantity),
            Number(item.authoritative_price) * Number(item.quantity) * 0.13,
            Number(item.authoritative_price) * Number(item.quantity) * 1.13,
          ],
        );
        await client.query(
          `INSERT INTO stock_reservations (reservation_id, order_id, product_id, store_id, quantity, reserved_at, expires_at, status) VALUES ($1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '30 minutes', 'ACTIVE')`,
          [
            `RES-${randomUUID()}`,
            order.rows[0].id,
            item.product_id,
            input.storeId,
            item.quantity,
          ],
        );
      }
      await client.query(
        `UPDATE shopping_carts SET status = 'CONVERTED', updated_at = NOW() WHERE id = $1`,
        [input.cartId],
      );
      await client.query(
        `INSERT INTO order_events (order_id, event_type, from_status, to_status, reason, metadata, created_by) VALUES ($1, 'CREATED', NULL, 'PENDING_PAYMENT', 'COD checkout submitted', $2, $3)`,
        [
          order.rows[0].id,
          JSON.stringify({ delivery_type: input.deliveryType }),
          input.customerId,
        ],
      );
      await client.query("COMMIT");
      return order.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
