import { timingSafeEqual } from "node:crypto";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import {
  createMemberPricingQuote,
  getMemberPricingCatalog,
  MemberPricingQuoteError,
  validateMemberPricingQuote,
  verifyMemberPricingCustomer,
} from "../services/memberPricingQuoteService.js";
import { MemberPricingError } from "../services/memberPricingService.js";

function serviceTokenMatches(request: FastifyRequest): boolean {
  const expected = process.env.MEMBER_PRICING_SERVICE_TOKEN?.trim();
  const authorization = request.headers.authorization;
  if (!expected || !authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

function sendPricingError(reply: FastifyReply, error: unknown) {
  if (
    error instanceof MemberPricingQuoteError ||
    error instanceof MemberPricingError
  ) {
    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
    });
  }
  throw error;
}

export async function memberPricingServiceRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", async (request, reply) => {
    if (
      process.env.NODE_ENV === "production" &&
      request.protocol !== "https"
    ) {
      return reply.status(400).send({
        error: "Member pricing service requests require HTTPS.",
        code: "HTTPS_REQUIRED",
      });
    }
    if (!serviceTokenMatches(request)) {
      return reply.status(401).send({
        error: "Service authentication is required.",
        code: "SERVICE_AUTH_REQUIRED",
      });
    }
  });

  fastify.post("/quotes", async (request, reply) => {
    try {
      const quote = await createMemberPricingQuote(request.body);
      return reply.status(201).send({ quote });
    } catch (error) {
      return sendPricingError(reply, error);
    }
  });

  fastify.post("/quotes/validate", async (request, reply) => {
    try {
      const quote = await validateMemberPricingQuote(request.body);
      return { valid: true, quote };
    } catch (error) {
      return sendPricingError(reply, error);
    }
  });

  fastify.post("/customers/verify", async (request, reply) => {
    try {
      const customer = await verifyMemberPricingCustomer(request.body);
      return { customer };
    } catch (error) {
      return sendPricingError(reply, error);
    }
  });

  fastify.get("/catalog", async (request, reply) => {
    const query = request.query as { storeReference?: unknown };
    if (typeof query.storeReference !== "string") {
      return reply.status(400).send({
        error: "A store reference is required.",
        code: "INVALID_STORE_REFERENCE",
      });
    }
    try {
      return await getMemberPricingCatalog(query.storeReference);
    } catch (error) {
      return sendPricingError(reply, error);
    }
  });
}
