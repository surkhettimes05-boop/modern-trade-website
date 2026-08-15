import { query } from "../database/connection.js";
import { AlertService } from "./alertService.js";

const alertService = new AlertService();

export class AlertRuleService {
  /**
   * Check sales anomaly alert
   */
  async checkSalesAnomaly(storeId?: string): Promise<void> {
    // Compare today's sales with same weekday last week
    const result = await query(
      `SELECT 
        store_id,
        business_date,
        SUM(gross_sales) as daily_sales
      FROM mv_daily_sales_by_store
      WHERE business_date >= CURRENT_DATE - INTERVAL '7 days'
        AND ($1::uuid IS NULL OR store_id = $1)
      GROUP BY store_id, business_date
      ORDER BY business_date DESC`,
      [storeId || null],
    );

    // Simple anomaly detection: if today's sales are < 50% of average of previous 7 days
    const salesByDate = result.rows;
    if (salesByDate.length < 8) return; // Not enough data

    const todaySales = salesByDate[0];
    const previousWeekSales = salesByDate.slice(1, 8);
    const avgPreviousSales =
      previousWeekSales.reduce((sum, row) => sum + Number(row.daily_sales), 0) /
      previousWeekSales.length;

    if (Number(todaySales.daily_sales) < avgPreviousSales * 0.5) {
      // Check if alert already exists
      const existing = await alertService.findExistingAlert(
        "SALES_ANOMALY",
        "STORE",
        todaySales.store_id,
      );

      if (existing) {
        await alertService.updateAlert(existing.id, {
          current_sales: todaySales.daily_sales,
          avg_previous_sales: avgPreviousSales,
        });
      } else {
        await alertService.createAlert({
          alert_type: "SALES_ANOMALY",
          severity: "HIGH",
          entity_type: "STORE",
          entity_id: todaySales.store_id,
          store_id: todaySales.store_id,
          threshold_config: { threshold_percent: 50 },
          current_value: {
            current_sales: todaySales.daily_sales,
            avg_previous_sales: avgPreviousSales,
          },
          message: `Sales anomaly detected: Today's sales (${todaySales.daily_sales}) are less than 50% of 7-day average (${avgPreviousSales.toFixed(2)})`,
          link_to_records: `/dashboard/sales?store=${todaySales.store_id}`,
        });
      }
    }
  }

  /**
   * Check return/void spike alert
   */
  async checkReturnVoidSpike(storeId?: string): Promise<void> {
    const result = await query(
      `SELECT 
        store_id,
        business_date,
        transaction_count,
        (SELECT COUNT(*) FROM mv_daily_returns_by_store r WHERE r.store_id = s.store_id AND r.business_date = s.business_date) as return_count,
        (SELECT COUNT(*) FROM mv_daily_voids_by_store v WHERE v.store_id = s.store_id AND v.business_date = s.business_date) as void_count
      FROM mv_daily_sales_by_store s
      WHERE business_date >= CURRENT_DATE - INTERVAL '7 days'
        AND ($1::uuid IS NULL OR store_id = $1)
      ORDER BY business_date DESC
      LIMIT 1`,
      [storeId || null],
    );

    if (result.rows.length === 0) return;

    const today = result.rows[0];
    const returnRate =
      today.transaction_count > 0
        ? (Number(today.return_count) / today.transaction_count) * 100
        : 0;
    const voidRate =
      today.transaction_count > 0
        ? (Number(today.void_count) / today.transaction_count) * 100
        : 0;

    const threshold = 10; // 10% threshold

    if (returnRate > threshold || voidRate > threshold) {
      const existing = await alertService.findExistingAlert(
        "RETURN_VOID_SPIKE",
        "STORE",
        today.store_id,
      );

      if (existing) {
        await alertService.updateAlert(existing.id, {
          return_rate: returnRate,
          void_rate: voidRate,
        });
      } else {
        await alertService.createAlert({
          alert_type: "RETURN_VOID_SPIKE",
          severity: "HIGH",
          entity_type: "STORE",
          entity_id: today.store_id,
          store_id: today.store_id,
          threshold_config: { threshold_percent: 10 },
          current_value: { return_rate: returnRate, void_rate: voidRate },
          message: `Return/void spike detected: Return rate ${returnRate.toFixed(2)}%, Void rate ${voidRate.toFixed(2)}% (threshold: ${threshold}%)`,
          link_to_records: `/dashboard/operations?store=${today.store_id}`,
        });
      }
    }
  }

