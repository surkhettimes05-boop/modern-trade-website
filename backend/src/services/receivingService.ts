import { query } from "../database/connection.js";

interface Receiving {
  id: string;
  receiving_number: string;
  po_id: string;
  supplier_id: string;
  store_id: string;
  warehouse_id: string;
  receiving_date: Date;
  received_by: string;
  status: string;
  has_discrepancies: boolean;
  discrepancy_notes: string;
  notes: string;
  metadata: any;
  created_at: Date;
  updated_at: Date;
}

interface ReceivingItem {
  id: string;
  receiving_id: string;
  po_item_id: string;
  product_id: string;
  quantity_ordered: number;
  quantity_received: number;
  quantity_accepted: number;
  quantity_rejected: number;
  quality_check_status: string;
  quality_check_notes: string;
  quality_checked_by: string;
  quality_checked_at: Date;
  batch_id: string;
  expiry_date: Date;
  manufacturing_date: Date;
  unit_price: number;
  line_total: number;
  discrepancy_type: string;
  discrepancy_quantity: number;
  discrepancy_notes: string;
  status: string;
  notes: string;
  metadata: any;
  created_at: Date;
  updated_at: Date;
}

export class ReceivingService {
  /**
   * Create receiving record
   */
  async createReceiving(receivingData: {
    po_id?: string;
    supplier_id: string;
    store_id?: string;
    warehouse_id?: string;
    received_by: string;
    notes?: string;
    metadata?: any;
  }): Promise<Receiving> {
    const receivingNumber = await this.generateReceivingNumber();

    const result = await query(
      `INSERT INTO receiving (
        receiving_number, po_id, supplier_id, store_id, warehouse_id,
        received_by, notes, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        receivingNumber,
        receivingData.po_id || null,
        receivingData.supplier_id,
        receivingData.store_id || null,
        receivingData.warehouse_id || null,
        receivingData.received_by,
        receivingData.notes || null,
        JSON.stringify(receivingData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Add receiving item
   */
  async addReceivingItem(itemData: {
    receiving_id: string;
    po_item_id?: string;
    product_id: string;
    quantity_ordered: number;
    quantity_received: number;
    quantity_accepted: number;
    quantity_rejected?: number;
    batch_id?: string;
    expiry_date?: Date;
    manufacturing_date?: Date;
    unit_price?: number;
    discrepancy_type?: string;
    discrepancy_quantity?: number;
    discrepancy_notes?: string;
    notes?: string;
    metadata?: any;
  }): Promise<ReceivingItem> {
    const lineTotal = (itemData.unit_price || 0) * itemData.quantity_accepted;

    const result = await query(
      `INSERT INTO receiving_items (
        receiving_id, po_item_id, product_id, quantity_ordered, quantity_received,
        quantity_accepted, quantity_rejected, batch_id, expiry_date, manufacturing_date,
        unit_price, line_total, discrepancy_type, discrepancy_quantity, discrepancy_notes,
        notes, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        itemData.receiving_id,
        itemData.po_item_id || null,
        itemData.product_id,
        itemData.quantity_ordered,
        itemData.quantity_received,
        itemData.quantity_accepted,
        itemData.quantity_rejected || 0,
        itemData.batch_id || null,
        itemData.expiry_date || null,
        itemData.manufacturing_date || null,
        itemData.unit_price || 0,
        lineTotal,
        itemData.discrepancy_type || null,
        itemData.discrepancy_quantity || 0,
        itemData.discrepancy_notes || null,
        itemData.notes || null,
        JSON.stringify(itemData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get receiving by ID
   */
  async getReceiving(receivingId: string): Promise<Receiving | null> {
    const result = await query("SELECT * FROM receiving WHERE id = $1", [
      receivingId,
    ]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get receiving by number
   */
  async getReceivingByNumber(
    receivingNumber: string,
  ): Promise<Receiving | null> {
    const result = await query(
      "SELECT * FROM receiving WHERE receiving_number = $1",
      [receivingNumber],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get receiving records with filters
   */
  async getReceivingList(filters: {
    po_id?: string;
    supplier_id?: string;
    store_id?: string;
    warehouse_id?: string;
    status?: string;
    date_from?: Date;
    date_to?: Date;
    limit?: number;
    offset?: number;
  }): Promise<Receiving[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.po_id) {
      conditions.push(`po_id = $${paramIndex}`);
      params.push(filters.po_id);
      paramIndex++;
    }

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

    if (filters.date_from) {
      conditions.push(`receiving_date >= $${paramIndex}`);
      params.push(filters.date_from);
      paramIndex++;
    }

    if (filters.date_to) {
      conditions.push(`receiving_date <= $${paramIndex}`);
      params.push(filters.date_to);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";
    const offsetClause = filters.offset ? `OFFSET ${filters.offset}` : "";

    const result = await query(
      `SELECT * FROM receiving ${whereClause} ORDER BY receiving_date DESC ${limitClause} ${offsetClause}`,
      params,
    );

    return result.rows;
  }

  /**
   * Get receiving items
   */
  async getReceivingItems(receivingId: string): Promise<ReceivingItem[]> {
    const result = await query(
      "SELECT * FROM receiving_items WHERE receiving_id = $1 ORDER BY id",
      [receivingId],
    );
    return result.rows;
  }

  /**
   * Complete receiving
   */
  async completeReceiving(receivingId: string): Promise<Receiving> {
    // Check for discrepancies
    const itemsResult = await query(
      `SELECT 
        COUNT(*) as total_items,
        SUM(CASE WHEN quantity_rejected > 0 THEN 1 ELSE 0 END) as rejected_items,
        SUM(CASE WHEN discrepancy_type IS NOT NULL THEN 1 ELSE 0 END) as discrepancy_items
      FROM receiving_items
      WHERE receiving_id = $1`,
      [receivingId],
    );

    const items = itemsResult.rows[0];
    const hasDiscrepancies =
      items.rejected_items > 0 || items.discrepancy_items > 0;

    const result = await query(
      `UPDATE receiving 
       SET status = 'COMPLETED',
           has_discrepancies = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [hasDiscrepancies, receivingId],
    );

    return result.rows[0];
  }

  /**
   * Cancel receiving
   */
  async cancelReceiving(receivingId: string): Promise<Receiving> {
    const result = await query(
      `UPDATE receiving 
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [receivingId],
    );

    return result.rows[0];
  }

  /**
   * Perform quality check
   */
  async performQualityCheck(
    itemId: string,
    checkData: {
      quality_check_status: "PASSED" | "FAILED";
      quality_check_notes?: string;
      quality_checked_by: string;
    },
  ): Promise<ReceivingItem> {
    const result = await query(
      `UPDATE receiving_items 
       SET quality_check_status = $1,
           quality_check_notes = $2,
           quality_checked_by = $3,
           quality_checked_at = NOW(),
           status = CASE WHEN $1 = 'PASSED' THEN 'ACCEPTED' ELSE 'REJECTED' END,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [
        checkData.quality_check_status,
        checkData.quality_check_notes || null,
        checkData.quality_checked_by,
        itemId,
      ],
    );

    return result.rows[0];
  }

  /**
   * Update receiving item
   */
  async updateReceivingItem(
    itemId: string,
    updates: {
      quantity_received?: number;
      quantity_accepted?: number;
      quantity_rejected?: number;
      batch_id?: string;
      expiry_date?: Date;
      manufacturing_date?: Date;
      unit_price?: number;
      discrepancy_type?: string;
      discrepancy_quantity?: number;
      discrepancy_notes?: string;
      notes?: string;
    },
  ): Promise<ReceivingItem> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.quantity_received !== undefined) {
      fields.push(`quantity_received = $${paramIndex}`);
      values.push(updates.quantity_received);
      paramIndex++;
    }

    if (updates.quantity_accepted !== undefined) {
      fields.push(`quantity_accepted = $${paramIndex}`);
      values.push(updates.quantity_accepted);
      paramIndex++;
    }

    if (updates.quantity_rejected !== undefined) {
      fields.push(`quantity_rejected = $${paramIndex}`);
      values.push(updates.quantity_rejected);
      paramIndex++;
    }

    if (updates.batch_id !== undefined) {
      fields.push(`batch_id = $${paramIndex}`);
      values.push(updates.batch_id);
      paramIndex++;
    }

    if (updates.expiry_date !== undefined) {
      fields.push(`expiry_date = $${paramIndex}`);
      values.push(updates.expiry_date);
      paramIndex++;
    }

    if (updates.manufacturing_date !== undefined) {
      fields.push(`manufacturing_date = $${paramIndex}`);
      values.push(updates.manufacturing_date);
      paramIndex++;
    }

    if (updates.unit_price !== undefined) {
      fields.push(`unit_price = $${paramIndex}`);
      values.push(updates.unit_price);
      paramIndex++;
    }

    if (updates.discrepancy_type !== undefined) {
      fields.push(`discrepancy_type = $${paramIndex}`);
      values.push(updates.discrepancy_type);
      paramIndex++;
    }

    if (updates.discrepancy_quantity !== undefined) {
      fields.push(`discrepancy_quantity = $${paramIndex}`);
      values.push(updates.discrepancy_quantity);
      paramIndex++;
    }

    if (updates.discrepancy_notes !== undefined) {
      fields.push(`discrepancy_notes = $${paramIndex}`);
      values.push(updates.discrepancy_notes);
      paramIndex++;
    }

    if (updates.notes !== undefined) {
      fields.push(`notes = $${paramIndex}`);
      values.push(updates.notes);
      paramIndex++;
    }

    if (fields.length === 0) {
      throw new Error("No fields to update");
    }

    // Recalculate line total if unit_price or quantity_accepted changed
    if (
      updates.unit_price !== undefined ||
      updates.quantity_accepted !== undefined
    ) {
      fields.push(`line_total = unit_price * quantity_accepted`);
    }

    fields.push(`updated_at = NOW()`);
    values.push(itemId);

    const result = await query(
      `UPDATE receiving_items SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    return result.rows[0];
  }

  /**
   * Get receiving summary
   */
  async getReceivingSummary(filters?: {
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
      conditions.push(`receiving_date >= $${paramIndex}`);
      params.push(filters.date_from);
      paramIndex++;
    }

    if (filters?.date_to) {
      conditions.push(`receiving_date <= $${paramIndex}`);
      params.push(filters.date_to);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT 
        COUNT(*) as total_receiving,
        COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') as in_progress,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
        COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled,
        COUNT(*) FILTER (WHERE has_discrepancies = TRUE) as with_discrepancies
      FROM receiving ${whereClause}`,
      params,
    );

    return result.rows[0];
  }

  /**
   * Generate receiving number
   */
  private async generateReceivingNumber(): Promise<string> {
    const result = await query("SELECT generate_receiving_number() as number");
    return result.rows[0].number;
  }
}
