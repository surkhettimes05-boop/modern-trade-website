import { query } from "../database/connection.js";

interface Rule {
  id: string;
  name: string;
  version: number;
  rule_type: string;
  config: any;
  status: string;
  effective_from?: Date;
  effective_to?: Date;
  created_at: Date;
  created_by: string;
  published_at?: Date;
  published_by?: string;
  retired_at?: Date;
  retired_by?: string;
}

interface CreateRuleInput {
  name: string;
  rule_type: string;
  config: any;
  effective_from?: Date;
  effective_to?: Date;
  created_by: string;
}

interface UpdateRuleInput {
  config?: any;
  effective_from?: Date;
  effective_to?: Date;
  updated_by: string;
}

interface BasketItem {
  product_id: string;
  sku?: string;
  category_id?: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface Basket {
  items: BasketItem[];
  total_amount: number;
  currency?: string;
  customer_id?: string;
  store_id?: string;
  channel?: string;
}

interface CalculationResult {
  points: number;
  applied_rules: Rule[];
  rejected_rules: Rule[];
  calculation_trace: any[];
  explanation: string;
}

export class RuleEngineService {
  /**
   * Create a new rule version
   */
  async createRule(input: CreateRuleInput): Promise<Rule> {
    // Get the latest version for this rule name
    const versionResult = await query(
      `SELECT COALESCE(MAX(version), 0) as max_version FROM loyalty_rules WHERE name = $1`,
      [input.name],
    );
    const nextVersion = (parseInt(versionResult.rows[0].max_version) || 0) + 1;

    const result = await query(
      `INSERT INTO loyalty_rules (name, version, rule_type, config, status, effective_from, effective_to, created_by)
       VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6, $7)
       RETURNING *`,
      [
        input.name,
        nextVersion,
        input.rule_type,
        JSON.stringify(input.config),
        input.effective_from || null,
        input.effective_to || null,
        input.created_by,
      ],
    );

    return result.rows[0];
  }

  /**
   * Update a draft rule
   */
  async updateRule(ruleId: string, input: UpdateRuleInput): Promise<Rule> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.config !== undefined) {
      updates.push(`config = $${paramIndex}`);
      values.push(JSON.stringify(input.config));
      paramIndex++;
    }
    if (input.effective_from !== undefined) {
      updates.push(`effective_from = $${paramIndex}`);
      values.push(input.effective_from);
      paramIndex++;
    }
    if (input.effective_to !== undefined) {
      updates.push(`effective_to = $${paramIndex}`);
      values.push(input.effective_to);
      paramIndex++;
    }

    if (updates.length === 0) {
      throw new Error("No fields to update");
    }

    values.push(ruleId);

