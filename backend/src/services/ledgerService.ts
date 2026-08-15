import { query } from "../database/connection.js";

interface LedgerEntry {
  id: string;
  customer_id: string;
  points_signed: number;
  entry_type: "EARN" | "REDEEM" | "EXPIRE" | "ADJUST" | "REVERSAL";
  entry_status: string;
  effective_timestamp: Date;
  created_at: Date;
  source_type: string;
  source_id?: string;
  location_id?: string;
  rule_id?: string;
  rule_version?: number;
  idempotency_key?: string;
  actor: string;
  reason?: string;
  reversal_of_id?: string;
  reversal_reason?: string;
  calculation_metadata?: any;
}

interface CreateLedgerEntryInput {
  customer_id: string;
  points_signed: number;
  entry_type: "EARN" | "REDEEM" | "EXPIRE" | "ADJUST" | "REVERSAL";
  effective_timestamp: Date;
  source_type: string;
  source_id?: string;
  location_id?: string;
  rule_id?: string;
  rule_version?: number;
  idempotency_key?: string;
  actor: string;
  reason?: string;
  reversal_of_id?: string;
  reversal_reason?: string;
  calculation_metadata?: any;
}

export class LedgerService {
  /**
   * Create an immutable ledger entry
   */
  async createEntry(input: CreateLedgerEntryInput): Promise<LedgerEntry> {
    // Check idempotency
    if (input.idempotency_key) {
      const existing = await this.findByIdempotencyKey(input.idempotency_key);
      if (existing) {
        return existing; // Return existing entry if idempotency key matches
      }
    }

    // Validate reversal requirements
    if (input.entry_type === "REVERSAL" && !input.reversal_of_id) {
      throw new Error("Reversal entries must specify reversal_of_id");
    }

    // Validate points not zero
    if (input.points_signed === 0) {
      throw new Error("Points cannot be zero");
    }

    // Validate earn entries have positive points
    if (input.entry_type === "EARN" && input.points_signed < 0) {
      throw new Error("EARN entries must have positive points");
    }

    // Validate redeem entries have negative points
    if (input.entry_type === "REDEEM" && input.points_signed > 0) {
      throw new Error("REDEEM entries must have negative points");
    }

    // Create ledger entry
    const result = await query(
      `INSERT INTO loyalty_ledger (
        customer_id, points_signed, entry_type, entry_status, effective_timestamp,
        source_type, source_id, location_id, rule_id, rule_version,
        idempotency_key, actor, reason, reversal_of_id, reversal_reason, calculation_metadata
      ) VALUES ($1, $2, $3, 'POSTED', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        input.customer_id,
        input.points_signed,
        input.entry_type,
        input.effective_timestamp,
        input.source_type,
        input.source_id || null,
        input.location_id || null,
        input.rule_id || null,
        input.rule_version || null,
        input.idempotency_key || null,
        input.actor,
        input.reason || null,
        input.reversal_of_id || null,
        input.reversal_reason || null,
        input.calculation_metadata
          ? JSON.stringify(input.calculation_metadata)
          : null,
      ],
    );

    // Audit log
    await query(
      `INSERT INTO customer_audit_log (customer_id, entity_type, entity_id, action, new_values, performed_by, reason)
       VALUES ($1, 'LEDGER', $2, 'CREATE', $3, $4, $5)`,
      [
        input.customer_id,
        result.rows[0].id,
        JSON.stringify(result.rows[0]),
        input.actor,
        input.reason || "Ledger entry created",
      ],
    );

    return result.rows[0];
  }

  /**
   * Find entry by idempotency key
   */
  async findByIdempotencyKey(key: string): Promise<LedgerEntry | null> {
    const result = await query(
      "SELECT * FROM loyalty_ledger WHERE idempotency_key = $1",
      [key],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get ledger entries for a customer
   */
  async getCustomerLedger(
    customerId: string,
    limit = 100,
    offset = 0,
  ): Promise<LedgerEntry[]> {
    const result = await query(
      `SELECT * FROM loyalty_ledger 
       WHERE customer_id = $1 
       ORDER BY effective_timestamp DESC, created_at DESC 
       LIMIT $2 OFFSET $3`,
      [customerId, limit, offset],
    );
    return result.rows;
  }

  /**
   * Get ledger entry by ID
   */
  async findById(id: string): Promise<LedgerEntry | null> {
    const result = await query("SELECT * FROM loyalty_ledger WHERE id = $1", [
      id,
    ]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Calculate balance from ledger (source of truth)
   */
  async calculateBalance(customerId: string): Promise<{
    available: number;
    pending: number;
    lifetime_earned: number;
  }> {
    const result = await query(
      `SELECT 
        SUM(CASE WHEN entry_status = 'POSTED' AND entry_type != 'EXPIRE' THEN points_signed ELSE 0 END) as available,
        SUM(CASE WHEN entry_status = 'PENDING' THEN points_signed ELSE 0 END) as pending,
        SUM(CASE WHEN entry_type = 'EARN' AND entry_status = 'POSTED' THEN points_signed ELSE 0 END) as lifetime_earned
       FROM loyalty_ledger
       WHERE customer_id = $1`,
      [customerId],
    );

    const row = result.rows[0];
    return {
      available: parseInt(row.available) || 0,
      pending: parseInt(row.pending) || 0,
      lifetime_earned: parseInt(row.lifetime_earned) || 0,
    };
  }

  /**
   * Get entries by source (for reconciliation)
   */
  async getBySource(
    sourceType: string,
    sourceId: string,
  ): Promise<LedgerEntry[]> {
    const result = await query(
      `SELECT * FROM loyalty_ledger 
       WHERE source_type = $1 AND source_id = $2 
       ORDER BY created_at ASC`,
      [sourceType, sourceId],
    );
    return result.rows;
  }

  /**
   * Get reversal chain for an entry
   */
  async getReversalChain(entryId: string): Promise<LedgerEntry[]> {
    const result = await query(
      `WITH RECURSIVE reversal_chain AS (
        SELECT * FROM loyalty_ledger WHERE id = $1
        UNION
        SELECT l.* FROM loyalty_ledger l
        JOIN reversal_chain rc ON l.reversal_of_id = rc.id
      )
      SELECT * FROM reversal_chain ORDER BY created_at ASC`,
      [entryId],
    );
    return result.rows;
  }

  /**
   * Reconcile ledger sum with cached balance
   */
  async reconcileBalance(customerId: string): Promise<{
    ledger_balance: number;
    cached_balance: number;
    difference: number;
    is_reconciled: boolean;
  }> {
    const ledgerResult = await this.calculateBalance(customerId);

    // This would check against a cached balance table
    // For now, we assume no cached balance exists
    const cachedBalance = 0;

    const difference = ledgerResult.available - cachedBalance;

    return {
      ledger_balance: ledgerResult.available,
      cached_balance: cachedBalance,
      difference,
      is_reconciled: difference === 0,
    };
  }

  /**
   * Get ledger statistics for monitoring
   */
  async getLedgerStats(customerId?: string): Promise<any> {
    let queryStr = `
      SELECT 
        entry_type,
        entry_status,
        COUNT(*) as count,
        SUM(points_signed) as total_points
      FROM loyalty_ledger
    `;
    const params: any[] = [];

    if (customerId) {
      queryStr += " WHERE customer_id = $1";
      params.push(customerId);
    }

    queryStr += " GROUP BY entry_type, entry_status";

    const result = await query(queryStr, params);
    return result.rows;
  }

  /**
   * Validate ledger integrity (sum of all entries should balance)
   */
  async validateLedgerIntegrity(customerId: string): Promise<{
    total_entries: number;
    sum_points: number;
    is_valid: boolean;
  }> {
    const result = await query(
      `SELECT 
        COUNT(*) as total_entries,
        SUM(points_signed) as sum_points
       FROM loyalty_ledger
       WHERE customer_id = $1 AND entry_status = 'POSTED'`,
      [customerId],
    );

    const row = result.rows[0];
    const sumPoints = parseInt(row.sum_points) || 0;

    // For a valid ledger, the sum should equal the current balance
    // (excluding expired points which are separate entries)
    const balance = await this.calculateBalance(customerId);

    return {
      total_entries: parseInt(row.total_entries),
      sum_points: sumPoints,
      is_valid: sumPoints === balance.available, // Simplified validation
    };
  }
}
