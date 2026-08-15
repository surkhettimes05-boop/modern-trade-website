import { FastifyInstance } from "fastify";
import { z } from "zod";
import { notificationService } from "../services/notificationService.js";

export async function notificationRoutes(fastify: FastifyInstance) {
  // Notifications: Create template
  fastify.post("/notifications/templates", async (request, reply) => {
    const schema = z.object({
      name: z.string(),
      description: z.string().optional(),
      notification_type: z.enum(["EMAIL", "SMS", "PUSH", "IN_APP"]),
      subject_template: z.string().optional(),
      body_template: z.string(),
      variables: z.any().optional(),
      created_by: z.string().optional(),
      metadata: z.any().optional(),
    });

    const templateData = schema.parse(request.body);

    try {
      const template = await notificationService.createTemplate(templateData);
      return reply.status(201).send(template);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to create notification template" });
    }
  });

  // Notifications: Get template
  fastify.get(
    "/notifications/templates/:templateId",
    async (request, reply) => {
      const schema = z.object({
        templateId: z.string(),
      });

      const { templateId } = schema.parse(request.params);

      try {
        const template = await notificationService.getTemplate(templateId);
        if (!template) {
          return reply
            .status(404)
            .send({ error: "Notification template not found" });
        }
        return reply.send(template);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get notification template" });
      }
    },
  );

  // Notifications: Get active templates by type
  fastify.get(
    "/notifications/templates/type/:notificationType",
    async (request, reply) => {
      const schema = z.object({
        notificationType: z.enum(["EMAIL", "SMS", "PUSH", "IN_APP"]),
      });

      const { notificationType } = schema.parse(request.params);

      try {
        const templates =
          await notificationService.getActiveTemplatesByType(notificationType);
        return reply.send(templates);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get notification templates" });
      }
    },
  );

  // Notifications: Update template status
  fastify.put(
    "/notifications/templates/:templateId/status",
    async (request, reply) => {
      const paramsSchema = z.object({
        templateId: z.string(),
      });

      const bodySchema = z.object({
        is_active: z.boolean(),
      });

      const { templateId } = paramsSchema.parse(request.params);
      const { is_active } = bodySchema.parse(request.body);

      try {
        const template = await notificationService.updateTemplateStatus(
          templateId,
          is_active,
        );
        return reply.send(template);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to update template status" });
      }
    },
  );

  // Notifications: Send notification
  fastify.post("/notifications/send", async (request, reply) => {
    const schema = z.object({
      customer_id: z.string().uuid().optional(),
      staff_id: z.string().optional(),
      template_id: z.string().uuid().optional(),
      notification_type: z.enum(["EMAIL", "SMS", "PUSH", "IN_APP"]),
      subject: z.string().optional(),
      body: z.string(),
      channels: z.any().optional(),
      reference_type: z.string().optional(),
      reference_id: z.string().optional(),
      scheduled_for: z.coerce.date().optional(),
      created_by: z.string().optional(),
      metadata: z.any().optional(),
    });

    const notificationData = schema.parse(request.body);

    try {
      const notification =
        await notificationService.sendNotification(notificationData);
      return reply.status(201).send(notification);
    } catch {
      return reply.status(500).send({ error: "Failed to send notification" });
    }
  });

  // Notifications: Get notifications for customer
  fastify.get("/notifications/customer/:customerId", async (request, reply) => {
    const schema = z.object({
      customerId: z.string().uuid(),
      limit: z.coerce.number().int().positive().optional(),
    });

    const { customerId, limit = 50 } = schema.parse(request.params);

    try {
      const notifications =
        await notificationService.getNotificationsForCustomer(
          customerId,
          limit,
        );
      return reply.send(notifications);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get customer notifications" });
    }
  });

  // Notifications: Get notifications for staff
  fastify.get("/notifications/staff/:staffId", async (request, reply) => {
    const schema = z.object({
      staffId: z.string(),
      limit: z.coerce.number().int().positive().optional(),
    });

    const { staffId, limit = 50 } = schema.parse(request.params);

    try {
      const notifications = await notificationService.getNotificationsForStaff(
        staffId,
        limit,
      );
      return reply.send(notifications);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get staff notifications" });
    }
  });

  // Notifications: Process pending notifications
  fastify.post("/notifications/process-pending", async (request, reply) => {
    try {
      const processed = await notificationService.processPendingNotifications();
      return reply.send({ processed });
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to process pending notifications" });
    }
  });
}
