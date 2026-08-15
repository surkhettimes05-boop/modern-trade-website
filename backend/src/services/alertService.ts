import { query } from "../database/connection.js";

interface Alert {
  id: string;
  alert_type: string;
  severity: string;
  entity_type?: string;
  entity_id?: string;
  store_id?: string;
  threshold_config: any;
  current_value: any;
  message: string;
  first_detected_at: Date;
  last_detected_at: Date;
  status: string;
  acknowledged_by?: string;
  acknowledged_at?: Date;
  assigned_to?: string;
  assigned_at?: Date;
  resolution_notes?: string;
  resolved_at?: Date;
  resolved_by?: string;
  escalation_level: number;
  escalated_at?: Date;
  escalated_to?: string;
  link_to_records?: string;
  metadata: any;
  created_at: Date;
  updated_at: Date;
}

interface CreateAlertInput {
  alert_type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  entity_type?: string;
  entity_id?: string;
  store_id?: string;
  threshold_config: any;
  current_value: any;
  message: string;
  link_to_records?: string;
  metadata?: any;
}

export class AlertService {
  /**
   * Create a new alert
   */
  async createAlert(input: CreateAlertInput): Promise<Alert> {
    const result = await query(
      `INSERT INTO alerts (
        alert_type, severity, entity_type, entity_id, store_id,
        threshold_config, current_value, message,
        first_detected_at, last_detected_at, status,
        escalation_level, link_to_records, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), 'OPEN', 0, $9, $10)
      RETURNING *`,
      [
        input.alert_type,
        input.severity,
        input.entity_type || null,
        input.entity_id || null,
        input.store_id || null,
        JSON.stringify(input.threshold_config),
        JSON.stringify(input.current_value),
        input.message,
        input.link_to_records || null,
        JSON.stringify(input.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get alerts by filters
   */
  async getAlerts(filters: {
    alert_type?: string;
    severity?: string;
    status?: string;
    store_id?: string;
    entity_type?: string;
    assigned_to?: string;
    limit?: number;
    offset?: number;
  }): Promise<Alert[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.alert_type) {
      conditions.push(`alert_type = $${paramIndex}`);
      params.push(filters.alert_type);
      paramIndex++;
    }

    if (filters.severity) {
      conditions.push(`severity = $${paramIndex}`);
      params.push(filters.severity);
      paramIndex++;
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.store_id) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(filters.store_id);
      paramIndex++;
    }

    if (filters.entity_type) {
      conditions.push(`entity_type = $${paramIndex}`);
      params.push(filters.entity_type);
      paramIndex++;
    }

    if (filters.assigned_to) {
      conditions.push(`assigned_to = $${paramIndex}`);
      params.push(filters.assigned_to);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";
    const offsetClause = filters.offset ? `OFFSET ${filters.offset}` : "";

    const result = await query(
      `SELECT * FROM alerts ${whereClause} ORDER BY first_detected_at DESC ${limitClause} ${offsetClause}`,
      params,
    );

    return result.rows;
  }

  /**
   * Get alert by ID
   */
  async getAlertById(id: string): Promise<Alert | null> {
    const result = await query("SELECT * FROM alerts WHERE id = $1", [id]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(id: string, acknowledgedBy: string): Promise<Alert> {
    const result = await query(
      `UPDATE alerts 
       SET status = 'ACKNOWLEDGED', 
           acknowledged_by = $1, 
           acknowledged_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [acknowledgedBy, id],
    );

    if (result.rows.length === 0) {
      throw new Error("Alert not found");
    }

    return result.rows[0];
  }

  /**
   * Assign an alert
   */
  async assignAlert(
    id: string,
    assignedTo: string,
    assignedBy: string,
  ): Promise<Alert> {
    const result = await query(
      `UPDATE alerts 
       SET assigned_to = $1, 
           assigned_at = NOW(),
           assigned_by = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [assignedTo, assignedBy, id],
    );

    if (result.rows.length === 0) {
      throw new Error("Alert not found");
    }

    return result.rows[0];
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(
    id: string,
    resolvedBy: string,
    resolutionNotes?: string,
  ): Promise<Alert> {
    const result = await query(
      `UPDATE alerts 
       SET status = 'RESOLVED', 
           resolved_by = $1, 
           resolved_at = NOW(),
           resolution_notes = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [resolvedBy, resolutionNotes || null, id],
    );

    if (result.rows.length === 0) {
      throw new Error("Alert not found");
    }

    return result.rows[0];
  }

  /**
   * Escalate an alert
   */
  async escalateAlert(
    id: string,
    escalatedTo: string,
    escalatedBy: string,
  ): Promise<Alert> {
    const result = await query(
      `UPDATE alerts 
       SET escalation_level = escalation_level + 1,
           escalated_at = NOW(),
           escalated_to = $1,
           escalated_by = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [escalatedTo, escalatedBy, id],
    );

    if (result.rows.length === 0) {
      throw new Error("Alert not found");
    }

    return result.rows[0];
  }

  /**
   * Update an existing alert (for recurring detection)
   */
  async updateAlert(
    id: string,
    current_value: any,
    message?: string,
  ): Promise<Alert> {
    const result = await query(
      `UPDATE alerts 
       SET current_value = $1,
           last_detected_at = NOW(),
           message = COALESCE($2, message),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [JSON.stringify(current_value), message || null, id],
    );

    if (result.rows.length === 0) {
      throw new Error("Alert not found");
    }

    return result.rows[0];
  }

  /**
   * Get alert statistics
   */
  async getAlertStatistics(filters?: { store_id?: string }): Promise<any> {
    let whereClause = "";
    const params: any[] = [];

    if (filters?.store_id) {
      whereClause = "WHERE store_id = $1";
      params.push(filters.store_id);
    }

    const result = await query(
      `SELECT 
        alert_type,
        severity,
        status,
        COUNT(*) as count
      FROM alerts ${whereClause}
      GROUP BY alert_type, severity, status
      ORDER BY alert_type, severity, status`,
      params,
    );

    return result.rows;
  }

  /**
   * Check if alert already exists (for idempotency)
   */
  async findExistingAlert(
    alert_type: string,
    entity_type?: string,
    entity_id?: string,
    store_id?: string,
  ): Promise<Alert | null> {
    const conditions: string[] = [
      "alert_type = $1",
      "status IN ('OPEN', 'ACKNOWLEDGED')",
    ];
    const params: any[] = [alert_type];
    let paramIndex = 2;

    if (entity_type) {
      conditions.push(`entity_type = $${paramIndex}`);
      params.push(entity_type);
      paramIndex++;
    }

    if (entity_id) {
      conditions.push(`entity_id = $${paramIndex}`);
      params.push(entity_id);
      paramIndex++;
    }

    if (store_id) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(store_id);
      paramIndex++;
    }

    const result = await query(
      `SELECT * FROM alerts WHERE ${conditions.join(" AND ")} ORDER BY first_detected_at DESC LIMIT 1`,
      params,
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Auto-resolve stale alerts
   */
  async autoResolveStaleAlerts(
    alertType: string,
    staleMinutes: number,
  ): Promise<number> {
    const result = await query(
      `UPDATE alerts 
       SET status = 'RESOLVED',
           resolved_by = 'SYSTEM',
           resolved_at = NOW(),
           resolution_notes = 'Auto-resolved: condition no longer detected',
           updated_at = NOW()
       WHERE alert_type = $1
         AND status IN ('OPEN', 'ACKNOWLEDGED')
         AND last_detected_at < NOW() - INTERVAL '${staleMinutes} minutes'
       RETURNING id`,
      [alertType],
    );

    return result.rows.length;
  }
}
