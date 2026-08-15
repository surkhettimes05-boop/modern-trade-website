import { query } from "../database/connection.js";

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

    const taxAmount = subtotal * 0.13; // 13% VAT
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
      ) VALUES ($1, $2, $3, NOW(), 'PENDING', $4, $5, $6, $7, $8, $9, 'PENDING', $10,
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
          item.line_total * 0.13,
          item.line_total * 1.13,
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
    limit?: number;
    offset?: number;
  }): Promise<WebOrder[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.customer_id) {
      conditions.push(`customer_id = $${paramIndex}`);
      params.push(filters.customer_id);
      paramIndex++;
    }

    if (filters.store_id) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(filters.store_id);
      paramIndex++;
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.payment_status) {
      conditions.push(`payment_status = $${paramIndex}`);
      params.push(filters.payment_status);
      paramIndex++;
    }

    if (filters.date_from) {
      conditions.push(`order_date >= $${paramIndex}`);
      params.push(filters.date_from);
      paramIndex++;
    }

    if (filters.date_to) {
      conditions.push(`order_date <= $${paramIndex}`);
      params.push(filters.date_to);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";
    const offsetClause = filters.offset ? `OFFSET ${filters.offset}` : "";

    const result = await query(
      `SELECT * FROM web_orders ${whereClause} ORDER BY order_date DESC ${limitClause} ${offsetClause}`,
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
  ): Promise<WebOrder> {
    const result = await query(
      `UPDATE web_orders 
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, orderId],
    );

    return result.rows[0];
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(
    orderId: string,
    paymentStatus: string,
    paymentIntentId?: string,
  ): Promise<WebOrder> {
    const fields: string[] = [`payment_status = $1`];
    const values: any[] = [paymentStatus];
    let paramIndex = 2;

    if (paymentIntentId) {
      fields.push(`payment_intent_id = $${paramIndex}`);
      values.push(paymentIntentId);
      paramIndex++;
    }

    fields.push(`updated_at = NOW()`);
    values.push(orderId);

    const result = await query(
      `UPDATE web_orders SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    return result.rows[0];
  }

  /**
   * Cancel web order
   */
  async cancelWebOrder(orderId: string, reason?: string): Promise<WebOrder> {
    const result = await query(
      `UPDATE web_orders 
       SET status = 'CANCELLED', 
           notes = COALESCE($1, notes) || ' - Cancelled',
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [reason, orderId],
    );

    return result.rows[0];
  }

  /**
   * Generate order number
   */
  private async generateOrderNumber(): Promise<string> {
    const result = await query("SELECT generate_web_order_number() as number");
    return result.rows[0].number;
  }
}
