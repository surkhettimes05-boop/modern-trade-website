import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { DataFreshnessService } from "../dataFreshnessService.js";
import { query } from "../../database/connection.js";

jest.mock("../../database/connection.js");

describe("DataFreshnessService", () => {
  let freshnessService: DataFreshnessService;

  beforeEach(() => {
    freshnessService = new DataFreshnessService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("updateFreshness", () => {
    it("should update freshness record", async () => {
      const mockRecord = {
        id: "1",
        projection_name: "daily_sales_by_store",
        table_name: "mv_daily_sales_by_store",
        last_updated_at: new Date(),
        last_updated_by: "system",
        update_status: "SUCCESS",
        is_stale: false,
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockRecord] })
        .mockResolvedValueOnce({ rows: [mockRecord] });

      const result = await freshnessService.updateFreshness({
        projection_name: "daily_sales_by_store",
        table_name: "mv_daily_sales_by_store",
        last_updated_by: "system",
        update_status: "SUCCESS",
      });

      expect(result.projection_name).toBe("daily_sales_by_store");
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE data_freshness_tracking"),
        expect.any(Array),
      );
    });

    it("should throw error if projection not found", async () => {
      (query as jest.Mock).mockResolvedValue({ rows: [] });

      await expect(
        freshnessService.updateFreshness({
          projection_name: "nonexistent",
          table_name: "mv_nonexistent",
          last_updated_by: "system",
          update_status: "SUCCESS",
        }),
      ).rejects.toThrow("Projection not found");
    });
  });

  describe("getAllFreshness", () => {
    it("should get all freshness records", async () => {
      const mockRecords = [
        { projection_name: "daily_sales_by_store", is_stale: false },
        { projection_name: "daily_loyalty_metrics", is_stale: true },
      ];

      (query as jest.Mock).mockResolvedValue({ rows: mockRecords });

      const result = await freshnessService.getAllFreshness();

      expect(result).toEqual(mockRecords);
    });
  });

  describe("getFreshnessByProjection", () => {
    it("should get freshness record by projection name", async () => {
      const mockRecord = {
        projection_name: "daily_sales_by_store",
        is_stale: false,
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockRecord] });

      const result = await freshnessService.getFreshnessByProjection(
        "daily_sales_by_store",
      );

      expect(result).toEqual(mockRecord);
    });

    it("should return null if projection not found", async () => {
      (query as jest.Mock).mockResolvedValue({ rows: [] });

      const result =
        await freshnessService.getFreshnessByProjection("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getStaleProjections", () => {
    it("should get stale projections", async () => {
      const mockRecords = [
        { projection_name: "daily_loyalty_metrics", is_stale: true },
      ];

      (query as jest.Mock).mockResolvedValue({ rows: mockRecords });

      const result = await freshnessService.getStaleProjections();

      expect(result).toEqual(mockRecords);
    });
  });

  describe("refreshStaleness", () => {
    it("should refresh staleness for all projections", async () => {
      (query as jest.Mock).mockResolvedValue({
        rows: [{ id: "1" }, { id: "2" }],
      });

      const result = await freshnessService.refreshStaleness();

      expect(result).toBe(2);
    });
  });

  describe("getFreshnessSummary", () => {
    it("should get freshness summary", async () => {
      const mockSummary = {
        total_projections: 6,
        stale_count: 1,
        success_count: 5,
        failed_count: 0,
        in_progress_count: 0,
        avg_update_duration_ms: 1500,
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockSummary] });

      const result = await freshnessService.getFreshnessSummary();

      expect(result).toEqual(mockSummary);
    });
  });

  describe("createFreshnessRecord", () => {
    it("should create freshness record", async () => {
      const mockRecord = {
        id: "1",
        projection_name: "new_projection",
        table_name: "mv_new_projection",
        expected_refresh_interval_minutes: 60,
        is_stale: true,
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockRecord] });

      const result = await freshnessService.createFreshnessRecord(
        "new_projection",
        "mv_new_projection",
        60,
      );

      expect(result.projection_name).toBe("new_projection");
    });
  });

  describe("deleteFreshnessRecord", () => {
    it("should delete freshness record", async () => {
      (query as jest.Mock).mockResolvedValue({ rowCount: 1 });

      const result = await freshnessService.deleteFreshnessRecord(
        "daily_sales_by_store",
      );

      expect(result).toBe(true);
    });

    it("should return false if record not found", async () => {
      (query as jest.Mock).mockResolvedValue({ rowCount: 0 });

      const result =
        await freshnessService.deleteFreshnessRecord("nonexistent");

      expect(result).toBe(false);
    });
  });

  describe("updateRefreshInterval", () => {
    it("should update refresh interval", async () => {
      const mockRecord = {
        projection_name: "daily_sales_by_store",
        expected_refresh_interval_minutes: 30,
        stale_threshold_minutes: 60,
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockRecord] });

      const result = await freshnessService.updateRefreshInterval(
        "daily_sales_by_store",
        30,
        60,
      );

      expect(result.expected_refresh_interval_minutes).toBe(30);
    });
  });

  describe("markUpdateInProgress", () => {
    it("should mark update as in progress", async () => {
      const mockRecord = {
        projection_name: "daily_sales_by_store",
        update_status: "IN_PROGRESS",
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockRecord] });

      const result = await freshnessService.markUpdateInProgress(
        "daily_sales_by_store",
        "system",
      );

      expect(result.update_status).toBe("IN_PROGRESS");
    });
  });

  describe("getProjectionsNeedingRefresh", () => {
    it("should get projections needing refresh", async () => {
      const mockRecords = [
        { projection_name: "daily_sales_by_store", last_updated_at: null },
        { projection_name: "daily_loyalty_metrics", update_status: "FAILED" },
      ];

      (query as jest.Mock).mockResolvedValue({ rows: mockRecords });

      const result = await freshnessService.getProjectionsNeedingRefresh();

      expect(result).toEqual(mockRecords);
    });
  });
});
