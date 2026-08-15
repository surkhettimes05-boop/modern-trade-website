import { query } from "../database/connection.js";

interface MetricGovernance {
  id: string;
  metric_id: string;
  metric_name: string;
  business_definition: string;
  formula: string;
  source_tables: string[];
  included_statuses: string[];
  exclusions: string[];
  timezone: string;
  business_date_behavior: string;
  refresh_frequency: string;
  metric_owner: string;
  data_quality_requirements: string;
  drill_down_destination: string;
  version: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  updated_by: string;
}

interface CreateMetricInput {
  metric_id: string;
  metric_name: string;
  business_definition: string;
  formula: string;
  source_tables: string[];
  included_statuses?: string[];
  exclusions?: string[];
  timezone?: string;
  business_date_behavior?: string;
  refresh_frequency?: string;
  metric_owner: string;
  data_quality_requirements?: string;
  drill_down_destination?: string;
  version?: string;
  updated_by: string;
}

export class MetricGovernanceService {
  /**
   * Create or update a metric definition
   */
  async upsertMetric(input: CreateMetricInput): Promise<MetricGovernance> {
    const result = await query(
      `INSERT INTO metric_governance (
        metric_id, metric_name, business_definition, formula, source_tables,
        included_statuses, exclusions, timezone, business_date_behavior,
        refresh_frequency, metric_owner, data_quality_requirements,
        drill_down_destination, version, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (metric_id) 
      DO UPDATE SET
        metric_name = EXCLUDED.metric_name,
        business_definition = EXCLUDED.business_definition,
        formula = EXCLUDED.formula,
        source_tables = EXCLUDED.source_tables,
        included_statuses = EXCLUDED.included_statuses,
        exclusions = EXCLUDED.exclusions,
        timezone = EXCLUDED.timezone,
        business_date_behavior = EXCLUDED.business_date_behavior,
        refresh_frequency = EXCLUDED.refresh_frequency,
        metric_owner = EXCLUDED.metric_owner,
        data_quality_requirements = EXCLUDED.data_quality_requirements,
        drill_down_destination = EXCLUDED.drill_down_destination,
        version = EXCLUDED.version,
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
      RETURNING *`,
      [
        input.metric_id,
        input.metric_name,
        input.business_definition,
        input.formula,
        input.source_tables,
        input.included_statuses || [],
        input.exclusions || [],
        input.timezone || "UTC",
        input.business_date_behavior || "",
        input.refresh_frequency || "HOURLY",
        input.metric_owner,
        input.data_quality_requirements || "",
        input.drill_down_destination || "",
        input.version || "1.0",
        input.updated_by,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get metric by ID
   */
  async getMetricById(metricId: string): Promise<MetricGovernance | null> {
    const result = await query(
      "SELECT * FROM metric_governance WHERE metric_id = $1",
      [metricId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get all active metrics
   */
  async getActiveMetrics(): Promise<MetricGovernance[]> {
    const result = await query(
      "SELECT * FROM metric_governance WHERE is_active = TRUE ORDER BY metric_id",
    );
    return result.rows;
  }

  /**
   * Get metrics by owner
   */
  async getMetricsByOwner(owner: string): Promise<MetricGovernance[]> {
    const result = await query(
      "SELECT * FROM metric_governance WHERE metric_owner = $1 AND is_active = TRUE ORDER BY metric_id",
      [owner],
    );
    return result.rows;
  }

  /**
   * Deactivate a metric
   */
  async deactivateMetric(
    metricId: string,
    updatedBy: string,
  ): Promise<MetricGovernance> {
    const result = await query(
      `UPDATE metric_governance 
       SET is_active = FALSE, updated_at = NOW(), updated_by = $1
       WHERE metric_id = $2
       RETURNING *`,
      [updatedBy, metricId],
    );

    if (result.rows.length === 0) {
      throw new Error("Metric not found");
    }

    return result.rows[0];
  }

  /**
   * Activate a metric
   */
  async activateMetric(
    metricId: string,
    updatedBy: string,
  ): Promise<MetricGovernance> {
    const result = await query(
      `UPDATE metric_governance 
       SET is_active = TRUE, updated_at = NOW(), updated_by = $1
       WHERE metric_id = $2
       RETURNING *`,
      [updatedBy, metricId],
    );

    if (result.rows.length === 0) {
      throw new Error("Metric not found");
    }

    return result.rows[0];
  }

  /**
   * Get metric version history
   */
  async getMetricHistory(metricId: string): Promise<any[]> {
    // This would require a separate metric_history table
    // For now, return current version
    const metric = await this.getMetricById(metricId);
    return metric ? [metric] : [];
  }

  /**
   * Validate metric definition
   */
  validateMetricDefinition(input: CreateMetricInput): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!input.metric_id || !/^[A-Z_]+$/.test(input.metric_id)) {
      errors.push("metric_id must be uppercase letters and underscores only");
    }

    if (!input.metric_name || input.metric_name.length === 0) {
      errors.push("metric_name is required");
    }

    if (!input.business_definition || input.business_definition.length === 0) {
      errors.push("business_definition is required");
    }

    if (!input.formula || input.formula.length === 0) {
      errors.push("formula is required");
    }

    if (!input.source_tables || input.source_tables.length === 0) {
      errors.push("source_tables must have at least one table");
    }

    if (!input.metric_owner || input.metric_owner.length === 0) {
      errors.push("metric_owner is required");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get metrics by source table
   */
  async getMetricsBySourceTable(
    tableName: string,
  ): Promise<MetricGovernance[]> {
    const result = await query(
      `SELECT * FROM metric_governance 
       WHERE $1 = ANY(source_tables) AND is_active = TRUE 
       ORDER BY metric_id`,
      [tableName],
    );
    return result.rows;
  }

  /**
   * Search metrics
   */
  async searchMetrics(queryStr: string): Promise<MetricGovernance[]> {
    const result = await query(
      `SELECT * FROM metric_governance 
       WHERE is_active = TRUE 
         AND (metric_id ILIKE $1 OR metric_name ILIKE $1 OR business_definition ILIKE $1)
       ORDER BY metric_id`,
      [`%${queryStr}%`],
    );
    return result.rows;
  }
}
