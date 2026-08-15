import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { PaymentService } from "../paymentService.js";
import { query } from "../../database/connection.js";

jest.mock("../../database/connection.js");

describe("PaymentService", () => {
  let paymentService: PaymentService;

  beforeEach(() => {
    paymentService = new PaymentService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("createPaymentIntent", () => {
    it("should create eSewa payment intent", async () => {
      const mockIntent = {
        id: "intent-uuid",
        intent_number: "PAY-20240115-000001",
        provider: "ESEWA",
        amount_npr: 1000,
        status: "CREATED",
        provider_payment_url: "https://uat.esewa.com.np/epay/main?...",
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ number: "PAY-20240115-000001" }] }) // Generate number
        .mockResolvedValueOnce({ rows: [mockIntent] }); // Insert

      const result = await paymentService.createPaymentIntent({
        provider: "ESEWA",
        amount_npr: 1000,
        store_id: "store-uuid",
      });

      expect(result.provider).toBe("ESEWA");
      expect(result.amount_npr).toBe(1000);
      expect(result.status).toBe("CREATED");
    });

    it("should create Khalti payment intent", async () => {
      const mockIntent = {
        id: "intent-uuid",
        intent_number: "PAY-20240115-000002",
        provider: "KHALTI",
        amount_npr: 500,
        status: "CREATED",
        provider_payment_url: "https://khalti.com/payment/...",
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ number: "PAY-20240115-000002" }] })
        .mockResolvedValueOnce({ rows: [mockIntent] });

      const result = await paymentService.createPaymentIntent({
        provider: "KHALTI",
        amount_npr: 500,
        store_id: "store-uuid",
      });

      expect(result.provider).toBe("KHALTI");
      expect(result.amount_npr).toBe(500);
    });

    it("should return existing intent on idempotency key match", async () => {
      const mockExisting = {
        id: "existing-uuid",
        intent_number: "PAY-20240115-000001",
        provider: "ESEWA",
        amount_npr: 1000,
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockExisting] });

      const result = await paymentService.createPaymentIntent({
        provider: "ESEWA",
        amount_npr: 1000,
        store_id: "store-uuid",
        idempotency_key: "key-123",
      });

      expect(result.id).toBe("existing-uuid");
    });

    it("should create CASH payment intent without provider URL", async () => {
      const mockIntent = {
        id: "intent-uuid",
        intent_number: "PAY-20240115-000003",
        provider: "CASH",
        amount_npr: 200,
        status: "CREATED",
        provider_payment_url: null,
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ number: "PAY-20240115-000003" }] })
        .mockResolvedValueOnce({ rows: [mockIntent] });

      const result = await paymentService.createPaymentIntent({
        provider: "CASH",
        amount_npr: 200,
        store_id: "store-uuid",
      });

      expect(result.provider).toBe("CASH");
      expect(result.provider_payment_url).toBeNull();
    });
  });

  describe("processWebhook", () => {
    it("should reject an unsigned eSewa webhook", async () => {
      const webhookData = {
        transactionId: "tx-123",
        pid: "PAY-20240115-000001",
        status: "Success",
      };

      const mockIntent = {
        id: "intent-uuid",
        intent_number: "PAY-20240115-000001",
        status: "CREATED",
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // Duplicate check
        .mockResolvedValueOnce({ rows: [{ id: "log-uuid" }] }) // Insert log
        .mockResolvedValueOnce({ rows: [mockIntent] }) // Find intent
        .mockResolvedValueOnce({ rows: [] }) // Update intent
        .mockResolvedValueOnce({ rows: [] }); // Update log

      const result = await paymentService.processWebhook(
        "ESEWA",
        webhookData,
        {},
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe("Invalid signature");
    });

    it("should reject an unsigned Khalti webhook", async () => {
      const webhookData = {
        idx: "idx-123",
        purchase_order_id: "PAY-20240115-000002",
        status: "Completed",
      };

      const mockIntent = {
        id: "intent-uuid",
        intent_number: "PAY-20240115-000002",
        status: "CREATED",
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: "log-uuid" }] })
        .mockResolvedValueOnce({ rows: [mockIntent] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await paymentService.processWebhook(
        "KHALTI",
        webhookData,
        {},
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe("Invalid signature");
    });

    it("should ignore duplicate webhook", async () => {
      const webhookData = { transactionId: "tx-123", status: "Success" };

      (query as jest.Mock).mockResolvedValue({
        rows: [{ id: "existing-log" }],
      });

      const result = await paymentService.processWebhook(
        "ESEWA",
        webhookData,
        {},
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe("Duplicate webhook ignored");
    });

    it("should reject webhook with invalid signature", async () => {
      const webhookData = { transactionId: "tx-123", status: "Success" };
      const headers = { "x-esewa-signature": "invalid-signature" };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: "log-uuid" }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await paymentService.processWebhook(
        "ESEWA",
        webhookData,
        headers,
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe("Invalid signature");
    });
  });

  describe("verifyPaymentStatus", () => {
    it("should verify payment status with provider", async () => {
      const mockIntent = {
        id: "intent-uuid",
        provider: "ESEWA",
        status: "CREATED",
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockIntent] })
        .mockResolvedValueOnce({ rows: [] }) // Update status
        .mockResolvedValueOnce({ rows: [mockIntent] }); // Read persisted status

      const result = await paymentService.verifyPaymentStatus("intent-uuid");

      expect(result).toBeDefined();
      expect(result.provider).toBe("ESEWA");
    });

    it("should throw error if intent not found", async () => {
      (query as jest.Mock).mockResolvedValue({ rows: [] });

      await expect(
        paymentService.verifyPaymentStatus("nonexistent"),
      ).rejects.toThrow("Payment intent not found");
    });
  });

  describe("refundPayment", () => {
    it("should refund payment successfully", async () => {
      const mockIntent = {
        id: "intent-uuid",
        provider: "ESEWA",
        status: "COMPLETED",
        amount_npr: 1000,
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockIntent] })
        .mockResolvedValueOnce({ rows: [{ refund_number: "REF-123" }] }) // Insert refund
        .mockResolvedValueOnce({ rows: [] }); // Update intent

      const result = await paymentService.refundPayment(
        "intent-uuid",
        500,
        "Customer request",
      );

      expect(result).toBe("REF-123");
    });

    it("should throw error if payment not completed", async () => {
      const mockIntent = {
        id: "intent-uuid",
        provider: "ESEWA",
        status: "PENDING",
      };

      (query as jest.Mock).mockResolvedValue({ rows: [mockIntent] });

      await expect(
        paymentService.refundPayment("intent-uuid", 500, "Customer request"),
      ).rejects.toThrow("Payment must be completed before refund");
    });

    it("should reject a refund larger than the completed payment", async () => {
      const mockIntent = {
        id: "intent-uuid",
        provider: "ESEWA",
        status: "COMPLETED",
        amount_npr: 1000,
      };

      (query as jest.Mock).mockResolvedValueOnce({ rows: [mockIntent] });

      await expect(
        paymentService.refundPayment(
          "intent-uuid",
          1000.01,
          "Customer request",
        ),
      ).rejects.toThrow("Refund amount exceeds completed payment");
    });

    it("should return existing refund on idempotency key match", async () => {
      const mockIntent = {
        id: "intent-uuid",
        provider: "ESEWA",
        status: "COMPLETED",
      };

      const mockRefund = {
        refund_number: "REF-EXISTING",
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockIntent] })
        .mockResolvedValueOnce({ rows: [mockRefund] });

      const result = await paymentService.refundPayment(
        "intent-uuid",
        500,
        "Customer request",
        "key-123",
      );

      expect(result).toBe("REF-EXISTING");
    });
  });

  describe("reconcilePayments", () => {
    it("should reconcile payments with provider", async () => {
      const storesyncData = {
        transaction_count: 10,
        total_amount: 10000,
        successful_count: 9,
        successful_amount: 9000,
        failed_count: 1,
        failed_amount: 1000,
        refunded_count: 0,
        refunded_amount: 0,
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [storesyncData] })
        .mockResolvedValueOnce({
          rows: [
            { provider: "ESEWA", reconciliation_date: new Date("2024-01-15") },
          ],
        });

      const result = await paymentService.reconcilePayments(
        new Date("2024-01-15"),
        "ESEWA",
      );

      expect(result.provider).toBe("ESEWA");
      expect(result.reconciliation_date).toEqual(new Date("2024-01-15"));
    });

    it("should calculate discrepancies when provider data differs", async () => {
      const storesyncData = {
        transaction_count: 10,
        total_amount: 10000,
        successful_count: 9,
        successful_amount: 9000,
        failed_count: 1,
        failed_amount: 1000,
        refunded_count: 0,
        refunded_amount: 0,
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [storesyncData] })
        .mockResolvedValueOnce({
          rows: [
            {
              provider: "ESEWA",
              count_discrepancy: 10,
              amount_discrepancy_npr: 10000,
              reconciliation_status: "DISCREPANCY",
            },
          ],
        });

      const result = await paymentService.reconcilePayments(
        new Date("2024-01-15"),
        "ESEWA",
      );

      // Provider data is mocked as 0, so discrepancies should be calculated
      expect(result.count_discrepancy).toBe(10);
      expect(result.amount_discrepancy_npr).toBe(10000);
      expect(result.reconciliation_status).toBe("DISCREPANCY");
    });
  });

  describe("Signature Calculation", () => {
    it("should calculate consistent payment signature", async () => {
      const signature1 = (paymentService as any).calculatePaymentSignature(
        "PAY-001",
        1000,
        "ESEWA",
      );
      const signature2 = (paymentService as any).calculatePaymentSignature(
        "PAY-001",
        1000,
        "ESEWA",
      );

      expect(signature1).toBe(signature2);
    });

    it("should calculate different signatures for different data", async () => {
      const signature1 = (paymentService as any).calculatePaymentSignature(
        "PAY-001",
        1000,
        "ESEWA",
      );
      const signature2 = (paymentService as any).calculatePaymentSignature(
        "PAY-002",
        1000,
        "ESEWA",
      );

      expect(signature1).not.toBe(signature2);
    });
  });

  describe("Webhook ID Extraction", () => {
    it("should extract eSewa webhook ID", async () => {
      const data = { transactionId: "tx-123" };
      const webhookId = (paymentService as any).extractWebhookId("ESEWA", data);

      expect(webhookId).toBe("tx-123");
    });

    it("should extract Khalti webhook ID", async () => {
      const data = { idx: "idx-456" };
      const webhookId = (paymentService as any).extractWebhookId(
        "KHALTI",
        data,
      );

      expect(webhookId).toBe("idx-456");
    });
  });

  describe("Event Type Extraction", () => {
    it("should extract eSewa event type", async () => {
      const data = { event: "PAYMENT_SUCCESS" };
      const eventType = (paymentService as any).extractEventType("ESEWA", data);

      expect(eventType).toBe("PAYMENT_SUCCESS");
    });

    it("should extract Khalti event type", async () => {
      const data = { event: "PAYMENT_COMPLETED" };
      const eventType = (paymentService as any).extractEventType(
        "KHALTI",
        data,
      );

      expect(eventType).toBe("PAYMENT_COMPLETED");
    });

    it("should return default event type if not provided", async () => {
      const data = {};
      const eventType = (paymentService as any).extractEventType("ESEWA", data);

      expect(eventType).toBe("PAYMENT_STATUS");
    });
  });

  describe("Sandbox Mode", () => {
    it("should work in sandbox mode without credentials", async () => {
      // This test verifies the service works without actual credentials
      const mockIntent = {
        id: "intent-uuid",
        intent_number: "PAY-20240115-000001",
        provider: "ESEWA",
        amount_npr: 1000,
        status: "CREATED",
        provider_payment_url:
          "https://uat.esewa.com.np/epay/main?pid=PAY-20240115-000001",
      };

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ number: "PAY-20240115-000001" }] })
        .mockResolvedValueOnce({ rows: [mockIntent] });

      const result = await paymentService.createPaymentIntent({
        provider: "ESEWA",
        amount_npr: 1000,
        store_id: "store-uuid",
      });

      expect(result).toBeDefined();
      expect(result.provider_payment_url).toContain("uat.esewa.com.np");
    });
  });

  describe("Provider request contracts", () => {
    it("creates the documented eSewa HMAC/base64 signature", () => {
      process.env.ESEWA_MERCHANT_CODE = "EPAYTEST";
      process.env.ESEWA_SECRET_KEY = "8gBm/:&EnhH.1/q";
      process.env.APP_URL = "https://merchant.example";
      const configuredService = new PaymentService();

      const form = new URLSearchParams(
        (configuredService as any).signEsewaData("241028", 110),
      );

      expect(form.get("signed_field_names")).toBe(
        "total_amount,transaction_uuid,product_code",
      );
      expect(form.get("signature")).toBe(
        "i94zsd3oXF6ZsSr/kGqT4sSzYQzjj1W/waxjWyRwaME=",
      );

      delete process.env.ESEWA_MERCHANT_CODE;
      delete process.env.ESEWA_SECRET_KEY;
      delete process.env.APP_URL;
    });

    it("calls Khalti initiation with server-side credentials and paisa amount", async () => {
      process.env.KHALTI_SECRET_KEY = "secret";
      process.env.KHALTI_PUBLIC_KEY = "public";
      process.env.APP_URL = "https://merchant.example";
      const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          payment_url: "https://khalti.example/pay",
          pidx: "pidx-1",
        }),
      } as Response);
      const configuredService = new PaymentService();

      const result = await (configuredService as any).initiateKhaltiPayment(
        "PAY-1",
        1000,
        { orderName: "Test order" },
      );

      expect(result.paymentUrl).toBe("https://khalti.example/pay");
      expect(result.metadata.pidx).toBe("pidx-1");
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/epayment/initiate/"),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Key secret" }),
          body: expect.stringContaining('"amount":100000'),
        }),
      );

      fetchMock.mockRestore();
      delete process.env.KHALTI_SECRET_KEY;
      delete process.env.KHALTI_PUBLIC_KEY;
      delete process.env.APP_URL;
    });
  });
});
