import { FastifyInstance } from "fastify";
import { z } from "zod";
import { DeliveryService } from "../services/deliveryService.js";

const deliveryService = new DeliveryService();

export async function deliveryRoutes(fastify: FastifyInstance) {
  // Delivery: Create assignment
  fastify.post("/deliveries", async (request, reply) => {
    const schema = z.object({
      order_id: z.string().uuid(),
      delivery_person_id: z.string().optional(),
      delivery_person_name: z.string().optional(),
      delivery_person_phone: z.string().optional(),
      created_by: z.string().optional(),
      metadata: z.any().optional(),
    });

    const assignmentData = schema.parse(request.body);

    try {
      const assignment =
        await deliveryService.createDeliveryAssignment(assignmentData);
      return reply.status(201).send(assignment);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to create delivery assignment" });
    }
  });

  // Delivery: Get assignment by ID
  fastify.get("/deliveries/:assignmentId", async (request, reply) => {
    const schema = z.object({
      assignmentId: z.string(),
    });

    const { assignmentId } = schema.parse(request.params);

    try {
      const assignment =
        await deliveryService.getDeliveryAssignment(assignmentId);
      if (!assignment) {
        return reply
          .status(404)
          .send({ error: "Delivery assignment not found" });
      }
      return reply.send(assignment);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get delivery assignment" });
    }
  });

  // Delivery: Get assignment by order
  fastify.get("/deliveries/order/:orderId", async (request, reply) => {
    const schema = z.object({
      orderId: z.string().uuid(),
    });

    const { orderId } = schema.parse(request.params);

    try {
      const assignment =
        await deliveryService.getDeliveryAssignmentByOrder(orderId);
      if (!assignment) {
        return reply
          .status(404)
          .send({ error: "Delivery assignment not found" });
      }
      return reply.send(assignment);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get delivery assignment" });
    }
  });

  // Delivery: Update status
  fastify.post("/deliveries/:assignmentId/status", async (request, reply) => {
    const paramsSchema = z.object({
      assignmentId: z.string(),
    });

    const bodySchema = z.object({
      status: z.enum([
        "ASSIGNED",
        "PICKED_UP",
        "IN_TRANSIT",
        "DELIVERED",
        "FAILED",
        "CANCELLED",
      ]),
      location_lat: z.number().optional(),
      location_lng: z.number().optional(),
      notes: z.string().optional(),
      proof_of_delivery_url: z.string().optional(),
      customer_signature_url: z.string().optional(),
      created_by: z.string().optional(),
    });

    const { assignmentId } = paramsSchema.parse(request.params);
    const statusData = bodySchema.parse(request.body);

    try {
      const assignment = await deliveryService.updateDeliveryStatus(
        assignmentId,
        statusData.status,
        statusData,
      );
      return reply.send(assignment);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Invalid transition")
      ) {
        return reply.status(400).send({ error: error.message });
      }
      return reply
        .status(500)
        .send({ error: "Failed to update delivery status" });
    }
  });

  // Delivery: Get tracking events
  fastify.get("/deliveries/:assignmentId/tracking", async (request, reply) => {
    const schema = z.object({
      assignmentId: z.string(),
    });

    const { assignmentId } = schema.parse(request.params);

    try {
      const events =
        await deliveryService.getDeliveryTrackingEvents(assignmentId);
      return reply.send(events);
    } catch {
      return reply.status(500).send({ error: "Failed to get tracking events" });
    }
  });

  // Delivery: Get active deliveries for person
  fastify.get("/deliveries/person/:personId/active", async (request, reply) => {
    const schema = z.object({
      personId: z.string(),
    });

    const { personId } = schema.parse(request.params);

    try {
      const deliveries =
        await deliveryService.getActiveDeliveriesForPerson(personId);
      return reply.send(deliveries);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get active deliveries" });
    }
  });

  // Delivery: Get statistics
  fastify.get("/deliveries/statistics", async (request, reply) => {
    const schema = z.object({
      delivery_person_id: z.string().optional(),
      start_date: z.coerce.date().optional(),
      end_date: z.coerce.date().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const stats = await deliveryService.getDeliveryStatistics(filters);
      return reply.send(stats);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get delivery statistics" });
    }
  });

  // Delivery: Cancel
  fastify.post("/deliveries/:assignmentId/cancel", async (request, reply) => {
    const paramsSchema = z.object({
      assignmentId: z.string(),
    });

    const bodySchema = z.object({
      reason: z.string().optional(),
      cancelled_by: z.string().optional(),
    });

    const { assignmentId } = paramsSchema.parse(request.params);
    const cancelData = bodySchema.parse(request.body);

    try {
      const assignment = await deliveryService.cancelDelivery(
        assignmentId,
        cancelData.reason,
        cancelData.cancelled_by,
      );
      return reply.send(assignment);
    } catch {
      return reply.status(500).send({ error: "Failed to cancel delivery" });
    }
  });

  // Delivery: Mark as failed
  fastify.post("/deliveries/:assignmentId/failed", async (request, reply) => {
    const paramsSchema = z.object({
      assignmentId: z.string(),
    });

    const bodySchema = z.object({
      reason: z.string().optional(),
      failed_by: z.string().optional(),
    });

    const { assignmentId } = paramsSchema.parse(request.params);
    const failData = bodySchema.parse(request.body);

    try {
      const assignment = await deliveryService.markDeliveryFailed(
        assignmentId,
        failData.reason,
        failData.failed_by,
      );
      return reply.send(assignment);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to mark delivery as failed" });
    }
  });
}
