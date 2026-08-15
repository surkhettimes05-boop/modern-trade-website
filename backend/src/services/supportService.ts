import { query } from "../database/connection.js";

interface SupportTicket {
  id: string;
  ticket_id: string;
  customer_id: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  assigned_to: string;
  assigned_at: Date;
  order_id: string;
  product_id: string;
  sla_due_at: Date;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date;
  closed_at: Date;
  created_by: string;
  metadata: any;
}

interface TicketMessage {
  id: string;
  message_id: string;
  ticket_id: string;
  sender_type: string;
  sender_id: string;
  message: string;
  attachments: any;
  is_internal: boolean;
  created_at: Date;
  metadata: any;
}

export class SupportService {
  /**
   * Create support ticket
   */
  async createTicket(ticketData: {
    customer_id?: string;
    subject: string;
    description: string;
    category?: string;
    priority?: string;
    order_id?: string;
    product_id?: string;
    created_by?: string;
    metadata?: any;
  }): Promise<SupportTicket> {
    const ticketId = this.generateTicketId();

    // Calculate SLA based on priority
    const slaDueAt = this.calculateSLADueAt(ticketData.priority || "NORMAL");

    const result = await query(
      `INSERT INTO support_tickets (
        ticket_id, customer_id, subject, description, category, priority,
        status, order_id, product_id, sla_due_at, created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        ticketId,
        ticketData.customer_id || null,
        ticketData.subject,
        ticketData.description,
        ticketData.category || "GENERAL",
        ticketData.priority || "NORMAL",
        ticketData.order_id || null,
        ticketData.product_id || null,
        slaDueAt,
        ticketData.created_by || null,
        JSON.stringify(ticketData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get ticket by ID
   */
  async getTicket(ticketId: string): Promise<SupportTicket | null> {
    const result = await query(
      "SELECT * FROM support_tickets WHERE ticket_id = $1",
      [ticketId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get tickets for customer
   */
  async getTicketsForCustomer(
    customerId: string,
    limit = 50,
  ): Promise<SupportTicket[]> {
    const result = await query(
      `SELECT * FROM support_tickets 
       WHERE customer_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [customerId, limit],
    );
    return result.rows;
  }

  /**
   * Get tickets by status
   */
  async getTicketsByStatus(
    status: string,
    limit = 100,
  ): Promise<SupportTicket[]> {
    const result = await query(
      `SELECT * FROM support_tickets 
       WHERE status = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [status, limit],
    );
    return result.rows;
  }

  /**
   * Get tickets assigned to staff
   */
  async getTicketsAssignedTo(
    staffId: string,
    limit = 100,
  ): Promise<SupportTicket[]> {
    const result = await query(
      `SELECT * FROM support_tickets 
       WHERE assigned_to = $1 AND status IN ('OPEN', 'IN_PROGRESS')
       ORDER BY created_at DESC 
       LIMIT $2`,
      [staffId, limit],
    );
    return result.rows;
  }

  /**
   * Get overdue tickets
   */
  async getOverdueTickets(limit = 100): Promise<SupportTicket[]> {
    const result = await query(
      `SELECT * FROM support_tickets 
       WHERE sla_due_at < NOW() AND status IN ('OPEN', 'IN_PROGRESS')
       ORDER BY sla_due_at ASC 
       LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  /**
   * Update ticket status
   */
  async updateTicketStatus(
    ticketId: string,
    status: string,
    updatedBy?: string,
  ): Promise<SupportTicket> {
    const updates: string[] = ["status = $1", "updated_at = NOW()"];
    const values: any[] = [status];
    let paramIndex = 2;

    if (status === "RESOLVED") {
      updates.push("resolved_at = NOW()");
    } else if (status === "CLOSED") {
      updates.push("closed_at = NOW()");
    }

    if (updatedBy) {
      if (status === "RESOLVED") {
        updates.push(`resolved_by = $${paramIndex}`);
        values.push(updatedBy);
        paramIndex++;
      }
      if (status === "CLOSED") {
        updates.push(`resolved_by = $${paramIndex}`);
        values.push(updatedBy);
        paramIndex++;
      }
    }

    values.push(ticketId);

    const result = await query(
      `UPDATE support_tickets SET ${updates.join(", ")} WHERE ticket_id = $${paramIndex} RETURNING *`,
      values,
    );

    return result.rows[0];
  }

  /**
   * Assign ticket to staff
   */
  async assignTicket(
    ticketId: string,
    staffId: string,
    _assignedBy?: string,
  ): Promise<SupportTicket> {
    const result = await query(
      `UPDATE support_tickets 
       SET assigned_to = $1, assigned_at = NOW(), status = 'IN_PROGRESS', updated_at = NOW()
       WHERE ticket_id = $2
       RETURNING *`,
      [staffId, ticketId],
    );

    if (result.rows.length === 0) {
      throw new Error("Ticket not found");
    }

    return result.rows[0];
  }

  /**
   * Add message to ticket
   */
  async addMessage(messageData: {
    ticket_id: string;
    sender_type: string;
    sender_id: string;
    message: string;
    attachments?: any;
    is_internal?: boolean;
    metadata?: any;
  }): Promise<TicketMessage> {
    const messageId = this.generateMessageId();

    const result = await query(
      `INSERT INTO ticket_messages (
        message_id, ticket_id, sender_type, sender_id, message,
        attachments, is_internal, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        messageId,
        messageData.ticket_id,
        messageData.sender_type,
        messageData.sender_id,
        messageData.message,
        JSON.stringify(messageData.attachments || []),
        messageData.is_internal || false,
        JSON.stringify(messageData.metadata || {}),
      ],
    );

    // Update ticket last activity
    await query(`UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`, [
      messageData.ticket_id,
    ]);

    return result.rows[0];
  }

  /**
   * Get messages for ticket
   */
  async getTicketMessages(ticketId: string): Promise<TicketMessage[]> {
    const result = await query(
      `SELECT * FROM ticket_messages 
       WHERE ticket_id = (SELECT id FROM support_tickets WHERE ticket_id = $1)
       ORDER BY created_at ASC`,
      [ticketId],
    );
    return result.rows;
  }

  /**
   * Get ticket statistics
   */
  async getTicketStatistics(
    filters: {
      assigned_to?: string;
      start_date?: Date;
      end_date?: Date;
    } = {},
  ): Promise<any> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (filters.assigned_to) {
      conditions.push("assigned_to = $1");
      values.push(filters.assigned_to);
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
        COUNT(*) as total_tickets,
        COUNT(CASE WHEN status = 'OPEN' THEN 1 END) as open_tickets,
        COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) as in_progress_tickets,
        COUNT(CASE WHEN status = 'RESOLVED' THEN 1 END) as resolved_tickets,
        COUNT(CASE WHEN status = 'CLOSED' THEN 1 END) as closed_tickets,
        COUNT(CASE WHEN sla_due_at < NOW() AND status IN ('OPEN', 'IN_PROGRESS') THEN 1 END) as overdue_tickets
       FROM support_tickets
       ${whereClause}`,
      values,
    );

    return result.rows[0];
  }

  /**
   * Calculate SLA due time based on priority
   */
  private calculateSLADueAt(priority: string): Date {
    const slaHours: Record<string, number> = {
      LOW: 72, // 3 days
      NORMAL: 48, // 2 days
      HIGH: 24, // 1 day
      URGENT: 4, // 4 hours
    };

    const hours = slaHours[priority] || 48;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  /**
   * Generate ticket ID
   */
  private generateTicketId(): string {
    return `TKT-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Generate message ID
   */
  private generateMessageId(): string {
    return `MSG-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

export const supportService = new SupportService();
