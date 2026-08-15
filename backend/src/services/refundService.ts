import { query } from "../database/connection.js";
import { paymentProviderService } from "./paymentProviderService.js";

interface Refund {
  id: string;
  refund_id: string;
  payment_intent_id: string;
  amount: number;
  reason: string;
  provider: string;
  provider_refund_id: string;
  provider_metadata: any;
  status: string;
  created_at: Date;
  updated_at: Date;
  completed_at: Date;
  failed_at: Date;
  created_by: string;
  metadata: any;
}

export class RefundService {
  /**
   * Create refund
   */
  async createRefund(refundData: {
    payment_intent_id: string;
    amount: number;
    reason?: string;
    created_by?: string;
    metadata?: any;
  }): Promise<Refund> {
    const paymentIntent = await query(
      "SELECT * FROM payment_intents WHERE id = $1",
      [refundData.payment_intent_id],
    );

    if (paymentIntent.rows.length === 0) {
      throw new Error("Payment intent not found");
    }

    const intent = paymentIntent.rows[0];

    if (intent.status !== "COMPLETED") {
      throw new Error("Cannot refund payment that is not completed");
    }

    const refundId = this.generateRefundId();

    const result = await query(
      `INSERT INTO payment_refunds (
        refund_id, payment_intent_id, amount, reason, provider,
        created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        refundId,
        refundData.payment_intent_id,
        refundData.amount,
        refundData.reason || null,
        intent.provider,
        refundData.created_by || null,
        JSON.stringify(refundData.metadata || {}),
      ],
    );

    try {
      const providerResponse = await paymentProviderService.createRefund(
        intent.provider,
        {
          payment_intent_id: intent.provider_intent_id,
          amount: refundData.amount,
          reason: refundData.reason,
        },
      );

      await query(
        `UPDATE payment_refunds 
         SET provider_refund_id = $1, provider_metadata = $2, status = 'PROCESSING'
         WHERE refund_id = $3`,
        [
          providerResponse.provider_refund_id,
          JSON.stringify(providerResponse.metadata || {}),
          refundId,
        ],
      );
    } catch (error) {
      await query(
        `UPDATE payment_refunds 
         SET status = 'FAILED', failed_at = NOW()
         WHERE refund_id = $1`,
        [refundId],
      );
      throw error;
    }

    return result.rows[0];
  }

  /**
   * Get refund by ID
   */
  async getRefund(refundId: string): Promise<Refund | null> {
    const result = await query(
      "SELECT * FROM payment_refunds WHERE refund_id = $1",
      [refundId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get refunds for payment intent
   */
  async getRefundsForPaymentIntent(paymentIntentId: string): Promise<Refund[]> {
    const result = await query(
      "SELECT * FROM payment_refunds WHERE payment_intent_id = $1 ORDER BY created_at DESC",
      [paymentIntentId],
    );
    return result.rows;
  }

  /**
   * Update refund status
   */
  async updateRefundStatus(
    refundId: string,
    status: string,
    additionalData?: any,
  ): Promise<Refund> {
    const updates: string[] = ["status = $1", "updated_at = NOW()"];
    const values: any[] = [status];
    let paramIndex = 2;

    if (status === "COMPLETED") {
      updates.push("completed_at = NOW()");
    } else if (status === "FAILED") {
      updates.push("failed_at = NOW()");
    }

    if (additionalData?.provider_refund_id) {
      updates.push(`provider_refund_id = $${paramIndex}`);
      values.push(additionalData.provider_refund_id);
      paramIndex++;
    }

    if (additionalData?.provider_metadata) {
      updates.push(`provider_metadata = $${paramIndex}`);
      values.push(JSON.stringify(additionalData.provider_metadata));
      paramIndex++;
    }

    values.push(refundId);

    const result = await query(
      `UPDATE payment_refunds SET ${updates.join(", ")} WHERE refund_id = $${paramIndex} RETURNING *`,
      values,
    );

    return result.rows[0];
  }

  /**
   * Sync refund status from provider
   */
  async syncRefundStatus(refundId: string): Promise<Refund> {
    const refund = await this.getRefund(refundId);
    if (!refund) {
      throw new Error("Refund not found");
    }

    if (!refund.provider_refund_id) {
      throw new Error("Refund has no provider refund ID");
    }

    const providerStatus = await paymentProviderService.getRefundStatus(
      refund.provider,
      refund.provider_refund_id,
    );

    const statusMap: Record<string, string> = {
      SUCCESS: "COMPLETED",
      PENDING: "PROCESSING",
      FAILED: "FAILED",
    };

    const internalStatus = statusMap[providerStatus.status] || "PROCESSING";

    return await this.updateRefundStatus(refundId, internalStatus, {
      provider_metadata: providerStatus,
    });
  }

  /**
   * Generate refund ID
   */
  private generateRefundId(): string {
    return `REF-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

export const refundService = new RefundService();
