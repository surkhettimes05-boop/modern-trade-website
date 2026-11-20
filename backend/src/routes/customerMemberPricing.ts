import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { query } from "../database/connection.js";
import {
  authenticateCustomer,
  customerId,
} from "../middleware/customerAuthentication.js";
import {
  createMemberPricingQuote,
  getCustomerMemberPricingDisplay,
  MemberPricingQuoteError,
  validateMemberPricingQuote,
} from "../services/memberPricingQuoteService.js";
import { MemberPricingError } from "../services/memberPricingService.js";

const cartObjectSchema = z
  .object({
    store_id: z.string().uuid(),
    items: z
      .array(
        z
          .object({
            sku: z.string().trim().min(1).max(100),
            quantity: z.coerce.number().int().min(1).max(999),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

function uniqueSkus(value: { items: Array<{ sku: string }> }, context: z.RefinementCtx) {
  if (new Set(value.items.map((item) => item.sku)).size !== value.items.length) {
    context.addIssue({
      code: "custom",
      path: ["items"],
      message: "Each SKU may appear only once.",
    });
  }
}

const cartSchema = cartObjectSchema.superRefine(uniqueSkus);

const validateSchema = cartObjectSchema.extend({
  signed_quote_token: z.string().min(20).max(32_768),
  sale_reference: z.string().trim().min(8).max(200),
}).superRefine(uniqueSkus);

const displaySchema = z
  .object({
    store_id: z.string().uuid(),
    skus: z.array(z.string().trim().min(1).max(100)).min(1).max(2500),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.skus).size !== value.skus.length) {
      context.addIssue({
        code: "custom",
        path: ["skus"],
        message: "Each SKU may appear only once.",
      });
    }
  });

function sendPricingError(reply: FastifyReply, error: unknown) {
  if (error instanceof z.ZodError) {
    return reply.status(400).send({
      error: "The pricing request is invalid.",
      code: "INVALID_QUOTE_REQUEST",
    });
  }
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

async function customerPhoneReference(customerReference: string) {
  const result = await query(
    `SELECT phone_normalized
       FROM customers
      WHERE id = $1`,
    [customerReference],
  );
  if (!result.rowCount || typeof result.rows[0].phone_normalized !== "string") {
    throw new MemberPricingQuoteError(
      "CUSTOMER_MISMATCH",
      "The authenticated customer is not available for pricing.",
      409,
    );
  }
  return String(result.rows[0].phone_normalized);
}

export async function customerMemberPricingRoutes(fastify: FastifyInstance) {
  for (const channel of ["WEB", "APP"] as const) {
    const basePath = `/customer-pricing/${channel.toLowerCase()}/quotes`;
    const requireCustomer = { onRequest: authenticateCustomer };

    fastify.post(basePath, requireCustomer, async (request, reply) => {
      try {
        const body = cartSchema.parse(request.body);
        const authenticatedCustomerId = customerId(request);
        const quote = await createMemberPricingQuote({
          channel,
          storeReference: body.store_id,
          customerReference: authenticatedCustomerId,
          customerPhoneReference: await customerPhoneReference(
            authenticatedCustomerId,
          ),
          items: body.items.map((item) => ({
            sku: item.sku,
            quantity: String(item.quantity),
          })),
        });
        return reply.status(201).send({ quote });
      } catch (error) {
        return sendPricingError(reply, error);
      }
    });

    fastify.post(
      `/customer-pricing/${channel.toLowerCase()}/prices`,
      requireCustomer,
      async (request, reply) => {
        try {
          const body = displaySchema.parse(request.body);
          const authenticatedCustomerId = customerId(request);
          const result = await getCustomerMemberPricingDisplay({
            channel,
            storeReference: body.store_id,
            customerReference: authenticatedCustomerId,
            customerPhoneReference: await customerPhoneReference(
              authenticatedCustomerId,
            ),
            skus: body.skus,
          });
          return reply.send(result);
        } catch (error) {
          return sendPricingError(reply, error);
        }
      },
    );

    fastify.post(
      `${basePath}/validate`,
      requireCustomer,
      async (request, reply) => {
        try {
          const body = validateSchema.parse(request.body);
          const authenticatedCustomerId = customerId(request);
          const quote = await validateMemberPricingQuote({
            channel,
            storeReference: body.store_id,
            customerReference: authenticatedCustomerId,
            customerPhoneReference: await customerPhoneReference(
              authenticatedCustomerId,
            ),
            items: body.items.map((item) => ({
              sku: item.sku,
              quantity: String(item.quantity),
            })),
            signedQuoteToken: body.signed_quote_token,
            saleReference: body.sale_reference,
          });
          return reply.send({ valid: true, quote });
        } catch (error) {
          return sendPricingError(reply, error);
        }
      },
    );
  }
}
