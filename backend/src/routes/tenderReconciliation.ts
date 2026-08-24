import { FastifyInstance } from "fastify";
import { z } from "zod";
import { TenderReconciliationService } from "../services/tenderReconciliationService.js";

const tenderReconciliationService = new TenderReconciliationService();

export async function tenderReconciliationRoutes(fastify: FastifyInstance) {
  // Tender Reconciliation: Create reconciliation
  fastify.post("/tender-reconciliations", async (request, reply) => {
    const schema = z.object({
      shift_id: z.string().uuid(),
      store_id: z.string().uuid(),
      device_id: z.string().optional(),
      reconciled_by: z.string(),
      tender_breakdown: z
        .array(
          z.object({
            tender_type: z.string(),
            expected_amount: z.number(),
            counted_amount: z.number(),
            notes: z.string().optional(),
          }),
        )
        .min(1),
      notes: z.string().optional(),
      metadata: z.any().optional(),
    });

    const reconciliationData = schema.parse(request.body);

    try {
      const reconciliation =
        await tenderReconciliationService.createTenderReconciliation(
          reconciliationData,
        );
      return reply.status(201).send(reconciliation);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to create tender reconciliation" });
    }
  });

  // Tender Reconciliation: Get reconciliation by ID
  fastify.get(
    "/tender-reconciliations/:reconciliationId",
    async (request, reply) => {
      const schema = z.object({
        reconciliationId: z.string().uuid(),
      });

      const { reconciliationId } = schema.parse(request.params);

      try {
        const reconciliation =
          await tenderReconciliationService.getReconciliation(reconciliationId);
        if (!reconciliation) {
          return reply.status(404).send({ error: "Reconciliation not found" });
        }
        return reply.send(reconciliation);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get reconciliation" });
      }
    },
  );

  // Tender Reconciliation: Get reconciliation by number
  fastify.get(
    "/tender-reconciliations/number/:reconciliationNumber",
    async (request, reply) => {
      const schema = z.object({
        reconciliationNumber: z.string(),
      });

      const { reconciliationNumber } = schema.parse(request.params);

      try {
        const reconciliation =
          await tenderReconciliationService.getReconciliationByNumber(
            reconciliationNumber,
          );
        if (!reconciliation) {
          return reply.status(404).send({ error: "Reconciliation not found" });
        }
        return reply.send(reconciliation);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get reconciliation" });
      }
    },
  );

  // Tender Reconciliation: Get all reconciliations
  fastify.get("/tender-reconciliations", async (request, reply) => {
    const schema = z.object({
      shift_id: z.string().uuid().optional(),
      store_id: z.string().uuid().optional(),
      device_id: z.string().optional(),
      status: z.enum(["MATCHED", "DISCREPANCY", "RESOLVED"]).optional(),
      date_from: z.coerce.date().optional(),
      date_to: z.coerce.date().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).max(100_000).default(0),
    });

    const filters = schema.parse(request.query);

    try {
      const reconciliations =
        await tenderReconciliationService.getReconciliations(filters);
      return reply.send(reconciliations);
    } catch {
      return reply.status(500).send({ error: "Failed to get reconciliations" });
    }
  });

  // Tender Reconciliation: Get reconciliation items
  fastify.get(
    "/tender-reconciliations/:reconciliationId/items",
    async (request, reply) => {
      const schema = z.object({
        reconciliationId: z.string().uuid(),
      });

      const { reconciliationId } = schema.parse(request.params);

      try {
        const items =
          await tenderReconciliationService.getReconciliationItems(
            reconciliationId,
          );
        return reply.send(items);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get reconciliation items" });
      }
    },
  );

  // Tender Reconciliation: Calculate expected tenders from shift
  fastify.get(
    "/tender-reconciliations/shift/:shiftId/expected",
    async (request, reply) => {
      const schema = z.object({
        shiftId: z.string().uuid(),
      });

      const { shiftId } = schema.parse(request.params);

      try {
        const expectedTenders =
          await tenderReconciliationService.calculateExpectedTenders(shiftId);
        return reply.send(expectedTenders);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to calculate expected tenders" });
      }
    },
  );

  // Tender Reconciliation: Update reconciliation status
  fastify.put(
    "/tender-reconciliations/:reconciliationId/status",
    async (request, reply) => {
      const paramsSchema = z.object({
        reconciliationId: z.string().uuid(),
      });

      const bodySchema = z.object({
        status: z.enum(["MATCHED", "DISCREPANCY", "RESOLVED"]),
        notes: z.string().optional(),
      });

      const { reconciliationId } = paramsSchema.parse(request.params);
      const { status, notes } = bodySchema.parse(request.body);

      try {
        const reconciliation =
          await tenderReconciliationService.updateReconciliationStatus(
            reconciliationId,
            status,
            notes,
          );
        return reply.send(reconciliation);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to update reconciliation status" });
      }
    },
  );

  // Tender Reconciliation: Resolve discrepancy
  fastify.post(
    "/tender-reconciliations/:reconciliationId/resolve",
    async (request, reply) => {
      const paramsSchema = z.object({
        reconciliationId: z.string().uuid(),
      });

      const bodySchema = z.object({
        resolution: z.string(),
        resolved_by: z.string(),
        notes: z.string().optional(),
      });

      const { reconciliationId } = paramsSchema.parse(request.params);
      const { resolution, resolved_by, notes } = bodySchema.parse(request.body);

      try {
        const reconciliation =
          await tenderReconciliationService.resolveDiscrepancy(
            reconciliationId,
            resolution,
            resolved_by,
            notes,
          );
        return reply.send(reconciliation);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to resolve discrepancy" });
      }
    },
  );

  // Tender Reconciliation: Get summary
  fastify.get("/tender-reconciliations/summary", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
      device_id: z.string().optional(),
      date_from: z.coerce.date().optional(),
      date_to: z.coerce.date().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const summary =
        await tenderReconciliationService.getReconciliationSummary(filters);
      return reply.send(summary);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get reconciliation summary" });
    }
  });
}
