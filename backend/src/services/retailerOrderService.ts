import { query } from "../database/connection.js";

interface RetailerOrder {
  id: string;
  order_number: string;
  retailer_id: string;
  sales_rep_id: string;
  store_id: string | null;
  warehouse_id: string | null;
  order_date: Date;
  status: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  currency: string;
  delivery_type: string | null;
  requested_delivery_date: Date | null;
  requested_delivery_time_slot: string | null;
  delivery_address: string | null;
  delivery_contact_name: string | null;
  delivery_contact_phone: string | null;
  internal_notes: string | null;
  customer_notes: string | null;
  idempotency_key: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

interface RetailerOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  sku: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  line_total: number;
  tax_amount: number;
  line_total_with_tax: number;
  batch_id: string | null;
  notes: string | null;
  metadata: any;
  created_at: Date;
}

interface Retailer {
  id: string;
  retailer_code: string;
  retailer_name: string;
  business_name: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  province: string | null;
  assigned_sales_rep_id: string | null;
  territory_id: string | null;
  credit_limit: number;
  current_balance: number;
  payment_terms: string | null;
  status: string;
  approval_status: string;
  approved_by: string | null;
  approved_at: Date | null;
  tax_id: string | null;
  pan_number: string | null;
  notes: string | null;
  metadata: any;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
}

export class RetailerOrderService {
  private readonly validStatusTransitions: Record<string, string[]> = {
    DRAFT: ["SUBMITTED", "CANCELLED"],
    SUBMITTED: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["PROCESSING", "CANCELLED"],
    PROCESSING: ["READY_FOR_PICKUP", "CANCELLED"],
    READY_FOR_PICKUP: ["SHIPPED", "CANCELLED"],
    SHIPPED: ["DELIVERED", "CANCELLED"],
    DELIVERED: [],
    CANCELLED: [],
  };

  /**
   * Get assigned retailers for a sales representative
   */
  async getAssignedRetailers(salesRepId: string): Promise<Retailer[]> {
    const result = await query(
      `SELECT * FROM retailers
       WHERE assigned_sales_rep_id = $1
       AND status = 'ACTIVE'
       AND approval_status = 'APPROVED'
       ORDER BY retailer_name`,
      [salesRepId],
    );
    return result.rows;
  }

  /**
   * Get retailer by ID
   */
  async getRetailerById(retailerId: string): Promise<Retailer | null> {
    const result = await query(
      `SELECT * FROM retailers WHERE id = $1 LIMIT 1`,
      [retailerId],
    );
    return result.rows[0] || null;
  }

