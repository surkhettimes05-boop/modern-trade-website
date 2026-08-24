import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ShiftService } from "../services/shiftService.js";

const shiftService = new ShiftService();

export async function shiftRoutes(fastify: FastifyInstance) {
  // Shift: Open shift
  fastify.post("/shifts", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid(),
      device_id: z.string().optional(),
      opened_by: z.string(),
      opening_cash: z.number().min(0),
      notes: z.string().optional(),
      metadata: z.any().optional(),
    });

    const shiftData = schema.parse(request.body);

    try {
      const shift = await shiftService.openShift(shiftData);
      return reply.status(201).send(shift);
    } catch {
      return reply.status(500).send({ error: "Failed to open shift" });
    }
  });

  // Shift: Get shift by ID
  fastify.get("/shifts/:shiftId", async (request, reply) => {
    const schema = z.object({
      shiftId: z.string().uuid(),
    });

    const { shiftId } = schema.parse(request.params);

    try {
      const shift = await shiftService.getShift(shiftId);
      if (!shift) {
        return reply.status(404).send({ error: "Shift not found" });
      }
      return reply.send(shift);
    } catch {
      return reply.status(500).send({ error: "Failed to get shift" });
    }
  });

  // Shift: Get shift by number
  fastify.get("/shifts/number/:shiftNumber", async (request, reply) => {
    const schema = z.object({
      shiftNumber: z.string(),
    });

    const { shiftNumber } = schema.parse(request.params);

    try {
      const shift = await shiftService.getShiftByNumber(shiftNumber);
      if (!shift) {
        return reply.status(404).send({ error: "Shift not found" });
      }
      return reply.send(shift);
    } catch {
      return reply.status(500).send({ error: "Failed to get shift" });
    }
  });

  // Shift: Get all shifts
  fastify.get("/shifts", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
      device_id: z.string().optional(),
      status: z.enum(["OPEN", "CLOSED", "VOIDED"]).optional(),
      opened_by: z.string().optional(),
      date_from: z.coerce.date().optional(),
      date_to: z.coerce.date().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).max(100_000).default(0),
    });

    const filters = schema.parse(request.query);

    try {
      const shifts = await shiftService.getShifts(filters);
      return reply.send(shifts);
    } catch {
      return reply.status(500).send({ error: "Failed to get shifts" });
    }
  });

  // Shift: Get open shift
  fastify.get("/shifts/open", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid(),
      device_id: z.string().optional(),
    });

    const { store_id, device_id } = schema.parse(request.query);

    try {
      const shift = await shiftService.getOpenShift(store_id, device_id);
      if (!shift) {
        return reply.status(404).send({ error: "No open shift found" });
      }
      return reply.send(shift);
    } catch {
      return reply.status(500).send({ error: "Failed to get open shift" });
    }
  });

  // Shift: Close shift
  fastify.post("/shifts/:shiftId/close", async (request, reply) => {
    const paramsSchema = z.object({
      shiftId: z.string().uuid(),
    });

    const bodySchema = z.object({
      closed_by: z.string(),
      closing_cash: z.number().min(0),
      notes: z.string().optional(),
    });

    const { shiftId } = paramsSchema.parse(request.params);
    const closeData = bodySchema.parse(request.body);

    try {
      const shift = await shiftService.closeShift(shiftId, closeData);
      return reply.send(shift);
    } catch (error) {
      if (error instanceof Error && error.message === "Shift not found") {
        return reply.status(404).send({ error: "Shift not found" });
      }
      return reply.status(500).send({ error: "Failed to close shift" });
    }
  });

  // Shift: Void shift
  fastify.post("/shifts/:shiftId/void", async (request, reply) => {
    const schema = z.object({
      shiftId: z.string().uuid(),
    });

    const { shiftId } = schema.parse(request.params);

    try {
      const shift = await shiftService.voidShift(shiftId);
      return reply.send(shift);
    } catch {
      return reply.status(500).send({ error: "Failed to void shift" });
    }
  });

  // Shift: Update shift summary
  fastify.post("/shifts/:shiftId/update-summary", async (request, reply) => {
    const schema = z.object({
      shiftId: z.string().uuid(),
    });

    const { shiftId } = schema.parse(request.params);

    try {
      const shift = await shiftService.updateShiftSummary(shiftId);
      return reply.send(shift);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to update shift summary" });
    }
  });

  // Shift: Update shift
  fastify.put("/shifts/:shiftId", async (request, reply) => {
    const paramsSchema = z.object({
      shiftId: z.string().uuid(),
    });

    const bodySchema = z.object({
      opening_cash: z.number().min(0).optional(),
      closing_cash: z.number().min(0).optional(),
      notes: z.string().optional(),
      metadata: z.any().optional(),
    });

    const { shiftId } = paramsSchema.parse(request.params);
    const updates = bodySchema.parse(request.body);

    try {
      const shift = await shiftService.updateShift(shiftId, updates);
      return reply.send(shift);
    } catch (error) {
      if (error instanceof Error && error.message === "No fields to update") {
        return reply.status(400).send({ error: "No fields to update" });
      }
      return reply.status(500).send({ error: "Failed to update shift" });
    }
  });

  // Shift: Get summary
  fastify.get("/shifts/summary", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
      device_id: z.string().optional(),
      date_from: z.coerce.date().optional(),
      date_to: z.coerce.date().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const summary = await shiftService.getShiftSummary(filters);
      return reply.send(summary);
    } catch {
      return reply.status(500).send({ error: "Failed to get shift summary" });
    }
  });
}
