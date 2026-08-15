import { FastifyInstance } from "fastify";
import { z } from "zod";
import { OfflineQueueService } from "../services/offlineQueueService.js";

const offlineQueueService = new OfflineQueueService();

export async function offlineRoutes(fastify: FastifyInstance) {
  // Offline: Add entry to queue
  fastify.post("/queue", async (request, reply) => {
    const schema = z.object({
      customer_id: z.string().uuid().optional(),
      store_id: z.string().uuid().optional(),
      sale_data: z.any(),
      points_calculated: z.number(),
      device_id: z.string().optional(),
      local_sale_id: z.string().optional(),
    });

    try {
      const body = schema.parse(request.body);
      const entry = await offlineQueueService.addEntry(body);
      return entry;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      reply.status(500);
      return { error: "Failed to add entry to queue" };
    }
  });

  // Offline: Get pending entries
  fastify.get("/queue/pending", async (request, reply) => {
    const { device_id } = request.query as { device_id?: string };

    try {
      const entries = await offlineQueueService.getPendingEntries(device_id);
      return entries;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch pending entries" };
    }
  });

  // Offline: Sync single entry
  fastify.post("/queue/:id/sync", async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const result = await offlineQueueService.syncEntry(id);
      return result;
    } catch {
      reply.status(500);
      return { error: "Failed to sync entry" };
    }
  });

  // Offline: Sync all entries for a device
  fastify.post("/sync/:device_id", async (request, reply) => {
    const { device_id } = request.params as { device_id: string };

    try {
      const result = await offlineQueueService.syncDevice(device_id);
      return result;
    } catch {
      reply.status(500);
      return { error: "Failed to sync device" };
    }
  });

  // Offline: Get queue statistics
  fastify.get("/queue/stats", async (request, reply) => {
    const { device_id } = request.query as { device_id?: string };

    try {
      const stats = await offlineQueueService.getQueueStats(device_id);
      return stats;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch queue statistics" };
    }
  });

  // Offline: Mark failed entries
  fastify.post("/queue/mark-failed", async (_request, reply) => {
    try {
      const count = await offlineQueueService.markFailedEntries();
      return { success: true, marked: count };
    } catch {
      reply.status(500);
      return { error: "Failed to mark failed entries" };
    }
  });

  // Offline: Cleanup old entries
  fastify.post("/queue/cleanup", async (request, reply) => {
    const { days_old } = request.query as { days_old?: string };

    try {
      const count = await offlineQueueService.cleanupOldUploadedEntries(
        days_old ? parseInt(days_old) : 30,
      );
      return { success: true, cleaned: count };
    } catch {
      reply.status(500);
      return { error: "Failed to cleanup queue" };
    }
  });

  // Offline: Get entry by local sale ID
  fastify.get("/queue/local/:local_sale_id", async (request, reply) => {
    const { local_sale_id } = request.params as { local_sale_id: string };
    const { device_id } = request.query as { device_id: string };

    if (!device_id) {
      reply.status(400);
      return { error: "device_id is required" };
    }

    try {
      const entry = await offlineQueueService.getByLocalSaleId(
        local_sale_id,
        device_id,
      );
      if (!entry) {
        reply.status(404);
        return { error: "Entry not found" };
      }
      return entry;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch entry" };
    }
  });

  // Offline: Delete entry
  fastify.delete("/queue/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const deleted = await offlineQueueService.deleteEntry(id);
      if (!deleted) {
        reply.status(404);
        return { error: "Entry not found" };
      }
      return { success: true };
    } catch {
      reply.status(500);
      return { error: "Failed to delete entry" };
    }
  });
}
