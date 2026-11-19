import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthenticatedUser } from "../plugins/authorization.js";
import {
  MemberPricingActor,
  MemberPricingError,
  MemberPricingInput,
  MemberPricingService,
} from "../services/memberPricingService.js";
import { authenticateStaff } from "../middleware/authentication.js";
import { csrfMatches } from "../utils/csrf.js";

const service = new MemberPricingService();
const tiers = ["REGISTERED_MEMBER", "FOUNDING_1000"] as const;
const channels = ["POS", "WEB", "APP", "COD"] as const;

const moneySchema = z.union([
  z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/),
  z.number()
    .finite()
    .max(9_999_999_999.99)
    .nonnegative()
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8)
    .transform((value) => (Math.round(value * 100) / 100).toFixed(2)),
]);

const promotionFields = {
  name: z.string().trim().min(1).max(255),
  starts_at: z.coerce.date(),
  ends_at: z.coerce.date(),
  reason: z.string().trim().min(3).max(500),
  products: z
    .array(
      z.object({
        sku: z.string().trim().min(1).max(100),
        member_price: moneySchema,
      }).strict(),
    )
    .min(1)
    .max(500)
    .refine(
      (products) =>
        new Set(products.map((product) => product.sku.toLowerCase())).size ===
        products.length,
      { message: "Duplicate SKUs are not allowed" },
    ),
  category_ids: z.array(z.string().uuid()).max(100).default([]).refine(
    (values) => new Set(values).size === values.length,
    { message: "Duplicate categories are not allowed" },
  ),
  tiers: z.array(z.enum(tiers)).min(1).refine(
    (values) => new Set(values).size === values.length,
    { message: "Duplicate tiers are not allowed" },
  ),
  channels: z.array(z.enum(channels)).min(1).refine(
    (values) => new Set(values).size === values.length,
    { message: "Duplicate channels are not allowed" },
  ),
};

const createSchema = z.object({
  organization_id: z.string().uuid(),
  ...promotionFields,
}).strict().superRefine((value, context) => {
  if (value.ends_at <= value.starts_at) {
    context.addIssue({
      code: "custom",
      path: ["ends_at"],
      message: "End timestamp must be after start timestamp",
    });
  }
});

const updateSchema = z.object(promotionFields).strict().superRefine((value, context) => {
  if (value.ends_at <= value.starts_at) {
    context.addIssue({
      code: "custom",
      path: ["ends_at"],
      message: "End timestamp must be after start timestamp",
    });
  }
});
const reasonSchema = z.object({
  reason: z.string().trim().min(3).max(500),
}).strict();

function userOf(request: FastifyRequest): AuthenticatedUser {
  return request.user as AuthenticatedUser;
}

function isOwnerOrAdmin(user: AuthenticatedUser): boolean {
  return ["platform_admin", "head_office_admin"].includes(user.roleKey);
}

function allowedOrganizationIds(user: AuthenticatedUser): string[] | null {
  if (user.scopeType === "GLOBAL" && user.roleKey === "platform_admin") {
    return null;
  }
  if (
    user.scopeType === "ORGANIZATION" &&
    user.scopeOrganizationId &&
    isOwnerOrAdmin(user)
  ) {
    return [user.scopeOrganizationId];
  }
  return [];
}

function actorFor(request: FastifyRequest, user: AuthenticatedUser): MemberPricingActor {
  return {
    id: user.id,
    roleKey: user.roleKey,
    capabilities: user.capabilities,
    scopeType: user.scopeType,
    scopeStoreIds: user.scopeStoreIds ?? [],
    ipAddress: request.ip,
    userAgent:
      typeof request.headers["user-agent"] === "string"
        ? request.headers["user-agent"]
        : undefined,
    correlationId:
      typeof request.headers["x-correlation-id"] === "string"
        ? request.headers["x-correlation-id"]
        : request.id,
  };
}

function checkPermission(
  user: AuthenticatedUser,
  capability: "pricing.read" | "pricing.write" | "pricing.approve" | "reports.sales",
): boolean {
  return (
    isOwnerOrAdmin(user) &&
    (user.roleKey === "platform_admin" ||
      user.capabilities.includes("system.manage") ||
      user.capabilities.includes(capability))
  );
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof MemberPricingError) {
    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
  }
  throw error;
}

function requireCsrf(request: FastifyRequest, reply: FastifyReply): boolean {
  if (csrfMatches(request)) return true;
  reply.status(403).send({ error: "CSRF validation failed", code: "CSRF_INVALID" });
  return false;
}

