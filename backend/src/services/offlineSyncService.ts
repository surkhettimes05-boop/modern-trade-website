import { query } from "../database/connection.js";
import crypto from "crypto";

interface Device {
  id: string;
  device_id: string;
  device_name: string;
  device_type: string;
  store_id: string;
  serial_number: string;
  mac_address: string;
  os_version: string;
  app_version: string;
  registration_date: Date;
  last_seen: Date;
  last_sync: Date;
  status: string;
  configuration: any;
}

interface OfflineTransaction {
  id: string;
  transaction_uuid: string;
  device_id: string;
  store_id: string;
  transaction_type: string;
  local_sequence_number: bigint;
  original_occurrence_timestamp: Date;
  device_clock_timestamp: Date;
  reference_data_versions: any;
  transaction_data: any;
  checksum: string;
  sync_status: string;
  sync_attempts: number;
  last_sync_attempt: Date;
  sync_error_message: string;
  server_transaction_id: string;
  server_acknowledged_at: Date;
  conflict_detected: boolean;
  conflict_type: string;
  conflict_resolution: string;
  encryption_version: string;
  signature: string;
}

export class OfflineSyncService {
  private readonly ENCRYPTION_KEY =
    process.env.ENCRYPTION_KEY || "default-key-change-in-production";
  private readonly SIGNATURE_SECRET =
    process.env.SIGNATURE_SECRET || "default-secret-change-in-production";

