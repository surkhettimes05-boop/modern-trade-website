import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { OTPService } from "../services/otpService.js";
import { SessionService } from "../services/sessionService.js";
import { CustomerService } from "../services/customerService.js";
import { validatePhone } from "../utils/phoneNormalization.js";
import { query } from "../database/connection.js";
import { authenticateStaff } from "../middleware/authentication.js";
import { AuthenticatedUser } from "../plugins/authorization.js";

const otpService = new OTPService();
const sessionService = new SessionService();
const customerService = new CustomerService();

export async function authRoutes(fastify: FastifyInstance) {
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
  };
  // Public: Request OTP for login/verification
  fastify.post("/otp/request", async (request, reply) => {
    const schema = z.object({
      phone: z.string().min(10),
      purpose: z.enum(["LOGIN", "VERIFICATION", "ENROLLMENT"]),
    });

    try {
      const body = schema.parse(request.body);

      if (!validatePhone(body.phone)) {
        reply.status(400);
        return { error: "Invalid phone number format" };
      }

      // Check if customer exists for login purpose
      if (body.purpose === "LOGIN") {
        const customer = await customerService.findByPhone(body.phone);
        if (!customer) {
          // Enumeration-resistant response
          return {
            success: true,
            message: "If a customer exists with this phone, OTP will be sent",
          };
        }
      }

      const otp = await otpService.createOTP({
        phone: body.phone,
        purpose: body.purpose,
        ip_address: (request as any).ip,
        user_agent: request.headers["user-agent"],
      });

      // In production, OTP is sent via SMS
      // For development, return OTP (remove in production)
      if (process.env.NODE_ENV === "development") {
        return { success: true, message: "OTP sent", otp }; // Remove otp in production
      }

      return { success: true, message: "OTP sent" };
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      if (error instanceof Error) {
        reply.status(400);
        return { error: error.message };
      }
      reply.status(500);
      return { error: "Failed to request OTP" };
    }
  });

  // Public: Verify OTP and create session
  fastify.post("/otp/verify", async (request, reply) => {
    const schema = z.object({
      phone: z.string().min(10),
      otp_code: z.string().length(6),
      purpose: z.enum(["LOGIN", "VERIFICATION", "ENROLLMENT"]),
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

      // For login, create session
      if (body.purpose === "LOGIN") {
        const customer = await customerService.findByPhone(body.phone);
        if (!customer) {
          reply.status(404);
          return { error: "Customer not found" };
        }

        // Mark customer as verified if not already
        if (customer.verification_status === "UNVERIFIED") {
          await customerService.markVerified(customer.id, "OTP_VERIFICATION");
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

        return {
          success: true,
          message: "Login successful",
          session_token: session.session_token,
          customer: {
            id: customer.id,
            phone_masked: customer.phone_masked,
            preferred_name: customer.preferred_name,
            verification_status: customer.verification_status,
          },
        };
      }

      // For verification/enrollment, just return success
      return {
        success: true,
        message: "OTP verified successfully",
        customer_id: verification.customer_id,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      reply.status(500);
      return { error: "Failed to verify OTP" };
    }
  });

  // Public: Validate session
  fastify.get("/session/validate", async (request, reply) => {
    const sessionToken = request.headers["authorization"]?.replace(
      "Bearer ",
      "",
    );

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
  fastify.post("/logout", async (request, reply) => {
    const sessionToken = request.headers["authorization"]?.replace(
      "Bearer ",
      "",
    );

    if (!sessionToken) {
      reply.status(401);
      return { error: "No session token provided" };
    }

    try {
      await sessionService.revokeSession(sessionToken, "User logout");
      return { success: true, message: "Logged out successfully" };
    } catch {
      reply.status(500);
      return { error: "Failed to logout" };
    }
  });

  // Public: Revoke all sessions (for security)
  fastify.post("/logout-all", async (request, reply) => {
    const sessionToken = request.headers["authorization"]?.replace(
      "Bearer ",
      "",
    );

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
  });

  // Public: Get active sessions
  fastify.get("/sessions", async (request, reply) => {
    const sessionToken = request.headers["authorization"]?.replace(
      "Bearer ",
      "",
    );

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
