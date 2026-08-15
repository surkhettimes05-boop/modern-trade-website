import { query } from "../database/connection.js";

interface SecurityIncident {
  id: string;
  incident_id: string;
  incident_type: string;
  severity: string;
  affected_entity_type: string;
  affected_entity_id: string;
  affected_user_id: string;
  description: string;
  technical_details: any;
  incident_status: string;
  resolution_notes: string;
  detected_at: Date;
  resolved_at: Date;
  assigned_to: string;
  assigned_at: Date;
  reported_by: string;
  created_at: Date;
}

export class SecurityIncidentService {
  /**
   * Create security incident
   */
  async createIncident(incidentData: {
    incident_type: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    affected_entity_type?: string;
    affected_entity_id?: string;
    affected_user_id?: string;
    description: string;
    technical_details?: any;
    reported_by?: string;
  }): Promise<SecurityIncident> {
    const incidentId = this.generateSecurityIncidentId();

    const result = await query(
      `INSERT INTO security_incidents (
        incident_id, incident_type, severity, affected_entity_type, affected_entity_id,
        affected_user_id, description, technical_details, reported_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        incidentId,
        incidentData.incident_type,
        incidentData.severity,
        incidentData.affected_entity_type || null,
        incidentData.affected_entity_id || null,
        incidentData.affected_user_id || null,
        incidentData.description,
        JSON.stringify(incidentData.technical_details || {}),
        incidentData.reported_by || null,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get incident by ID
   */
  async getIncident(incidentId: string): Promise<SecurityIncident | null> {
    const result = await query(
      "SELECT * FROM security_incidents WHERE incident_id = $1",
      [incidentId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get incidents by status
   */
  async getIncidentsByStatus(status: string): Promise<SecurityIncident[]> {
    const result = await query(
      "SELECT * FROM security_incidents WHERE incident_status = $1 ORDER BY detected_at DESC",
      [status],
    );
    return result.rows;
  }

  /**
   * Get incidents by severity
   */
  async getIncidentsBySeverity(severity: string): Promise<SecurityIncident[]> {
    const result = await query(
      "SELECT * FROM security_incidents WHERE severity = $1 ORDER BY detected_at DESC",
      [severity],
    );
    return result.rows;
  }

  /**
   * Get open incidents
   */
  async getOpenIncidents(): Promise<SecurityIncident[]> {
    const result = await query(
      "SELECT * FROM security_incidents WHERE incident_status IN ('OPEN', 'INVESTIGATING') ORDER BY severity DESC, detected_at DESC",
      [],
    );
    return result.rows;
  }

  /**
   * Update incident status
   */
  async updateIncidentStatus(
    incidentId: string,
    status: string,
    additionalData?: {
      resolution_notes?: string;
      assigned_to?: string;
    },
  ): Promise<SecurityIncident> {
    const updates: string[] = ["incident_status = $1"];
    const values: any[] = [status];
    let paramIndex = 2;

    if (status === "RESOLVED" || status === "CLOSED") {
      updates.push(`resolved_at = $${paramIndex}`);
      values.push(new Date());
      paramIndex++;
    }

    if (additionalData?.resolution_notes) {
      updates.push(`resolution_notes = $${paramIndex}`);
      values.push(additionalData.resolution_notes);
      paramIndex++;
    }

    if (additionalData?.assigned_to) {
      updates.push(`assigned_to = $${paramIndex}`);
      values.push(additionalData.assigned_to);
      paramIndex++;
      updates.push(`assigned_at = $${paramIndex}`);
      values.push(new Date());
      paramIndex++;
    }

    values.push(incidentId);

    const result = await query(
      `UPDATE security_incidents SET ${updates.join(", ")} WHERE incident_id = $${paramIndex} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new Error("Security incident not found");
    }

    return result.rows[0];
  }

  /**
   * Assign incident
   */
  async assignIncident(
    incidentId: string,
    assignedTo: string,
  ): Promise<SecurityIncident> {
    const result = await query(
      `UPDATE security_incidents 
       SET assigned_to = $1, assigned_at = NOW(), incident_status = 'INVESTIGATING'
       WHERE incident_id = $2
       RETURNING *`,
      [assignedTo, incidentId],
    );

    if (result.rows.length === 0) {
      throw new Error("Security incident not found");
    }

    return result.rows[0];
  }

  /**
   * Get incident statistics
   */
  async getStatistics(): Promise<any> {
    const result = await query(
      `SELECT 
        COUNT(*) as total_incidents,
        COUNT(CASE WHEN incident_status = 'OPEN' THEN 1 END) as open_incidents,
        COUNT(CASE WHEN incident_status = 'INVESTIGATING' THEN 1 END) as investigating_incidents,
        COUNT(CASE WHEN incident_status = 'RESOLVED' THEN 1 END) as resolved_incidents,
        COUNT(CASE WHEN incident_status = 'CLOSED' THEN 1 END) as closed_incidents,
        COUNT(CASE WHEN severity = 'CRITICAL' THEN 1 END) as critical_incidents,
        COUNT(CASE WHEN severity = 'HIGH' THEN 1 END) as high_incidents,
        COUNT(CASE WHEN severity = 'MEDIUM' THEN 1 END) as medium_incidents,
        COUNT(CASE WHEN severity = 'LOW' THEN 1 END) as low_incidents
       FROM security_incidents`,
      [],
    );

    return result.rows[0];
  }

  /**
   * Generate security incident ID
   */
  private generateSecurityIncidentId(): string {
    return `SEC-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

export const securityIncidentService = new SecurityIncidentService();
