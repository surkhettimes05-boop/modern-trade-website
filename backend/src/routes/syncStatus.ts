import { FastifyInstance } from "fastify";
import { z } from "zod";
import { SyncStatusService } from "../services/syncStatusService.js";

const syncStatusService = new SyncStatusService();

export async function syncStatusRoutes(fastify: FastifyInstance) {
  // Sync Status: Get device sync status
  fastify.get("/sync-status/devices/:deviceId", async (request, reply) => {
    const schema = z.object({
      deviceId: z.string(),
    });

    const { deviceId } = schema.parse(request.params);

    try {
      const status = await syncStatusService.getDeviceSyncStatus(deviceId);
      return reply.send(status);
    } catch (error) {
      if (error instanceof Error && error.message === "Device not found") {
        return reply.status(404).send({ error: "Device not found" });
      }
      return reply
        .status(500)
        .send({ error: "Failed to get device sync status" });
    }
  });

  // Sync Status: Get store device sync status
  fastify.get(
    "/sync-status/stores/:storeId/devices",
    async (request, reply) => {
      const schema = z.object({
        storeId: z.string().uuid(),
      });

      const { storeId } = schema.parse(request.params);

      try {
        const statuses =
          await syncStatusService.getStoreDeviceSyncStatus(storeId);
        return reply.send(statuses);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get store device sync status" });
      }
    },
  );

  // Sync Status: Get all stores sync status
  fastify.get("/sync-status/stores", async (_request, reply) => {
    try {
      const summaries = await syncStatusService.getAllStoresSyncStatus();
      return reply.send(summaries);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get stores sync status" });
    }
  });

  // Sync Status: Get global sync summary
  fastify.get("/sync-status/summary", async (_request, reply) => {
    try {
      const summary = await syncStatusService.getGlobalSyncSummary();
      return reply.send(summary);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get global sync summary" });
    }
  });

  // Sync Status: Get recent sync activity
  fastify.get("/sync-status/activity", async (request, reply) => {
    const schema = z.object({
      limit: z.coerce.number().optional(),
    });

    const { limit = 50 } = schema.parse(request.query);

    try {
      const activity = await syncStatusService.getRecentSyncActivity(limit);
      return reply.send(activity);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get recent sync activity" });
    }
  });

  // Sync Status: Get active conflicts
  fastify.get("/sync-status/conflicts", async (request, reply) => {
    const schema = z.object({
      limit: z.coerce.number().optional(),
    });

    const { limit = 50 } = schema.parse(request.query);

    try {
      const conflicts = await syncStatusService.getActiveConflicts(limit);
      return reply.send(conflicts);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get active conflicts" });
    }
  });

  // Sync Status: Get devices with issues
  fastify.get("/sync-status/devices/issues", async (_request, reply) => {
    try {
      const devices = await syncStatusService.getDevicesWithIssues();
      return reply.send(devices);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get devices with issues" });
    }
  });
}
