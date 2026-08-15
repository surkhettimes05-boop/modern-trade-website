import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { AnalyticsPipelineService } from "../analyticsPipelineService.js";
import { query } from "../../database/connection.js";

jest.mock("../../database/connection.js");

describe("AnalyticsPipelineService", () => {
  let pipelineService: AnalyticsPipelineService;

  beforeEach(() => {
    pipelineService = new AnalyticsPipelineService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("addEvent", () => {
    it("should add event to queue", async () => {
      const mockEvent = { id: "event-1" };
      (query as jest.Mock).mockResolvedValue({ rows: [mockEvent] });

      const result = await pipelineService.addEvent(
        "SALE_CREATED",
        { sale_id: "123" },
        "POS",
        5,
      );

      expect(result).toBe("event-1");
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO event_queue"),
        expect.arrayContaining(["SALE_CREATED", expect.any(String), "POS", 5]),
      );
    });
  });

  describe("processNextEvent", () => {
    it("should process next pending event", async () => {
      const mockEvent = {
        id: "event-1",
        event_type: "SALE_COMPLETED",
        event_data: { sale_id: "123" },
        source_system: "POS",
        priority: 5,
        status: "PENDING",
        processing_attempts: 0,
        max_retries: 3,
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockEvent] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await pipelineService.processNextEvent();

      expect(result.success).toBe(true);
      expect(result.event_id).toBe("event-1");
    });

    it("should return no pending events when queue is empty", async () => {
      (query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await pipelineService.processNextEvent();

      expect(result.success).toBe(false);
      expect(result.error).toBe("No pending events");
    });

    it("should handle event processing failure with retry", async () => {
      const mockEvent = {
        id: "event-1",
        event_type: "SALE_COMPLETED",
        event_data: { sale_id: "123" },
        processing_attempts: 0,
        max_retries: 3,
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockEvent] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      jest
        .spyOn(pipelineService as any, "processEventByType")
        .mockRejectedValue(new Error("Processing failed"));

      const result = await pipelineService.processNextEvent();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Processing failed");
      expect(query).toHaveBeenLastCalledWith(
        expect.stringContaining("status = 'RETRY'"),
        expect.arrayContaining([
          "Processing failed",
          expect.any(Date),
          "event-1",
        ]),
      );
    });
  });

  describe("processBatch", () => {
    it("should process batch of events", async () => {
      jest
        .spyOn(pipelineService, "processNextEvent")
        .mockResolvedValueOnce({ success: true, event_id: "event-1" })
        .mockResolvedValueOnce({
          success: false,
          event_id: "",
          error: "No pending events",
        });

      const result = await pipelineService.processBatch(2);

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
      expect(pipelineService.processNextEvent).toHaveBeenCalledTimes(2);
    });
  });

  describe("getQueueStatistics", () => {
    it("should get queue statistics", async () => {
      const mockStats = [
        { status: "PENDING", count: 10 },
        { status: "PROCESSING", count: 2 },
        { status: "PROCESSED", count: 100 },
      ];

      (query as jest.Mock).mockResolvedValue({ rows: mockStats });

      const result = await pipelineService.getQueueStatistics();

      expect(result).toEqual(mockStats);
    });
  });

  describe("replayFailedEvents", () => {
    it("should replay failed events", async () => {
      (query as jest.Mock).mockResolvedValue({ rows: [{ id: "event-1" }] });

      const result = await pipelineService.replayFailedEvents(["event-1"]);

      expect(result.replayed).toBe(1);
      expect(result.failed).toBe(0);
    });
  });

  describe("cleanupOldEvents", () => {
    it("should cleanup old processed events", async () => {
      (query as jest.Mock).mockResolvedValue({ rowCount: 50 });

      const result = await pipelineService.cleanupOldEvents(30);

      expect(result).toBe(50);
    });
  });

  describe("getStuckEvents", () => {
    it("should get stuck events", async () => {
      const mockEvents = [
        {
          id: "event-1",
          status: "PROCESSING",
          processing_started_at: new Date(Date.now() - 60 * 60 * 1000),
        },
      ];

      (query as jest.Mock).mockResolvedValue({ rows: mockEvents });

      const result = await pipelineService.getStuckEvents(30);

      expect(result).toEqual(mockEvents);
    });
  });

  describe("resetStuckEvents", () => {
    it("should reset stuck events to pending", async () => {
      (query as jest.Mock).mockResolvedValue({ rowCount: 5 });

      const result = await pipelineService.resetStuckEvents(30);

      expect(result).toBe(5);
    });
  });
});
