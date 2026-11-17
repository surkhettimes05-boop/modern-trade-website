import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../database/connection.js";

const createSchema = z.object({
  display_name: z.string().trim().min(2).max(120),
  contact_phone: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().max(20).optional()),
  contact_email: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().email().optional()),
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


  fastify.get("/creator-analytics", async (request, reply) => {
    const range = z.object({
      from: z.string().date().optional(),
      to: z.string().date().optional(),
    }).parse(request.query);
    const to = range.to ?? new Date().toISOString().slice(0, 10);
    const from = range.from ?? new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    if (from > to) return reply.status(400).send({ error: "The from date must be on or before the to date" });
    const params = [from, to];

    const [summary, channel, trend, leaderboard] = await Promise.all([
      query(
        `SELECT
           (SELECT COUNT(*)::int FROM creators WHERE created_at < ($2::date + INTERVAL '1 day')) AS total_creators,
           (SELECT COUNT(*)::int FROM creators WHERE status = 'ACTIVE') AS active_creators,
           (SELECT COUNT(*)::int FROM creator_referral_visits WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')) AS visits,
           (SELECT COUNT(*)::int FROM creator_customer_attributions WHERE attributed_at >= $1::date AND attributed_at < ($2::date + INTERVAL '1 day')) AS registrations,
           (SELECT COUNT(DISTINCT customer_id)::int FROM creator_purchase_events WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day') AND event_status <> 'REVERSED') AS purchasing_customers,
           (SELECT COUNT(*)::int FROM creator_purchase_events WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day') AND event_status <> 'REVERSED') AS completed_purchase_events,
           (SELECT COALESCE(SUM(eligible_spend_npr), 0)::text FROM creator_purchase_events WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day') AND event_status <> 'REVERSED') AS attributed_sales_npr,
           (SELECT COALESCE(SUM(reward_amount_npr), 0)::text FROM creator_purchase_events WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day') AND event_status = 'PENDING') AS pending_rewards_npr,
           (SELECT COALESCE(SUM(reward_amount_npr), 0)::text FROM creator_purchase_events WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day') AND event_status = 'APPROVED') AS approved_rewards_npr,
           (SELECT COALESCE(SUM(reward_amount_npr), 0)::text FROM creator_purchase_events WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day') AND event_status = 'PAID') AS paid_rewards_npr,
           (SELECT COUNT(*)::int FROM creator_customer_attributions a WHERE a.attributed_at >= $1::date AND a.attributed_at < ($2::date + INTERVAL '1 day') AND EXISTS (SELECT 1 FROM creator_purchase_events p WHERE p.customer_id = a.customer_id AND p.event_status <> 'REVERSED')) AS converted_customers`,
        params,
      ),
      query(
        `SELECT source_system, COUNT(*)::int AS purchase_events,
                COALESCE(SUM(eligible_spend_npr), 0)::text AS attributed_sales_npr,
                COUNT(DISTINCT customer_id)::int AS purchasing_customers
           FROM creator_purchase_events
          WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')
            AND event_status <> 'REVERSED'
          GROUP BY source_system ORDER BY source_system`,
        params,
      ),
      query(
        `SELECT TO_CHAR(day, 'YYYY-MM-DD') AS day,
                COALESCE(v.visits, 0)::int AS visits,
                COALESCE(a.registrations, 0)::int AS registrations,
                COALESCE(p.orders, 0)::int AS purchase_events,
                COALESCE(p.sales_npr, 0)::text AS attributed_sales_npr
           FROM generate_series($1::date, $2::date, INTERVAL '1 day') AS days(day)
           LEFT JOIN (
             SELECT created_at::date AS day, COUNT(*) AS visits
               FROM creator_referral_visits
              WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')
              GROUP BY created_at::date
           ) v USING (day)
           LEFT JOIN (
             SELECT attributed_at::date AS day, COUNT(*) AS registrations
               FROM creator_customer_attributions
              WHERE attributed_at >= $1::date AND attributed_at < ($2::date + INTERVAL '1 day')
              GROUP BY attributed_at::date
           ) a USING (day)
           LEFT JOIN (
             SELECT created_at::date AS day, COUNT(*) AS orders,
                    SUM(eligible_spend_npr) AS sales_npr
               FROM creator_purchase_events
              WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')
                AND event_status <> 'REVERSED'
              GROUP BY created_at::date
           ) p USING (day)
          ORDER BY day`,
        params,
      ),
      query(
        `SELECT c.id, c.display_name, c.creator_code, c.status,
                COUNT(DISTINCT v.id)::int AS visits,
                COUNT(DISTINCT a.customer_id)::int AS registered_customers,
                COUNT(DISTINCT p.customer_id)::int AS purchasing_customers,
                COUNT(DISTINCT p.id)::int AS purchase_events,
                COALESCE(SUM(p.eligible_spend_npr) FILTER (WHERE p.event_status <> 'REVERSED'), 0)::text AS attributed_sales_npr,
                COALESCE(SUM(p.reward_amount_npr) FILTER (WHERE p.event_status IN ('PENDING','APPROVED','PAID')), 0)::text AS reward_cost_npr
           FROM creators c
           LEFT JOIN creator_referral_visits v ON v.creator_id = c.id AND v.created_at >= $1::date AND v.created_at < ($2::date + INTERVAL '1 day')
           LEFT JOIN creator_customer_attributions a ON a.creator_id = c.id AND a.attributed_at >= $1::date AND a.attributed_at < ($2::date + INTERVAL '1 day')
           LEFT JOIN creator_purchase_events p ON p.creator_id = c.id AND p.created_at >= $1::date AND p.created_at < ($2::date + INTERVAL '1 day')
          GROUP BY c.id
          ORDER BY SUM(p.eligible_spend_npr) FILTER (WHERE p.event_status <> 'REVERSED') DESC NULLS LAST,
                   COUNT(DISTINCT p.customer_id) DESC
          LIMIT 20`,
        params,
      ),
    ]);

    const metrics = summary.rows[0] ?? {};
    const visits = Number(metrics.visits ?? 0);
    const registrations = Number(metrics.registrations ?? 0);
    const purchasingCustomers = Number(metrics.purchasing_customers ?? 0);
    return {
      period: { from, to },
      metrics: {
        total_creators: Number(metrics.total_creators ?? 0),
        active_creators: Number(metrics.active_creators ?? 0),
        visits,
        registrations,
        purchasing_customers: purchasingCustomers,
        completed_purchase_events: Number(metrics.completed_purchase_events ?? 0),
        attributed_sales_npr: String(metrics.attributed_sales_npr ?? "0.00"),
        pending_rewards_npr: String(metrics.pending_rewards_npr ?? "0.00"),
        approved_rewards_npr: String(metrics.approved_rewards_npr ?? "0.00"),
        paid_rewards_npr: String(metrics.paid_rewards_npr ?? "0.00"),
        visit_to_registration_percent: visits ? Number((registrations / visits * 100).toFixed(2)) : 0,
        registration_to_purchase_percent: registrations ? Number((Number(metrics.converted_customers ?? 0) / registrations * 100).toFixed(2)) : 0,
      },
      channels: channel.rows,
      daily: trend.rows,
      leaderboard: leaderboard.rows,
      profitability: {
        available: false,
        reason: "Order-level cost of goods sold and contribution margin are not yet connected to creator purchase events. Attributed sales and reward cost are reported; profit and ROI are intentionally not estimated.",
      },
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
        ORDER BY purchasing_customers DESC, attributed_spend_npr::numeric DESC, c.created_at DESC`,
    );
    const apiBase = process.env.PUBLIC_API_BASE_URL || "";
    return {
      items: result.rows.map((row, index) => {
        const referralPath = "/api/public/creators/" + row.referral_slug + "/visit";
        const purchasingCustomers = Number(row.purchasing_customers ?? 0);
        const creatorLevel =
          purchasingCustomers >= 150 ? "ELITE" :
          purchasingCustomers >= 51 ? "PRO" :
          purchasingCustomers >= 21 ? "RISING" : "STARTER";
        return {
          ...row,
          rank: index + 1,
          creator_level: creatorLevel,
          referral_path: referralPath,
          referral_url: apiBase ? new URL(referralPath, apiBase).toString() : null,
        };
      }),
    };
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
