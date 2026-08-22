// backend/src/plugins/authorization.ts
// Centralized authorization plugin with capability-based access control

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface AuthenticatedUser {
  id: string;
  username: string;
  roleId: string;
  roleKey: string;
  capabilities: string[];
  scopeType: "GLOBAL" | "ORGANIZATION" | "STORE" | "OWN_REGISTER";
  scopeOrganizationId?: string;
  scopeStoreIds?: string[];
  storeId?: string; // Current active store for store-scoped users
  mfaEnabled: boolean;
  mfaVerified?: boolean;
}

export interface AuthorizationContext {
  user: AuthenticatedUser;
  requiredCapabilities?: string[];
  requiredScopeType?: "GLOBAL" | "ORGANIZATION" | "STORE" | "OWN_REGISTER";
  allowedStoreIds?: string[];
  requireMfa?: boolean;
  requireStepUpAuth?: boolean;
}

export interface AuthorizationResult {
  authorized: boolean;
  reason?: string;
  missingCapabilities?: string[];
  scopeMismatch?: boolean;
  mfaRequired?: boolean;
  stepUpAuthRequired?: boolean;
}

// ============================================
// ZOD SCHEMAS
// ============================================

// ============================================
// AUTHORIZATION PLUGIN
// ============================================

const authorizationPlugin: FastifyPluginAsync = async (fastify, _options) => {
  // Authorization helper functions
  fastify.decorate("authorization", {
    checkCapability,
    checkCapabilities,
    checkScope,
    checkStoreAccess,
    checkMfa,
    checkStepUpAuth,
    logPermissionDenied,
  });
};

// ============================================
// AUTHORIZATION FUNCTIONS
// ============================================

function checkCapability(
  request: FastifyRequest,
  capability: string,
): AuthorizationResult {
  const user = request.user as AuthenticatedUser;

  if (!user) {
    return { authorized: false, reason: "User not authenticated" };
  }

  // Platform administrators are the system-level break-glass role. The
  // system.manage capability also covers modules added after a role was seeded.
  if (
    user.roleKey === "platform_admin" ||
    user.capabilities.includes("system.manage")
  ) {
    return { authorized: true };
  }

  if (!user.capabilities.includes(capability)) {
    return {
      authorized: false,
      reason: `Missing capability: ${capability}`,
      missingCapabilities: [capability],
    };
  }

  return { authorized: true };
}

function checkCapabilities(
  request: FastifyRequest,
  capabilities: string[],
  requireAll: boolean = true,
): AuthorizationResult {
  const user = request.user as AuthenticatedUser;

  if (!user) {
    return { authorized: false, reason: "User not authenticated" };
  }

  if (requireAll) {
    const missing = capabilities.filter(
      (cap) => !user.capabilities.includes(cap),
    );
    if (missing.length > 0) {
      return {
        authorized: false,
        reason: `Missing capabilities: ${missing.join(", ")}`,
        missingCapabilities: missing,
      };
    }
  } else {
    const hasAny = capabilities.some((cap) => user.capabilities.includes(cap));
    if (!hasAny) {
      return {
        authorized: false,
        reason: `Missing one of capabilities: ${capabilities.join(", ")}`,
        missingCapabilities: capabilities,
      };
    }
  }

  return { authorized: true };
}

function checkScope(
  request: FastifyRequest,
  requiredScopeType: "GLOBAL" | "ORGANIZATION" | "STORE" | "OWN_REGISTER",
): AuthorizationResult {
  const user = request.user as AuthenticatedUser;

  if (!user) {
    return { authorized: false, reason: "User not authenticated" };
  }

  const scopeHierarchy = {
    GLOBAL: 4,
    ORGANIZATION: 3,
    STORE: 2,
    OWN_REGISTER: 1,
  };

  const userLevel = scopeHierarchy[user.scopeType] || 0;
  const requiredLevel = scopeHierarchy[requiredScopeType] || 0;

  if (userLevel < requiredLevel) {
    return {
      authorized: false,
      reason: `Insufficient scope: ${user.scopeType} < ${requiredScopeType}`,
      scopeMismatch: true,
    };
  }

  return { authorized: true };
}

