import { query } from "../database/connection.js";

interface AuditReport {
  id: string;
  report_number: string;
  report_type: string;
  store_id: string;
  generated_by: string;
  generated_at: Date;
  period_start: Date;
  period_end: Date;
  status: string;
  data: any;
  metadata: any;
  created_at: Date;
}

export class AuditReportService {
  /**
   * Generate shift audit report
   */
  async generateShiftAuditReport(
    shiftId: string,
    generatedBy: string,
  ): Promise<AuditReport> {
    const reportNumber = await this.generateReportNumber("SHIFT");

    // Get shift details
    const shiftResult = await query("SELECT * FROM shifts WHERE id = $1", [
      shiftId,
    ]);
    const shift = shiftResult.rows[0];

    // Get sales for shift
    const salesResult = await query(
      `SELECT * FROM sales WHERE shift_id = $1 AND status = 'COMPLETED'`,
      [shiftId],
    );

    // Calculate totals
    const reportData = {
      shift: shift,
      sales_count: salesResult.rows.length,
      total_sales: salesResult.rows.reduce(
        (sum, s) => sum + parseFloat(s.total_amount),
        0,
      ),
      total_discounts: salesResult.rows.reduce(
        (sum, s) => sum + parseFloat(s.discount_amount || 0),
        0,
      ),
      payment_methods: this.groupByPaymentMethod(salesResult.rows),
      cash_variance: shift.cash_variance,
    };

    const result = await query(
      `INSERT INTO audit_reports (
        report_number, report_type, store_id, generated_by, generated_at,
        period_start, period_end, status, data
      ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)
      RETURNING *`,
      [
        reportNumber,
        "SHIFT",
        shift.store_id,
        generatedBy,
        shift.opened_at,
        shift.closed_at || new Date(),
        "GENERATED",
        JSON.stringify(reportData),
      ],
    );

    return result.rows[0];
  }

  /**
   * Generate daily sales audit report
   */
  async generateDailySalesAuditReport(
    storeId: string,
    date: Date,
    generatedBy: string,
  ): Promise<AuditReport> {
    const reportNumber = await this.generateReportNumber("DAILY");

    const periodStart = new Date(date);
    periodStart.setHours(0, 0, 0, 0);
    const periodEnd = new Date(date);
    periodEnd.setHours(23, 59, 59, 999);

    // Get sales for the day
    const salesResult = await query(
      `SELECT * FROM sales 
       WHERE store_id = $1 
         AND sale_timestamp >= $2 
         AND sale_timestamp <= $3
         AND status = 'COMPLETED'`,
      [storeId, periodStart, periodEnd],
    );

    // Get shifts for the day
    const shiftsResult = await query(
      `SELECT * FROM shifts 
       WHERE store_id = $1 
         AND opened_at >= $2 
         AND opened_at <= $3`,
      [storeId, periodStart, periodEnd],
    );

    const reportData = {
      date: date.toISOString().split("T")[0],
      sales_count: salesResult.rows.length,
      total_sales: salesResult.rows.reduce(
        (sum, s) => sum + parseFloat(s.total_amount),
        0,
      ),
      total_discounts: salesResult.rows.reduce(
        (sum, s) => sum + parseFloat(s.discount_amount || 0),
        0,
      ),
      payment_methods: this.groupByPaymentMethod(salesResult.rows),
      shifts_count: shiftsResult.rows.length,
      shifts: shiftsResult.rows,
    };

    const result = await query(
      `INSERT INTO audit_reports (
        report_number, report_type, store_id, generated_by, generated_at,
        period_start, period_end, status, data
      ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)
      RETURNING *`,
      [
        reportNumber,
        "DAILY_SALES",
        storeId,
        generatedBy,
        periodStart,
        periodEnd,
        "GENERATED",
        JSON.stringify(reportData),
      ],
    );

    return result.rows[0];
  }

  /**
   * Generate inventory audit report
   */
  async generateInventoryAuditReport(
    storeId: string,
    generatedBy: string,
  ): Promise<AuditReport> {
    const reportNumber = await this.generateReportNumber("INVENTORY");

    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - 30);

    // Get inventory transactions
    const transactionsResult = await query(
      `SELECT * FROM inventory_transactions 
       WHERE store_id = $1 
         AND transaction_date >= $2
       ORDER BY transaction_date DESC`,
      [storeId, periodStart],
    );

    // Get current inventory
    const inventoryResult = await query(
      `SELECT * FROM inventory WHERE store_id = $1`,
      [storeId],
    );

    const reportData = {
      period_start: periodStart.toISOString(),
      period_end: new Date().toISOString(),
      transaction_count: transactionsResult.rows.length,
      inventory_count: inventoryResult.rows.length,
      transactions_by_type: this.groupByTransactionType(
        transactionsResult.rows,
      ),
      low_stock_items: inventoryResult.rows.filter(
        (i) => parseFloat(i.quantity) < parseFloat(i.min_stock_level || 0),
      ),
    };

