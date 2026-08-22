import { query } from "../database/connection.js";

interface CustomerAddress {
  id: string;
  customer_id: string;
  province_id: number;
  district_id: number;
  municipality_id: number;
  ward_id: number;
  tole_locality: string;
  landmark: string;
  street: string;
  house_number: string;
  postal_code: string;
  phone: string;
  delivery_instructions: string;
  latitude: number;
  longitude: number;
  address_type: string;
  is_default: boolean;
  is_verified: boolean;
  verification_status: string;
  map_provider: string;
  map_reference_id: string;
  is_serviceable: boolean;
  serviceability_result: any;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  metadata: any;
}

export class AddressService {
  /**
   * Create customer address
   */
  async createAddress(addressData: {
    customer_id: string;
    province_id?: number;
    district_id?: number;
    municipality_id?: number;
    ward_id?: number;
    tole_locality?: string;
    landmark?: string;
    street?: string;
    house_number?: string;
    postal_code?: string;
    phone?: string;
    delivery_instructions?: string;
    latitude?: number;
    longitude?: number;
    address_type?: string;
    is_default?: boolean;
    map_provider?: string;
    map_reference_id?: string;
    created_by?: string;
    metadata?: any;
  }): Promise<CustomerAddress> {
    const result = await query(
      `INSERT INTO customer_addresses (
        customer_id, province_id, district_id, municipality_id, ward_id,
        tole_locality, landmark, street, house_number, postal_code,
        phone, delivery_instructions, latitude, longitude,
        address_type, is_default, map_provider, map_reference_id,
        created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *`,
      [
        addressData.customer_id,
        addressData.province_id || null,
        addressData.district_id || null,
        addressData.municipality_id || null,
        addressData.ward_id || null,
        addressData.tole_locality || null,
        addressData.landmark || null,
        addressData.street || null,
        addressData.house_number || null,
        addressData.postal_code || null,
        addressData.phone || null,
        addressData.delivery_instructions || null,
        addressData.latitude || null,
        addressData.longitude || null,
        addressData.address_type || "HOME",
        addressData.is_default || false,
        addressData.map_provider || null,
        addressData.map_reference_id || null,
        addressData.created_by || null,
        JSON.stringify(addressData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get address by ID
   */
  async getAddress(
    addressId: string,
    customerId?: string,
  ): Promise<CustomerAddress | null> {
    const result = await query(
      `SELECT * FROM customer_addresses
       WHERE id = $1 AND ($2::uuid IS NULL OR customer_id = $2)`,
      [addressId, customerId || null],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get customer addresses
   */
  async getCustomerAddresses(customerId: string): Promise<CustomerAddress[]> {
    const result = await query(
      `SELECT ca.*, 
              p.name_en as province_name, p.name_ne as province_name_ne,
              d.name_en as district_name, d.name_ne as district_name_ne,
              m.name_en as municipality_name, m.name_ne as municipality_name_ne,
              w.ward_number, w.name_en as ward_name, w.name_ne as ward_name_ne
       FROM customer_addresses ca
       LEFT JOIN nepal_provinces p ON ca.province_id = p.id
       LEFT JOIN nepal_districts d ON ca.district_id = d.id
       LEFT JOIN nepal_municipalities m ON ca.municipality_id = m.id
       LEFT JOIN nepal_wards w ON ca.ward_id = w.id
       WHERE ca.customer_id = $1
       ORDER BY ca.is_default DESC, ca.created_at DESC`,
      [customerId],
    );
    return result.rows;
  }

  /**
   * Get default address for customer
   */
  async getDefaultAddress(customerId: string): Promise<CustomerAddress | null> {
    const result = await query(
      `SELECT * FROM customer_addresses 
       WHERE customer_id = $1 AND is_default = TRUE
       LIMIT 1`,
      [customerId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Update address
   */
  async updateAddress(
    addressId: string,
    updates: {
      province_id?: number;
      district_id?: number;
      municipality_id?: number;
      ward_id?: number;
      tole_locality?: string;
      landmark?: string;
      street?: string;
      house_number?: string;
      postal_code?: string;
      phone?: string;
      delivery_instructions?: string;
      latitude?: number;
      longitude?: number;
      address_type?: string;
      is_default?: boolean;
      is_verified?: boolean;
      verification_status?: string;
      map_provider?: string;
      map_reference_id?: string;
      is_serviceable?: boolean;
      serviceability_result?: any;
      metadata?: any;
    },
    customerId?: string,
  ): Promise<CustomerAddress> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.province_id !== undefined) {
      fields.push(`province_id = $${paramIndex}`);
      values.push(updates.province_id);
      paramIndex++;
    }

    if (updates.district_id !== undefined) {
      fields.push(`district_id = $${paramIndex}`);
      values.push(updates.district_id);
      paramIndex++;
    }

    if (updates.municipality_id !== undefined) {
      fields.push(`municipality_id = $${paramIndex}`);
      values.push(updates.municipality_id);
      paramIndex++;
    }

    if (updates.ward_id !== undefined) {
      fields.push(`ward_id = $${paramIndex}`);
      values.push(updates.ward_id);
      paramIndex++;
    }

    if (updates.tole_locality !== undefined) {
      fields.push(`tole_locality = $${paramIndex}`);
      values.push(updates.tole_locality);
      paramIndex++;
    }

    if (updates.landmark !== undefined) {
      fields.push(`landmark = $${paramIndex}`);
      values.push(updates.landmark);
      paramIndex++;
    }

    if (updates.street !== undefined) {
      fields.push(`street = $${paramIndex}`);
      values.push(updates.street);
      paramIndex++;
    }

    if (updates.house_number !== undefined) {
      fields.push(`house_number = $${paramIndex}`);
      values.push(updates.house_number);
      paramIndex++;
    }

    if (updates.postal_code !== undefined) {
      fields.push(`postal_code = $${paramIndex}`);
      values.push(updates.postal_code);
      paramIndex++;
    }

    if (updates.phone !== undefined) {
      fields.push(`phone = $${paramIndex}`);
      values.push(updates.phone);
      paramIndex++;
    }

    if (updates.delivery_instructions !== undefined) {
      fields.push(`delivery_instructions = $${paramIndex}`);
      values.push(updates.delivery_instructions);
      paramIndex++;
    }

    if (updates.latitude !== undefined) {
      fields.push(`latitude = $${paramIndex}`);
      values.push(updates.latitude);
      paramIndex++;
    }

    if (updates.longitude !== undefined) {
      fields.push(`longitude = $${paramIndex}`);
      values.push(updates.longitude);
      paramIndex++;
    }

    if (updates.address_type !== undefined) {
      fields.push(`address_type = $${paramIndex}`);
      values.push(updates.address_type);
      paramIndex++;
    }

    if (updates.is_default !== undefined) {
      fields.push(`is_default = $${paramIndex}`);
      values.push(updates.is_default);
      paramIndex++;
    }

    if (updates.is_verified !== undefined) {
      fields.push(`is_verified = $${paramIndex}`);
      values.push(updates.is_verified);
      paramIndex++;
    }

    if (updates.verification_status !== undefined) {
      fields.push(`verification_status = $${paramIndex}`);
      values.push(updates.verification_status);
      paramIndex++;
    }

    if (updates.map_provider !== undefined) {
      fields.push(`map_provider = $${paramIndex}`);
      values.push(updates.map_provider);
      paramIndex++;
    }

    if (updates.map_reference_id !== undefined) {
      fields.push(`map_reference_id = $${paramIndex}`);
      values.push(updates.map_reference_id);
      paramIndex++;
    }

    if (updates.is_serviceable !== undefined) {
      fields.push(`is_serviceable = $${paramIndex}`);
      values.push(updates.is_serviceable);
      paramIndex++;
    }

    if (updates.serviceability_result !== undefined) {
      fields.push(`serviceability_result = $${paramIndex}`);
      values.push(JSON.stringify(updates.serviceability_result));
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
    values.push(addressId);
    const addressIdIndex = paramIndex;
    paramIndex++;
    values.push(customerId || null);

    const result = await query(
      `UPDATE customer_addresses SET ${fields.join(", ")}
       WHERE id = $${addressIdIndex}
         AND ($${paramIndex}::uuid IS NULL OR customer_id = $${paramIndex})
       RETURNING *`,
      values,
    );

    if (!result.rows[0]) throw new Error("Address not found");
    return result.rows[0];
  }

  /**
   * Set default address
   */
  async setDefaultAddress(
    customerId: string,
    addressId: string,
  ): Promise<CustomerAddress> {
    // First, unset all default addresses for this customer
    await query(
      "UPDATE customer_addresses SET is_default = FALSE WHERE customer_id = $1",
      [customerId],
    );

    // Then set the new default
    const result = await query(
      `UPDATE customer_addresses 
       SET is_default = TRUE, updated_at = NOW()
       WHERE id = $1 AND customer_id = $2
       RETURNING *`,
      [addressId, customerId],
    );

    return result.rows[0];
  }

  /**
   * Delete address
   */
  async deleteAddress(addressId: string, customerId?: string): Promise<void> {
    const result = await query(
      `DELETE FROM customer_addresses
       WHERE id = $1 AND ($2::uuid IS NULL OR customer_id = $2)
       RETURNING id`,
      [addressId, customerId || null],
    );
    if (!result.rowCount) throw new Error("Address not found");
  }

  /**
   * Verify address
   */
  async verifyAddress(
    addressId: string,
    verificationData: {
      verification_status: string;
      map_provider?: string;
      map_reference_id?: string;
      serviceability_result?: any;
    },
  ): Promise<CustomerAddress> {
    const result = await query(
      `UPDATE customer_addresses 
       SET verification_status = $1,
           is_verified = CASE WHEN $1 = 'VERIFIED' THEN TRUE ELSE FALSE END,
           map_provider = COALESCE($2, map_provider),
           map_reference_id = COALESCE($3, map_reference_id),
           serviceability_result = COALESCE($4, serviceability_result),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        verificationData.verification_status,
        verificationData.map_provider || null,
        verificationData.map_reference_id || null,
        verificationData.serviceability_result
          ? JSON.stringify(verificationData.serviceability_result)
          : null,
        addressId,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get provinces
   */
  async getProvinces(): Promise<any[]> {
    const result = await query("SELECT * FROM nepal_provinces ORDER BY code");
    return result.rows;
  }

  /**
   * Get districts by province
   */
  async getDistricts(provinceId?: number): Promise<any[]> {
    if (provinceId) {
      const result = await query(
        "SELECT * FROM nepal_districts WHERE province_id = $1 ORDER BY code",
        [provinceId],
      );
      return result.rows;
    }
    const result = await query("SELECT * FROM nepal_districts ORDER BY code");
    return result.rows;
  }

  /**
   * Get municipalities by district
   */
  async getMunicipalities(districtId?: number): Promise<any[]> {
    if (districtId) {
      const result = await query(
        "SELECT * FROM nepal_municipalities WHERE district_id = $1 ORDER BY code",
        [districtId],
      );
      return result.rows;
    }
    const result = await query(
      "SELECT * FROM nepal_municipalities ORDER BY code",
    );
    return result.rows;
  }

  /**
   * Get wards by municipality
   */
  async getWards(municipalityId?: number): Promise<any[]> {
    if (municipalityId) {
      const result = await query(
        "SELECT * FROM nepal_wards WHERE municipality_id = $1 ORDER BY ward_number",
        [municipalityId],
      );
      return result.rows;
    }
    const result = await query(
      "SELECT * FROM nepal_wards ORDER BY municipality_id, ward_number",
    );
    return result.rows;
  }
}
