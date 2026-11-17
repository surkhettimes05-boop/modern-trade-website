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
  fastify.get("/creator-reward-settings", async () => {
    const result = await query(
      "SELECT default_rate_percent::text, attribution_window_days, hold_days, updated_at FROM creator_reward_settings WHERE id = 1",
    );
    return { settings: result.rows[0] ?? null };
  });

  fastify.patch("/creator-reward-settings", async (request, reply) => {
    const input = z.object({
      default_rate_percent: z.number().min(0).max(10),
      attribution_window_days: z.number().int().min(1).max(90),
      hold_days: z.number().int().min(0).max(90),
    }).parse(request.body);
    const actor = (request.user as { email?: string } | undefined)?.email ?? "ADMIN";
    const result = await query(
      `UPDATE creator_reward_settings
          SET default_rate_percent = $1, attribution_window_days = $2,
              hold_days = $3, updated_by = $4, updated_at = NOW()
        WHERE id = 1
        RETURNING default_rate_percent::text, attribution_window_days, hold_days, updated_at`,
      [input.default_rate_percent, input.attribution_window_days, input.hold_days, actor],
    );
    return { settings: result.rows[0] };
  });

  fastify.post("/creator-rewards/approve-due", async () => {
    const result = await query(
      `UPDATE creator_purchase_events
          SET event_status = 'APPROVED', updated_at = NOW()
        WHERE event_status = 'PENDING' AND available_at <= NOW()
        RETURNING id, creator_id, reward_amount_npr::text`,
    );
    return {
      approved_count: result.rowCount ?? 0,
      approved_reward_npr: result.rows.reduce((sum, row) => sum + Number(row.reward_amount_npr), 0).toFixed(2),
    };
  });


  fastify.get("/creators", async () => {
    const result = await query(
      `SELECT c.id, c.creator_code, c.display_name, c.contact_phone,
              c.contact_email, c.status, c.referral_slug, c.created_at,
              (SELECT COUNT(*)::int FROM creator_referral_visits v WHERE v.creator_id = c.id) AS scans,
              (SELECT COUNT(*)::int FROM creator_customer_attributions a WHERE a.creator_id = c.id) AS registered_customers,
              (SELECT COUNT(DISTINCT p.customer_id)::int FROM creator_purchase_events p WHERE p.creator_id = c.id) AS purchasing_customers,
              (SELECT COALESCE(SUM(p.eligible_spend_npr), 0)::text FROM creator_purchase_events p WHERE p.creator_id = c.id AND p.event_status <> 'REVERSED') AS attributed_spend_npr,
              (SELECT COALESCE(SUM(p.reward_amount_npr), 0)::text FROM creator_purchase_events p WHERE p.creator_id = c.id AND p.event_status <> 'REVERSED') AS lifetime_reward_npr,
              (SELECT COALESCE(SUM(p.reward_amount_npr), 0)::text FROM creator_purchase_events p WHERE p.creator_id = c.id AND p.event_status = 'PENDING') AS pending_reward_npr
         FROM creators c
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
    const apiBase = process.env.PUBLIC_API_BASE_URL || "";
    const referralPath = `/api/public/creators/${referralSlug}/visit`;
    const referralUrl = apiBase ? new URL(referralPath, apiBase).toString() : null;
    return reply.status(201).send({
      creator: created.rows[0],
      referral_url: referralUrl,
      referral_path: referralPath,
      qr_code_ready: Boolean(referralUrl),
    });
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
              (SELECT COUNT(*)::int FROM creator_referral_visits v WHERE v.creator_id = c.id) AS scans,
              (SELECT COUNT(*)::int FROM creator_customer_attributions a WHERE a.creator_id = c.id) AS registered_customers,
              (SELECT COUNT(DISTINCT p.customer_id)::int FROM creator_purchase_events p WHERE p.creator_id = c.id) AS purchasing_customers,
              (SELECT COALESCE(SUM(p.eligible_spend_npr), 0)::text FROM creator_purchase_events p WHERE p.creator_id = c.id AND p.event_status <> 'REVERSED') AS attributed_spend_npr,
              (SELECT COALESCE(SUM(p.reward_amount_npr), 0)::text FROM creator_purchase_events p WHERE p.creator_id = c.id AND p.event_status <> 'REVERSED') AS earned_reward_npr
         FROM creators c
        WHERE c.id = $1`,
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
