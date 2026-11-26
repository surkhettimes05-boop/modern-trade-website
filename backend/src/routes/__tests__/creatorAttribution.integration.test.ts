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
import { memberPricingServiceRoutes } from "../memberPricingService.js";
import { MembershipService } from "../../services/membershipService.js";
import { MemberPricingService } from "../../services/memberPricingService.js";
import { customerMemberPricingRoutes } from "../customerMemberPricing.js";
import { SessionService } from "../../services/sessionService.js";
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
    const phone = `98${String(Date.now()).slice(-8)}`;
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

      const store = randomUUID(), org = randomUUID(), category = randomUUID(), product = randomUUID(), staff = randomUUID(), sku = ("CASHIER-"+randomUUID()).toUpperCase();
      const pricingToken = randomBytes(32).toString("hex");
      process.env.MEMBER_PRICING_SERVICE_TOKEN = pricingToken;
      process.env.MEMBER_PRICING_QUOTE_SECRET = randomBytes(32).toString("hex");
      await query("INSERT INTO organizations (id,organization_name,country_code,default_currency_code,default_locale,default_timezone,tax_regime,status) VALUES ($1,'CI pricing','NP','NPR','en-NP','Asia/Kathmandu','IRD','ACTIVE')",[org]);
      await query("INSERT INTO stores (id,name_en,address_en,phone,status,organization_id,country_code,currency_code,locale,timezone) VALUES ($1,'CI store','Surkhet',$2,'PUBLISHED',$3,'NP','NPR','en-NP','Asia/Kathmandu')",[store,phone,org]);
      await query("INSERT INTO categories (id,name_en,slug,status,published_at) VALUES ($1,'CI category',$2,'PUBLISHED',NOW())",[category,sku]);
      await query("INSERT INTO products (id,sku,name_en,category_id,status,published_at) VALUES ($1,$2,'CI product',$3,'PUBLISHED',NOW())",[product,sku,category]);
      await query("INSERT INTO product_prices (product_id,store_id,price,currency_code,active,valid_from) VALUES ($1,$2,505,'NPR',TRUE,NOW()-INTERVAL '1 day')",[product,store]);
      await query("INSERT INTO batch_inventory (store_id,product_id,batch_id,expiry_date,quantity,unit_cost,total_cost,received_date) VALUES ($1,$2,$3,CURRENT_DATE+180,10,300,3000,CURRENT_DATE)",[store,product,sku]);
      await query("UPDATE customers SET home_store_id=$1 WHERE id=$2",[store,customerId]);
      const member = await new MembershipService().enrollCustomer(customerId);
      const role = await query("SELECT id::text FROM roles WHERE role_key='head_office_admin'");
      await query(`INSERT INTO staff (id,staff_number,first_name,last_name,role,username,status,role_id,capabilities,scope_type,scope_store_ids,scope_organization_id) VALUES ($1,$2,'CI','Admin','ADMIN',$2,'ACTIVE',$3,'["pricing.read","pricing.write","pricing.approve"]','ORGANIZATION','{}',$4)`,[staff,sku,role.rows[0].id,org]);
      const actor = {id:staff,roleKey:"head_office_admin",capabilities:["pricing.read","pricing.write","pricing.approve"],scopeType:"ORGANIZATION" as const,scopeStoreIds:[]};
      const pricing = new MemberPricingService();
      const promotion = await pricing.createPromotion({organization_id:org,name:"CI member discount",starts_at:new Date(Date.now()-60000),ends_at:new Date(Date.now()+3600000),reason:"Isolated financial test",products:[{sku,member_price:"500.00"}],category_ids:[category],tiers:[member.tier_key],channels:["POS"]},actor);
      await pricing.transitionPromotion(promotion.id,"ACTIVATED","CI test",actor,[org]);
      await app.register(memberPricingServiceRoutes,{prefix:"/api/internal/member-pricing"});
      await app.register(customerMemberPricingRoutes);
      await app.register(creatorAttributionRoutes);
      const address = await app.listen({host:"127.0.0.1",port:0});
      const quote = async (customerReference: string, customerPhoneReference: string) => app.inject({
        method:"POST",url:"/api/internal/member-pricing/quotes",
        headers:{authorization:"Bearer "+pricingToken},
        payload:{channel:"POS",storeReference:store,customerReference,customerPhoneReference,items:[{sku,quantity:"2"}]}
      });
      const registeredId = randomUUID(), registeredPhone = "97"+phone.slice(2);
      await query("INSERT INTO customers (id,phone_normalized,phone_hash,status,verification_status,home_store_id) VALUES ($1,$2,$3,'ACTIVE','VERIFIED',$4)",[registeredId,registeredPhone,createHash("sha256").update(registeredPhone).digest("hex"),store]);
      const registered = await quote(registeredId,registeredPhone);
      expect(registered.statusCode).toBe(201);
      expect(registered.json().quote).toMatchObject({membershipStatus:"NOT_MEMBER",subtotal:"1010.00",discountTotal:"0.00",finalTotal:"1010.00"});
      const sessions = new SessionService();
      const session = await sessions.createSession({customer_id:registeredId});
      const webPayload = {store_id:store,items:[{sku,quantity:2}]};
      const webUrl = "/customer-pricing/web/quotes";
      const anonymous = await app.inject({method:"POST",url:webUrl,payload:webPayload});
      expect(anonymous.statusCode).toBe(401);
      const headers = {authorization:"Bearer "+session.session_token};
      const own = await app.inject({method:"POST",url:webUrl,headers,payload:webPayload});
      expect(own.statusCode).toBe(201);
      expect(own.headers["cache-control"]).toBe("private, no-store");
      expect(own.json().quote.membershipStatus).toBe("NOT_MEMBER");
      const spoof = await app.inject({method:"POST",url:webUrl,headers,payload:{...webPayload,customerReference:customerId}});
      expect(spoof.statusCode).toBe(400);
      expect(spoof.body).not.toContain(phone);
      const mismatch = await quote(customerId,registeredPhone);
      expect(mismatch.statusCode).toBe(409);
      expect(mismatch.json().code).toBe("CUSTOMER_MISMATCH");
      const serviceAccessDenied = await app.inject({method:"POST",url:"/api/internal/member-pricing/quotes",headers,payload:{channel:"POS",storeReference:store,customerReference:customerId,customerPhoneReference:phone,items:[{sku,quantity:"2"}]}});
      expect(serviceAccessDenied.statusCode).toBe(401);
      // Reject malformed carts and identity injection on both customer channels.
      for (const channel of ["web", "app"]) {
        const base = "/customer-pricing/"+channel;
        for (const items of [[], [{sku,quantity:0}], [{sku,quantity:1000}], [{sku,quantity:1.5}], [{sku,quantity:1},{sku,quantity:1}], [{sku,quantity:1,price:1}]]) {
          const invalid = await app.inject({method:"POST",url:base+"/quotes",headers,payload:{store_id:store,items}});
          expect(invalid.statusCode).toBe(400);
          expect(invalid.json().code).toBe("INVALID_QUOTE_REQUEST");
        }
        for (const skus of [[], [sku,sku]]) {
          const invalid = await app.inject({method:"POST",url:base+"/prices",headers,payload:{store_id:store,skus}});
          expect(invalid.statusCode).toBe(400);
          expect(invalid.json().code).toBe("INVALID_QUOTE_REQUEST");
        }
        const invalidValidation = await app.inject({method:"POST",url:base+"/quotes/validate",headers,payload:{...webPayload,signed_quote_token:"invalid",sale_reference:"qa-sale-reference"}});
        expect(invalidValidation.statusCode).toBe(400);
        for (const [suffix,payload] of [["/prices",{store_id:store,skus:[sku]}],["/quotes/validate",{...webPayload,signed_quote_token:"x".repeat(32),sale_reference:"qa-sale-reference"}]] as const) {
          const denied = await app.inject({method:"POST",url:base+suffix,payload});
          expect(denied.statusCode).toBe(401);
        }
      }
      for (const suffix of ["/quotes","/quotes/validate","/customers/verify","/catalog"]) {
        for (const token of ["", "x", "0".repeat(pricingToken.length)]) {
          const denied = await app.inject({method:suffix==="/catalog"?"GET":"POST",url:"/api/internal/member-pricing"+suffix,headers:{authorization:"Bearer "+token}});
          expect(denied.statusCode).toBe(401);
          expect(denied.json().code).toBe("SERVICE_AUTH_REQUIRED");
        }
      }
      const invalidCatalog = await app.inject({method:"GET",url:"/api/internal/member-pricing/catalog",headers:{authorization:"Bearer "+pricingToken}});
      expect(invalidCatalog.statusCode).toBe(400);
      expect(invalidCatalog.json().code).toBe("INVALID_STORE_REFERENCE");
      await sessions.revokeSession(session.session_token);
      expect((await app.inject({method:"POST",url:webUrl,headers,payload:webPayload})).statusCode).toBe(401);
      console.log("PRIVACY_GATE: anonymous, spoofed identity, mismatched phone, customer-to-service access and revoked session denied");
      const active = await quote(customerId,phone);
      expect(active.statusCode).toBe(201);
      expect(active.json().quote).toMatchObject({membershipStatus:"ACTIVE",subtotal:"1010.00",discountTotal:"10.00",finalTotal:"1000.00"});
      await query("UPDATE customer_memberships SET status='SUSPENDED' WHERE customer_id=$1",[customerId]);
      const suspended = await quote(customerId,phone);
      expect(suspended.statusCode).toBe(201);
      expect(suspended.json().quote).toMatchObject({membershipStatus:"SUSPENDED",discountTotal:"0.00",finalTotal:"1010.00"});
      await query("UPDATE customer_memberships SET status='ACTIVE' WHERE customer_id=$1",[customerId]);
      await query("UPDATE customers SET status='INACTIVE' WHERE id=$1",[customerId]);
      const inactive = await quote(customerId,phone);
      expect(inactive.statusCode).toBe(409);
      expect(inactive.json().code).toBe("CUSTOMER_NOT_AVAILABLE");
      await query("UPDATE customers SET status='ACTIVE' WHERE id=$1",[customerId]);
      await query("UPDATE customers SET verification_status='UNVERIFIED' WHERE id=$1",[customerId]);
      const unverified = await quote(customerId,phone);
      expect(unverified.statusCode).toBe(409);
      expect(unverified.json().code).toBe("CUSTOMER_NOT_AVAILABLE");
      await query("UPDATE customers SET verification_status='VERIFIED' WHERE id=$1",[customerId]);
      console.log("MEMBERSHIP_GATE: registered nonmember, active, suspended, inactive and unverified eligibility verified");
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
      // Security regression: rejected requests must not mutate financial state.
      const signed = (payload: typeof sale, timestamp: string) => createHmac("sha256",secret).update(timestamp+"."+JSON.stringify(payload)).digest("hex");
      const now = String(Math.floor(Date.now()/1000));
      const stale = String(Number(now)-600);
      const url = "/creator-attribution/pos-sales";
      const key = "pos-sale:"+sale.sourceTransactionId;
      for (const [timestamp, signature, payload, eventKey, status] of [
        [now, "0".repeat(64), sale, key, 401],
        [stale, signed(sale,stale), sale, key, 401],
        [now, signed(sale,now), {...sale,eligibleSpendNpr:"9999.00"}, key, 401],
        [now, signed(sale,now), sale, "pos-sale:"+randomUUID(), 409],
      ] as const) {
        const response = await app.inject({method:"POST",url,payload,headers:{"x-pasalho-timestamp":timestamp,"x-pasalho-signature":signature,"x-pasalho-event-key":eventKey}});
        expect(response.statusCode).toBe(status);
      }
      expect(Number((await query("SELECT count(*) AS n FROM creator_integration_events")).rows[0].n)).toBe(0);
      expect(Number((await query("SELECT count(*) AS n FROM creator_reward_ledger")).rows[0].n)).toBe(0);
      console.log("SECURITY_GATE: invalid signature, stale timestamp, tampered payload and mismatched event key rejected without financial mutation");
      expect((await send(refund)).statusCode).toBe(503);
      expect((await send(sale)).statusCode).toBe(200);
      expect(await reward()).toBe(10);
      const changed = {...sale,eligibleSpendNpr:"2000.00"};
      const conflictTime = String(Math.floor(Date.now()/1000));
      const conflict = await app.inject({method:"POST",url,payload:changed,headers:{"x-pasalho-timestamp":conflictTime,"x-pasalho-signature":signed(changed,conflictTime),"x-pasalho-event-key":key}});
      expect(conflict.statusCode).toBe(409);
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
      if (process.env.LITE_CREATOR_TEST_ROOT) {
        await query("UPDATE customers SET status='ACTIVE' WHERE id=$1",[customerId]);
        let cashierSaleId = "";
        for (const [phase, expected] of [["sale",10],["partial",5],["full",0]] as const) {
          const result = await execute(process.execPath, ["--conditions=react-server","--import","tsx","scripts/cashier-creator-e2e.ts"], {
            cwd:resolve(process.env.LITE_CREATOR_TEST_ROOT),timeout:30000,
            env:{...process.env,APP_ENV:"test",DATABASE_URL:process.env.LITE_CREATOR_TEST_DATABASE_URL,CREATOR_ATTRIBUTION_API_URL:address+"/creator-attribution/pos-sales",MODERN_PRICING_API_URL:address,MODERN_PRICING_SERVICE_TOKEN:pricingToken,MODERN_PRICING_STORE_REFERENCE:store,CASHIER_TEST_SKU:sku,CASHIER_TEST_PHASE:phase,CASHIER_TEST_PHONE:phone,CASHIER_TEST_IDENTITY:customerId,CASHIER_TEST_SALE_ID:cashierSaleId}
          });
          const id = result.stdout.match(/CASHIER_EVENT_ID=([a-f0-9-]+)/)?.[1];
          expect(id).toBeDefined();
          if (phase === "sale") cashierSaleId = id!;
          const purchase = await query("SELECT reward_amount_npr FROM creator_purchase_events WHERE source_system='POS' AND source_transaction_id=$1",[cashierSaleId]);
          expect(Number(purchase.rows[0]?.reward_amount_npr)).toBe(expected);
          const ledger = await query("SELECT sum(amount_npr) AS total FROM creator_reward_ledger WHERE creator_id=$1",[creatorId]);
          expect(Number(ledger.rows[0].total)).toBe(expected);
          console.log("CASHIER_LEDGER_GATE: "+phase+" verified NPR "+expected);
        }
      }
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
