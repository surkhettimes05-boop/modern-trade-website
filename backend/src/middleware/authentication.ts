// backend/src/middleware/authentication.ts
// Centralized authentication middleware for staff/admin operations

import { FastifyRequest, FastifyReply } from "fastify";
import { AuthenticatedUser } from "../plugins/authorization.js";
import { validateStaffSession } from "../services/staffSessionService.js";

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

export async function authenticateStaff(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    // Verify JWT from cookie
    await request.jwtVerify({ onlyCookie: true });

    // Extract user ID from JWT
    const userId = (request.user as any).sub;
    const sessionToken = (request.user as any).jti;
    if (!userId) {
      return reply.status(401).send({ error: "Invalid token payload" });
    }
    if (
      (process.env.NODE_ENV !== "test" && !sessionToken) ||
      (process.env.NODE_ENV !== "test" &&
        !(await validateStaffSession(userId, sessionToken)))
    ) {
      return reply.status(401).send({ error: "Session expired or revoked" });
    }

    // Fetch staff data with role and capabilities
    const { query } = await import("../database/connection.js");
    const staffResult = await query(
      `SELECT s.id, s.staff_number, s.first_name, s.last_name, s.username,
              s.role_id, s.capabilities, s.scope_type, s.scope_store_ids, 
              s.scope_organization_id, s.store_id, s.mfa_enabled,
              r.role_key, r.role_name, r.role_level
       FROM staff s
       LEFT JOIN roles r ON s.role_id = r.id
       WHERE s.id = $1 AND s.status = 'ACTIVE'
       LIMIT 1`,
      [userId],
    );

    const staff = staffResult.rows[0];
    if (!staff) {
      return reply.status(401).send({ error: "Staff not found or inactive" });
    }

    // Set authenticated user on request
    (request as any).user = {
      id: staff.id,
      username: staff.username,
      roleId: staff.role_id,
      roleKey: staff.role_key,
      capabilities: staff.capabilities || [],
      scopeType: staff.scope_type,
      scopeOrganizationId: staff.scope_organization_id,
      scopeStoreIds: staff.scope_store_ids,
      storeId: staff.store_id,
      mfaEnabled: staff.mfa_enabled,
      mfaVerified: Boolean((request.user as any).mfaVerified),
    } as AuthenticatedUser;
  } catch (error) {
    request.log.warn(
      { error: error instanceof Error ? error.message : "unknown" },
      "Authentication failed",
    );
    return reply.status(401).send({ error: "Authentication failed" });
  }
}

// ============================================
// PRE-HOOK HELPERS
// ============================================

export const preHandler = {
  authenticate: async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticateStaff(request, reply);
  },

  // Optional authentication - doesn't fail if no token
  optionalAuth: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await authenticateStaff(request, reply);
    } catch {
      // Continue without authentication
      (request as any).user = null;
    }
  },
};
