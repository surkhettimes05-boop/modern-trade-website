import { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcrypt";
import { query } from "../database/connection.js";
import crypto from "node:crypto";
import {
  createStaffSession,
  newCsrfToken,
  revokeStaffSession,
  STAFF_SESSION_TTL_SECONDS,
} from "../services/staffSessionService.js";
import { CSRF_COOKIE } from "../utils/csrf.js";
import { hashSessionToken } from "../utils/sessionToken.js";
import { verifyTotp } from "../utils/totp.js";
import { recordSecurityEvent } from "../services/securityEventService.js";

// Used when a username is absent so password verification has comparable cost.
const DUMMY_PASSWORD_HASH =
  "$2b$12$xivHf6wb78nEE2SHJHHUQeJHAbFq4JYxoOrAYVg6q6PHfwV2oWKky";

export async function operationsAuthRoutes(fastify: FastifyInstance) {
  fastify.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
  });
  fastify.post(
    "/login",
    {
      config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      const { username, password, mfa_code } = z
        .object({
          username: z.string().min(1).max(100),
          password: z.string().min(8).max(200),
          mfa_code: z
            .string()
            .regex(/^\d{6}$/)
            .optional(),
        })
        .parse(request.body);

      const result = await query(
        `SELECT s.id, s.staff_number, s.first_name, s.last_name, s.username, s.password_hash,
              s.role, s.status, s.store_id, s.permissions, s.failed_login_attempts, s.locked_until,
              s.role_id, s.capabilities, s.scope_type, s.scope_store_ids, s.scope_organization_id,
              s.mfa_enabled, s.mfa_secret, r.role_key
       FROM staff s LEFT JOIN roles r ON r.id = s.role_id
       WHERE LOWER(s.username) = LOWER($1) LIMIT 1`,
        [username],
      );
      const staff = result.rows[0];
      const locked = Boolean(
        staff?.locked_until &&
        new Date(staff.locked_until).getTime() > Date.now(),
      );
      const validPassword = await bcrypt.compare(
        password,
        staff?.password_hash || DUMMY_PASSWORD_HASH,
      );
      if (!validPassword || staff?.status !== "ACTIVE" || locked) {
        if (staff?.id) {
          await query(
            `UPDATE staff SET failed_login_attempts = failed_login_attempts + 1, locked_until = CASE WHEN failed_login_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END WHERE id = $1`,
            [staff.id],
          );
        }
        await recordSecurityEvent(request, {
          eventType: "STAFF_LOGIN_FAILURE",
          entityType: "staff_authentication",
          actorId: staff?.id,
          details: { reason: "credential_status_or_lockout" },
        });
        return reply
          .status(401)
          .send({ error: "Invalid username or password" });
      }

      if (staff.mfa_enabled) {
        if (
          !mfa_code ||
          !staff.mfa_secret ||
          !verifyTotp(staff.mfa_secret, mfa_code)
        ) {
          await query(
            `UPDATE staff
                SET failed_login_attempts = failed_login_attempts + 1,
                    locked_until = CASE
                      WHEN failed_login_attempts + 1 >= 5
                      THEN NOW() + INTERVAL '15 minutes'
                      ELSE locked_until
                    END
              WHERE id = $1`,
            [staff.id],
          );
          await recordSecurityEvent(request, {
            eventType: "STAFF_MFA_FAILURE",
            entityType: "staff_authentication",
            actorId: staff.id,
            details: { reason: "invalid_or_missing_mfa" },
          });
          return reply.status(403).send({
            error: "A valid MFA code is required",
            code: "MFA_REQUIRED",
          });
        }
      }

      await query(
        `UPDATE staff SET failed_login_attempts = 0, locked_until = NULL, session_last_rotated_at = NOW() WHERE id = $1`,
        [staff.id],
      );
      const sessionToken = crypto.randomUUID();
      const token = fastify.jwt.sign(
        {
          sub: staff.id,
          username: staff.username,
          role: staff.role,
          roleKey: staff.role_key,
          store_id: staff.store_id,
          permissions: staff.permissions || {},
          mfaVerified: Boolean(staff.mfa_enabled),
        },
        { expiresIn: "8h", jti: sessionToken },
      );
      await createStaffSession({
        staffId: staff.id,
        sessionToken,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
        expiresAt: new Date(Date.now() + STAFF_SESSION_TTL_SECONDS * 1000),
      });
      await recordSecurityEvent(request, {
        eventType: "STAFF_LOGIN_SUCCESS",
        entityType: "staff_authentication",
        actorId: staff.id,
        details: { mfaVerified: Boolean(staff.mfa_enabled) },
      });
      const csrfToken = newCsrfToken();

      reply.setCookie("ops_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 8 * 60 * 60,
      });
      reply.setCookie(CSRF_COOKIE, csrfToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 8 * 60 * 60,
      });
      return reply.send({
        staff: {
          id: staff.id,
          name: `${staff.first_name} ${staff.last_name}`,
          username: staff.username,
          role: staff.role,
          store_id: staff.store_id,
        },
      });
    },
  );

  fastify.post("/logout", async (request, reply) => {
    if (!(
      (request as any).cookies?.[CSRF_COOKIE] &&
      request.headers["x-csrf-token"] === (request as any).cookies[CSRF_COOKIE]
    ))
      return reply.status(403).send({
        error: "CSRF validation failed",
        code: "CSRF_INVALID",
        requestId: request.id,
      });
    let staffId: string | undefined;
    try {
      await request.jwtVerify({ onlyCookie: true });
      staffId = (request.user as any).sub;
      await revokeStaffSession((request.user as any).jti, "logout");
    } catch {
      /* already logged out */
    }
    reply.clearCookie("ops_session", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });
    reply.clearCookie(CSRF_COOKIE, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });
    await recordSecurityEvent(request, {
      eventType: "STAFF_LOGOUT",
      entityType: "staff_authentication",
      actorId: staffId,
    });
    return reply.send({ success: true });
  });

  fastify.get("/session", async (request, reply) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
      const userId = (request.user as any).sub;
      const sessionToken = (request.user as any).jti;
      const sessionResult = await query(
        `SELECT 1 FROM sessions WHERE staff_id = $1 AND session_token = $2 AND is_revoked = FALSE AND expires_at > NOW() AND last_activity_at > NOW() - INTERVAL '30 minutes'`,
        [userId, hashSessionToken(sessionToken)],
      );
      if (!sessionResult.rowCount)
        return reply.status(401).send({ authenticated: false });

      // Fetch comprehensive staff data with role, capabilities, and scope
      const staffResult = await query(
        `SELECT s.id, s.staff_number, s.first_name, s.last_name, s.username,
                s.role_id, s.capabilities, s.scope_type, s.scope_store_ids, 
                s.scope_organization_id, s.store_id, s.mfa_enabled,
                r.role_key, r.role_name, r.role_level,
                o.id as organization_id, o.organization_name, o.country_code,
                o.default_currency_code, o.default_locale, o.default_timezone,
                st.id as store_id, st.name_en as store_name, NULL::text as store_code, st.currency_code,
                st.locale as store_locale, st.timezone as store_timezone,
                st.feature_flags as store_feature_flags
         FROM staff s
         LEFT JOIN roles r ON s.role_id = r.id
         LEFT JOIN organizations o ON s.scope_organization_id = o.id
         LEFT JOIN stores st ON s.store_id = st.id
         WHERE s.id = $1 AND s.status = 'ACTIVE'
         LIMIT 1`,
        [userId],
      );

      const staff = staffResult.rows[0];
      if (!staff) {
        return reply.status(401).send({ authenticated: false });
      }

      // Fetch feature flags for this user's context
      const featureFlagsResult = await query(
        `SELECT flag_key, flag_name, flag_type, default_value, 
                target_countries, target_stores, target_roles, is_active
         FROM feature_flags
         WHERE is_active = true
         AND (target_countries IS NULL OR $1 = ANY(target_countries))
         AND (target_stores IS NULL OR $2 = ANY(target_stores))
         AND (target_roles IS NULL OR $3 = ANY(target_roles))`,
        [staff.country_code, staff.store_id, staff.role_key],
      );

      const featureFlags = featureFlagsResult.rows.reduce(
        (acc, flag) => {
          acc[flag.flag_key] = flag.default_value;
          return acc;
        },
        {} as Record<string, boolean>,
      );

      // Build safe session response
      const sessionData = {
        authenticated: true,
        user: {
          id: staff.id,
          username: staff.username,
          name: `${staff.first_name} ${staff.last_name}`,
          staffNumber: staff.staff_number,
        },
        role: {
          id: staff.role_id,
          key: staff.role_key,
          name: staff.role_name,
          level: staff.role_level,
        },
        capabilities: staff.capabilities || [],
        scope: {
          type: staff.scope_type,
          organizationId: staff.scope_organization_id,
          storeIds: staff.scope_store_ids || [],
        },
        storeAssignment: staff.store_id
          ? {
              id: staff.store_id,
              name: staff.store_name,
              code: staff.store_code,
              currencyCode: staff.currency_code,
              locale: staff.store_locale,
              timezone: staff.store_timezone,
            }
          : null,
        organization: staff.organization_id
          ? {
              id: staff.organization_id,
              name: staff.organization_name,
              countryCode: staff.country_code,
              currencyCode: staff.default_currency_code,
              locale: staff.default_locale,
              timezone: staff.default_timezone,
            }
          : null,
        featureFlags,
        mfa: {
          enabled: staff.mfa_enabled,
          verified: Boolean((request.user as any).mfaVerified),
        },
      };

      return reply.send(sessionData);
    } catch (error) {
      request.log.error({ error }, "Session verification failed");
      return reply.status(401).send({ authenticated: false });
    }
  });
}
