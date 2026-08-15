import { query } from "../database/connection.js";

interface NotificationTemplate {
  id: string;
  template_id: string;
  name: string;
  description: string;
  notification_type: string;
  subject_template: string;
  body_template: string;
  variables: any;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  metadata: any;
}

interface Notification {
  id: string;
  notification_id: string;
  customer_id: string;
  staff_id: string;
  template_id: string;
  notification_type: string;
  subject: string;
  body: string;
  status: string;
  delivery_attempts: number;
  channels: any;
  reference_type: string;
  reference_id: string;
  scheduled_for: Date;
  sent_at: Date;
  delivered_at: Date;
  failed_at: Date;
  created_at: Date;
  created_by: string;
  metadata: any;
}

export class NotificationService {
  /**
   * Create notification template
   */
  async createTemplate(templateData: {
    name: string;
    description?: string;
    notification_type: string;
    subject_template?: string;
    body_template: string;
    variables?: any;
    created_by?: string;
    metadata?: any;
  }): Promise<NotificationTemplate> {
    const templateId = this.generateTemplateId();

    const result = await query(
      `INSERT INTO notification_templates (
        template_id, name, description, notification_type, subject_template,
        body_template, variables, created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        templateId,
        templateData.name,
        templateData.description || null,
        templateData.notification_type,
        templateData.subject_template || null,
        templateData.body_template,
        JSON.stringify(templateData.variables || {}),
        templateData.created_by || null,
        JSON.stringify(templateData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get template by ID
   */
  async getTemplate(templateId: string): Promise<NotificationTemplate | null> {
    const result = await query(
      "SELECT * FROM notification_templates WHERE template_id = $1",
      [templateId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get active templates by type
   */
  async getActiveTemplatesByType(
    notificationType: string,
  ): Promise<NotificationTemplate[]> {
    const result = await query(
      `SELECT * FROM notification_templates 
       WHERE notification_type = $1 AND is_active = TRUE 
       ORDER BY created_at DESC`,
      [notificationType],
    );
    return result.rows;
  }

  /**
   * Render template with variables
   */
  private renderTemplate(template: string, variables: any): string {
    let rendered = template;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      rendered = rendered.replace(new RegExp(placeholder, "g"), String(value));
    }
    return rendered;
  }

  /**
   * Send notification
   */
  async sendNotification(notificationData: {
    customer_id?: string;
    staff_id?: string;
    template_id?: string;
    notification_type: string;
    subject?: string;
    body: string;
    channels?: any;
    reference_type?: string;
    reference_id?: string;
    scheduled_for?: Date;
    created_by?: string;
    metadata?: any;
  }): Promise<Notification> {
    const notificationId = this.generateNotificationId();

    let subject = notificationData.subject;
    let body = notificationData.body;

    // If template is provided, render it
    if (notificationData.template_id) {
      const template = await this.getTemplate(notificationData.template_id);
      if (template) {
        const variables = notificationData.metadata?.variables || {};
        if (template.subject_template) {
          subject = this.renderTemplate(template.subject_template, variables);
        }
        body = this.renderTemplate(template.body_template, variables);
      }
    }

    const result = await query(
      `INSERT INTO notifications (
        notification_id, customer_id, staff_id, template_id, notification_type,
        subject, body, channels, reference_type, reference_id, scheduled_for,
        created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        notificationId,
        notificationData.customer_id || null,
        notificationData.staff_id || null,
        notificationData.template_id || null,
        notificationData.notification_type,
        subject || null,
        body,
        JSON.stringify(notificationData.channels || {}),
        notificationData.reference_type || null,
        notificationData.reference_id || null,
        notificationData.scheduled_for || null,
        notificationData.created_by || null,
        JSON.stringify(notificationData.metadata || {}),
      ],
    );

    // If not scheduled, send immediately
    if (!notificationData.scheduled_for) {
      await this.processNotification(result.rows[0].id);
    }

    return result.rows[0];
  }

  /**
   * Process notification (send via channels)
   */
  private async processNotification(notificationId: string): Promise<void> {
    const notification = await query(
      "SELECT * FROM notifications WHERE id = $1",
      [notificationId],
    );

    if (notification.rows.length === 0) {
      throw new Error("Notification not found");
    }

    const notif = notification.rows[0];
    const channels = notif.channels || {};

    let success = false;
    const failures: string[] = [];

    // Send via email
    if (channels.email && notif.customer_id) {
      try {
        await this.sendEmail(notif.customer_id, notif.subject, notif.body);
        success = true;
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "EMAIL_FAILED");
      }
    }

