import { query } from "../database/connection.js";

interface DeliveryAssignment {
  id: string;
  assignment_id: string;
  order_id: string;
  delivery_person_id: string;
  delivery_person_name: string;
  delivery_person_phone: string;
  status: string;
  assigned_at: Date;
  picked_up_at: Date;
  in_transit_at: Date;
  delivered_at: Date;
  failed_at: Date;
  cancelled_at: Date;
  delivery_notes: string;
  proof_of_delivery_url: string;
  customer_signature_url: string;
  created_by: string;
  metadata: any;
}

interface DeliveryTrackingEvent {
  id: string;
  delivery_assignment_id: string;
  event_type: string;
  status: string;
  location_lat: number;
  location_lng: number;
  notes: string;
  created_at: Date;
  created_by: string;
  metadata: any;
}

export class DeliveryService {
  /**
   * Create delivery assignment
   */
  async createDeliveryAssignment(assignmentData: {
    order_id: string;
    delivery_person_id?: string;
    delivery_person_name?: string;
    delivery_person_phone?: string;
    created_by?: string;
    metadata?: any;
  }): Promise<DeliveryAssignment> {
    const assignmentId = this.generateAssignmentId();

    const result = await query(
      `INSERT INTO delivery_assignments (
        assignment_id, order_id, delivery_person_id, delivery_person_name,
        delivery_person_phone, status, created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, 'ASSIGNED', $6, $7)
      RETURNING *`,
      [
        assignmentId,
        assignmentData.order_id,
        assignmentData.delivery_person_id || null,
        assignmentData.delivery_person_name || null,
        assignmentData.delivery_person_phone || null,
        assignmentData.created_by || null,
        JSON.stringify(assignmentData.metadata || {}),
      ],
    );

    // Log initial tracking event
    await this.logTrackingEvent({
      delivery_assignment_id: result.rows[0].id,
      event_type: "ASSIGNED",
      status: "ASSIGNED",
      notes: "Delivery assigned",
      created_by: assignmentData.created_by,
    });

    return result.rows[0];
  }

