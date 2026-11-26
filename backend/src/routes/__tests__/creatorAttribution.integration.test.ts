import Fastify from "fastify";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
const execute = promisify(execFile);
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { getDatabaseUrl } from "../../config/environment.js";
import pg from "pg";
import { runMigrations } from "../../database/migrationRunner.js";
import { closePool, query } from "../../database/connection.js";
import { creatorAttributionRoutes } from "../creatorAttribution.js";

describe("creator POS financial integration", () => {
  // Exercise the endpoint against the same PostgreSQL tables used by the service.
  it("retries early refunds and reverses inactive customer rewards exactly once", async () => {
    if (process.env.NODE_ENV !== "test" || !["localhost","127.0.0.1"].includes(new URL(getDatabaseUrl()).hostname)) throw new Error("Local test PostgreSQL required");
    const originalUrl = process.env.TEST_DATABASE_URL!;
    const isolated = new URL(getDatabaseUrl());
    const dbName = "creator_test_" + randomBytes(12).toString("hex");
    isolated.pathname = "/" + dbName;
    const admin = new pg.Client({connectionString: originalUrl});
    await closePool();
    await admin.connect();
    let created = false;
    try {
      await admin.query('CREATE DATABASE "' + dbName + '"');
      created = true;
      await runMigrations(isolated.toString());
      process.env.TEST_DATABASE_URL = isolated.toString();
    const creatorId = randomUUID();
    const customerId = randomUUID();
    const visitId = randomUUID();
    const phone = `+97798${String(Date.now()).slice(-8)}`;
    const phoneHash = createHash("sha256").update(phone.replace(/^\+977/, "")).digest("hex");
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
      const address = await app.listen({host:"127.0.0.1",port:0});
      const base = {schemaVersion:1,sourceSystem:"POS",customerPhoneHash:phoneHash,currency:"NPR",completedAt:new Date().toISOString()};
      const sale = {...base,eventType:"POS_SALE_COMPLETED",sourceTransactionId:eventIds[0],sourceTransactionNumber:"QA-sale",eligibleSpendNpr:"1000.00"};
      const refund = {...base,eventType:"POS_SALE_RETURNED",sourceTransactionId:eventIds[1],originalSourceTransactionId:eventIds[0],sourceTransactionNumber:"QA-refund",refundAmountNpr:"400.00"};
      const full = {...refund,sourceTransactionId:eventIds[2],refundAmountNpr:"600.00"};
      async function send(payload: typeof sale | typeof refund) {
        const returning = payload.eventType === "POS_SALE_RETURNED";
        const timestamp = String(Math.floor(Date.now()/1000));
        if (process.env.LITE_CREATOR_TEST_ROOT) {
          const root = resolve(process.env.LITE_CREATOR_TEST_ROOT);
          const expected = returning && !(await query("SELECT 1 FROM creator_purchase_events WHERE source_transaction_id=$1",[eventIds[0]])).rowCount ? 503 : 200;
          await execute(process.execPath, ["--conditions=react-server","--import","tsx","scripts/creator-worker-e2e.ts"], {cwd:root,timeout:30000,env:{...process.env,APP_ENV:"test",DATABASE_URL:process.env.LITE_CREATOR_TEST_DATABASE_URL,CREATOR_ATTRIBUTION_API_URL:address+"/creator-attribution/pos-sales",CREATOR_TEST_PAYLOAD:JSON.stringify(payload),CREATOR_TEST_EXPECT_HTTP:String(expected)}});
          return {statusCode:expected,json:()=>({})};
        }
        return app.inject({method:"POST",url: "/creator-attribution/"+(returning?"pos-returns":"pos-sales"),payload,headers:{"x-pasalho-timestamp":timestamp,"x-pasalho-signature":createHmac("sha256",secret).update(timestamp+"."+JSON.stringify(payload)).digest("hex"),"x-pasalho-event-key":(returning?"pos-return:":"pos-sale:")+payload.sourceTransactionId}});
      }
      async function reward() {
        const result = await query("SELECT reward_amount_npr FROM creator_purchase_events WHERE source_system='POS' AND source_transaction_id=$1",[eventIds[0]]);
        return Number(result.rows[0]?.reward_amount_npr);
      }
      expect((await send(refund)).statusCode).toBe(503);
      expect((await send(sale)).statusCode).toBe(200);
      expect(await reward()).toBe(10);
      const saleReplay = await send(sale);
      if (!process.env.LITE_CREATOR_TEST_ROOT) expect(saleReplay.json().replay).toBe(true);
      expect(await reward()).toBe(10);
      await query("UPDATE customers SET status='INACTIVE' WHERE id=$1",[customerId]);
      expect((await send(refund)).statusCode).toBe(200);
      expect(await reward()).toBe(6);
      const refundReplay = await send(refund);
      if (!process.env.LITE_CREATOR_TEST_ROOT) expect(refundReplay.json().replay).toBe(true);
      expect(await reward()).toBe(6);
      expect((await send(full)).statusCode).toBe(200);
      expect(await reward()).toBe(0);
      const denied = await send({...sale,sourceTransactionId:eventIds[3]});
      expect(denied.statusCode).toBe(200);
      if (!process.env.LITE_CREATOR_TEST_ROOT) expect(denied.json()).toMatchObject({attributed:false,reason:"CUSTOMER_UNVERIFIED"});
      const count = await query("SELECT count(*)::int AS n FROM creator_purchase_events WHERE source_transaction_id=$1",[eventIds[3]]);
      expect(count.rows[0].n).toBe(0);
      const balance = await query("SELECT sum(amount_npr) AS total FROM creator_reward_ledger WHERE creator_id=$1",[creatorId]);
      expect(Number(balance.rows[0].total)).toBe(0);
    } finally {
      if(previousSecret===undefined) delete process.env.CREATOR_ATTRIBUTION_HMAC_SECRET; else process.env.CREATOR_ATTRIBUTION_HMAC_SECRET=previousSecret;
      await app.close();
    }
    } finally {
      try {
        await closePool();
        process.env.TEST_DATABASE_URL = originalUrl;
        if (created) await admin.query('DROP DATABASE "' + dbName + '"');
      } finally {
        await admin.end();
      }
    }
  }, 240000);
});