export async function memberPricingRoutes(fastify: FastifyInstance) {
  const staffAuth = { onRequest: authenticateStaff };

  fastify.get(
    "/admin/member-pricing/promotions",
    staffAuth,
    async (request, reply) => {
      const user = userOf(request);
      if (!checkPermission(user, "pricing.read")) {
        return reply.status(403).send({ error: "Owner/Admin pricing access required" });
      }
      const parsed = z.object({
        organization_id: z.string().uuid().optional(),
        status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "EXPIRED", "ARCHIVED"]).optional(),
        search: z.string().trim().max(255).optional(),
        sku: z.string().trim().max(100).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      }).strict().safeParse(request.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid promotion filters", code: "INVALID_REQUEST" });
      }
      try {
        const { organization_id, ...filters } = parsed.data;
        return await service.listPromotions({
          organizationIds: allowedOrganizationIds(user),
          organizationId: organization_id,
          ...filters,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/admin/member-pricing/promotions",
    staffAuth,
    async (request, reply) => {
      if (!requireCsrf(request, reply)) return;
      const user = userOf(request);
      if (!checkPermission(user, "pricing.write")) {
        return reply.status(403).send({ error: "Owner/Admin pricing access required" });
      }
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid promotion", code: "INVALID_REQUEST" });
      }
      const allowed = allowedOrganizationIds(user);
      if (allowed && !allowed.includes(parsed.data.organization_id)) {
        return reply.status(403).send({ error: "Organization is outside the staff scope", code: "SCOPE_DENIED" });
      }
      try {
        const input: MemberPricingInput = parsed.data;
        const promotion = await service.createPromotion(input, actorFor(request, user));
        return reply.status(201).send({ promotion });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/admin/member-pricing/promotions/:id/preview",
    staffAuth,
    async (request, reply) => {
      if (!requireCsrf(request, reply)) return;
      const user = userOf(request);
      if (!checkPermission(user, "pricing.read")) {
        return reply.status(403).send({ error: "Owner/Admin pricing access required" });
      }
      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "Invalid promotion ID" });
      try {
        return await service.previewPromotion(
          params.data.id,
          allowedOrganizationIds(user),
        );
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/admin/member-pricing/promotions/:id/performance",
    staffAuth,
    async (request, reply) => {
      const user = userOf(request);
      if (!checkPermission(user, "reports.sales")) {
        return reply.status(403).send({ error: "Owner/Admin sales-report access required" });
      }
      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "Invalid promotion ID" });
      try {
        return await service.getPerformance(
          params.data.id,
          allowedOrganizationIds(user),
        );
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/admin/member-pricing/promotions/:id",
    staffAuth,
    async (request, reply) => {
      const user = userOf(request);
      if (!checkPermission(user, "pricing.read")) {
        return reply.status(403).send({ error: "Owner/Admin pricing access required" });
      }
      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "Invalid promotion ID" });
      try {
        return { promotion: await service.getPromotion(params.data.id, allowedOrganizationIds(user)) };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.put(
    "/admin/member-pricing/promotions/:id",
    staffAuth,
    async (request, reply) => {
      if (!requireCsrf(request, reply)) return;
      const user = userOf(request);
      if (!checkPermission(user, "pricing.write")) {
        return reply.status(403).send({ error: "Owner/Admin pricing access required" });
      }
      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      const parsed = updateSchema.safeParse(request.body);
      if (!params.success || !parsed.success) {
        return reply.status(400).send({ error: "Invalid promotion update", code: "INVALID_REQUEST" });
      }
      try {
        const promotion = await service.updatePromotion(
          params.data.id,
          parsed.data,
          actorFor(request, user),
          allowedOrganizationIds(user),
        );
        return { promotion };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  const transitionRoutes: Array<{
    path: string;
    action: "ACTIVATED" | "PAUSED" | "ARCHIVED";
    capability: "pricing.write" | "pricing.approve";
  }> = [
    { path: "activate", action: "ACTIVATED", capability: "pricing.approve" },
    { path: "pause", action: "PAUSED", capability: "pricing.write" },
    { path: "archive", action: "ARCHIVED", capability: "pricing.write" },
  ];
  for (const transition of transitionRoutes) {
    fastify.post(
      `/admin/member-pricing/promotions/:id/${transition.path}`,
      staffAuth,
      async (request, reply) => {
        if (!requireCsrf(request, reply)) return;
        const user = userOf(request);
        if (!checkPermission(user, transition.capability)) {
          return reply.status(403).send({ error: "Owner/Admin pricing access required" });
        }
        const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
        const parsed = reasonSchema.safeParse(request.body);
        if (!params.success || !parsed.success) {
          return reply.status(400).send({ error: "Promotion ID and reason are required", code: "INVALID_REQUEST" });
        }
        try {
          const promotion = await service.transitionPromotion(
            params.data.id,
            transition.action,
            parsed.data.reason,
            actorFor(request, user),
            allowedOrganizationIds(user),
          );
          return { promotion };
        } catch (error) {
          return sendError(reply, error);
        }
      },
    );
  }
}

