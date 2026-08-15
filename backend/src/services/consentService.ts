import { query } from "../database/connection.js";
import { randomUUID } from "crypto";

interface Consent {
  id: string;
  customer_id: string;
  consent_type: string;
  consent_state: string;
  channel?: string;
  policy_version: string;
  source: string;
  granted_at: Date;
  granted_ip?: string;
  withdrawn_at?: Date;
  withdrawn_reason?: string;
  evidence_url?: string;
}

interface CreateConsentInput {
  customer_id: string;
  consent_type: string;
  channel?: string;
  policy_version: string;
  source: string;
  granted_ip?: string;
  evidence_url?: string;
}

interface WithdrawConsentInput {
  consent_id: string;
  withdrawn_reason: string;
  withdrawn_by: string;
}

interface DataRequestInput {
  customer_id: string;
  request_type: string;
  requested_ip?: string;
}

export class ConsentService {
  /**
   * Grant consent for a customer
   */
  async grantConsent(input: CreateConsentInput): Promise<Consent> {
    // Check if customer exists
    const customerResult = await query(
      "SELECT id FROM customers WHERE id = $1",
      [input.customer_id],
    );
    if (customerResult.rows.length === 0) {
      throw new Error("Customer not found");
    }

    // Check if consent already exists and is granted
    const existingResult = await query(
      `SELECT * FROM customer_consent 
       WHERE customer_id = $1 AND consent_type = $2 AND consent_state = 'GRANTED'`,
      [input.customer_id, input.consent_type],
    );

    if (existingResult.rows.length > 0) {
      // Update existing consent
      const result = await query(
        `UPDATE customer_consent 
         SET policy_version = $1, source = $2, granted_ip = $3, evidence_url = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $5
         RETURNING *`,
        [
          input.policy_version,
          input.source,
          input.granted_ip || null,
          input.evidence_url || null,
          existingResult.rows[0].id,
        ],
      );
      return result.rows[0];
    }

    // Create new consent
    const result = await query(
      `INSERT INTO customer_consent (
        customer_id, consent_type, consent_state, channel, policy_version,
        source, granted_ip, evidence_url
      ) VALUES ($1, $2, 'GRANTED', $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        input.customer_id,
        input.consent_type,
        input.channel || null,
        input.policy_version,
        input.source,
        input.granted_ip || null,
        input.evidence_url || null,
      ],
    );

    // Audit log
    await query(
      `INSERT INTO customer_audit_log (customer_id, entity_type, entity_id, action, new_values, performed_by)
       VALUES ($1, 'CONSENT', $2, 'GRANT_CONSENT', $3, $4)`,
      [
        input.customer_id,
        result.rows[0].id,
        JSON.stringify(result.rows[0]),
        input.source,
      ],
    );

    return result.rows[0];
  }

  /**
   * Withdraw consent
   */
  async withdrawConsent(input: WithdrawConsentInput): Promise<Consent> {
    const result = await query(
      `UPDATE customer_consent 
       SET consent_state = 'WITHDRAWN', withdrawn_at = CURRENT_TIMESTAMP, withdrawn_reason = $1
       WHERE id = $2 AND consent_state = 'GRANTED'
       RETURNING *`,
      [input.withdrawn_reason, input.consent_id],
    );

    if (result.rows.length === 0) {
      throw new Error("Consent not found or already withdrawn");
    }

    // Audit log
    await query(
      `INSERT INTO customer_audit_log (customer_id, entity_type, entity_id, action, old_values, new_values, performed_by, reason)
       VALUES ($1, 'CONSENT', $2, 'WITHDRAW_CONSENT', $3, $4, $5, $6)`,
      [
        result.rows[0].customer_id,
        result.rows[0].id,
        JSON.stringify({ consent_state: "GRANTED" }),
        JSON.stringify(result.rows[0]),
        input.withdrawn_by,
        input.withdrawn_reason,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get customer consents
   */
  async getCustomerConsents(customerId: string): Promise<Consent[]> {
    const result = await query(
      `SELECT * FROM customer_consent WHERE customer_id = $1 ORDER BY granted_at DESC`,
      [customerId],
    );
    return result.rows;
  }

  /**
   * Get current consent state for a type
   */
  async getCurrentConsent(
    customerId: string,
    consentType: string,
  ): Promise<Consent | null> {
    const result = await query(
      `SELECT * FROM customer_consent 
       WHERE customer_id = $1 AND consent_type = $2 
       ORDER BY granted_at DESC LIMIT 1`,
      [customerId, consentType],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Check if customer has granted specific consent
   */
  async hasConsent(customerId: string, consentType: string): Promise<boolean> {
    const consent = await this.getCurrentConsent(customerId, consentType);
    return consent !== null && consent.consent_state === "GRANTED";
  }

  /**
   * Create data access/deletion request
   */
  async createDataRequest(input: DataRequestInput): Promise<any> {
    const result = await query(
      `INSERT INTO customer_data_requests (customer_id, request_type, requested_ip)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.customer_id, input.request_type, input.requested_ip || null],
    );

