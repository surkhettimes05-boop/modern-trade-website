import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { OTPService } from "../services/otpService.js";
import { SessionService } from "../services/sessionService.js";
import { CustomerService } from "../services/customerService.js";
import { validatePhone } from "../utils/phoneNormalization.js";
import { query } from "../database/connection.js";
import { authenticateStaff } from "../middleware/authentication.js";
import { AuthenticatedUser } from "../plugins/authorization.js";
import crypto from "node:crypto";
import { TwilioVerifyUnavailableError } from "../services/twilioVerifyService.js";
import {
  GoogleIdentityConfigurationError,
  InvalidGoogleIdTokenError,
  verifyGoogleIdToken,
} from "../services/googleIdentityService.js";
import {
  findCustomerByGoogleSubject,
  linkGoogleIdentityToCustomer,
  touchGoogleIdentity,
} from "../services/googleCustomerIdentityService.js";
import {
  CUSTOMER_CSRF_COOKIE,
  CUSTOMER_SESSION_COOKIE,
  authenticateCustomer,
  customerSessionToken,
} from "../middleware/customerAuthentication.js";
import { csrfMatches } from "../utils/csrf.js";

const otpService = new OTPService();
const sessionService = new SessionService();
const customerService = new CustomerService();

async function createCustomerWebSession(
  request: FastifyRequest,
  reply: FastifyReply,
  customerId: string,
) {
  await query(
    `UPDATE customers
        SET last_login_at = CURRENT_TIMESTAMP, last_login_ip = $1
      WHERE id = $2`,
    [(request as any).ip, customerId],
  );

  const session = await sessionService.createSession({
    customer_id: customerId,
    ip_address: (request as any).ip,
    user_agent: request.headers["user-agent"],
  });
  const csrfToken = crypto.randomBytes(32).toString("hex");

  reply.setCookie(CUSTOMER_SESSION_COOKIE, session.session_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60,
  });
  reply.setCookie(CUSTOMER_CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60,
  });

  return session;
}

