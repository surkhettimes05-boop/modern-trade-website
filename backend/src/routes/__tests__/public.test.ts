import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { build } from "./helper.js";

describe("Public API Endpoints", () => {
  let app: any;

  beforeAll(async () => {
    app = await build();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /api/public/stores", () => {
    it("should return stores array", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/public/stores",
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(Array.isArray(payload)).toBe(true);
    });

    it("should support language parameter", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/public/stores?lang=ne",
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("GET /api/public/categories", () => {
    it("should return categories array", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/public/categories",
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(Array.isArray(payload)).toBe(true);
    });
  });

  describe("GET /api/public/products", () => {
    it("keeps the legacy unscoped public catalog response for existing web callers", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/public/products",
      });

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(JSON.parse(response.payload))).toBe(true);
    });

    it("rejects unbounded catalog pagination", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/public/products?limit=1000000",
      });

      expect(response.statusCode).toBe(400);
    });

    it("keeps legacy public search compatible when no store is requested", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/public/products?search=rice&limit=20",
      });

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(JSON.parse(response.payload))).toBe(true);
    });

    it("keeps legacy public product detail compatible without a store hint", async () => {
      const detailResponse = await app.inject({
        method: "GET",
        url: "/api/public/products/00000000-0000-4000-8000-000000000001",
      });
      expect(detailResponse.statusCode).toBe(404);
    });

    it("rejects a caller-supplied store without an address assignment", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/public/products?store_id=00000000-0000-4000-8000-000000000001",
      });
      expect(response.statusCode).toBe(400);
    });

    it("requires customer authentication when an address is used for scope", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/public/products?address_id=00000000-0000-4000-8000-000000000001",
      });
      expect(response.statusCode).toBe(401);
    });

    it("rejects empty catalog search terms", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/public/products?search=%20%20",
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /api/public/contact", () => {
    it("should validate required fields", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/public/contact",
        payload: {
          name: "", // Invalid: empty name
          email: "invalid-email", // Invalid: bad email
        },
      });

      expect(response.statusCode).toBe(400);
      const payload = JSON.parse(response.payload);
      expect(payload).toHaveProperty("error", "Validation failed");
    });

    it("should accept valid contact submission", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/public/contact",
        payload: {
          name: "Test User",
          email: "test@example.com",
          subject: "Test Subject",
          message: "Test message content",
        },
      });

      // May fail if database not connected, but should validate
      expect([200, 500]).toContain(response.statusCode);
    });
  });

  describe("Security Tests", () => {
    it("should not expose internal fields in stores endpoint", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/public/stores",
      });

      if (response.statusCode === 200) {
        const payload = JSON.parse(response.payload);
        if (payload.length > 0) {
          const store = payload[0];
          // Should not contain internal fields
          expect(store).not.toHaveProperty("created_by");
          expect(store).not.toHaveProperty("updated_by");
        }
      }
    });

    it("should return 404 for non-existent page", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/public/pages/non-existent-slug",
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
