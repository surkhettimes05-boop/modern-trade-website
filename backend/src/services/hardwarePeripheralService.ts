import { query } from "../database/connection.js";

interface HardwarePeripheral {
  id: string;
  peripheral_id: string;
  device_id: string;
  peripheral_type: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  connection_type: string;
  port_identifier: string;
  is_active: boolean;
  status: string;
  config: any;
  registered_at: Date;
  metadata: any;
}

export class HardwarePeripheralService {
  /**
   * Register hardware peripheral
   */
  async registerPeripheral(peripheralData: {
    device_id: string;
    peripheral_type: string;
    manufacturer?: string;
    model?: string;
    serial_number?: string;
    connection_type?: string;
    port_identifier?: string;
    config?: any;
    metadata?: any;
  }): Promise<HardwarePeripheral> {
    const peripheralId = this.generatePeripheralId();

    const result = await query(
      `INSERT INTO hardware_peripherals (
        peripheral_id, device_id, peripheral_type, manufacturer, model,
        serial_number, connection_type, port_identifier, config, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        peripheralId,
        peripheralData.device_id,
        peripheralData.peripheral_type,
        peripheralData.manufacturer || null,
        peripheralData.model || null,
        peripheralData.serial_number || null,
        peripheralData.connection_type || null,
        peripheralData.port_identifier || null,
        JSON.stringify(peripheralData.config || {}),
        JSON.stringify(peripheralData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get peripheral by ID
   */
  async getPeripheral(
    peripheralId: string,
  ): Promise<HardwarePeripheral | null> {
    const result = await query(
      "SELECT * FROM hardware_peripherals WHERE peripheral_id = $1",
      [peripheralId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get peripherals for device
   */
  async getPeripheralsForDevice(
    deviceId: string,
    includeInactive = false,
  ): Promise<HardwarePeripheral[]> {
    const conditions: string[] = ["device_id = $1"];
    const values: any[] = [deviceId];

    if (!includeInactive) {
      conditions.push("is_active = TRUE");
    }

    const result = await query(
      `SELECT * FROM hardware_peripherals WHERE ${conditions.join(" AND ")} ORDER BY registered_at DESC`,
      values,
    );
    return result.rows;
  }

  /**
   * Get peripherals by type
   */
  async getPeripheralsByType(
    deviceId: string,
    peripheralType: string,
  ): Promise<HardwarePeripheral[]> {
    const result = await query(
      `SELECT * FROM hardware_peripherals 
       WHERE device_id = $1 AND peripheral_type = $2 AND is_active = TRUE
       ORDER BY registered_at DESC`,
      [deviceId, peripheralType],
    );
    return result.rows;
  }

  /**
   * Update peripheral status
   */
  async updatePeripheralStatus(
    peripheralId: string,
    status: string,
  ): Promise<HardwarePeripheral> {
    const result = await query(
      `UPDATE hardware_peripherals 
       SET status = $1
       WHERE peripheral_id = $2
       RETURNING *`,
      [status, peripheralId],
    );

    if (result.rows.length === 0) {
      throw new Error("Peripheral not found");
    }

    return result.rows[0];
  }

  /**
   * Update peripheral config
   */
  async updatePeripheralConfig(
    peripheralId: string,
    config: any,
  ): Promise<HardwarePeripheral> {
    const result = await query(
      `UPDATE hardware_peripherals 
       SET config = $1
       WHERE peripheral_id = $2
       RETURNING *`,
      [JSON.stringify(config), peripheralId],
    );

    if (result.rows.length === 0) {
      throw new Error("Peripheral not found");
    }

    return result.rows[0];
  }

  /**
   * Delete peripheral
   */
  async deletePeripheral(peripheralId: string): Promise<void> {
    await query("DELETE FROM hardware_peripherals WHERE peripheral_id = $1", [
      peripheralId,
    ]);
  }

  /**
   * Generate peripheral ID
   */
  private generatePeripheralId(): string {
    return `PER-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

export const hardwarePeripheralService = new HardwarePeripheralService();
