import { query } from "../database/connection.js";
import crypto from "crypto";

interface AuditTrail {
  id: string;
  audit_id: string;
  user_id: string;
  user_type: string;
  session_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_values: any;
  new_values: any;
  changed_fields: string[];
  ip_address: string;
  user_agent: string;
  request_id: string;
  occurred_at: Date;
  business_date: Date;
  created_at: Date;
}

export class AuditTrailService {
  /**
   * Record audit trail entry
   */
  async recordEntry(entry: {
    user_id?: string;
    user_type?: string;
    session_id?: string;
    action: string;
    entity_type?: string;
    entity_id?: string;
    old_values?: any;
    new_values?: any;
    ip_address?: string;
    user_agent?: string;
    request_id?: string;
  }): Promise<AuditTrail> {
    const auditId = this.generateAuditId();

    // Calculate changed fields
    const changedFields = this.calculateChangedFields(
      entry.old_values,
      entry.new_values,
    );
    const previous = await query(
      "SELECT audit_hash FROM audit_trails ORDER BY created_at DESC LIMIT 1",
    );
    const previousHash = previous.rows[0]?.audit_hash || "";
    const auditHash = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          previousHash,
          action: entry.action,
          entity_type: entry.entity_type || null,
          entity_id: entry.entity_id || null,
          old_values: entry.old_values || {},
          new_values: entry.new_values || {},
          request_id: entry.request_id || null,
        }),
      )
      .digest("hex");

    const result = await query(
      `INSERT INTO audit_trails (
        audit_id, user_id, user_type, session_id, action, entity_type, entity_id,
        old_values, new_values, changed_fields, ip_address, user_agent, request_id, previous_hash, audit_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        auditId,
        entry.user_id || null,
        entry.user_type || null,
        entry.session_id || null,
        entry.action,
        entry.entity_type || null,
        entry.entity_id || null,
        JSON.stringify(entry.old_values || {}),
        JSON.stringify(entry.new_values || {}),
        changedFields,
        entry.ip_address || null,
        entry.user_agent || null,
        entry.request_id || null,
        previousHash,
        auditHash,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get audit trails for entity
   */
  async getEntityTrails(
    entityType: string,
    entityId: string,
    limit = 50,
  ): Promise<AuditTrail[]> {
    const result = await query(
      `SELECT * FROM audit_trails 
       WHERE entity_type = $1 AND entity_id = $2 
       ORDER BY occurred_at DESC 
       LIMIT $3`,
      [entityType, entityId, limit],
    );

    return result.rows;
  }

  /**
   * Get audit trails for user
   */
  async getUserTrails(userId: string, limit = 100): Promise<AuditTrail[]> {
    const result = await query(
      `SELECT * FROM audit_trails 
       WHERE user_id = $1 
       ORDER BY occurred_at DESC 
       LIMIT $2`,
      [userId, limit],
    );

    return result.rows;
  }

  /**
   * Get audit trails by action
   */
  async getTrailsByAction(action: string, limit = 100): Promise<AuditTrail[]> {
    const result = await query(
      `SELECT * FROM audit_trails 
       WHERE action = $1 
       ORDER BY occurred_at DESC 
       LIMIT $2`,
      [action, limit],
    );

    return result.rows;
  }

  /**
   * Get audit trails by date range
   */
  async getTrailsByDateRange(
    startDate: Date,
    endDate: Date,
    limit = 500,
  ): Promise<AuditTrail[]> {
    const result = await query(
      `SELECT * FROM audit_trails 
       WHERE business_date >= $1 AND business_date <= $2 
       ORDER BY occurred_at DESC 
       LIMIT $3`,
      [startDate, endDate, limit],
    );

    return result.rows;
  }

  async search(filters: {
    query?: string;
    action?: string;
    entityType?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<AuditTrail[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      conditions.push(`${sql} $${values.length}`);
    };
    if (filters.query) {
      values.push(`%${filters.query}%`);
      const placeholder = `$${values.length}`;
      conditions.push(
        `(action ILIKE ${placeholder} OR entity_type ILIKE ${placeholder} OR request_id ILIKE ${placeholder})`,
      );
    }
    if (filters.action) add("action =", filters.action);
    if (filters.entityType) add("entity_type =", filters.entityType);
    if (filters.userId) add("user_id =", filters.userId);
    if (filters.startDate) add("occurred_at >=", filters.startDate);
    if (filters.endDate) add("occurred_at <=", filters.endDate);
    values.push(Math.min(filters.limit || 500, 2000));
    return (
      await query(
        `SELECT * FROM audit_trails ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY occurred_at DESC LIMIT $${values.length}`,
        values,
      )
    ).rows;
  }

  async exportCsv(
    filters: Parameters<AuditTrailService["search"]>[0],
  ): Promise<string> {
    const rows = await this.search({
      ...filters,
      limit: Math.min(filters.limit || 2000, 2000),
    });
    const escape = (value: unknown) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;
    return [
      "audit_id,occurred_at,user_id,action,entity_type,entity_id,request_id,audit_hash",
      ...rows.map((row) =>
        [
          row.audit_id,
          row.occurred_at,
          row.user_id,
          row.action,
          row.entity_type,
          row.entity_id,
          row.request_id,
          (row as any).audit_hash,
        ]
          .map(escape)
          .join(","),
      ),
    ].join("\n");
  }

  /**
   * Calculate changed fields
   */
  private calculateChangedFields(oldValues: any, newValues: any): string[] {
    if (!oldValues || !newValues) {
      return [];
    }

    const changedFields: string[] = [];
    const allKeys = new Set([
      ...Object.keys(oldValues),
      ...Object.keys(newValues),
    ]);

    for (const key of allKeys) {
      if (JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])) {
        changedFields.push(key);
      }
    }

    return changedFields;
  }

  /**
   * Generate audit ID
   */
  private generateAuditId(): string {
    return `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

export const auditTrailService = new AuditTrailService();
