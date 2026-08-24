import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  authenticateCustomer,
  customerId,
} from "../middleware/customerAuthentication.js";
import { authenticateStaff } from "../middleware/authentication.js";
import { csrfMatches } from "../utils/csrf.js";
import {
  loyaltyMvpService,
  LoyaltyMvpError,
} from "../services/loyaltyMvpService.js";

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof LoyaltyMvpError) {
    const status = error.code.includes("DENIED")
      ? 403
      : error.code.includes("NOT_FOUND")
        ? 404
        : 409;
    return reply
      .status(status)
      .send({ error: error.message, code: error.code });
  }
  throw error;
}

async function staffMutation(request: FastifyRequest, reply: FastifyReply) {
  await authenticateStaff(request, reply);
  if (!reply.sent && !csrfMatches(request))
    return reply
      .status(403)
      .send({ error: "CSRF validation failed", code: "CSRF_INVALID" });
}

export async function loyaltyMvpRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/loyalty/me",
    { onRequest: authenticateCustomer },
    async (request) =>
      loyaltyMvpService.getCustomerSummary(customerId(request)),
  );

  fastify.post(
    "/loyalty/enroll",
    { onRequest: authenticateCustomer },
    async (request, reply) => {
      try {
        return await loyaltyMvpService.enroll(customerId(request));
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/loyalty/staff/sales/:saleId/redeem",
    { onRequest: staffMutation },
    async (request, reply) => {
      const params = z
        .object({ saleId: z.string().uuid() })
        .parse(request.params);
      const body = z
        .object({
          points: z.number().int().positive(),
          idempotency_key: z.string().min(12).max(255),
        })
        .strict()
        .parse(request.body);
      try {
        return await loyaltyMvpService.redeemSale(
          params.saleId,
          body.points,
          body.idempotency_key,
          request.user as any,
        );
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/loyalty/staff/reconciliation",
    { onRequest: authenticateStaff },
    async (request, reply) => {
      const user = request.user as any;
      const allowed =
        user.roleKey === "platform_admin" ||
        user.capabilities?.includes("system.manage") ||
        user.capabilities?.includes("loyalty.read");
      if (!allowed)
        return reply
          .status(403)
          .send({ error: "Missing capability: loyalty.read" });
      return loyaltyMvpService.reconcile();
    },
  );
}
