import Fastify from "fastify";
import { memberPricingServiceRoutes } from "../../routes/memberPricingService.js";
import { catalogOnlyGuard } from "../catalogOnlyGuard.js";

describe("public catalogue-only request gate", () => {
  const original = process.env.PUBLIC_CATALOG_ONLY;

  afterEach(() => {
    if (original === undefined) delete process.env.PUBLIC_CATALOG_ONLY;
    else process.env.PUBLIC_CATALOG_ONLY = original;
  });

  async function testApp() {
    const app = Fastify();
    app.addHook("onRequest", catalogOnlyGuard);
    app.get("/api/public/products", async () => [{ id: "example" }]);
    app.post("/api/auth/otp/request", async () => ({ accepted: true }));
    app.post("/api/checkout/cod", async () => ({ order: true }));
    app.post("/api/creator-portal/otp/request", async () => ({ accepted: true }));
    app.post("/api/creator-attribution/pos-sales", async () => ({ accepted: true }));
    app.post("/api/operations-auth/login", async () => ({ authenticated: true }));
    app.post("/api/admin/products", async () => ({ accepted: true }));
    await app.register(memberPricingServiceRoutes, { prefix: "/api/internal/member-pricing" });
    await app.ready();
    return app;
  }

  it("keeps catalogue reads available and blocks customer writes", async () => {
    process.env.PUBLIC_CATALOG_ONLY = "true";
    const app = await testApp();
    try {
      expect((await app.inject({ method: "GET", url: "/api/public/products" })).statusCode).toBe(200);
      for (const url of [
        "/api/creator-portal/otp/request",
        "/api/creator-attribution/pos-sales",
      ]) {
        const response = await app.inject({ method: "POST", url });
        expect(response.statusCode).toBe(503);
        expect(response.json()).toMatchObject({ code: "CATALOG_ONLY" });
        expect(response.headers["cache-control"]).toBe("no-store");
      }
      for (const url of [
        "/api/auth/otp/request",
        "/api/checkout/cod",
        "/api/operations-auth/login",
        "/api/admin/products?limit=50",
      ]) {
        expect((await app.inject({ method: "POST", url })).statusCode).toBe(200);
      }
      const lookalike = await app.inject({ method: "POST", url: "/api/admin-malicious/products" });
      expect(lookalike.statusCode).toBe(503);
      expect(lookalike.json()).toMatchObject({ code: "CATALOG_ONLY" });
    } finally { await app.close(); }
  });

  it("allows only exact internal pricing POST routes and preserves service authentication", async () => {
    process.env.PUBLIC_CATALOG_ONLY = "true";
    const originalToken = process.env.MEMBER_PRICING_SERVICE_TOKEN;
    process.env.MEMBER_PRICING_SERVICE_TOKEN = "test-only-pricing-token";
    const app = await testApp();
    try {
      for (const path of ["quotes", "quotes/validate", "customers/verify"]) {
        const url = "/api/internal/member-pricing/" + path;
        for (const headers of [{}, { authorization: "Bearer wrong-token" }]) {
          const response = await app.inject({ method: "POST", url, headers, payload: {} });
          expect(response.statusCode).toBe(401);
          expect(response.json()).toMatchObject({ code: "SERVICE_AUTH_REQUIRED" });
        }
        const authenticated = await app.inject({ method: "POST", url, headers: { authorization: "Bearer test-only-pricing-token" }, payload: {} });
        expect(authenticated.statusCode).toBe(400);
        expect(authenticated.json().code).not.toBe("CATALOG_ONLY");
      }
      for (const url of ["/api/internal/member-pricing/quotes/extra", "/api/internal/member-pricing/unknown"]) {
        expect((await app.inject({ method: "POST", url })).statusCode).toBe(503);
      }
      expect((await app.inject({ method: "PUT", url: "/api/internal/member-pricing/quotes" })).statusCode).toBe(503);
    } finally {
      await app.close();
      if (originalToken === undefined) delete process.env.MEMBER_PRICING_SERVICE_TOKEN;
      else process.env.MEMBER_PRICING_SERVICE_TOKEN = originalToken;
    }
  });

  it("does not interfere with normal non-catalogue environments", async () => {
    delete process.env.PUBLIC_CATALOG_ONLY;
    const app = await testApp();
    try {
      const response = await app.inject({ method: "POST", url: "/api/auth/otp/request" });
      expect(response.statusCode).toBe(200);
    } finally { await app.close(); }
  });
});
