import Fastify from "fastify";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { query } from "../../database/connection.js";
import { creatorAttributionRoutes } from "../creatorAttribution.js";

describe("creator POS financial integration", () => {
  // Exercise the endpoint against the same PostgreSQL tables used by the service.
  it("retries early refunds and reverses inactive customer rewards exactly once", async () => {
    if (process.env.NODE_ENV !== "test" || !["localhost","127.0.0.1"].includes(new URL(process.env.DATABASE_URL ?? "postgres://invalid").hostname)) throw new Error("Local test PostgreSQL required");
    const creatorId = randomUUID();
    const customerId = randomUUID();
    const visitId = randomUUID();
    const phone = `+97798${String(Date.now()).slice(-8)}`;
    const phoneHash = createHash("sha256").update(randomBytes(32)).digest("hex");
    const slug = `qa-${randomBytes(8).toString("hex")}`;
    const code = `QA-${randomBytes(6).toString("hex").toUpperCase()}`;
    const eventIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const secret = randomBytes(32).toString('hex');
    const previousSecret = process.env.CREATOR_ATTRIBUTION_HMAC_SECRET;
    process.env.CREATOR_ATTRIBUTION_HMAC_SECRET = secret;
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

      await app.register(creatorAttributionRoutes);
      const base = {schemaVersion:1,sourceSystem:"POS",customerPhoneHash:phoneHash,currency:"NPR",completedAt:new Date().toISOString()};
      const sale = {...base,eventType:"POS_SALE_COMPLETED",sourceTransactionId:eventIds[0],sourceTransactionNumber:"QA-sale",eligibleSpendNpr:"1000.00"};
      const refund = {...base,eventType:"POS_SALE_RETURNED",sourceTransactionId:eventIds[1],originalSourceTransactionId:eventIds[0],sourceTransactionNumber:"QA-refund",refundAmountNpr:"400.00"};
      const full = {...refund,sourceTransactionId:eventIds[2],refundAmountNpr:"600.00"};
      async function send(payload: typeof sale | typeof refund) {
        const returning = payload.eventType === "POS_SALE_RETURNED";
        const timestamp = String(Math.floor(Date.now()/1000));
        return app.inject({method:"POST",url: "/creator-attribution/"+(returning?"pos-returns":"pos-sales"),payload,headers:{"x-pasalho-timestamp":timestamp,"x-pasalho-signature":createHmac("sha256",secret).update(timestamp+"."+JSON.stringify(payload)).digest("hex"),"x-pasalho-event-key":(returning?"pos-return:":"pos-sale:")+payload.sourceTransactionId}});
      }
      async function reward() {
        const result = await query("SELECT reward_amount_npr FROM creator_purchase_events WHERE source_system='POS' AND source_transaction_id=$1",[eventIds[0]]);
        return Number(result.rows[0]?.reward_amount_npr);
      }
      expect((await send(refund)).statusCode).toBe(503);
      expect((await send(sale)).statusCode).toBe(200);
      expect(await reward()).toBe(10);
      expect((await send(sale)).json().replay).toBe(true);
      expect(await reward()).toBe(10);
      await query("UPDATE customers SET status='INACTIVE' WHERE id=$1",[customerId]);
      expect((await send(refund)).statusCode).toBe(200);
      expect(await reward()).toBe(6);
      expect((await send(refund)).json().replay).toBe(true);
      expect(await reward()).toBe(6);
      expect((await send(full)).statusCode).toBe(200);
      expect(await reward()).toBe(0);
      const denied = await send({...sale,sourceTransactionId:eventIds[3]});
      expect(denied.statusCode).toBe(200);
      expect(denied.json()).toMatchObject({attributed:false,reason:"CUSTOMER_UNVERIFIED"});
      const count = await query("SELECT count(*)::int AS n FROM creator_purchase_events WHERE source_transaction_id=$1",[eventIds[3]]);
      expect(count.rows[0].n).toBe(0);
      const balance = await query("SELECT sum(amount_npr) AS total FROM creator_reward_ledger WHERE creator_id=$1",[creatorId]);
      expect(Number(balance.rows[0].total)).toBe(0);
    } finally {
      if(previousSecret===undefined) delete process.env.CREATOR_ATTRIBUTION_HMAC_SECRET; else process.env.CREATOR_ATTRIBUTION_HMAC_SECRET=previousSecret;
      await app.close();
      await query("DELETE FROM creator_reward_ledger WHERE creator_id=$1",[creatorId]);
      await query("DELETE FROM creator_purchase_events WHERE creator_id=$1 AND reversal_of_event_id IS NOT NULL",[creatorId]);
      await query("DELETE FROM creator_purchase_events WHERE creator_id=$1",[creatorId]);
      await query("DELETE FROM creator_integration_events WHERE event_key=ANY($1::text[])",[[`pos-sale:${eventIds[0]}`,`pos-return:${eventIds[1]}`,`pos-return:${eventIds[2]}`,`pos-sale:${eventIds[3]}`]]);
      await query("DELETE FROM creator_customer_attributions WHERE customer_id=$1",[customerId]);
      await query("DELETE FROM creator_referral_visits WHERE id=$1",[visitId]);
      await query("DELETE FROM customers WHERE id=$1",[customerId]);
      await query("DELETE FROM creators WHERE id=$1",[creatorId]);
    }
  });
});
