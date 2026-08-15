import { query } from "../database/connection.js";

interface Event {
  id: string;
  event_type: string;
  event_data: any;
  source_system: string;
  priority: number;
  status: string;
  processing_attempts: number;
  max_retries: number;
  error_message: string;
  created_at: Date;
  processing_started_at: Date;
  processed_at: Date;
  next_retry_at: Date;
}

interface ProcessResult {
  success: boolean;
  event_id: string;
  error?: string;
}

export class AnalyticsPipelineService {
  /**
   * Add event to queue
   */
  async addEvent(
    eventType: string,
    eventData: any,
    sourceSystem?: string,
    priority?: number,
  ): Promise<string> {
    const result = await query(
      `INSERT INTO event_queue (event_type, event_data, source_system, priority, status)
       VALUES ($1, $2, $3, $4, 'PENDING')
       RETURNING id`,
      [
        eventType,
        JSON.stringify(eventData),
        sourceSystem || "SYSTEM",
        priority || 5,
      ],
    );
    return result.rows[0].id;
  }

  /**
   * Process next pending event
   */
  async processNextEvent(): Promise<ProcessResult> {
    // Get next pending event (ordered by priority, then created_at)
    const result = await query(
      `SELECT * FROM event_queue 
       WHERE status = 'PENDING' 
         OR (status = 'RETRY' AND next_retry_at <= NOW())
       ORDER BY priority ASC, created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
    );

    if (result.rows.length === 0) {
      return { success: false, event_id: "", error: "No pending events" };
    }

    const event = result.rows[0];

    // Mark as processing
    await query(
      `UPDATE event_queue 
       SET status = 'PROCESSING', 
           processing_started_at = NOW(),
           processing_attempts = processing_attempts + 1
       WHERE id = $1`,
      [event.id],
    );

    try {
      // Process event based on type
      await this.processEventByType(event);

      // Mark as processed
      await query(
        `UPDATE event_queue 
         SET status = 'PROCESSED', 
             processed_at = NOW()
         WHERE id = $1`,
        [event.id],
      );

      return { success: true, event_id: event.id };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Check if should retry
      if (event.processing_attempts < event.max_retries) {
        const retryDelay = Math.pow(2, event.processing_attempts) * 60 * 1000; // Exponential backoff
        const nextRetryAt = new Date(Date.now() + retryDelay);

        await query(
          `UPDATE event_queue 
           SET status = 'RETRY', 
               error_message = $1,
               next_retry_at = $2
           WHERE id = $3`,
          [errorMessage, nextRetryAt, event.id],
        );
      } else {
        // Mark as failed
        await query(
          `UPDATE event_queue 
           SET status = 'FAILED', 
               error_message = $1,
               processed_at = NOW()
           WHERE id = $2`,
          [errorMessage, event.id],
        );
      }

      return { success: false, event_id: event.id, error: errorMessage };
    }
  }

  /**
   * Process event based on type
   */
  private async processEventByType(event: Event): Promise<void> {
    switch (event.event_type) {
      case "SALE_CREATED":
        await this.processSaleCreated(event.event_data);
        break;
      case "SALE_COMPLETED":
        await this.processSaleCompleted(event.event_data);
        break;
      case "SALE_VOIDED":
        await this.processSaleVoided(event.event_data);
        break;
      case "RETURN_PROCESSED":
        await this.processReturnProcessed(event.event_data);
        break;
      case "CUSTOMER_ENROLLED":
        await this.processCustomerEnrolled(event.event_data);
        break;
      case "LOYALTY_EARNED":
        await this.processLoyaltyEarned(event.event_data);
        break;
      case "LOYALTY_REDEEMED":
        await this.processLoyaltyRedeemed(event.event_data);
        break;
      case "INVENTORY_TRANSACTION":
        await this.processInventoryTransaction(event.event_data);
        break;
      case "REFRESH_PROJECTIONS":
        await this.refreshProjections();
        break;
      default:
        throw new Error(`Unknown event type: ${event.event_type}`);
    }
  }

  /**
   * Process sale created event
   */
  private async processSaleCreated(_eventData: any): Promise<void> {
    // Idempotency check using idempotency key
    if (_eventData.idempotency_key) {
      const existing = await query(
        "SELECT id FROM sales WHERE idempotency_key = $1",
        [_eventData.idempotency_key],
      );
      if (existing.rows.length > 0) {
        return; // Already processed
      }
    }

    // Sale creation is handled by POS service
    // This event is for analytics triggers
  }

  /**
   * Process sale completed event
   */
  private async processSaleCompleted(eventData: any): Promise<void> {
    // Trigger projection refresh for the affected date
    const saleDate = eventData.sale_timestamp || new Date();
    await this.refreshProjectionsForDate(saleDate);
  }

  /**
   * Process sale voided event
   */
  private async processSaleVoided(eventData: any): Promise<void> {
    // Trigger projection refresh for the affected date
    const voidDate = eventData.voided_at || new Date();
    await this.refreshProjectionsForDate(voidDate);
  }

  /**
   * Process return processed event
   */
  private async processReturnProcessed(eventData: any): Promise<void> {
    // Trigger projection refresh for the affected date
    const returnDate = eventData.return_timestamp || new Date();
    await this.refreshProjectionsForDate(returnDate);
  }

  /**
   * Process customer enrolled event
   */
  private async processCustomerEnrolled(eventData: any): Promise<void> {
    // Trigger projection refresh for the affected date
    const enrollDate = eventData.enrolled_at || new Date();
    await this.refreshProjectionsForDate(enrollDate);
  }

  /**
   * Process loyalty earned event
   */
  private async processLoyaltyEarned(eventData: any): Promise<void> {
    // Trigger projection refresh for the affected date
    const effectiveDate = eventData.effective_timestamp || new Date();
    await this.refreshProjectionsForDate(effectiveDate);
  }

  /**
   * Process loyalty redeemed event
   */
  private async processLoyaltyRedeemed(eventData: any): Promise<void> {
    // Trigger projection refresh for the affected date
    const effectiveDate = eventData.effective_timestamp || new Date();
    await this.refreshProjectionsForDate(effectiveDate);
  }

  /**
   * Process inventory transaction event
   */
  private async processInventoryTransaction(eventData: any): Promise<void> {
    if (
      !eventData.store_id ||
      !eventData.product_id ||
      !eventData.quantity ||
      !eventData.transaction_type
    ) {
      throw new Error(
        "INVENTORY_TRANSACTION requires store_id, product_id, quantity, and transaction_type",
      );
    }

    // Inventory events are source-of-truth references. The event processor never
    // mutates stock; it refreshes the inventory projection and records freshness.
    await query("SELECT refresh_inventory_projection($1, $2)", [
      eventData.store_id,
      eventData.business_date || eventData.transaction_timestamp || new Date(),
    ]);
  }

  /**
   * Refresh all materialized views
   */
  async refreshProjections(): Promise<void> {
    await query("SELECT refresh_analytics_projections()");
  }

  /**
   * Refresh projections for a specific date
   */
  private async refreshProjectionsForDate(date: Date): Promise<void> {
    await query("SELECT refresh_sales_projection($1)", [date]);
  }

  /**
   * Process batch of events
   */
  async processBatch(
    batchSize: number = 10,
  ): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    for (let i = 0; i < batchSize; i++) {
      const result = await this.processNextEvent();
      if (result.success) {
        processed++;
      } else if (result.event_id) {
        failed++;
      } else {
        // No more events
        break;
      }
    }

    return { processed, failed };
  }

  /**
   * Get queue statistics
   */
  async getQueueStatistics(): Promise<any> {
    const result = await query(
      `SELECT 
        status,
        COUNT(*) as count
      FROM event_queue
      GROUP BY status
      ORDER BY status`,
    );

    return result.rows;
  }

  /**
   * Replay failed events
   */
  async replayFailedEvents(
    eventIds: string[],
  ): Promise<{ replayed: number; failed: number }> {
    let replayed = 0;
    let failed = 0;

    for (const eventId of eventIds) {
      try {
        await query(
          `UPDATE event_queue 
           SET status = 'PENDING', 
               processing_attempts = 0,
               error_message = NULL,
               next_retry_at = NULL
           WHERE id = $1 AND status = 'FAILED'`,
          [eventId],
        );
        replayed++;
      } catch {
        failed++;
      }
    }

    return { replayed, failed };
  }

  /**
   * Clean up old processed events
   */
  async cleanupOldEvents(daysOld: number = 30): Promise<number> {
    const result = await query(
      `DELETE FROM event_queue 
       WHERE status = 'PROCESSED' 
         AND processed_at < NOW() - INTERVAL '${daysOld} days'
       RETURNING id`,
    );
    return result.rowCount || 0;
  }

  /**
   * Get stuck events (processing too long)
   */
  async getStuckEvents(timeoutMinutes: number = 30): Promise<Event[]> {
    const result = await query(
      `SELECT * FROM event_queue 
       WHERE status = 'PROCESSING' 
         AND processing_started_at < NOW() - INTERVAL '${timeoutMinutes} minutes'`,
    );
    return result.rows;
  }

  /**
   * Reset stuck events to pending
   */
  async resetStuckEvents(timeoutMinutes: number = 30): Promise<number> {
    const result = await query(
      `UPDATE event_queue 
       SET status = 'PENDING',
           processing_started_at = NULL,
           processing_attempts = 0
       WHERE status = 'PROCESSING' 
         AND processing_started_at < NOW() - INTERVAL '${timeoutMinutes} minutes'
       RETURNING id`,
    );
    return result.rowCount || 0;
  }
}
