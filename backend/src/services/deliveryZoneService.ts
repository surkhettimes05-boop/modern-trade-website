import { query } from "../database/connection.js";

interface DeliveryZone {
  id: string;
  zone_name: string;
  store_id: string;
  zone_type: string;
  included_municipalities: number[];
  included_wards: number[];
  excluded_areas: string[];
  base_fee: number;
  surcharge: number;
  free_delivery_threshold: number;
  minimum_order_value: number;
  estimated_delivery_hours: number;
  delivery_time_slots: any;
  is_active: boolean;
  effective_date: Date;
  expiry_date: Date;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  metadata: any;
}

export class DeliveryZoneService {
  /**
   * Create delivery zone
   */
  async createDeliveryZone(zoneData: {
    zone_name: string;
    store_id: string;
    zone_type?: string;
    included_municipalities?: number[];
    included_wards?: number[];
    excluded_areas?: string[];
    base_fee: number;
    surcharge?: number;
    free_delivery_threshold?: number;
    minimum_order_value?: number;
    estimated_delivery_hours?: number;
    delivery_time_slots?: any;
    effective_date?: Date;
    expiry_date?: Date;
    created_by?: string;
    metadata?: any;
  }): Promise<DeliveryZone> {
    const result = await query(
      `INSERT INTO delivery_zones (
        zone_name, store_id, zone_type, included_municipalities, included_wards,
        excluded_areas, base_fee, surcharge, free_delivery_threshold, minimum_order_value,
        estimated_delivery_hours, delivery_time_slots, effective_date, expiry_date,
        created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        zoneData.zone_name,
        zoneData.store_id,
        zoneData.zone_type || "STANDARD",
        zoneData.included_municipalities || [],
        zoneData.included_wards || [],
        zoneData.excluded_areas || [],
        zoneData.base_fee,
        zoneData.surcharge || 0,
        zoneData.free_delivery_threshold || null,
        zoneData.minimum_order_value || 0,
        zoneData.estimated_delivery_hours || null,
        JSON.stringify(zoneData.delivery_time_slots || []),
        zoneData.effective_date || new Date(),
        zoneData.expiry_date || null,
        zoneData.created_by || null,
        JSON.stringify(zoneData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get delivery zone by ID
   */
  async getDeliveryZone(zoneId: string): Promise<DeliveryZone | null> {
    const result = await query("SELECT * FROM delivery_zones WHERE id = $1", [
      zoneId,
    ]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get delivery zones for store
   */
  async getStoreDeliveryZones(
    storeId: string,
    activeOnly = true,
  ): Promise<DeliveryZone[]> {
    const conditions = ["store_id = $1"];
    const params: any[] = [storeId];

    if (activeOnly) {
      conditions.push("is_active = TRUE");
      conditions.push("(effective_date IS NULL OR effective_date <= NOW())");
      conditions.push("(expiry_date IS NULL OR expiry_date >= NOW())");
    }

    const result = await query(
      `SELECT * FROM delivery_zones WHERE ${conditions.join(" AND ")} ORDER BY zone_name`,
      params,
    );
    return result.rows;
  }

  /**
   * Get delivery quote for address
   */
  async getDeliveryQuote(addressData: {
    municipality_id?: number;
    ward_id?: number;
    store_id: string;
    order_value?: number;
  }): Promise<any> {
    // Find matching zone
    const zones = await this.getStoreDeliveryZones(addressData.store_id, true);

    let matchedZone: DeliveryZone | null = null;

    for (const zone of zones) {
      // Check if address falls within zone
      if (
        addressData.municipality_id &&
        zone.included_municipalities?.includes(addressData.municipality_id)
      ) {
        // Check if ward is excluded
        if (
          addressData.ward_id &&
          zone.included_wards?.length > 0 &&
          !zone.included_wards.includes(addressData.ward_id)
        ) {
          continue;
        }
        matchedZone = zone;
        break;
      }

      if (
        addressData.ward_id &&
        zone.included_wards?.includes(addressData.ward_id)
      ) {
        matchedZone = zone;
        break;
      }
    }

    if (!matchedZone) {
      return {
        serviceable: false,
        reason: "Address not in service area",
      };
    }

    // Calculate delivery fee
    let deliveryFee = matchedZone.base_fee + (matchedZone.surcharge || 0);

    // Check for free delivery
    if (
      addressData.order_value &&
      matchedZone.free_delivery_threshold &&
      addressData.order_value >= matchedZone.free_delivery_threshold
    ) {
      deliveryFee = 0;
    }

    // Check minimum order
    if (
      addressData.order_value &&
      matchedZone.minimum_order_value &&
      addressData.order_value < matchedZone.minimum_order_value
    ) {
      return {
        serviceable: false,
        reason: `Minimum order value is ${matchedZone.minimum_order_value}`,
        minimum_order_value: matchedZone.minimum_order_value,
      };
    }

    return {
      serviceable: true,
      zone_id: matchedZone.id,
      zone_name: matchedZone.zone_name,
      delivery_fee: deliveryFee,
      base_fee: matchedZone.base_fee,
      surcharge: matchedZone.surcharge || 0,
      free_delivery_threshold: matchedZone.free_delivery_threshold,
      minimum_order_value: matchedZone.minimum_order_value,
      estimated_delivery_hours: matchedZone.estimated_delivery_hours,
      delivery_time_slots: matchedZone.delivery_time_slots,
    };
  }

  /**
   * Update delivery zone
   */
  async updateDeliveryZone(
    zoneId: string,
    updates: {
      zone_name?: string;
      zone_type?: string;
      included_municipalities?: number[];
      included_wards?: number[];
      excluded_areas?: string[];
      base_fee?: number;
      surcharge?: number;
      free_delivery_threshold?: number;
      minimum_order_value?: number;
      estimated_delivery_hours?: number;
      delivery_time_slots?: any;
      is_active?: boolean;
      effective_date?: Date;
      expiry_date?: Date;
      metadata?: any;
    },
  ): Promise<DeliveryZone> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.zone_name !== undefined) {
      fields.push(`zone_name = $${paramIndex}`);
      values.push(updates.zone_name);
      paramIndex++;
    }

    if (updates.zone_type !== undefined) {
      fields.push(`zone_type = $${paramIndex}`);
      values.push(updates.zone_type);
      paramIndex++;
    }

    if (updates.included_municipalities !== undefined) {
      fields.push(`included_municipalities = $${paramIndex}`);
      values.push(updates.included_municipalities);
      paramIndex++;
    }

    if (updates.included_wards !== undefined) {
      fields.push(`included_wards = $${paramIndex}`);
      values.push(updates.included_wards);
      paramIndex++;
    }

    if (updates.excluded_areas !== undefined) {
      fields.push(`excluded_areas = $${paramIndex}`);
      values.push(updates.excluded_areas);
      paramIndex++;
    }

    if (updates.base_fee !== undefined) {
      fields.push(`base_fee = $${paramIndex}`);
      values.push(updates.base_fee);
      paramIndex++;
    }

    if (updates.surcharge !== undefined) {
      fields.push(`surcharge = $${paramIndex}`);
      values.push(updates.surcharge);
      paramIndex++;
    }

    if (updates.free_delivery_threshold !== undefined) {
      fields.push(`free_delivery_threshold = $${paramIndex}`);
      values.push(updates.free_delivery_threshold);
      paramIndex++;
    }

    if (updates.minimum_order_value !== undefined) {
      fields.push(`minimum_order_value = $${paramIndex}`);
      values.push(updates.minimum_order_value);
      paramIndex++;
    }

    if (updates.estimated_delivery_hours !== undefined) {
      fields.push(`estimated_delivery_hours = $${paramIndex}`);
      values.push(updates.estimated_delivery_hours);
      paramIndex++;
    }

    if (updates.delivery_time_slots !== undefined) {
      fields.push(`delivery_time_slots = $${paramIndex}`);
      values.push(JSON.stringify(updates.delivery_time_slots));
      paramIndex++;
    }

    if (updates.is_active !== undefined) {
      fields.push(`is_active = $${paramIndex}`);
      values.push(updates.is_active);
      paramIndex++;
    }

    if (updates.effective_date !== undefined) {
      fields.push(`effective_date = $${paramIndex}`);
      values.push(updates.effective_date);
      paramIndex++;
    }

    if (updates.expiry_date !== undefined) {
      fields.push(`expiry_date = $${paramIndex}`);
      values.push(updates.expiry_date);
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
    values.push(zoneId);

    const result = await query(
      `UPDATE delivery_zones SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    return result.rows[0];
  }

  /**
   * Delete delivery zone
   */
  async deleteDeliveryZone(zoneId: string): Promise<void> {
    await query("DELETE FROM delivery_zones WHERE id = $1", [zoneId]);
  }
}
