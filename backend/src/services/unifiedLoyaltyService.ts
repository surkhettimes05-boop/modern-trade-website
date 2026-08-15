import { query } from "../database/connection.js";
import { loyaltyService } from "./loyaltyService.js";

interface UnifiedLoyaltyTransaction {
  id: string;
  transaction_id: string;
  channel: string;
  channel_reference_id: string;
  device_id: string;
  customer_id: string;
  loyalty_account_id: string;
  transaction_type: string;
  points: number;
  balance_after: number;
  reference_type: string;
  reference_id: string;
  amount: number;
  currency: string;
  description: string;
  occurred_at: Date;
  processed_at: Date;
  created_by: string;
  metadata: any;
}

interface LoyaltyChannelMapping {
  id: string;
  customer_id: string;
  channel: string;
  channel_customer_id: string;
  loyalty_account_id: string;
  is_primary: boolean;
  is_verified: boolean;
  linked_at: Date;
  metadata: any;
}

export class UnifiedLoyaltyService {
  /**
   * Record unified loyalty transaction
   */
  async recordTransaction(transactionData: {
    channel: string;
    channel_reference_id?: string;
    device_id?: string;
    customer_id: string;
    transaction_type: string;
    points: number;
    reference_type?: string;
    reference_id?: string;
    amount?: number;
    description?: string;
    created_by?: string;
    metadata?: any;
  }): Promise<UnifiedLoyaltyTransaction> {
    // Get or create loyalty account
    const account = await this.getOrCreateLoyaltyAccount(
      transactionData.customer_id,
    );

    // Calculate balance after
    const currentBalance = account.current_points;
    const balanceAfter = currentBalance + transactionData.points;

    const transactionId = this.generateTransactionId();

    const result = await query(
      `INSERT INTO unified_loyalty_transactions (
        transaction_id, channel, channel_reference_id, device_id, customer_id,
        loyalty_account_id, transaction_type, points, balance_after,
        reference_type, reference_id, amount, description, created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        transactionId,
        transactionData.channel,
        transactionData.channel_reference_id || null,
        transactionData.device_id || null,
        transactionData.customer_id,
        account.id,
        transactionData.transaction_type,
        transactionData.points,
        balanceAfter,
        transactionData.reference_type || null,
        transactionData.reference_id || null,
        transactionData.amount || null,
        transactionData.description || null,
        transactionData.created_by || null,
        JSON.stringify(transactionData.metadata || {}),
      ],
    );

    // Update loyalty account balance
    await loyaltyService.earnPoints(account.id, transactionData.points, {
      reference_type: transactionData.reference_type,
      reference_id: transactionData.reference_id,
      description: transactionData.description,
      created_by: transactionData.created_by,
    });

    return result.rows[0];
  }

  /**
   * Get or create loyalty account for customer
   */
  private async getOrCreateLoyaltyAccount(customerId: string): Promise<any> {
    // Check if customer has a loyalty account
    const existingAccount = await query(
      `SELECT cla.* FROM customer_loyalty_accounts cla
       WHERE cla.customer_id = $1
       LIMIT 1`,
      [customerId],
    );

    if (existingAccount.rows.length > 0) {
      return existingAccount.rows[0];
    }

    // Get active loyalty program for customer's store
    const customer = await query(
      "SELECT home_store_id FROM customers WHERE id = $1",
      [customerId],
    );

    if (customer.rows.length === 0 || !customer.rows[0].home_store_id) {
      throw new Error("Customer home store not found");
    }

    const program = await loyaltyService.getActiveProgramForStore(
      customer.rows[0].home_store_id,
    );
    if (!program) {
      throw new Error("No active loyalty program found");
    }

    // Create loyalty account
    const account = await loyaltyService.enrollCustomer({
      customer_id: customerId,
      program_id: program.id,
    });

    return account;
  }

  /**
   * Link customer channel to loyalty account
   */
  async linkChannel(linkData: {
    customer_id: string;
    channel: string;
    channel_customer_id: string;
    is_primary?: boolean;
    metadata?: any;
  }): Promise<LoyaltyChannelMapping> {
    const result = await query(
      `INSERT INTO loyalty_channel_mappings (
        customer_id, channel, channel_customer_id, is_primary, metadata
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (customer_id, channel, channel_customer_id) 
      DO UPDATE SET is_primary = $4, metadata = $5
      RETURNING *`,
      [
        linkData.customer_id,
        linkData.channel,
        linkData.channel_customer_id,
        linkData.is_primary || false,
        JSON.stringify(linkData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get loyalty account by channel customer ID
   */
  async getAccountByChannel(
    channel: string,
    channelCustomerId: string,
  ): Promise<LoyaltyChannelMapping | null> {
    const result = await query(
      `SELECT lcm.*, cla.current_points, cla.current_tier
       FROM loyalty_channel_mappings lcm
       JOIN customer_loyalty_accounts cla ON lcm.loyalty_account_id = cla.id
       WHERE lcm.channel = $1 AND lcm.channel_customer_id = $2 AND lcm.is_verified = TRUE
       LIMIT 1`,
      [channel, channelCustomerId],
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get unified transactions for customer
   */
  async getCustomerTransactions(
    customerId: string,
    limit = 50,
  ): Promise<UnifiedLoyaltyTransaction[]> {
    const result = await query(
      `SELECT * FROM unified_loyalty_transactions 
       WHERE customer_id = $1 
       ORDER BY occurred_at DESC 
       LIMIT $2`,
      [customerId, limit],
    );
    return result.rows;
  }

  /**
   * Get unified transactions by channel
   */
  async getTransactionsByChannel(
    channel: string,
    limit = 100,
  ): Promise<UnifiedLoyaltyTransaction[]> {
    const result = await query(
      `SELECT * FROM unified_loyalty_transactions 
       WHERE channel = $1 
       ORDER BY occurred_at DESC 
       LIMIT $2`,
      [channel, limit],
    );
    return result.rows;
  }

  /**
   * Get unified loyalty statistics
   */
  async getUnifiedStatistics(
    filters: {
      channel?: string;
      start_date?: Date;
      end_date?: Date;
    } = {},
  ): Promise<any> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (filters.channel) {
      conditions.push("channel = $1");
      values.push(filters.channel);
    }

    if (filters.start_date) {
      conditions.push(`occurred_at >= $${values.length + 1}`);
      values.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`occurred_at <= $${values.length + 1}`);
      values.push(filters.end_date);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT 
        channel,
        transaction_type,
        COUNT(*) as transaction_count,
        SUM(points) as total_points,
        SUM(amount) as total_amount,
        COUNT(DISTINCT customer_id) as unique_customers
       FROM unified_loyalty_transactions
       ${whereClause}
       GROUP BY channel, transaction_type
       ORDER BY channel, transaction_type`,
      values,
    );

    return result.rows;
  }

  /**
   * Sync loyalty balance across channels
   */
  async syncBalanceAcrossChannels(customerId: string): Promise<void> {
    // Get customer's loyalty account
    const account = await query(
      `SELECT cla.* FROM customer_loyalty_accounts cla
       WHERE cla.customer_id = $1
       LIMIT 1`,
      [customerId],
    );

    if (account.rows.length === 0) {
      throw new Error("Loyalty account not found");
    }

    // Get all channel mappings for customer
    const mappings = await query(
      `SELECT * FROM loyalty_channel_mappings WHERE customer_id = $1`,
      [customerId],
    );

    // For each channel, trigger balance sync
    for (const mapping of mappings.rows) {
      // In production, this would call external APIs to sync balance
      console.log(
        `Syncing balance for channel ${mapping.channel}, customer ${mapping.channel_customer_id}: ${account.rows[0].current_points}`,
      );
    }
  }

  /**
   * Generate transaction ID
   */
  private generateTransactionId(): string {
    return `ULT-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

export const unifiedLoyaltyService = new UnifiedLoyaltyService();
