import { getPool, query } from "../database/connection.js";
import { MARKET } from "../config/market.js";

interface WebOrder {
  id: string;
  order_number: string;
  customer_id: string;
  store_id: string;
  order_date: Date;
  status: string;
  subtotal: number;
  tax_amount: number;
  shipping_amount: number;
  discount_amount: number;
  total_amount: number;
  currency: string;
  payment_method: string;
  payment_status: string;
  payment_intent_id: string;
  shipping_name: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_city: string;
  shipping_state: string;
  shipping_postal_code: string;
  shipping_country: string;
  delivery_type: string;
  delivery_date: Date;
  delivery_time_slot: string;
  notes: string;
  metadata: any;
  created_at: Date;
  updated_at: Date;
}

interface WebOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  line_total: number;
  tax_amount: number;
  line_total_with_tax: number;
  batch_id: string;
  metadata: any;
  created_at: Date;
}

export class WebOrderService {
  private readonly validStatusTransitions: Record<string, string[]> = {
    PENDING: ["CONFIRMED", "CANCELLED"],
    PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["PICKING", "CANCELLED"],
    PICKING: ["PACKED", "CANCELLED"],
    PACKED: ["OUT_FOR_DELIVERY", "CANCELLED"],
    OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
    // Returns and refunds are deliberately unavailable for the COD pilot.
    // Historical rows remain readable, but no service transition can create
    // new return/refund lifecycle state while that feature is deferred.
    DELIVERED: [],
    RETURN_REQUESTED: [],
    RETURNED: [],
    CANCELLED: [],
    REFUNDED: [],
  };

