import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { query } from "../database/connection.js";
import { OTPService } from "../services/otpService.js";
import { normalizePhone, validatePhone } from "../utils/phoneNormalization.js";

const otp = new OTPService();
const SESSION_COOKIE = "pasalho_creator_session";
const CSRF_COOKIE = "pasalho_creator_csrf";
const SESSION_DAYS = 7;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

function csrfMatches(request: FastifyRequest) {
  const cookie = (request as any).cookies?.[CSRF_COOKIE];
  const header = request.headers["x-csrf-token"];
  if (typeof cookie !== "string" || typeof header !== "string") return false;
  const a = Buffer.from(cookie); const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function currentCreator(request: FastifyRequest) {
  const token = (request as any).cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length < 32) return null;
  const result = await query(
    `SELECT c.id, c.creator_code, c.display_name, c.contact_phone, c.status, c.referral_slug
       FROM creator_portal_sessions s JOIN creators c ON c.id = s.creator_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()
        AND c.status = 'ACTIVE' LIMIT 1`,
    [digest(token)],
  );
  return result.rows[0] ?? null;
}

export async function creatorPortalRoutes(fastify: FastifyInstance) {
  fastify.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
    reply.header("vary", "Cookie");
  });

  fastify.post("/otp/request", { config: { rateLimit: { max: 4, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const parsed = z.object({ phone: z.string().min(10).max(20) }).safeParse(request.body);
    if (!parsed.success || !validatePhone(parsed.data.phone)) return reply.status(400).send({ error: "Enter a valid Nepal mobile number." });
    const phone = normalizePhone(parsed.data.phone);
    const creator = await query(
      "SELECT id FROM creators WHERE RIGHT(regexp_replace(contact_phone, '\\D', '', 'g'), 10) = $1 AND status = 'ACTIVE' LIMIT 1",
      [phone],
    );
    // Keep the response identical for registered and unregistered numbers.
    if (creator.rowCount) await otp.createOTP({
      phone: parsed.data.phone, purpose: "CREATOR_LOGIN",
      ip_address: (request as any).ip, user_agent: request.headers["user-agent"],
    });
    return { success: true, message: "If this number is registered to an active Pasalho creator, a login code will be sent." };
  });

  fastify.post("/otp/verify", { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const parsed = z.object({ phone: z.string().min(10).max(20), otp_code: z.string().regex(/^\\d{6}$/) }).safeParse(request.body);
    if (!parsed.success || !validatePhone(parsed.data.phone)) return reply.status(400).send({ error: "Invalid phone number or code." });
    const phone = normalizePhone(parsed.data.phone);
    const creator = await query(
      "SELECT id FROM creators WHERE RIGHT(regexp_replace(contact_phone, '\\D', '', 'g'), 10) = $1 AND status = 'ACTIVE' LIMIT 1",
      [phone],
    );
    if (!creator.rowCount) return reply.status(401).send({ error: "Invalid or expired code." });
    const verified = await otp.verifyOTP({ phone: parsed.data.phone, otp_code: parsed.data.otp_code, purpose: "CREATOR_LOGIN", ip_address: (request as any).ip });
    if (!verified.valid) return reply.status(401).send({ error: "Invalid or expired code." });

    const token = randomBytes(32).toString("base64url");
    const csrf = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
    await query(
      `INSERT INTO creator_portal_sessions (creator_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [creator.rows[0].id, digest(token), expiresAt, (request as any).ip ?? null, request.headers["user-agent"] ?? null],
    );
    const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", expires: expiresAt };
    reply.setCookie(SESSION_COOKIE, token, options);
    reply.setCookie(CSRF_COOKIE, csrf, { ...options, httpOnly: false });
    return { success: true, expires_at: expiresAt.toISOString() };
  });

  fastify.get("/me", async (request, reply) => {
    const creator = await currentCreator(request);
    if (!creator) return reply.status(401).send({ error: "Creator login required." });
    const referralPath = "/api/public/creators/" + encodeURIComponent(creator.referral_slug) + "/visit";
    const apiBase = process.env.PUBLIC_API_BASE_URL || "";
    return { creator: {
      id: creator.id, code: creator.creator_code, name: creator.display_name,
      phone_masked: String(creator.contact_phone ?? "").replace(/.(?=.{4})/g, "•"),
      referral_slug: creator.referral_slug,
      referral_url: apiBase ? new URL(referralPath, apiBase).toString() : referralPath,
    } };
  });

  fastify.get("/overview", async (request, reply) => {
    const creator = await currentCreator(request);
    if (!creator) return reply.status(401).send({ error: "Creator login required." });
    const [summary, purchases, ledger] = await Promise.all([
      query(
        `SELECT
          (SELECT COUNT(*)::int FROM creator_referral_visits WHERE creator_id = $1) AS clicks,
          (SELECT COUNT(*)::int FROM creator_customer_attributions WHERE creator_id = $1) AS registrations,
          COUNT(*) FILTER (WHERE p.event_status <> 'REVERSED')::int AS purchases,
          COUNT(DISTINCT p.customer_id) FILTER (WHERE p.event_status <> 'REVERSED')::int AS purchasing_customers,
          COALESCE(SUM(p.eligible_spend_npr) FILTER (WHERE p.event_status <> 'REVERSED'), 0)::text AS attributed_sales_npr,
          COALESCE(SUM(p.reward_amount_npr) FILTER (WHERE p.event_status <> 'REVERSED'), 0)::text AS gross_rewards_npr
         FROM creator_purchase_events p WHERE p.creator_id = $1`, [creator.id]),
      query(
        `SELECT source_system, source_transaction_number, eligible_spend_npr::text,
                reward_amount_npr::text, event_status, eligible_at, available_at
           FROM creator_purchase_events WHERE creator_id = $1 ORDER BY eligible_at DESC LIMIT 25`, [creator.id]),
      query(
        `SELECT
          COALESCE(SUM(CASE WHEN entry_type IN ('EARN','ADJUSTMENT') THEN amount_npr
                            WHEN entry_type IN ('REVERSAL','PAYOUT') THEN -ABS(amount_npr) ELSE 0 END), 0)::text AS balance_npr,
          COALESCE(SUM(CASE WHEN entry_type = 'EARN' THEN amount_npr ELSE 0 END), 0)::text AS earned_npr,
          COALESCE(SUM(CASE WHEN entry_type = 'REVERSAL' THEN ABS(amount_npr) ELSE 0 END), 0)::text AS reversed_npr,
          COALESCE(SUM(CASE WHEN entry_type = 'PAYOUT' THEN ABS(amount_npr) ELSE 0 END), 0)::text AS paid_npr
         FROM creator_reward_ledger WHERE creator_id = $1`, [creator.id]),
    ]);
    return { summary: summary.rows[0], purchases: purchases.rows, ledger: ledger.rows[0], profitability_status: "NOT_AVAILABLE_COGS_AND_REFUND_RECONCILIATION_PENDING" };
  });

  fastify.post("/logout", async (request, reply) => {
    if (!csrfMatches(request)) return reply.status(403).send({ error: "CSRF validation failed." });
    const token = (request as any).cookies?.[SESSION_COOKIE];
    if (typeof token === "string") await query(
      "UPDATE creator_portal_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL", [digest(token)]);
    const options = { path: "/", secure: process.env.NODE_ENV === "production", sameSite: "lax" as const };
    reply.clearCookie(SESSION_COOKIE, options); reply.clearCookie(CSRF_COOKIE, options);
    return { success: true };
  });
}
