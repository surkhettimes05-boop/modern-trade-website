import { query } from "../database/connection.js";

interface TenderReconciliation {
  id: string;
  reconciliation_number: string;
  shift_id: string;
  store_id: string;
  device_id: string;
  reconciled_by: string;
  reconciliation_date: Date;
  status: string;
  total_expected: number;
  total_counted: number;
  variance: number;
  notes: string;
  metadata: any;
  created_at: Date;
  updated_at: Date;
}

interface TenderLineItem {
  id: string;
  reconciliation_id: string;
  tender_type: string;
  expected_amount: number;
  counted_amount: number;
  variance: number;
  notes: string;
  metadata: any;
  created_at: Date;
  updated_at: Date;
}

export class TenderReconciliationService {
  /**
   * Create tender reconciliation
   */
  async createTenderReconciliation(reconciliationData: {
    shift_id: string;
    store_id: string;
    device_id?: string;
    reconciled_by: string;
    tender_breakdown: Array<{
      tender_type: string;
      expected_amount: number;
      counted_amount: number;
      notes?: string;
    }>;
    notes?: string;
    metadata?: any;
  }): Promise<TenderReconciliation> {
    const reconciliationNumber = await this.generateReconciliationNumber();

    // Calculate totals
    let totalExpected = 0;
    let totalCounted = 0;

    reconciliationData.tender_breakdown.forEach((item) => {
      totalExpected += item.expected_amount;
      totalCounted += item.counted_amount;
    });

    const variance = totalCounted - totalExpected;

    const result = await query(
      `INSERT INTO tender_reconciliations (
        reconciliation_number, shift_id, store_id, device_id, reconciled_by,
        reconciliation_date, status, total_expected, total_counted, variance,
        notes, metadata
      ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        reconciliationNumber,
        reconciliationData.shift_id,
        reconciliationData.store_id,
        reconciliationData.device_id || null,
        reconciliationData.reconciled_by,
        variance === 0 ? "MATCHED" : "DISCREPANCY",
        totalExpected,
        totalCounted,
        variance,
        reconciliationData.notes || null,
        JSON.stringify(reconciliationData.metadata || {}),
      ],
    );

    const reconciliation = result.rows[0];

    // Add tender line items
    for (const item of reconciliationData.tender_breakdown) {
      await query(
        `INSERT INTO tender_reconciliation_items (
          reconciliation_id, tender_type, expected_amount, counted_amount,
          variance, notes
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          reconciliation.id,
          item.tender_type,
          item.expected_amount,
          item.counted_amount,
          item.counted_amount - item.expected_amount,
          item.notes || null,
        ],
      );
    }