function checkStoreAccess(
  request: FastifyRequest,
  storeId: string,
): AuthorizationResult {
  const user = request.user as AuthenticatedUser;

  if (!user) {
    return { authorized: false, reason: "User not authenticated" };
  }

  // GLOBAL users can access any store
  if (user.scopeType === "GLOBAL") {
    return { authorized: true };
  }

  // ORGANIZATION users can access stores in their organization
  if (user.scopeType === "ORGANIZATION") {
    return { authorized: false, reason: "Organization store membership must be verified", scopeMismatch: true };
  }

  // STORE users can only access their assigned stores
  if (user.scopeType === "STORE") {
    if (!user.scopeStoreIds || !user.scopeStoreIds.includes(storeId)) {
      return {
        authorized: false,
        reason: `Store ${storeId} not in user's scope`,
        scopeMismatch: true,
      };
    }
    return { authorized: true };
  }

  // OWN_REGISTER users can only access their current store
  if (user.scopeType === "OWN_REGISTER") {
    if (user.storeId !== storeId) {
      return {
        authorized: false,
        reason: "User can only access their assigned register/store",
        scopeMismatch: true,
      };
    }
    return { authorized: true };
  }

  return { authorized: false, reason: "Unknown scope type" };
}

function checkMfa(
  request: FastifyRequest,
  _capability?: string,
): AuthorizationResult {
  const user = request.user as AuthenticatedUser;

  if (!user) {
    return { authorized: false, reason: "User not authenticated" };
  }

  // Check if user has MFA enabled for high-risk operations
  if (user.mfaEnabled && !user.mfaVerified) {
    return {
      authorized: false,
      reason: "MFA verification required",
      mfaRequired: true,
    };
  }

  return { authorized: true };
}

function checkStepUpAuth(
  request: FastifyRequest,
  _capability?: string,
): AuthorizationResult {
  const user = request.user as AuthenticatedUser;

  if (!user) {
    return { authorized: false, reason: "User not authenticated" };
  }

  const stepUpUntil = (user as AuthenticatedUser & { stepUpUntil?: number }).stepUpUntil;
  if (!stepUpUntil || stepUpUntil < Date.now()) {
    return {
      authorized: false,
      reason: "Step-up authentication required",
      stepUpAuthRequired: true,
    };
  }

  return { authorized: true };
}

async function logPermissionDenied(
  request: FastifyRequest,
  reason: string,
  missingCapabilities?: string[],
): Promise<void> {
  const user = request.user as AuthenticatedUser;

  // Log to request logger for now - database logging can be added later
  request.log.warn({
    event: "permission_denied",
    staff_id: user?.id,
    required_capability: missingCapabilities?.[0] || "unknown",
    attempted_route: request.url,
    attempted_method: request.method,
    ip_address: request.ip,
    user_agent: request.headers["user-agent"],
    scope_type: user?.scopeType,
    scope_store_ids: user?.scopeStoreIds,
    actor_capabilities: user?.capabilities,
    reason,
  });
}

// ============================================
// MIDDLEWARE HELPERS
// ============================================

export async function requireCapability(
  request: FastifyRequest,
  capability: string,
): Promise<void> {
  const result = checkCapability(request, capability);

  if (!result.authorized) {
    await logPermissionDenied(
      request,
      result.reason || "Unauthorized",
      result.missingCapabilities,
    );
    throw new Error(result.reason || "Unauthorized");
  }
}

export async function requireAnyCapability(
  request: FastifyRequest,
  capabilities: string[],
): Promise<void> {
  const result = checkCapabilities(request, capabilities, false);

  if (!result.authorized) {
    await logPermissionDenied(
      request,
      result.reason || "Unauthorized",
      result.missingCapabilities,
    );
    throw new Error(result.reason || "Unauthorized");
  }
}

export async function requireAllCapabilities(
  request: FastifyRequest,
  capabilities: string[],
): Promise<void> {
  const result = checkCapabilities(request, capabilities, true);

  if (!result.authorized) {
    await logPermissionDenied(
      request,
      result.reason || "Unauthorized",
      result.missingCapabilities,
    );
    throw new Error(result.reason || "Unauthorized");
  }
}

export async function requireScope(
  request: FastifyRequest,
  scopeType: "GLOBAL" | "ORGANIZATION" | "STORE" | "OWN_REGISTER",
): Promise<void> {
  const result = checkScope(request, scopeType);

  if (!result.authorized) {
    await logPermissionDenied(request, result.reason || "Unauthorized");
    throw new Error(result.reason || "Unauthorized");
  }
}

