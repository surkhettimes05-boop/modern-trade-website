import { FastifyInstance } from "fastify";
import { z } from "zod";
import { POSService } from "../services/posService.js";
import { query } from "../database/connection.js";

const posService = new POSService();

export async function posRoutes(fastify: FastifyInstance) {
  fastify.get("/sales", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid().optional(),
      status: z.string().optional(),
      limit: z.coerce.number().min(1).max(200).default(50),
    });
    const { store_id, status, limit } = schema.parse(request.query);
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (store_id) {
      params.push(store_id);
      conditions.push(`store_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`sale_status = $${params.length}`);
    }
    params.push(limit);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await query(
      `SELECT * FROM sales ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return reply.send(result.rows);
  });

  // POS: Lookup customer by phone
  fastify.post("/customer/lookup", async (request, reply) => {
    const schema = z.object({
      phone: z.string().min(10),
    });

    try {
      const body = schema.parse(request.body);
      const result = await posService.lookupCustomer(body.phone);
      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      reply.status(500);
      return { error: "Failed to lookup customer" };
    }
  });

  // POS: Enroll new customer
  fastify.post("/customer/enroll", async (request, reply) => {
    const schema = z.object({
      phone: z.string().min(10),
      preferred_name: z.string().max(100).optional(),
      email: z.string().email().optional(),
      language: z.enum(["en", "ne"]).optional(),
      store_id: z.string().uuid(),
      enrolled_by: z.string(),
    });

    try {
      const body = schema.parse(request.body);
      const result = await posService.enrollCustomer(body);
      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      reply.status(500);
      return { error: "Failed to enroll customer" };
    }
  });

  // POS: Quote points for sale
  fastify.post("/quote", async (request, reply) => {
    const schema = z.object({
      customer_id: z.string().uuid().optional(),
      items: z.array(
        z.object({
          product_id: z.string().uuid(),
          sku: z.string().optional(),
          category_id: z.string().uuid().optional(),
          quantity: z.number(),
          unit_price: z.number(),
          line_total: z.number(),
        }),
      ),
      total_amount: z.number(),
      store_id: z.string().uuid(),
      channel: z.string(),
    });

    try {
      const body = schema.parse(request.body);
      const result = await posService.quotePoints(body);
      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      reply.status(500);
      return { error: "Failed to quote points" };
    }
  });

  // POS: Create sale (draft)
  fastify.post("/sale", async (request, reply) => {
    const schema = z.object({
      sale_number: z.string(),
      customer_id: z.string().uuid().optional(),
      store_id: z.string().uuid(),
      total_amount: z.number(),
      currency: z.string().optional(),
      payment_method: z.string().optional(),
      items: z.array(
        z.object({
          product_id: z.string().uuid().optional(),
          sku: z.string().optional(),
          product_name: z.string().optional(),
          quantity: z.number(),
          unit_price: z.number(),
          line_total: z.number(),
          discount_amount: z.number().optional(),
          points_eligible: z.boolean().optional(),
        }),
      ),
      created_by: z.string(),
      idempotency_key: z.string().optional(),
    });

    try {
      const body = schema.parse(request.body);
      const result = await posService.createSale(body);
      return result;
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
      return { error: "Failed to create sale" };
    }
  });

  // POS: Update sale status
  fastify.patch("/sale/:id/status", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      status: z.enum(["DRAFT", "PENDING", "COMPLETED", "VOIDED", "RETURNED"]),
      updated_by: z.string(),
    });

    try {
      const body = schema.parse(request.body);
      const result = await posService.updateSaleStatus(
        id,
        body.status,
        body.updated_by,
      );
      return result;
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
      return { error: "Failed to update sale status" };
    }
  });

  // POS: Attach customer to sale
  fastify.post("/sale/:id/attach-customer", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      customer_id: z.string().uuid(),
    });

    try {
      const body = schema.parse(request.body);
      const result = await posService.attachCustomerToSale(
        id,
        body.customer_id,
      );
      return result;
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
      return { error: "Failed to attach customer to sale" };
    }
  });

  // POS: Get sale by ID
  fastify.get("/sale/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const result = await posService.getSale(id);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === "Sale not found") {
        reply.status(404);
        return { error: error.message };
      }
      reply.status(500);
      return { error: "Failed to fetch sale" };
    }
  });

  // POS: Get sale by number
  fastify.get("/sale/number/:sale_number", async (request, reply) => {
    const { sale_number } = request.params as { sale_number: string };

    try {
      const result = await posService.getSaleByNumber(sale_number);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === "Sale not found") {
        reply.status(404);
        return { error: error.message };
      }
      reply.status(500);
      return { error: "Failed to fetch sale" };
    }
  });

  // POS: Post earn points after sale completion
  fastify.post("/sale/:id/post-earn", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      posted_by: z.string(),
    });

    try {
      const body = schema.parse(request.body);
      const result = await posService.postEarnPoints(id, body.posted_by);
      return result;
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
      return { error: "Failed to post earn points" };
    }
  });

  // POS: Authorize redemption
  fastify.post("/redemption/authorize", async (request, reply) => {
    const schema = z.object({
      customer_id: z.string().uuid(),
      points_to_redeem: z.number().positive(),
    });

    try {
      const body = schema.parse(request.body);
      const result = await posService.authorizeRedemption(
        body.customer_id,
        body.points_to_redeem,
      );
      return result;
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
      return { error: "Failed to authorize redemption" };
    }
  });

  // POS: Post redemption
  fastify.post("/sale/:id/post-redemption", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      points_to_redeem: z.number().positive(),
      posted_by: z.string(),
    });

    try {
      const body = schema.parse(request.body);
      const result = await posService.postRedemption(
        id,
        body.points_to_redeem,
        body.posted_by,
      );
      return result;
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
      return { error: "Failed to post redemption" };
    }
  });

  // POS: Void sale
  fastify.post("/sale/:id/void", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      voided_by: z.string(),
      void_reason: z.string(),
    });

    try {
      const body = schema.parse(request.body);
      const result = await posService.voidSale(
        id,
        body.voided_by,
        body.void_reason,
      );
      return result;
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
      return { error: "Failed to void sale" };
    }
  });

  // POS: Process return
  fastify.post("/return", async (request, reply) => {
    const schema = z.object({
      return_number: z.string(),
      sale_id: z.string().uuid(),
      customer_id: z.string().uuid(),
      store_id: z.string().uuid(),
      total_amount: z.number(),
      items: z.array(
        z.object({
          sale_item_id: z.string().uuid(),
          quantity: z.number(),
          return_amount: z.number(),
        }),
      ),
      processed_by: z.string(),
    });

    try {
      const body = schema.parse(request.body);
      const result = await posService.processReturn(body);
      return result;
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
      return { error: "Failed to process return" };
    }
  });
}