    const result = await query(
      `INSERT INTO audit_reports (
        report_number, report_type, store_id, generated_by, generated_at,
        period_start, period_end, status, data
      ) VALUES ($1, $2, $3, $4, NOW(), $5, NOW(), $6, $7)
      RETURNING *`,
      [
        reportNumber,
        "INVENTORY",
        storeId,
        generatedBy,
        periodStart,
        "GENERATED",
        JSON.stringify(reportData),
      ],
    );

    return result.rows[0];
  }

  /**
   * Generate loyalty audit report
   */
  async generateLoyaltyAuditReport(
    storeId: string,
    periodStart: Date,
    periodEnd: Date,
    generatedBy: string,
  ): Promise<AuditReport> {
    const reportNumber = await this.generateReportNumber("LOYALTY");

    // Get loyalty ledger entries
    const ledgerResult = await query(
      `SELECT * FROM loyalty_ledger 
       WHERE store_id = $1 
         AND transaction_date >= $2 
         AND transaction_date <= $3`,
      [storeId, periodStart, periodEnd],
    );

    // Get customers with activity
    const customersResult = await query(
      `SELECT c.*, 
              COALESCE(SUM(ll.points_earned), 0) as points_earned,
              COALESCE(SUM(ll.points_redeemed), 0) as points_redeemed
       FROM customers c
       LEFT JOIN loyalty_ledger ll ON c.id = ll.customer_id 
         AND ll.transaction_date >= $2 
         AND ll.transaction_date <= $3
       WHERE c.home_store_id = $1
       GROUP BY c.id`,
      [storeId, periodStart, periodEnd],
    );

    const reportData = {
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      ledger_entries_count: ledgerResult.rows.length,
      total_points_earned: ledgerResult.rows.reduce(
        (sum, l) => sum + parseInt(l.points_earned || 0),
        0,
      ),
      total_points_redeemed: ledgerResult.rows.reduce(
        (sum, l) => sum + parseInt(l.points_redeemed || 0),
        0,
      ),
      active_customers: customersResult.rows.length,
    };

    const result = await query(
      `INSERT INTO audit_reports (
        report_number, report_type, store_id, generated_by, generated_at,
        period_start, period_end, status, data
      ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)
      RETURNING *`,
      [
        reportNumber,
        "LOYALTY",
        storeId,
        generatedBy,
        periodStart,
        periodEnd,
        "GENERATED",
        JSON.stringify(reportData),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get audit report by ID
   */
  async getAuditReport(reportId: string): Promise<AuditReport | null> {
    const result = await query("SELECT * FROM audit_reports WHERE id = $1", [
      reportId,
    ]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get audit reports with filters
   */
  async getAuditReports(filters: {
    report_type?: string;
    store_id?: string;
    date_from?: Date;
    date_to?: Date;
    limit?: number;
    offset?: number;
  }): Promise<AuditReport[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.report_type) {
      conditions.push(`report_type = $${paramIndex}`);
      params.push(filters.report_type);
      paramIndex++;
    }

    if (filters.store_id) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(filters.store_id);
      paramIndex++;
    }

    if (filters.date_from) {
      conditions.push(`generated_at >= $${paramIndex}`);
      params.push(filters.date_from);
      paramIndex++;
    }

    if (filters.date_to) {
      conditions.push(`generated_at <= $${paramIndex}`);
      params.push(filters.date_to);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";
    const offsetClause = filters.offset ? `OFFSET ${filters.offset}` : "";

    const result = await query(
      `SELECT * FROM audit_reports ${whereClause} ORDER BY generated_at DESC ${limitClause} ${offsetClause}`,
      params,
    );

    return result.rows;
  }

  /**
   * Helper: Group by payment method
   */
  private groupByPaymentMethod(
    sales: any[],
  ): Record<string, { count: number; amount: number }> {
    const grouped: Record<string, { count: number; amount: number }> = {};
    sales.forEach((sale) => {
      const method = sale.payment_method || "CASH";
      if (!grouped[method]) {
        grouped[method] = { count: 0, amount: 0 };
      }
      grouped[method].count++;
      grouped[method].amount += parseFloat(sale.total_amount || 0);
    });
    return grouped;
  }

  /**
   * Helper: Group by transaction type
   */
  private groupByTransactionType(transactions: any[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    transactions.forEach((tx) => {
      const type = tx.transaction_type || "ADJUSTMENT";
      grouped[type] = (grouped[type] || 0) + 1;
    });
    return grouped;
  }

  /**
   * Generate report number
   */
  private async generateReportNumber(prefix: string): Promise<string> {
    const result = await query(
      `SELECT 'AUD-' || $1 || '-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(COALESCE(MAX(CAST(SUBSTRING(report_number FROM 15) AS INTEGER)), 0) + 1, 4, '0') as number
       FROM audit_reports
       WHERE report_number LIKE 'AUD-' || $1 || '-%'
       AND report_number LIKE TO_CHAR(NOW(), 'YYYYMMDD') || '%'`,
      [prefix],
    );

    if (result.rows[0].number) {
      return result.rows[0].number;
    }

    return `AUD-${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-0001`;
  }
}
