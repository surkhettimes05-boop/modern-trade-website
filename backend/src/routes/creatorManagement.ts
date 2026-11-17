import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../database/connection.js";

const createSchema = z.object({
  display_name: z.string().trim().min(2).max(120),
  contact_phone: z.string().trim().max(20).optional(),
  contact_email: z.string().trim().email().optional(),
});

function slugBase(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "creator";
}

export async function creatorManagementRoutes(fastify: FastifyInstance) {
  fastify.get("/creators", async () => {
    const result = await query(
      `SELECT c.id, c.creator_code, c.display_name, c.contact_phone,
              c.contact_email, c.status, c.referral_slug, c.created_at,
              COUNT(DISTINCT v.id)::int AS scans,
              COUNT(DISTINCT a.customer_id)::int AS registered_customers,
              COUNT(DISTINCT CASE WHEN p.id IS NOT NULL THEN p.customer_id END)::int AS purchasing_customers,
              COALESCE(SUM(p.eligible_spend_npr), 0)::text AS attributed_spend_npr,
              COALESCE(SUM(p.reward_amount_npr), 0)::text AS lifetime_reward_npr,
              COALESCE(SUM(p.reward_amount_npr) FILTER (WHERE p.event_status = 'PENDING'), 0)::text AS pending_reward_npr
         FROM creators c
         LEFT JOIN creator_referral_visits v ON v.creator_id = c.id
         LEFT JOIN creator_customer_attributions a ON a.creator_id = c.id
         LEFT JOIN creator_purchase_events p ON p.creator_id = c.id
        GROUP BY c.id
        ORDER BY c.created_at DESC`,
    );
    return { creators: result.rows };
  });

  fastify.post("/creators", async (request, reply) => {
    const input = createSchema.parse(request.body);
    const base = slugBase(input.display_name);
    const suffix = randomBytes(3).toString("hex");
    const referralSlug = `${base}-${suffix}`;
    const creatorCode = `PAS-${randomBytes(4).toString("hex").toUpperCase()}`;
    const actor = (request.user as { email?: string } | undefined)?.email ?? "ADMIN";
    const created = await query(
      `INSERT INTO creators (
         creator_code, display_name, contact_phone, contact_email,
         referral_slug, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, creator_code, display_name, contact_phone, contact_email,
                 status, referral_slug, created_at`,
      [creatorCode, input.display_name, input.contact_phone ?? null, input.contact_email ?? null, referralSlug, actor],
    );
    const webBase = process.env.CUSTOMER_WEB_URL || process.env.CORS_ORIGIN || "";
    const referralUrl = `${webBase.replace(/\/$/, "")}/api/public/creators/${referralSlug}/visit`;
    return reply.status(201).send({ creator: created.rows[0], referral_url: referralUrl });
  });

  fastify.patch("/creators/:id/status", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({ status: z.enum(["ACTIVE", "PAUSED", "SUSPENDED", "CLOSED"]) }).parse(request.body);
    const updated = await query(
      "UPDATE creators SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING id, creator_code, display_name, status, referral_slug",
      [params.id, input.status],
    );
    if (!updated.rowCount) return reply.status(404).send({ error: "Creator not found" });
    return { creator: updated.rows[0] };
  });

  fastify.get("/creators/:id/performance", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const creator = await query(
      `SELECT c.id, c.creator_code, c.display_name, c.status, c.referral_slug,
              COUNT(DISTINCT v.id)::int AS scans,
              COUNT(DISTINCT a.customer_id)::int AS registered_customers,
              COUNT(DISTINCT p.customer_id)::int AS purchasing_customers,
              COALESCE(SUM(p.eligible_spend_npr), 0)::text AS attributed_spend_npr,
              COALESCE(SUM(p.reward_amount_npr), 0)::text AS earned_reward_npr
         FROM creators c
         LEFT JOIN creator_referral_visits v ON v.creator_id = c.id
         LEFT JOIN creator_customer_attributions a ON a.creator_id = c.id
         LEFT JOIN creator_purchase_events p ON p.creator_id = c.id
        WHERE c.id = $1
        GROUP BY c.id`,
      [params.id],
    );
    if (!creator.rowCount) return reply.status(404).send({ error: "Creator not found" });
    const events = await query(
      `SELECT p.id, p.source_system, p.source_transaction_number,
              p.eligible_spend_npr::text, p.reward_rate_percent::text,
              p.reward_amount_npr::text, p.event_status, p.eligible_at, p.available_at
         FROM creator_purchase_events p
        WHERE p.creator_id = $1
        ORDER BY p.created_at DESC LIMIT 100`,
      [params.id],
    );
    return { creator: creator.rows[0], purchases: events.rows };
  });
}
