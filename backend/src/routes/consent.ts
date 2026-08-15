import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ConsentService } from "../services/consentService.js";

const consentService = new ConsentService();

export async function consentRoutes(fastify: FastifyInstance) {
  // Public: Grant consent (customer-initiated)
  fastify.post("/grant", async (request, reply) => {
    const schema = z.object({
      customer_id: z.string().uuid(),
      consent_type: z.enum([
        "MARKETING",
        "TRANSACTIONAL",
        "ANALYTICS",
        "PROFILE",
      ]),
      channel: z.string().optional(),
      policy_version: z.string(),
      evidence_url: z.string().url().optional(),
    });

    try {
      const body = schema.parse(request.body);
      const consent = await consentService.grantConsent({
        ...body,
        source: "CUSTOMER",
        granted_ip: (request as any).ip,
      });
      return consent;
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
      return { error: "Failed to grant consent" };
    }
  });

  // Public: Withdraw consent (customer-initiated)
  fastify.post("/withdraw", async (request, reply) => {
    const schema = z.object({
      consent_id: z.string().uuid(),
      withdrawn_reason: z.string().min(1),
    });

    try {
      const body = schema.parse(request.body);
      const consent = await consentService.withdrawConsent({
        ...body,
        withdrawn_by: "CUSTOMER",
      });

      // Suppress communications
      await consentService.suppressCommunications(
        consent.customer_id,
        consent.consent_type,
      );

      return consent;
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
      return { error: "Failed to withdraw consent" };
    }
  });

  // Public: Get customer's consents
  fastify.get("/customer/:customer_id", async (request, reply) => {
    const { customer_id } = request.params as { customer_id: string };

    try {
      const consents = await consentService.getCustomerConsents(customer_id);
      return consents;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch consents" };
    }
  });

  // Public: Check specific consent
  fastify.get(
    "/customer/:customer_id/:consent_type",
    async (request, reply) => {
      const { customer_id, consent_type } = request.params as {
        customer_id: string;
        consent_type: string;
      };

      try {
        const hasConsent = await consentService.hasConsent(
          customer_id,
          consent_type,
        );
        return { has_consent: hasConsent };
      } catch {
        reply.status(500);
        return { error: "Failed to check consent" };
      }
    },
  );

  // Public: Create data access/deletion request
  fastify.post("/data-request", async (request, reply) => {
    const schema = z.object({
      customer_id: z.string().uuid(),
      request_type: z.enum(["ACCESS", "DELETION", "CORRECTION"]),
    });

    try {
      const body = schema.parse(request.body);
      const dataRequest = await consentService.createDataRequest({
        ...body,
        requested_ip: (request as any).ip,
      });
      return dataRequest;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      reply.status(500);
      return { error: "Failed to create data request" };
    }
  });

  // Public: Get customer data requests
  fastify.get("/data-requests/:customer_id", async (request, reply) => {
    const { customer_id } = request.params as { customer_id: string };

    try {
      const requests =
        await consentService.getCustomerDataRequests(customer_id);
      return requests;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch data requests" };
    }
  });

  // Admin: Grant consent (staff-initiated)
  fastify.post("/admin/grant", async (request, reply) => {
    const schema = z.object({
      customer_id: z.string().uuid(),
      consent_type: z.enum([
        "MARKETING",
        "TRANSACTIONAL",
        "ANALYTICS",
        "PROFILE",
      ]),
      channel: z.string().optional(),
      policy_version: z.string(),
      source: z.string(),
      evidence_url: z.string().url().optional(),
    });

    try {
      const body = schema.parse(request.body);
      const consent = await consentService.grantConsent({
        ...body,
        granted_ip: (request as any).ip,
      });
      return consent;
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
      return { error: "Failed to grant consent" };
    }
  });

  // Admin: Withdraw consent (staff-initiated)
  fastify.post("/admin/withdraw", async (request, reply) => {
    const schema = z.object({
      consent_id: z.string().uuid(),
      withdrawn_reason: z.string().min(1),
      withdrawn_by: z.string(),
    });

    try {
      const body = schema.parse(request.body);
      const consent = await consentService.withdrawConsent(body);

      // Suppress communications
      await consentService.suppressCommunications(
        consent.customer_id,
        consent.consent_type,
      );

      return consent;
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
      return { error: "Failed to withdraw consent" };
    }
  });

  // Admin: Process data request
  fastify.patch("/admin/data-request/:request_id", async (request, reply) => {
    const { request_id } = request.params as { request_id: string };
    const schema = z.object({
      status: z.enum(["APPROVED", "COMPLETED", "REJECTED"]),
      processed_by: z.string(),
      notes: z.string().optional(),
    });

    try {
      const body = schema.parse(request.body);
      const dataRequest = await consentService.processDataRequest(
        request_id,
        body.processed_by,
        body.status,
        body.notes,
      );
      return dataRequest;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      if (
        error instanceof Error &&
        error.message === "Data request not found"
      ) {
        reply.status(404);
        return { error: error.message };
      }
      reply.status(500);
      return { error: "Failed to process data request" };
    }
  });

  // Admin: Update customer profile (for correction requests)
  fastify.patch(
    "/admin/customer/:customer_id/correct",
    async (request, reply) => {
      const { customer_id } = request.params as { customer_id: string };
      const schema = z.object({
        preferred_name: z.string().max(100).optional(),
        email: z.string().email().optional(),
        corrected_by: z.string(),
      });

      try {
        const body = schema.parse(request.body);
        const customer = await consentService.updateCustomerForCorrection(
          customer_id,
          body,
          body.corrected_by,
        );
        return customer;
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
        return { error: "Failed to update customer" };
      }
    },
  );
}