  private readonly validPaymentTransitions: Record<string, string[]> = {
    PENDING: ["PAID", "FAILED"],
    FAILED: ["PENDING", "PAID"],
    PAID: [],
    REFUNDED: [],
  };
  /**
   * Create web order from cart
   */
  async createWebOrder(orderData: {
    customer_id: string;
    store_id: string;
    cart_id: string;
    payment_method: string;
    payment_intent_id?: string;
    shipping_name: string;
    shipping_phone: string;
    shipping_address: string;
    shipping_city: string;
    shipping_state: string;
    shipping_postal_code: string;
    shipping_country: string;
    delivery_type: string;
    delivery_date?: Date;
    delivery_time_slot?: string;
    notes?: string;
    metadata?: any;
  }): Promise<WebOrder> {
    // Get cart items
    const cartItems = await query(
      `SELECT * FROM cart_items WHERE cart_id = $1`,
      [orderData.cart_id],
    );

    if (cartItems.rows.length === 0) {
      throw new Error("Cart is empty");
    }

    // Calculate totals
    let subtotal = 0;
    cartItems.rows.forEach((item) => {
      subtotal += parseFloat(item.line_total);
    });

    const taxAmount = subtotal * MARKET.standardTaxRate;
    const shippingAmount = orderData.delivery_type === "DELIVERY" ? 100 : 0;
    const discountAmount = 0;
    const totalAmount = subtotal + taxAmount + shippingAmount - discountAmount;

    const orderNumber = await this.generateOrderNumber();

    const result = await query(
      `INSERT INTO web_orders (
        order_number, customer_id, store_id, order_date, status,
        subtotal, tax_amount, shipping_amount, discount_amount, total_amount,
        payment_method, payment_status, payment_intent_id,
        shipping_name, shipping_phone, shipping_address, shipping_city,
        shipping_state, shipping_postal_code, shipping_country,
        delivery_type, delivery_date, delivery_time_slot, notes, metadata
      ) VALUES ($1, $2, $3, NOW(), 'PENDING_PAYMENT', $4, $5, $6, $7, $8, $9, 'PENDING', $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      RETURNING *`,
      [
        orderNumber,
        orderData.customer_id,
        orderData.store_id,
        subtotal,
        taxAmount,
        shippingAmount,
        discountAmount,
        totalAmount,
        orderData.payment_method,
        orderData.payment_intent_id || null,
        orderData.shipping_name,
        orderData.shipping_phone,
        orderData.shipping_address,
        orderData.shipping_city,
        orderData.shipping_state,
        orderData.shipping_postal_code,
        orderData.shipping_country,
        orderData.delivery_type,
        orderData.delivery_date || null,
        orderData.delivery_time_slot || null,
        orderData.notes || null,
        JSON.stringify(orderData.metadata || {}),
      ],
    );

    const order = result.rows[0];

    // Add order items
    for (const item of cartItems.rows) {
      const productResult = await query(
        "SELECT name FROM products WHERE id = $1",
        [item.product_id],
      );

      const productName = productResult.rows[0]?.name || "Unknown Product";

      await query(
        `INSERT INTO web_order_items (
          order_id, product_id, product_name, quantity, unit_price,
          discount_amount, line_total, tax_amount, line_total_with_tax, batch_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          order.id,
          item.product_id,
          productName,
          item.quantity,
          item.unit_price,
          item.discount_amount,
          item.line_total,
          item.line_total * MARKET.standardTaxRate,
          item.line_total * (1 + MARKET.standardTaxRate),
          null,
        ],
      );
    }

    // Mark cart as converted
    await query(
      `UPDATE shopping_carts SET status = 'CONVERTED' WHERE id = $1`,
      [orderData.cart_id],
    );

    return order;
  }

  /**
   * Get web order by ID
   */
  async getWebOrder(orderId: string): Promise<WebOrder | null> {
    const result = await query("SELECT * FROM web_orders WHERE id = $1", [
      orderId,
    ]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get web order by number
   */
  async getWebOrderByNumber(orderNumber: string): Promise<WebOrder | null> {
    const result = await query(
      "SELECT * FROM web_orders WHERE order_number = $1",
      [orderNumber],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get web orders with filters
   */
  async getWebOrders(filters: {
    customer_id?: string;
    store_id?: string;
    status?: string;
    payment_status?: string;
    date_from?: Date;
    date_to?: Date;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<WebOrder[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.customer_id) {
      conditions.push(`wo.customer_id = $${paramIndex}`);
      params.push(filters.customer_id);
      paramIndex++;
    }

    if (filters.store_id) {
      conditions.push(`wo.store_id = $${paramIndex}`);
      params.push(filters.store_id);
      paramIndex++;
    }

    if (filters.status) {
      conditions.push(`wo.status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.payment_status) {
      conditions.push(`wo.payment_status = $${paramIndex}`);
      params.push(filters.payment_status);
      paramIndex++;
    }

    if (filters.date_from) {
      conditions.push(`wo.order_date >= $${paramIndex}`);
      params.push(filters.date_from);
      paramIndex++;
    }

    if (filters.date_to) {
      conditions.push(`wo.order_date <= $${paramIndex}`);
      params.push(filters.date_to);
      paramIndex++;
    }

    if (filters.search) {
      conditions.push(
        `(wo.order_number ILIKE $${paramIndex} OR wo.shipping_name ILIKE $${paramIndex} OR c.preferred_name ILIKE $${paramIndex})`,
      );
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    params.push(limit, offset);
    const limitClause = `LIMIT $${paramIndex}`;
    const offsetClause = `OFFSET $${paramIndex + 1}`;

    const result = await query(
      `SELECT wo.*,
              c.preferred_name AS customer_name,
              s.name_en AS store_name,
              COALESCE(order_items.items, '[]'::json) AS items
         FROM web_orders wo
         LEFT JOIN customers c ON c.id = wo.customer_id
         LEFT JOIN stores s ON s.id = wo.store_id
         LEFT JOIN LATERAL (
           SELECT json_agg(
             json_build_object(
               'id', woi.id,
               'product_id', woi.product_id,
               'sku', p.sku,
               'product_name', woi.product_name,
               'quantity', woi.quantity,
               'unit_price', woi.unit_price,
               'line_total', woi.line_total
             )
             ORDER BY woi.id
           ) AS items
             FROM web_order_items woi
             LEFT JOIN products p ON p.id = woi.product_id
            WHERE woi.order_id = wo.id
         ) order_items ON TRUE
         ${whereClause}
         ORDER BY wo.order_date DESC
         ${limitClause} ${offsetClause}`,
      params,
    );

    return result.rows;
  }

  /**
   * Get web order items
   */
  async getWebOrderItems(orderId: string): Promise<WebOrderItem[]> {
    const result = await query(
      "SELECT * FROM web_order_items WHERE order_id = $1 ORDER BY id",
      [orderId],
    );
    return result.rows;
  }

  /**
   * Update web order status
   */
  async updateWebOrderStatus(
    orderId: string,
    status: string,
    actorId: string,
    reason?: string,
    codReceived = false,
  ): Promise<WebOrder> {
    const client = await getPool().connect();
    let stage = "begin";
    try {
      await client.query("BEGIN");
      stage = "lock-order";
      const current = await client.query(
        "SELECT * FROM web_orders WHERE id = $1 FOR UPDATE",
        [orderId],
      );
      const order = current.rows[0];
      if (!order) throw new Error("Order not found");
      if (!this.validStatusTransitions[order.status]?.includes(status)) {
        throw new Error(`Invalid transition from ${order.status} to ${status}`);
      }
      if (
        status === "DELIVERED" &&
        order.payment_method === "COD" &&
        !codReceived
      ) {
        throw new Error("COD cash receipt must be confirmed before delivery");
      }

      // Keep reserved stock unavailable while staff fulfils the order. When the
      // delivery is completed, deduct the physical batch inventory and consume
      // the reservations in the same database transaction.
      if (status === "DELIVERED") {
        const orderItems = await client.query(
          `SELECT product_id, quantity
             FROM web_order_items
            WHERE order_id = $1
            ORDER BY product_id`,
          [orderId],
        );
        if (!orderItems.rows.length) {
          throw new Error("Order has no items and cannot be delivered");
        }

        for (const item of orderItems.rows) {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `${item.product_id}:${order.store_id}`,
          ]);
          let remaining = Number(item.quantity);
          const batches = await client.query(
            `SELECT id, batch_id, quantity
               FROM batch_inventory
              WHERE store_id = $1
                AND product_id = $2
                AND quantity > 0
              ORDER BY expiry_date ASC, created_at ASC
              FOR UPDATE`,
            [order.store_id, item.product_id],
          );

          for (const batch of batches.rows) {
            if (remaining <= 0) break;
            const available = Number(batch.quantity);
            const deduct = Math.min(available, remaining);
            if (deduct <= 0) continue;
            await client.query(
              `UPDATE batch_inventory
                  SET quantity = quantity - $1,
                      updated_at = NOW()
                WHERE id = $2`,
              [deduct, batch.id],
            );
            await client.query(
              `INSERT INTO inventory_transactions
                (transaction_type, store_id, product_id, batch_id, quantity,
                 reference_id, reference_type, reason, performed_by)
               VALUES ('ISSUE', $1, $2, $3, $4, $5, 'COD_ORDER', 'COD delivery', $6)`,
              [
                order.store_id,
                item.product_id,
                batch.batch_id,
                -deduct,
                orderId,
                actorId,
              ],
            );
            remaining -= deduct;
          }

          if (remaining > 0) {
            throw new Error(
              `Insufficient inventory to complete delivery for product ${item.product_id}`,
            );
          }
        }
      }

      let result;
      stage = "update-order";
      if (status === "CANCELLED") {
        result = await client.query(
          `UPDATE web_orders
              SET status = $1,
                  cancellation_reason = $2,
                  cancelled_at = NOW(),
                  cancelled_by = $3,
                  updated_at = NOW()
            WHERE id = $4
            RETURNING *`,
          [status, reason || null, actorId, orderId],
        );
      } else if (status === "DELIVERED" && order.payment_method === "COD") {
        result = await client.query(
          `UPDATE web_orders
              SET status = $1,
                  payment_status = 'PAID',
                  cod_collected_at = NOW(),
                  cod_collected_by = $2,
                  updated_at = NOW()
            WHERE id = $3
            RETURNING *`,
          [status, actorId, orderId],
        );
      } else {
        result = await client.query(
          `UPDATE web_orders
              SET status = $1,
                  updated_at = NOW()
            WHERE id = $2
            RETURNING *`,
          [status, orderId],
        );
      }
      stage = "update-reservations";
      if (
        ["CONFIRMED", "PICKING", "PACKED", "OUT_FOR_DELIVERY"].includes(status)
      ) {
        await client.query(
          `UPDATE stock_reservations
              SET expires_at = GREATEST(expires_at, NOW() + INTERVAL '24 hours'),
                  updated_at = NOW()
            WHERE order_id = $1 AND status = 'ACTIVE'`,
          [orderId],
        );
      }
      if (status === "DELIVERED") {
        await client.query(
          `UPDATE stock_reservations
              SET status = 'CONSUMED', updated_at = NOW()
            WHERE order_id = $1 AND status = 'ACTIVE'`,
          [orderId],
        );
      }
      if (status === "CANCELLED") {
        await client.query(
          `UPDATE stock_reservations SET status = 'CANCELLED', updated_at = NOW()
           WHERE status = 'ACTIVE' AND (order_id = $1 OR cart_id = $2)`,
          [orderId, order.cart_id],
        );
      }
      stage = "insert-order-event";
      await client.query(
        `INSERT INTO order_events
          (order_id, event_type, from_status, to_status, reason, metadata, created_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [
          orderId,
          status === "CANCELLED" ? "CANCELLED" : "STATUS_CHANGE",
          order.status,
          status,
          reason || null,
          JSON.stringify({
            cod_received: status === "DELIVERED" ? codReceived : false,
          }),
          actorId,
        ],
      );
      stage = "commit";
      await client.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      const message =
        error instanceof Error ? error.message : "Unknown database error";
      if (
        message.startsWith("Invalid transition") ||
        message.includes("COD cash receipt") ||
        message.includes("Insufficient inventory") ||
        message.includes("Order has no items") ||
        message === "Order not found"
      ) {
        throw error;
      }
      throw new Error(`Web order transition failed at ${stage}: ${message}`, {
        cause: error,
      });
    } finally {
      client.release();
    }
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(
    orderId: string,
    paymentStatus: string,
    actorId: string,
    paymentIntentId?: string,
  ): Promise<WebOrder> {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT * FROM web_orders WHERE id = $1 FOR UPDATE",
        [orderId],
      );
      const order = current.rows[0];
      if (!order) throw new Error("Order not found");
      if (
        !this.validPaymentTransitions[order.payment_status]?.includes(
          paymentStatus,
        )
      ) {
        throw new Error(
          `Invalid payment transition from ${order.payment_status} to ${paymentStatus}`,
        );
      }
      const result = await client.query(
        `UPDATE web_orders SET payment_status = $1,
           payment_intent_id = COALESCE($2, payment_intent_id), updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [paymentStatus, paymentIntentId || null, orderId],
      );
      await client.query(
        `INSERT INTO order_events
          (order_id, event_type, from_status, to_status, reason, metadata, created_by)
         VALUES ($1, 'PAYMENT_STATUS_CHANGE', $2, $3, NULL, $4, $5)`,
        [
          orderId,
          order.payment_status,
          paymentStatus,
          JSON.stringify({ payment_intent_id: paymentIntentId || null }),
          actorId,
        ],
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

  /**
   * Cancel web order
   */
  async cancelWebOrder(
    orderId: string,
    actorId: string,
    reason?: string,
  ): Promise<WebOrder> {
    return this.updateWebOrderStatus(orderId, "CANCELLED", actorId, reason);
  }

  /**
   * Generate order number
   */
  private async generateOrderNumber(): Promise<string> {
    const result = await query("SELECT generate_web_order_number() as number");
    return result.rows[0].number;
  }
}
