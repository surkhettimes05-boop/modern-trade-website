import { FastifyInstance } from "fastify";
import { z } from "zod";
import { loyaltyService } from "../services/loyaltyService.js";

export async function loyaltyRoutes(fastify: FastifyInstance) {
  // Loyalty: Create program
  fastify.post("/loyalty/programs", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid(),
      name: z.string(),
      description: z.string().optional(),
      points_per_currency: z.number().optional(),
      currency_value_per_point: z.number().optional(),
      enable_tiers: z.boolean().optional(),
      tier_config: z.any().optional(),
      start_date: z.coerce.date().optional(),
      end_date: z.coerce.date().optional(),
      created_by: z.string().optional(),
      metadata: z.any().optional(),
    });

    const programData = schema.parse(request.body);

    try {
      const program = await loyaltyService.createProgram(programData);
      return reply.status(201).send(program);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to create loyalty program" });
    }
  });

  // Loyalty: Get program
  fastify.get("/loyalty/programs/:programId", async (request, reply) => {
    const schema = z.object({
      programId: z.string(),
    });

    const { programId } = schema.parse(request.params);

    try {
      const program = await loyaltyService.getProgram(programId);
      if (!program) {
        return reply.status(404).send({ error: "Loyalty program not found" });
      }
      return reply.send(program);
    } catch {
      return reply.status(500).send({ error: "Failed to get loyalty program" });
    }
  });

  // Loyalty: Get active program for store
  fastify.get(
    "/loyalty/programs/store/:storeId/active",
    async (request, reply) => {
      const schema = z.object({
        storeId: z.string().uuid(),
      });

      const { storeId } = schema.parse(request.params);

      try {
        const program = await loyaltyService.getActiveProgramForStore(storeId);
        if (!program) {
          return reply
            .status(404)
            .send({ error: "No active loyalty program found" });
        }
        return reply.send(program);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get active loyalty program" });
      }
    },
  );

  // Loyalty: Enroll customer
  fastify.post("/loyalty/accounts", async (request, reply) => {
    const schema = z.object({
      customer_id: z.string().uuid(),
      program_id: z.string().uuid(),
      created_by: z.string().optional(),
      metadata: z.any().optional(),
    });

    const enrollmentData = schema.parse(request.body);

    try {
      const account = await loyaltyService.enrollCustomer(enrollmentData);
      return reply.status(201).send(account);
    } catch {
      return reply.status(500).send({ error: "Failed to enroll customer" });
    }
  });

  // Loyalty: Get customer account
  fastify.get(
    "/loyalty/accounts/customer/:customerId/program/:programId",
    async (request, reply) => {
      const schema = z.object({
        customerId: z.string().uuid(),
        programId: z.string().uuid(),
      });

      const { customerId, programId } = schema.parse(request.params);

      try {
        const account = await loyaltyService.getCustomerAccount(
          customerId,
          programId,
        );
        if (!account) {
          return reply.status(404).send({ error: "Loyalty account not found" });
        }
        return reply.send(account);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get loyalty account" });
      }
    },
  );

  // Loyalty: Earn points
  fastify.post("/loyalty/accounts/:accountId/earn", async (request, reply) => {
    const paramsSchema = z.object({
      accountId: z.string().uuid(),
    });

    const bodySchema = z.object({
      points: z.number().int().positive(),
      reference_type: z.string().optional(),
      reference_id: z.string().optional(),
      description: z.string().optional(),
      created_by: z.string().optional(),
      metadata: z.any().optional(),
    });

    const { accountId } = paramsSchema.parse(request.params);
    const earnData = bodySchema.parse(request.body);

    try {
      const transaction = await loyaltyService.earnPoints(
        accountId,
        earnData.points,
        earnData,
      );
      return reply.send(transaction);
    } catch (error) {
      if (error instanceof Error && error.message === "Account not found") {
        return reply.status(404).send({ error: error.message });
      }
      return reply.status(500).send({ error: "Failed to earn points" });
    }
  });

  // Loyalty: Redeem points
  fastify.post(
    "/loyalty/accounts/:accountId/redeem",
    async (request, reply) => {
      const paramsSchema = z.object({
        accountId: z.string().uuid(),
      });

      const bodySchema = z.object({
        points: z.number().int().positive(),
        reference_type: z.string().optional(),
        reference_id: z.string().optional(),
        description: z.string().optional(),
        created_by: z.string().optional(),
        metadata: z.any().optional(),
      });

      const { accountId } = paramsSchema.parse(request.params);
      const redeemData = bodySchema.parse(request.body);

      try {
        const transaction = await loyaltyService.redeemPoints(
          accountId,
          redeemData.points,
          redeemData,
        );
        return reply.send(transaction);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "Account not found") {
            return reply.status(404).send({ error: error.message });
          }
          if (error.message === "Insufficient points") {
            return reply.status(400).send({ error: error.message });
          }
        }
        return reply.status(500).send({ error: "Failed to redeem points" });
      }
    },
  );

  // Loyalty: Get point transactions
  fastify.get(
    "/loyalty/accounts/:accountId/transactions",
    async (request, reply) => {
      const schema = z.object({
        accountId: z.string().uuid(),
        limit: z.coerce.number().int().positive().optional(),
      });

      const { accountId, limit = 50 } = schema.parse(request.params);

      try {
        const transactions = await loyaltyService.getPointTransactions(
          accountId,
          limit,
        );
        return reply.send(transactions);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get point transactions" });
      }
    },
  );

  // Loyalty: Calculate points for order
  fastify.get(
    "/loyalty/programs/:programId/calculate-points",
    async (request, reply) => {
      const schema = z.object({
        programId: z.string(),
        order_amount: z.coerce.number().positive(),
      });

      const { programId, order_amount } = schema.parse(request.params);

      try {
        const points = await loyaltyService.calculatePointsForOrder(
          order_amount,
          programId,
        );
        return reply.send({ points });
      } catch (error) {
        if (error instanceof Error && error.message === "Program not found") {
          return reply.status(404).send({ error: error.message });
        }
        return reply.status(500).send({ error: "Failed to calculate points" });
      }
    },
  );

  // Loyalty: Get account summary
  fastify.get(
    "/loyalty/accounts/:accountId/summary",
    async (request, reply) => {
      const schema = z.object({
        accountId: z.string().uuid(),
      });

      const { accountId } = schema.parse(request.params);

      try {
        const summary = await loyaltyService.getAccountSummary(accountId);
        return reply.send(summary);
      } catch (error) {
        if (error instanceof Error && error.message === "Account not found") {
          return reply.status(404).send({ error: error.message });
        }
        return reply
          .status(500)
          .send({ error: "Failed to get account summary" });
      }
    },
  );
}
