import { FastifyInstance } from "fastify";
import { z } from "zod";
import { supportService } from "../services/supportService.js";

export async function supportRoutes(fastify: FastifyInstance) {
  // Support: Create ticket
  fastify.post("/support/tickets", async (request, reply) => {
    const schema = z.object({
      customer_id: z.string().uuid().optional(),
      subject: z.string(),
      description: z.string(),
      category: z
        .enum(["ORDER", "PAYMENT", "DELIVERY", "PRODUCT", "GENERAL"])
        .optional(),
      priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
      order_id: z.string().uuid().optional(),
      product_id: z.string().uuid().optional(),
      created_by: z.string().optional(),
      metadata: z.any().optional(),
    });

    const ticketData = schema.parse(request.body);

    try {
      const ticket = await supportService.createTicket(ticketData);
      return reply.status(201).send(ticket);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to create support ticket" });
    }
  });

  // Support: Get ticket
  fastify.get("/support/tickets/:ticketId", async (request, reply) => {
    const schema = z.object({
      ticketId: z.string(),
    });

    const { ticketId } = schema.parse(request.params);

    try {
      const ticket = await supportService.getTicket(ticketId);
      if (!ticket) {
        return reply.status(404).send({ error: "Support ticket not found" });
      }
      return reply.send(ticket);
    } catch {
      return reply.status(500).send({ error: "Failed to get support ticket" });
    }
  });

  // Support: Get tickets for customer
  fastify.get(
    "/support/tickets/customer/:customerId",
    async (request, reply) => {
      const schema = z.object({
        customerId: z.string().uuid(),
        limit: z.coerce.number().int().positive().optional(),
      });

      const { customerId, limit = 50 } = schema.parse(request.params);

      try {
        const tickets = await supportService.getTicketsForCustomer(
          customerId,
          limit,
        );
        return reply.send(tickets);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get customer tickets" });
      }
    },
  );

  // Support: Get tickets by status
  fastify.get("/support/tickets/status/:status", async (request, reply) => {
    const schema = z.object({
      status: z.enum(["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"]),
      limit: z.coerce.number().int().positive().optional(),
    });

    const { status, limit = 100 } = schema.parse(request.params);

    try {
      const tickets = await supportService.getTicketsByStatus(status, limit);
      return reply.send(tickets);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get tickets by status" });
    }
  });

  // Support: Get tickets assigned to staff
  fastify.get("/support/tickets/assigned/:staffId", async (request, reply) => {
    const schema = z.object({
      staffId: z.string(),
      limit: z.coerce.number().int().positive().optional(),
    });

    const { staffId, limit = 100 } = schema.parse(request.params);

    try {
      const tickets = await supportService.getTicketsAssignedTo(staffId, limit);
      return reply.send(tickets);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get assigned tickets" });
    }
  });

  // Support: Get overdue tickets
  fastify.get("/support/tickets/overdue", async (request, reply) => {
    const schema = z.object({
      limit: z.coerce.number().int().positive().optional(),
    });

    const { limit = 100 } = schema.parse(request.params);

    try {
      const tickets = await supportService.getOverdueTickets(limit);
      return reply.send(tickets);
    } catch {
      return reply.status(500).send({ error: "Failed to get overdue tickets" });
    }
  });

  // Support: Update ticket status
  fastify.put("/support/tickets/:ticketId/status", async (request, reply) => {
    const paramsSchema = z.object({
      ticketId: z.string(),
    });

    const bodySchema = z.object({
      status: z.enum(["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"]),
      updated_by: z.string().optional(),
    });

    const { ticketId } = paramsSchema.parse(request.params);
    const { status, updated_by } = bodySchema.parse(request.body);

    try {
      const ticket = await supportService.updateTicketStatus(
        ticketId,
        status,
        updated_by,
      );
      return reply.send(ticket);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to update ticket status" });
    }
  });

  // Support: Assign ticket
  fastify.post("/support/tickets/:ticketId/assign", async (request, reply) => {
    const paramsSchema = z.object({
      ticketId: z.string(),
    });

    const bodySchema = z.object({
      staff_id: z.string(),
      assigned_by: z.string().optional(),
    });

    const { ticketId } = paramsSchema.parse(request.params);
    const { staff_id, assigned_by } = bodySchema.parse(request.body);

    try {
      const ticket = await supportService.assignTicket(
        ticketId,
        staff_id,
        assigned_by,
      );
      return reply.send(ticket);
    } catch (error) {
      if (error instanceof Error && error.message === "Ticket not found") {
        return reply.status(404).send({ error: error.message });
      }
      return reply.status(500).send({ error: "Failed to assign ticket" });
    }
  });

  // Support: Add message
  fastify.post(
    "/support/tickets/:ticketId/messages",
    async (request, reply) => {
      const paramsSchema = z.object({
        ticketId: z.string(),
      });

      const bodySchema = z.object({
        sender_type: z.enum(["CUSTOMER", "STAFF", "SYSTEM"]),
        sender_id: z.string(),
        message: z.string(),
        attachments: z.any().optional(),
        is_internal: z.boolean().optional(),
        metadata: z.any().optional(),
      });

      const { ticketId } = paramsSchema.parse(request.params);
      const messageData = bodySchema.parse(request.body);

      try {
        const message = await supportService.addMessage({
          ticket_id: ticketId,
          ...messageData,
        });
        return reply.status(201).send(message);
      } catch {
        return reply.status(500).send({ error: "Failed to add message" });
      }
    },
  );

  // Support: Get ticket messages
  fastify.get("/support/tickets/:ticketId/messages", async (request, reply) => {
    const schema = z.object({
      ticketId: z.string(),
    });

    const { ticketId } = schema.parse(request.params);

    try {
      const messages = await supportService.getTicketMessages(ticketId);
      return reply.send(messages);
    } catch {
      return reply.status(500).send({ error: "Failed to get ticket messages" });
    }
  });

  // Support: Get statistics
  fastify.get("/support/statistics", async (request, reply) => {
    const schema = z.object({
      assigned_to: z.string().optional(),
      start_date: z.coerce.date().optional(),
      end_date: z.coerce.date().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const stats = await supportService.getTicketStatistics(filters);
      return reply.send(stats);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get ticket statistics" });
    }
  });
}
