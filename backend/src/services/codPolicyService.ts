import { query } from "../database/connection.js";

interface CODPolicy {
  id: string;
  policy_name: string;
  store_id: string;
  max_cod_amount: number;
  min_cod_amount: number;
  restricted_zones: string[];
  restricted_categories: string[];
  high_value_threshold: number;
  high_value_cod_allowed: boolean;
  allow_for_risk_customers: boolean;
  prepaid_only_for_new_customers: boolean;
  prepaid_only_days_after_registration: number;
  max_failed_deliveries: number;
  failed_delivery_block_days: number;
  is_active: boolean;
  effective_date: Date;
  expiry_date: Date;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  approved_by: string;
  approved_at: Date;
  metadata: any;
}

export class CODPolicyService {
  /**
   * Create COD policy
   */
  async createCODPolicy(policyData: {
    policy_name: string;
    store_id: string;
    max_cod_amount?: number;
    min_cod_amount?: number;
    restricted_zones?: string[];
    restricted_categories?: string[];
    high_value_threshold?: number;
    high_value_cod_allowed?: boolean;
    allow_for_risk_customers?: boolean;
    prepaid_only_for_new_customers?: boolean;
    prepaid_only_days_after_registration?: number;
    max_failed_deliveries?: number;
    failed_delivery_block_days?: number;
    effective_date?: Date;
    expiry_date?: Date;
    created_by?: string;
    approved_by?: string;
    approved_at?: Date;
    metadata?: any;
  }): Promise<CODPolicy> {
    const result = await query(
      `INSERT INTO cod_policies (
        policy_name, store_id, max_cod_amount, min_cod_amount, restricted_zones,
        restricted_categories, high_value_threshold, high_value_cod_allowed,
        allow_for_risk_customers, prepaid_only_for_new_customers,
        prepaid_only_days_after_registration, max_failed_deliveries,
        failed_delivery_block_days, effective_date, expiry_date,
        created_by, approved_by, approved_at, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
      [
        policyData.policy_name,
        policyData.store_id,
        policyData.max_cod_amount || null,
        policyData.min_cod_amount || null,
        policyData.restricted_zones || [],
        policyData.restricted_categories || [],
        policyData.high_value_threshold || null,
        policyData.high_value_cod_allowed || false,
        policyData.allow_for_risk_customers || false,
        policyData.prepaid_only_for_new_customers || false,
        policyData.prepaid_only_days_after_registration || null,
        policyData.max_failed_deliveries || null,
        policyData.failed_delivery_block_days || null,
        policyData.effective_date || new Date(),
        policyData.expiry_date || null,
        policyData.created_by || null,
        policyData.approved_by || null,
        policyData.approved_at || null,
        JSON.stringify(policyData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get COD policy by ID
   */
  async getCODPolicy(policyId: string): Promise<CODPolicy | null> {
    const result = await query("SELECT * FROM cod_policies WHERE id = $1", [
      policyId,
    ]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get active COD policy for store
   */
  async getActiveCODPolicy(storeId: string): Promise<CODPolicy | null> {
    const result = await query(
      `SELECT * FROM cod_policies 
       WHERE store_id = $1 AND is_active = TRUE
       AND (effective_date IS NULL OR effective_date <= NOW())
       AND (expiry_date IS NULL OR expiry_date >= NOW())
       ORDER BY created_at DESC
       LIMIT 1`,
      [storeId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get all COD policies for store
   */
  async getStoreCODPolicies(storeId: string): Promise<CODPolicy[]> {
    const result = await query(
      "SELECT * FROM cod_policies WHERE store_id = $1 ORDER BY created_at DESC",
      [storeId],
    );
    return result.rows;
  }

  /**
   * Check COD eligibility
   */
  async checkCODEligibility(checkData: {
    order_total: number;
    customer_id?: string;
    delivery_zone_id?: string;
    product_categories?: string[];
    store_id?: string;
  }): Promise<{ eligible: boolean; reason: string | null }> {
    const policy = checkData.store_id
      ? await this.getActiveCODPolicy(checkData.store_id)
      : await query(
          "SELECT * FROM cod_policies WHERE is_active = TRUE LIMIT 1",
        ).then((r) => r.rows[0] || null);

    if (!policy) {
      // No policy means COD is allowed
      return { eligible: true, reason: null };
    }

    // Check max amount
    if (
      policy.max_cod_amount &&
      checkData.order_total > policy.max_cod_amount
    ) {
      return {
        eligible: false,
        reason: `Order amount exceeds maximum COD limit of ${policy.max_cod_amount}`,
      };
    }

    // Check min amount
    if (
      policy.min_cod_amount &&
      checkData.order_total < policy.min_cod_amount
    ) {
      return {
        eligible: false,
        reason: `Order amount below minimum COD limit of ${policy.min_cod_amount}`,
      };
    }

    // Check zone restrictions
    if (
      checkData.delivery_zone_id &&
      policy.restricted_zones?.includes(checkData.delivery_zone_id)
    ) {
      return {
        eligible: false,
        reason: "COD not available for this delivery zone",
      };
    }

    // Check category restrictions
    if (
      checkData.product_categories &&
      policy.restricted_categories?.length > 0
    ) {
      const hasRestrictedCategory = checkData.product_categories.some((cat) =>
        policy.restricted_categories.includes(cat),
      );
      if (hasRestrictedCategory) {
        return {
          eligible: false,
          reason: "COD not available for selected product categories",
        };
      }
    }

    // Check high-value items
    if (
      policy.high_value_threshold &&
      checkData.order_total >= policy.high_value_threshold &&
      !policy.high_value_cod_allowed
    ) {
      return {
        eligible: false,
        reason: "COD not available for high-value orders",
      };
    }

    // Check new customer prepaid requirement
    if (policy.prepaid_only_for_new_customers && checkData.customer_id) {
      const customerResult = await query(
        "SELECT EXTRACT(DAY FROM (NOW() - created_at)) as days_since_registration FROM customers WHERE id = $1",
        [checkData.customer_id],
      );

      if (customerResult.rows.length > 0) {
        const daysSinceRegistration = parseInt(
          customerResult.rows[0].days_since_registration,
        );
        if (
          daysSinceRegistration <
          (policy.prepaid_only_days_after_registration || 0)
        ) {
          return {
            eligible: false,
            reason: "Prepaid only for new customers",
          };
        }
      }
    }

    // Check customer risk (simplified - would need actual customer risk data)
    if (!policy.allow_for_risk_customers && checkData.customer_id) {
      // Would check customer risk flag here
      // For now, we'll skip this check
    }

    return { eligible: true, reason: null };
  }

  /**
   * Update COD policy
   */
  async updateCODPolicy(
    policyId: string,
    updates: {
      policy_name?: string;
      max_cod_amount?: number;
      min_cod_amount?: number;
      restricted_zones?: string[];
      restricted_categories?: string[];
      high_value_threshold?: number;
      high_value_cod_allowed?: boolean;
      allow_for_risk_customers?: boolean;
      prepaid_only_for_new_customers?: boolean;
      prepaid_only_days_after_registration?: number;
      max_failed_deliveries?: number;
      failed_delivery_block_days?: number;
      is_active?: boolean;
      effective_date?: Date;
      expiry_date?: Date;
      approved_by?: string;
      approved_at?: Date;
      metadata?: any;
    },
  ): Promise<CODPolicy> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.policy_name !== undefined) {
      fields.push(`policy_name = $${paramIndex}`);
      values.push(updates.policy_name);
      paramIndex++;
    }

    if (updates.max_cod_amount !== undefined) {
      fields.push(`max_cod_amount = $${paramIndex}`);
      values.push(updates.max_cod_amount);
      paramIndex++;
    }

    if (updates.min_cod_amount !== undefined) {
      fields.push(`min_cod_amount = $${paramIndex}`);
      values.push(updates.min_cod_amount);
      paramIndex++;
    }

    if (updates.restricted_zones !== undefined) {
      fields.push(`restricted_zones = $${paramIndex}`);
      values.push(updates.restricted_zones);
      paramIndex++;
    }

    if (updates.restricted_categories !== undefined) {
      fields.push(`restricted_categories = $${paramIndex}`);
      values.push(updates.restricted_categories);
      paramIndex++;
    }

    if (updates.high_value_threshold !== undefined) {
      fields.push(`high_value_threshold = $${paramIndex}`);
      values.push(updates.high_value_threshold);
      paramIndex++;
    }

    if (updates.high_value_cod_allowed !== undefined) {
      fields.push(`high_value_cod_allowed = $${paramIndex}`);
      values.push(updates.high_value_cod_allowed);
      paramIndex++;
    }

    if (updates.allow_for_risk_customers !== undefined) {
      fields.push(`allow_for_risk_customers = $${paramIndex}`);
      values.push(updates.allow_for_risk_customers);
      paramIndex++;
    }

    if (updates.prepaid_only_for_new_customers !== undefined) {
      fields.push(`prepaid_only_for_new_customers = $${paramIndex}`);
      values.push(updates.prepaid_only_for_new_customers);
      paramIndex++;
    }

    if (updates.prepaid_only_days_after_registration !== undefined) {
      fields.push(`prepaid_only_days_after_registration = $${paramIndex}`);
      values.push(updates.prepaid_only_days_after_registration);
      paramIndex++;
    }

    if (updates.max_failed_deliveries !== undefined) {
      fields.push(`max_failed_deliveries = $${paramIndex}`);
      values.push(updates.max_failed_deliveries);
      paramIndex++;
    }

    if (updates.failed_delivery_block_days !== undefined) {
      fields.push(`failed_delivery_block_days = $${paramIndex}`);
      values.push(updates.failed_delivery_block_days);
      paramIndex++;
    }

    if (updates.is_active !== undefined) {
      fields.push(`is_active = $${paramIndex}`);
      values.push(updates.is_active);
      paramIndex++;
    }

    if (updates.effective_date !== undefined) {
      fields.push(`effective_date = $${paramIndex}`);
      values.push(updates.effective_date);
      paramIndex++;
    }

    if (updates.expiry_date !== undefined) {
      fields.push(`expiry_date = $${paramIndex}`);
      values.push(updates.expiry_date);
      paramIndex++;
    }

    if (updates.approved_by !== undefined) {
      fields.push(`approved_by = $${paramIndex}`);
      values.push(updates.approved_by);
      paramIndex++;
    }

    if (updates.approved_at !== undefined) {
      fields.push(`approved_at = $${paramIndex}`);
      values.push(updates.approved_at);
      paramIndex++;
    }

    if (updates.metadata !== undefined) {
      fields.push(`metadata = $${paramIndex}`);
      values.push(JSON.stringify(updates.metadata));
      paramIndex++;
    }

    if (fields.length === 0) {
      throw new Error("No fields to update");
    }

    fields.push(`updated_at = NOW()`);
    values.push(policyId);

    const result = await query(
      `UPDATE cod_policies SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    return result.rows[0];
  }

  /**
   * Delete COD policy
   */
  async deleteCODPolicy(policyId: string): Promise<void> {
    await query("DELETE FROM cod_policies WHERE id = $1", [policyId]);
  }

  /**
   * Approve COD policy
   */
  async approveCODPolicy(
    policyId: string,
    approvedBy: string,
  ): Promise<CODPolicy> {
    const result = await query(
      `UPDATE cod_policies 
       SET approved_by = $1, approved_at = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [approvedBy, policyId],
    );

    return result.rows[0];
  }
}
