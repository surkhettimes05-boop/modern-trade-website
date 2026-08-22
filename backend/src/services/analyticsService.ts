import { query } from "../database/connection.js";

interface AnalyticsEvent {
  id: string;
  event_id: string;
  event_type: string;
  event_category: string;
  customer_id: string;
  store_id: string;
  order_id: string;
  product_id: string;
  event_data: any;
  occurred_at: Date;
  processed_at: Date;
  metadata: any;
}

interface SavedReport {
  id: string;
  report_id: string;
  name: string;
  description: string;
  report_type: string;
  query_config: any;
  visualization_config: any;
  schedule_config: any;
  created_by: string;
  shared_with: any;
  created_at: Date;
  updated_at: Date;
  last_run_at: Date;
  metadata: any;
}

const REPORT_QUERIES: Readonly<Record<string, string>> = Object.freeze({
  SALES: `SELECT COUNT(*)::int AS total_orders,
                 COALESCE(SUM(total_amount), 0) AS total_revenue,
                 COALESCE(AVG(total_amount), 0) AS average_order_value
            FROM web_orders`,
  INVENTORY: `SELECT COUNT(DISTINCT product_id)::int AS products,
                     COALESCE(SUM(quantity), 0)::int AS units_on_hand
                FROM batch_inventory`,
  CUSTOMER: `SELECT COUNT(*)::int AS total_customers,
                    COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_customers
               FROM customers`,
  LOYALTY: `SELECT COUNT(*)::int AS accounts,
                   COALESCE(SUM(current_points), 0)::int AS outstanding_points
              FROM customer_loyalty_accounts`,
  DELIVERY: `SELECT COUNT(*)::int AS total_deliveries,
                    COUNT(*) FILTER (WHERE status = 'DELIVERED')::int AS delivered
               FROM delivery_assignments`,
});

export class AnalyticsService {
  /**
   * Track analytics event
   */
  async trackEvent(eventData: {
    event_type: string;
    event_category?: string;
    customer_id?: string;
    store_id?: string;
    order_id?: string;
    product_id?: string;
    event_data?: any;
    metadata?: any;
  }): Promise<AnalyticsEvent> {
    const eventId = this.generateEventId();

    const result = await query(
      `INSERT INTO analytics_events (
        event_id, event_type, event_category, customer_id, store_id,
        order_id, product_id, event_data, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        eventId,
        eventData.event_type,
        eventData.event_category || null,
        eventData.customer_id || null,
        eventData.store_id || null,
        eventData.order_id || null,
        eventData.product_id || null,
        JSON.stringify(eventData.event_data || {}),
        JSON.stringify(eventData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get events by type
   */
  async getEventsByType(
    eventType: string,
    limit = 100,
  ): Promise<AnalyticsEvent[]> {
    const result = await query(
      `SELECT * FROM analytics_events 
       WHERE event_type = $1 
       ORDER BY occurred_at DESC 
       LIMIT $2`,
      [eventType, limit],
    );
    return result.rows;
  }

  /**
   * Get events for customer
   */
  async getEventsForCustomer(
    customerId: string,
    limit = 100,
  ): Promise<AnalyticsEvent[]> {
    const result = await query(
      `SELECT * FROM analytics_events 
       WHERE customer_id = $1 
       ORDER BY occurred_at DESC 
       LIMIT $2`,
      [customerId, limit],
    );
    return result.rows;
  }

  /**
   * Get sales analytics
   */
  async getSalesAnalytics(
    filters: {
      store_id?: string;
      start_date?: Date;
      end_date?: Date;
    } = {},
  ): Promise<any> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (filters.store_id) {
      conditions.push("store_id = $1");
      values.push(filters.store_id);
    }

    if (filters.start_date) {
      conditions.push(`created_at >= $${values.length + 1}`);
      values.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`created_at <= $${values.length + 1}`);
      values.push(filters.end_date);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(AVG(total_amount), 0) as average_order_value,
        COUNT(DISTINCT customer_id) as unique_customers
       FROM web_orders
       ${whereClause}`,
      values,
    );

    return result.rows[0];
  }

  /**
   * Get product analytics
   */
  async getProductAnalytics(
    filters: {
      store_id?: string;
      start_date?: Date;
      end_date?: Date;
    } = {},
  ): Promise<any[]> {
    const conditions: string[] = ["oi.store_id = s.id"];
    const values: any[] = [];

    if (filters.store_id) {
      conditions.push("s.id = $1");
      values.push(filters.store_id);
    }

    if (filters.start_date) {
      conditions.push(`o.created_at >= $${values.length + 1}`);
      values.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`o.created_at <= $${values.length + 1}`);
      values.push(filters.end_date);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT 
        p.id as product_id,
        p.name as product_name,
        SUM(oi.quantity) as total_sold,
        SUM(oi.quantity * oi.unit_price) as total_revenue,
        COUNT(DISTINCT o.customer_id) as unique_buyers
       FROM order_items oi
       JOIN web_orders o ON oi.order_id = o.id
       JOIN products p ON oi.product_id = p.id
       JOIN stores s ON p.store_id = s.id
       ${whereClause}
       GROUP BY p.id, p.name
       ORDER BY total_sold DESC
       LIMIT 50`,
      values,
    );

    return result.rows;
  }

  /**
   * Get customer analytics
   */
  async getCustomerAnalytics(
    filters: {
      store_id?: string;
      start_date?: Date;
      end_date?: Date;
    } = {},
  ): Promise<any> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (filters.store_id) {
      conditions.push("store_id = $1");
      values.push(filters.store_id);
    }

    if (filters.start_date) {
      conditions.push(`created_at >= $${values.length + 1}`);
      values.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`created_at <= $${values.length + 1}`);
      values.push(filters.end_date);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT 
        COUNT(*) as total_customers,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_customers_30d,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '90 days' THEN 1 END) as new_customers_90d,
        COUNT(CASE WHEN last_order_date >= NOW() - INTERVAL '30 days' THEN 1 END) as active_customers_30d
       FROM customers
       ${whereClause}`,
      values,
    );

