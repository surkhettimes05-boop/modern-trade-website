import { query } from "../database/connection.js";
import { POSService } from "./posService.js";

const posService = new POSService();

interface QueueEntry {
  id: string;
  customer_id?: string;
  store_id?: string;
  sale_data: any;
  points_calculated: number;
  queue_status: string;
  device_id?: string;
  local_sale_id?: string;
  uploaded_at?: Date;
  server_sale_id?: string;
  rejection_reason?: string;
  retry_count: number;
  created_at: Date;
  updated_at: Date;
}

interface CreateQueueEntryInput {
  customer_id?: string;
  store_id?: string;
  sale_data: any;
  points_calculated: number;
  device_id?: string;
  local_sale_id?: string;
}

export class OfflineQueueService {
  /**
   * Add an entry to the offline queue
   */
  async addEntry(input: CreateQueueEntryInput): Promise<QueueEntry> {
    const result = await query(
      `INSERT INTO offline_earn_queue (
        customer_id, store_id, sale_data, points_calculated, device_id, local_sale_id, queue_status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
      RETURNING *`,
      [
        input.customer_id || null,
        input.store_id || null,
        JSON.stringify(input.sale_data),
        input.points_calculated,
        input.device_id || null,
        input.local_sale_id || null,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get pending entries for a device
   */
  async getPendingEntries(deviceId?: string): Promise<QueueEntry[]> {
    let queryStr = `
      SELECT * FROM offline_earn_queue 
      WHERE queue_status = 'PENDING' AND retry_count < 5
    `;
    const params: any[] = [];

    if (deviceId) {
      queryStr += " AND device_id = $1";
      params.push(deviceId);
    }

    queryStr += " ORDER BY created_at ASC";

    const result = await query(queryStr, params);
    return result.rows;
  }

  /**
   * Sync a single offline entry to the server
   */
  async syncEntry(entryId: string): Promise<{
    success: boolean;
    queue_entry_id: string;
    server_sale_id?: string;
    error?: string;
  }> {
    try {
      // Get the queue entry
      const entryResult = await query(
        "SELECT * FROM offline_earn_queue WHERE id = $1",
        [entryId],
      );

      if (entryResult.rows.length === 0) {
        throw new Error("Queue entry not found");
      }

      const entry = entryResult.rows[0];

      if (entry.queue_status !== "PENDING") {
        return {
          success: false,
          queue_entry_id: entryId,
          error: "Entry not in PENDING status",
        };
      }

      // Create the sale on the server
      const saleData = entry.sale_data;
      const saleResult = await posService.createSale({
        sale_number: saleData.sale_number || `OFFLINE_${entry.id}`,
        customer_id: entry.customer_id,
        store_id: entry.store_id,
        total_amount: saleData.total_amount,
        currency: saleData.currency,
        payment_method: saleData.payment_method,
        items: saleData.items || [],
        created_by: saleData.created_by || "OFFLINE_SYNC",
        idempotency_key: `offline_${entry.id}`,
      });

      if (!saleResult.success) {
        // Increment retry count
        await query(
          `UPDATE offline_earn_queue SET retry_count = retry_count + 1 WHERE id = $1`,
          [entryId],
        );

        return {
          success: false,
          queue_entry_id: entryId,
          error: saleResult.error || "Failed to create sale",
        };
      }

      const saleId = saleResult.sale_id;

      // Update sale status to COMPLETED
      await posService.updateSaleStatus(saleId, "COMPLETED", "OFFLINE_SYNC");

      // Post earn points if customer exists
      if (entry.customer_id && entry.points_calculated > 0) {
        try {
          await posService.postEarnPoints(saleId, "OFFLINE_SYNC");
        } catch (error) {
          // Log error but don't fail the sync
          console.error("Failed to post earn points for offline sale:", error);
        }
      }

      // Update queue entry as UPLOADED
      await query(
        `UPDATE offline_earn_queue 
         SET queue_status = 'UPLOADED', uploaded_at = CURRENT_TIMESTAMP, server_sale_id = $1 
         WHERE id = $2`,
        [saleId, entryId],
      );

      return {
        success: true,
        queue_entry_id: entryId,
        server_sale_id: saleId,
      };
    } catch (error) {
      // Increment retry count on error
      await query(
        `UPDATE offline_earn_queue SET retry_count = retry_count + 1 WHERE id = $1`,
        [entryId],
      );

      return {
        success: false,
        queue_entry_id: entryId,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Sync all pending entries for a device
   */
  async syncDevice(deviceId: string): Promise<{
    total: number;
    synced: number;
    failed: number;
    results: any[];
  }> {
    const pendingEntries = await this.getPendingEntries(deviceId);
    const results: any[] = [];
    let synced = 0;
    let failed = 0;

    for (const entry of pendingEntries) {
      const result = await this.syncEntry(entry.id);
      results.push(result);

      if (result.success) {
        synced++;
      } else {
        failed++;
      }
    }

    return {
      total: pendingEntries.length,
      synced,
      failed,
      results,
    };
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(deviceId?: string): Promise<any> {
    let queryStr = `
      SELECT 
        queue_status,
        COUNT(*) as count,
        SUM(points_calculated) as total_points
      FROM offline_earn_queue
    `;
    const params: any[] = [];

    if (deviceId) {
      queryStr += " WHERE device_id = $1";
      params.push(deviceId);
    }

    queryStr += " GROUP BY queue_status";

    const result = await query(queryStr, params);
    return result.rows;
  }

  /**
   * Mark failed entries as REJECTED after max retries
   */
  async markFailedEntries(): Promise<number> {
    const result = await query(
      `UPDATE offline_earn_queue 
       SET queue_status = 'FAILED', rejection_reason = 'Max retries exceeded'
       WHERE queue_status = 'PENDING' AND retry_count >= 5
       RETURNING id`,
    );

    return result.rows.length;
  }

  /**
   * Clean up old uploaded entries
   */
  async cleanupOldUploadedEntries(daysOld = 30): Promise<number> {
    const result = await query(
      `DELETE FROM offline_earn_queue 
       WHERE queue_status = 'UPLOADED' 
         AND uploaded_at < CURRENT_TIMESTAMP - INTERVAL '${daysOld} days'
       RETURNING id`,
    );

    return result.rows.length;
  }

  /**
   * Get entry by local sale ID
   */
  async getByLocalSaleId(
    localSaleId: string,
    deviceId: string,
  ): Promise<QueueEntry | null> {
    const result = await query(
      "SELECT * FROM offline_earn_queue WHERE local_sale_id = $1 AND device_id = $2",
      [localSaleId, deviceId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Delete entry from queue
   */
  async deleteEntry(entryId: string): Promise<boolean> {
    const result = await query(
      "DELETE FROM offline_earn_queue WHERE id = $1 RETURNING id",
      [entryId],
    );
    return result.rows.length > 0;
  }
}
