import { FastifyInstance } from "fastify";
import { z } from "zod";
import { encryptionService } from "../services/encryptionService.js";

export async function encryptionRoutes(fastify: FastifyInstance) {
  // Encryption: Encrypt data
  fastify.post("/encryption/encrypt", async (request, reply) => {
    const schema = z.object({
      data: z.string(),
      key_type: z.string().optional(),
    });

    const { data, key_type = "DATA_ENCRYPTION" } = schema.parse(request.body);

    try {
      const result = await encryptionService.encryptData(data, key_type);
      return reply.send(result);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "No active encryption key found"
      ) {
        return reply.status(404).send({ error: error.message });
      }
      return reply.status(500).send({ error: "Failed to encrypt data" });
    }
  });

  // Encryption: Decrypt data
  fastify.post("/encryption/decrypt", async (request, reply) => {
    const schema = z.object({
      encrypted_data: z.string(),
      key_id: z.string(),
    });

    const { encrypted_data, key_id } = schema.parse(request.body);

    try {
      const decrypted = await encryptionService.decryptData(
        encrypted_data,
        key_id,
      );
      return reply.send({ decrypted_data: decrypted });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Encryption key not found"
      ) {
        return reply.status(404).send({ error: error.message });
      }
      return reply.status(500).send({ error: "Failed to decrypt data" });
    }
  });

  // Encryption: Create key
  fastify.post("/encryption/keys", async (request, reply) => {
    const schema = z.object({
      key_type: z.string(),
      key_algorithm: z.string(),
      key_usage: z.string(),
      created_by: z.string().optional(),
      expires_at: z.coerce.date().optional(),
    });

    const keyData = schema.parse(request.body);

    try {
      const key = await encryptionService.createKey(keyData);
      return reply.status(201).send(key);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to create encryption key" });
    }
  });

  // Encryption: Get active key
  fastify.get("/encryption/keys/active", async (request, reply) => {
    const schema = z.object({
      key_type: z.string(),
      key_usage: z.string(),
    });

    const { key_type, key_usage } = schema.parse(request.query);

    try {
      const key = await encryptionService.getActiveKey(key_type, key_usage);
      if (!key) {
        return reply.status(404).send({ error: "No active key found" });
      }
      return reply.send(key);
    } catch {
      return reply.status(500).send({ error: "Failed to get active key" });
    }
  });

  // Encryption: Get key by ID
  fastify.get("/encryption/keys/:keyId", async (request, reply) => {
    const schema = z.object({
      keyId: z.string(),
    });

    const { keyId } = schema.parse(request.params);

    try {
      const key = await encryptionService.getKeyById(keyId);
      if (!key) {
        return reply.status(404).send({ error: "Encryption key not found" });
      }
      return reply.send(key);
    } catch {
      return reply.status(500).send({ error: "Failed to get encryption key" });
    }
  });

  // Encryption: Rotate key
  fastify.post("/encryption/keys/:keyId/rotate", async (request, reply) => {
    const paramsSchema = z.object({
      keyId: z.string(),
    });

    const bodySchema = z.object({
      rotated_by: z.string(),
    });

    const { keyId } = paramsSchema.parse(request.params);
    const { rotated_by } = bodySchema.parse(request.body);

    try {
      const key = await encryptionService.rotateKey(keyId, rotated_by);
      return reply.send(key);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Encryption key not found"
      ) {
        return reply.status(404).send({ error: error.message });
      }
      return reply.status(500).send({ error: "Failed to rotate key" });
    }
  });

  // Encryption: Get all keys
  fastify.get("/encryption/keys", async (request, reply) => {
    const schema = z.object({
      key_type: z.string().optional(),
      key_usage: z.string().optional(),
      is_active: z.coerce.boolean().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const keys = await encryptionService.getAllKeys(filters);
      return reply.send(keys);
    } catch {
      return reply.status(500).send({ error: "Failed to get encryption keys" });
    }
  });
}