    // Audit log
    await query(
      `INSERT INTO customer_audit_log (customer_id, entity_type, entity_id, action, new_values, performed_by)
       VALUES ($1, 'DATA_REQUEST', $2, 'CREATE', $3, 'CUSTOMER')`,
      [input.customer_id, result.rows[0].id, JSON.stringify(result.rows[0])],
    );

    return result.rows[0];
  }

  /**
   * Process data request
   */
  async processDataRequest(
    requestId: string,
    processedBy: string,
    status: string,
    notes?: string,
  ): Promise<any> {
    const updates: string[] = [
      "request_status = $1",
      "processed_by = $2",
      "processed_at = CURRENT_TIMESTAMP",
    ];
    const values: any[] = [status, processedBy];
    let paramIndex = 3;

    if (notes) {
      updates.push(`notes = $${paramIndex}`);
      values.push(notes);
      paramIndex++;
    }

    if (status === "COMPLETED" && notes && notes.startsWith("http")) {
      updates.push(`export_url = $${paramIndex}`);
      values.push(notes);
      paramIndex++;
    }

    if (status === "COMPLETED" && notes === "DELETED") {
      updates.push(`deletion_completed_at = CURRENT_TIMESTAMP`);
    }

    values.push(requestId);

    const result = await query(
      `UPDATE customer_data_requests SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new Error("Data request not found");
    }

    return result.rows[0];
  }

  /**
   * Get customer data requests
   */
  async getCustomerDataRequests(customerId: string): Promise<any[]> {
    const result = await query(
      `SELECT * FROM customer_data_requests WHERE customer_id = $1 ORDER BY requested_at DESC`,
      [customerId],
    );
    return result.rows;
  }

  /**
   * Update customer profile (for correction requests)
   */
  async updateCustomerForCorrection(
    customerId: string,
    updates: any,
    correctedBy: string,
  ): Promise<any> {
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.preferred_name !== undefined) {
      updateFields.push(`preferred_name = $${paramIndex}`);
      values.push(updates.preferred_name);
      paramIndex++;
    }
    if (updates.email !== undefined) {
      updateFields.push(`email = $${paramIndex}`);
      values.push(updates.email);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      throw new Error("No fields to update");
    }

    values.push(correctedBy);
    values.push(customerId);

    const result = await query(
      `UPDATE customers SET ${updateFields.join(", ")}, updated_by = $${paramIndex} WHERE id = $${paramIndex + 1} RETURNING *`,
      values,
    );

    // Audit log
    await query(
      `INSERT INTO customer_audit_log (customer_id, entity_type, entity_id, action, new_values, performed_by, reason)
       VALUES ($1, 'CUSTOMER', $2, 'UPDATE', $3, $4, $5)`,
      [
        customerId,
        customerId,
        JSON.stringify(result.rows[0]),
        correctedBy,
        "Data correction request",
      ],
    );

    return result.rows[0];
  }

  /**
   * Suppress communications for a customer (when consent withdrawn)
   */
  async suppressCommunications(
    customerId: string,
    consentType: string,
  ): Promise<void> {
    // This would integrate with the communication system
    // For now, we just log the suppression
    await query(
      `INSERT INTO customer_audit_log (customer_id, entity_type, entity_id, action, performed_by, reason)
       VALUES ($1, 'COMMUNICATION', $2, 'SUPPRESS', 'SYSTEM', $3)`,
      [customerId, randomUUID(), `Consent withdrawn for ${consentType}`],
    );
  }
}
