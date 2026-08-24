import { query } from "../database/connection.js";
import crypto from "crypto";
import { MARKET } from "../config/market.js";

interface PaymentIntent {
  id: string;
  intent_number: string;
  provider: string;
  amount_npr: number;
  currency: string;
  status: string;
  order_reference: string;
  customer_id: string;
  store_id: string;
  device_id: string;
  provider_transaction_id: string;
  provider_payment_url: string;
  provider_metadata: any;
  created_at: Date;
  expires_at: Date;
  completed_at: Date;
  cancelled_at: Date;
  refunded_at: Date;
  idempotency_key: string;
  signature: string;
  metadata: any;
}

export class PaymentService {
  private readonly ESEWA_MERCHANT_CODE = process.env.ESEWA_MERCHANT_CODE;
  private readonly ESEWA_SECRET_KEY = process.env.ESEWA_SECRET_KEY;
  private readonly ESEWA_API_URL =
    process.env.ESEWA_API_URL || "https://uat.esewa.com.np";
  private readonly APP_URL = process.env.APP_URL;
  private readonly ESEWA_SUCCESS_URL = process.env.ESEWA_SUCCESS_URL;
  private readonly ESEWA_FAILURE_URL = process.env.ESEWA_FAILURE_URL;
  private readonly KHALTI_SECRET_KEY = process.env.KHALTI_SECRET_KEY;
  private readonly KHALTI_PUBLIC_KEY = process.env.KHALTI_PUBLIC_KEY;
  private readonly KHALTI_API_URL =
    process.env.KHALTI_API_URL || "https://khalti.com/api/v2";
  private readonly KHALTI_RETURN_URL = process.env.KHALTI_RETURN_URL;
  private readonly KHALTI_WEBSITE_URL = process.env.KHALTI_WEBSITE_URL;

