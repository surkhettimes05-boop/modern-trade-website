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
    const eventIds = [randomUUID(), randomUUID(), randomUUID()];
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
        { id: eventIds[0], source: "COMMERCE", spend: "1000.00", reward: "10.00", status: "PENDING" },
        { id: eventIds[1], source: "POS", spend: "500.00", reward: "5.00", status: "PAID" },
        { id: eventIds[2], source: "POS", spend: "3000.00", reward: "30.00", status: "REVERSED" },
      ];
      for (const purchase of purchases) {
        await query(
          `INSERT INTO creator_purchase_events (
             creator_id, customer_id, source_system, source_transaction_id,
             source_transaction_number, currency, eligible_spend_npr,
             reward_rate_percent, reward_amount_npr, event_status,
             eligible_at, available_at, payload_hash
           ) VALUES ($1, $2, $3, $4, $5, 'NPR', $6, 1.00, $7, $8, NOW(), NOW(), $9)`,
          [
            creatorId,
            customerId,
            purchase.source,
            purchase.id,
            `QA-${purchase.id}`,
            purchase.spend,
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
        completed_purchase_events: 2,
        attributed_sales_npr: "1500.00",
        pending_rewards_npr: "10.00",
        paid_rewards_npr: "5.00",
        visit_to_registration_percent: 100,
        registration_to_purchase_percent: 100,
      });
      expect(body.channels).toHaveLength(2);
      expect(body.channels.reduce((sum: number, channel: { attributed_sales_npr: string }) => sum + Number(channel.attributed_sales_npr), 0)).toBe(1500);
      expect(body.leaderboard[0]).toMatchObject({
        id: creatorId,
        visits: 1,
        registered_customers: 1,
        purchasing_customers: 1,
        purchase_events: 2,
        attributed_sales_npr: "1500.00",
        reward_cost_npr: "15.00",
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
