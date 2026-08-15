import { query } from "../database/connection.js";

interface LoyaltyProgram {
  id: string;
  program_id: string;
  store_id: string;
  name: string;
  description: string;
  points_per_currency: number;
  currency_value_per_point: number;
  is_active: boolean;
  start_date: Date;
  end_date: Date;
  enable_tiers: boolean;
  tier_config: any;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  metadata: any;
}

interface CustomerLoyaltyAccount {
  id: string;
  account_id: string;
  customer_id: string;
  program_id: string;
  current_points: number;
  earned_points: number;
  redeemed_points: number;
  expired_points: number;
  current_tier: string;
  tier_progress: any;
  status: string;
  enrolled_at: Date;
  last_activity_at: Date;
  created_by: string;
  metadata: any;
}

interface LoyaltyPointTransaction {
  id: string;
  transaction_id: string;
  account_id: string;
  transaction_type: string;
  points: number;
  balance_after: number;
  reference_type: string;
  reference_id: string;
  description: string;
  created_at: Date;
  created_by: string;
  metadata: any;
}

export class LoyaltyService {
  /**
   * Create loyalty program
   */
  async createProgram(programData: {
    store_id: string;
    name: string;
    description?: string;
    points_per_currency?: number;
    currency_value_per_point?: number;
    enable_tiers?: boolean;
    tier_config?: any;
    start_date?: Date;
    end_date?: Date;
    created_by?: string;
    metadata?: any;
  }): Promise<LoyaltyProgram> {
    const programId = this.generateProgramId();

    const result = await query(
      `INSERT INTO loyalty_programs (
        program_id, store_id, name, description, points_per_currency,
        currency_value_per_point, enable_tiers, tier_config, start_date,
        end_date, created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        programId,
        programData.store_id,
        programData.name,
        programData.description || null,
        programData.points_per_currency || 1.0,
        programData.currency_value_per_point || 0.01,
        programData.enable_tiers || false,
        JSON.stringify(programData.tier_config || {}),
        programData.start_date || null,
        programData.end_date || null,
        programData.created_by || null,
        JSON.stringify(programData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get program by ID
   */
  async getProgram(programId: string): Promise<LoyaltyProgram | null> {
    const result = await query(
      "SELECT * FROM loyalty_programs WHERE program_id = $1",
      [programId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get active program for store
   */
  async getActiveProgramForStore(
    storeId: string,
  ): Promise<LoyaltyProgram | null> {
    const result = await query(
      `SELECT * FROM loyalty_programs 
       WHERE store_id = $1 AND is_active = TRUE 
       AND (start_date IS NULL OR start_date <= NOW())
       AND (end_date IS NULL OR end_date >= NOW())
       ORDER BY created_at DESC
       LIMIT 1`,
      [storeId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Enroll customer in program
   */
  async enrollCustomer(enrollmentData: {
    customer_id: string;
    program_id: string;
    created_by?: string;
    metadata?: any;
  }): Promise<CustomerLoyaltyAccount> {
    const accountId = this.generateAccountId();

    const result = await query(
      `INSERT INTO customer_loyalty_accounts (
        account_id, customer_id, program_id, status, created_by, metadata
      ) VALUES ($1, $2, $3, 'ACTIVE', $4, $5)
      RETURNING *`,
      [
        accountId,
        enrollmentData.customer_id,
        enrollmentData.program_id,
        enrollmentData.created_by || null,
        JSON.stringify(enrollmentData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get customer account
   */
  async getCustomerAccount(
    customerId: string,
    programId: string,
  ): Promise<CustomerLoyaltyAccount | null> {
    const result = await query(
      "SELECT * FROM customer_loyalty_accounts WHERE customer_id = $1 AND program_id = $2",
      [customerId, programId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Earn points
   */
  async earnPoints(
    accountId: string,
    points: number,
    options: {
      reference_type?: string;
      reference_id?: string;
      description?: string;
      created_by?: string;
      metadata?: any;
    } = {},
  ): Promise<LoyaltyPointTransaction> {
    const account = await query(
      "SELECT * FROM customer_loyalty_accounts WHERE id = $1",
      [accountId],
    );

    if (account.rows.length === 0) {
      throw new Error("Account not found");
    }

    const currentBalance = account.rows[0].current_points;
    const newBalance = currentBalance + points;
    const transactionId = this.generateTransactionId();

    // Create transaction
    const transactionResult = await query(
      `INSERT INTO loyalty_point_transactions (
        transaction_id, account_id, transaction_type, points, balance_after,
        reference_type, reference_id, description, created_by, metadata
      ) VALUES ($1, $2, 'EARN', $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        transactionId,
        accountId,
        points,
        newBalance,
        options.reference_type || null,
        options.reference_id || null,
        options.description || null,
        options.created_by || null,
        JSON.stringify(options.metadata || {}),
      ],
    );

    // Update account balance
    await query(
      `UPDATE customer_loyalty_accounts 
       SET current_points = $1, earned_points = earned_points + $2, last_activity_at = NOW()
       WHERE id = $3`,
      [newBalance, points, accountId],
    );

    return transactionResult.rows[0];
  }

