import Fastify from "fastify";
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
    await app.ready();
    return app;
  }

  it("keeps catalogue reads available but closes all write paths", async () => {
    process.env.PUBLIC_CATALOG_ONLY = "true";
    const app = await testApp();
    try {
      expect((await app.inject({ method: "GET", url: "/api/public/products" })).statusCode).toBe(200);
      for (const url of [
        "/api/auth/otp/request",
        "/api/checkout/cod",
        "/api/creator-portal/otp/request",
        "/api/creator-attribution/pos-sales",
      ]) {
        const response = await app.inject({ method: "POST", url });
        expect(response.statusCode).toBe(503);
        expect(response.json()).toMatchObject({ code: "CATALOG_ONLY" });
        expect(response.headers["cache-control"]).toBe("no-store");
      }
    } finally { await app.close(); }
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
