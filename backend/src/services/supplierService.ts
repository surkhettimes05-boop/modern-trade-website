import { query } from "../database/connection.js";

interface Supplier {
  id: string;
  supplier_code: string;
  supplier_name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  country: string;
  payment_terms: string;
  credit_limit: number;
  current_balance: number;
  rating: number;
  total_orders: number;
  total_amount: number;
  last_order_date: Date;
  status: string;
  approval_status: string;
  approved_by: string;
  approved_at: Date;
  tax_id: string;
  pan_number: string;
  notes: string;
  metadata: any;
  created_at: Date;
  updated_at: Date;
  created_by: string;
}

interface SupplierProductCatalog {
  id: string;
  supplier_id: string;
  product_id: string;
  supplier_sku: string;
  supplier_product_name: string;
  unit_price: number;
  minimum_order_quantity: number;
  lead_time_days: number;
  is_preferred: boolean;
  effective_date: Date;
  expiry_date: Date;
  metadata: any;
}

export class SupplierService {
  /**
   * Create supplier
   */
  async createSupplier(supplierData: {
    supplier_name: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    country?: string;
    payment_terms?: string;
    credit_limit?: number;
    tax_id?: string;
    pan_number?: string;
    notes?: string;
    metadata?: any;
    created_by: string;
  }): Promise<Supplier> {
    const supplierCode = await this.generateSupplierCode();

    const result = await query(
      `INSERT INTO suppliers (
        supplier_code, supplier_name, contact_person, phone, email,
        address, city, country, payment_terms, credit_limit,
        tax_id, pan_number, notes, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        supplierCode,
        supplierData.supplier_name,
        supplierData.contact_person || null,
        supplierData.phone || null,
        supplierData.email || null,
        supplierData.address || null,
        supplierData.city || null,
        supplierData.country || "Nepal",
        supplierData.payment_terms || null,
        supplierData.credit_limit || null,
        supplierData.tax_id || null,
        supplierData.pan_number || null,
        supplierData.notes || null,
        JSON.stringify(supplierData.metadata || {}),
        supplierData.created_by,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get supplier by ID
   */
  async getSupplier(supplierId: string): Promise<Supplier | null> {
    const result = await query("SELECT * FROM suppliers WHERE id = $1", [
      supplierId,
    ]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get supplier by code
   */
  async getSupplierByCode(supplierCode: string): Promise<Supplier | null> {
    const result = await query(
      "SELECT * FROM suppliers WHERE supplier_code = $1",
      [supplierCode],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get all suppliers with filters
   */
  async getSuppliers(filters: {
    status?: string;
    approval_status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<Supplier[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.approval_status) {
      conditions.push(`approval_status = $${paramIndex}`);
      params.push(filters.approval_status);
      paramIndex++;
    }

    if (filters.search) {
      conditions.push(
        `(supplier_name ILIKE $${paramIndex} OR contact_person ILIKE $${paramIndex})`,
      );
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";
    const offsetClause = filters.offset ? `OFFSET ${filters.offset}` : "";

    const result = await query(
      `SELECT * FROM suppliers ${whereClause} ORDER BY supplier_name ${limitClause} ${offsetClause}`,
      params,
    );

    return result.rows;
  }

  /**
   * Update supplier
   */
  async updateSupplier(
    supplierId: string,
    updates: {
      supplier_name?: string;
      contact_person?: string;
      phone?: string;
      email?: string;
      address?: string;
      city?: string;
      payment_terms?: string;
      credit_limit?: number;
      rating?: number;
      status?: string;
      notes?: string;
      metadata?: any;
    },
  ): Promise<Supplier> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.supplier_name !== undefined) {
      fields.push(`supplier_name = $${paramIndex}`);
      values.push(updates.supplier_name);
      paramIndex++;
    }

    if (updates.contact_person !== undefined) {
      fields.push(`contact_person = $${paramIndex}`);
      values.push(updates.contact_person);
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

    if (updates.address !== undefined) {
      fields.push(`address = $${paramIndex}`);
      values.push(updates.address);
      paramIndex++;
    }

    if (updates.city !== undefined) {
      fields.push(`city = $${paramIndex}`);
      values.push(updates.city);
      paramIndex++;
    }

    if (updates.payment_terms !== undefined) {
      fields.push(`payment_terms = $${paramIndex}`);
      values.push(updates.payment_terms);
      paramIndex++;
    }

    if (updates.credit_limit !== undefined) {
      fields.push(`credit_limit = $${paramIndex}`);
      values.push(updates.credit_limit);
      paramIndex++;
    }

    if (updates.rating !== undefined) {
      fields.push(`rating = $${paramIndex}`);
      values.push(updates.rating);
      paramIndex++;
    }

    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex}`);
      values.push(updates.status);
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
    values.push(supplierId);

    const result = await query(
      `UPDATE suppliers SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    return result.rows[0];
  }

  /**
   * Approve supplier
   */
  async approveSupplier(
    supplierId: string,
    approvedBy: string,
  ): Promise<Supplier> {
    const result = await query(
      `UPDATE suppliers 
       SET approval_status = 'APPROVED', 
           approved_by = $1, 
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [approvedBy, supplierId],
    );

    return result.rows[0];
  }