    // Send via SMS
    if (channels.sms && notif.customer_id) {
      try {
        await this.sendSMS(notif.customer_id, notif.body);
        success = true;
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "SMS_FAILED");
      }
    }

    // Send via push notification
    if (channels.push && notif.customer_id) {
      try {
        await this.sendPushNotification(
          notif.customer_id,
          notif.subject,
          notif.body,
        );
        success = true;
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "PUSH_FAILED");
      }
    }

    // Update notification status
    if (success) {
      await query(
        `UPDATE notifications 
         SET status = 'SENT', sent_at = NOW(), delivery_attempts = delivery_attempts + 1
         WHERE id = $1`,
        [notificationId],
      );
    } else {
      await query(
        `UPDATE notifications 
         SET status = 'DEAD_LETTER', failed_at = NOW(), failure_reason = $2,
             delivery_attempts = delivery_attempts + 1
         WHERE id = $1`,
        [notificationId, failures.join("; ") || "NO_PROVIDER_CONFIGURED"],
      );
    }
  }

  /**
   * Send email (mock implementation)
   */
  private async sendEmail(
    customerId: string,
    _subject: string,
    _body: string,
  ): Promise<void> {
    if (process.env.NODE_ENV === "production")
      throw new Error("EMAIL_PROVIDER_NOT_IMPLEMENTED");
    const customer = await query("SELECT email FROM customers WHERE id = $1", [
      customerId,
    ]);

    if (customer.rows.length > 0 && customer.rows[0].email) {
      if (process.env.NODE_ENV !== "production") return;
    }
  }

  /**
   * Send SMS (mock implementation)
   */
  private async sendSMS(customerId: string, _body: string): Promise<void> {
    if (process.env.NODE_ENV === "production")
      throw new Error("SMS_PROVIDER_NOT_IMPLEMENTED");
    const customer = await query("SELECT phone FROM customers WHERE id = $1", [
      customerId,
    ]);

    if (customer.rows.length > 0 && customer.rows[0].phone) {
      if (process.env.NODE_ENV !== "production") return;
    }
  }

  /**
   * Send push notification (mock implementation)
   */
  private async sendPushNotification(
    _customerId: string,
    _title: string,
    _body: string,
  ): Promise<void> {
    throw new Error("PUSH_PROVIDER_UNAVAILABLE");
  }

  /**
   * Get pending notifications
   */
  async getPendingNotifications(): Promise<Notification[]> {
    const result = await query(
      `SELECT * FROM notifications 
       WHERE status = 'PENDING' 
       AND (scheduled_for IS NULL OR scheduled_for <= NOW())
       ORDER BY created_at ASC`,
      [],
    );
    return result.rows;
  }

  /**
   * Process pending notifications
   */
  async processPendingNotifications(): Promise<number> {
    const pending = await this.getPendingNotifications();
    let processed = 0;

    for (const notification of pending) {
      try {
        await this.processNotification(notification.id);
        processed++;
      } catch (error) {
        console.error(
          `Failed to process notification ${notification.id}:`,
          error,
        );
      }
    }

    return processed;
  }

  /**
   * Get notifications for customer
   */
  async getNotificationsForCustomer(
    customerId: string,
    limit = 50,
  ): Promise<Notification[]> {
    const result = await query(
      `SELECT * FROM notifications 
       WHERE customer_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [customerId, limit],
    );
    return result.rows;
  }

  /**
   * Get notifications for staff
   */
  async getNotificationsForStaff(
    staffId: string,
    limit = 50,
  ): Promise<Notification[]> {
    const result = await query(
      `SELECT * FROM notifications 
       WHERE staff_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [staffId, limit],
    );
    return result.rows;
  }

  /**
   * Update template status
   */
  async updateTemplateStatus(
    templateId: string,
    isActive: boolean,
  ): Promise<NotificationTemplate> {
    const result = await query(
      `UPDATE notification_templates SET is_active = $1, updated_at = NOW() 
       WHERE template_id = $2 RETURNING *`,
      [isActive, templateId],
    );
    return result.rows[0];
  }

  /**
   * Generate template ID
   */
  private generateTemplateId(): string {
    return `TPL-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Generate notification ID
   */
  private generateNotificationId(): string {
    return `NTF-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

export const notificationService = new NotificationService();
