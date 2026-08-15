import { FastifyInstance } from "fastify";
import { z } from "zod";
import { unifiedLoyaltyService } from "../services/unifiedLoyaltyService.js";

export async function unifiedLoyaltyRoutes(fastify: FastifyInstance) {
  // Unified Loyalty: Record transaction
  fastify.post("/unified-loyalty/transactions", async (request, reply) => {
    const schema = z.object({
      channel: z.enum(["POS", "WEB", "MOBILE", "API"]),
      channel_reference_id: z.string().optional(),
      device_id: z.string().uuid().optional(),
      customer_id: z.string().uuid(),
      transaction_type: z.enum([
        "EARN",
        "REDEEM",
        "EXPIRE",
        "ADJUST",
        "REFUND",
      ]),
      points: z.number(),
      reference_type: z.string().optional(),
      reference_id: z.string().optional(),
      amount: z.number().optional(),
      description: z.string().optional(),
      created_by: z.string().optional(),
      metadata: z.any().optional(),
    });

    const transactionData = schema.parse(request.body);

    try {
      const transaction =
        await unifiedLoyaltyService.recordTransaction(transactionData);
      return reply.status(201).send(transaction);
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.message === "Customer home store not found" ||
          error.message === "No active loyalty program found"
        ) {
          return reply.status(400).send({ error: error.message });
        }
      }
      return reply
        .status(500)
        .send({ error: "Failed to record loyalty transaction" });
    }
  });

  // Unified Loyalty: Get customer transactions
  fastify.get(
    "/unified-loyalty/transactions/customer/:customerId",
    async (request, reply) => {
      const schema = z.object({
        customerId: z.string().uuid(),
        limit: z.coerce.number().int().positive().optional(),
      });

      const { customerId, limit = 50 } = schema.parse(request.params);

      try {
        const transactions =
          await unifiedLoyaltyService.getCustomerTransactions(
            customerId,
            limit,
          );
        return reply.send(transactions);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get customer transactions" });
      }
    },
  );

  // Unified Loyalty: Get transactions by channel
  fastify.get(
    "/unified-loyalty/transactions/channel/:channel",
    async (request, reply) => {
      const schema = z.object({
        channel: z.enum(["POS", "WEB", "MOBILE", "API"]),
        limit: z.coerce.number().int().positive().optional(),
      });

      const { channel, limit = 100 } = schema.parse(request.params);

      try {
        const transactions =
          await unifiedLoyaltyService.getTransactionsByChannel(channel, limit);
        return reply.send(transactions);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get channel transactions" });
      }
    },
  );

  // Unified Loyalty: Link channel
  fastify.post("/unified-loyalty/channel-mappings", async (request, reply) => {
    const schema = z.object({
      customer_id: z.string().uuid(),
      channel: z.enum(["POS", "WEB", "MOBILE"]),
      channel_customer_id: z.string(),
      is_primary: z.boolean().optional(),
      metadata: z.any().optional(),
    });

    const linkData = schema.parse(request.body);

    try {
      const mapping = await unifiedLoyaltyService.linkChannel(linkData);
      return reply.status(201).send(mapping);
    } catch {
      return reply.status(500).send({ error: "Failed to link channel" });
    }
  });

  // Unified Loyalty: Get account by channel
  fastify.get(
    "/unified-loyalty/account/channel/:channel/customer/:channelCustomerId",
    async (request, reply) => {
      const schema = z.object({
        channel: z.enum(["POS", "WEB", "MOBILE"]),
        channelCustomerId: z.string(),
      });

      const { channel, channelCustomerId } = schema.parse(request.params);

      try {
        const account = await unifiedLoyaltyService.getAccountByChannel(
          channel,
          channelCustomerId,
        );
        if (!account) {
          return reply.status(404).send({ error: "Account not found" });
        }
        return reply.send(account);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get account by channel" });
      }
    },
  );

  // Unified Loyalty: Get statistics
  fastify.get("/unified-loyalty/statistics", async (request, reply) => {
    const schema = z.object({
      channel: z.enum(["POS", "WEB", "MOBILE", "API"]).optional(),
      start_date: z.coerce.date().optional(),
      end_date: z.coerce.date().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const stats = await unifiedLoyaltyService.getUnifiedStatistics(filters);
      return reply.send(stats);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get unified statistics" });
    }
  });

  // Unified Loyalty: Sync balance across channels
  fastify.post(
    "/unified-loyalty/sync-balance/:customerId",
    async (request, reply) => {
      const schema = z.object({
        customerId: z.string().uuid(),
      });

      const { customerId } = schema.parse(request.params);

      try {
        await unifiedLoyaltyService.syncBalanceAcrossChannels(customerId);
        return reply.send({ success: true });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Loyalty account not found"
        ) {
          return reply.status(404).send({ error: error.message });
        }
        return reply.status(500).send({ error: "Failed to sync balance" });
      }
    },
  );
}
