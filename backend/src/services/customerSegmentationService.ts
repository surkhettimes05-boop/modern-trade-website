import { query } from "../database/connection.js";

interface CustomerSegment {
  id: string;
  segment_id: string;
  store_id: string;
  name: string;
  description: string;
  rules: any;
  customer_count: number;
  last_calculated_at: Date;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  metadata: any;
}

interface CustomerSegmentMembership {
  id: string;
  customer_id: string;
  segment_id: string;
  score: number;
  calculated_at: Date;
  metadata: any;
}

export class CustomerSegmentationService {
  /**
   * Create customer segment
   */
  async createSegment(segmentData: {
    store_id: string;
    name: string;
    description?: string;
    rules: any;
    created_by?: string;
    metadata?: any;
  }): Promise<CustomerSegment> {
    const segmentId = this.generateSegmentId();

    const result = await query(
      `INSERT INTO customer_segments (
        segment_id, store_id, name, description, rules, created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        segmentId,
        segmentData.store_id,
        segmentData.name,
        segmentData.description || null,
        JSON.stringify(segmentData.rules),
        segmentData.created_by || null,
        JSON.stringify(segmentData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get segment by ID
   */
  async getSegment(segmentId: string): Promise<CustomerSegment | null> {
    const result = await query(
      "SELECT * FROM customer_segments WHERE segment_id = $1",
      [segmentId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get active segments for store
   */
  async getActiveSegmentsForStore(storeId: string): Promise<CustomerSegment[]> {
    const result = await query(
      `SELECT * FROM customer_segments 
       WHERE store_id = $1 AND is_active = TRUE 
       ORDER BY created_at DESC`,
      [storeId],
    );
    return result.rows;
  }

  /**
   * Calculate segment memberships (RFM analysis)
   */
  async calculateSegmentMemberships(segmentId: string): Promise<void> {
    const segment = await this.getSegment(segmentId);
    if (!segment) {
      throw new Error("Segment not found");
    }

    const rules = segment.rules;
    const storeId = segment.store_id;

    // Get all customers for the store
    const customers = await query(
      `SELECT id FROM customers WHERE store_id = $1`,
      [storeId],
    );

    let memberCount = 0;

    for (const customer of customers.rows) {
      const customerId = customer.id;
      const score = await this.calculateCustomerScore(customerId, rules);

      if (score >= (rules.min_score || 0)) {
        // Check if membership already exists
        const existing = await query(
          `SELECT id FROM customer_segment_memberships 
           WHERE customer_id = $1 AND segment_id = $2`,
          [customerId, segment.id],
        );

        if (existing.rows.length > 0) {
          // Update existing
          await query(
            `UPDATE customer_segment_memberships 
             SET score = $1, calculated_at = NOW()
             WHERE customer_id = $2 AND segment_id = $3`,
            [score, customerId, segment.id],
          );
        } else {
          // Create new
          await query(
            `INSERT INTO customer_segment_memberships (customer_id, segment_id, score, calculated_at)
             VALUES ($1, $2, $3, NOW())`,
            [customerId, segment.id, score],
          );
        }
        memberCount++;
      } else {
        // Remove membership if score is below threshold
        await query(
          `DELETE FROM customer_segment_memberships 
           WHERE customer_id = $1 AND segment_id = $2`,
          [customerId, segment.id],
        );
      }
    }

    // Update segment customer count
    await query(
      `UPDATE customer_segments 
       SET customer_count = $1, last_calculated_at = NOW()
       WHERE id = $2`,
      [memberCount, segment.id],
    );
  }

  /**
   * Calculate customer score based on segment rules
   */
  private async calculateCustomerScore(
    customerId: string,
    rules: any,
  ): Promise<number> {
    let score = 0;

    // RFM Analysis (Recency, Frequency, Monetary)
    if (rules.rfm) {
      const rfmScore = await this.calculateRFMScore(customerId, rules.rfm);
      score += rfmScore;
    }

    // Behavior rules
    if (rules.behavior) {
      const behaviorScore = await this.calculateBehaviorScore(
        customerId,
        rules.behavior,
      );
      score += behaviorScore;
    }

    // Demographic rules
    if (rules.demographic) {
      const demographicScore = await this.calculateDemographicScore(
        customerId,
        rules.demographic,
      );
      score += demographicScore;
    }

    return score;
  }

  /**
   * Calculate RFM score
   */
  private async calculateRFMScore(
    customerId: string,
    rfmRules: any,
  ): Promise<number> {
    let score = 0;

    // Recency - days since last order
    const recencyResult = await query(
      `SELECT EXTRACT(DAY FROM (NOW() - MAX(created_at))) as days_since_last_order
       FROM web_orders 
       WHERE customer_id = $1 AND status = 'DELIVERED'`,
      [customerId],
    );

    if (
      recencyResult.rows.length > 0 &&
      recencyResult.rows[0].days_since_last_order !== null
    ) {
      const daysSinceLastOrder = parseInt(
        recencyResult.rows[0].days_since_last_order,
      );
      if (daysSinceLastOrder <= 30) score += (rfmRules.recency_weight || 1) * 3;
      else if (daysSinceLastOrder <= 90)
        score += (rfmRules.recency_weight || 1) * 2;
      else if (daysSinceLastOrder <= 180)
        score += (rfmRules.recency_weight || 1) * 1;
    }

    // Frequency - number of orders in last 90 days
    const frequencyResult = await query(
      `SELECT COUNT(*) as order_count
       FROM web_orders 
       WHERE customer_id = $1 AND status = 'DELIVERED'
       AND created_at >= NOW() - INTERVAL '90 days'`,
      [customerId],
    );

    if (frequencyResult.rows.length > 0) {
      const orderCount = parseInt(frequencyResult.rows[0].order_count);
      if (orderCount >= 10) score += (rfmRules.frequency_weight || 1) * 3;
      else if (orderCount >= 5) score += (rfmRules.frequency_weight || 1) * 2;
      else if (orderCount >= 2) score += (rfmRules.frequency_weight || 1) * 1;
    }

    // Monetary - total spend in last 90 days
    const monetaryResult = await query(
      `SELECT COALESCE(SUM(total_amount), 0) as total_spend
       FROM web_orders 
       WHERE customer_id = $1 AND status = 'DELIVERED'
       AND created_at >= NOW() - INTERVAL '90 days'`,
      [customerId],
    );

    if (monetaryResult.rows.length > 0) {
      const totalSpend = parseFloat(monetaryResult.rows[0].total_spend);
      if (totalSpend >= 10000) score += (rfmRules.monetary_weight || 1) * 3;
      else if (totalSpend >= 5000) score += (rfmRules.monetary_weight || 1) * 2;
      else if (totalSpend >= 1000) score += (rfmRules.monetary_weight || 1) * 1;
    }

    return score;
  }

  /**
   * Calculate behavior score
   */
  private async calculateBehaviorScore(
    customerId: string,
    behaviorRules: any,
  ): Promise<number> {
    let score = 0;

    // Loyalty participation
    if (behaviorRules.loyalty_participation) {
      const loyaltyResult = await query(
        `SELECT COUNT(*) as account_count FROM customer_loyalty_accounts WHERE customer_id = $1`,
        [customerId],
      );
      if (parseInt(loyaltyResult.rows[0].account_count) > 0) {
        score += behaviorRules.loyalty_participation || 1;
      }
    }

    // Coupon usage
    if (behaviorRules.coupon_usage) {
      const couponResult = await query(
        `SELECT COUNT(*) as usage_count FROM coupon_usages WHERE customer_id = $1`,
        [customerId],
      );
      const usageCount = parseInt(couponResult.rows[0].usage_count);
      if (usageCount >= 5) score += (behaviorRules.coupon_usage || 1) * 2;
      else if (usageCount >= 1) score += behaviorRules.coupon_usage || 1;
    }

    // Return rate
    if (behaviorRules.low_return_rate) {
      const returnResult = await query(
        `SELECT 
          COUNT(CASE WHEN status = 'RETURNED' THEN 1 END) as returned,
          COUNT(*) as total
         FROM web_orders 
         WHERE customer_id = $1`,
        [customerId],
      );
      const returned = parseInt(returnResult.rows[0].returned);
      const total = parseInt(returnResult.rows[0].total);
      if (total > 0 && returned / total < 0.1) {
        score += behaviorRules.low_return_rate || 1;
      }
    }

    return score;
  }

  /**
   * Calculate demographic score
   */
  private async calculateDemographicScore(
    customerId: string,
    demographicRules: any,
  ): Promise<number> {
    let score = 0;

    const customer = await query("SELECT * FROM customers WHERE id = $1", [
      customerId,
    ]);

    if (customer.rows.length === 0) {
      return 0;
    }

    const customerData = customer.rows[0];

    // Age group
    if (demographicRules.age_groups && customerData.date_of_birth) {
      const age = this.calculateAge(customerData.date_of_birth);
      if (demographicRules.age_groups.includes(age)) {
        score += 1;
      }
    }

    // Location
    if (demographicRules.locations && customerData.city) {
      if (demographicRules.locations.includes(customerData.city)) {
        score += 1;
      }
    }

    return score;
  }

  /**
   * Calculate age from date of birth
   */
  private calculateAge(dateOfBirth: Date): number {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }
    return age;
  }

  /**
   * Get customer segments
   */
  async getCustomerSegments(
    customerId: string,
  ): Promise<CustomerSegmentMembership[]> {
    const result = await query(
      `SELECT csm.*, cs.name as segment_name, cs.description as segment_description
       FROM customer_segment_memberships csm
       JOIN customer_segments cs ON csm.segment_id = cs.id
       WHERE csm.customer_id = $1 AND cs.is_active = TRUE
       ORDER BY csm.score DESC`,
      [customerId],
    );
    return result.rows;
  }

  /**
   * Get segment members
   */
  async getSegmentMembers(
    segmentId: string,
    limit = 100,
  ): Promise<CustomerSegmentMembership[]> {
    const result = await query(
      `SELECT csm.*, c.name as customer_name, c.email as customer_email
       FROM customer_segment_memberships csm
       JOIN customers c ON csm.customer_id = c.id
       WHERE csm.segment_id = (SELECT id FROM customer_segments WHERE segment_id = $1)
       ORDER BY csm.score DESC
       LIMIT $2`,
      [segmentId, limit],
    );
    return result.rows;
  }

  /**
   * Update segment status
   */
  async updateSegmentStatus(
    segmentId: string,
    isActive: boolean,
  ): Promise<CustomerSegment> {
    const result = await query(
      `UPDATE customer_segments SET is_active = $1, updated_at = NOW() 
       WHERE segment_id = $2 RETURNING *`,
      [isActive, segmentId],
    );
    return result.rows[0];
  }

  /**
   * Generate segment ID
   */
  private generateSegmentId(): string {
    return `SEG-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

export const customerSegmentationService = new CustomerSegmentationService();
