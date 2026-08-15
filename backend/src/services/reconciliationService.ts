import { query } from "../database/connection.js";
import { paymentProviderService } from "./paymentProviderService.js";

interface Reconciliation {
  id: string;
  reconciliation_id: string;
  date: Date;
  provider: string;
  total_transactions: number;
  total_amount: number;
  matched_transactions: number;
  matched_amount: number;
  unmatched_transactions: number;
  unmatched_amount: number;
  status: string;
  created_at: Date;
  updated_at: Date;
  completed_at: Date;
  created_by: string;
  metadata: any;
}

export class ReconciliationService {
  /**
   * Create reconciliation
   */
  async createReconciliation(reconciliationData: {
    date: Date;
    provider: string;
    created_by?: string;
    metadata?: any;
  }): Promise<Reconciliation> {
    const reconciliationId = this.generateReconciliationId();

    const result = await query(
      `INSERT INTO payment_reconciliation (
        reconciliation_id, date, provider, created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        reconciliationId,
        reconciliationData.date,
        reconciliationData.provider,
        reconciliationData.created_by || null,
        JSON.stringify(reconciliationData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get reconciliation by ID
   */
  async getReconciliation(
    reconciliationId: string,
  ): Promise<Reconciliation | null> {
    const result = await query(
      "SELECT * FROM payment_reconciliation WHERE reconciliation_id = $1",
      [reconciliationId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get reconciliations for date range
   */
  async getReconciliations(
    filters: {
      provider?: string;
      start_date?: Date;
      end_date?: Date;
      status?: string;
    } = {},
  ): Promise<Reconciliation[]> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (filters.provider) {
      conditions.push("provider = $1");
      values.push(filters.provider);
    }

    if (filters.start_date) {
      conditions.push(`date >= $${values.length + 1}`);
      values.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`date <= $${values.length + 1}`);
      values.push(filters.end_date);
    }

    if (filters.status) {
      conditions.push(`status = $${values.length + 1}`);
      values.push(filters.status);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT * FROM payment_reconciliation ${whereClause} ORDER BY date DESC`,
      values,
    );
    return result.rows;
  }

  /**
   * Run reconciliation
   */
  async runReconciliation(reconciliationId: string): Promise<Reconciliation> {
    const reconciliation = await this.getReconciliation(reconciliationId);
    if (!reconciliation) {
      throw new Error("Reconciliation not found");
    }

    if (reconciliation.status === "COMPLETED") {
      throw new Error("Reconciliation already completed");
    }

    // Get provider data
    const providerData = await paymentProviderService.getReconciliationData(
      reconciliation.provider,
      reconciliation.date,
    );

    // Get internal payment intents for the date
    const internalPayments = await query(
      `SELECT * FROM payment_intents 
       WHERE provider = $1 
       AND DATE(created_at) = $2
       AND status = 'COMPLETED'`,
      [reconciliation.provider, reconciliation.date],
    );

    // Match transactions
    const matched = this.matchTransactions(
      providerData.transactions,
      internalPayments.rows,
    );

    // Update reconciliation
    const result = await query(
      `UPDATE payment_reconciliation 
       SET total_transactions = $1, total_amount = $2, 
           matched_transactions = $3, matched_amount = $4,
           unmatched_transactions = $5, unmatched_amount = $6,
           status = 'COMPLETED', completed_at = NOW(), updated_at = NOW()
       WHERE reconciliation_id = $7
       RETURNING *`,
      [
        providerData.total_transactions,
        providerData.total_amount,
        matched.matched_count,
        matched.matched_amount,
        matched.unmatched_count,
        matched.unmatched_amount,
        reconciliationId,
      ],
    );

    return result.rows[0];
  }

  /**
   * Match provider transactions with internal payments
   */
  private matchTransactions(
    providerTransactions: any[],
    internalPayments: any[],
  ): any {
    const matchedCount = 0;
    const matchedAmount = 0;
    const unmatchedCount = providerTransactions.length;
    const unmatchedAmount = providerTransactions.reduce(
      (sum: number, t: any) => sum + t.amount,
      0,
    );

    // Simple matching by provider transaction ID
    // In production, implement more sophisticated matching logic
    const matchedProviderIds = new Set<string>();
    const matchedInternalIds = new Set<string>();

    for (const providerTx of providerTransactions) {
      const internalMatch = internalPayments.find(
        (p: any) => p.provider_intent_id === providerTx.provider_transaction_id,
      );

      if (internalMatch) {
        matchedProviderIds.add(providerTx.provider_transaction_id);
        matchedInternalIds.add(internalMatch.id);
      }
    }

    return {
      matched_count: matchedProviderIds.size,
      matched_amount: Array.from(matchedInternalIds).reduce(
        (sum: number, id: string) => {
          const payment = internalPayments.find((p: any) => p.id === id);
          return sum + (payment?.amount || 0);
        },
        0,
      ),
      unmatched_count: unmatchedCount - matchedProviderIds.size,
      unmatched_amount:
        unmatchedAmount - (matchedCount > 0 ? matchedAmount : 0),
    };
  }

  /**
   * Get reconciliation summary
   */
  async getReconciliationSummary(
    filters: {
      provider?: string;
      start_date?: Date;
      end_date?: Date;
    } = {},
  ): Promise<any> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (filters.provider) {
      conditions.push("provider = $1");
      values.push(filters.provider);
    }

    if (filters.start_date) {
      conditions.push(`date >= $${values.length + 1}`);
      values.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`date <= $${values.length + 1}`);
      values.push(filters.end_date);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT 
        COUNT(*) as total_reconciliations,
        SUM(total_transactions) as total_transactions,
        SUM(total_amount) as total_amount,
        SUM(matched_transactions) as matched_transactions,
        SUM(matched_amount) as matched_amount,
        SUM(unmatched_transactions) as unmatched_transactions,
        SUM(unmatched_amount) as unmatched_amount
       FROM payment_reconciliation
       ${whereClause}`,
      values,
    );

    return result.rows[0];
  }

  /**
   * Generate reconciliation ID
   */
  private generateReconciliationId(): string {
    return `REC-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

export const reconciliationService = new ReconciliationService();
