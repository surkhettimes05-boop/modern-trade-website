import { query } from "../database/connection.js";

interface SalesKPI {
  store_id: string;
  business_date: Date;
  transaction_count: number;
  gross_sales: number;
  net_sales: number;
  total_discounts: number;
  avg_basket_value: number;
  total_points_earned: number;
  total_points_redeemed: number;
  customer_count: number;
  identified_sales: number;
}

interface CustomerKPI {
  business_date: Date;
  new_members: number;
  verified_members: number;
  members_with_home_store: number;
}

interface LoyaltyKPI {
  business_date: Date;
  total_earned: number;
  total_redeemed: number;
  total_expired: number;
  total_adjusted: number;
  earn_transactions: number;
  redeem_transactions: number;
  active_customers: number;
}

interface ReturnsKPI {
  store_id: string;
  business_date: Date;
  return_count: number;
  total_return_amount: number;
  total_points_reversed: number;
  total_redemption_reversed: number;
}

interface VoidsKPI {
  store_id: string;
  business_date: Date;
  void_count: number;
  total_void_amount: number;
  total_points_earned_voided: number;
  total_points_redeemed_voided: number;
}

interface OfflineQueueKPI {
  store_id: string;
  device_id: string;
  business_date: Date;
  pending_count: number;
  uploaded_count: number;
  failed_count: number;
  rejected_count: number;
  pending_points: number;
  oldest_pending_at: Date;
}

