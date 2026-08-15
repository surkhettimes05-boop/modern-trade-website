import { query } from "../database/connection.js";
import {
  normalizePhone,
  hashPhone,
  maskPhone,
} from "../utils/phoneNormalization.js";

interface Customer {
  id: string;
  phone_normalized: string;
  phone_masked: string;
  preferred_name?: string;
  email?: string;
  language: string;
  home_store_id?: string;
  status: string;
  verification_status: string;
  enrollment_source?: string;
  enrollment_location_id?: string;
  enrollment_channel?: string;
  enrolled_at: Date;
}

interface CreateCustomerInput {
  phone: string;
  preferred_name?: string;
  email?: string;
  language?: string;
  home_store_id?: string;
  enrollment_source: string;
  enrollment_location_id?: string;
  enrollment_channel: string;
  enrolled_by?: string;
}

interface UpdateCustomerInput {
  preferred_name?: string;
  email?: string;
  language?: string;
  home_store_id?: string;
  updated_by: string;
}

interface MergeCustomersInput {
  source_customer_id: string;
  target_customer_id: string;
  merge_reason: string;
  merged_by: string;
  approval_required?: boolean;
}

export class CustomerService {
  /**
   * Create a new customer profile
   */
  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    const phoneNormalized = normalizePhone(input.phone);
    const phoneHash = hashPhone(input.phone);
    const phoneMasked = maskPhone(input.phone);

    // Check for duplicate phone
    const existing = await this.findByPhoneHash(phoneHash);
    if (existing) {
      throw new Error("Customer with this phone number already exists");
    }

    const result = await query(
      `INSERT INTO customers (
        phone_normalized, phone_hash, phone_masked, preferred_name, email,
        language, home_store_id, enrollment_source, enrollment_location_id,
        enrollment_channel, enrolled_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        phoneNormalized,
        phoneHash,
        phoneMasked,
        input.preferred_name || null,
        input.email || null,
        input.language || "en",
        input.home_store_id || null,
        input.enrollment_source,
        input.enrollment_location_id || null,
        input.enrollment_channel,
        input.enrolled_by || "system",
      ],
    );

    // Audit log
    await query(
      `INSERT INTO customer_audit_log (customer_id, entity_type, entity_id, action, new_values, performed_by)
       VALUES ($1, 'CUSTOMER', $2, 'CREATE', $3, $4)`,
      [
        result.rows[0].id,
        result.rows[0].id,
        JSON.stringify(result.rows[0]),
        input.enrolled_by || "system",
      ],
    );

    return result.rows[0];
  }

  /**
   * Find customer by normalized phone hash
   */
  async findByPhoneHash(phoneHash: string): Promise<Customer | null> {
    const result = await query(
      "SELECT * FROM customers WHERE phone_hash = $1 AND status = $2",
      [phoneHash, "ACTIVE"],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Find customer by phone number
   */
  async findByPhone(phone: string): Promise<Customer | null> {
    const phoneHash = hashPhone(phone);
    return this.findByPhoneHash(phoneHash);
  }

  /**
   * Get customer by ID
   */
  async findById(id: string): Promise<Customer | null> {
    const result = await query(
      "SELECT * FROM customers WHERE id = $1 AND status = $2",
      [id, "ACTIVE"],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Update customer profile
   */
  async updateCustomer(
    id: string,
    input: UpdateCustomerInput,
  ): Promise<Customer> {
    // Get old values for audit
    const oldResult = await query("SELECT * FROM customers WHERE id = $1", [
      id,
    ]);
    if (oldResult.rows.length === 0) {
      throw new Error("Customer not found");
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.preferred_name !== undefined) {
      updates.push(`preferred_name = $${paramIndex}`);
      values.push(input.preferred_name);
      paramIndex++;
    }
    if (input.email !== undefined) {
      updates.push(`email = $${paramIndex}`);
      values.push(input.email);
      paramIndex++;
    }
    if (input.language !== undefined) {
      updates.push(`language = $${paramIndex}`);
      values.push(input.language);
      paramIndex++;
    }
    if (input.home_store_id !== undefined) {
      updates.push(`home_store_id = $${paramIndex}`);
      values.push(input.home_store_id);
      paramIndex++;
    }

    if (updates.length === 0) {
      throw new Error("No fields to update");
    }

    values.push(id);
    values.push(input.updated_by);

    const result = await query(
      `UPDATE customers SET ${updates.join(", ")}, updated_by = $${paramIndex + 1} WHERE id = $${paramIndex + 2} RETURNING *`,
      values,
    );

    // Audit log
    await query(
      `INSERT INTO customer_audit_log (customer_id, entity_type, entity_id, action, old_values, new_values, performed_by)
       VALUES ($1, 'CUSTOMER', $2, 'UPDATE', $3, $4, $5)`,
      [
        id,
        id,
        JSON.stringify(oldResult.rows[0]),
        JSON.stringify(result.rows[0]),
        input.updated_by,
      ],
    );

    return result.rows[0];
  }

  /**
   * Mark customer as verified
   */
  async markVerified(id: string, verifiedBy: string): Promise<Customer> {
    const result = await query(
      `UPDATE customers SET verification_status = 'VERIFIED', updated_by = $1 WHERE id = $2 RETURNING *`,
      [verifiedBy, id],
    );
    return result.rows[0];
  }

  /**
   * Merge duplicate customer profiles
   */
  async mergeCustomers(input: MergeCustomersInput): Promise<void> {
    // Get both customers
    const sourceResult = await query("SELECT * FROM customers WHERE id = $1", [
      input.source_customer_id,
    ]);
    const targetResult = await query("SELECT * FROM customers WHERE id = $1", [
      input.target_customer_id,
    ]);

    if (sourceResult.rows.length === 0 || targetResult.rows.length === 0) {
      throw new Error("One or both customers not found");
    }

    // Check if already merged
    if (sourceResult.rows[0].merge_target_id) {
      throw new Error("Source customer already merged");
    }

    // Create merge audit record
    await query(
      `INSERT INTO customer_merge_audit (
        source_customer_id, target_customer_id, merge_reason, merged_by,
        approval_required, source_snapshot, target_snapshot
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.source_customer_id,
        input.target_customer_id,
        input.merge_reason,
        input.merged_by,
        input.approval_required || false,
        JSON.stringify(sourceResult.rows[0]),
        JSON.stringify(targetResult.rows[0]),
      ],
    );

