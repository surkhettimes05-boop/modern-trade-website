import { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { query } from "../database/connection.js";
import { authenticateStaff } from "../middleware/authentication.js";
import {
  authenticateCustomer,
  customerId,
} from "../middleware/customerAuthentication.js";
import { AuthenticatedUser } from "../plugins/authorization.js";
import {
  MembershipAuditContext,
  MembershipService,
  MembershipServiceError,
} from "../services/membershipService.js";
import { csrfMatches } from "../utils/csrf.js";

const membershipService = new MembershipService();

function sendMembershipError(reply: FastifyReply, error: unknown) {
  if (error instanceof MembershipServiceError) {
    const status =
      error.code.includes("NOT_FOUND")
        ? 404
        : error.code === "OTP_REQUIRED" || error.code === "TIER_FORBIDDEN"
          ? 403
          : error.code === "CAMPAIGN_FULL" ||
              error.code === "CAMPAIGN_CLOSED" ||
              error.code === "CUSTOMER_INACTIVE" ||
              error.code === "CUSTOMER_IDENTITY_INVALID" ||
              error.code === "STORE_REQUIRED" ||
              error.code === "ORGANIZATION_REQUIRED" ||
              error.code === "MEMBERSHIP_CONFLICT" ||
              error.code === "MEMBERSHIP_ALREADY_EXISTS" ||
              error.code === "INVALID_STATUS_TRANSITION"
            ? 409
            : 400;
    return reply.status(status).send({
      error: error.message,
      code: error.code,
    });
  }
  throw error;
}

function staffUser(request: { user: unknown }): AuthenticatedUser {
  return request.user as AuthenticatedUser;
}

function membershipReadAllowed(user: AuthenticatedUser): boolean {
  return (
    user.roleKey === "platform_admin" ||
    user.capabilities.includes("system.manage") ||
    user.capabilities.includes("membership.read") ||
    user.capabilities.includes("membership.manage")
  );
}

function membershipManageAllowed(user: AuthenticatedUser): boolean {
  return (
    user.roleKey === "platform_admin" ||
    user.capabilities.includes("system.manage") ||
    user.capabilities.includes("membership.manage")
  );
}

async function organizationScope(
  user: AuthenticatedUser,
  requestedOrganizationId?: string,
): Promise<{
  organizationId?: string;
  organizationIds?: string[];
  storeIds?: string[];
} | null> {
  if (user.scopeType === "GLOBAL") {
    return requestedOrganizationId
      ? { organizationId: requestedOrganizationId }
      : {};
  }

  if (user.scopeType === "ORGANIZATION") {
    if (
      !user.scopeOrganizationId ||
      (requestedOrganizationId &&
        requestedOrganizationId !== user.scopeOrganizationId)
    ) {
      return null;
    }
    return { organizationId: user.scopeOrganizationId };
  }

  if (user.scopeType === "STORE") {
    const storeIds = user.scopeStoreIds ?? [];
    if (storeIds.length === 0) return { organizationIds: [], storeIds: [] };
    const stores = await query(
      `SELECT DISTINCT organization_id
         FROM stores
        WHERE id = ANY($1::uuid[])
          AND organization_id IS NOT NULL`,
      [storeIds],
    );
    const organizationIds = stores.rows.map((row) =>
      String(row.organization_id),
    );
    if (
      requestedOrganizationId &&
      !organizationIds.includes(requestedOrganizationId)
    ) {
      return null;
    }
    return requestedOrganizationId
      ? { organizationId: requestedOrganizationId, storeIds }
      : { organizationIds, storeIds };
  }

  return null;
}

export async function membershipRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/membership/me",
    { onRequest: authenticateCustomer },
    async (request) => {
      const membership = await membershipService.getMembershipForCustomer(
        customerId(request),
      );
      return { membership };
    },
  );

  fastify.post(
    "/membership/enroll",
    {
      onRequest: authenticateCustomer,
      config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      const body = z
        .object({ store_id: z.string().uuid().optional() })
        .strict()
        .safeParse(request.body ?? {});
      if (!body.success) {
        return reply.status(400).send({
          error: "Membership tier and customer identity are server-controlled",
          code: "INVALID_ENROLLMENT_REQUEST",
        });
      }

      try {
        const membership = await membershipService.enrollCustomer(
          customerId(request),
          { storeId: body.data.store_id },
        );
        return reply.status(201).send({ membership });
      } catch (error) {
        return sendMembershipError(reply, error);
      }
    },
  );

  fastify.get(
    "/admin/memberships",
    { onRequest: authenticateStaff },
    async (request, reply) => {
      const user = staffUser(request);
      if (!membershipReadAllowed(user)) {
        return reply.status(403).send({
          error: "Missing capability: membership.read",
          code: "CAPABILITY_DENIED",
        });
      }

      const querySchema = z
        .object({
          status: z.enum(["ACTIVE", "SUSPENDED", "CANCELLED"]).optional(),
          tier: z.enum(["REGISTERED_MEMBER", "FOUNDING_1000"]).optional(),
          organization_id: z.string().uuid().optional(),
        })
        .strict();
      const parsed = querySchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid membership filters",
          code: "INVALID_REQUEST",
        });
      }

      const scope = await organizationScope(user, parsed.data.organization_id);
      if (!scope) {
        return reply.status(403).send({
          error: "Membership is outside the staff organization scope",
          code: "SCOPE_DENIED",
        });
      }

      const memberships = await membershipService.listMemberships({
        status: parsed.data.status,
        tier: parsed.data.tier,
        organization_id: scope.organizationId,
        organization_ids: scope.organizationIds,
        store_ids: scope.storeIds,
      });
      return { memberships };
    },
  );

  fastify.post(
    "/admin/memberships/:id/status",
    { onRequest: authenticateStaff },
    async (request, reply) => {
      if (!csrfMatches(request)) {
        return reply.status(403).send({
          error: "CSRF validation failed",
          code: "CSRF_INVALID",
        });
      }

      const user = staffUser(request);
      if (!membershipManageAllowed(user)) {
        return reply.status(403).send({
          error: "Missing capability: membership.manage",
          code: "CAPABILITY_DENIED",
        });
      }

      const params = z
        .object({ id: z.string().uuid() })
        .safeParse(request.params);
      const body = z
        .object({
          status: z.enum(["ACTIVE", "SUSPENDED", "CANCELLED"]),
          reason: z.string().trim().min(3).max(500),
        })
        .strict()
        .safeParse(request.body ?? {});
      if (!params.success || !body.success) {
        return reply.status(400).send({
          error: "Membership ID, status, and reason are required",
          code: "INVALID_REQUEST",
        });
      }

      const scope = await organizationScope(user);
      if (!scope) {
        return reply.status(403).send({
          error: "Membership is outside the staff organization scope",
          code: "SCOPE_DENIED",
        });
      }

      const auditContext: MembershipAuditContext = {
        actorRole: user.roleKey,
        actorCapabilities: user.capabilities,
        actorScopeType: user.scopeType,
        actorScopeStoreIds: user.scopeStoreIds ?? [],
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
        correlationId:
          (typeof request.headers["x-correlation-id"] === "string"
            ? request.headers["x-correlation-id"]
            : undefined) ?? `membership:${params.data.id}`,
      };

      try {
        const membership = await membershipService.updateMembershipStatus(
          params.data.id,
          body.data.status,
          user.id,
          body.data.reason,
          auditContext,
          scope.organizationId
            ? [scope.organizationId]
            : scope.organizationIds,
          scope.storeIds,
        );
        return { membership };
      } catch (error) {
        return sendMembershipError(reply, error);
      }
    },
  );
}