export class KPIService {
  /**
   * Get sales KPIs by store and date range
   */
  async getSalesKPIs(filters: {
    store_id?: string;
    business_date_from?: Date;
    business_date_to?: Date;
    limit?: number;
  }): Promise<SalesKPI[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.store_id) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(filters.store_id);
      paramIndex++;
    }

    if (filters.business_date_from) {
      conditions.push(`business_date >= $${paramIndex}`);
      params.push(filters.business_date_from);
      paramIndex++;
    }

    if (filters.business_date_to) {
      conditions.push(`business_date <= $${paramIndex}`);
      params.push(filters.business_date_to);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";

    const result = await query(
      `SELECT * FROM mv_daily_sales_by_store ${whereClause} ORDER BY business_date DESC, store_id ${limitClause}`,
      params,
    );

    return result.rows;
  }

  /**
   * Get sales KPI summary across all stores
   */
  async getSalesKPISummary(filters: {
    business_date_from?: Date;
    business_date_to?: Date;
  }): Promise<any> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.business_date_from) {
      conditions.push(`business_date >= $${paramIndex}`);
      params.push(filters.business_date_from);
      paramIndex++;
    }

    if (filters.business_date_to) {
      conditions.push(`business_date <= $${paramIndex}`);
      params.push(filters.business_date_to);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT 
        COUNT(*) as total_transactions,
        SUM(transaction_count) as total_transaction_count,
        SUM(gross_sales) as total_gross_sales,
        SUM(net_sales) as total_net_sales,
        SUM(total_discounts) as total_discounts,
        AVG(avg_basket_value) as avg_basket_value,
        SUM(total_points_earned) as total_points_earned,
        SUM(total_points_redeemed) as total_points_redeemed,
        COUNT(DISTINCT store_id) as store_count,
        SUM(customer_count) as total_customer_count,
        SUM(identified_sales) as total_identified_sales
      FROM mv_daily_sales_by_store ${whereClause}`,
      params,
    );

    return result.rows[0];
  }

  /**
   * Get customer KPIs by date range
   */
  async getCustomerKPIs(filters: {
    business_date_from?: Date;
    business_date_to?: Date;
    limit?: number;
  }): Promise<CustomerKPI[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.business_date_from) {
      conditions.push(`business_date >= $${paramIndex}`);
      params.push(filters.business_date_from);
      paramIndex++;
    }

    if (filters.business_date_to) {
      conditions.push(`business_date <= $${paramIndex}`);
      params.push(filters.business_date_to);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";

    const result = await query(
      `SELECT * FROM mv_daily_customer_metrics ${whereClause} ORDER BY business_date DESC ${limitClause}`,
      params,
    );

    return result.rows;
  }

  /**
   * Get loyalty KPIs by date range
   */
  async getLoyaltyKPIs(filters: {
    business_date_from?: Date;
    business_date_to?: Date;
    limit?: number;
  }): Promise<LoyaltyKPI[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.business_date_from) {
      conditions.push(`business_date >= $${paramIndex}`);
      params.push(filters.business_date_from);
      paramIndex++;
    }

    if (filters.business_date_to) {
      conditions.push(`business_date <= $${paramIndex}`);
      params.push(filters.business_date_to);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";

    const result = await query(
      `SELECT * FROM mv_daily_loyalty_metrics ${whereClause} ORDER BY business_date DESC ${limitClause}`,
      params,
    );

    return result.rows;
  }

  /**
   * Get returns KPIs by store and date range
   */
  async getReturnsKPIs(filters: {
    store_id?: string;
    business_date_from?: Date;
    business_date_to?: Date;
    limit?: number;
  }): Promise<ReturnsKPI[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.store_id) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(filters.store_id);
      paramIndex++;
    }

    if (filters.business_date_from) {
      conditions.push(`business_date >= $${paramIndex}`);
      params.push(filters.business_date_from);
      paramIndex++;
    }

    if (filters.business_date_to) {
      conditions.push(`business_date <= $${paramIndex}`);
      params.push(filters.business_date_to);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";

    const result = await query(
      `SELECT * FROM mv_daily_returns_by_store ${whereClause} ORDER BY business_date DESC, store_id ${limitClause}`,
      params,
    );

    return result.rows;
  }

  /**
   * Get voids KPIs by store and date range
   */
  async getVoidsKPIs(filters: {
    store_id?: string;
    business_date_from?: Date;
    business_date_to?: Date;
    limit?: number;
  }): Promise<VoidsKPI[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.store_id) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(filters.store_id);
      paramIndex++;
    }

    if (filters.business_date_from) {
      conditions.push(`business_date >= $${paramIndex}`);
      params.push(filters.business_date_from);
      paramIndex++;
    }

    if (filters.business_date_to) {
      conditions.push(`business_date <= $${paramIndex}`);
      params.push(filters.business_date_to);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";

    const result = await query(
      `SELECT * FROM mv_daily_voids_by_store ${whereClause} ORDER BY business_date DESC, store_id ${limitClause}`,
      params,
    );

    return result.rows;
  }

  /**
   * Get offline queue KPIs
   */
  async getOfflineQueueKPIs(filters: {
    store_id?: string;
    business_date_from?: Date;
    business_date_to?: Date;
    limit?: number;
  }): Promise<OfflineQueueKPI[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.store_id) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(filters.store_id);
      paramIndex++;
    }

    if (filters.business_date_from) {
      conditions.push(`business_date >= $${paramIndex}`);
      params.push(filters.business_date_from);
      paramIndex++;
    }

    if (filters.business_date_to) {
      conditions.push(`business_date <= $${paramIndex}`);
      params.push(filters.business_date_to);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";

    const result = await query(
      `SELECT * FROM mv_daily_offline_queue ${whereClause} ORDER BY business_date DESC, store_id, device_id ${limitClause}`,
      params,
    );

    return result.rows;
  }

  /**
   * Get current outstanding points balance
   */
  async getOutstandingPoints(): Promise<number> {
    const result = await query(
      `SELECT COALESCE(SUM(points_signed), 0) as outstanding_points
       FROM loyalty_ledger
       WHERE entry_status = 'POSTED'`,
    );
    return Number(result.rows[0].outstanding_points);
  }

  /**
   * Get points expiring in next 30 days
   */
  async getExpiringPoints(days: number = 30): Promise<number> {
    const result = await query(
      `SELECT COALESCE(SUM(remaining_points), 0) as expiring_points
       FROM loyalty_earn_lots
       WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${days} days'
         AND is_expired = FALSE`,
    );
    return Number(result.rows[0].expiring_points);
  }

  /**
   * Get identified sales rate
   */
  async getIdentifiedSalesRate(filters: {
    business_date_from?: Date;
    business_date_to?: Date;
  }): Promise<number> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.business_date_from) {
      conditions.push(`business_date >= $${paramIndex}`);
      params.push(filters.business_date_from);
      paramIndex++;
    }

    if (filters.business_date_to) {
      conditions.push(`business_date <= $${paramIndex}`);
      params.push(filters.business_date_to);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT 
        CASE 
          WHEN SUM(transaction_count) > 0 
          THEN (SUM(identified_sales)::numeric / SUM(transaction_count)) * 100 
          ELSE 0 
        END as identified_rate
      FROM mv_daily_sales_by_store ${whereClause}`,
      params,
    );

    return Number(result.rows[0].identified_rate);
  }

  /**
   * Get return/void rate
   */
  async getReturnVoidRate(filters: {
    store_id?: string;
    business_date_from?: Date;
    business_date_to?: Date;
  }): Promise<{ return_rate: number; void_rate: number }> {
    const conditions: string[] = ["business_date >= $1", "business_date <= $2"];
    const params: any[] = [
      filters.business_date_from ||
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      filters.business_date_to || new Date(),
    ];
    let paramIndex = 3;

    if (filters.store_id) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(filters.store_id);
      paramIndex++;
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const salesResult = await query(
      `SELECT SUM(transaction_count) as total_transactions FROM mv_daily_sales_by_store ${whereClause}`,
      params,
    );

    const returnsResult = await query(
      `SELECT SUM(return_count) as total_returns FROM mv_daily_returns_by_store ${whereClause}`,
      params,
    );

    const voidsResult = await query(
      `SELECT SUM(void_count) as total_voids FROM mv_daily_voids_by_store ${whereClause}`,
      params,
    );

    const totalTransactions =
      Number(salesResult.rows[0].total_transactions) || 0;
    const totalReturns = Number(returnsResult.rows[0].total_returns) || 0;
    const totalVoids = Number(voidsResult.rows[0].total_voids) || 0;

    return {
      return_rate:
        totalTransactions > 0 ? (totalReturns / totalTransactions) * 100 : 0,
      void_rate:
        totalTransactions > 0 ? (totalVoids / totalTransactions) * 100 : 0,
    };
  }

  /**
   * Get low stock count by store
   */
  async getLowStockCount(storeId?: string): Promise<any[]> {
    const conditions: string[] = ["availability_status = 'LOW_STOCK'"];
    const params: any[] = [];
    let paramIndex = 1;

    if (storeId) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(storeId);
      paramIndex++;
    }

    const result = await query(
      `SELECT store_id, COUNT(*) as low_stock_count
       FROM store_product_availability
       WHERE ${conditions.join(" AND ")}
       GROUP BY store_id`,
      params,
    );

    return result.rows;
  }

  /**
   * Get stockout count by store
   */
  async getStockoutCount(storeId?: string): Promise<any[]> {
    const conditions: string[] = ["availability_status = 'OUT_OF_STOCK'"];
    const params: any[] = [];
    let paramIndex = 1;

    if (storeId) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(storeId);
      paramIndex++;
    }

    const result = await query(
      `SELECT store_id, COUNT(*) as stockout_count
       FROM store_product_availability
       WHERE ${conditions.join(" AND ")}
       GROUP BY store_id`,
      params,
    );

    return result.rows;
  }

  /**
   * Get offline queue current status
   */
  async getOfflineQueueStatus(storeId?: string): Promise<any> {
    const conditions: string[] = ["queue_status = 'PENDING'"];
    const params: any[] = [];
    let paramIndex = 1;

    if (storeId) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(storeId);
      paramIndex++;
    }

    const result = await query(
      `SELECT 
        COUNT(*) as pending_count,
        SUM(points_calculated) as pending_points,
        MIN(created_at) as oldest_pending_at,
        MAX(created_at) as newest_pending_at
       FROM offline_earn_queue
       WHERE ${conditions.join(" AND ")}`,
      params,
    );

    return result.rows[0];
  }

  /**
   * Get store sync status
   */
  async getStoreSyncStatus(storeId?: string): Promise<any[]> {
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
      `SELECT * FROM store_sync_status ${whereClause} ORDER BY last_heartbeat DESC`,
      params,
    );

    return result.rows;
  }

  /**
   * Get dashboard summary for Owner
   */
  async getOwnerDashboardSummary(): Promise<any> {
    const today = new Date();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      salesSummary,
      loyaltySummary,
      offlineStatus,
      syncStatus,
      lowStock,
      stockouts,
    ] = await Promise.all([
      this.getSalesKPISummary({
        business_date_from: weekAgo,
        business_date_to: today,
      }),
      this.getLoyaltyKPIs({
        business_date_from: weekAgo,
        business_date_to: today,
        limit: 7,
      }),
      this.getOfflineQueueStatus(),
      this.getStoreSyncStatus(),
      this.getLowStockCount(),
      this.getStockoutCount(),
    ]);

    const loyaltyTotal = loyaltySummary.reduce(
      (acc, row) => ({
        earned: acc.earned + Number(row.total_earned),
        redeemed: acc.redeemed + Number(row.total_redeemed),
      }),
      { earned: 0, redeemed: 0 },
    );

    return {
      sales: salesSummary,
      loyalty: loyaltyTotal,
      offline_queue: offlineStatus,
      store_sync: syncStatus,
      inventory: {
        low_stock: lowStock.reduce(
          (sum, row) => sum + Number(row.low_stock_count),
          0,
        ),
        stockouts: stockouts.reduce(
          (sum, row) => sum + Number(row.stockout_count),
          0,
        ),
      },
      freshness: new Date(),
    };
  }

  /**
   * Get dashboard summary for Store Manager
   */
  async getStoreManagerDashboardSummary(storeId: string): Promise<any> {
    const today = new Date();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      salesKPIs,
      returnsKPIs,
      voidsKPIs,
      offlineStatus,
      lowStock,
      stockouts,
    ] = await Promise.all([
      this.getSalesKPIs({
        store_id: storeId,
        business_date_from: weekAgo,
        business_date_to: today,
        limit: 7,
      }),
      this.getReturnsKPIs({
        store_id: storeId,
        business_date_from: weekAgo,
        business_date_to: today,
        limit: 7,
      }),
      this.getVoidsKPIs({
        store_id: storeId,
        business_date_from: weekAgo,
        business_date_to: today,
        limit: 7,
      }),
      this.getOfflineQueueStatus(storeId),
      this.getLowStockCount(storeId),
      this.getStockoutCount(storeId),
    ]);

    return {
      sales: salesKPIs,
      returns: returnsKPIs,
      voids: voidsKPIs,
      offline_queue: offlineStatus,
      inventory: {
        low_stock:
          lowStock.length > 0 ? Number(lowStock[0].low_stock_count) : 0,
        stockouts:
          stockouts.length > 0 ? Number(stockouts[0].stockout_count) : 0,
      },
      freshness: new Date(),
    };
  }
}