    // Mark source as merged
    await query(
      `UPDATE customers SET 
        merge_target_id = $1, 
        merge_reason = $2, 
        merged_at = CURRENT_TIMESTAMP, 
        merged_by = $3,
        status = 'DELETED'
       WHERE id = $4`,
      [
        input.target_customer_id,
        input.merge_reason,
        input.merged_by,
        input.source_customer_id,
      ],
    );

    // Audit log
    await query(
      `INSERT INTO customer_audit_log (customer_id, entity_type, entity_id, action, old_values, new_values, performed_by, reason)
       VALUES ($1, 'CUSTOMER', $2, 'MERGE', $3, $4, $5, $6)`,
      [
        input.source_customer_id,
        input.source_customer_id,
        JSON.stringify(sourceResult.rows[0]),
        JSON.stringify({ merge_target_id: input.target_customer_id }),
        input.merged_by,
        input.merge_reason,
      ],
    );
  }

  /**
   * Search for potential duplicate customers
   */
  async findPotentialDuplicates(phone: string): Promise<Customer[]> {
    const phoneHash = hashPhone(phone);
    const result = await query(
      `SELECT * FROM customers WHERE phone_hash = $1 AND status != 'DELETED'`,
      [phoneHash],
    );
    return result.rows;
  }

  /**
   * Get customer with masked phone (for staff views)
   */
  async findByIdMasked(id: string): Promise<Customer | null> {
    const result = await query(
      `SELECT id, phone_masked, preferred_name, email, language, home_store_id, 
              status, verification_status, enrollment_source, enrolled_at
       FROM customers WHERE id = $1 AND status = $2`,
      [id, "ACTIVE"],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }
}
