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

export class EsewaProvider extends BasePaymentProvider {
  private apiKey: string;
  private secretKey: string;
  private baseUrl: string;
  private merchantCode: string;

  constructor() {
    super("eSewa");
    this.apiKey = process.env.ESEWA_API_KEY || "";
    this.secretKey = process.env.ESEWA_SECRET_KEY || "";
    this.baseUrl = process.env.ESEWA_BASE_URL || "https://uat.esewa.com.np";
    this.merchantCode = process.env.ESEWA_MERCHANT_CODE || "";
  }

  /**
   * Create payment intent
   */
  async createPaymentIntent(
    request: PaymentIntentRequest,
  ): Promise<PaymentIntentResponse> {
    this.validateAmount(request.amount);
    this.validateCurrency(request.currency || "NPR");

    const intentId = this.generateIdempotencyKey();

    // eSewa payment URL construction
    const paymentUrl = `${this.baseUrl}/epay/main`;
    const params = new URLSearchParams({
      tAmt: request.amount.toString(),
      amt: request.amount.toString(),
      txNm: request.order_id || "ORDER",
      pid: intentId,
      scd: this.merchantCode,
      psc: request.customer_id || "",
      su:
        request.return_url ||
        `${process.env.APP_URL}/api/payments/esewa/success`,
      fu:
        request.cancel_url ||
        `${process.env.APP_URL}/api/payments/esewa/cancel`,
    });

    return {
      intent_id: intentId,
      provider_intent_id: intentId,
      status: "PENDING",
      payment_url: `${paymentUrl}?${params.toString()}`,
      metadata: {
        merchant_code: this.merchantCode,
        amount: request.amount,
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
    // In production, this would call eSewa's verification API
    // For now, return a mock response
    return {
      intent_id: providerIntentId,
      provider_intent_id: providerIntentId,
      amount: 0,
      currency: "NPR",
      status: "PENDING",
      payment_method: "eSewa",
      provider: "eSewa",
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
    // eSewa uses a specific signature format
    // In production, verify the signature using the secret key
    const signature = payload.signature;
    const data = payload.raw_data;

    // Mock verification - implement actual signature verification
    const isValid =
      typeof signature === "string" && this.verifySignature(data, signature);

    if (!isValid) {
      return {
        valid: false,
        error: "Invalid signature",
      };
    }

    return {
      valid: true,
      intent_id: data.refId,
      status: data.status === "Complete" ? "COMPLETED" : "FAILED",
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
      payment_method: "eSewa",
      provider: "eSewa",
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

    // In production, call eSewa's refund API
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
    // In production, call eSewa's refund status API
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
    // eSewa doesn't support cancellation via API
    // Payment can only expire or be completed
    throw new Error("Cancellation not supported by eSewa");
  }

  /**
   * Get reconciliation data
   */
  async getReconciliationData(date: Date): Promise<ReconciliationData> {
    this.rejectIncompleteProductionCapability("reconciliation");
    // In production, call eSewa's reconciliation API
    return {
      date,
      total_transactions: 0,
      total_amount: 0,
      transactions: [],
    };
  }

  /**
   * Verify signature (mock implementation)
   */
  private verifySignature(_data: unknown, signature: string): boolean {
    // The official eSewa callback signing contract is not implemented here.
    // Never treat an unverified callback as authentic.
    void signature;
    return false;
  }
}
