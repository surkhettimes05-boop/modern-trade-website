import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPool, query } from "../database/connection.js";
import { validatePhone } from "../utils/phoneNormalization.js";
import { creatorReferralLink } from "../utils/creatorReferralLink.js";

const createSchema = z.object({
  display_name: z.string().trim().min(2).max(120),
  contact_phone: z.string().trim().min(10).max(20).refine(validatePhone, "A valid Nepal mobile number is required for creator OTP login."),
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
           (SELECT COALESCE(SUM(cogs_npr), 0)::text FROM creator_purchase_events WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day') AND event_status <> 'REVERSED' AND cost_status = 'VERIFIED') AS verified_cogs_npr,
           (SELECT COUNT(*)::int FROM creator_purchase_events WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day') AND event_status <> 'REVERSED' AND cost_status <> 'VERIFIED') AS purchases_missing_cogs,
           (SELECT CASE WHEN COUNT(*) FILTER (WHERE event_status <> 'REVERSED') > 0 AND COUNT(*) FILTER (WHERE event_status <> 'REVERSED' AND cost_status <> 'VERIFIED') = 0
             THEN COALESCE(SUM(eligible_spend_npr - COALESCE(cogs_npr, 0) - reward_amount_npr) FILTER (WHERE event_status <> 'REVERSED'), 0)::text
             ELSE NULL END FROM creator_purchase_events WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')) AS contribution_after_cogs_rewards_npr,
           (SELECT COUNT(*)::int FROM creator_customer_attributions a WHERE a.attributed_at >= $1::date AND a.attributed_at < ($2::date + INTERVAL '1 day') AND EXISTS (SELECT 1 FROM creator_purchase_events p WHERE p.customer_id = a.customer_id AND p.creator_id = a.creator_id AND p.created_at >= $1::date AND p.created_at < ($2::date + INTERVAL '1 day') AND p.event_status <> 'REVERSED')) AS converted_customers`,
        params,
      ),
      query(
        `SELECT source_system, COUNT(*)::int AS purchase_events,
                COALESCE(SUM(eligible_spend_npr), 0) AS attributed_sales_npr,
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
                COALESCE(p.sales_npr, 0) AS attributed_sales_npr
           FROM (SELECT generate_series($1::date, $2::date, INTERVAL '1 day')::date AS day) days
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
                (SELECT COUNT(*)::int FROM creator_referral_visits v
                  WHERE v.creator_id = c.id AND v.created_at >= $1::date AND v.created_at < ($2::date + INTERVAL '1 day')) AS visits,
                (SELECT COUNT(*)::int FROM creator_customer_attributions a
                  WHERE a.creator_id = c.id AND a.attributed_at >= $1::date AND a.attributed_at < ($2::date + INTERVAL '1 day')) AS registered_customers,
                (SELECT COUNT(DISTINCT p.customer_id)::int FROM creator_purchase_events p
                  WHERE p.creator_id = c.id AND p.created_at >= $1::date AND p.created_at < ($2::date + INTERVAL '1 day') AND p.event_status <> 'REVERSED') AS purchasing_customers,
                (SELECT COUNT(*)::int FROM creator_purchase_events p
                  WHERE p.creator_id = c.id AND p.created_at >= $1::date AND p.created_at < ($2::date + INTERVAL '1 day') AND p.event_status <> 'REVERSED') AS purchase_events,
                (SELECT COALESCE(SUM(p.eligible_spend_npr), 0)::text FROM creator_purchase_events p
                  WHERE p.creator_id = c.id AND p.created_at >= $1::date AND p.created_at < ($2::date + INTERVAL '1 day') AND p.event_status <> 'REVERSED') AS attributed_sales_npr,
                (SELECT COALESCE(SUM(p.reward_amount_npr), 0)::text FROM creator_purchase_events p
                  WHERE p.creator_id = c.id AND p.created_at >= $1::date AND p.created_at < ($2::date + INTERVAL '1 day') AND p.event_status IN ('PENDING','APPROVED','PAID')) AS reward_cost_npr,
                (SELECT COALESCE(SUM(p.cogs_npr), 0)::text FROM creator_purchase_events p
                  WHERE p.creator_id = c.id AND p.created_at >= $1::date AND p.created_at < ($2::date + INTERVAL '1 day') AND p.event_status <> 'REVERSED' AND p.cost_status = 'VERIFIED') AS verified_cogs_npr,
                (SELECT COUNT(*)::int FROM creator_purchase_events p
                  WHERE p.creator_id = c.id AND p.created_at >= $1::date AND p.created_at < ($2::date + INTERVAL '1 day') AND p.event_status <> 'REVERSED' AND p.cost_status <> 'VERIFIED') AS purchases_missing_cogs,
                (SELECT CASE WHEN COUNT(*) FILTER (WHERE p.event_status <> 'REVERSED') > 0 AND COUNT(*) FILTER (WHERE p.event_status <> 'REVERSED' AND p.cost_status <> 'VERIFIED') = 0
                  THEN COALESCE(SUM(p.eligible_spend_npr - COALESCE(p.cogs_npr, 0) - p.reward_amount_npr) FILTER (WHERE p.event_status <> 'REVERSED'), 0) 
                  ELSE NULL END FROM creator_purchase_events p
                  WHERE p.creator_id = c.id AND p.created_at >= $1::date AND p.created_at < ($2::date + INTERVAL '1 day')) AS contribution_after_cogs_rewards_npr
           FROM creators c
          ORDER BY contribution_after_cogs_rewards_npr DESC NULLS LAST,
                   attributed_sales_npr DESC, purchasing_customers DESC
          LIMIT 20`,
        params,
      )
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
        available: Number(metrics.completed_purchase_events ?? 0) > 0 && Number(metrics.purchases_missing_cogs ?? 0) === 0,
        verified_cogs_npr: String(metrics.verified_cogs_npr ?? "0.00"),
        purchases_missing_cogs: Number(metrics.purchases_missing_cogs ?? 0),
        contribution_after_cogs_rewards_npr: metrics.contribution_after_cogs_rewards_npr === null
          ? null
          : String(metrics.contribution_after_cogs_rewards_npr),
        scope: "Verified POS item-cost and online consumed-batch snapshots only; contribution is before delivery, staffing, rent, tax and other operating expenses. It is not net profit or ROI.",
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
    return {
      items: result.rows.map((row, index) => {
        const referral = creatorReferralLink(row.referral_slug);
        const purchasingCustomers = Number(row.purchasing_customers ?? 0);
        const creatorLevel =
          purchasingCustomers >= 150 ? "ELITE" :
          purchasingCustomers >= 51 ? "PRO" :
          purchasingCustomers >= 21 ? "RISING" : "STARTER";
        return {
          ...row,
          rank: index + 1,
          creator_level: creatorLevel,
          referral_path: referral.path,
          referral_url: referral.url,
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
    const referral = creatorReferralLink(referralSlug);
    return reply.status(201).send({
      creator: created.rows[0],
      referral_url: referral.url,
      referral_path: referral.path,
      qr_code_ready: Boolean(referral.url),
    });
  });

  fastify.patch("/creators/:id/contact", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({
      contact_phone: z.string().trim().min(10).max(20).refine(validatePhone, "A valid Nepal mobile number is required."),
      contact_email: z.preprocess((value) => value === "" ? null : value, z.string().trim().email().nullable().optional()),
    }).parse(request.body);
    const updated = await query(
      `UPDATE creators SET contact_phone = $2, contact_email = COALESCE($3, contact_email),
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, creator_code, display_name, contact_phone, contact_email, status`,
      [params.id, input.contact_phone, input.contact_email ?? null],
    );
    if (!updated.rowCount) return reply.status(404).send({ error: "Creator not found" });
    return { creator: updated.rows[0] };
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
  // Manual creator settlement: only approved rewards can be paid, and every
  // settlement is recorded as an immutable payout + ledger entry.
  fastify.get("/creator-payouts", async () => {
    const [balances, payouts] = await Promise.all([
      query(`
        SELECT c.id AS creator_id, c.display_name, c.creator_code,
               COALESCE(SUM(p.reward_amount_npr), 0)::text AS approved_balance_npr,
               COUNT(p.id)::int AS approved_purchase_events
          FROM creators c
          LEFT JOIN creator_purchase_events p
            ON p.creator_id = c.id AND p.event_status = 'APPROVED'
         GROUP BY c.id, c.display_name, c.creator_code
        HAVING COALESCE(SUM(p.reward_amount_npr), 0) > 0
         ORDER BY COALESCE(SUM(p.reward_amount_npr), 0) DESC
      `),
      query(`
        SELECT cp.id, cp.creator_id, c.display_name, c.creator_code,
               cp.amount_npr::text, cp.payment_method, cp.payment_reference,
               cp.note, cp.created_by, cp.settled_at
          FROM creator_payouts cp
          JOIN creators c ON c.id = cp.creator_id
         ORDER BY cp.settled_at DESC
         LIMIT 100
      `),
    ]);
    return { eligible: balances.rows, settlements: payouts.rows };
  });

  fastify.post("/creators/:id/payouts", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({
      payment_method: z.enum(["BANK_TRANSFER", "CASH", "WALLET"]),
      payment_reference: z.string().trim().min(2).max(120),
      note: z.string().trim().max(500).optional(),
      idempotency_key: z.string().trim().min(12).max(160),
    }).parse(request.body);
    const actor = (request.user as { email?: string } | undefined)?.email ?? "ADMIN";
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const creator = await client.query(
        "SELECT id FROM creators WHERE id = $1 FOR UPDATE", [params.id],
      );
      if (!creator.rowCount) {
        await client.query("ROLLBACK");
        return reply.status(404).send({ error: "Creator not found" });
      }
      const prior = await client.query(
        "SELECT id, creator_id, amount_npr::text, payment_method, payment_reference, settled_at FROM creator_payouts WHERE idempotency_key = $1",
        [input.idempotency_key],
      );
      if (prior.rowCount) {
        if (prior.rows[0].creator_id !== params.id) {
          await client.query("ROLLBACK");
          return reply.status(409).send({ error: "Idempotency key already belongs to another creator" });
        }
        await client.query("COMMIT");
        return { payout: prior.rows[0], replay: true };
      }
      const approved = await client.query(
        `SELECT id, reward_amount_npr
           FROM creator_purchase_events
          WHERE creator_id = $1 AND event_status = 'APPROVED'
          ORDER BY available_at, id
          FOR UPDATE`,
        [params.id],
      );
      const amount = approved.rows.reduce((sum, row) => sum + Number(row.reward_amount_npr), 0);
      if (!approved.rowCount || amount <= 0) {
        await client.query("ROLLBACK");
        return reply.status(409).send({ error: "No approved creator rewards are available for settlement" });
      }
      const payout = await client.query(
        `INSERT INTO creator_payouts
           (creator_id, amount_npr, payment_method, payment_reference, note,
            idempotency_key, created_by)
         VALUES ($1, $2::numeric, $3, $4, $5, $6, $7)
         RETURNING id, creator_id, amount_npr::text, payment_method,
                   payment_reference, note, created_by, settled_at`,
        [params.id, amount.toFixed(2), input.payment_method, input.payment_reference,
          input.note ?? null, input.idempotency_key, actor],
      );
      await client.query(
        `UPDATE creator_purchase_events
            SET event_status = 'PAID', updated_at = NOW()
          WHERE id = ANY($1::uuid[]) AND event_status = 'APPROVED'`,
        [approved.rows.map((row) => row.id)],
      );
      await client.query(
        `INSERT INTO creator_reward_ledger
           (creator_id, purchase_event_id, entry_type, amount_npr,
            idempotency_key, note, actor)
         VALUES ($1, NULL, 'PAYOUT', $2::numeric, $3, $4, $5)`,
        [params.id, (-amount).toFixed(2), `creator-payout:${input.idempotency_key}`,
          `Manual payout ${payout.rows[0].id}; ${input.payment_method}; ref ${input.payment_reference}`, actor],
      );
      await client.query("COMMIT");
      return reply.status(201).send({ payout: payout.rows[0], paid_purchase_events: approved.rowCount });
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505") {
        return reply.status(409).send({ error: "Payout idempotency key already used" });
      }
      throw error;
    } finally {
      client.release();
    }
  });

}
