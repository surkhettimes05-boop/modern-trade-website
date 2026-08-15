import { query } from "../database/connection.js";

interface InventoryTransfer {
  id: string;
  transfer_number: string;
  from_store_id: string;
  to_store_id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  status: string;
  requested_by: string;
  approved_by: string;
  approved_at: Date;
  shipped_by: string;
  shipped_at: Date;
  received_by: string;
  received_at: Date;
  notes: string;
  metadata: any;
  created_at: Date;
  updated_at: Date;
}

interface TransferItem {
  id: string;
  transfer_id: string;
  product_id: string;
  batch_id: string;
  expiry_date: Date;
  quantity_requested: number;
  quantity_shipped: number;
  quantity_received: number;
  unit_cost: number;
  status: string;
  notes: string;
  metadata: any;
  created_at: Date;
  updated_at: Date;
}

export class TransferService {
  /**
   * Create transfer request
   */
  async createTransferRequest(transferData: {
    from_store_id: string;
    to_store_id: string;
    from_warehouse_id?: string;
    to_warehouse_id?: string;
    items: Array<{
      product_id: string;
      batch_id?: string;
      expiry_date?: Date;
      quantity_requested: number;
      unit_cost?: number;
      notes?: string;
    }>;
    notes?: string;
    metadata?: any;
    requested_by: string;
  }): Promise<InventoryTransfer> {
    const transferNumber = await this.generateTransferNumber();

    const result = await query(
      `INSERT INTO inventory_transfers (
        transfer_number, from_store_id, to_store_id, from_warehouse_id, to_warehouse_id,
        status, notes, metadata, requested_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        transferNumber,
        transferData.from_store_id,
        transferData.to_store_id,
        transferData.from_warehouse_id || null,
        transferData.to_warehouse_id || null,
        "REQUESTED",
        transferData.notes || null,
        JSON.stringify(transferData.metadata || {}),
        transferData.requested_by,
      ],
    );

    const transfer = result.rows[0];

    // Add transfer items
    for (const item of transferData.items) {
      await query(
        `INSERT INTO inventory_transfer_items (
          transfer_id, product_id, batch_id, expiry_date, quantity_requested,
          unit_cost, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          transfer.id,
          item.product_id,
          item.batch_id || null,
          item.expiry_date || null,
          item.quantity_requested,
          item.unit_cost || 0,
          item.notes || null,
        ],
      );
    }

