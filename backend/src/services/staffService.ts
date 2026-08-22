import { query } from "../database/connection.js";
import { encryptMfaSecret } from "../utils/totp.js";
import bcrypt from "bcrypt";

interface Staff {
  id: string;
  staff_number: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  email: string;
  store_id: string;
  role: string;
  position: string;
  department: string;
  status: string;
  hire_date: Date;
  termination_date: Date;
  username: string;
  mfa_enabled: boolean;
  permissions: any;
  notes: string;
  metadata: any;
  created_at: Date;
  updated_at: Date;
  created_by: string;
}

function safeStaff(row: Record<string, any>): Staff {
  const safe = { ...row };
  delete safe.password_hash;
  delete safe.mfa_secret;
  delete safe.mfa_backup_codes;
  return safe as Staff;
}

export class StaffService {
  /**
   * Create staff member
   */
  async createStaff(staffData: {
    first_name: string;
    last_name: string;
    phone?: string;
    email?: string;
    store_id?: string;
    role: string;
    position?: string;
    department?: string;
    status?: string;
    hire_date?: Date;
    username?: string;
    password?: string;
    permissions?: any;
    notes?: string;
    metadata?: any;
    created_by: string;
  }): Promise<Staff> {
    const staffNumber = await this.generateStaffNumber();
    let passwordHash: string | null = null;

    if (staffData.password) {
      passwordHash = await bcrypt.hash(staffData.password, 10);
    }

    const result = await query(
      `INSERT INTO staff (
        staff_number, first_name, last_name, phone, email,
        store_id, role, position, department, status,
        hire_date, username, password_hash, permissions,
        notes, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        staffNumber,
        staffData.first_name,
        staffData.last_name,
        staffData.phone || null,
        staffData.email || null,
        staffData.store_id || null,
        staffData.role,
        staffData.position || null,
        staffData.department || null,
        staffData.status || "ACTIVE",
        staffData.hire_date || new Date(),
        staffData.username || null,
        passwordHash,
        JSON.stringify(staffData.permissions || {}),
        staffData.notes || null,
        JSON.stringify(staffData.metadata || {}),
        staffData.created_by,
      ],
    );

    return safeStaff(result.rows[0]);
  }

  /**
   * Get staff by ID
   */
  async getStaff(staffId: string): Promise<Staff | null> {
    const result = await query("SELECT * FROM staff WHERE id = $1", [staffId]);
    return result.rows.length > 0 ? safeStaff(result.rows[0]) : null;
  }

  /**
   * Get staff by number
   */
  async getStaffByNumber(staffNumber: string): Promise<Staff | null> {
    const result = await query("SELECT * FROM staff WHERE staff_number = $1", [
      staffNumber,
    ]);
    return result.rows.length > 0 ? safeStaff(result.rows[0]) : null;
  }

  /**
   * Get staff by username
   */
  async getStaffByUsername(username: string): Promise<Staff | null> {
    const result = await query("SELECT * FROM staff WHERE username = $1", [
      username,
    ]);
    return result.rows.length > 0 ? safeStaff(result.rows[0]) : null;
  }

  /**
   * Get all staff with filters
   */
  async getStaffList(filters: {
    store_id?: string;
    role?: string;
    status?: string;
    department?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<Staff[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.store_id) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(filters.store_id);
      paramIndex++;
    }

    if (filters.role) {
      conditions.push(`role = $${paramIndex}`);
      params.push(filters.role);
      paramIndex++;
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.department) {
      conditions.push(`department = $${paramIndex}`);
      params.push(filters.department);
      paramIndex++;
    }

    if (filters.search) {
      conditions.push(
        `(first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex} OR full_name ILIKE $${paramIndex})`,
      );
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";
    const offsetClause = filters.offset ? `OFFSET ${filters.offset}` : "";

    const result = await query(
      `SELECT * FROM staff ${whereClause} ORDER BY created_at DESC ${limitClause} ${offsetClause}`,
      params,
    );

    return result.rows.map(safeStaff);
  }

  /**
   * Update staff
   */
  async updateStaff(
    staffId: string,
    updates: {
      first_name?: string;
      last_name?: string;
      phone?: string;
      email?: string;
      store_id?: string;
      role?: string;
      position?: string;
      department?: string;
      status?: string;
      termination_date?: Date;
      permissions?: any;
      notes?: string;
      metadata?: any;
    },
  ): Promise<Staff> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.first_name !== undefined) {
      fields.push(`first_name = $${paramIndex}`);
      values.push(updates.first_name);
      paramIndex++;
    }

    if (updates.last_name !== undefined) {
      fields.push(`last_name = $${paramIndex}`);
      values.push(updates.last_name);
      paramIndex++;
    }

    if (updates.phone !== undefined) {
      fields.push(`phone = $${paramIndex}`);
      values.push(updates.phone);
      paramIndex++;
    }

    if (updates.email !== undefined) {
      fields.push(`email = $${paramIndex}`);
      values.push(updates.email);
      paramIndex++;
    }

    if (updates.store_id !== undefined) {
      fields.push(`store_id = $${paramIndex}`);
      values.push(updates.store_id);
      paramIndex++;
    }

    if (updates.role !== undefined) {
      fields.push(`role = $${paramIndex}`);
      values.push(updates.role);
      paramIndex++;
    }

    if (updates.position !== undefined) {
      fields.push(`position = $${paramIndex}`);
      values.push(updates.position);
      paramIndex++;
    }

    if (updates.department !== undefined) {
      fields.push(`department = $${paramIndex}`);
      values.push(updates.department);
      paramIndex++;
    }

    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex}`);
      values.push(updates.status);
      paramIndex++;
    }

    if (updates.termination_date !== undefined) {
      fields.push(`termination_date = $${paramIndex}`);
      values.push(updates.termination_date);
      paramIndex++;
    }

    if (updates.permissions !== undefined) {
      fields.push(`permissions = $${paramIndex}`);
      values.push(JSON.stringify(updates.permissions));
      paramIndex++;
    }

    if (updates.notes !== undefined) {
      fields.push(`notes = $${paramIndex}`);
      values.push(updates.notes);
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
    values.push(staffId);

    const result = await query(
      `UPDATE staff SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    return safeStaff(result.rows[0]);
  }

  /**
   * Update password
   */
  async updatePassword(staffId: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await query(
      `UPDATE staff 
       SET password_hash = $1, updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, staffId],
    );
  }

  /**
   * Enable MFA
   */
  async enableMFA(staffId: string, mfaSecret: string): Promise<Staff> {
    const result = await query(
      `UPDATE staff 
       SET mfa_enabled = TRUE,
           mfa_secret = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [encryptMfaSecret(mfaSecret), staffId],
    );

    return safeStaff(result.rows[0]);
  }

  /**
   * Disable MFA
   */
  async disableMFA(staffId: string): Promise<Staff> {
    const result = await query(
      `UPDATE staff 
       SET mfa_enabled = FALSE,
           mfa_secret = NULL,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [null, staffId],
    );

    return safeStaff(result.rows[0]);
  }

  /**
   * Verify password
   */
  async verifyPassword(staffId: string, password: string): Promise<boolean> {
    const result = await query("SELECT password_hash FROM staff WHERE id = $1", [
      staffId,
    ]);
    const passwordHash = result.rows[0]?.password_hash;
    if (!passwordHash) {
      return false;
    }

    return bcrypt.compare(password, passwordHash);
  }

  /**
   * Terminate staff
   */
  async terminateStaff(
    staffId: string,
    terminationDate?: Date,
  ): Promise<Staff> {
    const result = await query(
      `UPDATE staff 
       SET status = 'TERMINATED',
           termination_date = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [terminationDate || new Date(), staffId],
    );

    return safeStaff(result.rows[0]);
  }

  /**
   * Get staff summary
   */
  async getStaffSummary(filters?: {
    store_id?: string;
    role?: string;
    status?: string;
  }): Promise<any> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.store_id) {
      conditions.push(`store_id = $${paramIndex}`);
      params.push(filters.store_id);
      paramIndex++;
    }

    if (filters?.role) {
      conditions.push(`role = $${paramIndex}`);
      params.push(filters.role);
      paramIndex++;
    }

    if (filters?.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT 
        COUNT(*) as total_staff,
        COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_staff,
        COUNT(*) FILTER (WHERE status = 'INACTIVE') as inactive_staff,
        COUNT(*) FILTER (WHERE status = 'TERMINATED') as terminated_staff,
        COUNT(*) FILTER (WHERE status = 'ON_LEAVE') as on_leave_staff,
        COUNT(DISTINCT store_id) as total_stores
      FROM staff ${whereClause}`,
      params,
    );

    return result.rows[0];
  }

  /**
   * Generate staff number
   */
  private async generateStaffNumber(): Promise<string> {
    const result = await query("SELECT generate_staff_number() as number");
    return result.rows[0].number;
  }
}
