import Fastify from "fastify";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { query } from "../../database/connection.js";
import { creatorManagementRoutes } from "../creatorManagement.js";

describe("creator analytics reporting", () => {
  // Exercise the endpoint against the same PostgreSQL tables used by the service.
  it("reports attributed commerce and POS sales without counting reversed events", async () => {
    const creatorId = randomUUID();
    const customerId = randomUUID();
    const visitId = randomUUID();
    const phone = `+97798${String(Date.now()).slice(-8)}`;
    const phoneHash = createHash("sha256").update(randomBytes(32)).digest("hex");
    const slug = `qa-${randomBytes(8).toString("hex")}`;
    const code = `QA-${randomBytes(6).toString("hex").toUpperCase()}`;
    const eventIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const today = new Date().toISOString().slice(0, 10);
    const app = Fastify();

    try {
      await query(
        `INSERT INTO creators (id, creator_code, display_name, referral_slug, created_by)
         VALUES ($1, $2, 'Analytics QA Creator', $3, 'integration-test')`,
        [creatorId, code, slug],
      );
      await query(
        `INSERT INTO customers (id, phone_normalized, phone_hash, status, verification_status)
         VALUES ($1, $2, $3, 'ACTIVE', 'VERIFIED')`,
        [customerId, phone, phoneHash],
      );
      await query(
        `INSERT INTO creator_referral_visits (id, creator_id, visit_token_hash, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '1 day')`,
        [visitId, creatorId, randomBytes(32).toString("hex")],
      );
      await query(
        `INSERT INTO creator_customer_attributions
           (customer_id, creator_id, referral_visit_id, attribution_method)
         VALUES ($1, $2, $3, 'LINK')`,
        [customerId, creatorId, visitId],
      );

      const purchases = [
        { id: eventIds[0], source: "COMMERCE", spend: "1000.00", cost: "700.00", costStatus: "AVAILABLE", reward: "10.00", status: "PENDING" },
        { id: eventIds[1], source: "POS", spend: "500.00", cost: "400.00", costStatus: "AVAILABLE", reward: "5.00", status: "PAID" },
        { id: eventIds[2], source: "POS", spend: "3000.00", cost: "2000.00", costStatus: "AVAILABLE", reward: "30.00", status: "REVERSED" },
        { id: eventIds[3], source: "POS", spend: "250.00", cost: null, costStatus: "MISSING_COST", reward: "2.50", status: "PENDING" },
      ];
      for (const purchase of purchases) {
        await query(
          `INSERT INTO creator_purchase_events (
             creator_id, customer_id, source_system, source_transaction_id,
             source_transaction_number, currency, eligible_spend_npr,
             cost_of_goods_npr, cost_evidence_status,
             reward_rate_percent, reward_amount_npr, event_status,
             eligible_at, available_at, payload_hash
           ) VALUES ($1, $2, $3, $4, $5, 'NPR', $6, $7::numeric, $8, 1.00, $9, $10, NOW(), NOW(), $11)`,
          [
            creatorId,
            customerId,
            purchase.source,
            purchase.id,
            `QA-${purchase.id}`,
            purchase.spend,
            purchase.cost,
            purchase.costStatus,
            purchase.reward,
            purchase.status,
            createHash("sha256").update(purchase.id).digest("hex"),
          ],
        );
      }

      await app.register(creatorManagementRoutes);
      const response = await app.inject({
        method: "GET",
        url: `/creator-analytics?from=${today}&to=${today}`,
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.metrics).toMatchObject({
        visits: 1,
        registrations: 1,
        purchasing_customers: 1,
        completed_purchase_events: 3,
        attributed_sales_npr: "1750.00",
        cost_of_goods_npr: "1100.00",
        measured_gross_profit_npr: "400.00",
        measured_contribution_npr: "385.00",
        cost_covered_purchase_events: 2,
        missing_cost_purchase_events: 1,
        cost_coverage_percent: 66.67,
        pending_rewards_npr: "12.50",
        paid_rewards_npr: "5.00",
        visit_to_registration_percent: 100,
        registration_to_purchase_percent: 100,
      });
      expect(body.profitability.available).toBe(false);
      // The fixture deliberately spans online and in-store POS source systems.
      expect(body.channels).toHaveLength(2);
      expect(body.channels.reduce((sum: number, channel: { attributed_sales_npr: string }) => sum + Number(channel.attributed_sales_npr), 0)).toBe(1500);
      expect(body.leaderboard[0]).toMatchObject({
        id: creatorId,
        visits: 1,
        registered_customers: 1,
        purchasing_customers: 1,
        purchase_events: 3,
        attributed_sales_npr: "1750.00",
        cost_of_goods_npr: "1100.00",
        measured_gross_profit_npr: null,
        reward_cost_npr: "17.50",
        contribution_after_reward_npr: null,
        cost_covered_purchase_events: 2,
        missing_cost_purchase_events: 1,
        profitability_status: "INCOMPLETE_COST_DATA",
      });
    } finally {
      await app.close();
      await query("DELETE FROM creator_purchase_events WHERE source_transaction_id = ANY($1::text[])", [eventIds]);
      await query("DELETE FROM creator_customer_attributions WHERE customer_id = $1", [customerId]);
      await query("DELETE FROM creator_referral_visits WHERE id = $1", [visitId]);
      await query("DELETE FROM customers WHERE id = $1", [customerId]);
      await query("DELETE FROM creators WHERE id = $1", [creatorId]);
    }
  });
});
