import { FastifyInstance } from "fastify";
import { z } from "zod";
import { CODPolicyService } from "../services/codPolicyService.js";

const codPolicyService = new CODPolicyService();

export async function codPolicyRoutes(fastify: FastifyInstance) {
  // COD Policy: Create policy
  fastify.post("/cod-policies", async (request, reply) => {
    const schema = z.object({
      policy_name: z.string().min(1),
      store_id: z.string().uuid(),
      max_cod_amount: z.number().nonnegative().optional(),
      min_cod_amount: z.number().nonnegative().optional(),
      restricted_zones: z.array(z.string().uuid()).optional(),
      restricted_categories: z.array(z.string().uuid()).optional(),
      high_value_threshold: z.number().nonnegative().optional(),
      high_value_cod_allowed: z.boolean().optional(),
      allow_for_risk_customers: z.boolean().optional(),
      prepaid_only_for_new_customers: z.boolean().optional(),
      prepaid_only_days_after_registration: z.number().optional(),
      max_failed_deliveries: z.number().optional(),
      failed_delivery_block_days: z.number().optional(),
      effective_date: z.coerce.date().optional(),
      expiry_date: z.coerce.date().optional(),
      created_by: z.string().optional(),
      approved_by: z.string().optional(),
      approved_at: z.coerce.date().optional(),
      metadata: z.any().optional(),
    });

    const policyData = schema.parse(request.body);

    try {
      const policy = await codPolicyService.createCODPolicy(policyData);
      return reply.status(201).send(policy);
    } catch {
      return reply.status(500).send({ error: "Failed to create COD policy" });
    }
  });

  // COD Policy: Get policy by ID
  fastify.get("/cod-policies/:policyId", async (request, reply) => {
    const schema = z.object({
      policyId: z.string().uuid(),
    });

    const { policyId } = schema.parse(request.params);

    try {
      const policy = await codPolicyService.getCODPolicy(policyId);
      if (!policy) {
        return reply.status(404).send({ error: "COD policy not found" });
      }
      return reply.send(policy);
    } catch {
      return reply.status(500).send({ error: "Failed to get COD policy" });
    }
  });

  // COD Policy: Get active policy for store
  fastify.get("/cod-policies/store/:storeId/active", async (request, reply) => {
    const schema = z.object({
      storeId: z.string().uuid(),
    });

    const { storeId } = schema.parse(request.params);

    try {
      const policy = await codPolicyService.getActiveCODPolicy(storeId);
      if (!policy) {
        return reply.status(404).send({ error: "No active COD policy found" });
      }
      return reply.send(policy);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get active COD policy" });
    }
  });

  // COD Policy: Get all policies for store
  fastify.get("/cod-policies/store/:storeId", async (request, reply) => {
    const schema = z.object({
      storeId: z.string().uuid(),
    });

    const { storeId } = schema.parse(request.params);

    try {
      const policies = await codPolicyService.getStoreCODPolicies(storeId);
      return reply.send(policies);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get store COD policies" });
    }
  });

  // COD Policy: Check eligibility
  fastify.post("/cod-policies/check-eligibility", async (request, reply) => {
    const schema = z.object({
      order_total: z.number().nonnegative(),
      customer_id: z.string().uuid().optional(),
      delivery_zone_id: z.string().uuid().optional(),
      product_categories: z.array(z.string().uuid()).optional(),
      store_id: z.string().uuid().optional(),
    });

    const checkData = schema.parse(request.body);

    try {
      const eligibility = await codPolicyService.checkCODEligibility(checkData);
      return reply.send(eligibility);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to check COD eligibility" });
    }
  });

  // COD Policy: Update policy
  fastify.put("/cod-policies/:policyId", async (request, reply) => {
    const paramsSchema = z.object({
      policyId: z.string().uuid(),
    });

    const bodySchema = z.object({
      policy_name: z.string().min(1).optional(),
      max_cod_amount: z.number().nonnegative().optional(),
      min_cod_amount: z.number().nonnegative().optional(),
      restricted_zones: z.array(z.string().uuid()).optional(),
      restricted_categories: z.array(z.string().uuid()).optional(),
      high_value_threshold: z.number().nonnegative().optional(),
      high_value_cod_allowed: z.boolean().optional(),
      allow_for_risk_customers: z.boolean().optional(),
      prepaid_only_for_new_customers: z.boolean().optional(),
      prepaid_only_days_after_registration: z.number().optional(),
      max_failed_deliveries: z.number().optional(),
      failed_delivery_block_days: z.number().optional(),
      is_active: z.boolean().optional(),
      effective_date: z.coerce.date().optional(),
      expiry_date: z.coerce.date().optional(),
      approved_by: z.string().optional(),
      approved_at: z.coerce.date().optional(),
      metadata: z.any().optional(),
    });

    const { policyId } = paramsSchema.parse(request.params);
    const updates = bodySchema.parse(request.body);

    try {
      const policy = await codPolicyService.updateCODPolicy(policyId, updates);
      return reply.send(policy);
    } catch (error) {
      if (error instanceof Error && error.message === "No fields to update") {
        return reply.status(400).send({ error: "No fields to update" });
      }
      return reply.status(500).send({ error: "Failed to update COD policy" });
    }
  });

  // COD Policy: Delete policy
  fastify.delete("/cod-policies/:policyId", async (request, reply) => {
    const schema = z.object({
      policyId: z.string().uuid(),
    });

    const { policyId } = schema.parse(request.params);

    try {
      await codPolicyService.deleteCODPolicy(policyId);
      return reply.send({ message: "COD policy deleted" });
    } catch {
      return reply.status(500).send({ error: "Failed to delete COD policy" });
    }
  });

  // COD Policy: Approve policy
  fastify.post("/cod-policies/:policyId/approve", async (request, reply) => {
    const paramsSchema = z.object({
      policyId: z.string().uuid(),
    });

    const bodySchema = z.object({
      approved_by: z.string(),
    });

    const { policyId } = paramsSchema.parse(request.params);
    const { approved_by } = bodySchema.parse(request.body);

    try {
      const policy = await codPolicyService.approveCODPolicy(
        policyId,
        approved_by,
      );
      return reply.send(policy);
    } catch {
      return reply.status(500).send({ error: "Failed to approve COD policy" });
    }
  });
}
