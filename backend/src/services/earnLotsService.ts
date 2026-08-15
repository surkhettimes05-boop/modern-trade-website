import { query } from "../database/connection.js";

interface EarnLot {
  id: string;
  customer_id: string;
  ledger_entry_id: string;
  original_points: number;
  remaining_points: number;
  available_date: Date;
  expiry_date: Date;
  is_expired: boolean;
  expired_at?: Date;
  created_at: Date;
}

interface CreateEarnLotInput {
  customer_id: string;
  ledger_entry_id: string;
  original_points: number;
  available_date: Date;
  expiry_date: Date;
}

export class EarnLotsService {
  /**
   * Create an earn lot for tracking point expiry
   */
  async createEarnLot(input: CreateEarnLotInput): Promise<EarnLot> {
    const result = await query(
      `INSERT INTO loyalty_earn_lots (
        customer_id, ledger_entry_id, original_points, remaining_points,
        available_date, expiry_date
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        input.customer_id,
        input.ledger_entry_id,
        input.original_points,
        input.original_points, // Remaining starts equal to original
        input.available_date,
        input.expiry_date,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get earn lots for a customer
   */
  async getCustomerEarnLots(
    customerId: string,
    includeExpired = false,
  ): Promise<EarnLot[]> {
    let queryStr = `
      SELECT * FROM loyalty_earn_lots 
      WHERE customer_id = $1
    `;
    const params: any[] = [customerId];

    if (!includeExpired) {
      queryStr += " AND is_expired = false AND expiry_date > CURRENT_TIMESTAMP";
    }

    queryStr += " ORDER BY expiry_date ASC";

    const result = await query(queryStr, params);
    return result.rows;
  }

  /**
   * Get earn lot by ledger entry ID
   */
  async getByLedgerEntryId(ledgerEntryId: string): Promise<EarnLot | null> {
    const result = await query(
      "SELECT * FROM loyalty_earn_lots WHERE ledger_entry_id = $1",
      [ledgerEntryId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Deduct points from earn lots (FIFO - First In First Out)
   */
  async deductPoints(
    customerId: string,
    pointsToDeduct: number,
  ): Promise<EarnLot[]> {
    if (pointsToDeduct <= 0) {
      throw new Error("Points to deduct must be positive");
    }

    // Get available earn lots (oldest first)
    const earnLots = await this.getCustomerEarnLots(customerId, false);
    let remainingToDeduct = pointsToDeduct;
    const updatedLots: EarnLot[] = [];

    for (const lot of earnLots) {
      if (remainingToDeduct <= 0) break;

      const deductFromLot = Math.min(remainingToDeduct, lot.remaining_points);
      const newRemaining = lot.remaining_points - deductFromLot;

      await query(
        `UPDATE loyalty_earn_lots 
         SET remaining_points = $1 
         WHERE id = $2`,
        [newRemaining, lot.id],
      );

      updatedLots.push({ ...lot, remaining_points: newRemaining });
      remainingToDeduct -= deductFromLot;
    }

    if (remainingToDeduct > 0) {
      throw new Error("Insufficient points available");
    }

    return updatedLots;
  }

  /**
   * Restore points to earn lots (for reversals)
   */
  async restorePoints(
    customerId: string,
    pointsToRestore: number,
    ledgerEntryId: string,
  ): Promise<void> {
    if (pointsToRestore <= 0) {
      throw new Error("Points to restore must be positive");
    }

    // Find the earn lot associated with the original earn entry
    const originalLot = await this.getByLedgerEntryId(ledgerEntryId);

    if (originalLot) {
      // Restore to the original lot
      const newRemaining = originalLot.remaining_points + pointsToRestore;

      await query(
        `UPDATE loyalty_earn_lots 
         SET remaining_points = $1, is_expired = false 
         WHERE id = $2`,
        [newRemaining, originalLot.id],
      );
    } else {
      // If original lot not found, create a new one
      await this.createEarnLot({
        customer_id: customerId,
        ledger_entry_id: ledgerEntryId,
        original_points: pointsToRestore,
        available_date: new Date(),
        expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Default 1 year
      });
    }
  }

  /**
   * Process expired earn lots
   */
  async processExpiry(): Promise<number> {
    // Find expired lots that haven't been processed
    const result = await query(
      `SELECT * FROM loyalty_earn_lots 
       WHERE is_expired = false 
         AND expiry_date < CURRENT_TIMESTAMP 
         AND remaining_points > 0`,
    );

    const expiredLots = result.rows;
    let processedCount = 0;

    for (const lot of expiredLots) {
      // Mark as expired
      await query(
        `UPDATE loyalty_earn_lots 
         SET is_expired = true, expired_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [lot.id],
      );

      // Create expiry ledger entry
      await query(
        `INSERT INTO loyalty_ledger (
          customer_id, points_signed, entry_type, entry_status, effective_timestamp,
          source_type, actor, reason, calculation_metadata
        ) VALUES ($1, $2, 'EXPIRE', 'POSTED', $3, $4, $5, $6, $7)`,
        [
          lot.customer_id,
          -lot.remaining_points,
          lot.expiry_date,
          "EXPIRY_JOB",
          "SYSTEM",
          "Points expired",
          JSON.stringify({
            earn_lot_id: lot.id,
            expired_points: lot.remaining_points,
          }),
        ],
      );

      processedCount++;
    }

    return processedCount;
  }

  /**
   * Get points expiring soon (for customer notification)
   */
  async getExpiringPoints(
    customerId: string,
    daysAhead = 30,
  ): Promise<{
    total_expiring: number;
    lots: EarnLot[];
  }> {
    const expiryDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

    const result = await query(
      `SELECT * FROM loyalty_earn_lots 
       WHERE customer_id = $1 
         AND is_expired = false 
         AND expiry_date <= $2 
         AND remaining_points > 0
       ORDER BY expiry_date ASC`,
      [customerId, expiryDate],
    );

    const lots = result.rows;
    const totalExpiring = lots.reduce(
      (sum: number, lot: EarnLot) => sum + lot.remaining_points,
      0,
    );

    return {
      total_expiring: totalExpiring,
      lots,
    };
  }

  /**
   * Calculate available balance from earn lots
   */
  async calculateAvailableBalance(customerId: string): Promise<number> {
    const result = await query(
      `SELECT SUM(remaining_points) as total 
       FROM loyalty_earn_lots 
       WHERE customer_id = $1 
         AND is_expired = false 
         AND available_date <= CURRENT_TIMESTAMP 
         AND expiry_date > CURRENT_TIMESTAMP`,
      [customerId],
    );

    return parseInt(result.rows[0].total) || 0;
  }

  /**
   * Get earn lots statistics
   */
  async getEarnLotsStats(customerId?: string): Promise<any> {
    let queryStr = `
      SELECT 
        COUNT(*) as total_lots,
        SUM(original_points) as total_original,
        SUM(remaining_points) as total_remaining,
        COUNT(CASE WHEN is_expired = true THEN 1 END) as expired_lots,
        COUNT(CASE WHEN is_expired = false AND expiry_date < CURRENT_TIMESTAMP THEN 1 END) as pending_expiry
      FROM loyalty_earn_lots
    `;
    const params: any[] = [];

    if (customerId) {
      queryStr += " WHERE customer_id = $1";
      params.push(customerId);
    }

    const result = await query(queryStr, params);
    return result.rows[0];
  }
}
