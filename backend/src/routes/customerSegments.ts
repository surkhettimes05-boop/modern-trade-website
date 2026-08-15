import { FastifyInstance } from "fastify";
import { z } from "zod";
import { customerSegmentationService } from "../services/customerSegmentationService.js";

export async function customerSegmentRoutes(fastify: FastifyInstance) {
  // Segments: Create segment
  fastify.post("/customer-segments", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid(),
      name: z.string(),
      description: z.string().optional(),
      rules: z.any(),
      created_by: z.string().optional(),
      metadata: z.any().optional(),
    });

    const segmentData = schema.parse(request.body);

    try {
      const segment =
        await customerSegmentationService.createSegment(segmentData);
      return reply.status(201).send(segment);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to create customer segment" });
    }
  });

  // Segments: Get segment
  fastify.get("/customer-segments/:segmentId", async (request, reply) => {
    const schema = z.object({
      segmentId: z.string(),
    });

    const { segmentId } = schema.parse(request.params);

    try {
      const segment = await customerSegmentationService.getSegment(segmentId);
      if (!segment) {
        return reply.status(404).send({ error: "Customer segment not found" });
      }
      return reply.send(segment);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get customer segment" });
    }
  });

  // Segments: Get active segments for store
  fastify.get(
    "/customer-segments/store/:storeId/active",
    async (request, reply) => {
      const schema = z.object({
        storeId: z.string().uuid(),
      });

      const { storeId } = schema.parse(request.params);

      try {
        const segments =
          await customerSegmentationService.getActiveSegmentsForStore(storeId);
        return reply.send(segments);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get active customer segments" });
      }
    },
  );

  // Segments: Calculate memberships
  fastify.post(
    "/customer-segments/:segmentId/calculate",
    async (request, reply) => {
      const schema = z.object({
        segmentId: z.string(),
      });

      const { segmentId } = schema.parse(request.params);

      try {
        await customerSegmentationService.calculateSegmentMemberships(
          segmentId,
        );
        return reply.send({ success: true });
      } catch (error) {
        if (error instanceof Error && error.message === "Segment not found") {
          return reply.status(404).send({ error: error.message });
        }
        return reply
          .status(500)
          .send({ error: "Failed to calculate segment memberships" });
      }
    },
  );

  // Segments: Get customer segments
  fastify.get(
    "/customer-segments/customer/:customerId",
    async (request, reply) => {
      const schema = z.object({
        customerId: z.string().uuid(),
      });

      const { customerId } = schema.parse(request.params);

      try {
        const segments =
          await customerSegmentationService.getCustomerSegments(customerId);
        return reply.send(segments);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get customer segments" });
      }
    },
  );

  // Segments: Get segment members
  fastify.get(
    "/customer-segments/:segmentId/members",
    async (request, reply) => {
      const schema = z.object({
        segmentId: z.string(),
        limit: z.coerce.number().int().positive().optional(),
      });

      const { segmentId, limit = 100 } = schema.parse(request.params);

      try {
        const members = await customerSegmentationService.getSegmentMembers(
          segmentId,
          limit,
        );
        return reply.send(members);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get segment members" });
      }
    },
  );

  // Segments: Update status
  fastify.put(
    "/customer-segments/:segmentId/status",
    async (request, reply) => {
      const paramsSchema = z.object({
        segmentId: z.string(),
      });

      const bodySchema = z.object({
        is_active: z.boolean(),
      });

      const { segmentId } = paramsSchema.parse(request.params);
      const { is_active } = bodySchema.parse(request.body);

      try {
        const segment = await customerSegmentationService.updateSegmentStatus(
          segmentId,
          is_active,
        );
        return reply.send(segment);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to update segment status" });
      }
    },
  );
}
