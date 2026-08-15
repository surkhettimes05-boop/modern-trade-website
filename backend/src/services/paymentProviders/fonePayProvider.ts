import {
  BasePaymentProvider,
  PaymentIntentRequest,
  PaymentIntentResponse,
  WebhookPayload,
  WebhookVerificationResult,
  PaymentIntent,
  RefundRequest,
  RefundResponse,
  ReconciliationData,
} from "./baseProvider.js";

export class FonePayProvider extends BasePaymentProvider {
  private merchantId: string;
  private secretKey: string;
  private baseUrl: string;

  constructor() {
    super("FonePay");
    this.merchantId = process.env.FONEPAY_MERCHANT_ID || "";
    this.secretKey = process.env.FONEPAY_SECRET_KEY || "";
    this.baseUrl =
      process.env.FONEPAY_BASE_URL || "https://clientapi.fonepay.com/api";
  }

  /**
   * Create payment intent
   */
  async createPaymentIntent(
    request: PaymentIntentRequest,
  ): Promise<PaymentIntentResponse> {
    this.rejectIncompleteProductionCapability("payment initiation");
    this.validateAmount(request.amount);
    this.validateCurrency(request.currency || "NPR");

    const intentId = this.generateIdempotencyKey();

    // FonePay QR generation
    const qrData = this.generateQRData(
      intentId,
      request.amount,
      request.order_id,
    );
    const qrCode = this.generateQRCode(qrData);

    return {
      intent_id: intentId,
      provider_intent_id: intentId,
      status: "PENDING",
      qr_code: qrCode,
      expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      metadata: {
        merchant_id: this.merchantId,
        amount: request.amount,
        order_id: request.order_id,
      },
    };
  }

  /**
   * Get payment intent status
   */
  async getPaymentIntentStatus(
    providerIntentId: string,
  ): Promise<PaymentIntent> {
    this.rejectIncompleteProductionCapability("status verification");
    // In production, call FonePay's status API
    return {
      intent_id: providerIntentId,
      provider_intent_id: providerIntentId,
      amount: 0,
      currency: "NPR",
      status: "PENDING",
      payment_method: "FonePay",
      provider: "FonePay",
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  /**
   * Verify webhook signature
   */
  async verifyWebhook(
    payload: WebhookPayload,
  ): Promise<WebhookVerificationResult> {
    this.rejectIncompleteProductionCapability("webhook verification");
    const signature = payload.signature;
    const data = payload.raw_data;

    if (!signature) {
      return {
        valid: false,
        error: "Missing signature",
      };
    }

    // FonePay uses a specific signature format
    const isValid = this.verifySignature(data, signature);

    if (!isValid) {
      return {
        valid: false,
        error: "Invalid signature",
      };
    }

    return {
      valid: true,
      intent_id: data.refId,
      status: data.status === "SUCCESS" ? "COMPLETED" : "FAILED",
      amount: parseFloat(data.amount),
    };
  }

  /**
   * Process webhook
   */
  async processWebhook(payload: WebhookPayload): Promise<PaymentIntent> {
    const verification = await this.verifyWebhook(payload);

    if (!verification.valid) {
      throw new Error("Invalid webhook signature");
    }

    return {
      intent_id: verification.intent_id || "",
      provider_intent_id: payload.provider_webhook_id,
      amount: verification.amount || 0,
      currency: "NPR",
      status:
        (verification.status as
          | "PENDING"
          | "PROCESSING"
          | "COMPLETED"
          | "FAILED"
          | "CANCELLED"
          | "REFUNDED") || "PENDING",
      payment_method: "FonePay",
      provider: "FonePay",
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  /**
   * Create refund
   */
  async createRefund(request: RefundRequest): Promise<RefundResponse> {
    this.rejectIncompleteProductionCapability("refunds");
    this.validateAmount(request.amount);

    const refundId = `REF-${Date.now()}`;

    // In production, call FonePay's refund API
    return {
      refund_id: refundId,
      provider_refund_id: refundId,
      status: "PENDING",
      amount: request.amount,
      metadata: {
        payment_intent_id: request.payment_intent_id,
        reason: request.reason,
      },
    };
  }

  /**
   * Get refund status
   */
  async getRefundStatus(providerRefundId: string): Promise<any> {
    this.rejectIncompleteProductionCapability("refund status");
    // In production, call FonePay's refund status API
    return {
      refund_id: providerRefundId,
      status: "PENDING",
      amount: 0,
    };
  }

  /**
   * Cancel payment intent
   */
  async cancelPaymentIntent(_providerIntentId: string): Promise<void> {
    // FonePay supports cancellation via API
    // In production, call FonePay's cancellation API
    throw new Error("Cancellation not yet implemented");
  }

  /**
   * Get reconciliation data
   */
  async getReconciliationData(date: Date): Promise<ReconciliationData> {
    this.rejectIncompleteProductionCapability("reconciliation");
    // In production, call FonePay's reconciliation API
    return {
      date,
      total_transactions: 0,
      total_amount: 0,
      transactions: [],
    };
  }

  /**
   * Generate QR data string
   */
  private generateQRData(
    intentId: string,
    amount: number,
    orderId?: string,
  ): string {
    const timestamp = Date.now();
    const data = `${this.merchantId},${intentId},${amount},${orderId || ""},${timestamp}`;
    return data;
  }

  /**
   * Generate QR code (mock implementation)
   */
  private generateQRCode(data: string): string {
    // In production, use a QR code library like qrcode
    // For now, return a base64 placeholder
    return `data:image/png;base64,${Buffer.from(data).toString("base64")}`;
  }

  /**
   * Verify signature
   */
  private verifySignature(_data: any, _signature: string): boolean {
    // Fonepay's signing contract is not implemented in this adapter yet.
    // Never treat an unverified callback as authentic.
    return false;
  }
}
