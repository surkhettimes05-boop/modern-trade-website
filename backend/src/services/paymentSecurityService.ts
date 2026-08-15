import { query } from "../database/connection.js";
import crypto from "crypto";

export class PaymentSecurityService {
  private encryptionKey: string;

  constructor() {
    const configuredKey = process.env.PAYMENT_ENCRYPTION_KEY;
    if (configuredKey && !/^[a-f0-9]{64}$/i.test(configuredKey)) {
      throw new Error(
        "PAYMENT_ENCRYPTION_KEY must be exactly 64 hexadecimal characters",
      );
    }
    if (!configuredKey && process.env.NODE_ENV === "production") {
      throw new Error("PAYMENT_ENCRYPTION_KEY is required in production");
    }
    this.encryptionKey = configuredKey || "0".repeat(64);
  }

  /**
   * Encrypt sensitive payment data
   */
  encrypt(data: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      Buffer.from(this.encryptionKey, "hex"),
      iv,
    );
    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag();
    return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted;
  }

  /**
   * Decrypt sensitive payment data
   */
  decrypt(encryptedData: string): string {
    const parts = encryptedData.split(":");
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      Buffer.from(this.encryptionKey, "hex"),
      iv,
    );
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  /**
   * Redact sensitive data from payload
   */
  redactSensitiveData(payload: any): any {
    const redacted = { ...payload };
    const sensitiveFields = [
      "card_number",
      "cvv",
      "expiry",
      "pin",
      "password",
      "token",
      "secret",
      "api_key",
      "private_key",
    ];

    sensitiveFields.forEach((field) => {
      if (redacted[field]) {
        redacted[field] = this.maskValue(redacted[field]);
      }
    });

    return redacted;
  }

  /**
   * Mask value for logging
   */
  private maskValue(value: string): string {
    if (!value || value.length <= 4) {
      return "****";
    }
    return value.substring(0, 2) + "****" + value.substring(value.length - 2);
  }

  /**
   * Check for duplicate webhook
   */
  async checkDuplicateWebhook(
    provider: string,
    providerWebhookId: string,
  ): Promise<boolean> {
    const result = await query(
      `SELECT id FROM payment_webhooks 
       WHERE provider = $1 AND provider_webhook_id = $2 
       LIMIT 1`,
      [provider, providerWebhookId],
    );
    return result.rows.length > 0;
  }

  /**
   * Store webhook with retry-safe processing
   */
  async storeWebhook(webhookData: {
    webhook_id: string;
    provider: string;
    provider_webhook_id: string;
    payment_intent_id?: string;
    event_type: string;
    raw_payload: any;
    processed_payload?: any;
    metadata?: any;
  }): Promise<any> {
    // Check for duplicate
    const isDuplicate = await this.checkDuplicateWebhook(
      webhookData.provider,
      webhookData.provider_webhook_id,
    );

    if (isDuplicate) {
      throw new Error("Duplicate webhook detected");
    }

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
   * Process webhook with retry logic
   */
  async processWebhookWithRetry(
    webhookId: string,
    processor: (webhook: any) => Promise<void>,
  ): Promise<void> {
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const webhook = await query(
          "SELECT * FROM payment_webhooks WHERE webhook_id = $1",
          [webhookId],
        );

        if (webhook.rows.length === 0) {
          throw new Error("Webhook not found");
        }

        await processor(webhook.rows[0]);

        // Mark as processed
        await query(
          `UPDATE payment_webhooks 
           SET status = 'PROCESSED', processed_at = NOW()
           WHERE webhook_id = $1`,
          [webhookId],
        );

        return;
      } catch (error) {
        if (attempt === maxRetries) {
          // Mark as failed
          await query(
            `UPDATE payment_webhooks 
             SET status = 'FAILED', last_error = $1, processing_attempts = $2
             WHERE webhook_id = $3`,
            [(error as Error).message, attempt, webhookId],
          );
          throw error;
        }

        // Update retry count
        await query(
          `UPDATE payment_webhooks 
           SET processing_attempts = $1, last_error = $2
           WHERE webhook_id = $3`,
          [attempt, (error as Error).message, webhookId],
        );

        // Wait before retry
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelay * attempt),
        );
      }
    }
  }

  /**
   * Handle payment/order mismatch
   */
  async handlePaymentOrderMismatch(
    paymentIntentId: string,
    orderId: string,
  ): Promise<any> {
    // Log the mismatch for manual resolution
    const result = await query(
      `INSERT INTO payment_webhooks (
        webhook_id, provider, provider_webhook_id, event_type, raw_payload, status
      ) VALUES ($1, $2, $3, $4, $5, 'FAILED')
      RETURNING *`,
      [
        `MISMATCH-${Date.now()}`,
        "SYSTEM",
        paymentIntentId,
        "PAYMENT_ORDER_MISMATCH",
        JSON.stringify({
          payment_intent_id: paymentIntentId,
          order_id: orderId,
          timestamp: new Date().toISOString(),
        }),
      ],
    );

    return result.rows[0];
  }

  /**
   * Handle provider outage
   */
  async handleProviderOutage(provider: string): Promise<void> {
    // Log outage
    await query(
      `INSERT INTO payment_webhooks (
        webhook_id, provider, provider_webhook_id, event_type, raw_payload, status
      ) VALUES ($1, $2, $3, $4, $5, 'FAILED')
      RETURNING *`,
      [
        `OUTAGE-${Date.now()}`,
        provider,
        "OUTAGE",
        "PROVIDER_OUTAGE",
        JSON.stringify({
          provider,
          timestamp: new Date().toISOString(),
        }),
      ],
    );
  }

  /**
   * Handle delayed confirmation
   */
  async handleDelayedConfirmation(paymentIntentId: string): Promise<void> {
    // Update payment intent status to indicate delay
    await query(
      `UPDATE payment_intents 
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{delayed_confirmation}',
         'true'
       )
       WHERE intent_id = $1`,
      [paymentIntentId],
    );
  }

  /**
   * Rotate encryption key
   */
  async rotateEncryptionKey(newKey: string): Promise<void> {
    // In production, this would:
    // 1. Decrypt all sensitive data with old key
    // 2. Re-encrypt with new key
    // 3. Update the key in environment variables
    // For now, just update the instance key
    this.encryptionKey = newKey;
  }

  /**
   * Get security metrics
   */
  async getSecurityMetrics(): Promise<any> {
    const totalWebhooks = await query(
      "SELECT COUNT(*) as count FROM payment_webhooks",
    );
    const failedWebhooks = await query(
      "SELECT COUNT(*) as count FROM payment_webhooks WHERE status = 'FAILED'",
    );
    const duplicateWebhooks = await query(
      "SELECT COUNT(*) as count FROM payment_webhooks WHERE event_type = 'DUPLICATE'",
    );

    return {
      total_webhooks: parseInt(totalWebhooks.rows[0].count),
      failed_webhooks: parseInt(failedWebhooks.rows[0].count),
      duplicate_webhooks: parseInt(duplicateWebhooks.rows[0].count),
      failure_rate:
        totalWebhooks.rows[0].count > 0
          ? (parseInt(failedWebhooks.rows[0].count) /
              parseInt(totalWebhooks.rows[0].count)) *
            100
          : 0,
    };
  }
}

// Export singleton instance
export const paymentSecurityService = new PaymentSecurityService();