export async function requireStoreAccess(
  request: FastifyRequest,
  storeId: string,
): Promise<void> {
  const user = request.user as AuthenticatedUser;
  if (user?.scopeType === "ORGANIZATION") {
    if (!user.scopeOrganizationId) {
      await logPermissionDenied(request, "Organization scope is missing an organization ID");
      throw new Error("Organization scope is incomplete");
    }
    const { query } = await import("../database/connection.js");
    const membership = await query(
      "SELECT 1 FROM stores WHERE id = $1 AND organization_id = $2 LIMIT 1",
      [storeId, user.scopeOrganizationId],
    );
    if (membership.rowCount) return;
    await logPermissionDenied(request, "Store is outside the user's organization");
    throw new Error("Store is outside the user's organization");
  }
  const result = checkStoreAccess(request, storeId);

  if (!result.authorized) {
    await logPermissionDenied(request, result.reason || "Unauthorized");
    throw new Error(result.reason || "Unauthorized");
  }
}

export async function requireMfa(
  request: FastifyRequest,
  capability?: string,
): Promise<void> {
  const result = checkMfa(request, capability);

  if (!result.authorized) {
    throw new Error(result.reason || "MFA required");
  }
}

export async function requireStepUpAuth(
  request: FastifyRequest,
  capability?: string,
): Promise<void> {
  const result = checkStepUpAuth(request, capability);

  if (!result.authorized) {
    throw new Error(result.reason || "Step-up authentication required");
  }
}

// ============================================
// PRE-HOOK HELPERS
// ============================================

export const preHandler = {
  requireCapability:
    (capability: string) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await requireCapability(request, capability);
      } catch (error) {
        reply
          .status(403)
          .send({ error: "Forbidden", message: (error as Error).message });
      }
    },

  requireAnyCapability:
    (capabilities: string[]) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await requireAnyCapability(request, capabilities);
      } catch (error) {
        reply
          .status(403)
          .send({ error: "Forbidden", message: (error as Error).message });
      }
    },

  requireAllCapabilities:
    (capabilities: string[]) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await requireAllCapabilities(request, capabilities);
      } catch (error) {
        reply
          .status(403)
          .send({ error: "Forbidden", message: (error as Error).message });
      }
    },

  requireScope:
    (scopeType: "GLOBAL" | "ORGANIZATION" | "STORE" | "OWN_REGISTER") =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await requireScope(request, scopeType);
      } catch (error) {
        reply
          .status(403)
          .send({ error: "Forbidden", message: (error as Error).message });
      }
    },

  requireStoreAccess:
    (storeIdParam: string = "storeId") =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const storeId =
          (request.params as any)[storeIdParam] ||
          (request.query as any)[storeIdParam];
        if (!storeId) {
          reply
            .status(400)
            .send({ error: "Bad Request", message: "Store ID required" });
          return;
        }
        await requireStoreAccess(request, storeId);
      } catch (error) {
        reply
          .status(403)
          .send({ error: "Forbidden", message: (error as Error).message });
      }
    },

  requireMfa:
    (capability?: string) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await requireMfa(request, capability);
      } catch (error) {
        reply
          .status(403)
          .send({ error: "Forbidden", message: (error as Error).message });
      }
    },

  requireStepUpAuth:
    (capability?: string) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await requireStepUpAuth(request, capability);
      } catch (error) {
        reply
          .status(403)
          .send({ error: "Forbidden", message: (error as Error).message });
      }
    },

  // Combined checks
  requireCapabilityAndScope:
    (
      capability: string,
      scopeType?: "GLOBAL" | "ORGANIZATION" | "STORE" | "OWN_REGISTER",
    ) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await requireCapability(request, capability);
        if (scopeType) {
          await requireScope(request, scopeType);
        }
      } catch (error) {
        reply
          .status(403)
          .send({ error: "Forbidden", message: (error as Error).message });
      }
    },

  requireCapabilityAndStoreAccess:
    (capability: string, storeIdParam: string = "storeId") =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await requireCapability(request, capability);
        const storeId =
          (request.params as any)[storeIdParam] ||
          (request.query as any)[storeIdParam];
        if (!storeId) {
          reply
            .status(400)
            .send({ error: "Bad Request", message: "Store ID required" });
          return;
        }
        await requireStoreAccess(request, storeId);
      } catch (error) {
        reply
          .status(403)
          .send({ error: "Forbidden", message: (error as Error).message });
      }
    },
};

export default authorizationPlugin;