  /**
   * Get delivery assignment by ID
   */
  async getDeliveryAssignment(
    assignmentId: string,
  ): Promise<DeliveryAssignment | null> {
    const result = await query(
      "SELECT * FROM delivery_assignments WHERE assignment_id = $1",
      [assignmentId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get delivery assignment by order ID
   */
  async getDeliveryAssignmentByOrder(
    orderId: string,
  ): Promise<DeliveryAssignment | null> {
    const result = await query(
      "SELECT * FROM delivery_assignments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1",
      [orderId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Update delivery status
   */
  async updateDeliveryStatus(
    assignmentId: string,
    status: string,
    options: {
      location_lat?: number;
      location_lng?: number;
      notes?: string;
      proof_of_delivery_url?: string;
      customer_signature_url?: string;
      created_by?: string;
    } = {},
  ): Promise<DeliveryAssignment> {
    const validTransitions: Record<string, string[]> = {
      ASSIGNED: ["PICKED_UP", "CANCELLED", "FAILED"],
      PICKED_UP: ["IN_TRANSIT", "CANCELLED", "FAILED"],
      IN_TRANSIT: ["DELIVERED", "FAILED", "CANCELLED"],
      DELIVERED: [],
      FAILED: [],
      CANCELLED: [],
    };

    const assignment = await this.getDeliveryAssignment(assignmentId);
    if (!assignment) {
      throw new Error("Delivery assignment not found");
    }

    if (!validTransitions[assignment.status]?.includes(status)) {
      throw new Error(
        `Invalid transition from ${assignment.status} to ${status}`,
      );
    }

    const updates: string[] = ["status = $1"];
    const values: any[] = [status];
    let paramIndex = 2;

    if (status === "PICKED_UP") {
      updates.push("picked_up_at = NOW()");
    } else if (status === "IN_TRANSIT") {
      updates.push("in_transit_at = NOW()");
    } else if (status === "DELIVERED") {
      updates.push("delivered_at = NOW()");
    } else if (status === "FAILED") {
      updates.push("failed_at = NOW()");
    } else if (status === "CANCELLED") {
      updates.push("cancelled_at = NOW()");
    }

    if (options.proof_of_delivery_url) {
      updates.push(`proof_of_delivery_url = $${paramIndex}`);
      values.push(options.proof_of_delivery_url);
      paramIndex++;
    }

    if (options.customer_signature_url) {
      updates.push(`customer_signature_url = $${paramIndex}`);
      values.push(options.customer_signature_url);
      paramIndex++;
    }

    if (options.notes) {
      updates.push(`delivery_notes = $${paramIndex}`);
      values.push(options.notes);
      paramIndex++;
    }

    values.push(assignmentId);

    const result = await query(
      `UPDATE delivery_assignments SET ${updates.join(", ")} WHERE assignment_id = $${paramIndex} RETURNING *`,
      values,
    );

    // Log tracking event
    await this.logTrackingEvent({
      delivery_assignment_id: result.rows[0].id,
      event_type: status,
      status: status,
      location_lat: options.location_lat,
      location_lng: options.location_lng,
      notes: options.notes,
      created_by: options.created_by,
    });

    return result.rows[0];
  }

  /**
   * Get delivery tracking events
   */
  async getDeliveryTrackingEvents(
    assignmentId: string,
  ): Promise<DeliveryTrackingEvent[]> {
    const result = await query(
      `SELECT * FROM delivery_tracking_events 
       WHERE delivery_assignment_id = (SELECT id FROM delivery_assignments WHERE assignment_id = $1)
       ORDER BY created_at ASC`,
      [assignmentId],
    );
    return result.rows;
  }

  /**
   * Log tracking event
   */
  async logTrackingEvent(eventData: {
    delivery_assignment_id: string;
    event_type: string;
    status: string;
    location_lat?: number;
    location_lng?: number;
    notes?: string;
    created_by?: string;
    metadata?: any;
  }): Promise<DeliveryTrackingEvent> {
    const result = await query(
      `INSERT INTO delivery_tracking_events (
        delivery_assignment_id, event_type, status, location_lat, location_lng,
        notes, created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        eventData.delivery_assignment_id,
        eventData.event_type,
        eventData.status,
        eventData.location_lat || null,
        eventData.location_lng || null,
        eventData.notes || null,
        eventData.created_by || null,
        JSON.stringify(eventData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get active deliveries for delivery person
   */
  async getActiveDeliveriesForPerson(
    deliveryPersonId: string,
  ): Promise<DeliveryAssignment[]> {
    const result = await query(
      `SELECT * FROM delivery_assignments 
       WHERE delivery_person_id = $1 AND status IN ('ASSIGNED', 'PICKED_UP', 'IN_TRANSIT')
       ORDER BY created_at ASC`,
      [deliveryPersonId],
    );
    return result.rows;
  }

  /**
   * Get delivery statistics
   */
  async getDeliveryStatistics(
    filters: {
      delivery_person_id?: string;
      start_date?: Date;
      end_date?: Date;
    } = {},
  ): Promise<any> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (filters.delivery_person_id) {
      conditions.push("delivery_person_id = $1");
      values.push(filters.delivery_person_id);
    }

    if (filters.start_date) {
      conditions.push(`created_at >= $${values.length + 1}`);
      values.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`created_at <= $${values.length + 1}`);
      values.push(filters.end_date);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT 
        COUNT(*) as total_deliveries,
        COUNT(CASE WHEN status = 'DELIVERED' THEN 1 END) as delivered,
        COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled,
        AVG(EXTRACT(EPOCH FROM (delivered_at - assigned_at))/60) as avg_delivery_time_minutes
       FROM delivery_assignments
       ${whereClause}`,
      values,
    );

    return result.rows[0];
  }

  /**
   * Cancel delivery
   */
  async cancelDelivery(
    assignmentId: string,
    reason?: string,
    cancelledBy?: string,
  ): Promise<DeliveryAssignment> {
    return await this.updateDeliveryStatus(assignmentId, "CANCELLED", {
      notes: reason,
      created_by: cancelledBy,
    });
  }

  /**
   * Mark delivery as failed
   */
  async markDeliveryFailed(
    assignmentId: string,
    reason?: string,
    failedBy?: string,
  ): Promise<DeliveryAssignment> {
    return await this.updateDeliveryStatus(assignmentId, "FAILED", {
      notes: reason,
      created_by: failedBy,
    });
  }

  /**
   * Generate assignment ID
   */
  private generateAssignmentId(): string {
    return `DEL-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

// Export singleton instance
export const deliveryService = new DeliveryService();
