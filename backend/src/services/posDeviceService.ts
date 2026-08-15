import { query } from "../database/connection.js";

interface POSDevice {
  id: string;
  device_id: string;
  store_id: string;
  device_name: string;
  device_type: string;
  operating_system: string;
  os_version: string;
  app_version: string;
  hardware_profile: any;
  location_name: string;
  location_lat: number;
  location_lng: number;
  is_active: boolean;
  is_online: boolean;
  last_heartbeat: Date;
  last_sync_at: Date;
  config: any;
  registered_at: Date;
  registered_by: string;
  metadata: any;
}

export class POSDeviceService {
  /**
   * Register POS device
   */
  async registerDevice(deviceData: {
    store_id: string;
    device_name: string;
    device_type: string;
    operating_system?: string;
    os_version?: string;
    app_version?: string;
    hardware_profile?: any;
    location_name?: string;
    location_lat?: number;
    location_lng?: number;
    config?: any;
    registered_by?: string;
    metadata?: any;
  }): Promise<POSDevice> {
    const deviceId = this.generateDeviceId();

    const result = await query(
      `INSERT INTO pos_devices (
        device_id, store_id, device_name, device_type, operating_system,
        os_version, app_version, hardware_profile, location_name, location_lat,
        location_lng, config, registered_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        deviceId,
        deviceData.store_id,
        deviceData.device_name,
        deviceData.device_type,
        deviceData.operating_system || null,
        deviceData.os_version || null,
        deviceData.app_version || null,
        JSON.stringify(deviceData.hardware_profile || {}),
        deviceData.location_name || null,
        deviceData.location_lat || null,
        deviceData.location_lng || null,
        JSON.stringify(deviceData.config || {}),
        deviceData.registered_by || null,
        JSON.stringify(deviceData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get device by ID
   */
  async getDevice(deviceId: string): Promise<POSDevice | null> {
    const result = await query(
      "SELECT * FROM pos_devices WHERE device_id = $1",
      [deviceId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get devices for store
   */
  async getDevicesForStore(
    storeId: string,
    includeInactive = false,
  ): Promise<POSDevice[]> {
    const conditions: string[] = ["store_id = $1"];
    const values: any[] = [storeId];

    if (!includeInactive) {
      conditions.push("is_active = TRUE");
    }

    const result = await query(
      `SELECT * FROM pos_devices WHERE ${conditions.join(" AND ")} ORDER BY registered_at DESC`,
      values,
    );
    return result.rows;
  }

  /**
   * Update device heartbeat
   */
  async updateHeartbeat(deviceId: string, isOnline = true): Promise<POSDevice> {
    const result = await query(
      `UPDATE pos_devices 
       SET last_heartbeat = NOW(), is_online = $1
       WHERE device_id = $2
       RETURNING *`,
      [isOnline, deviceId],
    );

    if (result.rows.length === 0) {
      throw new Error("Device not found");
    }

    return result.rows[0];
  }

  /**
   * Update device status
   */
  async updateDeviceStatus(
    deviceId: string,
    status: {
      is_active?: boolean;
      is_online?: boolean;
      config?: any;
    },
  ): Promise<POSDevice> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (status.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      values.push(status.is_active);
      paramIndex++;
    }

    if (status.is_online !== undefined) {
      updates.push(`is_online = $${paramIndex}`);
      values.push(status.is_online);
      paramIndex++;
    }

    if (status.config !== undefined) {
      updates.push(`config = $${paramIndex}`);
      values.push(JSON.stringify(status.config));
      paramIndex++;
    }

    values.push(deviceId);

    const result = await query(
      `UPDATE pos_devices SET ${updates.join(", ")} WHERE device_id = $${paramIndex} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new Error("Device not found");
    }

    return result.rows[0];
  }

  /**
   * Get offline devices
   */
  async getOfflineDevices(thresholdMinutes = 15): Promise<POSDevice[]> {
    const result = await query(
      `SELECT * FROM pos_devices 
       WHERE is_online = TRUE 
       AND last_heartbeat < NOW() - INTERVAL '${thresholdMinutes} minutes'
       ORDER BY last_heartbeat ASC`,
      [],
    );
    return result.rows;
  }

  /**
   * Mark devices as offline based on heartbeat
   */
  async markOfflineDevices(thresholdMinutes = 15): Promise<number> {
    const result = await query(
      `UPDATE pos_devices 
       SET is_online = FALSE
       WHERE is_online = TRUE 
       AND last_heartbeat < NOW() - INTERVAL '${thresholdMinutes} minutes'
       RETURNING id`,
      [],
    );
    return result.rows.length;
  }

  /**
   * Delete device
   */
  async deleteDevice(deviceId: string): Promise<void> {
    await query("DELETE FROM pos_devices WHERE device_id = $1", [deviceId]);
  }

  /**
   * Generate device ID
   */
  private generateDeviceId(): string {
    return `DEV-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

export const posDeviceService = new POSDeviceService();
