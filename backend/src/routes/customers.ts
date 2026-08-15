import { FastifyInstance } from "fastify";
import { z } from "zod";
import { CustomerService } from "../services/customerService.js";
import { validatePhone, normalizePhone } from "../utils/phoneNormalization.js";

const customerService = new CustomerService();

export async function customerRoutes(fastify: FastifyInstance) {
  // Public customer lookup (by phone)
  fastify.post("/lookup", async (request, reply) => {
    const schema = z.object({
      phone: z.string().min(10),
    });

    try {
      const body = schema.parse(request.body);

      if (!validatePhone(body.phone)) {
        reply.status(400);
        return { error: "Invalid phone number format" };
      }

      const customer = await customerService.findByPhone(body.phone);

      if (!customer) {
        reply.status(404);
        return { error: "Customer not found" };
      }

      // Return limited information for public lookup
      return {
        id: customer.id,
        exists: true,
        verification_status: customer.verification_status,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      reply.status(500);
      return { error: "Failed to lookup customer" };
    }
  });

  // Admin: Create customer
  fastify.post("/", async (request, reply) => {
    const schema = z.object({
      phone: z.string().min(10),
      preferred_name: z.string().max(100).optional(),
      email: z.string().email().optional(),
      language: z.enum(["en", "ne"]).optional(),
      home_store_id: z.string().uuid().optional(),
      enrollment_source: z.string(),
      enrollment_location_id: z.string().uuid().optional(),
      enrollment_channel: z.string(),
      enrolled_by: z.string().optional(),
    });

    try {
      const body = schema.parse(request.body);
      const customer = await customerService.createCustomer({
        ...body,
        enrolled_by:
          body.enrolled_by || (request.user as any)?.email || "admin",
      });
      return customer;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      if (error instanceof Error && error.message.includes("already exists")) {
        reply.status(409);
        return { error: error.message };
      }
      reply.status(500);
      return { error: "Failed to create customer" };
    }
  });

  // Admin: Get customer by ID
  fastify.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const customer = await customerService.findByIdMasked(id);

      if (!customer) {
        reply.status(404);
        return { error: "Customer not found" };
      }

      return customer;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch customer" };
    }
  });

  // Admin: Update customer
  fastify.put("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      preferred_name: z.string().max(100).optional(),
      email: z.string().email().optional(),
      language: z.enum(["en", "ne"]).optional(),
      home_store_id: z.string().uuid().optional(),
      updated_by: z.string(),
    });

    try {
      const body = schema.parse(request.body);
      const customer = await customerService.updateCustomer(id, body);
      return customer;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      if (error instanceof Error && error.message === "Customer not found") {
        reply.status(404);
        return { error: error.message };
      }
      reply.status(500);
      return { error: "Failed to update customer" };
    }
  });

  // Admin: Mark customer as verified
  fastify.post("/:id/verify", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      verified_by: z.string(),
    });

    try {
      const body = schema.parse(request.body);
      const customer = await customerService.markVerified(id, body.verified_by);
      return customer;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      reply.status(500);
      return { error: "Failed to verify customer" };
    }
  });

  // Admin: Merge duplicate customers
  fastify.post("/merge", async (request, reply) => {
    const schema = z.object({
      source_customer_id: z.string().uuid(),
      target_customer_id: z.string().uuid(),
      merge_reason: z.string().min(1),
      merged_by: z.string(),
      approval_required: z.boolean().optional(),
    });

    try {
      const body = schema.parse(request.body);
      await customerService.mergeCustomers(body);
      return { success: true, message: "Customers merged successfully" };
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      if (error instanceof Error) {
        reply.status(400);
        return { error: error.message };
      }
      reply.status(500);
      return { error: "Failed to merge customers" };
    }
  });

  // Admin: Check for potential duplicates
  fastify.post("/check-duplicates", async (request, reply) => {
    const schema = z.object({
      phone: z.string().min(10),
    });

    try {
      const body = schema.parse(request.body);

      if (!validatePhone(body.phone)) {
        reply.status(400);
        return { error: "Invalid phone number format" };
      }

      const duplicates = await customerService.findPotentialDuplicates(
        body.phone,
      );

      return {
        phone: normalizePhone(body.phone),
        count: duplicates.length,
        customers: duplicates.map((c) => ({
          id: c.id,
          phone_masked: c.phone_masked,
          preferred_name: c.preferred_name,
          status: c.status,
          verification_status: c.verification_status,
        })),
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      reply.status(500);
      return { error: "Failed to check for duplicates" };
    }
  });
}
