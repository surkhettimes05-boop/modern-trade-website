import { FastifyInstance } from "fastify";
import { z } from "zod";
import { PaymentService } from "../services/paymentService.js";
import { query } from "../database/connection.js";

const paymentService = new PaymentService();

export async function paymentWebhookRoutes(fastify: FastifyInstance) {
  const options = {
    bodyLimit: 256 * 1024,
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  };

  fastify.post("/payments/webhooks/esewa", options, async (request, reply) => {
    try {
      const result = await paymentService.processWebhook(
        "ESEWA",
        request.body,
        request.headers,
      );
      return reply.status(result.success ? 200 : 401).send(result);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to process eSewa webhook" });
    }
  });

  fastify.post("/payments/webhooks/khalti", options, async (request, reply) => {
    try {
      const result = await paymentService.processWebhook(
        "KHALTI",
        request.body,
        request.headers,
      );
      return reply.status(result.success ? 200 : 401).send(result);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to process Khalti webhook" });
    }
  });
}

export async function paymentRoutes(fastify: FastifyInstance) {
  fastify.get("/payments/intents", async (request, reply) => {
    const schema = z.object({
      provider: z.enum(["ESEWA", "KHALTI", "CASH", "CARD"]).optional(),
      status: z.string().optional(),
      store_id: z.string().uuid().optional(),
      limit: z.coerce.number().min(1).max(200).default(50),
    });
    const filters = schema.parse(request.query);
    const conditions: string[] = [];
    const params: unknown[] = [];
    for (const key of ["provider", "status", "store_id"] as const) {
      if (filters[key]) {
        params.push(filters[key]);
        conditions.push(`${key} = $${params.length}`);
      }
    }
    params.push(filters.limit);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await query(
      `SELECT * FROM payment_intents ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return reply.send(result.rows);
  });

  // Payment: Create payment intent
  fastify.post("/payments/intents", async (request, reply) => {
    const schema = z.object({
      provider: z.enum(["ESEWA", "KHALTI", "CASH", "CARD"]),
      amount_npr: z.number().positive(),
      currency: z.string().optional(),
      order_reference: z.string().optional(),
      customer_id: z.string().uuid().optional(),
      store_id: z.string().uuid(),
      device_id: z.string().optional(),
      idempotency_key: z.string().optional(),
      metadata: z.any().optional(),
    });

    const paymentData = schema.parse(request.body);

    try {
      const intent = await paymentService.createPaymentIntent({
        ...paymentData,
        created_by: (request.user as { id: string }).id,
      });
      return reply.status(201).send(intent);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to create payment intent" });
    }
  });

  // Payment: Get payment intent
  fastify.get("/payments/intents/:intentId", async (request, reply) => {
    const schema = z.object({
      intentId: z.string().uuid(),
    });

    const { intentId } = schema.parse(request.params);

    try {
      const intent = await paymentService.verifyPaymentStatus(intentId);
      return reply.send(intent);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Payment intent not found"
      ) {
        return reply.status(404).send({ error: "Payment intent not found" });
      }
      return reply.status(500).send({ error: "Failed to get payment intent" });
    }
  });

  // Payment: Verify payment status
  fastify.post("/payments/intents/:intentId/verify", async (request, reply) => {
    const schema = z.object({
      intentId: z.string().uuid(),
    });

    const { intentId } = schema.parse(request.params);

    try {
      const intent = await paymentService.verifyPaymentStatus(intentId);
      return reply.send(intent);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Payment intent not found"
      ) {
        return reply.status(404).send({ error: "Payment intent not found" });
      }
      return reply
        .status(500)
        .send({ error: "Failed to verify payment status" });
    }
  });

  // Payment: Refund payment
  fastify.post("/payments/intents/:intentId/refund", async (request, reply) => {
    const paramsSchema = z.object({
      intentId: z.string().uuid(),
    });

    const bodySchema = z.object({
      amount_npr: z.number().positive(),
      reason: z.string(),
      idempotency_key: z.string().optional(),
    });

    const { intentId } = paramsSchema.parse(request.params);
    const { amount_npr, reason, idempotency_key } = bodySchema.parse(
      request.body,
    );

    try {
      const refundNumber = await paymentService.refundPayment(
        intentId,
        amount_npr,
        reason,
        idempotency_key,
        (request.user as { id: string }).id,
      );
      return reply.send({ refund_number: refundNumber });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Payment intent not found"
      ) {
        return reply.status(404).send({ error: "Payment intent not found" });
      }
      if (
        error instanceof Error &&
        error.message === "Payment must be completed before refund"
      ) {
        return reply.status(400).send({ error: error.message });
      }
      return reply.status(500).send({ error: "Failed to refund payment" });
    }
  });

  // Reconciliation: Daily reconciliation
  fastify.post("/payments/reconcile", async (request, reply) => {
    const schema = z.object({
      date: z.coerce.date(),
      provider: z.enum(["ESEWA", "KHALTI"]),
      store_id: z.string().uuid().optional(),
    });

    const { date, provider, store_id } = schema.parse(request.body);

    try {
      const reconciliation = await paymentService.reconcilePayments(
        date,
        provider,
        store_id,
      );
      return reply.send(reconciliation);
    } catch {
      return reply.status(500).send({ error: "Failed to reconcile payments" });
    }
  });

  // Reconciliation: Get reconciliation history
  fastify.get("/payments/reconciliations", async (request, reply) => {
    const schema = z.object({
      provider: z.enum(["ESEWA", "KHALTI"]).optional(),
      store_id: z.string().uuid().optional(),
      date_from: z.coerce.date().optional(),
      date_to: z.coerce.date().optional(),
      limit: z.coerce.number().optional(),
    });

    const {
      provider,
      store_id,
      date_from,
      date_to,
      limit = 50,
    } = schema.parse(request.query);

    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (provider) {
        conditions.push(`provider = $${paramIndex}`);
        params.push(provider);
        paramIndex++;
      }

      if (store_id) {
        conditions.push(`store_id = $${paramIndex}`);
        params.push(store_id);
        paramIndex++;
      }

      if (date_from) {
        conditions.push(`reconciliation_date >= $${paramIndex}`);
        params.push(date_from);
        paramIndex++;
      }

      if (date_to) {
        conditions.push(`reconciliation_date <= $${paramIndex}`);
        params.push(date_to);
        paramIndex++;
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const result = await query(
        `SELECT * FROM payment_reconciliation ${whereClause} ORDER BY reconciliation_date DESC LIMIT $${paramIndex}`,
        [...params, limit],
      );

      return reply.send(result.rows);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get reconciliation history" });
    }
  });

  // Webhook: Get webhook logs
  fastify.get("/payments/webhooks/logs", async (request, reply) => {
    const schema = z.object({
      provider: z.enum(["ESEWA", "KHALTI"]).optional(),
      payment_intent_id: z.string().uuid().optional(),
      limit: z.coerce.number().optional(),
    });

    const {
      provider,
      payment_intent_id,
      limit = 50,
    } = schema.parse(request.query);

    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (provider) {
        conditions.push(`provider = $${paramIndex}`);
        params.push(provider);
        paramIndex++;
      }

      if (payment_intent_id) {
        conditions.push(`payment_intent_id = $${paramIndex}`);
        params.push(payment_intent_id);
        paramIndex++;
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const result = await query(
        `SELECT * FROM payment_webhook_logs ${whereClause} ORDER BY received_at DESC LIMIT $${paramIndex}`,
        [...params, limit],
      );

      return reply.send(result.rows);
    } catch {
      return reply.status(500).send({ error: "Failed to get webhook logs" });
    }
  });

  // Refunds: Get refunds
  fastify.get("/payments/refunds", async (request, reply) => {
    const schema = z.object({
      payment_intent_id: z.string().uuid().optional(),
      provider: z.enum(["ESEWA", "KHALTI"]).optional(),
      status: z
        .enum(["REQUESTED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"])
        .optional(),
      limit: z.coerce.number().optional(),
    });

    const {
      payment_intent_id,
      provider,
      status,
      limit = 50,
    } = schema.parse(request.query);

    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (payment_intent_id) {
        conditions.push(`payment_intent_id = $${paramIndex}`);
        params.push(payment_intent_id);
        paramIndex++;
      }

      if (provider) {
        conditions.push(`provider = $${paramIndex}`);
        params.push(provider);
        paramIndex++;
      }

      if (status) {
        conditions.push(`status = $${paramIndex}`);
        params.push(status);
        paramIndex++;
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const result = await query(
        `SELECT * FROM payment_refunds ${whereClause} ORDER BY requested_at DESC LIMIT $${paramIndex}`,
        [...params, limit],
      );

      return reply.send(result.rows);
    } catch {
      return reply.status(500).send({ error: "Failed to get refunds" });
    }
  });
}