  /**
   * Check excessive discount alert
   */
  async checkExcessiveDiscount(storeId?: string): Promise<void> {
    const result = await query(
      `SELECT 
        store_id,
        business_date,
        SUM(total_discounts) as total_discounts,
        SUM(gross_sales) as gross_sales,
        (SUM(total_discounts) / NULLIF(SUM(gross_sales), 0)) * 100 as discount_rate
      FROM mv_daily_sales_by_store
      WHERE business_date = CURRENT_DATE
        AND ($1::uuid IS NULL OR store_id = $1)
      GROUP BY store_id, business_date`,
      [storeId || null],
    );

    const threshold = 20; // 20% threshold

    for (const row of result.rows) {
      if (Number(row.discount_rate) > threshold) {
        const existing = await alertService.findExistingAlert(
          "EXCESSIVE_DISCOUNT",
          "STORE",
          row.store_id,
        );

        if (existing) {
          await alertService.updateAlert(existing.id, {
            discount_rate: row.discount_rate,
          });
        } else {
          await alertService.createAlert({
            alert_type: "EXCESSIVE_DISCOUNT",
            severity: "MEDIUM",
            entity_type: "STORE",
            entity_id: row.store_id,
            store_id: row.store_id,
            threshold_config: { threshold_percent: 20 },
            current_value: { discount_rate: row.discount_rate },
            message: `Excessive discount detected: ${row.discount_rate.toFixed(2)}% (threshold: ${threshold}%)`,
            link_to_records: `/dashboard/sales?store=${row.store_id}`,
          });
        }
      }
    }
  }

  /**
   * Check low stock alert
   */
  async checkLowStock(storeId?: string): Promise<void> {
    const result = await query(
      `SELECT 
        store_id,
        COUNT(*) as low_stock_count
      FROM store_product_availability
      WHERE availability_status = 'LOW_STOCK'
        AND ($1::uuid IS NULL OR store_id = $1)
      GROUP BY store_id`,
      [storeId || null],
    );

    const threshold = 10; // Alert if more than 10 products are low stock

    for (const row of result.rows) {
      if (Number(row.low_stock_count) > threshold) {
        const existing = await alertService.findExistingAlert(
          "LOW_STOCK",
          "STORE",
          row.store_id,
        );

        if (existing) {
          await alertService.updateAlert(existing.id, {
            low_stock_count: row.low_stock_count,
          });
        } else {
          await alertService.createAlert({
            alert_type: "LOW_STOCK",
            severity: "MEDIUM",
            entity_type: "STORE",
            entity_id: row.store_id,
            store_id: row.store_id,
            threshold_config: { threshold_count: 10 },
            current_value: { low_stock_count: row.low_stock_count },
            message: `Low stock alert: ${row.low_stock_count} products are low stock (threshold: ${threshold})`,
            link_to_records: `/dashboard/inventory?store=${row.store_id}`,
          });
        }
      }
    }
  }

  /**
   * Check stockout alert
   */
  async checkStockout(storeId?: string): Promise<void> {
    const result = await query(
      `SELECT 
        store_id,
        COUNT(*) as stockout_count
      FROM store_product_availability
      WHERE availability_status = 'OUT_OF_STOCK'
        AND ($1::uuid IS NULL OR store_id = $1)
      GROUP BY store_id`,
      [storeId || null],
    );

    const threshold = 5; // Alert if more than 5 products are out of stock

    for (const row of result.rows) {
      if (Number(row.stockout_count) > threshold) {
        const existing = await alertService.findExistingAlert(
          "STOCKOUT",
          "STORE",
          row.store_id,
        );

        if (existing) {
          await alertService.updateAlert(existing.id, {
            stockout_count: row.stockout_count,
          });
        } else {
          await alertService.createAlert({
            alert_type: "STOCKOUT",
            severity: "HIGH",
            entity_type: "STORE",
            entity_id: row.store_id,
            store_id: row.store_id,
            threshold_config: { threshold_count: 5 },
            current_value: { stockout_count: row.stockout_count },
            message: `Stockout alert: ${row.stockout_count} products are out of stock (threshold: ${threshold})`,
            link_to_records: `/dashboard/inventory?store=${row.store_id}`,
          });
        }
      }
    }
  }

  /**
   * Check offline queue age alert
   */
  async checkOfflineQueueAge(): Promise<void> {
    const result = await query(
      `SELECT 
        store_id,
        device_id,
        COUNT(*) FILTER (WHERE queue_status = 'PENDING') as pending_count,
        MIN(created_at) as oldest_created_at
      FROM offline_earn_queue
      WHERE queue_status = 'PENDING'
      GROUP BY store_id, device_id`,
    );

    const thresholdHours = 24; // Alert if pending for more than 24 hours

    for (const row of result.rows) {
      const ageHours = row.oldest_created_at
        ? (Date.now() - new Date(row.oldest_created_at).getTime()) /
          (1000 * 60 * 60)
        : 0;

      if (ageHours > thresholdHours) {
        const existing = await alertService.findExistingAlert(
          "OFFLINE_QUEUE_AGE",
          "DEVICE",
          row.device_id,
          row.store_id,
        );

        if (existing) {
          await alertService.updateAlert(existing.id, {
            age_hours: ageHours,
            pending_count: row.pending_count,
          });
        } else {
          await alertService.createAlert({
            alert_type: "OFFLINE_QUEUE_AGE",
            severity: "HIGH",
            entity_type: "DEVICE",
            entity_id: row.device_id,
            store_id: row.store_id,
            threshold_config: { threshold_hours: 24 },
            current_value: {
              age_hours: ageHours.toFixed(2),
              pending_count: row.pending_count,
            },
            message: `Offline queue age alert: Oldest transaction is ${ageHours.toFixed(2)} hours old (threshold: ${thresholdHours}h)`,
            link_to_records: `/dashboard/system?store=${row.store_id}`,
          });
        }
      }
    }
  }

