import { randomUUID } from "node:crypto";
import { getPool } from "../database/connection.js";
import { MARKET } from "../config/market.js";
import { PasalhoClient, PasalhoError } from "./pasalhoClient.js";

type CheckoutInput = {
  customerId: string;
  storeId: string;
  cartId: string;
  idempotencyKey: string;
  deliveryType: "DELIVERY" | "PICKUP";
  shippingName: string;
  shippingPhone: string;
  shippingAddress?: string;
  shippingCity?: string;
  shippingState?: string;
  shippingPostalCode?: string;
  shippingCountry?: string;
  notes?: string;
  actorId?: string;
};

type FulfillmentStatus =
  | "PENDING"
  | "ACCEPTED"
  | "FAILED_RETRYABLE"
  | "FAILED_PERMANENT";

export class CheckoutService {
  private readonly pasalho = new PasalhoClient();

  async createCodOrder(input: CheckoutInput) {
    const pool = getPool();
    const client = await pool.connect();
    let order: any;

    try {
      await client.query("BEGIN");
      const existing = await client.query(
        "SELECT * FROM web_orders WHERE idempotency_key = $1 AND customer_id = $2",
        [input.idempotencyKey, input.customerId],
      );

      if (existing.rows[0]) {
        const prior = existing.rows[0];
        const conflicting = [
          [prior.store_id, input.storeId],
          [prior.cart_id, input.cartId],
          [prior.delivery_type, input.deliveryType],
          [prior.shipping_name, input.shippingName],
          [prior.shipping_phone, input.shippingPhone],
          [prior.shipping_address, input.shippingAddress || null],
          [prior.shipping_city, input.shippingCity || null],
          [prior.shipping_state, input.shippingState || null],
          [prior.shipping_postal_code, input.shippingPostalCode || null],
          [prior.shipping_country, input.shippingCountry || null],
        ].some(([stored, requested]) => String(stored ?? "") !== String(requested ?? ""));
        if (conflicting) {
          throw new Error("Idempotency key conflicts with the existing checkout");
        }
        order = prior;
        await client.query("COMMIT");
      } else {
        const cart = await client.query(
          "SELECT * FROM shopping_carts WHERE id = $1 AND customer_id = $2 AND store_id = $3 AND status = 'ACTIVE' FOR UPDATE",
          [input.cartId, input.customerId, input.storeId],
        );
        if (!cart.rows[0]) {
          throw new Error("Cart is not available for this customer and store");
        }

        let shippingAddress: string | null;
        let shippingCity: string | null;
        let shippingState: string | null;
        let shippingPostalCode: string | null;
        let shippingCountry: string;
        if (input.deliveryType === "PICKUP") {
          const store = await client.query(
            "SELECT address_en FROM stores WHERE id = $1 AND status = 'PUBLISHED'",
            [input.storeId],
          );
          if (!store.rows[0]) throw new Error("Pickup store is not available");
          shippingAddress = store.rows[0].address_en;
          shippingCity = null;
          shippingState = null;
          shippingPostalCode = null;
          shippingCountry = MARKET.countryCode;
        } else {
          if (
            !input.shippingAddress ||
            !input.shippingCity ||
            !input.shippingState ||
            !input.shippingPostalCode ||
            input.shippingCountry !== MARKET.countryCode
          ) {
            throw new Error("A complete Nepal delivery address is required");
          }
          shippingAddress = input.shippingAddress;
          shippingCity = input.shippingCity;
          shippingState = input.shippingState;
          shippingPostalCode = input.shippingPostalCode;
          shippingCountry = input.shippingCountry;
        }

        const items = await client.query(
          `SELECT ci.*, p.name_en, COALESCE(pp.price, 0) AS authoritative_price
             FROM cart_items ci
             JOIN products p ON p.id = ci.product_id AND p.status = 'PUBLISHED'
             LEFT JOIN LATERAL (
               SELECT price FROM product_prices
                WHERE product_id = p.id AND store_id = $2 AND active = TRUE
                ORDER BY valid_from DESC LIMIT 1
             ) pp ON TRUE
            WHERE ci.cart_id = $1 FOR UPDATE OF ci`,
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
               SELECT SUM(quantity)::int AS stock FROM batch_inventory
                WHERE product_id = requested.product_id AND store_id = $2
             ) inventory ON TRUE
             LEFT JOIN LATERAL (
               SELECT SUM(quantity)::int AS reserved FROM stock_reservations
                WHERE product_id = requested.product_id AND store_id = $2
                  AND status = 'ACTIVE' AND expires_at > NOW()
             ) reservations ON TRUE`,
          [productIds, input.storeId],
        );
        const stockByProduct = new Map(
          stockResult.rows.map((row) => [String(row.product_id), row]),
        );

        let subtotalPaisa = 0;
        const pricedItems = items.rows.map((item) => {
          const stock = stockByProduct.get(String(item.product_id));
          if (Number(item.authoritative_price) <= 0) {
            throw new Error(`Price unavailable for ${item.name_en}`);
          }
          if (
            Number(stock?.stock || 0) - Number(stock?.reserved || 0) <
            Number(item.quantity)
          ) {
            throw new Error(`Insufficient stock for ${item.name_en}`);
          }
          const linePaisa =
            Math.round(Number(item.authoritative_price) * 100) *
            Number(item.quantity);
          const taxPaisa = Math.round(linePaisa * MARKET.standardTaxRate);
          subtotalPaisa += linePaisa;
          return {
            ...item,
            lineTotal: linePaisa / 100,
            taxAmount: taxPaisa / 100,
            lineTotalWithTax: (linePaisa + taxPaisa) / 100,
          };
        });

        const shippingPaisa = input.deliveryType === "DELIVERY" ? 10_000 : 0;
        const taxPaisa = Math.round(subtotalPaisa * MARKET.standardTaxRate);
        const totalPaisa = subtotalPaisa + taxPaisa + shippingPaisa;
        const inserted = await client.query(
          `INSERT INTO web_orders
            (order_number, customer_id, store_id, cart_id, idempotency_key, status,
             subtotal, tax_amount, shipping_amount, discount_amount, total_amount,
             currency, payment_method, payment_status, shipping_name, shipping_phone,
             shipping_address, shipping_city, shipping_state, shipping_postal_code,
             shipping_country, delivery_type, notes)
           VALUES ('WO-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || '-' || SUBSTRING($1, 1, 8),
             $2, $3, $4, $1, 'PENDING_PAYMENT', $5, $6, $7, 0, $8, '${MARKET.currencyCode}',
             'COD', 'PENDING', $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`,
          [
            input.idempotencyKey,
            input.customerId,
            input.storeId,
            input.cartId,
            subtotalPaisa / 100,
            taxPaisa / 100,
            shippingPaisa / 100,
            totalPaisa / 100,
            input.shippingName,
            input.shippingPhone,
            shippingAddress,
            shippingCity,
            shippingState,
            shippingPostalCode,
            shippingCountry,
            input.deliveryType,
            input.notes || null,
          ],
        );
        order = inserted.rows[0];

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
            order.id,
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
            order.id,
            input.storeId,
            pricedItems.map(() => `RES-${randomUUID()}`),
            pricedItems.map((item) => item.product_id),
            pricedItems.map((item) => item.quantity),
          ],
        );
        await client.query(
          "UPDATE shopping_carts SET status = 'CONVERTED', updated_at = NOW() WHERE id = $1",
          [input.cartId],
        );
        await client.query(
          `INSERT INTO order_events
            (order_id, event_type, from_status, to_status, reason, metadata, created_by)
           VALUES ($1, 'CREATED', NULL, 'PENDING_PAYMENT', 'COD checkout submitted', $2, $3)`,
          [
            order.id,
            JSON.stringify({ delivery_type: input.deliveryType }),
            input.actorId || input.customerId,
          ],
        );
        await client.query("COMMIT");
      }
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
        if (existing.rows[0]) order = existing.rows[0];
      }
      if (!order) throw error;
    } finally {
      client.release();
    }

    return this.submitFulfillment(order, input);
  }

  private async markFulfillment(
    order: any,
    status: Exclude<FulfillmentStatus, "PENDING" | "ACCEPTED">,
    error: string,
  ) {
    const result = await getPool().query(
      `UPDATE web_orders
          SET fulfillment_status = $1,
              fulfillment_error = $2,
              fulfillment_attempted_at = NOW(),
              updated_at = NOW()
        WHERE id = $3
      RETURNING *`,
      [status, error, order.id],
    );
    if (status === "FAILED_PERMANENT") {
      // A permanent handoff failure cannot be retried safely. Release only the
      // active commerce reservation; CEO/PASALO reservations have their own
      // idempotent cancellation path.
      await getPool().query(
        `UPDATE stock_reservations SET status = 'CANCELLED', updated_at = NOW()
          WHERE status = 'ACTIVE' AND order_id = $1`,
        [order.id],
      );
    }
    return result.rows[0] ?? {
      ...order,
      fulfillment_status: status,
      fulfillment_error: error,
    };
  }

  private async submitFulfillment(
    order: any,
    input: Pick<CheckoutInput, "shippingName" | "shippingPhone" | "shippingAddress" | "shippingCity" | "shippingState" | "shippingPostalCode" | "shippingCountry" | "deliveryType">,
  ) {
    // Commerce stock_reservations protects the customer-facing read model only.
    // CEO's online-fulfillment reservation and ONLINE sale own physical store stock.
    if (!this.pasalho.isConfigured()) return order;
    if (["ACCEPTED", "FAILED_PERMANENT"].includes(order.fulfillment_status)) return order;
    if (order.status === "CANCELLED") return order;

    const pool = getPool();
    const storeResult = await pool.query(
      "SELECT pasalo_branch_id FROM stores WHERE id = $1 AND status = 'PUBLISHED'",
      [order.store_id],
    );
    const branchId = storeResult.rows[0]?.pasalo_branch_id;
    const itemResult = await pool.query(
      `SELECT woi.product_id, woi.quantity, p.pasalo_product_id
         FROM web_order_items woi
         JOIN products p ON p.id = woi.product_id
        WHERE woi.order_id = $1
        ORDER BY woi.created_at, woi.id`,
      [order.id],
    );
    const missingProductMapping = itemResult.rows.some(
      (item: { pasalo_product_id?: string }) => !item.pasalo_product_id,
    );
    if (!branchId || missingProductMapping || !itemResult.rows.length) {
      return this.markFulfillment(order, "FAILED_PERMANENT", "Store or product mapping is missing.");
    }

    try {
      const result = await this.pasalho.createOnlineSalesOrder({
        branchId: String(branchId),
        externalOrderId: String(order.id),
        idempotencyKey: `commerce-order:${order.id}`,
        customerName: input.shippingName,
        phone: input.shippingPhone,
        address: [input.shippingAddress, input.shippingCity, input.shippingState, input.shippingPostalCode, input.shippingCountry].filter(Boolean).join(", "),
        items: itemResult.rows.map((item: { pasalo_product_id: string; quantity: number }) => ({
          productId: String(item.pasalo_product_id),
          quantity: Number(item.quantity),
        })),
      });
      const updated = await pool.query(
        `UPDATE web_orders
            SET fulfillment_status = 'ACCEPTED',
                fulfillment_order_id = $1,
                fulfillment_order_number = $2,
                fulfillment_error = NULL,
                fulfillment_attempted_at = NOW(),
                status = CASE WHEN status IN ('PENDING', 'PENDING_PAYMENT') THEN 'CONFIRMED' ELSE status END,
                updated_at = NOW()
          WHERE id = $3
        RETURNING *`,
        [result.orderId, result.orderNumber || null, order.id],
      );
      return updated.rows[0] ?? { ...order, fulfillment_status: "ACCEPTED", fulfillment_order_id: result.orderId, fulfillment_order_number: result.orderNumber, status: order.status === "PENDING_PAYMENT" ? "CONFIRMED" : order.status };
    } catch (error) {
      const retryable = error instanceof PasalhoError && ["UNAVAILABLE", "TIMEOUT"].includes(error.code);
      const message = error instanceof Error ? error.message : "Fulfillment request failed.";
      return this.markFulfillment(order, retryable ? "FAILED_RETRYABLE" : "FAILED_PERMANENT", message);
    }
  }

  async retryFulfillment(orderId: string, customerId: string) {
    const result = await getPool().query(
      "SELECT * FROM web_orders WHERE id = $1 AND customer_id = $2",
      [orderId, customerId],
    );
    const order = result.rows[0];
    if (!order) throw new Error("Order not found");
    if (!["PENDING", "PENDING_PAYMENT", "CONFIRMED"].includes(order.status)) throw new Error("Order cannot be retried in its current state");
    return this.submitFulfillment(order, {
      shippingName: order.shipping_name,
      shippingPhone: order.shipping_phone,
      shippingAddress: order.shipping_address,
      shippingCity: order.shipping_city,
      shippingState: order.shipping_state,
      shippingPostalCode: order.shipping_postal_code,
      shippingCountry: order.shipping_country,
      deliveryType: order.delivery_type,
    });
  }

  async syncFulfillmentStatus(orderId: string, customerId: string) {
    const pool = getPool();
    const currentResult = await pool.query(
      "SELECT * FROM web_orders WHERE id = $1 AND customer_id = $2",
      [orderId, customerId],
    );
    const order = currentResult.rows[0];
    if (!order) return null;
    if (
      !this.pasalho.isConfigured() ||
      order.fulfillment_status !== "ACCEPTED" ||
      !order.fulfillment_order_id
    ) {
      return order;
    }

    let remote;
    try {
      remote = await this.pasalho.getSalesOrder(String(order.fulfillment_order_id));
    } catch {
      return order;
    }
    const mappedStatus: Record<string, string> = {
      CONFIRMED: "CONFIRMED",
      INVOICED: "CONFIRMED",
      PLACED: "CONFIRMED",
      PACKED: "PACKED",
      DELIVERED: "DELIVERED",
      CANCELLED: "CANCELLED",
    };
    const nextStatus = mappedStatus[remote.status];
    if (!nextStatus || nextStatus === order.status) return order;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE web_orders
            SET status = $1, updated_at = NOW(),
                cancellation_reason = CASE WHEN $1 = 'CANCELLED' THEN COALESCE(cancellation_reason, 'Cancelled in PASALO') ELSE cancellation_reason END,
                cancelled_at = CASE WHEN $1 = 'CANCELLED' THEN COALESCE(cancelled_at, NOW()) ELSE cancelled_at END
          WHERE id = $2 AND customer_id = $3
        RETURNING *`,
        [nextStatus, orderId, customerId],
      );
      if (nextStatus === "CANCELLED") {
        await client.query(
          `UPDATE stock_reservations SET status = 'CANCELLED', updated_at = NOW()
            WHERE status = 'ACTIVE' AND order_id = $1`,
          [orderId],
        );
      }
      await client.query(
        `INSERT INTO order_events (order_id, event_type, from_status, to_status, reason, metadata, created_by)
         VALUES ($1, 'STATUS_CHANGE', $2, $3, 'Synchronized from PASALO', $4, $5)`,
        [orderId, order.status, nextStatus, JSON.stringify({ pasalo_status: remote.status }), customerId],
      );
      await client.query("COMMIT");
      return updated.rows[0] ?? order;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async cancelCustomerOrder(orderId: string, authenticatedCustomerId: string, reason: string) {
    const pool = getPool();
    const preflight = await pool.query(
      "SELECT fulfillment_status, fulfillment_order_id FROM web_orders WHERE id = $1 AND customer_id = $2",
      [orderId, authenticatedCustomerId],
    );
    const existing = preflight.rows[0];
    if (existing?.fulfillment_status === "ACCEPTED" && existing.fulfillment_order_id) {
      if (!this.pasalho.isConfigured()) {
        throw new Error("Fulfillment cancellation is not configured");
      }
      await this.pasalho.cancelSalesOrder(String(existing.fulfillment_order_id));
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT * FROM web_orders WHERE id = $1 AND customer_id = $2 FOR UPDATE",
        [orderId, authenticatedCustomerId],
      );
      const order = current.rows[0];
      if (!order || !["PENDING", "PENDING_PAYMENT", "CONFIRMED"].includes(order.status)) throw new Error("Order cannot be cancelled");
      const result = await client.query(
        `UPDATE web_orders SET status = 'CANCELLED', cancellation_reason = $1, cancelled_at = NOW(), cancelled_by = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
        [reason, authenticatedCustomerId, orderId],
      );
      await client.query(
        `UPDATE stock_reservations SET status = 'CANCELLED', updated_at = NOW() WHERE status = 'ACTIVE' AND (order_id = $1 OR cart_id = $2)`,
        [orderId, order.cart_id],
      );
      await client.query(
        `INSERT INTO order_events (order_id, event_type, from_status, to_status, reason, metadata, created_by) VALUES ($1, 'CANCELLED', $2, 'CANCELLED', $3, '{}'::jsonb, $4)`,
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