  /**
   * Redeem points
   */
  async redeemPoints(
    accountId: string,
    points: number,
    options: {
      reference_type?: string;
      reference_id?: string;
      description?: string;
      created_by?: string;
      metadata?: any;
    } = {},
  ): Promise<LoyaltyPointTransaction> {
    const account = await query(
      "SELECT * FROM customer_loyalty_accounts WHERE id = $1",
      [accountId],
    );

    if (account.rows.length === 0) {
      throw new Error("Account not found");
    }

    const currentBalance = account.rows[0].current_points;

    if (currentBalance < points) {
      throw new Error("Insufficient points");
    }

    const newBalance = currentBalance - points;
    const transactionId = this.generateTransactionId();

    // Create transaction
    const transactionResult = await query(
      `INSERT INTO loyalty_point_transactions (
        transaction_id, account_id, transaction_type, points, balance_after,
        reference_type, reference_id, description, created_by, metadata
      ) VALUES ($1, $2, 'REDEEM', $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        transactionId,
        accountId,
        -points,
        newBalance,
        options.reference_type || null,
        options.reference_id || null,
        options.description || null,
        options.created_by || null,
        JSON.stringify(options.metadata || {}),
      ],
    );

    // Update account balance
    await query(
      `UPDATE customer_loyalty_accounts 
       SET current_points = $1, redeemed_points = redeemed_points + $2, last_activity_at = NOW()
       WHERE id = $3`,
      [newBalance, points, accountId],
    );

    return transactionResult.rows[0];
  }

  /**
   * Get point transactions for account
   */
  async getPointTransactions(
    accountId: string,
    limit = 50,
  ): Promise<LoyaltyPointTransaction[]> {
    const result = await query(
      `SELECT * FROM loyalty_point_transactions 
       WHERE account_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [accountId, limit],
    );
    return result.rows;
  }

  /**
   * Calculate points for order
   */
  async calculatePointsForOrder(
    orderAmount: number,
    programId: string,
  ): Promise<number> {
    const program = await this.getProgram(programId);
    if (!program) {
      throw new Error("Program not found");
    }

    return Math.floor(orderAmount * program.points_per_currency);
  }

  /**
   * Get account summary
   */
  async getAccountSummary(accountId: string): Promise<any> {
    const account = await query(
      "SELECT * FROM customer_loyalty_accounts WHERE id = $1",
      [accountId],
    );

    if (account.rows.length === 0) {
      throw new Error("Account not found");
    }

    const transactions = await query(
      `SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN transaction_type = 'EARN' THEN points ELSE 0 END) as total_earned,
        SUM(CASE WHEN transaction_type = 'REDEEM' THEN points ELSE 0 END) as total_redeemed
       FROM loyalty_point_transactions 
       WHERE account_id = $1`,
      [accountId],
    );

    return {
      account: account.rows[0],
      summary: transactions.rows[0],
    };
  }

  /**
   * Generate program ID
   */
  private generateProgramId(): string {
    return `LOY-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Generate account ID
   */
  private generateAccountId(): string {
    return `ACC-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Generate transaction ID
   */
  private generateTransactionId(): string {
    return `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

export const loyaltyService = new LoyaltyService();
