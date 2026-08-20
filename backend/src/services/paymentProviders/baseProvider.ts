import { MARKET } from "../../config/market.js";

export interface PaymentIntent {
  intent_id: string;
  order_id?: string;
  customer_id?: string;
  amount: number;
  currency: string;
  status:
    | "PENDING"
    | "PROCESSING"
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED"
    | "REFUNDED";
  payment_method: string;
  provider: string;
  provider_intent_id?: string;
  provider_metadata?: any;
  idempotency_key?: string;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
  failed_at?: Date;
  cancelled_at?: Date;
}

export interface PaymentIntentRequest {
  order_id?: string;
  customer_id?: string;
  amount: number;
  currency?: string;
  payment_method: string;
  idempotency_key?: string;
  metadata?: any;
  return_url?: string;
  cancel_url?: string;
}

export interface PaymentIntentResponse {
  intent_id: string;
  provider_intent_id: string;
  status: string;
  payment_url?: string;
  qr_code?: string;
  expires_at?: Date;
  metadata?: any;
}

export interface WebhookPayload {
  provider: string;
  event_type: string;
  provider_webhook_id: string;
  raw_data: any;
  signature?: string;
}

export interface WebhookVerificationResult {
  valid: boolean;
  intent_id?: string;
  status?: string;
  amount?: number;
  error?: string;
}

export interface RefundRequest {
  payment_intent_id: string;
  amount: number;
  reason?: string;
  metadata?: any;
}

export interface RefundResponse {
  refund_id: string;
  provider_refund_id: string;
  status: string;
  amount: number;
  metadata?: any;
}

export interface ReconciliationData {
  date: Date;
  total_transactions: number;
  total_amount: number;
  transactions: Array<{
    provider_transaction_id: string;
    amount: number;
    status: string;
    timestamp: Date;
  }>;
}

/**
 * Abstract base class for payment providers
 */
export abstract class BasePaymentProvider {
  protected providerName: string;

  constructor(providerName: string) {
    this.providerName = providerName;
  }

  /**
   * Get provider name
   */
  getProviderName(): string {
    return this.providerName;
  }

  /**
   * Create payment intent
   */
  abstract createPaymentIntent(
    request: PaymentIntentRequest,
  ): Promise<PaymentIntentResponse>;

  /**
   * Get payment intent status
   */
  abstract getPaymentIntentStatus(
    providerIntentId: string,
  ): Promise<PaymentIntent>;

  /**
   * Verify webhook signature
   */
  abstract verifyWebhook(
    payload: WebhookPayload,
  ): Promise<WebhookVerificationResult>;

  /**
   * Process webhook
   */
  abstract processWebhook(payload: WebhookPayload): Promise<PaymentIntent>;

  /**
   * Create refund
   */
  abstract createRefund(request: RefundRequest): Promise<RefundResponse>;

  /**
   * Get refund status
   */
  abstract getRefundStatus(providerRefundId: string): Promise<any>;

  /**
   * Cancel payment intent
   */
  abstract cancelPaymentIntent(providerIntentId: string): Promise<void>;

  /**
   * Get reconciliation data
   */
  abstract getReconciliationData(date: Date): Promise<ReconciliationData>;

  /**
   * Validate payment amount
   */
  protected validateAmount(amount: number): void {
    if (amount <= 0) {
      throw new Error("Amount must be greater than 0");
    }
    if (amount > 1000000) {
      throw new Error("Amount exceeds maximum limit");
    }
  }

  /**
   * Validate currency
   */
  protected validateCurrency(currency: string): void {
    if (currency !== MARKET.currencyCode) {
      throw new Error(`Only ${MARKET.currencyCode} currency is supported`);
    }
  }

  protected rejectIncompleteProductionCapability(capability: string): void {
    throw new Error(
      `${this.providerName} ${capability} is disabled: provider contract is not certified`,
    );
  }

  /**
   * Generate idempotency key if not provided
   */
  protected generateIdempotencyKey(): string {
    return `${this.providerName}-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
}
