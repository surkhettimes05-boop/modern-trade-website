import { FastifyInstance } from "fastify";
import { z } from "zod";
import { promotionService } from "../services/promotionService.js";

export async function promotionRoutes(fastify: FastifyInstance) {
  // Promotions: Create promotion
  fastify.post("/promotions", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid(),
      name: z.string(),
      description: z.string().optional(),
      promotion_type: z.enum([
        "PERCENTAGE",
        "FIXED_AMOUNT",
        "BUY_X_GET_Y",
        "FREE_SHIPPING",
      ]),
      discount_value: z.number(),
      minimum_order_value: z.number().optional(),
      maximum_discount_amount: z.number().optional(),
      applicable_categories: z.any().optional(),
      applicable_products: z.any().optional(),
      customer_segments: z.any().optional(),
      buy_quantity: z.number().optional(),
      get_quantity: z.number().optional(),
      get_product_id: z.string().uuid().optional(),
      start_date: z.coerce.date().optional(),
      end_date: z.coerce.date().optional(),
      usage_limit: z.number().optional(),
      can_combine_with_other_promotions: z.boolean().optional(),
      created_by: z.string().optional(),
      metadata: z.any().optional(),
    });

    const promotionData = schema.parse(request.body);

    try {
      const promotion = await promotionService.createPromotion(promotionData);
      return reply.status(201).send(promotion);
    } catch {
      return reply.status(500).send({ error: "Failed to create promotion" });
    }
  });

  // Promotions: Get promotion
  fastify.get("/promotions/:promotionId", async (request, reply) => {
    const schema = z.object({
      promotionId: z.string(),
    });

    const { promotionId } = schema.parse(request.params);

    try {
      const promotion = await promotionService.getPromotion(promotionId);
      if (!promotion) {
        return reply.status(404).send({ error: "Promotion not found" });
      }
      return reply.send(promotion);
    } catch {
      return reply.status(500).send({ error: "Failed to get promotion" });
    }
  });

  // Promotions: Get active promotions for store
  fastify.get("/promotions/store/:storeId/active", async (request, reply) => {
    const schema = z.object({
      storeId: z.string().uuid(),
    });

    const { storeId } = schema.parse(request.params);

    try {
      const promotions =
        await promotionService.getActivePromotionsForStore(storeId);
      return reply.send(promotions);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get active promotions" });
    }
  });

  // Promotions: Update status
  fastify.put("/promotions/:promotionId/status", async (request, reply) => {
    const paramsSchema = z.object({
      promotionId: z.string(),
    });

    const bodySchema = z.object({
      is_active: z.boolean(),
    });

    const { promotionId } = paramsSchema.parse(request.params);
    const { is_active } = bodySchema.parse(request.body);

    try {
      const promotion = await promotionService.updatePromotionStatus(
        promotionId,
        is_active,
      );
      return reply.send(promotion);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to update promotion status" });
    }
  });

  // Coupons: Create coupon code
  fastify.post("/coupons", async (request, reply) => {
    const schema = z.object({
      promotion_id: z.string().uuid(),
      code: z.string(),
      usage_limit: z.number().optional(),
      usage_limit_per_customer: z.number().optional(),
      customer_restrictions: z.any().optional(),
      valid_from: z.coerce.date().optional(),
      valid_until: z.coerce.date().optional(),
      created_by: z.string().optional(),
      metadata: z.any().optional(),
    });

    const couponData = schema.parse(request.body);

    try {
      const coupon = await promotionService.createCouponCode(couponData);
      return reply.status(201).send(coupon);
    } catch {
      return reply.status(500).send({ error: "Failed to create coupon code" });
    }
  });

  // Coupons: Validate coupon
  fastify.post("/coupons/validate", async (request, reply) => {
    const schema = z.object({
      code: z.string(),
      customer_id: z.string().uuid(),
    });

    const { code, customer_id } = schema.parse(request.body);

    try {
      const result = await promotionService.validateCouponForCustomer(
        code,
        customer_id,
      );
      return reply.send(result);
    } catch {
      return reply.status(500).send({ error: "Failed to validate coupon" });
    }
  });

  // Coupons: Apply coupon to order
  fastify.post("/coupons/:couponId/apply", async (request, reply) => {
    const paramsSchema = z.object({
      couponId: z.string().uuid(),
    });

    const bodySchema = z.object({
      customer_id: z.string().uuid(),
      order_id: z.string().uuid(),
      discount_amount: z.number(),
    });

    const { couponId } = paramsSchema.parse(request.params);
    const applyData = bodySchema.parse(request.body);

    try {
      await promotionService.applyCouponToOrder(
        couponId,
        applyData.customer_id,
        applyData.order_id,
        applyData.discount_amount,
      );
      return reply.send({ success: true });
    } catch {
      return reply.status(500).send({ error: "Failed to apply coupon" });
    }
  });

  // Promotions: Calculate discount
  fastify.post(
    "/promotions/:promotionId/calculate-discount",
    async (request, reply) => {
      const paramsSchema = z.object({
        promotionId: z.string(),
      });

      const bodySchema = z.object({
        subtotal: z.number(),
        items: z.array(
          z.object({
            product_id: z.string().uuid(),
            quantity: z.number(),
            price: z.number(),
          }),
        ),
        customer_id: z.string().uuid().optional(),
      });

      const { promotionId } = paramsSchema.parse(request.params);
      const orderData = bodySchema.parse(request.body);

      try {
        const result = await promotionService.calculateDiscount(
          promotionId,
          orderData,
        );
        return reply.send(result);
      } catch (error) {
        if (error instanceof Error && error.message === "Promotion not found") {
          return reply.status(404).send({ error: error.message });
        }
        return reply
          .status(500)
          .send({ error: "Failed to calculate discount" });
      }
    },
  );
}
