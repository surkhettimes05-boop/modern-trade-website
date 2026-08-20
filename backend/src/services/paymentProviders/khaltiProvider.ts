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
import crypto from "crypto";
import { MARKET } from "../../config/market.js";

export class KhaltiProvider extends BasePaymentProvider {
  private apiKey: string;
  private secretKey: string;
  private baseUrl: string;

  constructor() {
    super("Khalti");
    this.apiKey = process.env.KHALTI_API_KEY || "";
    this.secretKey = process.env.KHALTI_SECRET_KEY || "";
    this.baseUrl = process.env.KHALTI_BASE_URL || "https://khalti.com/api";
  }

  /**
   * Create payment intent
   */
  async createPaymentIntent(
    request: PaymentIntentRequest,
  ): Promise<PaymentIntentResponse> {
    this.rejectIncompleteProductionCapability("payment initiation");
    this.validateAmount(request.amount);
    this.validateCurrency(request.currency || MARKET.currencyCode);

    const intentId = this.generateIdempotencyKey();

    // Khalti payment initiation
    const paymentUrl = `${this.baseUrl}/v2/epayment/initiate/`;

    return {
      intent_id: intentId,
      provider_intent_id: intentId,
      status: "PENDING",
      payment_url: paymentUrl,
      metadata: {
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
    // In production, call Khalti's verification API
    return {
      intent_id: providerIntentId,
      provider_intent_id: providerIntentId,
      amount: 0,
      currency: MARKET.currencyCode,
      status: "PENDING",
      payment_method: "Khalti",
      provider: "Khalti",
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

    // Khalti uses HMAC-SHA256 signature
    const isValid = this.verifySignature(data, signature);

    if (!isValid) {
      return {
        valid: false,
        error: "Invalid signature",
      };
    }

    return {
      valid: true,
      intent_id: data.idx,
      status: data.state === "Completed" ? "COMPLETED" : "FAILED",
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
      currency: MARKET.currencyCode,
      status:
        (verification.status as
          | "PENDING"
          | "PROCESSING"
          | "COMPLETED"
          | "FAILED"
          | "CANCELLED"
          | "REFUNDED") || "PENDING",
      payment_method: "Khalti",
      provider: "Khalti",
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

    // In production, call Khalti's refund API
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
    // In production, call Khalti's refund status API
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
    // Khalti supports cancellation via API
    // In production, call Khalti's cancellation API
    throw new Error("Cancellation not yet implemented");
  }

  /**
   * Get reconciliation data
   */
  async getReconciliationData(date: Date): Promise<ReconciliationData> {
    this.rejectIncompleteProductionCapability("reconciliation");
    // In production, call Khalti's reconciliation API
    return {
      date,
      total_transactions: 0,
      total_amount: 0,
      transactions: [],
    };
  }

  /**
   * Verify signature using HMAC-SHA256
   */
  private verifySignature(data: any, signature: string): boolean {
    if (!this.secretKey) return false;
    // In production, implement the provider-documented verification flow.
    const expectedSignature = crypto
      .createHmac("sha256", this.secretKey)
      .update(JSON.stringify(data))
      .digest("hex");

    return signature === expectedSignature;
  }
}