    return reconciliation;
  }

  /**
   * Get reconciliation by ID
   */
  async getReconciliation(
    reconciliationId: string,
  ): Promise<TenderReconciliation | null> {
    const result = await query(
      "SELECT * FROM tender_reconciliations WHERE id = $1",
      [reconciliationId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get reconciliation by number
   */
  async getReconciliationByNumber(
    reconciliationNumber: string,
  ): Promise<TenderReconciliation | null> {
    const result = await query(
      "SELECT * FROM tender_reconciliations WHERE reconciliation_number = $1",
      [reconciliationNumber],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get reconciliations with filters
   */
  async getReconciliations(filters: {
    shift_id?: string;
    store_id?: string;
    device_id?: string;
    status?: string;
    date_from?: Date;
    date_to?: Date;
    limit?: number;
    offset?: number;
  }): Promise<TenderReconciliation[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.shift_id) {
      conditions.push(`shift_id = $${paramIndex}`);
      params.push(filters.shift_id);
      paramIndex++;
    }

    if (filters.store_id) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(filters.store_id);
      paramIndex++;
    }

    if (filters.device_id) {
      conditions.push(`device_id = $${paramIndex}`);
      params.push(filters.device_id);
      paramIndex++;
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.date_from) {
      conditions.push(`reconciliation_date >= $${paramIndex}`);
      params.push(filters.date_from);
      paramIndex++;
    }

    if (filters.date_to) {
      conditions.push(`reconciliation_date <= $${paramIndex}`);
      params.push(filters.date_to);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";
    const offsetClause = filters.offset ? `OFFSET ${filters.offset}` : "";

    const result = await query(
      `SELECT * FROM tender_reconciliations ${whereClause} ORDER BY reconciliation_date DESC ${limitClause} ${offsetClause}`,
      params,
    );

    return result.rows;
  }

  /**
   * Get reconciliation items
   */
  async getReconciliationItems(
    reconciliationId: string,
  ): Promise<TenderLineItem[]> {
    const result = await query(
      "SELECT * FROM tender_reconciliation_items WHERE reconciliation_id = $1 ORDER BY id",
      [reconciliationId],
    );
    return result.rows;
  }

  /**
   * Calculate expected tender amounts from shift
   */
  async calculateExpectedTenders(shiftId: string): Promise<any> {
    const result = await query(
      `SELECT 
        payment_method,
        COALESCE(SUM(amount), 0) as expected_amount
      FROM sales
      WHERE shift_id = $1 AND status = 'COMPLETED'
      GROUP BY payment_method`,
      [shiftId],
    );

    const expectedTenders: Record<string, number> = {};
    result.rows.forEach((row) => {
      expectedTenders[row.payment_method] = parseFloat(row.expected_amount);
    });

    return expectedTenders;
  }

  /**
   * Update reconciliation status
   */
  async updateReconciliationStatus(
    reconciliationId: string,
    status: string,
    notes?: string,
  ): Promise<TenderReconciliation> {
    const result = await query(
      `UPDATE tender_reconciliations 
       SET status = $1,
           notes = COALESCE($2, notes),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, notes, reconciliationId],
    );

    return result.rows[0];
  }

  /**
   * Resolve discrepancy
   */
  async resolveDiscrepancy(
    reconciliationId: string,
    resolution: string,
    resolvedBy: string,
    notes?: string,
  ): Promise<TenderReconciliation> {
    const result = await query(
      `UPDATE tender_reconciliations 
       SET status = 'RESOLVED',
           notes = COALESCE($2, notes) || ' - Resolved by ' || $3 || ': ' || $4,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [reconciliationId, notes, resolvedBy, resolution],
    );

    return result.rows[0];
  }

  /**
   * Get reconciliation summary
   */
  async getReconciliationSummary(filters?: {
    store_id?: string;
    device_id?: string;
    date_from?: Date;
    date_to?: Date;
  }): Promise<any> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.store_id) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(filters.store_id);
      paramIndex++;
    }

    if (filters?.device_id) {
      conditions.push(`device_id = $${paramIndex}`);
      params.push(filters.device_id);
      paramIndex++;
    }

    if (filters?.date_from) {
      conditions.push(`reconciliation_date >= $${paramIndex}`);
      params.push(filters.date_from);
      paramIndex++;
    }

    if (filters?.date_to) {
      conditions.push(`reconciliation_date <= $${paramIndex}`);
      params.push(filters.date_to);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT 
        COUNT(*) as total_reconciliations,
        COUNT(*) FILTER (WHERE status = 'MATCHED') as matched,
        COUNT(*) FILTER (WHERE status = 'DISCREPANCY') as discrepancy,
        COUNT(*) FILTER (WHERE status = 'RESOLVED') as resolved,
        SUM(total_expected) as total_expected,
        SUM(total_counted) as total_counted,
        SUM(variance) as total_variance,
        COUNT(*) FILTER (WHERE variance > 0) as overages,
        COUNT(*) FILTER (WHERE variance < 0) as shortages
      FROM tender_reconciliations ${whereClause}`,
      params,
    );

    return result.rows[0];
  }

  /**
   * Generate reconciliation number
   */
  private async generateReconciliationNumber(): Promise<string> {
    const result = await query(
      `SELECT 'REC-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(COALESCE(MAX(CAST(SUBSTRING(reconciliation_number FROM 13) AS INTEGER)), 0) + 1, 4, '0') as number
       FROM tender_reconciliations
       WHERE reconciliation_number LIKE 'REC-%'
       AND reconciliation_number LIKE TO_CHAR(NOW(), 'YYYYMMDD') || '%'`,
    );

    if (result.rows[0].number) {
      return result.rows[0].number;
    }

    return `REC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-0001`;
  }
}