    return result.rows[0];
  }

  /**
   * Create saved report
   */
  async createSavedReport(reportData: {
    name: string;
    description?: string;
    report_type: string;
    query_config: any;
    visualization_config?: any;
    schedule_config?: any;
    created_by: string;
    shared_with?: any;
    metadata?: any;
  }): Promise<SavedReport> {
    const reportId = this.generateReportId();

    const result = await query(
      `INSERT INTO saved_reports (
        report_id, name, description, report_type, query_config,
        visualization_config, schedule_config, created_by, shared_with, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        reportId,
        reportData.name,
        reportData.description || null,
        reportData.report_type,
        JSON.stringify(reportData.query_config),
        JSON.stringify(reportData.visualization_config || {}),
        JSON.stringify(reportData.schedule_config || {}),
        reportData.created_by,
        JSON.stringify(reportData.shared_with || []),
        JSON.stringify(reportData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get saved report
   */
  async getSavedReport(reportId: string): Promise<SavedReport | null> {
    const result = await query(
      "SELECT * FROM saved_reports WHERE report_id = $1",
      [reportId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get saved reports by type
   */
  async getSavedReportsByType(
    reportType: string,
    createdBy?: string,
  ): Promise<SavedReport[]> {
    const conditions: string[] = ["report_type = $1"];
    const values: any[] = [reportType];

    if (createdBy) {
      conditions.push(`created_by = $${values.length + 1}`);
      values.push(createdBy);
    }

    const whereClause = conditions.join(" AND ");

    const result = await query(
      `SELECT * FROM saved_reports WHERE ${whereClause} ORDER BY created_at DESC`,
      values,
    );
    return result.rows;
  }

  /**
   * Execute saved report
   */
  async executeReport(reportId: string): Promise<any> {
    const report = await this.getSavedReport(reportId);
    if (!report) {
      throw new Error("Report not found");
    }

    // Never execute SQL persisted in report configuration. Reports select a
    // server-owned query solely from their validated report type so legacy or
    // tampered rows cannot become a database command-execution primitive.
    const queryText = REPORT_QUERIES[report.report_type];
    if (!queryText) {
      throw new Error("Unsupported report type");
    }

    // Update last run time
    await query(
      "UPDATE saved_reports SET last_run_at = NOW() WHERE report_id = $1",
      [reportId],
    );

    // Execute the query
    const result = await query(queryText, []);

    return {
      report_id: reportId,
      data: result.rows,
      executed_at: new Date(),
    };
  }

  /**
   * Get daily sales trend
   */
  async getDailySalesTrend(
    filters: {
      store_id?: string;
      start_date?: Date;
      end_date?: Date;
    } = {},
  ): Promise<any[]> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (filters.store_id) {
      conditions.push("store_id = $1");
      values.push(filters.store_id);
    }

    if (filters.start_date) {
      conditions.push(`created_at >= $${values.length + 1}`);
      values.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`created_at <= $${values.length + 1}`);
      values.push(filters.end_date);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as orders,
        COALESCE(SUM(total_amount), 0) as revenue
       FROM web_orders
       ${whereClause}
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      values,
    );

    return result.rows;
  }

  /**
   * Get top customers by spend
   */
  async getTopCustomersBySpend(
    filters: {
      store_id?: string;
      start_date?: Date;
      end_date?: Date;
      limit?: number;
    } = {},
  ): Promise<any[]> {
    const conditions: string[] = [];
    const values: any[] = [];
    const limit = filters.limit || 50;

    if (filters.store_id) {
      conditions.push("o.store_id = $1");
      values.push(filters.store_id);
    }

    if (filters.start_date) {
      conditions.push(`o.created_at >= $${values.length + 1}`);
      values.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`o.created_at <= $${values.length + 1}`);
      values.push(filters.end_date);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT 
        c.id as customer_id,
        c.name as customer_name,
        c.email as customer_email,
        COUNT(o.id) as order_count,
        COALESCE(SUM(o.total_amount), 0) as total_spend
       FROM customers c
       JOIN web_orders o ON c.id = o.customer_id
       ${whereClause}
       GROUP BY c.id, c.name, c.email
       ORDER BY total_spend DESC
       LIMIT $${values.length + 1}`,
      [...values, limit],
    );

    return result.rows;
  }

  /**
   * Generate event ID
   */
  private generateEventId(): string {
    return `EVT-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Generate report ID
   */
  private generateReportId(): string {
    return `RPT-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

export const analyticsService = new AnalyticsService();
