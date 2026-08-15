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
} from "./paymentProviders/baseProvider.js";
import { EsewaProvider } from "./paymentProviders/eSewaProvider.js";
import { KhaltiProvider } from "./paymentProviders/khaltiProvider.js";
import { FonePayProvider } from "./paymentProviders/fonePayProvider.js";
import { query } from "../database/connection.js";

export class PaymentProviderService {
  private providers: Map<string, BasePaymentProvider>;

  constructor() {
    this.providers = new Map();
    this.initializeProviders();
  }

  /**
   * Initialize payment providers
   */
  private initializeProviders(): void {
    this.providers.set("eSewa", new EsewaProvider());
    this.providers.set("Khalti", new KhaltiProvider());
    this.providers.set("FonePay", new FonePayProvider());
  }

  /**
   * Get provider by name
   */
  getProvider(providerName: string): BasePaymentProvider {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Payment provider not found: ${providerName}`);
    }
    return provider;
  }

  /**
   * Get all available providers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Create payment intent
   */
  async createPaymentIntent(
    request: PaymentIntentRequest,
  ): Promise<PaymentIntentResponse> {
    const provider = this.getProvider(request.payment_method);
    return await provider.createPaymentIntent(request);
  }

  /**
   * Get payment intent status
   */
  async getPaymentIntentStatus(
    providerName: string,
    providerIntentId: string,
  ): Promise<PaymentIntent> {
    const provider = this.getProvider(providerName);
    return await provider.getPaymentIntentStatus(providerIntentId);
  }

  /**
   * Verify webhook
   */
  async verifyWebhook(
    providerName: string,
    payload: WebhookPayload,
  ): Promise<WebhookVerificationResult> {
    const provider = this.getProvider(providerName);
    return await provider.verifyWebhook(payload);
  }

  /**
   * Process webhook
   */
  async processWebhook(
    providerName: string,
    payload: WebhookPayload,
  ): Promise<PaymentIntent> {
    const provider = this.getProvider(providerName);
    return await provider.processWebhook(payload);
  }

  /**
   * Create refund
   */
  async createRefund(
    providerName: string,
    request: RefundRequest,
  ): Promise<RefundResponse> {
    const provider = this.getProvider(providerName);
    return await provider.createRefund(request);
  }

  /**
   * Get refund status
   */
  async getRefundStatus(
    providerName: string,
    providerRefundId: string,
  ): Promise<any> {
    const provider = this.getProvider(providerName);
    return await provider.getRefundStatus(providerRefundId);
  }

  /**
   * Cancel payment intent
   */
  async cancelPaymentIntent(
    providerName: string,
    providerIntentId: string,
  ): Promise<void> {
    const provider = this.getProvider(providerName);
    await provider.cancelPaymentIntent(providerIntentId);
  }

  /**
   * Get reconciliation data
   */
  async getReconciliationData(
    providerName: string,
    date: Date,
  ): Promise<ReconciliationData> {
    const provider = this.getProvider(providerName);
    return await provider.getReconciliationData(date);
  }

  /**
   * Save payment intent to database
   */
  async savePaymentIntent(intentData: {
    intent_id: string;
    order_id?: string;
    customer_id?: string;
    amount: number;
    currency: string;
    status: string;
    payment_method: string;
    provider: string;
    provider_intent_id: string;
    provider_metadata?: any;
    idempotency_key?: string;
    created_by?: string;
    metadata?: any;
  }): Promise<any> {
    const result = await query(
      `INSERT INTO payment_intents (
        intent_id, order_id, customer_id, amount, currency, status,
        payment_method, provider, provider_intent_id, provider_metadata,
        idempotency_key, created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        intentData.intent_id,
        intentData.order_id || null,
        intentData.customer_id || null,
        intentData.amount,
        intentData.currency,
        intentData.status,
        intentData.payment_method,
        intentData.provider,
        intentData.provider_intent_id,
        JSON.stringify(intentData.provider_metadata || {}),
        intentData.idempotency_key || null,
        intentData.created_by || null,
        JSON.stringify(intentData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Update payment intent status
   */
  async updatePaymentIntentStatus(
    intentId: string,
    status: string,
    additionalData?: any,
  ): Promise<any> {
    const updates: string[] = ["status = $1", "updated_at = NOW()"];
    const values: any[] = [status];
    let paramIndex = 2;

    if (status === "COMPLETED") {
      updates.push(`completed_at = NOW()`);
    } else if (status === "FAILED") {
      updates.push(`failed_at = NOW()`);
    } else if (status === "CANCELLED") {
      updates.push(`cancelled_at = NOW()`);
    }

    if (additionalData) {
      if (additionalData.provider_metadata) {
        updates.push(`provider_metadata = $${paramIndex}`);
        values.push(JSON.stringify(additionalData.provider_metadata));
        paramIndex++;
      }
      if (additionalData.metadata) {
        updates.push(`metadata = $${paramIndex}`);
        values.push(JSON.stringify(additionalData.metadata));
        paramIndex++;
      }
    }

    values.push(intentId);

    const result = await query(
      `UPDATE payment_intents SET ${updates.join(", ")} WHERE intent_id = $${paramIndex} RETURNING *`,
      values,
    );

    return result.rows[0];
  }

  /**
   * Get payment intent by ID
   */
  async getPaymentIntent(intentId: string): Promise<any> {
    const result = await query(
      "SELECT * FROM payment_intents WHERE intent_id = $1",
      [intentId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get payment intent by idempotency key
   */
  async getPaymentIntentByIdempotencyKey(idempotencyKey: string): Promise<any> {
    const result = await query(
      "SELECT * FROM payment_intents WHERE idempotency_key = $1",
      [idempotencyKey],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Save webhook
   */
  async saveWebhook(webhookData: {
    webhook_id: string;
    provider: string;
    provider_webhook_id: string;
    payment_intent_id?: string;
    event_type: string;
    raw_payload: any;
    processed_payload?: any;
    metadata?: any;
  }): Promise<any> {
    const result = await query(
      `INSERT INTO payment_webhooks (
        webhook_id, provider, provider_webhook_id, payment_intent_id,
        event_type, raw_payload, processed_payload, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        webhookData.webhook_id,
        webhookData.provider,
        webhookData.provider_webhook_id,
        webhookData.payment_intent_id || null,
        webhookData.event_type,
        JSON.stringify(webhookData.raw_payload),
        JSON.stringify(webhookData.processed_payload || {}),
        JSON.stringify(webhookData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Update webhook status
   */
  async updateWebhookStatus(
    webhookId: string,
    status: string,
    error?: string,
  ): Promise<any> {
    const result = await query(
      `UPDATE payment_webhooks 
       SET status = $1, processed_at = CASE WHEN $1 = 'PROCESSED' THEN NOW() ELSE processed_at END,
           processing_attempts = processing_attempts + 1, last_error = $2
       WHERE webhook_id = $3
       RETURNING *`,
      [status, error || null, webhookId],
    );

    return result.rows[0];
  }
}

// Export singleton instance
export const paymentProviderService = new PaymentProviderService();