  /**
   * Check negative balance alert
   */
  async checkNegativeBalance(): Promise<void> {
    const result = await query(
      `SELECT 
        customer_id,
        SUM(points_signed) as balance
      FROM loyalty_ledger
      WHERE entry_status = 'POSTED'
      GROUP BY customer_id
      HAVING SUM(points_signed) < 0`,
    );

    for (const row of result.rows) {
      const existing = await alertService.findExistingAlert(
        "NEGATIVE_BALANCE",
        "CUSTOMER",
        row.customer_id,
      );

      if (existing) {
        await alertService.updateAlert(existing.id, { balance: row.balance });
      } else {
        await alertService.createAlert({
          alert_type: "NEGATIVE_BALANCE",
          severity: "CRITICAL",
          entity_type: "CUSTOMER",
          entity_id: row.customer_id,
          threshold_config: { min_balance: 0 },
          current_value: { balance: row.balance },
          message: `Negative balance detected: Customer has ${row.balance} points`,
          link_to_records: `/dashboard/loyalty?customer=${row.customer_id}`,
        });
      }
    }
  }

  /**
   * Check stale location data alert
   */
  async checkStaleLocationData(): Promise<void> {
    const result = await query(
      `SELECT 
        store_id,
        last_heartbeat,
        EXTRACT(EPOCH FROM (NOW() - last_heartbeat)) / 60 as minutes_since_heartbeat
      FROM store_sync_status
      WHERE last_heartbeat < NOW() - INTERVAL '30 minutes'
        AND is_online = TRUE`,
    );

    for (const row of result.rows) {
      const existing = await alertService.findExistingAlert(
        "STALE_LOCATION_DATA",
        "STORE",
        row.store_id,
      );

      if (existing) {
        await alertService.updateAlert(existing.id, {
          minutes_since_heartbeat: row.minutes_since_heartbeat,
        });
      } else {
        await alertService.createAlert({
          alert_type: "STALE_LOCATION_DATA",
          severity: "HIGH",
          entity_type: "STORE",
          entity_id: row.store_id,
          store_id: row.store_id,
          threshold_config: { stale_minutes: 30 },
          current_value: {
            minutes_since_heartbeat: row.minutes_since_heartbeat,
          },
          message: `Stale location data: Last heartbeat was ${row.minutes_since_heartbeat.toFixed(0)} minutes ago`,
          link_to_records: `/dashboard/system?store=${row.store_id}`,
        });
      }
    }
  }

  /**
   * Run all alert checks
   */
  async runAllAlertChecks(
    storeId?: string,
  ): Promise<{ checks_run: number; alerts_created: number }> {
    let checksRun = 0;
    let alertsCreated = 0;

    const checks = [
      () => this.checkSalesAnomaly(storeId),
      () => this.checkReturnVoidSpike(storeId),
      () => this.checkExcessiveDiscount(storeId),
      () => this.checkLowStock(storeId),
      () => this.checkStockout(storeId),
      () => this.checkOfflineQueueAge(),
      () => this.checkNegativeBalance(),
      () => this.checkStaleLocationData(),
    ];

    for (const check of checks) {
      try {
        const beforeCount = await alertService.getAlerts({ status: "OPEN" });
        await check();
        const afterCount = await alertService.getAlerts({ status: "OPEN" });
        alertsCreated += afterCount.length - beforeCount.length;
        checksRun++;
      } catch (error) {
        console.error(`Alert check failed: ${error}`);
      }
    }

    // Auto-resolve stale alerts
    await this.autoResolveStaleAlerts();

    return { checks_run: checksRun, alerts_created: alertsCreated };
  }

  /**
   * Auto-resolve stale alerts
   */
  private async autoResolveStaleAlerts(): Promise<void> {
    const alertTypes = [
      "SALES_ANOMALY",
      "RETURN_VOID_SPIKE",
      "EXCESSIVE_DISCOUNT",
      "LOW_STOCK",
      "STOCKOUT",
    ];

    for (const alertType of alertTypes) {
      await alertService.autoResolveStaleAlerts(alertType, 60); // 60 minutes stale threshold
    }
  }
}
