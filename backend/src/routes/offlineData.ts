import { FastifyInstance } from "fastify";
import { z } from "zod";
import { offlineDataService } from "../services/offlineDataService.js";

export async function offlineDataRoutes(fastify: FastifyInstance) {
  // Offline Data: Create snapshot
  fastify.post("/offline-data/snapshots", async (request, reply) => {
    const schema = z.object({
      device_id: z.string().uuid(),
      snapshot_type: z.enum([
        "FULL",
        "INCREMENTAL",
        "PRODUCTS",
        "CUSTOMERS",
        "PRICES",
      ]),
      data_version: z.number().optional(),
      record_count: z.number().optional(),
      created_by: z.string().optional(),
      metadata: z.any().optional(),
    });

    const snapshotData = schema.parse(request.body);

    try {
      const snapshot = await offlineDataService.createSnapshot(snapshotData);
      return reply.status(201).send(snapshot);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to create data snapshot" });
    }
  });

  // Offline Data: Update snapshot
  fastify.put("/offline-data/snapshots/:snapshotId", async (request, reply) => {
    const paramsSchema = z.object({
      snapshotId: z.string(),
    });

    const bodySchema = z.object({
      data_hash: z.string(),
      data_size_bytes: z.number(),
      record_count: z.number(),
      status: z.enum(["PENDING", "COMPLETED", "FAILED"]),
    });

    const { snapshotId } = paramsSchema.parse(request.params);
    const data = bodySchema.parse(request.body);

    try {
      const snapshot = await offlineDataService.updateSnapshotData(
        snapshotId,
        data,
      );
      return reply.send(snapshot);
    } catch (error) {
      if (error instanceof Error && error.message === "Snapshot not found") {
        return reply.status(404).send({ error: error.message });
      }
      return reply.status(500).send({ error: "Failed to update snapshot" });
    }
  });

  // Offline Data: Get latest snapshot
  fastify.get(
    "/offline-data/snapshots/device/:deviceId/latest",
    async (request, reply) => {
      const schema = z.object({
        deviceId: z.string().uuid(),
        snapshot_type: z
          .enum(["FULL", "INCREMENTAL", "PRODUCTS", "CUSTOMERS", "PRICES"])
          .optional(),
      });

      const { deviceId, snapshot_type } = schema.parse(request.params);

      try {
        const snapshot = await offlineDataService.getLatestSnapshot(
          deviceId,
          snapshot_type,
        );
        if (!snapshot) {
          return reply.status(404).send({ error: "No snapshot found" });
        }
        return reply.send(snapshot);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get latest snapshot" });
      }
    },
  );

  // Offline Data: Queue transaction
  fastify.post("/offline-data/transactions", async (request, reply) => {
    const schema = z.object({
      device_id: z.string().uuid(),
      transaction_type: z.enum(["SALE", "RETURN", "ADJUSTMENT", "PAYMENT"]),
      transaction_data: z.any(),
      created_at_device: z.coerce.date().optional(),
      metadata: z.any().optional(),
    });

    const transactionData = schema.parse(request.body);

    try {
      const transaction =
        await offlineDataService.queueTransaction(transactionData);
      return reply.status(201).send(transaction);
    } catch {
      return reply.status(500).send({ error: "Failed to queue transaction" });
    }
  });

  // Offline Data: Get pending transactions for device
  fastify.get(
    "/offline-data/transactions/device/:deviceId/pending",
    async (request, reply) => {
      const schema = z.object({
        deviceId: z.string().uuid(),
      });

      const { deviceId } = schema.parse(request.params);

      try {
        const transactions =
          await offlineDataService.getPendingTransactions(deviceId);
        return reply.send(transactions);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get pending transactions" });
      }
    },
  );

  // Offline Data: Get all pending transactions
  fastify.get("/offline-data/transactions/pending", async (request, reply) => {
    const schema = z.object({
      limit: z.coerce.number().int().positive().optional(),
    });

    const { limit = 100 } = schema.parse(request.query);

    try {
      const transactions =
        await offlineDataService.getAllPendingTransactions(limit);
      return reply.send(transactions);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get pending transactions" });
    }
  });

  // Offline Data: Update transaction status
  fastify.put(
    "/offline-data/transactions/:queueId/status",
    async (request, reply) => {
      const paramsSchema = z.object({
        queueId: z.string(),
      });

      const bodySchema = z.object({
        status: z.enum([
          "PENDING",
          "UPLOADING",
          "UPLOADED",
          "FAILED",
          "REJECTED",
        ]),
        error_message: z.string().optional(),
        error_details: z.any().optional(),
        uploaded_at: z.coerce.date().optional(),
      });

      const { queueId } = paramsSchema.parse(request.params);
      const statusData = bodySchema.parse(request.body);

      try {
        const transaction = await offlineDataService.updateTransactionStatus(
          queueId,
          statusData.status,
          statusData,
        );
        return reply.send(transaction);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Transaction not found"
        ) {
          return reply.status(404).send({ error: error.message });
        }
        return reply
          .status(500)
          .send({ error: "Failed to update transaction status" });
      }
    },
  );

  // Offline Data: Get retryable transactions
  fastify.get(
    "/offline-data/transactions/retryable",
    async (request, reply) => {
      try {
        const transactions =
          await offlineDataService.getRetryableTransactions();
        return reply.send(transactions);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get retryable transactions" });
      }
    },
  );

  // Offline Data: Get transaction statistics
  fastify.get(
    "/offline-data/transactions/statistics",
    async (request, reply) => {
      const schema = z.object({
        device_id: z.string().uuid().optional(),
      });

      const { device_id } = schema.parse(request.query);

      try {
        const stats =
          await offlineDataService.getTransactionStatistics(device_id);
        return reply.send(stats);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get transaction statistics" });
      }
    },
  );

  // Offline Data: Cleanup old transactions
  fastify.post("/offline-data/transactions/cleanup", async (request, reply) => {
    const schema = z.object({
      days_old: z.coerce.number().int().positive().optional(),
    });

    const { days_old = 30 } = schema.parse(request.body);

    try {
      const count =
        await offlineDataService.cleanupOldUploadedTransactions(days_old);
      return reply.send({ deleted_count: count });
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to cleanup old transactions" });
    }
  });
}
