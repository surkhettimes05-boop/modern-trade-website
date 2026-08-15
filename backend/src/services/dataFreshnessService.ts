import { query } from "../database/connection.js";

interface FreshnessRecord {
  id: string;
  projection_name: string;
  table_name: string;
  last_updated_at: Date;
  last_updated_by: string;
  update_status: string;
  update_duration_ms: number;
  row_count: number;
  error_message: string;
  expected_refresh_interval_minutes: number;
  is_stale: boolean;
  stale_threshold_minutes: number;
  created_at: Date;
  updated_at: Date;
}

interface UpdateFreshnessInput {
  projection_name: string;
  table_name: string;
  last_updated_by: string;
  update_status: "SUCCESS" | "FAILED" | "IN_PROGRESS";
  update_duration_ms?: number;
  row_count?: number;
  error_message?: string;
}

export class DataFreshnessService {
  /**
   * Update freshness record for a projection
   */
  async updateFreshness(input: UpdateFreshnessInput): Promise<FreshnessRecord> {
    const result = await query(
      `UPDATE data_freshness_tracking 
       SET last_updated_at = NOW(),
           last_updated_by = $1,
           update_status = $2,
           update_duration_ms = $3,
           row_count = $4,
           error_message = $5,
           updated_at = NOW()
       WHERE projection_name = $6
       RETURNING *`,
      [
        input.last_updated_by,
        input.update_status,
        input.update_duration_ms || null,
        input.row_count || null,
        input.error_message || null,
        input.projection_name,
      ],
    );

    if (result.rows.length === 0) {
      throw new Error("Projection not found");
    }

    // Check if stale and update flag
    const record = result.rows[0];
    const isStale = this.checkIfStale(record);

    if (isStale !== record.is_stale) {
      await query(
        `UPDATE data_freshness_tracking 
         SET is_stale = $1
         WHERE id = $2`,
        [isStale, record.id],
      );
      record.is_stale = isStale;
    }

    return record;
  }

  /**
   * Get all freshness records
   */
  async getAllFreshness(): Promise<FreshnessRecord[]> {
    const result = await query(
      "SELECT * FROM data_freshness_tracking ORDER BY projection_name",
    );
    return result.rows;
  }

  /**
   * Get freshness record by projection name
   */
  async getFreshnessByProjection(
    projectionName: string,
  ): Promise<FreshnessRecord | null> {
    const result = await query(
      "SELECT * FROM data_freshness_tracking WHERE projection_name = $1",
      [projectionName],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get stale projections
   */
  async getStaleProjections(): Promise<FreshnessRecord[]> {
    const result = await query(
      `SELECT * FROM data_freshness_tracking 
       WHERE is_stale = TRUE 
       ORDER BY last_updated_at ASC`,
    );
    return result.rows;
  }

  /**
   * Check if a record is stale
   */
  private checkIfStale(record: FreshnessRecord): boolean {
    if (!record.last_updated_at) {
      return true;
    }

    const thresholdMs =
      (record.stale_threshold_minutes ||
        record.expected_refresh_interval_minutes * 2) *
      60 *
      1000;
    const ageMs = Date.now() - new Date(record.last_updated_at).getTime();

    return ageMs > thresholdMs;
  }

  /**
   * Refresh staleness for all projections
   */
  async refreshStaleness(): Promise<number> {
    const result = await query(
      `UPDATE data_freshness_tracking 
       SET is_stale = CASE 
         WHEN last_updated_at IS NULL THEN TRUE
         WHEN (EXTRACT(EPOCH FROM (NOW() - last_updated_at)) / 60) > COALESCE(stale_threshold_minutes, expected_refresh_interval_minutes * 2) THEN TRUE
         ELSE FALSE
       END
       RETURNING id`,
    );
    return result.rows.length;
  }

  /**
   * Get freshness summary
   */
  async getFreshnessSummary(): Promise<any> {
    const result = await query(
      `SELECT 
        COUNT(*) as total_projections,
        COUNT(*) FILTER (WHERE is_stale = TRUE) as stale_count,
        COUNT(*) FILTER (WHERE update_status = 'SUCCESS') as success_count,
        COUNT(*) FILTER (WHERE update_status = 'FAILED') as failed_count,
        COUNT(*) FILTER (WHERE update_status = 'IN_PROGRESS') as in_progress_count,
        AVG(update_duration_ms) as avg_update_duration_ms
      FROM data_freshness_tracking`,
    );
    return result.rows[0];
  }

  /**
   * Create freshness record for a new projection
   */
  async createFreshnessRecord(
    projectionName: string,
    tableName: string,
    expectedRefreshIntervalMinutes: number,
    staleThresholdMinutes?: number,
  ): Promise<FreshnessRecord> {
    const result = await query(
      `INSERT INTO data_freshness_tracking (
        projection_name, table_name, expected_refresh_interval_minutes, 
        stale_threshold_minutes, update_status, is_stale
      ) VALUES ($1, $2, $3, $4, 'SUCCESS', TRUE)
      RETURNING *`,
      [
        projectionName,
        tableName,
        expectedRefreshIntervalMinutes,
        staleThresholdMinutes || null,
      ],
    );
    return result.rows[0];
  }

  /**
   * Delete freshness record
   */
  async deleteFreshnessRecord(projectionName: string): Promise<boolean> {
    const result = await query(
      "DELETE FROM data_freshness_tracking WHERE projection_name = $1",
      [projectionName],
    );
    return (result.rowCount || 0) > 0;
  }

  /**
   * Update expected refresh interval
   */
  async updateRefreshInterval(
    projectionName: string,
    expectedRefreshIntervalMinutes: number,
    staleThresholdMinutes?: number,
  ): Promise<FreshnessRecord> {
    const result = await query(
      `UPDATE data_freshness_tracking 
       SET expected_refresh_interval_minutes = $1,
           stale_threshold_minutes = $2,
           updated_at = NOW()
       WHERE projection_name = $3
       RETURNING *`,
      [
        expectedRefreshIntervalMinutes,
        staleThresholdMinutes || null,
        projectionName,
      ],
    );

    if (result.rows.length === 0) {
      throw new Error("Projection not found");
    }

    return result.rows[0];
  }

  /**
   * Get freshness history (would require a separate history table)
   */
  async getFreshnessHistory(
    projectionName: string,
    _days: number = 7,
  ): Promise<any[]> {
    // This would require a data_freshness_history table
    // For now, return current state
    const current = await this.getFreshnessByProjection(projectionName);
    return current ? [current] : [];
  }

  /**
   * Mark update as in progress
   */
  async markUpdateInProgress(
    projectionName: string,
    updatedBy: string,
  ): Promise<FreshnessRecord> {
    const result = await query(
      `UPDATE data_freshness_tracking 
       SET update_status = 'IN_PROGRESS',
           last_updated_by = $1,
           updated_at = NOW()
       WHERE projection_name = $2
       RETURNING *`,
      [updatedBy, projectionName],
    );

    if (result.rows.length === 0) {
      throw new Error("Projection not found");
    }

    return result.rows[0];
  }

  /**
   * Get projections that need refresh
   */
  async getProjectionsNeedingRefresh(): Promise<FreshnessRecord[]> {
    const result = await query(
      `SELECT * FROM data_freshness_tracking 
       WHERE last_updated_at IS NULL 
          OR (EXTRACT(EPOCH FROM (NOW() - last_updated_at)) / 60) > expected_refresh_interval_minutes
          OR update_status = 'FAILED'
       ORDER BY last_updated_at ASC NULLS FIRST`,
    );
    return result.rows;
  }
}
