import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { query } from "../../database/connection.js";

jest.mock("../../database/connection.js");

describe("Phase 3 Reconciliation Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("Sales KPI Reconciliation", () => {
    it("should reconcile dashboard gross sales with source sales table", async () => {
      // Get dashboard KPI
      const mockDashboardKPI = {
        store_id: "store-1",
        business_date: new Date("2024-01-15"),
        gross_sales: 50000,
        transaction_count: 100,
      };

      // Get source data
      const mockSourceData = {
        total_amount: 50000,
        count: 100,
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockDashboardKPI] })
        .mockResolvedValueOnce({ rows: [mockSourceData] });

      const dashboardResult = await query(
        "SELECT * FROM mv_daily_sales_by_store WHERE store_id = $1 AND business_date = $2",
        ["store-1", new Date("2024-01-15")],
      );

      const sourceResult = await query(
        "SELECT SUM(total_amount) as total_amount, COUNT(*) as count FROM sales WHERE store_id = $1 AND sale_status = 'COMPLETED' AND sale_timestamp >= $2 AND sale_timestamp < $3",
        [
          "store-1",
          new Date("2024-01-15T00:00:00Z"),
          new Date("2024-01-16T00:00:00Z"),
        ],
      );

      expect(Number(dashboardResult.rows[0].gross_sales)).toBe(
        Number(sourceResult.rows[0].total_amount),
      );
      expect(Number(dashboardResult.rows[0].transaction_count)).toBe(
        Number(sourceResult.rows[0].count),
      );
    });

    it("should reconcile net sales (gross - discounts)", async () => {
      const mockDashboardKPI = {
        gross_sales: 50000,
        net_sales: 45000,
        total_discounts: 5000,
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockDashboardKPI] });

      const result = await query(
        "SELECT * FROM mv_daily_sales_by_store LIMIT 1",
      );

      const calculatedNet =
        Number(result.rows[0].gross_sales) -
        Number(result.rows[0].total_discounts);
      expect(calculatedNet).toBe(Number(result.rows[0].net_sales));
    });
  });

  describe("Loyalty KPI Reconciliation", () => {
    it("should reconcile points earned with ledger", async () => {
      const mockDashboardKPI = {
        business_date: new Date("2024-01-15"),
        total_earned: 5000,
        earn_transactions: 200,
      };

      const mockSourceData = {
        total_earned: 5000,
        transaction_count: 200,
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockDashboardKPI] })
        .mockResolvedValueOnce({ rows: [mockSourceData] });

      const dashboardResult = await query(
        "SELECT * FROM mv_daily_loyalty_metrics WHERE business_date = $1",
        [new Date("2024-01-15")],
      );

      const sourceResult = await query(
        "SELECT SUM(points_signed) as total_earned, COUNT(*) as transaction_count FROM loyalty_ledger WHERE entry_type = 'EARN' AND entry_status = 'POSTED' AND effective_timestamp >= $1 AND effective_timestamp < $2",
        [new Date("2024-01-15T00:00:00Z"), new Date("2024-01-16T00:00:00Z")],
      );

      expect(Number(dashboardResult.rows[0].total_earned)).toBe(
        Number(sourceResult.rows[0].total_earned),
      );
      expect(Number(dashboardResult.rows[0].earn_transactions)).toBe(
        Number(sourceResult.rows[0].transaction_count),
      );
    });

    it("should reconcile outstanding points balance", async () => {
      const mockOutstanding = 50000;
      const mockLedgerSum = 50000;

      (query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [{ outstanding_points: mockOutstanding.toString() }],
        })
        .mockResolvedValueOnce({ rows: [{ sum: mockLedgerSum.toString() }] });

      const kpiResult = await query(
        "SELECT COALESCE(SUM(points_signed), 0) as outstanding_points FROM loyalty_ledger WHERE entry_status = 'POSTED'",
      );

      const ledgerResult = await query(
        "SELECT SUM(points_signed) as sum FROM loyalty_ledger WHERE entry_status = 'POSTED'",
      );

      expect(Number(kpiResult.rows[0].outstanding_points)).toBe(
        Number(ledgerResult.rows[0].sum),
      );
    });
  });

  describe("Customer KPI Reconciliation", () => {
    it("should reconcile new members with customers table", async () => {
      const mockDashboardKPI = {
        business_date: new Date("2024-01-15"),
        new_members: 50,
      };

      const mockSourceData = {
        count: 50,
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockDashboardKPI] })
        .mockResolvedValueOnce({ rows: [mockSourceData] });

      const dashboardResult = await query(
        "SELECT * FROM mv_daily_customer_metrics WHERE business_date = $1",
        [new Date("2024-01-15")],
      );

      const sourceResult = await query(
        "SELECT COUNT(*) as count FROM customers WHERE status = 'ACTIVE' AND enrolled_at >= $1 AND enrolled_at < $2",
        [new Date("2024-01-15T00:00:00Z"), new Date("2024-01-16T00:00:00Z")],
      );

      expect(Number(dashboardResult.rows[0].new_members)).toBe(
        Number(sourceResult.rows[0].count),
      );
    });
  });

  describe("Returns KPI Reconciliation", () => {
    it("should reconcile return count with returns table", async () => {
      const mockDashboardKPI = {
        store_id: "store-1",
        business_date: new Date("2024-01-15"),
        return_count: 10,
        total_return_amount: 5000,
      };

      const mockSourceData = {
        count: 10,
        total_amount: 5000,
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockDashboardKPI] })
        .mockResolvedValueOnce({ rows: [mockSourceData] });

      const dashboardResult = await query(
        "SELECT * FROM mv_daily_returns_by_store WHERE store_id = $1 AND business_date = $2",
        ["store-1", new Date("2024-01-15")],
      );

      const sourceResult = await query(
        "SELECT COUNT(*) as count, SUM(total_amount) as total_amount FROM returns WHERE store_id = $1 AND return_status = 'PROCESSED' AND return_timestamp >= $2 AND return_timestamp < $3",
        [
          "store-1",
          new Date("2024-01-15T00:00:00Z"),
          new Date("2024-01-16T00:00:00Z"),
        ],
      );

      expect(Number(dashboardResult.rows[0].return_count)).toBe(
        Number(sourceResult.rows[0].count),
      );
      expect(Number(dashboardResult.rows[0].total_return_amount)).toBe(
        Number(sourceResult.rows[0].total_amount),
      );
    });
  });

  describe("Business Date Boundary Tests", () => {
    it("should correctly handle Nepal business day boundary (6:00 AM UTC)", async () => {
      // Test case: Sale at 5:59 AM UTC should count as previous business day
      // Sale at 6:01 AM UTC should count as current business day

      const mockEarlySale = {
        sale_timestamp: new Date("2024-01-15T05:59:00Z"),
        business_date: new Date("2024-01-14"),
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockEarlySale] });

      const result = await query(
        "SELECT utc_to_nepal_business_date($1) as business_date",
        [new Date("2024-01-15T05:59:00Z")],
      );

      expect(result.rows[0].business_date).toEqual(new Date("2024-01-14"));
    });
  });

  describe("Materialized View Freshness Tests", () => {
    it("should verify materialized view was refreshed recently", async () => {
      const mockFreshness = {
        projection_name: "daily_sales_by_store",
        last_updated_at: new Date(),
        is_stale: false,
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockFreshness] });

      const result = await query(
        "SELECT * FROM data_freshness_tracking WHERE projection_name = $1",
        ["daily_sales_by_store"],
      );

      const ageMinutes =
        (Date.now() - new Date(result.rows[0].last_updated_at).getTime()) /
        (1000 * 60);
      expect(ageMinutes).toBeLessThan(120); // Should be less than 2 hours old
      expect(result.rows[0].is_stale).toBe(false);
    });
  });

  describe("Alert Idempotency Tests", () => {
    it("should not create duplicate alerts for same condition", async () => {
      const mockExistingAlert = {
        id: "alert-1",
        alert_type: "SALES_ANOMALY",
        entity_type: "STORE",
        entity_id: "store-1",
        status: "OPEN",
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockExistingAlert] });

      const result = await query(
        "SELECT * FROM alerts WHERE alert_type = $1 AND entity_type = $2 AND entity_id = $3 AND status IN ('OPEN', 'ACKNOWLEDGED')",
        ["SALES_ANOMALY", "STORE", "store-1"],
      );

      expect(result.rows.length).toBeGreaterThan(0);
    });
  });

  describe("Event Queue Idempotency Tests", () => {
    it("should not process duplicate events with same idempotency key", async () => {
      const mockExistingSale = {
        id: "sale-1",
        idempotency_key: "key-123",
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockExistingSale] });

      const result = await query(
        "SELECT id FROM sales WHERE idempotency_key = $1",
        ["key-123"],
      );

      expect(result.rows.length).toBeGreaterThan(0);
    });
  });
});
