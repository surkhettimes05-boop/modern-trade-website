import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { AlertService } from "../alertService.js";
import { query } from "../../database/connection.js";

// Mock the database connection
jest.mock("../../database/connection.js");

describe("AlertService", () => {
  let alertService: AlertService;

  beforeEach(() => {
    alertService = new AlertService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("createAlert", () => {
    it("should create a new alert", async () => {
      const mockAlert = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        alert_type: "SALES_ANOMALY",
        severity: "HIGH",
        entity_type: "STORE",
        entity_id: "store-123",
        store_id: "store-123",
        threshold_config: { threshold_percent: 50 },
        current_value: { current_sales: 1000 },
        message: "Sales anomaly detected",
        first_detected_at: new Date(),
        last_detected_at: new Date(),
        status: "OPEN",
        escalation_level: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockAlert] });

      const input = {
        alert_type: "SALES_ANOMALY",
        severity: "HIGH" as const,
        entity_type: "STORE",
        entity_id: "store-123",
        store_id: "store-123",
        threshold_config: { threshold_percent: 50 },
        current_value: { current_sales: 1000 },
        message: "Sales anomaly detected",
      };

      const result = await alertService.createAlert(input);

      expect(result).toEqual(mockAlert);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO alerts"),
        expect.arrayContaining([
          "SALES_ANOMALY",
          "HIGH",
          "STORE",
          "store-123",
          "store-123",
          expect.any(String),
          expect.any(String),
          "Sales anomaly detected",
          null,
          expect.any(String),
        ]),
      );
    });
  });

  describe("getAlerts", () => {
    it("should get alerts with filters", async () => {
      const mockAlerts = [
        {
          id: "1",
          alert_type: "SALES_ANOMALY",
          severity: "HIGH",
          status: "OPEN",
        },
        {
          id: "2",
          alert_type: "LOW_STOCK",
          severity: "MEDIUM",
          status: "OPEN",
        },
      ];

      (query as jest.Mock).mockResolvedValue({ rows: mockAlerts });

      const result = await alertService.getAlerts({
        severity: "HIGH",
        status: "OPEN",
      });

      expect(result).toEqual(mockAlerts);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT * FROM alerts"),
        expect.arrayContaining(["HIGH", "OPEN"]),
      );
    });

    it("should get all alerts when no filters provided", async () => {
      const mockAlerts = [{ id: "1", alert_type: "SALES_ANOMALY" }];

      (query as jest.Mock).mockResolvedValue({ rows: mockAlerts });

      const result = await alertService.getAlerts({});

      expect(result).toEqual(mockAlerts);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT * FROM alerts"),
        [],
      );
    });
  });

  describe("acknowledgeAlert", () => {
    it("should acknowledge an alert", async () => {
      const mockAlert = {
        id: "1",
        status: "ACKNOWLEDGED",
        acknowledged_by: "user-123",
        acknowledged_at: new Date(),
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockAlert] });

      const result = await alertService.acknowledgeAlert("1", "user-123");

      expect(result).toEqual(mockAlert);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE alerts"),
        expect.arrayContaining(["user-123", "1"]),
      );
    });

    it("should throw error if alert not found", async () => {
      (query as jest.Mock).mockResolvedValue({ rows: [] });

      await expect(
        alertService.acknowledgeAlert("1", "user-123"),
      ).rejects.toThrow("Alert not found");
    });
  });

  describe("resolveAlert", () => {
    it("should resolve an alert", async () => {
      const mockAlert = {
        id: "1",
        status: "RESOLVED",
        resolved_by: "user-123",
        resolved_at: new Date(),
        resolution_notes: "Issue fixed",
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockAlert] });

      const result = await alertService.resolveAlert(
        "1",
        "user-123",
        "Issue fixed",
      );

      expect(result).toEqual(mockAlert);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE alerts"),
        expect.arrayContaining(["user-123", "Issue fixed", "1"]),
      );
    });
  });

  describe("findExistingAlert", () => {
    it("should find existing alert by type and entity", async () => {
      const mockAlert = {
        id: "1",
        alert_type: "SALES_ANOMALY",
        entity_type: "STORE",
        entity_id: "store-123",
        status: "OPEN",
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockAlert] });

      const result = await alertService.findExistingAlert(
        "SALES_ANOMALY",
        "STORE",
        "store-123",
      );

      expect(result).toEqual(mockAlert);
    });

    it("should return null if no existing alert found", async () => {
      (query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await alertService.findExistingAlert(
        "SALES_ANOMALY",
        "STORE",
        "store-123",
      );

      expect(result).toBeNull();
    });
  });

  describe("autoResolveStaleAlerts", () => {
    it("should auto-resolve stale alerts", async () => {
      (query as jest.Mock).mockResolvedValue({
        rows: [{ id: "1" }, { id: "2" }],
      });

      const result = await alertService.autoResolveStaleAlerts(
        "SALES_ANOMALY",
        60,
      );

      expect(result).toBe(2);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE alerts"),
        expect.arrayContaining(["SALES_ANOMALY"]),
      );
    });
  });

  describe("getAlertStatistics", () => {
    it("should get alert statistics", async () => {
      const mockStats = [
        {
          alert_type: "SALES_ANOMALY",
          severity: "HIGH",
          status: "OPEN",
          count: 5,
        },
        {
          alert_type: "LOW_STOCK",
          severity: "MEDIUM",
          status: "OPEN",
          count: 3,
        },
      ];

      (query as jest.Mock).mockResolvedValue({ rows: mockStats });

      const result = await alertService.getAlertStatistics();

      expect(result).toEqual(mockStats);
    });
  });
});