    const result = await query(
      `UPDATE loyalty_rules SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new Error("Rule not found");
    }

    return result.rows[0];
  }

  /**
   * Publish a rule (activate it)
   */
  async publishRule(ruleId: string, publishedBy: string): Promise<Rule> {
    const result = await query(
      `UPDATE loyalty_rules 
       SET status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, published_by = $1
       WHERE id = $2 AND status = 'DRAFT'
       RETURNING *`,
      [publishedBy, ruleId],
    );

    if (result.rows.length === 0) {
      throw new Error("Rule not found or not in DRAFT status");
    }

    // Retire any previous published version of this rule
    await query(
      `UPDATE loyalty_rules 
       SET status = 'RETIRED', retired_at = CURRENT_TIMESTAMP, retired_by = $1
       WHERE name = $2 AND version < $3 AND status = 'PUBLISHED'`,
      [publishedBy, result.rows[0].name, result.rows[0].version],
    );

    return result.rows[0];
  }

  /**
   * Retire a rule
   */
  async retireRule(ruleId: string, retiredBy: string): Promise<Rule> {
    const result = await query(
      `UPDATE loyalty_rules 
       SET status = 'RETIRED', retired_at = CURRENT_TIMESTAMP, retired_by = $1
       WHERE id = $2 AND status = 'PUBLISHED'
       RETURNING *`,
      [retiredBy, ruleId],
    );

    if (result.rows.length === 0) {
      throw new Error("Rule not found or not in PUBLISHED status");
    }

    return result.rows[0];
  }

  /**
   * Get active rules for a specific type
   */
  async getActiveRules(ruleType?: string): Promise<Rule[]> {
    let queryStr = `
      SELECT * FROM loyalty_rules 
      WHERE status = 'PUBLISHED' 
        AND (effective_from IS NULL OR effective_from <= CURRENT_TIMESTAMP)
        AND (effective_to IS NULL OR effective_to > CURRENT_TIMESTAMP)
    `;
    const params: any[] = [];

    if (ruleType) {
      queryStr += " AND rule_type = $1";
      params.push(ruleType);
    }

    queryStr += " ORDER BY created_at DESC";

    const result = await query(queryStr, params);
    return result.rows;
  }

  /**
   * Get rule by ID
   */
  async getRuleById(ruleId: string): Promise<Rule | null> {
    const result = await query("SELECT * FROM loyalty_rules WHERE id = $1", [
      ruleId,
    ]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get all versions of a rule by name
   */
  async getRuleVersions(ruleName: string): Promise<Rule[]> {
    const result = await query(
      "SELECT * FROM loyalty_rules WHERE name = $1 ORDER BY version DESC",
      [ruleName],
    );
    return result.rows;
  }

  /**
   * Calculate points for a basket using active rules
   */
  async calculatePoints(basket: Basket): Promise<CalculationResult> {
    const activeRules = await this.getActiveRules();
    const appliedRules: Rule[] = [];
    const rejectedRules: Rule[] = [];
    const calculationTrace: any[] = [];
    let totalPoints = 0;

    // Process rules in priority order
    const rulePriority = [
      "base_earning",
      "product_multiplier",
      "category_multiplier",
      "campaign_bonus",
      "segment_multiplier",
    ];

    for (const priority of rulePriority) {
      const rules = activeRules.filter((r) => r.rule_type === priority);

      for (const rule of rules) {
        const result = this.evaluateRule(rule, basket);

        calculationTrace.push({
          rule_id: rule.id,
          rule_name: rule.name,
          rule_type: rule.rule_type,
          applied: result.applied,
          points: result.points,
          reason: result.reason,
        });

        if (result.applied) {
          totalPoints += result.points;
          appliedRules.push(rule);
        } else {
          rejectedRules.push(rule);
        }
      }
    }

    // Apply rounding if configured
    const roundingRule = activeRules.find((r) => r.rule_type === "rounding");
    if (roundingRule) {
      const roundingMethod = roundingRule.config.method || "nearest";
      const roundingUnit = roundingRule.config.unit || 1;

      const beforeRounding = totalPoints;
      totalPoints = this.applyRounding(
        totalPoints,
        roundingMethod,
        roundingUnit,
      );

      calculationTrace.push({
        rule_id: roundingRule.id,
        rule_name: roundingRule.name,
        rule_type: "rounding",
        applied: true,
        points: totalPoints - beforeRounding,
        reason: `Rounding from ${beforeRounding} to ${totalPoints}`,
      });
    }

    // Generate explanation
    const explanation = this.generateExplanation(calculationTrace, totalPoints);

    return {
      points: totalPoints,
      applied_rules: appliedRules,
      rejected_rules: rejectedRules,
      calculation_trace: calculationTrace,
      explanation,
    };
  }

  /**
   * Evaluate a single rule against a basket
   */
  private evaluateRule(
    rule: Rule,
    basket: Basket,
  ): { applied: boolean; points: number; reason: string } {
    const config = rule.config;

    switch (rule.rule_type) {
      case "base_earning":
        return this.evaluateBaseEarning(config, basket);
      case "product_multiplier":
        return this.evaluateProductMultiplier(config, basket);
      case "category_multiplier":
        return this.evaluateCategoryMultiplier(config, basket);
      case "campaign_bonus":
        return this.evaluateCampaignBonus(config, basket);
      case "segment_multiplier":
        return this.evaluateSegmentMultiplier(config, basket);
      default:
        return { applied: false, points: 0, reason: "Unknown rule type" };
    }
  }

  /**
   * Evaluate base earning rule
   */
  private evaluateBaseEarning(
    config: any,
    basket: Basket,
  ): { applied: boolean; points: number; reason: string } {
    const pointsPerCurrency = config.points_per_currency || 1;
    const minimumSpend = config.minimum_spend || 0;
    const eligibleChannels = config.eligible_channels || [
      "IN_STORE",
      "ONLINE",
      "MOBILE",
    ];

    // Check channel eligibility
    if (basket.channel && !eligibleChannels.includes(basket.channel)) {
      return { applied: false, points: 0, reason: "Channel not eligible" };
    }

    // Check minimum spend
    if (basket.total_amount < minimumSpend) {
      return {
        applied: false,
        points: 0,
        reason: `Below minimum spend of ${minimumSpend}`,
      };
    }

    const points = Math.floor(basket.total_amount / pointsPerCurrency);
    return { applied: true, points, reason: `Base earning: ${points} points` };
  }

  /**
   * Evaluate product multiplier rule
   */
  private evaluateProductMultiplier(
    config: any,
    basket: Basket,
  ): { applied: boolean; points: number; reason: string } {
    const productIds = config.product_ids || [];
    const multiplier = config.multiplier || 1;

    if (productIds.length === 0) {
      return { applied: false, points: 0, reason: "No products configured" };
    }

    let eligibleTotal = 0;
    for (const item of basket.items) {
      if (productIds.includes(item.product_id)) {
        eligibleTotal += item.line_total;
      }
    }

    if (eligibleTotal === 0) {
      return {
        applied: false,
        points: 0,
        reason: "No eligible products in basket",
      };
    }

    const points = Math.floor(eligibleTotal * (multiplier - 1)); // Bonus points only
    return {
      applied: true,
      points,
      reason: `Product multiplier bonus: ${points} points`,
    };
  }

  /**
   * Evaluate category multiplier rule
   */
  private evaluateCategoryMultiplier(
    config: any,
    basket: Basket,
  ): { applied: boolean; points: number; reason: string } {
    const categoryIds = config.category_ids || [];
    const multiplier = config.multiplier || 1;

    if (categoryIds.length === 0) {
      return { applied: false, points: 0, reason: "No categories configured" };
    }

    let eligibleTotal = 0;
    for (const item of basket.items) {
      if (item.category_id && categoryIds.includes(item.category_id)) {
        eligibleTotal += item.line_total;
      }
    }

    if (eligibleTotal === 0) {
      return {
        applied: false,
        points: 0,
        reason: "No eligible categories in basket",
      };
    }

    const points = Math.floor(eligibleTotal * (multiplier - 1)); // Bonus points only
    return {
      applied: true,
      points,
      reason: `Category multiplier bonus: ${points} points`,
    };
  }

  /**
   * Evaluate campaign bonus rule
   */
  private evaluateCampaignBonus(
    config: any,
    basket: Basket,
  ): { applied: boolean; points: number; reason: string } {
    const bonusPoints = config.bonus_points || 0;
    const minimumSpend = config.minimum_spend || 0;

    if (basket.total_amount < minimumSpend) {
      return {
        applied: false,
        points: 0,
        reason: `Below minimum spend of ${minimumSpend}`,
      };
    }

    return {
      applied: true,
      points: bonusPoints,
      reason: `Campaign bonus: ${bonusPoints} points`,
    };
  }

  /**
   * Evaluate segment multiplier rule
   */
  private evaluateSegmentMultiplier(
    _config: any,
    basket: Basket,
  ): { applied: boolean; points: number; reason: string } {
    if (!basket.customer_id) {
      return { applied: false, points: 0, reason: "No customer ID provided" };
    }

    // This would check customer segments - for now, assume not applicable
    return {
      applied: false,
      points: 0,
      reason: "Customer segment not implemented yet",
    };
  }

  /**
   * Apply rounding to points
   */
  private applyRounding(points: number, method: string, unit: number): number {
    switch (method) {
      case "up":
        return Math.ceil(points / unit) * unit;
      case "down":
        return Math.floor(points / unit) * unit;
      case "nearest":
      default:
        return Math.round(points / unit) * unit;
    }
  }

  /**
   * Generate human-readable explanation
   */
  private generateExplanation(trace: any[], totalPoints: number): string {
    const applied = trace.filter((t) => t.applied);
    const explanations = applied.map((t) => t.reason);

    if (explanations.length === 0) {
      return "No rules applied";
    }

    return `${explanations.join(". ")}. Total: ${totalPoints} points.`;
  }

  /**
   * Get rule statistics
   */
  async getRuleStats(): Promise<any> {
    const result = await query(
      `SELECT 
        rule_type,
        status,
        COUNT(*) as count
      FROM loyalty_rules
      GROUP BY rule_type, status
      ORDER BY rule_type, status`,
    );
    return result.rows;
  }
}