    return transfer;
  }

  /**
   * Get transfer by ID
   */
  async getTransfer(transferId: string): Promise<InventoryTransfer | null> {
    const result = await query(
      "SELECT * FROM inventory_transfers WHERE id = $1",
      [transferId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get transfer by number
   */
  async getTransferByNumber(
    transferNumber: string,
  ): Promise<InventoryTransfer | null> {
    const result = await query(
      "SELECT * FROM inventory_transfers WHERE transfer_number = $1",
      [transferNumber],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get transfers with filters
   */
  async getTransfers(filters: {
    from_store_id?: string;
    to_store_id?: string;
    from_warehouse_id?: string;
    to_warehouse_id?: string;
    status?: string;
    date_from?: Date;
    date_to?: Date;
    limit?: number;
    offset?: number;
  }): Promise<InventoryTransfer[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.from_store_id) {
      conditions.push(`from_store_id = $${paramIndex}`);
      params.push(filters.from_store_id);
      paramIndex++;
    }

    if (filters.to_store_id) {
      conditions.push(`to_store_id = $${paramIndex}`);
      params.push(filters.to_store_id);
      paramIndex++;
    }

    if (filters.from_warehouse_id) {
      conditions.push(`from_warehouse_id = $${paramIndex}`);
      params.push(filters.from_warehouse_id);
      paramIndex++;
    }

    if (filters.to_warehouse_id) {
      conditions.push(`to_warehouse_id = $${paramIndex}`);
      params.push(filters.to_warehouse_id);
      paramIndex++;
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.date_from) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(filters.date_from);
      paramIndex++;
    }

    if (filters.date_to) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(filters.date_to);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";
    const offsetClause = filters.offset ? `OFFSET ${filters.offset}` : "";

    const result = await query(
      `SELECT * FROM inventory_transfers ${whereClause} ORDER BY created_at DESC ${limitClause} ${offsetClause}`,
      params,
    );

    return result.rows;
  }

  /**
   * Get transfer items
   */
  async getTransferItems(transferId: string): Promise<TransferItem[]> {
    const result = await query(
      "SELECT * FROM inventory_transfer_items WHERE transfer_id = $1 ORDER BY id",
      [transferId],
    );
    return result.rows;
  }

  /**
   * Approve transfer
   */
  async approveTransfer(
    transferId: string,
    approvedBy: string,
  ): Promise<InventoryTransfer> {
    const result = await query(
      `UPDATE inventory_transfers 
       SET status = 'APPROVED',
           approved_by = $1,
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [approvedBy, transferId],
    );

    return result.rows[0];
  }

  /**
   * Reject transfer
   */
  async rejectTransfer(
    transferId: string,
    approvedBy: string,
    notes?: string,
  ): Promise<InventoryTransfer> {
    const result = await query(
      `UPDATE inventory_transfers 
       SET status = 'REJECTED',
           approved_by = $1,
           approved_at = NOW(),
           notes = COALESCE($2, notes),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [approvedBy, notes, transferId],
    );

    return result.rows[0];
  }

  /**
   * Ship transfer
   */
  async shipTransfer(
    transferId: string,
    shippedBy: string,
    items?: Array<{ item_id: string; quantity_shipped: number }>,
  ): Promise<InventoryTransfer> {
    // Update item quantities if provided
    if (items) {
      for (const item of items) {
        await query(
          `UPDATE inventory_transfer_items 
           SET quantity_shipped = $1,
               status = 'SHIPPED',
               updated_at = NOW()
           WHERE id = $2`,
          [item.quantity_shipped, item.item_id],
        );
      }
    } else {
      // Ship all requested quantities
      await query(
        `UPDATE inventory_transfer_items 
         SET quantity_shipped = quantity_requested,
             status = 'SHIPPED',
             updated_at = NOW()
         WHERE transfer_id = $1`,
        [transferId],
      );
    }

    const result = await query(
      `UPDATE inventory_transfers 
       SET status = 'IN_TRANSIT',
           shipped_by = $1,
           shipped_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [shippedBy, transferId],
    );

    return result.rows[0];
  }

  /**
   * Receive transfer
   */
  async receiveTransfer(
    transferId: string,
    receivedBy: string,
    items?: Array<{ item_id: string; quantity_received: number }>,
  ): Promise<InventoryTransfer> {
    // Update item quantities if provided
    if (items) {
      for (const item of items) {
        await query(
          `UPDATE inventory_transfer_items 
           SET quantity_received = $1,
               status = 'RECEIVED',
               updated_at = NOW()
           WHERE id = $2`,
          [item.quantity_received, item.item_id],
        );
      }
    } else {
      // Receive all shipped quantities
      await query(
        `UPDATE inventory_transfer_items 
         SET quantity_received = quantity_shipped,
             status = 'RECEIVED',
             updated_at = NOW()
         WHERE transfer_id = $1`,
        [transferId],
      );
    }

    const result = await query(
      `UPDATE inventory_transfers 
       SET status = 'COMPLETED',
           received_by = $1,
           received_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [receivedBy, transferId],
    );

    return result.rows[0];
  }

  /**
   * Cancel transfer
   */
  async cancelTransfer(transferId: string): Promise<InventoryTransfer> {
    const result = await query(
      `UPDATE inventory_transfers 
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [transferId],
    );

    return result.rows[0];
  }

  /**
   * Update transfer item
   */
  async updateTransferItem(
    itemId: string,
    updates: {
      batch_id?: string;
      expiry_date?: Date;
      quantity_requested?: number;
      quantity_shipped?: number;
      quantity_received?: number;
      unit_cost?: number;
      notes?: string;
    },
  ): Promise<TransferItem> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

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

    if (updates.quantity_requested !== undefined) {
      fields.push(`quantity_requested = $${paramIndex}`);
      values.push(updates.quantity_requested);
      paramIndex++;
    }

    if (updates.quantity_shipped !== undefined) {
      fields.push(`quantity_shipped = $${paramIndex}`);
      values.push(updates.quantity_shipped);
      paramIndex++;
    }

    if (updates.quantity_received !== undefined) {
      fields.push(`quantity_received = $${paramIndex}`);
      values.push(updates.quantity_received);
      paramIndex++;
    }

    if (updates.unit_cost !== undefined) {
      fields.push(`unit_cost = $${paramIndex}`);
      values.push(updates.unit_cost);
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

    fields.push(`updated_at = NOW()`);
    values.push(itemId);

    const result = await query(
      `UPDATE inventory_transfer_items SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    return result.rows[0];
  }

  /**
   * Get transfer summary
   */
  async getTransferSummary(filters?: {
    from_store_id?: string;
    to_store_id?: string;
    status?: string;
    date_from?: Date;
    date_to?: Date;
  }): Promise<any> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.from_store_id) {
      conditions.push(`from_store_id = $${paramIndex}`);
      params.push(filters.from_store_id);
      paramIndex++;
    }

    if (filters?.to_store_id) {
      conditions.push(`to_store_id = $${paramIndex}`);
      params.push(filters.to_store_id);
      paramIndex++;
    }

    if (filters?.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters?.date_from) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(filters.date_from);
      paramIndex++;
    }

    if (filters?.date_to) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(filters.date_to);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT 
        COUNT(*) as total_transfers,
        COUNT(*) FILTER (WHERE status = 'REQUESTED') as requested,
        COUNT(*) FILTER (WHERE status = 'APPROVED') as approved,
        COUNT(*) FILTER (WHERE status = 'IN_TRANSIT') as in_transit,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
        COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled,
        COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected
      FROM inventory_transfers ${whereClause}`,
      params,
    );

    return result.rows[0];
  }

  /**
   * Generate transfer number
   */
  private async generateTransferNumber(): Promise<string> {
    const result = await query(
      `SELECT 'TRF-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD((COALESCE(MAX(CAST(SUBSTRING(transfer_number FROM 13) AS INTEGER)), 0) + 1)::TEXT, 4, '0') as number
       FROM inventory_transfers
       WHERE transfer_number LIKE 'TRF-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-%'`,
    );

    if (result.rows[0].number) {
      return result.rows[0].number;
    }

    return `TRF-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-0001`;
  }
}