  /**
   * Create retailer order
   */
  async createRetailerOrder(orderData: {
    retailer_id: string;
    sales_rep_id: string;
    store_id?: string;
    warehouse_id?: string;
    items: Array<{
      product_id: string;
      quantity: number;
      unit_price: number;
      discount_amount?: number;
      notes?: string;
    }>;
    delivery_type?: string;
    requested_delivery_date?: Date;
    requested_delivery_time_slot?: string;
    delivery_address?: string;
    delivery_contact_name?: string;
    delivery_contact_phone?: string;
    internal_notes?: string;
    customer_notes?: string;
    idempotency_key?: string;
    created_by?: string;
  }): Promise<RetailerOrder> {
    const client = await (await import("../database/connection.js")).getPool().connect();

    try {
      await client.query("BEGIN");

      // Validate retailer exists and is assigned to sales rep
      const retailerResult = await client.query(
        `SELECT * FROM retailers
         WHERE id = $1 AND assigned_sales_rep_id = $2
         AND status = 'ACTIVE' AND approval_status = 'APPROVED'
         LIMIT 1`,
        [orderData.retailer_id, orderData.sales_rep_id],
      );

      if (retailerResult.rows.length === 0) {
        throw new Error("Retailer not found or not assigned to sales representative");
      }

      // Calculate totals
      let subtotal = 0;
      const itemsWithTotals = orderData.items.map((item) => {
        const lineTotal = item.quantity * item.unit_price - (item.discount_amount || 0);
        subtotal += lineTotal;
        return {
          ...item,
          line_total: lineTotal,
          tax_amount: 0, // Tax calculation can be added later
          line_total_with_tax: lineTotal,
        };
      });

      const taxAmount = 0; // Tax calculation can be added later
      const discountAmount = orderData.items.reduce((sum, item) => sum + (item.discount_amount || 0), 0);
      const totalAmount = subtotal + taxAmount;

      // Generate order number
      const orderNumberResult = await client.query(
        `SELECT generate_retailer_order_number() as order_number`,
      );
      const orderNumber = orderNumberResult.rows[0].order_number;

      // Insert order
      const orderResult = await client.query(
        `INSERT INTO retailer_orders
         (order_number, retailer_id, sales_rep_id, store_id, warehouse_id,
          status, subtotal, tax_amount, discount_amount, total_amount, currency,
          delivery_type, requested_delivery_date, requested_delivery_time_slot,
          delivery_address, delivery_contact_name, delivery_contact_phone,
          internal_notes, customer_notes, idempotency_key, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
         RETURNING *`,
        [
          orderNumber,
          orderData.retailer_id,
          orderData.sales_rep_id,
          orderData.store_id || null,
          orderData.warehouse_id || null,
          "DRAFT",
          subtotal,
          taxAmount,
          discountAmount,
          totalAmount,
          "NPR",
          orderData.delivery_type || null,
          orderData.requested_delivery_date || null,
          orderData.requested_delivery_time_slot || null,
          orderData.delivery_address || null,
          orderData.delivery_contact_name || null,
          orderData.delivery_contact_phone || null,
          orderData.internal_notes || null,
          orderData.customer_notes || null,
          orderData.idempotency_key || null,
          orderData.created_by || null,
        ],
      );

      const order = orderResult.rows[0];

      // Insert order items
      for (const item of itemsWithTotals) {
        // Get product details
        const productResult = await client.query(
          `SELECT sku, name_en FROM products WHERE id = $1 LIMIT 1`,
          [item.product_id],
        );

        if (productResult.rows.length === 0) {
          throw new Error(`Product not found: ${item.product_id}`);
        }

        const product = productResult.rows[0];

        await client.query(
          `INSERT INTO retailer_order_items
           (order_id, product_id, sku, product_name, quantity, unit_price,
            discount_amount, line_total, tax_amount, line_total_with_tax, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            order.id,
            item.product_id,
            product.sku,
            product.name_en,
            item.quantity,
            item.unit_price,
            item.discount_amount || 0,
            item.line_total,
            item.tax_amount,
            item.line_total_with_tax,
            item.notes || null,
          ],
        );
      }

      await client.query("COMMIT");
      return order;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get retailer order by ID
   */
  async getRetailerOrderById(orderId: string): Promise<RetailerOrder | null> {
    const result = await query(
      `SELECT * FROM retailer_orders WHERE id = $1 LIMIT 1`,
      [orderId],
    );
    return result.rows[0] || null;
  }

  /**
   * Get retailer order by order number
   */
  async getRetailerOrderByNumber(orderNumber: string): Promise<RetailerOrder | null> {
    const result = await query(
      `SELECT * FROM retailer_orders WHERE order_number = $1 LIMIT 1`,
      [orderNumber],
    );
    return result.rows[0] || null;
  }

  /**
   * Get retailer order items
   */
  async getRetailerOrderItems(orderId: string): Promise<RetailerOrderItem[]> {
    const result = await query(
      `SELECT * FROM retailer_order_items WHERE order_id = $1 ORDER BY id`,
      [orderId],
    );
    return result.rows;
  }

  /**
   * Get orders for a sales representative
   */
  async getSalesRepOrders(
    salesRepId: string,
    filters?: {
      status?: string;
      retailer_id?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<RetailerOrder[]> {
    const conditions: string[] = ["sales_rep_id = $1"];
    const params: any[] = [salesRepId];
    let paramIndex = 2;

    if (filters?.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters?.retailer_id) {
      conditions.push(`retailer_id = $${paramIndex++}`);
      params.push(filters.retailer_id);
    }

    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const queryText = `
      SELECT * FROM retailer_orders
      WHERE ${conditions.join(" AND ")}
      ORDER BY order_date DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(limit, offset);

    const result = await query(queryText, params);
    return result.rows;
  }

  /**
   * Update retailer order status
   */
  async updateRetailerOrderStatus(
    orderId: string,
    newStatus: string,
    updatedBy: string,
  ): Promise<RetailerOrder> {
    // Get current order
    const currentOrder = await this.getRetailerOrderById(orderId);
    if (!currentOrder) {
      throw new Error("Order not found");
    }

    // Validate status transition
    const validTransitions = this.validStatusTransitions[currentOrder.status] || [];
    if (!validTransitions.includes(newStatus)) {
      throw new Error(
        `Invalid status transition from ${currentOrder.status} to ${newStatus}`,
      );
    }

    const result = await query(
      `UPDATE retailer_orders
       SET status = $1, updated_by = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [newStatus, updatedBy, orderId],
    );

    return result.rows[0];
  }

  /**
   * Get all retailer orders (for warehouse/operations)
   */
  async getAllRetailerOrders(filters?: {
    status?: string;
    retailer_id?: string;
    warehouse_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<RetailerOrder[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters?.retailer_id) {
      conditions.push(`retailer_id = $${paramIndex++}`);
      params.push(filters.retailer_id);
    }

    if (filters?.warehouse_id) {
      conditions.push(`warehouse_id = $${paramIndex++}`);
      params.push(filters.warehouse_id);
    }

    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const queryText = `
      SELECT * FROM retailer_orders
      ${whereClause}
      ORDER BY order_date DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(limit, offset);

    const result = await query(queryText, params);
    return result.rows;
  }
}

export const retailerOrderService = new RetailerOrderService();
