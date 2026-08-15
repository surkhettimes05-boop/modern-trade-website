import { query } from "../database/connection.js";

interface BatchInventory {
  id: string;
  store_id: string;
  product_id: string;
  batch_id: string;
  expiry_date: Date;
  quantity: number;
  cost: number;
  created_at: Date;
  updated_at: Date;
}

interface QualityException {
  id: string;
  store_id: string;
  product_id: string;
  batch_id: string;
  exception_type: string;
  quantity: number;
  reason: string;
  status: string;
  resolved_by: string;
  resolved_at: Date;
  notes: string;
  created_at: Date;
}

export class BatchService {
  /**
   * Add batch inventory
   */
  async addBatchInventory(batchData: {
    store_id: string;
    product_id: string;
    batch_id: string;
    expiry_date: Date;
    quantity: number;
    cost: number;
  }): Promise<BatchInventory> {
    // Check if batch already exists
    const existing = await query(
      `SELECT * FROM batch_inventory 
       WHERE store_id = $1 AND product_id = $2 AND batch_id = $3`,
      [batchData.store_id, batchData.product_id, batchData.batch_id],
    );

    if (existing.rows.length > 0) {
      // Update existing batch
      const result = await query(
        `UPDATE batch_inventory 
         SET quantity = quantity + $1,
             cost = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [batchData.quantity, batchData.cost, existing.rows[0].id],
      );
      return result.rows[0];
    }

    // Create new batch
    const result = await query(
      `INSERT INTO batch_inventory (
        store_id, product_id, batch_id, expiry_date, quantity, cost
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        batchData.store_id,
        batchData.product_id,
        batchData.batch_id,
        batchData.expiry_date,
        batchData.quantity,
        batchData.cost,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get batch inventory
   */
  async getBatchInventory(filters: {
    store_id?: string;
    product_id?: string;
    batch_id?: string;
    expiring_soon_days?: number;
    limit?: number;
    offset?: number;
  }): Promise<BatchInventory[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.store_id) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(filters.store_id);
      paramIndex++;
    }

    if (filters.product_id) {
      conditions.push(`product_id = $${paramIndex}`);
      params.push(filters.product_id);
      paramIndex++;
    }

    if (filters.batch_id) {
      conditions.push(`batch_id = $${paramIndex}`);
      params.push(filters.batch_id);
      paramIndex++;
    }

    if (filters.expiring_soon_days) {
      conditions.push(
        `expiry_date <= CURRENT_DATE + INTERVAL '${filters.expiring_soon_days} days'`,
      );
      conditions.push(`expiry_date >= CURRENT_DATE`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";
    const offsetClause = filters.offset ? `OFFSET ${filters.offset}` : "";

    const result = await query(
      `SELECT * FROM batch_inventory ${whereClause} ORDER BY expiry_date ASC ${limitClause} ${offsetClause}`,
      params,
    );

    return result.rows;
  }

  /**
   * Get product batches for FIFO picking
   */
  async getProductBatchesForFIFO(
    productId: string,
    storeId: string,
  ): Promise<BatchInventory[]> {
    const result = await query(
      `SELECT * FROM batch_inventory 
       WHERE product_id = $1 AND store_id = $2 AND quantity > 0
       ORDER BY expiry_date ASC`,
      [productId, storeId],
    );

    return result.rows;
  }

  /**
   * Deduct from batch (FIFO)
   */
  async deductFromBatch(
    productId: string,
    storeId: string,
    quantity: number,
  ): Promise<BatchInventory[]> {
    const batches = await this.getProductBatchesForFIFO(productId, storeId);
    const updatedBatches: BatchInventory[] = [];
    let remainingQuantity = quantity;

    for (const batch of batches) {
      if (remainingQuantity <= 0) break;

      const deductAmount = Math.min(batch.quantity, remainingQuantity);

      const result = await query(
        `UPDATE batch_inventory 
         SET quantity = quantity - $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [deductAmount, batch.id],
      );

      updatedBatches.push(result.rows[0]);
      remainingQuantity -= deductAmount;
    }

    if (remainingQuantity > 0) {
      throw new Error("Insufficient inventory across all batches");
    }

    return updatedBatches;
  }

  /**
   * Get expiring batches
   */
  async getExpiringBatches(
    days: number,
    storeId?: string,
  ): Promise<BatchInventory[]> {
    const conditions: string[] = [
      `expiry_date <= CURRENT_DATE + INTERVAL '${days} days'`,
    ];
    const params: any[] = [];

    if (storeId) {
      conditions.push(`store_id = $1`);
      params.push(storeId);
    }

    const result = await query(
      `SELECT * FROM batch_inventory 
       WHERE ${conditions.join(" AND ")}
       ORDER BY expiry_date ASC`,
      params,
    );

    return result.rows;
  }

  /**
   * Get expired batches
   */
  async getExpiredBatches(storeId?: string): Promise<BatchInventory[]> {
    const conditions: string[] = [`expiry_date < CURRENT_DATE`];
    const params: any[] = [];

    if (storeId) {
      conditions.push(`store_id = $1`);
      params.push(storeId);
    }

    const result = await query(
      `SELECT * FROM batch_inventory 
       WHERE ${conditions.join(" AND ")}
       ORDER BY expiry_date ASC`,
      params,
    );

    return result.rows;
  }

  /**
   * Create quality exception
   */
  async createQualityException(exceptionData: {
    store_id: string;
    product_id: string;
    batch_id: string;
    exception_type: string;
    quantity: number;
    reason: string;
    notes?: string;
  }): Promise<QualityException> {
    const result = await query(
      `INSERT INTO inventory_quality_exceptions (
        store_id, product_id, batch_id, exception_type, quantity, reason, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        exceptionData.store_id,
        exceptionData.product_id,
        exceptionData.batch_id,
        exceptionData.exception_type,
        exceptionData.quantity,
        exceptionData.reason,
        exceptionData.notes || null,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get quality exceptions
   */
  async getQualityExceptions(filters: {
    store_id?: string;
    product_id?: string;
    batch_id?: string;
    status?: string;
    limit?: number;
  }): Promise<QualityException[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.store_id) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(filters.store_id);
      paramIndex++;
    }

    if (filters.product_id) {
      conditions.push(`product_id = $${paramIndex}`);
      params.push(filters.product_id);
      paramIndex++;
    }

    if (filters.batch_id) {
      conditions.push(`batch_id = $${paramIndex}`);
      params.push(filters.batch_id);
      paramIndex++;
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";

    const result = await query(
      `SELECT * FROM inventory_quality_exceptions ${whereClause} ORDER BY created_at DESC ${limitClause}`,
      params,
    );

    return result.rows;
  }

  /**
   * Resolve quality exception
   */
  async resolveQualityException(
    exceptionId: string,
    resolvedBy: string,
    notes?: string,
  ): Promise<QualityException> {
    const result = await query(
      `UPDATE inventory_quality_exceptions 
       SET status = 'RESOLVED',
           resolved_by = $1,
           resolved_at = NOW(),
           notes = COALESCE($2, notes)
       WHERE id = $3
       RETURNING *`,
      [resolvedBy, notes, exceptionId],
    );

    return result.rows[0];
  }

  /**
   * Get batch summary
   */
  async getBatchSummary(storeId?: string): Promise<any> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (storeId) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(storeId);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT 
        COUNT(*) as total_batches,
        COUNT(*) FILTER (WHERE expiry_date < CURRENT_DATE) as expired_batches,
        COUNT(*) FILTER (WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') as expiring_soon_30,
        COUNT(*) FILTER (WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days') as expiring_soon_90,
        SUM(quantity) as total_quantity,
        SUM(quantity) FILTER (WHERE expiry_date < CURRENT_DATE) as expired_quantity,
        SUM(quantity) FILTER (WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') as expiring_soon_30_quantity
      FROM batch_inventory ${whereClause}`,
      params,
    );

    return result.rows[0];
  }

  /**
   * Adjust batch quantity
   */
  async adjustBatchQuantity(
    batchId: string,
    adjustment: number,
  ): Promise<BatchInventory> {
    const result = await query(
      `UPDATE batch_inventory 
       SET quantity = quantity + $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [adjustment, batchId],
    );

    if (result.rows.length === 0) {
      throw new Error("Batch not found");
    }

    if (result.rows[0].quantity < 0) {
      throw new Error("Cannot reduce quantity below zero");
    }

    return result.rows[0];
  }

  /**
   * Merge batches
   */
  async mergeBatches(
    targetBatchId: string,
    sourceBatchIds: string[],
  ): Promise<BatchInventory> {
    const sourceBatches = await query(
      `SELECT * FROM batch_inventory WHERE id = ANY($1)`,
      [sourceBatchIds],
    );

    let totalQuantity = 0;
    let totalCost = 0;

    for (const batch of sourceBatches.rows) {
      totalQuantity += batch.quantity;
      totalCost += batch.cost * batch.quantity;
    }

    const averageCost = totalQuantity > 0 ? totalCost / totalQuantity : 0;

    // Update target batch
    const result = await query(
      `UPDATE batch_inventory 
       SET quantity = quantity + $1,
           cost = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [totalQuantity, averageCost, targetBatchId],
    );

    // Delete source batches
    await query(`DELETE FROM batch_inventory WHERE id = ANY($1)`, [
      sourceBatchIds,
    ]);

    return result.rows[0];
  }

  /**
   * Get batch history
   */
  async getBatchHistory(batchId: string): Promise<any[]> {
    // This would require a separate batch_history table
    // For now, return current state
    const result = await query(`SELECT * FROM batch_inventory WHERE id = $1`, [
      batchId,
    ]);

    return result.rows;
  }
}