  /**
   * Register or update device
   */
  async registerDevice(deviceData: {
    device_id: string;
    device_name?: string;
    device_type: string;
    store_id: string;
    serial_number?: string;
    mac_address?: string;
    os_version?: string;
    app_version?: string;
    configuration?: any;
  }): Promise<Device> {
    const result = await query(
      `INSERT INTO devices (
        device_id, device_name, device_type, store_id, serial_number,
        mac_address, os_version, app_version, configuration, last_seen
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (device_id)
      DO UPDATE SET
        device_name = COALESCE(EXCLUDED.device_name, devices.device_name),
        device_type = EXCLUDED.device_type,
        store_id = EXCLUDED.store_id,
        serial_number = COALESCE(EXCLUDED.serial_number, devices.serial_number),
        mac_address = COALESCE(EXCLUDED.mac_address, devices.mac_address),
        os_version = COALESCE(EXCLUDED.os_version, devices.os_version),
        app_version = COALESCE(EXCLUDED.app_version, devices.app_version),
        configuration = COALESCE(EXCLUDED.configuration, devices.configuration),
        last_seen = NOW(),
        updated_at = NOW()
      RETURNING *`,
      [
        deviceData.device_id,
        deviceData.device_name || null,
        deviceData.device_type,
        deviceData.store_id,
        deviceData.serial_number || null,
        deviceData.mac_address || null,
        deviceData.os_version || null,
        deviceData.app_version || null,
        JSON.stringify(deviceData.configuration || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get device by device_id
   */
  async getDevice(deviceId: string): Promise<Device | null> {
    const result = await query("SELECT * FROM devices WHERE device_id = $1", [
      deviceId,
    ]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Update device last seen
   */
  async updateDeviceLastSeen(deviceId: string): Promise<void> {
    await query(
      "UPDATE devices SET last_seen = NOW(), updated_at = NOW() WHERE device_id = $1",
      [deviceId],
    );
  }

  /**
   * Add transaction to offline queue
   */
  async addTransaction(transactionData: {
    device_id: string;
    store_id: string;
    transaction_type: string;
    local_sequence_number: bigint;
    original_occurrence_timestamp: Date;
    device_clock_timestamp: Date;
    reference_data_versions: any;
    transaction_data: any;
  }): Promise<string> {
    const transactionUuid = crypto.randomUUID();
    const checksum = this.calculateChecksum(
      transactionUuid,
      transactionData.device_id,
      transactionData.local_sequence_number,
      transactionData.transaction_data,
    );
    const encryptedData = this.encrypt(transactionData.transaction_data);
    const signature = this.sign(
      transactionUuid,
      transactionData.device_id,
      transactionData.local_sequence_number,
    );

    const result = await query(
      `INSERT INTO offline_transaction_queue (
        transaction_uuid, device_id, store_id, transaction_type,
        local_sequence_number, original_occurrence_timestamp, device_clock_timestamp,
        reference_data_versions, transaction_data, checksum, signature
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id`,
      [
        transactionUuid,
        transactionData.device_id,
        transactionData.store_id,
        transactionData.transaction_type,
        transactionData.local_sequence_number,
        transactionData.original_occurrence_timestamp,
        transactionData.device_clock_timestamp,
        JSON.stringify(transactionData.reference_data_versions),
        JSON.stringify(encryptedData),
        checksum,
        signature,
      ],
    );

    return result.rows[0].id;
  }

  /**
   * Get pending transactions for device
   */
  async getPendingTransactions(
    deviceId: string,
    limit: number = 100,
  ): Promise<OfflineTransaction[]> {
    const result = await query(
      `SELECT * FROM offline_transaction_queue
       WHERE device_id = $1 AND sync_status IN ('PENDING', 'UPLOADING')
       ORDER BY local_sequence_number ASC
       LIMIT $2`,
      [deviceId, limit],
    );

    return result.rows.map((row) => ({
      ...row,
      transaction_data: this.decrypt(row.transaction_data),
    }));
  }

  /**
   * Create sync batch
   */
  async createSyncBatch(
    deviceId: string,
    transactionIds: string[],
  ): Promise<string> {
    const batchId = crypto.randomUUID();
    const device = await this.getDevice(deviceId);
    if (!device) {
      throw new Error("Device not found");
    }

    // Get transactions for this batch
    const transactions = await query(
      `SELECT * FROM offline_transaction_queue
       WHERE id = ANY($1)
       ORDER BY local_sequence_number`,
      [transactionIds],
    );

    if (transactions.rows.length === 0) {
      throw new Error("No transactions to batch");
    }

    const firstSeq = transactions.rows[0].local_sequence_number;
    const lastSeq =
      transactions.rows[transactions.rows.length - 1].local_sequence_number;
    const batchChecksum = this.calculateBatchChecksum(transactions.rows);

    // Create batch log
    await query(
      `INSERT INTO sync_batch_log (
        batch_id, device_id, store_id, transaction_count,
        first_sequence_number, last_sequence_number, batch_checksum
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        batchId,
        deviceId,
        device.store_id,
        transactions.rows.length,
        firstSeq,
        lastSeq,
        batchChecksum,
      ],
    );

    // Mark transactions as uploading
    await query(
      `UPDATE offline_transaction_queue
       SET sync_status = 'UPLOADING', sync_attempts = sync_attempts + 1, last_sync_attempt = NOW()
       WHERE id = ANY($1)`,
      [transactionIds],
    );

    return batchId;
  }

  /**
   * Process sync batch
   */
  async processSyncBatch(
    batchId: string,
  ): Promise<{ success: number; failed: number; conflicts: number }> {
    // Get batch details
    const batchResult = await query(
      `SELECT * FROM sync_batch_log WHERE batch_id = $1`,
      [batchId],
    );

    if (batchResult.rows.length === 0) {
      throw new Error("Batch not found");
    }

    const batch = batchResult.rows[0];

    // Get transactions in batch
    const transactions = await query(
      `SELECT * FROM offline_transaction_queue
       WHERE device_id = $1 AND sync_status = 'UPLOADING'
         AND local_sequence_number BETWEEN $2 AND $3
       ORDER BY local_sequence_number`,
      [
        batch.device_id,
        batch.first_sequence_number,
        batch.last_sequence_number,
      ],
    );

    let success = 0;
    let failed = 0;
    let conflicts = 0;

    for (const transaction of transactions.rows) {
      try {
        // Check for conflicts
        const conflict = await this.detectConflict(transaction);
        if (conflict) {
          await this.markConflict(transaction.id, conflict.type);
          conflicts++;
          continue;
        }

        // Process transaction based on type
        const serverId = await this.processTransaction(transaction);

        // Mark as uploaded and acknowledged
        await query(
          `UPDATE offline_transaction_queue
           SET sync_status = 'ACKNOWLEDGED',
               server_transaction_id = $1,
               server_acknowledged_at = NOW()
           WHERE id = $2`,
          [serverId, transaction.id],
        );

        success++;
      } catch (error) {
        await query(
          `UPDATE offline_transaction_queue
           SET sync_status = 'REJECTED',
               sync_error_message = $1,
               sync_attempts = sync_attempts + 1
           WHERE id = $2`,
          [
            error instanceof Error ? error.message : "Unknown error",
            transaction.id,
          ],
        );
        failed++;
      }
    }

    // Update batch status
    const uploadStatus = failed === 0 ? "COMPLETED" : "PARTIAL";
    await query(
      `UPDATE sync_batch_log
       SET upload_status = $1,
           upload_completed_at = NOW(),
           error_message = CASE WHEN $2 > 0 THEN 'Some transactions failed' ELSE NULL END
       WHERE batch_id = $3`,
      [uploadStatus, failed, batchId],
    );

    return { success, failed, conflicts };
  }

  /**
   * Detect conflict for transaction
   */
  private async detectConflict(
    transaction: any,
  ): Promise<{ type: string } | null> {
    // Check for duplicate UUID
    const duplicateCheck = await query(
      `SELECT id FROM offline_transaction_queue
       WHERE transaction_uuid = $1 AND id != $2`,
      [transaction.transaction_uuid, transaction.id],
    );

    if (duplicateCheck.rows.length > 0) {
      return { type: "DUPLICATE_UUID" };
    }

    // Check for sequence gaps
    const gapCheck = await query(`SELECT detect_sequence_gaps($1)`, [
      transaction.device_id,
    ]);

    if (gapCheck.rows.length > 0) {
      return { type: "SEQUENCE_GAP" };
    }

    // Check clock drift
    const driftCheck = await this.checkClockDrift(
      transaction.device_id,
      transaction.device_clock_timestamp,
    );
    if (driftCheck.is_excessive) {
      return { type: "CLOCK_DRIFT" };
    }

    return null;
  }

  /**
   * Mark transaction as conflicted
   */
  private async markConflict(
    transactionId: string,
    conflictType: string,
  ): Promise<void> {
    await query(
      `UPDATE offline_transaction_queue
       SET conflict_detected = TRUE,
           conflict_type = $1,
           sync_status = 'REJECTED'
       WHERE id = $2`,
      [conflictType, transactionId],
    );
  }

  /**
   * Process transaction based on type
   */
  private async processTransaction(transaction: any): Promise<string> {
    const decryptedData = this.decrypt(transaction.transaction_data);

    switch (transaction.transaction_type) {
      case "SALE":
        return await this.processSale(decryptedData);
      case "RETURN":
        return await this.processReturn(decryptedData);
      case "PAYMENT":
        return await this.processPayment(decryptedData);
      case "CUSTOMER":
        return await this.processCustomer(decryptedData);
      default:
        throw new Error(
          `Unknown transaction type: ${transaction.transaction_type}`,
        );
    }
  }

  /**
   * Process sale transaction
   */
  private async processSale(data: any): Promise<string> {
    // Check idempotency
    if (data.idempotency_key) {
      const existing = await query(
        "SELECT id FROM sales WHERE idempotency_key = $1",
        [data.idempotency_key],
      );
      if (existing.rows.length > 0) {
        return existing.rows[0].id;
      }
    }

    // Create sale
    const result = await query(
      `INSERT INTO sales (
        id, store_id, customer_id, total_amount, discount_amount,
        points_earned, points_redeemed, sale_status, sale_timestamp,
        idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id`,
      [
        data.id || crypto.randomUUID(),
        data.store_id,
        data.customer_id || null,
        data.total_amount,
        data.discount_amount || 0,
        data.points_earned || 0,
        data.points_redeemed || 0,
        "COMPLETED",
        data.sale_timestamp,
        data.idempotency_key || null,
      ],
    );

    return result.rows[0].id;
  }

  /**
   * Process return transaction
   */
  private async processReturn(data: any): Promise<string> {
    const result = await query(
      `INSERT INTO returns (
        id, store_id, sale_id, customer_id, total_amount,
        points_reversed, redemption_reversed, return_status, return_timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [
        data.id || crypto.randomUUID(),
        data.store_id,
        data.sale_id,
        data.customer_id || null,
        data.total_amount,
        data.points_reversed || 0,
        data.redemption_reversed || 0,
        "PROCESSED",
        data.return_timestamp,
      ],
    );

    return result.rows[0].id;
  }

  /**
   * Process payment transaction
   */
  private async processPayment(data: any): Promise<string> {
    const result = await query(
      `INSERT INTO payments (
        payment_number, payment_type, amount, currency,
        tender_type, reference_number, payment_timestamp, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        data.payment_number || crypto.randomUUID(),
        data.payment_type || "RECEIPT",
        data.amount,
        data.currency || "NPR",
        data.tender_type,
        data.reference_number || null,
        data.payment_timestamp,
        "MATCHED",
      ],
    );

    return result.rows[0].id;
  }

  /**
   * Process customer transaction
   */
  private async processCustomer(data: any): Promise<string> {
    // Check if customer exists by phone
    const existing = await query(
      "SELECT id FROM customers WHERE phone_hash = $1",
      [this.hashPhone(data.phone)],
    );

    if (existing.rows.length > 0) {
      return existing.rows[0].id;
    }

    // Create customer
    const result = await query(
      `INSERT INTO customers (
        id, phone, phone_hash, phone_masked, name, email,
        language, home_store_id, status, enrolled_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id`,
      [
        crypto.randomUUID(),
        data.phone,
        this.hashPhone(data.phone),
        this.maskPhone(data.phone),
        data.name || null,
        data.email || null,
        data.language || "ne",
        data.home_store_id || null,
        "ACTIVE",
        data.enrolled_at || new Date(),
      ],
    );

    return result.rows[0].id;
  }

  /**
   * Check clock drift for device
   */
  private async checkClockDrift(
    deviceId: string,
    deviceTimestamp: Date,
  ): Promise<{ drift_seconds: number; is_excessive: boolean }> {
    const serverTimestamp = new Date();
    const driftSeconds = Math.floor(
      (deviceTimestamp.getTime() - serverTimestamp.getTime()) / 1000,
    );

    // Log drift
    await query(
      `INSERT INTO clock_drift_log (device_id, device_timestamp, server_timestamp, drift_seconds)
       VALUES ($1, $2, $3, $4)`,
      [deviceId, deviceTimestamp, serverTimestamp, driftSeconds],
    );

    return {
      drift_seconds: driftSeconds,
      is_excessive: Math.abs(driftSeconds) > 300, // 5 minutes threshold
    };
  }

  /**
   * Get device sync status
   */
  async getDeviceSyncStatus(deviceId: string): Promise<any> {
    const result = await query("SELECT get_device_sync_status($1) as status", [
      deviceId,
    ]);
    return result.rows[0].status;
  }

  /**
   * Retry failed transactions
   */
  async retryFailedTransactions(deviceId: string): Promise<number> {
    const result = await query(
      `UPDATE offline_transaction_queue
       SET sync_status = 'PENDING',
           sync_attempts = 0,
           sync_error_message = NULL
       WHERE device_id = $1
         AND sync_status = 'REJECTED'
         AND sync_attempts < max_sync_attempts
       RETURNING id`,
      [deviceId],
    );

    return result.rowCount || 0;
  }

  /**
   * Resolve conflict
   */
  async resolveConflict(
    transactionId: string,
    resolution: string,
    resolvedBy: string,
    notes?: string,
  ): Promise<void> {
    await query(
      `UPDATE offline_transaction_queue
       SET conflict_resolution = $1,
           resolved_by = $2,
           resolved_at = NOW(),
           resolution_notes = $3,
           sync_status = CASE WHEN $1 = 'IGNORE' THEN 'ACKNOWLEDGED' ELSE 'PENDING' END
       WHERE id = $4`,
      [resolution, resolvedBy, notes || null, transactionId],
    );
  }

  /**
   * Encrypt data
   */
  private encrypt(data: any): string {
    const algorithm = "aes-256-gcm";
    const key = crypto.scryptSync(this.ENCRYPTION_KEY, "salt", 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return JSON.stringify({
      iv: iv.toString("hex"),
      encrypted,
      authTag: authTag.toString("hex"),
    });
  }

  /**
   * Decrypt data
   */
  private decrypt(encryptedData: string): any {
    const data = JSON.parse(encryptedData);
    const algorithm = "aes-256-gcm";
    const key = crypto.scryptSync(this.ENCRYPTION_KEY, "salt", 32);
    const iv = Buffer.from(data.iv, "hex");
    const authTag = Buffer.from(data.authTag, "hex");

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(data.encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return JSON.parse(decrypted);
  }

  /**
   * Sign data
   */
  private sign(
    transactionUuid: string,
    deviceId: string,
    sequenceNumber: bigint,
  ): string {
    const data = `${transactionUuid}:${deviceId}:${sequenceNumber}`;
    return crypto
      .createHmac("sha256", this.SIGNATURE_SECRET)
      .update(data)
      .digest("hex");
  }

  /**
   * Calculate checksum
   */
  private calculateChecksum(
    transactionUuid: string,
    deviceId: string,
    sequenceNumber: bigint,
    data: any,
  ): string {
    const dataString = `${transactionUuid}:${deviceId}:${sequenceNumber}:${JSON.stringify(data)}`;
    return crypto.createHash("sha256").update(dataString).digest("hex");
  }

  /**
   * Calculate batch checksum
   */
  private calculateBatchChecksum(transactions: any[]): string {
    const dataString = transactions
      .sort(
        (a, b) =>
          Number(a.local_sequence_number) - Number(b.local_sequence_number),
      )
      .map(
        (t) => `${t.transaction_uuid}:${t.local_sequence_number}:${t.checksum}`,
      )
      .join("|");

    return crypto.createHash("sha256").update(dataString).digest("hex");
  }

  /**
   * Hash phone number
   */
  private hashPhone(phone: string): string {
    return crypto.createHash("sha256").update(phone).digest("hex");
  }

  /**
   * Mask phone number
   */
  private maskPhone(phone: string): string {
    if (phone.length >= 10) {
      return phone.substring(0, 2) + "XXXXXX" + phone.substring(8);
    }
    return "XXXXXX";
  }
}
