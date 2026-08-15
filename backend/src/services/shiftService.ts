import { query } from "../database/connection.js";

interface Shift {
  id: string;
  shift_number: string;
  store_id: string;
  device_id: string;
  opened_by: string;
  closed_by: string;
  opened_at: Date;
  closed_at: Date;
  opening_cash: number;
  closing_cash: number;
  expected_cash: number;
  cash_variance: number;
  status: string;
  transaction_count: number;
  gross_sales: number;
  net_sales: number;
  total_discounts: number;
  points_earned: number;
  points_redeemed: number;
  notes: string;
  metadata: any;
  created_at: Date;
  updated_at: Date;
}

export class ShiftService {
  /**
   * Open shift
   */
  async openShift(shiftData: {
    store_id: string;
    device_id?: string;
    opened_by: string;
    opening_cash: number;
    notes?: string;
    metadata?: any;
  }): Promise<Shift> {
    const shiftNumber = await this.generateShiftNumber();

    const result = await query(
      `INSERT INTO shifts (
        shift_number, store_id, device_id, opened_by, opened_at,
        opening_cash, status, notes, metadata
      ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)
      RETURNING *`,
      [
        shiftNumber,
        shiftData.store_id,
        shiftData.device_id || null,
        shiftData.opened_by,
        shiftData.opening_cash,
        "OPEN",
        shiftData.notes || null,
        JSON.stringify(shiftData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get shift by ID
   */
  async getShift(shiftId: string): Promise<Shift | null> {
    const result = await query("SELECT * FROM shifts WHERE id = $1", [shiftId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get shift by number
   */
  async getShiftByNumber(shiftNumber: string): Promise<Shift | null> {
    const result = await query("SELECT * FROM shifts WHERE shift_number = $1", [
      shiftNumber,
    ]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get shifts with filters
   */
  async getShifts(filters: {
    store_id?: string;
    device_id?: string;
    status?: string;
    opened_by?: string;
    date_from?: Date;
    date_to?: Date;
    limit?: number;
    offset?: number;
  }): Promise<Shift[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

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

    if (filters.opened_by) {
      conditions.push(`opened_by = $${paramIndex}`);
      params.push(filters.opened_by);
      paramIndex++;
    }

    if (filters.date_from) {
      conditions.push(`opened_at >= $${paramIndex}`);
      params.push(filters.date_from);
      paramIndex++;
    }

    if (filters.date_to) {
      conditions.push(`opened_at <= $${paramIndex}`);
      params.push(filters.date_to);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";
    const offsetClause = filters.offset ? `OFFSET ${filters.offset}` : "";

    const result = await query(
      `SELECT * FROM shifts ${whereClause} ORDER BY opened_at DESC ${limitClause} ${offsetClause}`,
      params,
    );

    return result.rows;
  }

  /**
   * Get open shift for store/device
   */
  async getOpenShift(
    storeId: string,
    deviceId?: string,
  ): Promise<Shift | null> {
    const conditions: string[] = ["store_id = $1", "status = $2"];
    const params: any[] = [storeId, "OPEN"];
    let paramIndex = 3;

    if (deviceId) {
      conditions.push(`device_id = $${paramIndex}`);
      params.push(deviceId);
    }

    const result = await query(
      `SELECT * FROM shifts WHERE ${conditions.join(" AND ")} ORDER BY opened_at DESC LIMIT 1`,
      params,
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Close shift
   */
  async closeShift(
    shiftId: string,
    closeData: {
      closed_by: string;
      closing_cash: number;
      notes?: string;
    },
  ): Promise<Shift> {
    // Calculate expected cash and variance
    const shift = await this.getShift(shiftId);
    if (!shift) {
      throw new Error("Shift not found");
    }

    const expectedCash = shift.opening_cash + shift.gross_sales;
    const cashVariance = closeData.closing_cash - expectedCash;

    const result = await query(
      `UPDATE shifts 
       SET status = 'CLOSED',
           closed_by = $1,
           closed_at = NOW(),
           closing_cash = $2,
           expected_cash = $3,
           cash_variance = $4,
           notes = COALESCE($5, notes),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        closeData.closed_by,
        closeData.closing_cash,
        expectedCash,
        cashVariance,
        closeData.notes,
        shiftId,
      ],
    );

    return result.rows[0];
  }

  /**
   * Void shift
   */
  async voidShift(shiftId: string): Promise<Shift> {
    const result = await query(
      `UPDATE shifts 
       SET status = 'VOIDED', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [shiftId],
    );

    return result.rows[0];
  }

  /**
   * Update shift summary
   */
  async updateShiftSummary(shiftId: string): Promise<Shift> {
    // Calculate shift totals from sales
    const result = await query(
      `UPDATE shifts 
       SET transaction_count = COALESCE((
         SELECT COUNT(*) FROM sales 
         WHERE shift_id = $1 AND status = 'COMPLETED'
       ), 0),
       gross_sales = COALESCE((
         SELECT COALESCE(SUM(total_amount), 0) FROM sales 
         WHERE shift_id = $1 AND status = 'COMPLETED'
       ), 0),
       net_sales = COALESCE((
         SELECT COALESCE(SUM(total_amount - discount_amount), 0) FROM sales 
         WHERE shift_id = $1 AND status = 'COMPLETED'
       ), 0),
       total_discounts = COALESCE((
         SELECT COALESCE(SUM(discount_amount), 0) FROM sales 
         WHERE shift_id = $1 AND status = 'COMPLETED'
       ), 0),
       points_earned = COALESCE((
         SELECT COALESCE(SUM(points_earned), 0) FROM sales 
         WHERE shift_id = $1 AND status = 'COMPLETED'
       ), 0),
       points_redeemed = COALESCE((
         SELECT COALESCE(SUM(points_redeemed), 0) FROM sales 
         WHERE shift_id = $1 AND status = 'COMPLETED'
       ), 0),
       updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [shiftId],
    );

    return result.rows[0];
  }

  /**
   * Update shift
   */
  async updateShift(
    shiftId: string,
    updates: {
      opening_cash?: number;
      closing_cash?: number;
      notes?: string;
      metadata?: any;
    },
  ): Promise<Shift> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.opening_cash !== undefined) {
      fields.push(`opening_cash = $${paramIndex}`);
      values.push(updates.opening_cash);
      paramIndex++;
    }

    if (updates.closing_cash !== undefined) {
      fields.push(`closing_cash = $${paramIndex}`);
      values.push(updates.closing_cash);
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
    values.push(shiftId);

    const result = await query(
      `UPDATE shifts SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    return result.rows[0];
  }

  /**
   * Get shift summary
   */
  async getShiftSummary(filters?: {
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
      conditions.push(`opened_at >= $${paramIndex}`);
      params.push(filters.date_from);
      paramIndex++;
    }

    if (filters?.date_to) {
      conditions.push(`opened_at <= $${paramIndex}`);
      params.push(filters.date_to);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT 
        COUNT(*) as total_shifts,
        COUNT(*) FILTER (WHERE status = 'OPEN') as open_shifts,
        COUNT(*) FILTER (WHERE status = 'CLOSED') as closed_shifts,
        COUNT(*) FILTER (WHERE status = 'VOIDED') as voided_shifts,
        SUM(gross_sales) as total_gross_sales,
        SUM(net_sales) as total_net_sales,
        SUM(total_discounts) as total_discounts,
        SUM(cash_variance) as total_cash_variance,
        COUNT(*) FILTER (WHERE ABS(cash_variance) > 0) as shifts_with_variance
      FROM shifts ${whereClause}`,
      params,
    );

    return result.rows[0];
  }

  /**
   * Generate shift number
   */
  private async generateShiftNumber(): Promise<string> {
    const result = await query("SELECT generate_shift_number() as number");
    return result.rows[0].number;
  }
}
