import { FastifyInstance } from "fastify";
import { z } from "zod";
import { LedgerService } from "../services/ledgerService.js";
import { EarnLotsService } from "../services/earnLotsService.js";

const ledgerService = new LedgerService();
const earnLotsService = new EarnLotsService();

export async function ledgerRoutes(fastify: FastifyInstance) {
  // Admin: Create ledger entry
  fastify.post("/", async (request, reply) => {
    const schema = z.object({
      customer_id: z.string().uuid(),
      points_signed: z.number(),
      entry_type: z.enum(["EARN", "REDEEM", "EXPIRE", "ADJUST", "REVERSAL"]),
      effective_timestamp: z.string().or(z.date()),
      source_type: z.string(),
      source_id: z.string().uuid().optional(),
      location_id: z.string().uuid().optional(),
      rule_id: z.string().uuid().optional(),
      rule_version: z.number().optional(),
      idempotency_key: z.string().optional(),
      actor: z.string(),
      reason: z.string().optional(),
      reversal_of_id: z.string().uuid().optional(),
      reversal_reason: z.string().optional(),
      calculation_metadata: z.any().optional(),
    });

    try {
      const body = schema.parse(request.body);

      const entry = await ledgerService.createEntry({
        ...body,
        effective_timestamp:
          typeof body.effective_timestamp === "string"
            ? new Date(body.effective_timestamp)
            : body.effective_timestamp,
      });

      return entry;
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
      return { error: "Failed to create ledger entry" };
    }
  });

  // Public: Get customer ledger
  fastify.get("/customer/:customer_id", async (request, reply) => {
    const { customer_id } = request.params as { customer_id: string };
    const { limit, offset } = request.query as {
      limit?: string;
      offset?: string;
    };

    try {
      const ledger = await ledgerService.getCustomerLedger(
        customer_id,
        limit ? parseInt(limit) : 100,
        offset ? parseInt(offset) : 0,
      );
      return ledger;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch ledger" };
    }
  });

  // Public: Get customer balance
  fastify.get("/customer/:customer_id/balance", async (request, reply) => {
    const { customer_id } = request.params as { customer_id: string };

    try {
      const balance = await ledgerService.calculateBalance(customer_id);
      return balance;
    } catch {
      reply.status(500);
      return { error: "Failed to calculate balance" };
    }
  });

  // Public: Get customer earn lots
  fastify.get("/customer/:customer_id/earn-lots", async (request, reply) => {
    const { customer_id } = request.params as { customer_id: string };
    const { include_expired } = request.query as { include_expired?: string };

    try {
      const earnLots = await earnLotsService.getCustomerEarnLots(
        customer_id,
        include_expired === "true",
      );
      return earnLots;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch earn lots" };
    }
  });

  // Public: Get expiring points
  fastify.get("/customer/:customer_id/expiring", async (request, reply) => {
    const { customer_id } = request.params as { customer_id: string };
    const { days } = request.query as { days?: string };

    try {
      const expiring = await earnLotsService.getExpiringPoints(
        customer_id,
        days ? parseInt(days) : 30,
      );
      return expiring;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch expiring points" };
    }
  });

  // Admin: Get ledger entry by source
  fastify.get("/source/:source_type/:source_id", async (request, reply) => {
    const { source_type, source_id } = request.params as {
      source_type: string;
      source_id: string;
    };

    try {
      const entries = await ledgerService.getBySource(source_type, source_id);
      return entries;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch ledger entries" };
    }
  });

  // Admin: Get reversal chain
  fastify.get("/reversal/:entry_id", async (request, reply) => {
    const { entry_id } = request.params as { entry_id: string };

    try {
      const chain = await ledgerService.getReversalChain(entry_id);
      return chain;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch reversal chain" };
    }
  });

  // Admin: Reconcile balance
  fastify.post("/customer/:customer_id/reconcile", async (request, reply) => {
    const { customer_id } = request.params as { customer_id: string };

    try {
      const reconciliation = await ledgerService.reconcileBalance(customer_id);
      return reconciliation;
    } catch {
      reply.status(500);
      return { error: "Failed to reconcile balance" };
    }
  });

  // Admin: Validate ledger integrity
  fastify.post("/customer/:customer_id/validate", async (request, reply) => {
    const { customer_id } = request.params as { customer_id: string };

    try {
      const validation =
        await ledgerService.validateLedgerIntegrity(customer_id);
      return validation;
    } catch {
      reply.status(500);
      return { error: "Failed to validate ledger" };
    }
  });

  // Admin: Process expiry (scheduled job)
  fastify.post("/process-expiry", async (_request, reply) => {
    try {
      const count = await earnLotsService.processExpiry();
      return { success: true, processed: count };
    } catch {
      reply.status(500);
      return { error: "Failed to process expiry" };
    }
  });

  // Admin: Ledger statistics
  fastify.get("/stats", async (request, reply) => {
    const { customer_id } = request.query as { customer_id?: string };

    try {
      const stats = await ledgerService.getLedgerStats(customer_id);
      return stats;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch ledger statistics" };
    }
  });

  // Admin: Earn lots statistics
  fastify.get("/earn-lots/stats", async (request, reply) => {
    const { customer_id } = request.query as { customer_id?: string };

    try {
      const stats = await earnLotsService.getEarnLotsStats(customer_id);
      return stats;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch earn lots statistics" };
    }
  });
}
