import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { KPIService } from "../kpiService.js";
import { query } from "../../database/connection.js";

jest.mock("../../database/connection.js");

describe("KPIService", () => {
  let kpiService: KPIService;

  beforeEach(() => {
    kpiService = new KPIService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("getSalesKPIs", () => {
    it("should get sales KPIs with filters", async () => {
      const mockKPIs = [
        {
          store_id: "store-1",
          business_date: new Date("2024-01-15"),
          transaction_count: 100,
          gross_sales: 50000,
          net_sales: 45000,
          total_discounts: 5000,
          avg_basket_value: 450,
          total_points_earned: 1000,
          total_points_redeemed: 200,
          customer_count: 80,
          identified_sales: 70,
        },
      ];

      (query as jest.Mock).mockResolvedValue({ rows: mockKPIs });

      const result = await kpiService.getSalesKPIs({
        store_id: "store-1",
        business_date_from: new Date("2024-01-01"),
        business_date_to: new Date("2024-01-31"),
      });

      expect(result).toEqual(mockKPIs);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT * FROM mv_daily_sales_by_store"),
        expect.arrayContaining(["store-1", expect.any(Date), expect.any(Date)]),
      );
    });

    it("should get all sales KPIs when no filters provided", async () => {
      const mockKPIs = [{ store_id: "store-1", transaction_count: 100 }];

      (query as jest.Mock).mockResolvedValue({ rows: mockKPIs });

      const result = await kpiService.getSalesKPIs({});

      expect(result).toEqual(mockKPIs);
    });
  });

  describe("getSalesKPISummary", () => {
    it("should get sales summary across all stores", async () => {
      const mockSummary = {
        total_transactions: 1000,
        total_transaction_count: 1000,
        total_gross_sales: 500000,
        total_net_sales: 450000,
        total_discounts: 50000,
        avg_basket_value: 450,
        total_points_earned: 10000,
        total_points_redeemed: 2000,
        store_count: 5,
        total_customer_count: 800,
        total_identified_sales: 700,
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockSummary] });

      const result = await kpiService.getSalesKPISummary({
        business_date_from: new Date("2024-01-01"),
        business_date_to: new Date("2024-01-31"),
      });

      expect(result).toEqual(mockSummary);
    });
  });

  describe("getLoyaltyKPIs", () => {
    it("should get loyalty KPIs", async () => {
      const mockKPIs = [
        {
          business_date: new Date("2024-01-15"),
          total_earned: 5000,
          total_redeemed: 1000,
          total_expired: 200,
          total_adjusted: 50,
          earn_transactions: 200,
          redeem_transactions: 50,
          active_customers: 150,
        },
      ];

      (query as jest.Mock).mockResolvedValue({ rows: mockKPIs });

      const result = await kpiService.getLoyaltyKPIs({
        business_date_from: new Date("2024-01-01"),
        business_date_to: new Date("2024-01-31"),
      });

      expect(result).toEqual(mockKPIs);
    });
  });

  describe("getOutstandingPoints", () => {
    it("should get outstanding points balance", async () => {
      (query as jest.Mock).mockResolvedValue({
        rows: [{ outstanding_points: "50000" }],
      });

      const result = await kpiService.getOutstandingPoints();

      expect(result).toBe(50000);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT COALESCE(SUM(points_signed), 0)"),
      );
    });
  });

  describe("getExpiringPoints", () => {
    it("should get points expiring in next 30 days", async () => {
      (query as jest.Mock).mockResolvedValue({
        rows: [{ expiring_points: "5000" }],
      });

      const result = await kpiService.getExpiringPoints(30);

      expect(result).toBe(5000);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT COALESCE(SUM(remaining_points), 0)"),
      );
    });
  });

  describe("getIdentifiedSalesRate", () => {
    it("should calculate identified sales rate", async () => {
      (query as jest.Mock).mockResolvedValue({
        rows: [{ identified_rate: "75.5" }],
      });

      const result = await kpiService.getIdentifiedSalesRate({
        business_date_from: new Date("2024-01-01"),
        business_date_to: new Date("2024-01-31"),
      });

      expect(result).toBe(75.5);
    });

    it("should return 0 when no transactions", async () => {
      (query as jest.Mock).mockResolvedValue({
        rows: [{ identified_rate: "0" }],
      });

      const result = await kpiService.getIdentifiedSalesRate({});

      expect(result).toBe(0);
    });
  });

  describe("getReturnVoidRate", () => {
    it("should calculate return and void rates", async () => {
      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ total_transactions: "1000" }] })
        .mockResolvedValueOnce({ rows: [{ total_returns: "50" }] })
        .mockResolvedValueOnce({ rows: [{ total_voids: "20" }] });

      const result = await kpiService.getReturnVoidRate({
        business_date_from: new Date("2024-01-01"),
        business_date_to: new Date("2024-01-31"),
      });

      expect(result.return_rate).toBe(5);
      expect(result.void_rate).toBe(2);
    });
  });

  describe("getLowStockCount", () => {
    it("should get low stock count by store", async () => {
      const mockCounts = [
        { store_id: "store-1", low_stock_count: 10 },
        { store_id: "store-2", low_stock_count: 5 },
      ];

      (query as jest.Mock).mockResolvedValue({ rows: mockCounts });

      const result = await kpiService.getLowStockCount();

      expect(result).toEqual(mockCounts);
    });

    it("should filter by store_id when provided", async () => {
      const mockCounts = [{ store_id: "store-1", low_stock_count: 10 }];

      (query as jest.Mock).mockResolvedValue({ rows: mockCounts });

      const result = await kpiService.getLowStockCount("store-1");

      expect(result).toEqual(mockCounts);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("store_id ="),
        expect.arrayContaining(["store-1"]),
      );
    });
  });

  describe("getStockoutCount", () => {
    it("should get stockout count by store", async () => {
      const mockCounts = [
        { store_id: "store-1", stockout_count: 3 },
        { store_id: "store-2", stockout_count: 1 },
      ];

      (query as jest.Mock).mockResolvedValue({ rows: mockCounts });

      const result = await kpiService.getStockoutCount();

      expect(result).toEqual(mockCounts);
    });
  });

  describe("getOfflineQueueStatus", () => {
    it("should get offline queue status", async () => {
      const mockStatus = {
        pending_count: 50,
        pending_points: "5000",
        oldest_pending_at: new Date("2024-01-15"),
        newest_pending_at: new Date("2024-01-16"),
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockStatus] });

      const result = await kpiService.getOfflineQueueStatus();

      expect(result).toEqual(mockStatus);
    });
  });

  describe("getStoreSyncStatus", () => {
    it("should get store sync status", async () => {
      const mockStatus = [
        {
          store_id: "store-1",
          sync_type: "FULL",
          last_successful_sync: new Date("2024-01-15"),
          last_sync_status: "SUCCESS",
          is_online: true,
        },
      ];

      (query as jest.Mock).mockResolvedValue({ rows: mockStatus });

      const result = await kpiService.getStoreSyncStatus();

      expect(result).toEqual(mockStatus);
    });
  });

  describe("getOwnerDashboardSummary", () => {
    it("should get owner dashboard summary", async () => {
      const mockSalesSummary = { total_gross_sales: 500000, store_count: 5 };
      const mockLoyaltySummary = [{ total_earned: 5000, total_redeemed: 1000 }];
      const mockOfflineStatus = { pending_count: 10 };
      const mockSyncStatus = [{ store_id: "store-1" }];
      const mockLowStock = [{ low_stock_count: 10 }];
      const mockStockouts = [{ stockout_count: 3 }];

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockSalesSummary] })
        .mockResolvedValueOnce({ rows: mockLoyaltySummary })
        .mockResolvedValueOnce({ rows: [mockOfflineStatus] })
        .mockResolvedValueOnce({ rows: mockSyncStatus })
        .mockResolvedValueOnce({ rows: mockLowStock })
        .mockResolvedValueOnce({ rows: mockStockouts });

      const result = await kpiService.getOwnerDashboardSummary();

      expect(result.sales).toEqual(mockSalesSummary);
      expect(result.loyalty).toEqual({ earned: 5000, redeemed: 1000 });
      expect(result.offline_queue).toEqual(mockOfflineStatus);
    });
  });

  describe("getStoreManagerDashboardSummary", () => {
    it("should get store manager dashboard summary", async () => {
      const mockSalesKPIs = [{ store_id: "store-1", transaction_count: 100 }];
      const mockReturnsKPIs = [{ store_id: "store-1", return_count: 5 }];
      const mockVoidsKPIs = [{ store_id: "store-1", void_count: 2 }];
      const mockOfflineStatus = { pending_count: 5 };
      const mockLowStock = [{ low_stock_count: 5 }];
      const mockStockouts = [{ stockout_count: 1 }];

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: mockSalesKPIs })
        .mockResolvedValueOnce({ rows: mockReturnsKPIs })
        .mockResolvedValueOnce({ rows: mockVoidsKPIs })
        .mockResolvedValueOnce({ rows: [mockOfflineStatus] })
        .mockResolvedValueOnce({ rows: mockLowStock })
        .mockResolvedValueOnce({ rows: mockStockouts });

      const result =
        await kpiService.getStoreManagerDashboardSummary("store-1");

      expect(result.sales).toEqual(mockSalesKPIs);
      expect(result.returns).toEqual(mockReturnsKPIs);
      expect(result.voids).toEqual(mockVoidsKPIs);
    });
  });
});
