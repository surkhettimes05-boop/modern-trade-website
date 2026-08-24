import { FastifyInstance } from "fastify";
import { z } from "zod";
import { StaffService } from "../services/staffService.js";

const staffService = new StaffService();

export async function staffRoutes(fastify: FastifyInstance) {
  // Staff: Create staff member
  fastify.post("/staff", async (request, reply) => {
    const schema = z.object({
      first_name: z.string().min(1),
      last_name: z.string().min(1),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      store_id: z.string().uuid().optional(),
      role: z.string().min(1),
      position: z.string().optional(),
      department: z.string().optional(),
      status: z
        .enum(["ACTIVE", "INACTIVE", "TERMINATED", "ON_LEAVE"])
        .optional(),
      hire_date: z.coerce.date().optional(),
      username: z.string().optional(),
      password: z.string().min(12).max(200).optional(),
      permissions: z.any().optional(),
      notes: z.string().optional(),
      metadata: z.any().optional(),
      created_by: z.string(),
    });

    const staffData = schema.parse(request.body);

    try {
      const staff = await staffService.createStaff(staffData);
      return reply.status(201).send(staff);
    } catch {
      return reply.status(500).send({ error: "Failed to create staff member" });
    }
  });

  // Staff: Get staff by ID
  fastify.get("/staff/:staffId", async (request, reply) => {
    const schema = z.object({
      staffId: z.string().uuid(),
    });

    const { staffId } = schema.parse(request.params);

    try {
      const staff = await staffService.getStaff(staffId);
      if (!staff) {
        return reply.status(404).send({ error: "Staff member not found" });
      }
      return reply.send(staff);
    } catch {
      return reply.status(500).send({ error: "Failed to get staff member" });
    }
  });

  // Staff: Get staff by number
  fastify.get("/staff/number/:staffNumber", async (request, reply) => {
    const schema = z.object({
      staffNumber: z.string(),
    });

    const { staffNumber } = schema.parse(request.params);

    try {
      const staff = await staffService.getStaffByNumber(staffNumber);
      if (!staff) {
        return reply.status(404).send({ error: "Staff member not found" });
      }
      return reply.send(staff);
    } catch {
      return reply.status(500).send({ error: "Failed to get staff member" });
    }
  });

  // Staff: Get all staff
  fastify.get("/staff", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
      role: z.string().optional(),
      status: z
        .enum(["ACTIVE", "INACTIVE", "TERMINATED", "ON_LEAVE"])
        .optional(),
      department: z.string().optional(),
      search: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).max(100_000).default(0),
    });

    const filters = schema.parse(request.query);

    try {
      const staffList = await staffService.getStaffList(filters);
      return reply.send(staffList);
    } catch {
      return reply.status(500).send({ error: "Failed to get staff list" });
    }
  });

  // Staff: Update staff
  fastify.put("/staff/:staffId", async (request, reply) => {
    const paramsSchema = z.object({
      staffId: z.string().uuid(),
    });

    const bodySchema = z.object({
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      store_id: z.string().uuid().optional(),
      role: z.string().optional(),
      position: z.string().optional(),
      department: z.string().optional(),
      status: z
        .enum(["ACTIVE", "INACTIVE", "TERMINATED", "ON_LEAVE"])
        .optional(),
      termination_date: z.coerce.date().optional(),
      permissions: z.any().optional(),
      notes: z.string().optional(),
      metadata: z.any().optional(),
    });

    const { staffId } = paramsSchema.parse(request.params);
    const updates = bodySchema.parse(request.body);

    try {
      const staff = await staffService.updateStaff(staffId, updates);
      return reply.send(staff);
    } catch (error) {
      if (error instanceof Error && error.message === "No fields to update") {
        return reply.status(400).send({ error: "No fields to update" });
      }
      return reply.status(500).send({ error: "Failed to update staff member" });
    }
  });

  // Staff: Update password
  fastify.post("/staff/:staffId/password", async (request, reply) => {
    const paramsSchema = z.object({
      staffId: z.string().uuid(),
    });

    const bodySchema = z.object({
      new_password: z.string().min(12).max(200),
    });

    const { staffId } = paramsSchema.parse(request.params);
    const { new_password } = bodySchema.parse(request.body);

    try {
      await staffService.updatePassword(staffId, new_password);
      return reply.send({ message: "Password updated successfully" });
    } catch {
      return reply.status(500).send({ error: "Failed to update password" });
    }
  });

  // Staff: Enable MFA
  fastify.post("/staff/:staffId/mfa/enable", async (request, reply) => {
    const paramsSchema = z.object({
      staffId: z.string().uuid(),
    });

    const bodySchema = z.object({
      mfa_secret: z.string(),
    });

    const { staffId } = paramsSchema.parse(request.params);
    const { mfa_secret } = bodySchema.parse(request.body);

    try {
      const staff = await staffService.enableMFA(staffId, mfa_secret);
      return reply.send(staff);
    } catch {
      return reply.status(500).send({ error: "Failed to enable MFA" });
    }
  });

  // Staff: Disable MFA
  fastify.post("/staff/:staffId/mfa/disable", async (request, reply) => {
    const schema = z.object({
      staffId: z.string().uuid(),
    });

    const { staffId } = schema.parse(request.params);

    try {
      const staff = await staffService.disableMFA(staffId);
      return reply.send(staff);
    } catch {
      return reply.status(500).send({ error: "Failed to disable MFA" });
    }
  });

  // Staff: Verify password
  fastify.post(
    "/staff/:staffId/verify-password",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const paramsSchema = z.object({
        staffId: z.string().uuid(),
      });

      const bodySchema = z.object({
        password: z.string(),
      });

      const { staffId } = paramsSchema.parse(request.params);
      const { password } = bodySchema.parse(request.body);

      try {
        const isValid = await staffService.verifyPassword(staffId, password);
        return reply.send({ valid: isValid });
      } catch {
        return reply.status(500).send({ error: "Failed to verify password" });
      }
    },
  );

  // Staff: Terminate staff
  fastify.post("/staff/:staffId/terminate", async (request, reply) => {
    const paramsSchema = z.object({
      staffId: z.string().uuid(),
    });

    const bodySchema = z.object({
      termination_date: z.coerce.date().optional(),
    });

    const { staffId } = paramsSchema.parse(request.params);
    const { termination_date } = bodySchema.parse(request.body);

    try {
      const staff = await staffService.terminateStaff(
        staffId,
        termination_date,
      );
      return reply.send(staff);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to terminate staff member" });
    }
  });

  // Staff: Get summary
  fastify.get("/staff/summary", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
      role: z.string().optional(),
      status: z
        .enum(["ACTIVE", "INACTIVE", "TERMINATED", "ON_LEAVE"])
        .optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const summary = await staffService.getStaffSummary(filters);
      return reply.send(summary);
    } catch {
      return reply.status(500).send({ error: "Failed to get staff summary" });
    }
  });
}
