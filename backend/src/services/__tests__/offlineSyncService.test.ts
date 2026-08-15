import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { OfflineSyncService } from "../offlineSyncService.js";
import { query } from "../../database/connection.js";

jest.mock("../../database/connection.js");

describe("OfflineSyncService", () => {
  let offlineSyncService: OfflineSyncService;

  beforeEach(() => {
    offlineSyncService = new OfflineSyncService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("registerDevice", () => {
    it("should register a new device", async () => {
      const mockDevice = {
        id: "device-uuid",
        device_id: "POS-001",
        device_name: "Store POS 1",
        device_type: "POS",
        store_id: "store-uuid",
        serial_number: "SN12345",
        status: "ACTIVE",
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockDevice] });

      const result = await offlineSyncService.registerDevice({
        device_id: "POS-001",
        device_name: "Store POS 1",
        device_type: "POS",
        store_id: "store-uuid",
        serial_number: "SN12345",
      });

      expect(result.device_id).toBe("POS-001");
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO devices"),
        expect.any(Array),
      );
    });

    it("should update existing device", async () => {
      const mockDevice = {
        id: "device-uuid",
        device_id: "POS-001",
        device_name: "Store POS 1 Updated",
        device_type: "POS",
        store_id: "store-uuid",
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockDevice] });

      const result = await offlineSyncService.registerDevice({
        device_id: "POS-001",
        device_name: "Store POS 1 Updated",
        device_type: "POS",
        store_id: "store-uuid",
      });

      expect(result.device_id).toBe("POS-001");
    });
  });

  describe("getDevice", () => {
    it("should get device by device_id", async () => {
      const mockDevice = {
        id: "device-uuid",
        device_id: "POS-001",
        device_name: "Store POS 1",
        device_type: "POS",
        store_id: "store-uuid",
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockDevice] });

      const result = await offlineSyncService.getDevice("POS-001");

      expect(result).toEqual(mockDevice);
    });

    it("should return null if device not found", async () => {
      (query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await offlineSyncService.getDevice("NONEXISTENT");

      expect(result).toBeNull();
    });
  });

  describe("addTransaction", () => {
    it("should add transaction to offline queue", async () => {
      const mockTransaction = {
        id: "transaction-uuid",
        transaction_uuid: expect.any(String),
        device_id: "POS-001",
        store_id: "store-uuid",
        transaction_type: "SALE",
        local_sequence_number: 1,
        sync_status: "PENDING",
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockTransaction] });

      const result = await offlineSyncService.addTransaction({
        device_id: "POS-001",
        store_id: "store-uuid",
        transaction_type: "SALE",
        local_sequence_number: BigInt(1),
        original_occurrence_timestamp: new Date(),
        device_clock_timestamp: new Date(),
        reference_data_versions: {},
        transaction_data: { total_amount: 1000 },
      });

      expect(result).toBe("transaction-uuid");
    });
  });

  describe("getPendingTransactions", () => {
    it("should get pending transactions for device", async () => {
      const mockTransactions = [
        {
          id: "tx-1",
          transaction_uuid: "uuid-1",
          device_id: "POS-001",
          transaction_type: "SALE",
          local_sequence_number: 1,
          sync_status: "PENDING",
          transaction_data: (offlineSyncService as any).encrypt({
            total_amount: 1000,
          }),
        },
      ];

      (query as jest.Mock).mockResolvedValue({ rows: mockTransactions });

      const result = await offlineSyncService.getPendingTransactions(
        "POS-001",
        100,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "tx-1",
        device_id: "POS-001",
        sync_status: "PENDING",
      });
      expect(result[0].transaction_data).toEqual({ total_amount: 1000 });
    });
  });

  describe("createSyncBatch", () => {
    it("should create sync batch", async () => {
      const mockDevice = {
        id: "device-uuid",
        device_id: "POS-001",
        store_id: "store-uuid",
      };

      const mockTransactions = [
        {
          id: "tx-1",
          local_sequence_number: 1,
          transaction_uuid: "uuid-1",
          checksum: "hash1",
        },
        {
          id: "tx-2",
          local_sequence_number: 2,
          transaction_uuid: "uuid-2",
          checksum: "hash2",
        },
      ];

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockDevice] })
        .mockResolvedValueOnce({ rows: mockTransactions })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await offlineSyncService.createSyncBatch("POS-001", [
        "tx-1",
        "tx-2",
      ]);

      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });

    it("should throw error if device not found", async () => {
      (query as jest.Mock).mockResolvedValue({ rows: [] });

      await expect(
        offlineSyncService.createSyncBatch("NONEXISTENT", ["tx-1"]),
      ).rejects.toThrow("Device not found");
    });
  });

  describe("processSyncBatch", () => {
    it("should process sync batch successfully", async () => {
      const mockBatch = {
        batch_id: "batch-uuid",
        device_id: "POS-001",
        store_id: "store-uuid",
        first_sequence_number: 1,
        last_sequence_number: 2,
      };

      const mockTransactions = [
        {
          id: "tx-1",
          transaction_uuid: "uuid-1",
          device_id: "POS-001",
          transaction_type: "SALE",
          local_sequence_number: 1,
          transaction_data: { total_amount: 1000, idempotency_key: "key-1" },
        },
      ];

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockBatch] })
        .mockResolvedValueOnce({ rows: mockTransactions })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      jest
        .spyOn(offlineSyncService as any, "detectConflict")
        .mockResolvedValue(null);
      jest
        .spyOn(offlineSyncService as any, "processTransaction")
        .mockResolvedValue("sale-uuid");

      const result = await offlineSyncService.processSyncBatch("batch-uuid");

      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.conflicts).toBe(0);
      expect(
        (offlineSyncService as any).processTransaction,
      ).toHaveBeenCalledWith(mockTransactions[0]);
    });
  });

  describe("getDeviceSyncStatus", () => {
    it("should get device sync status", async () => {
      const mockStatus = {
        device_id: "POS-001",
        pending_count: 10,
        uploading_count: 2,
        acknowledged_count: 100,
        rejected_count: 0,
        conflict_count: 0,
        last_seen: new Date(),
      };

      (query as jest.Mock).mockResolvedValue({
        rows: [{ status: mockStatus }],
      });

      const result = await offlineSyncService.getDeviceSyncStatus("POS-001");

      expect(result).toEqual(mockStatus);
    });
  });

  describe("retryFailedTransactions", () => {
    it("should retry failed transactions", async () => {
      (query as jest.Mock).mockResolvedValue({ rowCount: 5 });

      const result =
        await offlineSyncService.retryFailedTransactions("POS-001");

      expect(result).toBe(5);
    });
  });

  describe("resolveConflict", () => {
    it("should resolve conflict", async () => {
      (query as jest.Mock).mockResolvedValue({ rows: [] });

      await offlineSyncService.resolveConflict(
        "tx-1",
        "IGNORE",
        "admin-user",
        "Duplicate transaction",
      );

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE offline_transaction_queue"),
        expect.arrayContaining([
          "IGNORE",
          "admin-user",
          "Duplicate transaction",
          "tx-1",
        ]),
      );
    });
  });

  describe("Encryption/Decryption", () => {
    it("should encrypt and decrypt data correctly", async () => {
      const testData = { total_amount: 1000, customer_id: "cust-123" };

      // Access private methods through the service instance
      const encrypted = (offlineSyncService as any).encrypt(testData);
      const decrypted = (offlineSyncService as any).decrypt(encrypted);

      expect(decrypted).toEqual(testData);
    });

    it("should calculate consistent checksum", async () => {
      const transactionUuid = "uuid-123";
      const deviceId = "POS-001";
      const sequenceNumber = BigInt(1);
      const data = { total_amount: 1000 };

      const checksum1 = (offlineSyncService as any).calculateChecksum(
        transactionUuid,
        deviceId,
        sequenceNumber,
        data,
      );
      const checksum2 = (offlineSyncService as any).calculateChecksum(
        transactionUuid,
        deviceId,
        sequenceNumber,
        data,
      );

      expect(checksum1).toBe(checksum2);
    });
  });

  describe("Conflict Detection", () => {
    it("should detect duplicate UUID conflict", async () => {
      const mockTransaction = {
        id: "tx-1",
        transaction_uuid: "uuid-123",
        device_id: "POS-001",
        device_clock_timestamp: new Date(),
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [{ id: "tx-2", transaction_uuid: "uuid-123" }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ drift_seconds: 0, is_excessive: false }],
        });

      const conflict = await (offlineSyncService as any).detectConflict(
        mockTransaction,
      );

      expect(conflict).toEqual({ type: "DUPLICATE_UUID" });
    });

    it("should detect sequence gap conflict", async () => {
      const mockTransaction = {
        id: "tx-1",
        transaction_uuid: "uuid-123",
        device_id: "POS-001",
        device_clock_timestamp: new Date(),
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ gap_start: 5, gap_end: 10 }] })
        .mockResolvedValueOnce({
          rows: [{ drift_seconds: 0, is_excessive: false }],
        });

      const conflict = await (offlineSyncService as any).detectConflict(
        mockTransaction,
      );

      expect(conflict).toEqual({ type: "SEQUENCE_GAP" });
    });

    it("should detect clock drift conflict", async () => {
      const mockTransaction = {
        id: "tx-1",
        transaction_uuid: "uuid-123",
        device_id: "POS-001",
        device_clock_timestamp: new Date(Date.now() + 3600000), // 1 hour in future
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ drift_seconds: 3600, is_excessive: true }],
        });

      const conflict = await (offlineSyncService as any).detectConflict(
        mockTransaction,
      );

      expect(conflict).toEqual({ type: "CLOCK_DRIFT" });
    });
  });

  describe("Transaction Processing", () => {
    it("should process sale transaction", async () => {
      const saleData = {
        id: "sale-uuid",
        store_id: "store-uuid",
        customer_id: "cust-uuid",
        total_amount: 1000,
        discount_amount: 100,
        points_earned: 50,
        points_redeemed: 0,
        sale_timestamp: new Date(),
        idempotency_key: "key-123",
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: "sale-uuid" }] });

      const result = await (offlineSyncService as any).processSale(saleData);

      expect(result).toBe("sale-uuid");
    });

    it("should skip duplicate sale via idempotency", async () => {
      const saleData = {
        id: "sale-uuid",
        store_id: "store-uuid",
        total_amount: 1000,
        sale_timestamp: new Date(),
        idempotency_key: "key-123",
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: "existing-sale" }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await (offlineSyncService as any).processSale(saleData);

      expect(result).toBe("existing-sale");
    });

    it("should process return transaction", async () => {
      const returnData = {
        id: "return-uuid",
        store_id: "store-uuid",
        sale_id: "sale-uuid",
        customer_id: "cust-uuid",
        total_amount: 500,
        points_reversed: 25,
        redemption_reversed: 0,
        return_timestamp: new Date(),
      };

      (query as jest.Mock).mockResolvedValue({ rows: [{ id: "return-uuid" }] });

      const result = await (offlineSyncService as any).processReturn(
        returnData,
      );

      expect(result).toBe("return-uuid");
    });

    it("should process customer transaction", async () => {
      const customerData = {
        phone: "98XXXXXXXX",
        name: "Test Customer",
        email: "test@example.com",
        home_store_id: "store-uuid",
        enrolled_at: new Date(),
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: "cust-uuid" }] });

      const result = await (offlineSyncService as any).processCustomer(
        customerData,
      );

      expect(result).toBe("cust-uuid");
    });

    it("should return existing customer if phone exists", async () => {
      const customerData = {
        phone: "98XXXXXXXX",
        name: "Test Customer",
      };

      (query as jest.Mock).mockResolvedValue({
        rows: [{ id: "existing-cust" }],
      });

      const result = await (offlineSyncService as any).processCustomer(
        customerData,
      );

      expect(result).toBe("existing-cust");
    });
  });
});
