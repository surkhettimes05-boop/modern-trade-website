import { query } from "../database/connection.js";
import crypto from "crypto";

interface OfflineDataSnapshot {
  id: string;
  snapshot_id: string;
  device_id: string;
  snapshot_type: string;
  data_version: number;
  data_hash: string;
  data_size_bytes: number;
  record_count: number;
  status: string;
  created_at: Date;
  completed_at: Date;
  created_by: string;
  metadata: any;
}

interface OfflineTransaction {
  id: string;
  queue_id: string;
  device_id: string;
  transaction_type: string;
  transaction_data: any;
  status: string;
  retry_count: number;
  max_retries: number;
  created_at_device: Date;
  queued_at: Date;
  uploaded_at: Date;
  error_message: string;
  error_details: any;
  metadata: any;
}

export class OfflineDataService {
  /**
   * Create data snapshot
   */
  async createSnapshot(snapshotData: {
    device_id: string;
    snapshot_type: string;
    data_version?: number;
    record_count?: number;
    created_by?: string;
    metadata?: any;
  }): Promise<OfflineDataSnapshot> {
    const snapshotId = this.generateSnapshotId();

    const result = await query(
      `INSERT INTO offline_data_snapshots (
        snapshot_id, device_id, snapshot_type, data_version, record_count,
        created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        snapshotId,
        snapshotData.device_id,
        snapshotData.snapshot_type,
        snapshotData.data_version || 1,
        snapshotData.record_count || 0,
        snapshotData.created_by || null,
        JSON.stringify(snapshotData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Update snapshot with data
   */
  async updateSnapshotData(
    snapshotId: string,
    data: {
      data_hash: string;
      data_size_bytes: number;
      record_count: number;
      status: string;
    },
  ): Promise<OfflineDataSnapshot> {
    const result = await query(
      `UPDATE offline_data_snapshots 
       SET data_hash = $1, data_size_bytes = $2, record_count = $3, status = $4,
           completed_at = CASE WHEN $4 = 'COMPLETED' THEN NOW() ELSE NULL END
       WHERE snapshot_id = $5
       RETURNING *`,
      [
        data.data_hash,
        data.data_size_bytes,
        data.record_count,
        data.status,
        snapshotId,
      ],
    );

    if (result.rows.length === 0) {
      throw new Error("Snapshot not found");
    }

    return result.rows[0];
  }

  /**
   * Get latest snapshot for device
   */
  async getLatestSnapshot(
    deviceId: string,
    snapshotType?: string,
  ): Promise<OfflineDataSnapshot | null> {
    const conditions: string[] = ["device_id = $1"];
    const values: any[] = [deviceId];

    if (snapshotType) {
      conditions.push(`snapshot_type = $${values.length + 1}`);
      values.push(snapshotType);
    }

    const result = await query(
      `SELECT * FROM offline_data_snapshots 
       WHERE ${conditions.join(" AND ")} AND status = 'COMPLETED'
       ORDER BY created_at DESC 
       LIMIT 1`,
      values,
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Queue offline transaction
   */
  async queueTransaction(transactionData: {
    device_id: string;
    transaction_type: string;
    transaction_data: any;
    created_at_device?: Date;
    metadata?: any;
  }): Promise<OfflineTransaction> {
    const queueId = this.generateQueueId();

    const result = await query(
      `INSERT INTO offline_transactions_queue (
        queue_id, device_id, transaction_type, transaction_data, created_at_device, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        queueId,
        transactionData.device_id,
        transactionData.transaction_type,
        JSON.stringify(transactionData.transaction_data),
        transactionData.created_at_device || new Date(),
        JSON.stringify(transactionData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get pending transactions for device
   */
  async getPendingTransactions(
    deviceId: string,
  ): Promise<OfflineTransaction[]> {
    const result = await query(
      `SELECT * FROM offline_transactions_queue 
       WHERE device_id = $1 AND status = 'PENDING'
       ORDER BY queued_at ASC`,
      [deviceId],
    );
    return result.rows;
  }

  /**
   * Get all pending transactions
   */
  async getAllPendingTransactions(limit = 100): Promise<OfflineTransaction[]> {
    const result = await query(
      `SELECT * FROM offline_transactions_queue 
       WHERE status = 'PENDING'
       ORDER BY queued_at ASC
       LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  /**
   * Update transaction status
   */
  async updateTransactionStatus(
    queueId: string,
    status: string,
    additionalData?: {
      error_message?: string;
      error_details?: any;
      uploaded_at?: Date;
    },
  ): Promise<OfflineTransaction> {
    const updates: string[] = ["status = $1"];
    const values: any[] = [status];
    let paramIndex = 2;

    if (status === "UPLOADING" || status === "UPLOADED") {
      updates.push(`retry_count = retry_count + 1`);
    }

    if (additionalData?.error_message) {
      updates.push(`error_message = $${paramIndex}`);
      values.push(additionalData.error_message);
      paramIndex++;
    }

    if (additionalData?.error_details) {
      updates.push(`error_details = $${paramIndex}`);
      values.push(JSON.stringify(additionalData.error_details));
      paramIndex++;
    }

    if (additionalData?.uploaded_at) {
      updates.push(`uploaded_at = $${paramIndex}`);
      values.push(additionalData.uploaded_at);
      paramIndex++;
    }

    values.push(queueId);

    const result = await query(
      `UPDATE offline_transactions_queue SET ${updates.join(", ")} WHERE queue_id = $${paramIndex} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new Error("Transaction not found");
    }

    return result.rows[0];
  }

  /**
   * Process failed transactions for retry
   */
  async getRetryableTransactions(): Promise<OfflineTransaction[]> {
    const result = await query(
      `SELECT * FROM offline_transactions_queue 
       WHERE status = 'FAILED' AND retry_count < max_retries
       ORDER BY queued_at ASC`,
      [],
    );
    return result.rows;
  }

  /**
   * Calculate data hash
   */
  calculateDataHash(data: any): string {
    const dataString = JSON.stringify(data);
    return crypto.createHash("sha256").update(dataString).digest("hex");
  }

  /**
   * Get transaction statistics
   */
  async getTransactionStatistics(deviceId?: string): Promise<any> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (deviceId) {
      conditions.push("device_id = $1");
      values.push(deviceId);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'UPLOADING' THEN 1 END) as uploading_count,
        COUNT(CASE WHEN status = 'UPLOADED' THEN 1 END) as uploaded_count,
        COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed_count,
        COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) as rejected_count
       FROM offline_transactions_queue
       ${whereClause}`,
      values,
    );

    return result.rows[0];
  }

  /**
   * Delete old uploaded transactions
   */
  async cleanupOldUploadedTransactions(daysOld = 30): Promise<number> {
    const result = await query(
      `DELETE FROM offline_transactions_queue 
       WHERE status = 'UPLOADED' AND uploaded_at < NOW() - INTERVAL '${daysOld} days'
       RETURNING id`,
      [],
    );
    return result.rows.length;
  }

  /**
   * Generate snapshot ID
   */
  private generateSnapshotId(): string {
    return `SNP-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Generate queue ID
   */
  private generateQueueId(): string {
    return `QUE-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

export const offlineDataService = new OfflineDataService();
