import { query } from "../database/connection.js";
import { MARKET } from "../config/market.js";

interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  store_id: string;
  warehouse_id: string;
  order_date: Date;
  expected_delivery_date: Date;
  actual_delivery_date: Date;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  shipping_amount: number;
  total_amount: number;
  currency: string;
  status: string;
  approval_status: string;
  approved_by: string;
  approved_at: Date;
  reference_number: string;
  notes: string;
  idempotency_key: string;
  metadata: any;
  created_at: Date;
  updated_at: Date;
  created_by: string;
}

interface PurchaseOrderItem {
  id: string;
  po_id: string;
  product_id: string;
  supplier_sku: string;
  product_name: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_price: number;
  line_total: number;
  tax_amount: number;
  discount_amount: number;
  line_total_with_tax: number;
  batch_id: string;
  expiry_date: Date;
  status: string;
  notes: string;
  metadata: any;
}

export class PurchaseOrderService {
  /**
   * Create purchase order
   */
  async createPurchaseOrder(poData: {
    supplier_id: string;
    store_id?: string;
    warehouse_id?: string;
    expected_delivery_date?: Date;
    items: Array<{
      product_id: string;
      supplier_sku?: string;
      product_name: string;
      quantity_ordered: number;
      unit_price: number;
      tax_amount?: number;
      discount_amount?: number;
      batch_id?: string;
      expiry_date?: Date;
      notes?: string;
    }>;
    tax_amount?: number;
    discount_amount?: number;
    shipping_amount?: number;
    currency?: string;
    reference_number?: string;
    notes?: string;
    idempotency_key?: string;
    metadata?: any;
    created_by: string;
  }): Promise<PurchaseOrder> {
    // Check idempotency
    if (poData.idempotency_key) {
      const existing = await query(
        "SELECT * FROM purchase_orders WHERE idempotency_key = $1",
        [poData.idempotency_key],
      );
      if (existing.rows.length > 0) {
        return existing.rows[0];
      }
    }

    const poNumber = await this.generatePONumber();

    // Calculate totals
    let subtotal = 0;
    poData.items.forEach((item) => {
      subtotal += item.quantity_ordered * item.unit_price;
    });

    const taxAmount = poData.tax_amount || 0;
    const discountAmount = poData.discount_amount || 0;
    const shippingAmount = poData.shipping_amount || 0;
    const totalAmount = subtotal + taxAmount - discountAmount + shippingAmount;

    const result = await query(
      `INSERT INTO purchase_orders (
        po_number, supplier_id, store_id, warehouse_id, expected_delivery_date,
        subtotal, tax_amount, discount_amount, shipping_amount, total_amount,
        currency, reference_number, notes, idempotency_key, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        poNumber,
        poData.supplier_id,
        poData.store_id || null,
        poData.warehouse_id || null,
        poData.expected_delivery_date || null,
        subtotal,
        taxAmount,
        discountAmount,
        shippingAmount,
        totalAmount,
        poData.currency || MARKET.currencyCode,
        poData.reference_number || null,
        poData.notes || null,
        poData.idempotency_key || null,
        JSON.stringify(poData.metadata || {}),
        poData.created_by,
      ],
    );

    const purchaseOrder = result.rows[0];

    // Add line items
    for (const item of poData.items) {
      const lineTotal = item.quantity_ordered * item.unit_price;
      const lineTotalWithTax =
        lineTotal + (item.tax_amount || 0) - (item.discount_amount || 0);

      await query(
        `INSERT INTO purchase_order_items (
          po_id, product_id, supplier_sku, product_name, quantity_ordered,
          unit_price, line_total, tax_amount, discount_amount, line_total_with_tax,
          batch_id, expiry_date, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          purchaseOrder.id,
          item.product_id,
          item.supplier_sku || null,
          item.product_name,
          item.quantity_ordered,
          item.unit_price,
          lineTotal,
          item.tax_amount || 0,
          item.discount_amount || 0,
          lineTotalWithTax,
          item.batch_id || null,
          item.expiry_date || null,
          item.notes || null,
        ],
      );
    }