  /**
   * Reject supplier
   */
  async rejectSupplier(
    supplierId: string,
    approvedBy: string,
  ): Promise<Supplier> {
    const result = await query(
      `UPDATE suppliers 
       SET approval_status = 'REJECTED', 
           approved_by = $1, 
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [approvedBy, supplierId],
    );

    return result.rows[0];
  }

  /**
   * Add product to supplier catalog
   */
  async addProductToCatalog(catalogData: {
    supplier_id: string;
    product_id: string;
    supplier_sku?: string;
    supplier_product_name?: string;
    unit_price: number;
    minimum_order_quantity?: number;
    lead_time_days?: number;
    is_preferred?: boolean;
    expiry_date?: Date;
    metadata?: any;
  }): Promise<SupplierProductCatalog> {
    const result = await query(
      `INSERT INTO supplier_product_catalog (
        supplier_id, product_id, supplier_sku, supplier_product_name,
        unit_price, minimum_order_quantity, lead_time_days, is_preferred,
        expiry_date, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        catalogData.supplier_id,
        catalogData.product_id,
        catalogData.supplier_sku || null,
        catalogData.supplier_product_name || null,
        catalogData.unit_price,
        catalogData.minimum_order_quantity || 1,
        catalogData.lead_time_days || 7,
        catalogData.is_preferred || false,
        catalogData.expiry_date || null,
        JSON.stringify(catalogData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get supplier product catalog
   */
  async getSupplierCatalog(
    supplierId: string,
    filters?: {
      product_id?: string;
      effective_date?: Date;
    },
  ): Promise<SupplierProductCatalog[]> {
    const conditions: string[] = ["supplier_id = $1"];
    const params: any[] = [supplierId];
    let paramIndex = 2;

    if (filters?.product_id) {
      conditions.push(`product_id = $${paramIndex}`);
      params.push(filters.product_id);
      paramIndex++;
    }

    if (filters?.effective_date) {
      conditions.push(
        `effective_date <= $${paramIndex} AND (expiry_date IS NULL OR expiry_date > $${paramIndex})`,
      );
      params.push(filters.effective_date);
      paramIndex++;
    }

    const result = await query(
      `SELECT * FROM supplier_product_catalog WHERE ${conditions.join(" AND ")}`,
      params,
    );

    return result.rows;
  }

  /**
   * Update supplier performance
   */
  async updateSupplierPerformance(
    supplierId: string,
    orderAmount: number,
  ): Promise<void> {
    await query(
      `UPDATE suppliers 
       SET total_orders = total_orders + 1,
           total_amount = total_amount + $1,
           last_order_date = CURRENT_DATE,
           updated_at = NOW()
       WHERE id = $2`,
      [orderAmount, supplierId],
    );
  }

  /**
   * Update supplier balance
   */
  async updateSupplierBalance(
    supplierId: string,
    amount: number,
  ): Promise<void> {
    await query(
      `UPDATE suppliers 
       SET current_balance = current_balance + $1,
           updated_at = NOW()
       WHERE id = $2`,
      [amount, supplierId],
    );
  }

  /**
   * Get supplier summary
   */
  async getSupplierSummary(): Promise<any> {
    const result = await query(
      `SELECT 
        COUNT(*) as total_suppliers,
        COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_suppliers,
        COUNT(*) FILTER (WHERE approval_status = 'PENDING') as pending_approval,
        COUNT(*) FILTER (WHERE approval_status = 'APPROVED') as approved_suppliers,
        SUM(total_amount) as total_purchase_amount,
        AVG(rating) as average_rating
      FROM suppliers`,
    );

    return result.rows[0];
  }

  /**
   * Search suppliers by product
   */
  async searchSuppliersByProduct(productId: string): Promise<Supplier[]> {
    const result = await query(
      `SELECT DISTINCT s.*
       FROM suppliers s
       JOIN supplier_product_catalog spc ON s.id = spc.supplier_id
       WHERE spc.product_id = $1
         AND s.status = 'ACTIVE'
         AND s.approval_status = 'APPROVED'
         AND spc.effective_date <= CURRENT_DATE
         AND (spc.expiry_date IS NULL OR spc.expiry_date > CURRENT_DATE)
       ORDER BY spc.is_preferred DESC, s.rating DESC`,
      [productId],
    );

    return result.rows;
  }

  /**
   * Generate supplier code
   */
  private async generateSupplierCode(): Promise<string> {
    const result = await query(
      `SELECT 'SUP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD((COALESCE(MAX(CAST(SUBSTRING(supplier_code FROM 13) AS INTEGER)), 0) + 1)::TEXT, 4, '0') as code
       FROM suppliers
       WHERE supplier_code LIKE 'SUP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-%'`,
    );

    if (result.rows[0].code) {
      return result.rows[0].code;
    }

    // Fallback if no existing codes for today
    return `SUP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-0001`;
  }
}
