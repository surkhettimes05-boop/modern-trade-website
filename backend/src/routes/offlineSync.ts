import { FastifyInstance } from "fastify";
import { z } from "zod";
import { OfflineSyncService } from "../services/offlineSyncService.js";
import { query } from "../database/connection.js";

const offlineSyncService = new OfflineSyncService();

export async function offlineSyncRoutes(fastify: FastifyInstance) {
  // Device: Register device
  fastify.post("/offline-sync/devices", async (request, reply) => {
    const schema = z.object({
      device_id: z.string(),
      device_name: z.string().optional(),
      device_type: z.enum(["POS", "HANDHELD", "TABLET", "KIOSK"]),
      store_id: z.string().uuid(),
      serial_number: z.string().optional(),
      mac_address: z.string().optional(),
      os_version: z.string().optional(),
      app_version: z.string().optional(),
      configuration: z.any().optional(),
    });

    const deviceData = schema.parse(request.body);

    try {
      const device = await offlineSyncService.registerDevice(deviceData);
      return reply.send(device);
    } catch {
      return reply.status(500).send({ error: "Failed to register device" });
    }
  });

  // Device: Get device
  fastify.get("/offline-sync/devices/:deviceId", async (request, reply) => {
    const schema = z.object({
      deviceId: z.string(),
    });

    const { deviceId } = schema.parse(request.params);

    try {
      const device = await offlineSyncService.getDevice(deviceId);
      if (!device) {
        return reply.status(404).send({ error: "Device not found" });
      }
      return reply.send(device);
    } catch {
      return reply.status(500).send({ error: "Failed to get device" });
    }
  });

  // Device: Update last seen
  fastify.post(
    "/offline-sync/devices/:deviceId/heartbeat",
    async (request, reply) => {
      const schema = z.object({
        deviceId: z.string(),
      });

      const { deviceId } = schema.parse(request.params);

      try {
        await offlineSyncService.updateDeviceLastSeen(deviceId);
        return reply.send({ success: true });
      } catch {
        return reply.status(500).send({ error: "Failed to update last seen" });
      }
    },
  );

  // Transaction: Add to queue
  fastify.post("/offline-sync/transactions", async (request, reply) => {
    const schema = z.object({
      device_id: z.string(),
      store_id: z.string().uuid(),
      transaction_type: z.enum(["SALE", "RETURN", "PAYMENT", "CUSTOMER"]),
      local_sequence_number: z.number(),
      original_occurrence_timestamp: z.coerce.date(),
      device_clock_timestamp: z.coerce.date(),
      reference_data_versions: z.any(),
      transaction_data: z.any(),
    });

    const transactionData = schema.parse(request.body);

    try {
      const id = await offlineSyncService.addTransaction({
        ...transactionData,
        local_sequence_number: BigInt(transactionData.local_sequence_number),
      });
      return reply.status(201).send({ id });
    } catch {
      return reply.status(500).send({ error: "Failed to add transaction" });
    }
  });

  // Transaction: Get pending transactions
  fastify.get("/offline-sync/transactions/pending", async (request, reply) => {
    const schema = z.object({
      device_id: z.string(),
      limit: z.coerce.number().optional(),
    });

    const { device_id, limit = 100 } = schema.parse(request.query);

    try {
      const transactions = await offlineSyncService.getPendingTransactions(
        device_id,
        limit,
      );
      return reply.send(transactions);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get pending transactions" });
    }
  });

  // Sync: Create batch
  fastify.post("/offline-sync/batches", async (request, reply) => {
    const schema = z.object({
      device_id: z.string(),
      transaction_ids: z.array(z.string().uuid()),
    });

    const { device_id, transaction_ids } = schema.parse(request.body);

    try {
      const batchId = await offlineSyncService.createSyncBatch(
        device_id,
        transaction_ids,
      );
      return reply.status(201).send({ batch_id: batchId });
    } catch {
      return reply.status(500).send({ error: "Failed to create batch" });
    }
  });

  // Sync: Process batch
  fastify.post(
    "/offline-sync/batches/:batchId/process",
    async (request, reply) => {
      const schema = z.object({
        batchId: z.string(),
      });

      const { batchId } = schema.parse(request.params);

      try {
        const result = await offlineSyncService.processSyncBatch(batchId);
        return reply.send(result);
      } catch {
        return reply.status(500).send({ error: "Failed to process batch" });
      }
    },
  );

  // Sync: Get device sync status
  fastify.get("/offline-sync/status/:deviceId", async (request, reply) => {
    const schema = z.object({
      deviceId: z.string(),
    });

    const { deviceId } = schema.parse(request.params);

    try {
      const status = await offlineSyncService.getDeviceSyncStatus(deviceId);
      return reply.send(status);
    } catch {
      return reply.status(500).send({ error: "Failed to get sync status" });
    }
  });

  // Sync: Retry failed transactions
  fastify.post("/offline-sync/retry/:deviceId", async (request, reply) => {
    const schema = z.object({
      deviceId: z.string(),
    });

    const { deviceId } = schema.parse(request.params);

    try {
      const count = await offlineSyncService.retryFailedTransactions(deviceId);
      return reply.send({ retried_count: count });
    } catch {
      return reply.status(500).send({ error: "Failed to retry transactions" });
    }
  });

  // Conflict: Resolve conflict
  fastify.post(
    "/offline-sync/conflicts/:transactionId/resolve",
    async (request, reply) => {
      const paramsSchema = z.object({
        transactionId: z.string().uuid(),
      });

      const bodySchema = z.object({
        resolution: z.enum(["IGNORE", "OVERRIDE", "MERGE", "MANUAL"]),
        resolved_by: z.string(),
        notes: z.string().optional(),
      });

      const { transactionId } = paramsSchema.parse(request.params);
      const { resolution, resolved_by, notes } = bodySchema.parse(request.body);

      try {
        await offlineSyncService.resolveConflict(
          transactionId,
          resolution,
          resolved_by,
          notes,
        );
        return reply.send({ success: true });
      } catch {
        return reply.status(500).send({ error: "Failed to resolve conflict" });
      }
    },
  );

  // Conflict: Get conflicts for device
  fastify.get("/offline-sync/conflicts/:deviceId", async (request, reply) => {
    const schema = z.object({
      deviceId: z.string(),
    });

    const { deviceId } = schema.parse(request.params);

    try {
      const result = await query(
        `SELECT * FROM offline_transaction_queue
         WHERE device_id = $1 AND conflict_detected = TRUE
         ORDER BY original_occurrence_timestamp DESC`,
        [deviceId],
      );
      return reply.send(result.rows);
    } catch {
      return reply.status(500).send({ error: "Failed to get conflicts" });
    }
  });
}