    return purchaseOrder;
  }

  /**
   * Get purchase order by ID
   */
  async getPurchaseOrder(poId: string): Promise<PurchaseOrder | null> {
    const result = await query("SELECT * FROM purchase_orders WHERE id = $1", [
      poId,
    ]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get purchase order by number
   */
  async getPurchaseOrderByNumber(
    poNumber: string,
  ): Promise<PurchaseOrder | null> {
    const result = await query(
      "SELECT * FROM purchase_orders WHERE po_number = $1",
      [poNumber],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get purchase orders with filters
   */
  async getPurchaseOrders(filters: {
    supplier_id?: string;
    store_id?: string;
    warehouse_id?: string;
    status?: string;
    approval_status?: string;
    date_from?: Date;
    date_to?: Date;
    limit?: number;
    offset?: number;
  }): Promise<PurchaseOrder[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.supplier_id) {
      conditions.push(`supplier_id = $${paramIndex}`);
      params.push(filters.supplier_id);
      paramIndex++;
    }

    if (filters.store_id) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(filters.store_id);
      paramIndex++;
    }

    if (filters.warehouse_id) {
      conditions.push(`warehouse_id = $${paramIndex}`);
      params.push(filters.warehouse_id);
      paramIndex++;
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.approval_status) {
      conditions.push(`approval_status = $${paramIndex}`);
      params.push(filters.approval_status);
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
      `SELECT * FROM purchase_orders ${whereClause} ORDER BY order_date DESC ${limitClause} ${offsetClause}`,
      params,
    );

    return result.rows;
  }

  /**
   * Get purchase order items
   */
  async getPurchaseOrderItems(poId: string): Promise<PurchaseOrderItem[]> {
    const result = await query(
      "SELECT * FROM purchase_order_items WHERE po_id = $1 ORDER BY id",
      [poId],
    );
    return result.rows;
  }

  /**
   * Update purchase order
   */
  async updatePurchaseOrder(
    poId: string,
    updates: {
      expected_delivery_date?: Date;
      actual_delivery_date?: Date;
      tax_amount?: number;
      discount_amount?: number;
      shipping_amount?: number;
      reference_number?: string;
      notes?: string;
      metadata?: any;
    },
  ): Promise<PurchaseOrder> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.expected_delivery_date !== undefined) {
      fields.push(`expected_delivery_date = $${paramIndex}`);
      values.push(updates.expected_delivery_date);
      paramIndex++;
    }

    if (updates.actual_delivery_date !== undefined) {
      fields.push(`actual_delivery_date = $${paramIndex}`);
      values.push(updates.actual_delivery_date);
      paramIndex++;
    }

    if (updates.tax_amount !== undefined) {
      fields.push(`tax_amount = $${paramIndex}`);
      values.push(updates.tax_amount);
      paramIndex++;
    }

    if (updates.discount_amount !== undefined) {
      fields.push(`discount_amount = $${paramIndex}`);
      values.push(updates.discount_amount);
      paramIndex++;
    }

    if (updates.shipping_amount !== undefined) {
      fields.push(`shipping_amount = $${paramIndex}`);
      values.push(updates.shipping_amount);
      paramIndex++;
    }

    if (updates.reference_number !== undefined) {
      fields.push(`reference_number = $${paramIndex}`);
      values.push(updates.reference_number);
      paramIndex++;
    }

    if (updates.notes !== undefined) {
      fields.push(`notes = $${paramIndex}`);
      values.push(updates.notes);
      paramIndex++;
    }

    if (updates.metadata !== undefined) {
      fields.push(`metadata = $${paramIndex}`);
      values.push(JSON.stringify(updates.metadata));
      paramIndex++;
    }

    if (fields.length === 0) {
      throw new Error("No fields to update");
    }

    fields.push(`updated_at = NOW()`);
    values.push(poId);

    const result = await query(
      `UPDATE purchase_orders SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    return result.rows[0];
  }

  /**
   * Approve purchase order
   */
  async approvePurchaseOrder(
    poId: string,
    approvedBy: string,
  ): Promise<PurchaseOrder> {
    const result = await query(
      `UPDATE purchase_orders 
       SET approval_status = 'APPROVED', 
           approved_by = $1, 
           approved_at = NOW(),
           status = 'SENT',
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [approvedBy, poId],
    );

    return result.rows[0];
  }

  /**
   * Reject purchase order
   */
  async rejectPurchaseOrder(
    poId: string,
    approvedBy: string,
  ): Promise<PurchaseOrder> {
    const result = await query(
      `UPDATE purchase_orders 
       SET approval_status = 'REJECTED', 
           approved_by = $1, 
           approved_at = NOW(),
           status = 'CANCELLED',
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [approvedBy, poId],
    );

    return result.rows[0];
  }

  /**
   * Send purchase order to supplier
   */
  async sendPurchaseOrder(poId: string): Promise<PurchaseOrder> {
    const result = await query(
      `UPDATE purchase_orders 
       SET status = 'SENT', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [poId],
    );

    return result.rows[0];
  }

  /**
   * Acknowledge purchase order
   */
  async acknowledgePurchaseOrder(poId: string): Promise<PurchaseOrder> {
    const result = await query(
      `UPDATE purchase_orders 
       SET status = 'ACKNOWLEDGED', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [poId],
    );

    return result.rows[0];
  }

  /**
   * Cancel purchase order
   */
  async cancelPurchaseOrder(poId: string): Promise<PurchaseOrder> {
    const result = await query(
      `UPDATE purchase_orders 
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [poId],
    );

    return result.rows[0];
  }

  /**
   * Update item received quantity
   */
  async updateItemReceivedQuantity(
    itemId: string,
    quantityReceived: number,
  ): Promise<PurchaseOrderItem> {
    const result = await query(
      `UPDATE purchase_order_items 
       SET quantity_received = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [quantityReceived, itemId],
    );

    return result.rows[0];
  }

  /**
   * Update PO status based on receiving
   */
  async updatePOStatusAfterReceiving(poId: string): Promise<PurchaseOrder> {
    // Check if all items are fully received
    const itemsResult = await query(
      `SELECT 
        COUNT(*) as total_items,
        COUNT(*) FILTER (WHERE quantity_received >= quantity_ordered) as fully_received_items
      FROM purchase_order_items
      WHERE po_id = $1`,
      [poId],
    );

    const items = itemsResult.rows[0];
    let newStatus = "PARTIAL_RECEIVED";

    if (
      items.fully_received_items === items.total_items &&
      items.total_items > 0
    ) {
      newStatus = "RECEIVED";
    } else if (items.fully_received_items === 0) {
      newStatus = "SENT";
    }

    const result = await query(
      `UPDATE purchase_orders 
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [newStatus, poId],
    );

    return result.rows[0];
  }

  /**
   * Get purchase order summary
   */
  async getPurchaseOrderSummary(filters?: {
    supplier_id?: string;
    store_id?: string;
    warehouse_id?: string;
    date_from?: Date;
    date_to?: Date;
  }): Promise<any> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.supplier_id) {
      conditions.push(`supplier_id = $${paramIndex}`);
      params.push(filters.supplier_id);
      paramIndex++;
    }

    if (filters?.store_id) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(filters.store_id);
      paramIndex++;
    }

    if (filters?.warehouse_id) {
      conditions.push(`warehouse_id = $${paramIndex}`);
      params.push(filters.warehouse_id);
      paramIndex++;
    }

    if (filters?.date_from) {
      conditions.push(`order_date >= $${paramIndex}`);
      params.push(filters.date_from);
      paramIndex++;
    }

    if (filters?.date_to) {
      conditions.push(`order_date <= $${paramIndex}`);
      params.push(filters.date_to);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT 
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status = 'DRAFT') as draft_orders,
        COUNT(*) FILTER (WHERE status = 'SENT') as sent_orders,
        COUNT(*) FILTER (WHERE status = 'ACKNOWLEDGED') as acknowledged_orders,
        COUNT(*) FILTER (WHERE status = 'PARTIAL_RECEIVED') as partial_received,
        COUNT(*) FILTER (WHERE status = 'RECEIVED') as received_orders,
        COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled_orders,
        SUM(total_amount) as total_amount,
        SUM(total_amount) FILTER (WHERE status = 'RECEIVED') as received_amount
      FROM purchase_orders ${whereClause}`,
      params,
    );

    return result.rows[0];
  }

  /**
   * Generate PO number
   */
  private async generatePONumber(): Promise<string> {
    const result = await query("SELECT generate_po_number() as number");
    return result.rows[0].number;
  }
}