export async function authRoutes(fastify: FastifyInstance) {
  fastify.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
  });
  const requireStaffAdmin = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    if (!(request as any).cookies?.ops_session) {
      return reply.status(401).send({ error: "Staff authentication required" });
    }
    await authenticateStaff(request, reply);
    if (reply.sent) return;

    const user = request.user as AuthenticatedUser;
    const isPrivileged =
      user.roleKey === "platform_admin" ||
      user.capabilities.includes("system.manage");
    if (!isPrivileged) {
      return reply.status(403).send({
        error: "Forbidden",
        message: "Administrative session management requires system.manage",
      });
    }
    if (!user.mfaEnabled || !user.mfaVerified) {
      return reply.status(403).send({
        error: "Forbidden",
        message:
          "Verified MFA is required for administrative session management",
        code: "MFA_REQUIRED",
      });
    }
    if (!csrfMatches(request)) {
      return reply.status(403).send({
        error: "CSRF validation failed",
        code: "CSRF_INVALID",
        requestId: request.id,
      });
    }
  };
  // Public: Request OTP for login/verification
  fastify.post(
    "/otp/request",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const schema = z.object({
        phone: z.string().min(10),
        purpose: z.literal("LOGIN"),
      });

      try {
        const body = schema.parse(request.body);

        if (!validatePhone(body.phone)) {
          reply.status(400);
          return { error: "Invalid phone number format" };
        }

        const customer = await customerService.findByPhone(body.phone);

        // Login and first-time registration intentionally share one OTP flow.
        // Unknown phone numbers are verified before a customer record is
        // created, avoiding unverified account spam while keeping the public
        // response enumeration-resistant.
        const otp = await otpService.createOTP({
          phone: body.phone,
          purpose: body.purpose,
          customer_id: customer?.id,
          ip_address: (request as any).ip,
          user_agent: request.headers["user-agent"],
        });

        // In production, OTP is sent via SMS
        // For development, return OTP (remove in production)
        if (
          process.env.NODE_ENV === "development" &&
          process.env.EXPOSE_DEVELOPMENT_OTP === "true" &&
          !process.env.SMS_PROVIDER
        ) {
          return { success: true, message: "OTP sent", otp }; // Remove otp in production
        }

        return {
          success: true,
          message: "If a customer exists with this phone, an OTP will be sent",
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          reply.status(400);
          return { error: "Validation failed", details: error.issues };
        }
        if (
          error instanceof Error &&
          (error.message.startsWith("Please wait") ||
            error.message.startsWith("Too many OTP requests"))
        ) {
          reply.status(429);
          return { error: error.message };
        }
        reply.status(503);
        return { error: "OTP delivery is temporarily unavailable" };
      }
    },
  );

  // Public: Verify OTP and create session
  fastify.post(
    "/otp/verify",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const schema = z.object({
        phone: z.string().min(10),
        otp_code: z.string().length(6),
        purpose: z.literal("LOGIN"),
        client: z.enum(["WEB", "APP"]).optional().default("WEB"),
      });

      try {
        const body = schema.parse(request.body);

        if (!validatePhone(body.phone)) {
          reply.status(400);
          return { error: "Invalid phone number format" };
        }

        const verification = await otpService.verifyOTP({
          phone: body.phone,
          otp_code: body.otp_code,
          purpose: body.purpose,
          ip_address: (request as any).ip,
        });

        if (!verification.valid) {
          reply.status(400);
          return { error: "Invalid or expired OTP" };
        }

        let customer = await customerService.findByPhone(body.phone);
        if (!customer) {
          customer = await customerService.createCustomer({
            phone: body.phone,
            enrollment_source: "WEB_SELF_REGISTRATION",
            enrollment_channel: "WEB",
            enrolled_by: "verified-self-registration",
          });
        }

        if (customer.verification_status === "UNVERIFIED") {
          customer = await customerService.markVerified(
            customer.id,
            "OTP_VERIFICATION",
          );
        }

        // Update last login
        await query(
          `UPDATE customers SET last_login_at = CURRENT_TIMESTAMP, last_login_ip = $1 WHERE id = $2`,
          [(request as any).ip, customer.id],
        );

        // Create session
        const session = await sessionService.createSession({
          customer_id: customer.id,
          ip_address: (request as any).ip,
          user_agent: request.headers["user-agent"],
        });

        const csrfToken = crypto.randomBytes(32).toString("hex");
        reply.setCookie(CUSTOMER_SESSION_COOKIE, session.session_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 24 * 60 * 60,
        });
        reply.setCookie(CUSTOMER_CSRF_COOKIE, csrfToken, {
          httpOnly: false,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 24 * 60 * 60,
        });
        return {
          success: true,
          message: "Login successful",
          ...(body.client === "APP"
            ? { session_token: session.session_token }
            : {}),
          customer: {
            id: customer.id,
            phone_masked: customer.phone_masked,
            preferred_name: customer.preferred_name,
            verification_status: customer.verification_status,
          },
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          reply.status(400);
          return { error: "Validation failed", details: error.issues };
        }
        if (error instanceof TwilioVerifyUnavailableError) {
          reply.status(503);
          return { error: "OTP verification is temporarily unavailable" };
        }
        reply.status(500);
        return { error: "Failed to verify OTP" };
      }
    },
  );

  // Public: Sign in with a Google ID token issued for this web client.
  fastify.post(
    "/google",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const schema = z.object({
        credential: z.string().min(100).max(10000),
      });

      try {
        const body = schema.parse(request.body);
        const identity = await verifyGoogleIdToken(body.credential);
        const linked = await findCustomerByGoogleSubject(identity.subject);

        if (!linked) {
          return {
            success: true,
            requires_phone_verification: true,
            google_profile: {
              email: identity.email,
              preferred_name: identity.displayName,
            },
          };
        }

        const customer = await customerService.findById(linked.customer_id);
        if (!customer) {
          reply.status(403);
          return { error: "This Google account is not linked to an active customer" };
        }

        await touchGoogleIdentity(identity.subject, identity);
        await createCustomerWebSession(request, reply, customer.id);

        return {
          success: true,
          requires_phone_verification: false,
          customer: {
            id: customer.id,
            phone_masked: customer.phone_masked,
            preferred_name: customer.preferred_name,
            verification_status: customer.verification_status,
          },
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          reply.status(400);
          return { error: "Validation failed", details: error.issues };
        }
        if (error instanceof GoogleIdentityConfigurationError) {
          reply.status(503);
          return { error: "Google sign-in is not configured" };
        }
        if (error instanceof InvalidGoogleIdTokenError) {
          reply.status(401);
          return { error: "Google sign-in could not be verified" };
        }
        reply.status(500);
        return { error: "Google sign-in failed" };
      }
    },
  );

  // Public: First Google sign-in requires one verified Nepal phone number.
  // The same Google credential is verified again here; the browser cannot
  // choose or forge the Google subject that becomes linked.
  fastify.post(
    "/google/link",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const schema = z.object({
        credential: z.string().min(100).max(10000),
        phone: z.string().min(10),
        otp_code: z.string().length(6),
      });

      try {
        const body = schema.parse(request.body);
        if (!validatePhone(body.phone)) {
          reply.status(400);
          return { error: "Invalid phone number format" };
        }

        const identity = await verifyGoogleIdToken(body.credential);
        const alreadyLinked = await findCustomerByGoogleSubject(identity.subject);
        if (alreadyLinked) {
          const linkedCustomer = await customerService.findById(
            alreadyLinked.customer_id,
          );
          if (!linkedCustomer) {
            reply.status(403);
            return { error: "This Google account is not linked to an active customer" };
          }
          await touchGoogleIdentity(identity.subject, identity);
          await createCustomerWebSession(request, reply, linkedCustomer.id);
          return {
            success: true,
            customer: {
              id: linkedCustomer.id,
              phone_masked: linkedCustomer.phone_masked,
              preferred_name: linkedCustomer.preferred_name,
              verification_status: linkedCustomer.verification_status,
            },
          };
        }

        const verification = await otpService.verifyOTP({
          phone: body.phone,
          otp_code: body.otp_code,
          purpose: "LOGIN",
          ip_address: (request as any).ip,
        });
        if (!verification.valid) {
          reply.status(400);
          return { error: "Invalid or expired OTP" };
        }

        let customer = await customerService.findByPhone(body.phone);
        if (!customer) {
          customer = await customerService.createCustomer({
            phone: body.phone,
            preferred_name: identity.displayName,
            email: identity.email,
            enrollment_source: "WEB_GOOGLE_REGISTRATION",
            enrollment_channel: "WEB",
            enrolled_by: "google-phone-verification",
          });
        }
        if (customer.verification_status === "UNVERIFIED") {
          customer = await customerService.markVerified(
            customer.id,
            "GOOGLE_PHONE_OTP_VERIFICATION",
          );
        }

        await linkGoogleIdentityToCustomer(customer.id, identity);
        await query(
          `UPDATE customers
              SET email = COALESCE(email, $1),
                  preferred_name = COALESCE(preferred_name, $2),
                  updated_by = 'GOOGLE_LINK'
            WHERE id = $3`,
          [identity.email ?? null, identity.displayName ?? null, customer.id],
        );
        const refreshedCustomer =
          (await customerService.findById(customer.id)) ?? customer;
        await createCustomerWebSession(request, reply, customer.id);

        return {
          success: true,
          customer: {
            id: refreshedCustomer.id,
            phone_masked: refreshedCustomer.phone_masked,
            preferred_name: refreshedCustomer.preferred_name,
            verification_status: refreshedCustomer.verification_status,
          },
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          reply.status(400);
          return { error: "Validation failed", details: error.issues };
        }
        if (error instanceof GoogleIdentityConfigurationError) {
          reply.status(503);
          return { error: "Google sign-in is not configured" };
        }
        if (error instanceof InvalidGoogleIdTokenError) {
          reply.status(401);
          return { error: "Google sign-in could not be verified" };
        }
        if (error instanceof TwilioVerifyUnavailableError) {
          reply.status(503);
          return { error: "OTP verification is temporarily unavailable" };
        }
        if (
          error instanceof Error &&
          error.message.includes("already linked to another customer")
        ) {
          reply.status(409);
          return { error: error.message };
        }
        reply.status(500);
        return { error: "Failed to link Google account" };
      }
    },
  );

  // Public: Validate session
  fastify.get("/session/validate", async (request, reply) => {
    const sessionToken = customerSessionToken(request);

    if (!sessionToken) {
      reply.status(401);
      return { error: "No session token provided" };
    }

    try {
      const session = await sessionService.validateSession(sessionToken);

      if (!session) {
        reply.status(401);
        return { error: "Invalid or expired session" };
      }

      // Get customer details
      const customer = await customerService.findById(session.customer_id);
      if (!customer) {
        reply.status(404);
        return { error: "Customer not found" };
      }

      return {
        valid: true,
        customer: {
          id: customer.id,
          phone_masked: customer.phone_masked,
          preferred_name: customer.preferred_name,
          email: customer.email,
          language: customer.language,
          verification_status: customer.verification_status,
        },
      };
    } catch {
      reply.status(500);
      return { error: "Failed to validate session" };
    }
  });

  // Public: Logout (revoke session)
  fastify.post(
    "/logout",
    { onRequest: authenticateCustomer },
    async (request, reply) => {
      const sessionToken = customerSessionToken(request);

      if (!sessionToken) {
        reply.status(401);
        return { error: "No session token provided" };
      }

      try {
        await sessionService.revokeSession(sessionToken, "User logout");
        reply.clearCookie(CUSTOMER_SESSION_COOKIE, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
        });
        reply.clearCookie(CUSTOMER_CSRF_COOKIE, {
          httpOnly: false,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
        });
        return { success: true, message: "Logged out successfully" };
      } catch {
        reply.status(500);
        return { error: "Failed to logout" };
      }
    },
  );

  // Public: Revoke all sessions (for security)
  fastify.post(
    "/logout-all",
    { onRequest: authenticateCustomer },
    async (request, reply) => {
      const sessionToken = customerSessionToken(request);

      if (!sessionToken) {
        reply.status(401);
        return { error: "No session token provided" };
      }

      try {
        const session = await sessionService.validateSession(sessionToken);
        if (!session) {
          reply.status(401);
          return { error: "Invalid or expired session" };
        }

        const count = await sessionService.revokeAllCustomerSessions(
          session.customer_id,
          "User requested logout from all devices",
        );

        return { success: true, message: `Logged out from ${count} devices` };
      } catch {
        reply.status(500);
        return { error: "Failed to logout from all devices" };
      }
    },
  );

  // Public: Get active sessions
  fastify.get("/sessions", async (request, reply) => {
    const sessionToken = customerSessionToken(request);

    if (!sessionToken) {
      reply.status(401);
      return { error: "No session token provided" };
    }

    try {
      const session = await sessionService.validateSession(sessionToken);
      if (!session) {
        reply.status(401);
        return { error: "Invalid or expired session" };
      }

      const sessions = await sessionService.getCustomerSessions(
        session.customer_id,
      );

      // Mask sensitive information
      return {
        sessions: sessions.map((s) => ({
          id: s.id,
          created_at: s.created_at,
          last_activity_at: s.last_activity_at,
          expires_at: s.expires_at,
          ip_address: s.ip_address,
          is_current: s.id === session.id,
        })),
      };
    } catch {
      reply.status(500);
      return { error: "Failed to fetch sessions" };
    }
  });

  // Admin: OTP statistics
  fastify.get(
    "/admin/otp/stats",
    { onRequest: requireStaffAdmin },
    async (_request, reply) => {
      try {
        const stats = await otpService.getOTPStats();
        return stats;
      } catch {
        reply.status(500);
        return { error: "Failed to fetch OTP statistics" };
      }
    },
  );

  // Admin: Session statistics
  fastify.get(
    "/admin/session/stats",
    { onRequest: requireStaffAdmin },
    async (_request, reply) => {
      try {
        const stats = await sessionService.getSessionStats();
        return stats;
      } catch {
        reply.status(500);
        return { error: "Failed to fetch session statistics" };
      }
    },
  );

  // Admin: Cleanup expired OTPs
  fastify.post(
    "/admin/otp/cleanup",
    { onRequest: requireStaffAdmin },
    async (_request, reply) => {
      try {
        const count = await otpService.cleanupExpiredOTPs();
        return { success: true, cleaned: count };
      } catch {
        reply.status(500);
        return { error: "Failed to cleanup expired OTPs" };
      }
    },
  );

  // Admin: Cleanup old sessions
  fastify.post(
    "/admin/session/cleanup",
    { onRequest: requireStaffAdmin },
    async (_request, reply) => {
      try {
        const count = await sessionService.cleanupOldSessions();
        return { success: true, cleaned: count };
      } catch {
        reply.status(500);
        return { error: "Failed to cleanup old sessions" };
      }
    },
  );
}
