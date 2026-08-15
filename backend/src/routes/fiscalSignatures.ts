import { FastifyInstance } from "fastify";
import { z } from "zod";
import { fiscalSignatureService } from "../services/fiscalSignatureService.js";

export async function fiscalSignatureRoutes(fastify: FastifyInstance) {
  // Fiscal Signatures: Sign document
  fastify.post("/fiscal-signatures/sign", async (request, reply) => {
    const schema = z.object({
      document_type: z.enum([
        "INVOICE",
        "RECEIPT",
        "CREDIT_NOTE",
        "DEBIT_NOTE",
      ]),
      document_id: z.string().uuid(),
      document_number: z.string(),
      document_content: z.any(),
    });

    const documentData = schema.parse(request.body);

    try {
      const signature = await fiscalSignatureService.signDocument(documentData);
      return reply.status(201).send(signature);
    } catch {
      return reply.status(500).send({ error: "Failed to sign document" });
    }
  });

  // Fiscal Signatures: Verify signature
  fastify.post("/fiscal-signatures/verify", async (request, reply) => {
    const schema = z.object({
      document_number: z.string(),
      document_content: z.any(),
    });

    const { document_number, document_content } = schema.parse(request.body);

    try {
      const isValid = await fiscalSignatureService.verifySignature(
        document_number,
        document_content,
      );
      return reply.send({ is_valid: isValid });
    } catch {
      return reply.status(500).send({ error: "Failed to verify signature" });
    }
  });

  // Fiscal Signatures: Get signature
  fastify.get("/fiscal-signatures/:documentNumber", async (request, reply) => {
    const schema = z.object({
      documentNumber: z.string(),
    });

    const { documentNumber } = schema.parse(request.params);

    try {
      const signature =
        await fiscalSignatureService.getSignature(documentNumber);
      if (!signature) {
        return reply.status(404).send({ error: "Fiscal signature not found" });
      }
      return reply.send(signature);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get fiscal signature" });
    }
  });

  // Fiscal Signatures: Invalidate signature
  fastify.put(
    "/fiscal-signatures/:signatureId/invalidate",
    async (request, reply) => {
      const schema = z.object({
        signatureId: z.string(),
      });

      const { signatureId } = schema.parse(request.params);

      try {
        const signature =
          await fiscalSignatureService.invalidateSignature(signatureId);
        return reply.send(signature);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Fiscal signature not found"
        ) {
          return reply.status(404).send({ error: error.message });
        }
        return reply
          .status(500)
          .send({ error: "Failed to invalidate signature" });
      }
    },
  );
}