  /**
   * Create payment intent
   */
  async createPaymentIntent(paymentData: {
    provider: "ESEWA" | "KHALTI" | "CASH" | "CARD";
    amount_npr: number;
    currency?: string;
    order_reference?: string;
    customer_id?: string;
    store_id: string;
    device_id?: string;
    idempotency_key?: string;
    metadata?: any;
    created_by?: string;
  }): Promise<PaymentIntent> {
    if (
      !Number.isFinite(paymentData.amount_npr) ||
      paymentData.amount_npr <= 0
    ) {
      throw new Error("Amount must be greater than 0");
    }
    if (paymentData.amount_npr > 1_000_000) {
      throw new Error("Amount exceeds maximum limit");
    }
    if (paymentData.currency && paymentData.currency !== MARKET.currencyCode) {
      throw new Error(`Only ${MARKET.currencyCode} currency is supported`);
    }
    this.assertProviderAvailable(paymentData.provider);
    // Check idempotency
    if (paymentData.idempotency_key) {
      const existing = await query(
        "SELECT * FROM payment_intents WHERE idempotency_key = $1",
        [paymentData.idempotency_key],
      );
      if (existing.rows.length > 0) {
        return existing.rows[0];
      }
    }

    const intentNumber = await this.generateIntentNumber();
    const signature = this.calculatePaymentSignature(
      intentNumber,
      paymentData.amount_npr,
      paymentData.provider,
    );

    let providerPaymentUrl: string | null = null;
    let providerMetadata: any = {};

    // Provider-specific initialization
    if (paymentData.provider === "ESEWA") {
      const esewaData = await this.initiateEsewaPayment(
        intentNumber,
        paymentData.amount_npr,
        paymentData.order_reference,
      );
      providerPaymentUrl = esewaData.paymentUrl;
      providerMetadata = esewaData.metadata;
    } else if (paymentData.provider === "KHALTI") {
      const khaltiData = await this.initiateKhaltiPayment(
        intentNumber,
        paymentData.amount_npr,
        paymentData.metadata,
      );
      providerPaymentUrl = khaltiData.paymentUrl;
      providerMetadata = khaltiData.metadata;
    }

    const result = await query(
      `INSERT INTO payment_intents (
        intent_number, provider, amount_npr, currency, status,
        order_reference, customer_id, store_id, device_id,
        provider_payment_url, provider_metadata, signature,
        idempotency_key, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        intentNumber,
        paymentData.provider,
        paymentData.amount_npr,
        paymentData.currency || MARKET.currencyCode,
        "CREATED",
        paymentData.order_reference || null,
        paymentData.customer_id || null,
        paymentData.store_id,
        paymentData.device_id || null,
        providerPaymentUrl,
        JSON.stringify(providerMetadata),
        signature,
        paymentData.idempotency_key || null,
        JSON.stringify(paymentData.metadata || {}),
        paymentData.created_by || "system",
      ],
    );

    return result.rows[0];
  }

  /**
   * Process webhook from payment provider
   */
  async processWebhook(
    provider: "ESEWA" | "KHALTI",
    webhookData: any,
    headers: any,
  ): Promise<{ success: boolean; message: string }> {
    const webhookId = this.extractWebhookId(provider, webhookData);
    const eventType = this.extractEventType(provider, webhookData);
    const providerTransactionId = this.extractProviderTransactionId(
      provider,
      webhookData,
    );
    if (!webhookId || !providerTransactionId) {
      return { success: false, message: "Missing provider transaction ID" };
    }

    // Check for duplicate
    const duplicateCheck = await query(
      "SELECT id FROM payment_webhook_logs WHERE provider = $1 AND webhook_id = $2",
      [provider, webhookId],
    );

    const isDuplicate = duplicateCheck.rows.length > 0;
    const originalWebhookId = isDuplicate ? duplicateCheck.rows[0].id : null;

    // Verify signature
    const signatureProvided = this.extractSignature(headers, webhookData);
    const signatureCalculated = this.calculateWebhookSignature(
      provider,
      webhookData,
    );
    const signatureValid =
      Boolean(signatureProvided) &&
      this.safeEqual(signatureProvided, signatureCalculated);

    const safeRequestHeaders = {
      "content-type": headers?.["content-type"] || null,
      "user-agent": headers?.["user-agent"] || null,
    };
    const safeRequestBody = {
      webhook_id: webhookId,
      event_type: eventType,
      provider_transaction_id: providerTransactionId,
    };

    // Log webhook
    const logResult = await query(
      `INSERT INTO payment_webhook_logs (
        provider, webhook_id, event_type, provider_transaction_id,
        request_headers, request_body, signature_provided, signature_calculated,
        signature_valid, is_duplicate, original_webhook_id, processing_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (provider, webhook_id) DO NOTHING
      RETURNING id`,
      [
        provider,
        webhookId,
        eventType,
        providerTransactionId,
        JSON.stringify(safeRequestHeaders),
        JSON.stringify(safeRequestBody),
        null,
        null,
        signatureValid,
        isDuplicate,
        originalWebhookId,
        isDuplicate ? "DUPLICATE" : "PENDING",
      ],
    );

    if (!logResult.rows[0]) {
      return { success: true, message: "Duplicate webhook ignored" };
    }
    const webhookLogId = logResult.rows[0].id;

    if (isDuplicate) {
      return { success: true, message: "Duplicate webhook ignored" };
    }

    if (!signatureValid) {
      await query(
        `UPDATE payment_webhook_logs
         SET processing_status = 'FAILED', processing_error = 'Invalid signature'
         WHERE id = $1`,
        [webhookLogId],
      );
      return { success: false, message: "Invalid signature" };
    }

    // Process webhook based on provider
    try {
      if (provider === "ESEWA") {
        await this.processEsewaWebhook(webhookData, webhookLogId);
      } else if (provider === "KHALTI") {
        await this.processKhaltiWebhook(webhookData, webhookLogId);
      }

      await query(
        `UPDATE payment_webhook_logs
         SET processing_status = 'PROCESSED', processed_at = NOW()
         WHERE id = $1`,
        [webhookLogId],
      );

      return { success: true, message: "Webhook processed successfully" };
    } catch (error) {
      await query(
        `UPDATE payment_webhook_logs
         SET processing_status = 'FAILED', processing_error = $1, processed_at = NOW()
         WHERE id = $2`,
        [
          error instanceof Error ? error.message : "Unknown error",
          webhookLogId,
        ],
      );
      return {
        success: false,
        message: error instanceof Error ? error.message : "Processing failed",
      };
    }
  }

  /**
   * Verify payment status with provider
   */
  async verifyPaymentStatus(intentId: string): Promise<PaymentIntent> {
    const intent = await query("SELECT * FROM payment_intents WHERE id = $1", [
      intentId,
    ]);

    if (intent.rows.length === 0) {
      throw new Error("Payment intent not found");
    }

    const paymentIntent = intent.rows[0];

    if (paymentIntent.provider === "ESEWA") {
      const status = await this.verifyEsewaStatus(paymentIntent);
      await this.updatePaymentStatus(intentId, status);
    } else if (paymentIntent.provider === "KHALTI") {
      const status = await this.verifyKhaltiStatus(paymentIntent);
      await this.updatePaymentStatus(intentId, status);
    }

    const updated = await query("SELECT * FROM payment_intents WHERE id = $1", [
      intentId,
    ]);
    return updated.rows[0];
  }

  /**
   * Refund payment
   */
  async refundPayment(
    intentId: string,
    amount_npr: number,
    reason: string,
    idempotencyKey?: string,
    createdBy = "system",
  ): Promise<string> {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Provider refunds require a verified provider contract");
    }
    const intent = await query("SELECT * FROM payment_intents WHERE id = $1", [
      intentId,
    ]);

    if (intent.rows.length === 0) {
      throw new Error("Payment intent not found");
    }

    const paymentIntent = intent.rows[0];

    if (paymentIntent.status !== "COMPLETED") {
      throw new Error("Payment must be completed before refund");
    }
    if (amount_npr > Number(paymentIntent.amount_npr)) {
      throw new Error("Refund amount exceeds completed payment");
    }

    // Check idempotency
    if (idempotencyKey) {
      const existing = await query(
        "SELECT * FROM payment_refunds WHERE idempotency_key = $1",
        [idempotencyKey],
      );
      if (existing.rows.length > 0) {
        return existing.rows[0].refund_number;
      }
    }

    const refundNumber = `REF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    let providerRefundId: string | null = null;

    if (paymentIntent.provider === "ESEWA") {
      providerRefundId = await this.refundEsewaPayment(
        paymentIntent,
        amount_npr,
      );
    } else if (paymentIntent.provider === "KHALTI") {
      providerRefundId = await this.refundKhaltiPayment(
        paymentIntent,
        amount_npr,
      );
    }

    const result = await query(
      `INSERT INTO payment_refunds (
        refund_number, payment_intent_id, provider, amount_npr,
        reason, provider_refund_id, idempotency_key, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING refund_number`,
      [
        refundNumber,
        intentId,
        paymentIntent.provider,
        amount_npr,
        reason,
        providerRefundId,
        idempotencyKey || null,
        createdBy,
      ],
    );

    // Update payment intent status
    await query(
      `UPDATE payment_intents
       SET status = 'REFUNDED', refunded_at = NOW()
       WHERE id = $1`,
      [intentId],
    );

    return result.rows[0].refund_number;
  }

  /**
   * Daily reconciliation with provider
   */
  async reconcilePayments(
    date: Date,
    provider: "ESEWA" | "KHALTI",
    storeId?: string,
  ): Promise<any> {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `${provider} reconciliation requires a provider report contract`,
      );
    }
    const storeFilter = storeId ? "AND store_id = $3" : "";

    // Get StoreSync data
    const storesyncResult = await query(
      `SELECT 
        COUNT(*) as transaction_count,
        SUM(amount_npr) as total_amount,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as successful_count,
        SUM(amount_npr) FILTER (WHERE status = 'COMPLETED') as successful_amount,
        COUNT(*) FILTER (WHERE status = 'FAILED') as failed_count,
        SUM(amount_npr) FILTER (WHERE status = 'FAILED') as failed_amount,
        COUNT(*) FILTER (WHERE status = 'REFUNDED') as refunded_count,
        SUM(amount_npr) FILTER (WHERE status = 'REFUNDED') as refunded_amount
      FROM payment_intents
      WHERE provider = $1
        AND DATE(created_at) = $2
        ${storeFilter}`,
      storeId ? [provider, date, storeId] : [provider, date],
    );

    const storesyncData = storesyncResult.rows[0];

    // Provider data is unavailable until a provider report contract is supplied.
    let providerData = { count: 0, amount: 0 };
    if (this.ESEWA_MERCHANT_CODE || this.KHALTI_SECRET_KEY) {
      providerData = await this.fetchProviderReconciliation(
        provider,
        date,
        storeId,
      );
    }

    // Calculate discrepancies
    const countDiscrepancy =
      storesyncData.transaction_count - providerData.count;
    const amountDiscrepancy = storesyncData.total_amount - providerData.amount;

    const reconciliationStatus =
      countDiscrepancy === 0 && amountDiscrepancy === 0
        ? "MATCHED"
        : "DISCREPANCY";

    const result = await query(
      `INSERT INTO payment_reconciliation (
        reconciliation_date, provider, store_id,
        transaction_count, total_amount_npr,
        successful_count, successful_amount_npr,
        failed_count, failed_amount_npr,
        refunded_count, refunded_amount_npr,
        provider_report_count, provider_report_amount_npr,
        count_discrepancy, amount_discrepancy_npr,
        reconciliation_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        date,
        provider,
        storeId || null,
        storesyncData.transaction_count,
        storesyncData.total_amount,
        storesyncData.successful_count,
        storesyncData.successful_amount,
        storesyncData.failed_count,
        storesyncData.failed_amount,
        storesyncData.refunded_count,
        storesyncData.refunded_amount,
        providerData.count,
        providerData.amount,
        countDiscrepancy,
        amountDiscrepancy,
        reconciliationStatus,
      ],
    );

    return result.rows[0];
  }

  // ============================================
  // eSewa Integration
  // ============================================

  private async initiateEsewaPayment(
    intentNumber: string,
    amount: number,
    _orderReference?: string,
  ): Promise<any> {
    if (!this.ESEWA_MERCHANT_CODE || !this.ESEWA_SECRET_KEY) {
      throw new Error("eSewa is unavailable: merchant credentials are missing");
    }

    if (!this.APP_URL && !this.ESEWA_SUCCESS_URL) {
      throw new Error(
        "APP_URL or ESEWA_SUCCESS_URL is required for eSewa payments",
      );
    }

    const signedData = this.signEsewaData(intentNumber, amount);
    const paymentUrl = `${this.ESEWA_API_URL.replace(/\/$/, "")}/api/epay/main/v2/form`;

    return {
      paymentUrl,
      metadata: {
        production: true,
        form: Object.fromEntries(new URLSearchParams(signedData)),
      },
    };
  }

  private async processEsewaWebhook(
    webhookData: any,
    webhookLogId: string,
  ): Promise<void> {
    const intentNumber = webhookData.transaction_uuid || webhookData.pid;
    const status = webhookData.status || "FAILED";

    const intent = await query(
      "SELECT * FROM payment_intents WHERE intent_number = $1",
      [intentNumber],
    );

    if (intent.rows.length === 0) {
      throw new Error("Payment intent not found for transaction ID");
    }

    const expectedAmount = Number(intent.rows[0].amount_npr);
    if (Number(webhookData.total_amount) !== expectedAmount) {
      throw new Error("Payment amount does not match payment intent");
    }
    if (webhookData.product_code !== this.ESEWA_MERCHANT_CODE) {
      throw new Error(
        "Payment product code does not match merchant configuration",
      );
    }

    await query(
      `UPDATE payment_intents
       SET status = $1, provider_transaction_id = $2, completed_at = NOW()
       WHERE intent_number = $3`,
      [
        status === "COMPLETE" ? "COMPLETED" : "FAILED",
        webhookData.transaction_code || webhookData.transactionId,
        intentNumber,
      ],
    );

    await query(
      `UPDATE payment_webhook_logs SET payment_intent_id = $1 WHERE id = $2`,
      [intent.rows[0].id, webhookLogId],
    );
  }

  private async verifyEsewaStatus(
    paymentIntent: PaymentIntent,
  ): Promise<string> {
    if (!this.ESEWA_MERCHANT_CODE || !this.ESEWA_SECRET_KEY) {
      return paymentIntent.status;
    }

    const url = new URL(
      `${this.ESEWA_API_URL.replace(/\/$/, "")}/api/epay/transaction/status/`,
    );
    url.search = new URLSearchParams({
      product_code: this.ESEWA_MERCHANT_CODE,
      total_amount: String(paymentIntent.amount_npr),
      transaction_uuid: paymentIntent.intent_number,
    }).toString();
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`eSewa status verification failed: ${response.status}`);
    const data = (await response.json()) as {
      status?: string;
      total_amount?: number;
      transaction_uuid?: string;
    };
    if (Number(data.total_amount) !== Number(paymentIntent.amount_npr)) {
      throw new Error("eSewa verification amount mismatch");
    }
    if (
      data.transaction_uuid &&
      data.transaction_uuid !== paymentIntent.intent_number
    ) {
      throw new Error("eSewa verification transaction mismatch");
    }
    return data.status === "COMPLETE" ? "COMPLETED" : data.status || "PENDING";
  }

  private async refundEsewaPayment(
    _paymentIntent: PaymentIntent,
    _amount: number,
  ): Promise<string> {
    if (!this.ESEWA_MERCHANT_CODE || !this.ESEWA_SECRET_KEY) {
      throw new Error("eSewa refund is unavailable: credentials are missing");
    }

    throw new Error(
      "eSewa refund API is not defined by the current integration contract",
    );
  }

  private signEsewaData(intentNumber: string, amount: number): string {
    const signedFieldNames = "total_amount,transaction_uuid,product_code";
    const totalAmount = String(amount);
    const productCode = this.ESEWA_MERCHANT_CODE || "";
    const message = `total_amount=${totalAmount},transaction_uuid=${intentNumber},product_code=${productCode}`;
    const signature = crypto
      .createHmac("sha256", this.ESEWA_SECRET_KEY || "")
      .update(message)
      .digest("base64");
    const params = new URLSearchParams({
      amount: totalAmount,
      tax_amount: "0",
      total_amount: totalAmount,
      transaction_uuid: intentNumber,
      product_code: productCode,
      product_service_charge: "0",
      product_delivery_charge: "0",
      success_url:
        this.ESEWA_SUCCESS_URL || `${this.APP_URL}/payment/esewa/success`,
      failure_url:
        this.ESEWA_FAILURE_URL || `${this.APP_URL}/payment/esewa/failure`,
      signed_field_names: signedFieldNames,
      signature,
    });
    return params.toString();
  }

  // ============================================
  // Khalti Integration
  // ============================================

  private async initiateKhaltiPayment(
    intentNumber: string,
    amount: number,
    metadata?: any,
  ): Promise<any> {
    if (!this.KHALTI_SECRET_KEY || !this.KHALTI_PUBLIC_KEY) {
      throw new Error(
        "Khalti is unavailable: merchant credentials are missing",
      );
    }

    const payload = {
      amount: amount * 100, // Khalti uses paisa
      purchase_order_id: intentNumber,
      purchase_order_name: metadata?.orderName || "StoreSync Purchase",
      return_url:
        this.KHALTI_RETURN_URL || `${this.APP_URL}/payment/khalti/success`,
      website_url: this.KHALTI_WEBSITE_URL || this.APP_URL,
    };

    if (!payload.return_url || !payload.website_url) {
      throw new Error(
        "KHALTI_RETURN_URL and KHALTI_WEBSITE_URL are required for Khalti payments",
      );
    }
    const response = await fetch(
      `${this.KHALTI_API_URL.replace(/\/$/, "")}/epayment/initiate/`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${this.KHALTI_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok)
      throw new Error(`Khalti initiation failed: ${response.status}`);
    const data = (await response.json()) as {
      payment_url?: string;
      pidx?: string;
    };
    if (!data.payment_url || !data.pidx)
      throw new Error("Khalti response missing payment_url or pidx");
    return {
      paymentUrl: data.payment_url,
      metadata: { production: true, payload, pidx: data.pidx },
    };
  }

  private async processKhaltiWebhook(
    webhookData: any,
    webhookLogId: string,
  ): Promise<void> {
    const purchaseOrderId = webhookData.purchase_order_id;
    const idx = webhookData.idx;

    const intent = await query(
      "SELECT * FROM payment_intents WHERE intent_number = $1",
      [purchaseOrderId],
    );

    if (intent.rows.length === 0) {
      throw new Error("Payment intent not found for purchase order ID");
    }

    const verified = await this.verifyKhaltiStatus(intent.rows[0]);
    if (verified !== "COMPLETED")
      throw new Error("Khalti payment is not completed");

    await query(
      `UPDATE payment_intents
       SET status = $1, provider_transaction_id = $2, completed_at = NOW()
       WHERE intent_number = $3`,
      [verified, idx, purchaseOrderId],
    );

    await query(
      `UPDATE payment_webhook_logs SET payment_intent_id = $1 WHERE id = $2`,
      [intent.rows[0].id, webhookLogId],
    );
  }

  private async verifyKhaltiStatus(
    paymentIntent: PaymentIntent,
  ): Promise<string> {
    if (!this.KHALTI_SECRET_KEY) {
      return paymentIntent.status;
    }

    const metadata =
      typeof paymentIntent.provider_metadata === "string"
        ? JSON.parse(paymentIntent.provider_metadata)
        : paymentIntent.provider_metadata || {};
    const pidx = metadata.pidx || paymentIntent.provider_transaction_id;
    if (!pidx) throw new Error("Khalti payment intent has no pidx");
    const response = await fetch(
      `${this.KHALTI_API_URL.replace(/\/$/, "")}/epayment/lookup/`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${this.KHALTI_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pidx }),
      },
    );
    if (!response.ok)
      throw new Error(`Khalti lookup failed: ${response.status}`);
    const data = (await response.json()) as {
      status?: string;
      total_amount?: number;
      pidx?: string;
    };
    if (data.pidx && data.pidx !== pidx)
      throw new Error("Khalti verification transaction mismatch");
    if (Number(data.total_amount) !== Number(paymentIntent.amount_npr) * 100) {
      throw new Error("Khalti verification amount mismatch");
    }
    return data.status === "Completed" ? "COMPLETED" : data.status || "PENDING";
  }

  private async refundKhaltiPayment(
    _paymentIntent: PaymentIntent,
    _amount: number,
  ): Promise<string> {
    if (!this.KHALTI_SECRET_KEY) {
      throw new Error("Khalti refund is unavailable: credentials are missing");
    }

    throw new Error(
      "Khalti refund API is not defined by the current integration contract",
    );
  }

  // ============================================
  // Helper Methods
  // ============================================

  private async generateIntentNumber(): Promise<string> {
    const result = await query(
      "SELECT generate_payment_intent_number() as number",
    );
    return result.rows[0].number;
  }

  private calculatePaymentSignature(
    intentNumber: string,
    amount: number,
    provider: string,
  ): string {
    const data = `${intentNumber}:${amount}:${provider}`;
    return crypto
      .createHmac(
        "sha256",
        this.ESEWA_SECRET_KEY || this.KHALTI_SECRET_KEY || "default",
      )
      .update(data)
      .digest("hex");
  }

  private calculateWebhookSignature(provider: string, data: any): string {
    if (provider === "ESEWA") {
      const secret = this.ESEWA_SECRET_KEY;
      const signedFieldNames = String(data.signed_field_names || "");
      if (!secret || !signedFieldNames) return "";
      const message = signedFieldNames
        .split(",")
        .map((field) => `${field}=${data[field] ?? ""}`)
        .join(",");
      return crypto
        .createHmac("sha256", secret)
        .update(message)
        .digest("base64");
    }
    if (provider === "KHALTI") {
      if (!this.KHALTI_SECRET_KEY) return "";
      return crypto
        .createHmac("sha256", this.KHALTI_SECRET_KEY)
        .update(JSON.stringify(data))
        .digest("hex");
    }
    return "";
  }

  private safeEqual(provided: string, calculated: string): boolean {
    if (!provided || !calculated) return false;
    const left = Buffer.from(provided.trim(), "utf8");
    const right = Buffer.from(calculated.trim(), "utf8");
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  }

  private extractWebhookId(provider: string, data: any): string {
    if (provider === "ESEWA") {
      return data.transactionId || data.pid || data.tId || "";
    } else if (provider === "KHALTI") {
      return data.idx || data.transaction_id || "";
    }
    return "";
  }

  private extractEventType(provider: string, data: any): string {
    if (provider === "ESEWA") {
      return data.event || "PAYMENT_STATUS";
    } else if (provider === "KHALTI") {
      return data.event || "PAYMENT_COMPLETED";
    }
    return "PAYMENT_STATUS";
  }

  private extractProviderTransactionId(provider: string, data: any): string {
    if (provider === "ESEWA") {
      return data.transactionId || data.pid || "";
    } else if (provider === "KHALTI") {
      return data.idx || "";
    }
    return "";
  }

  private extractSignature(headers: any, data: any): string {
    return (
      headers["x-esewa-signature"] ||
      headers["x-khalti-signature"] ||
      headers["signature"] ||
      data?.signature ||
      ""
    );
  }

  private async updatePaymentStatus(
    intentId: string,
    status: string,
  ): Promise<void> {
    await query(`UPDATE payment_intents SET status = $1 WHERE id = $2`, [
      status,
      intentId,
    ]);
  }

  private async fetchProviderReconciliation(
    provider: string,
    _date: Date,
    _storeId?: string,
  ): Promise<{ count: number; amount: number }> {
    // Mock implementation - would call provider API in production
    if (provider === "ESEWA" && !this.ESEWA_MERCHANT_CODE) {
      return { count: 0, amount: 0 };
    }
    if (provider === "KHALTI" && !this.KHALTI_SECRET_KEY) {
      return { count: 0, amount: 0 };
    }
    throw new Error(
      `${provider} reconciliation API is not defined by the current integration contract`,
    );
  }

  private assertProviderAvailable(
    provider: "ESEWA" | "KHALTI" | "CASH" | "CARD",
  ): void {
    if (provider === "CASH") return;
    if (process.env.ENABLE_ELECTRONIC_PAYMENTS !== "true") {
      throw new Error("Electronic payments are disabled for the Nepal pilot");
    }
    if (provider === "CARD") {
      throw new Error("Card payments have no certified provider contract");
    }
    if (
      provider === "ESEWA" &&
      (!this.ESEWA_MERCHANT_CODE || !this.ESEWA_SECRET_KEY)
    ) {
      throw new Error("eSewa is unavailable: merchant credentials are missing");
    }
    if (
      provider === "KHALTI" &&
      (!this.KHALTI_SECRET_KEY || !this.KHALTI_PUBLIC_KEY)
    ) {
      throw new Error(
        "Khalti is unavailable: merchant credentials are missing",
      );
    }
  }
}
