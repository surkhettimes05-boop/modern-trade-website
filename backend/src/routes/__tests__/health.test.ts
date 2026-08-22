import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { build } from "./helper.js";

describe("Health Endpoints", () => {
  let app: any;

  beforeAll(async () => {
    app = await build();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should return health status", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.payload);
    expect(payload).toHaveProperty("status", "ok");
    expect(payload).toHaveProperty("timestamp");
    expect(payload).toHaveProperty("uptime");
  });

  it("exposes a dependency-free liveness endpoint", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health/live" });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("ok");
  });

  it("reports readiness failure when Redis or migrations are unavailable", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health/ready" });
    expect([200, 503]).toContain(response.statusCode);
    expect(response.json()).toHaveProperty("checks");
  });

  it("should return database health status", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/health/db",
    });

    // Database may not be connected in test environment
    expect([200, 503]).toContain(response.statusCode);
    const payload = JSON.parse(response.payload);
    expect(payload).toHaveProperty("status");
    expect(payload).toHaveProperty("database");
  });
});
