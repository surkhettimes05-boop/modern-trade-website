import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { randomUUID, randomInt, createHash } from "node:crypto";
import { query } from "../../database/connection.js";
import { SessionService } from "../../services/sessionService.js";
import { authRoutes } from "../auth.js";
import { authenticateCustomer, customerId } from "../../middleware/customerAuthentication.js";

describe("customer authentication and privacy with PostgreSQL", () => {
  const sessions = new SessionService();
  const ids = [randomUUID(), randomUUID()];
  const app = Fastify();
  let tokens: string[];
  beforeAll(async () => {
    await app.register(cookie);
    await app.register(authRoutes, {prefix:"/auth"});
    app.post("/identity", {onRequest:authenticateCustomer}, async request => ({id:customerId(request)}));
    await app.ready();
    for (const id of ids) {
      const phone = "98"+randomInt(10000000,99999999);
      await query("INSERT INTO customers (id,phone_normalized,phone_hash,status,verification_status) VALUES ($1,$2,$3,'ACTIVE','VERIFIED')",[id,phone,createHash("sha256").update(phone).digest("hex")]);
    }
    tokens = await Promise.all(ids.map(async id => (await sessions.createSession({customer_id:id})).session_token));
  });
  afterAll(async () => {
    await app.close();
    await query("DELETE FROM customer_sessions WHERE customer_id = ANY($1::uuid[])",[ids]);
    await query("DELETE FROM customers WHERE id = ANY($1::uuid[])",[ids]);
  });
  it("rejects missing and invalid sessions on all private read endpoints", async () => {
    for (const url of ["/auth/session/validate","/auth/sessions"]) {
      for (const headers of [{},{authorization:"Bearer "+randomUUID()}]) {
        const res = await app.inject({url,headers});
        expect(res.statusCode).toBe(401);
        expect(res.headers["cache-control"]).toBe("private, no-store");
      }
    }
  });
  it("returns only the authenticated identity and masks session secrets", async () => {
    for (let i=0;i<2;i++) {
      const headers={authorization:"Bearer "+tokens[i]};
      const res=await app.inject({url:"/auth/session/validate",headers});
      expect(res.statusCode).toBe(200);
      expect(res.json().customer.id).toBe(ids[i]);
      expect(res.body).not.toContain(tokens[i]);
      const list=await app.inject({url:"/auth/sessions",headers});
      expect(list.statusCode).toBe(200);
      expect(list.json().sessions).toHaveLength(1);
      expect(list.json().sessions[0].is_current).toBe(true);
      expect(list.json().sessions[0]).not.toHaveProperty("session_token");
      expect(list.body).not.toContain(tokens[1-i]);
    }
  });
  it("requires CSRF for cookie mutations and derives identity from the bearer", async () => {
    const cookie="customer_session="+tokens[0]+"; customer_csrf=fixture";
    for (const headers of [{cookie},{cookie,"x-csrf-token":"wrong"}]) {
      expect((await app.inject({method:"POST",url:"/identity",headers})).statusCode).toBe(403);
    }
    const valid=await app.inject({method:"POST",url:"/identity",headers:{cookie,"x-csrf-token":"fixture"}});
    expect(valid.json()).toEqual({id:ids[0]});
    const bearer=await app.inject({method:"POST",url:"/identity",headers:{cookie,authorization:"Bearer "+tokens[1]}});
    expect(bearer.json()).toEqual({id:ids[1]});
  });
  it("denies customer credentials on staff administration routes", async () => {
    for (const [method,url] of [["GET","/auth/admin/otp/stats"],["GET","/auth/admin/session/stats"],["POST","/auth/admin/otp/cleanup"],["POST","/auth/admin/session/cleanup"]] as const) {
      const res=await app.inject({method,url,headers:{authorization:"Bearer "+tokens[0],cookie:"customer_session="+tokens[0]}});
      expect(res.statusCode).toBe(401);
    }
  });
  it("revokes only the requesting customer's sessions", async () => {
    const second=await sessions.createSession({customer_id:ids[0]});
    const res=await app.inject({method:"POST",url:"/auth/logout-all",headers:{authorization:"Bearer "+tokens[0]}});
    expect(res.statusCode).toBe(200);
    for (const token of [tokens[0],second.session_token]) expect(await sessions.validateSession(token)).toBeNull();
    expect((await sessions.validateSession(tokens[1]))?.customer_id).toBe(ids[1]);
    const logout=await app.inject({method:"POST",url:"/auth/logout",headers:{authorization:"Bearer "+tokens[1]}});
    expect(logout.statusCode).toBe(200);
    expect(await sessions.validateSession(tokens[1])).toBeNull();
  });
  it("rejects expired sessions and never persists raw tokens", async () => {
    const expired=await sessions.createSession({customer_id:ids[0],expiry_hours:-1});
    const stored=await query("SELECT session_token FROM customer_sessions WHERE id=$1",[expired.id]);
    expect(stored.rows[0].session_token).not.toBe(expired.session_token);
    expect(await sessions.validateSession(expired.session_token)).toBeNull();
  });
});
