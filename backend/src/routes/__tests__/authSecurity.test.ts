import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { authRoutes } from "../auth.js";
import { query } from "../../database/connection.js";

jest.mock("../../database/connection.js", () => ({
  query: jest.fn(),
}));

describe("Auth route security", () => {
  async function buildApp() {
    const app = Fastify();
    await app.register(jwt, {
      secret: "test-secret-with-sufficient-length",
      cookie: { cookieName: "ops_session", signed: false },
    });
    app.decorateRequest("cookies", null as any);
    app.addHook("onRequest", async (request) => {
      const cookies = Object.fromEntries(
        String(request.headers.cookie || "")
          .split(";")
          .map((part) => part.trim().split("="))
          .filter(([name, value]) => Boolean(name && value)),
      );
      (request as any).cookies = cookies;
    });
    await app.register(authRoutes, { prefix: "/api/auth" });
    await app.ready();
    return app;
  }

  it.each([
    ["GET", "/api/auth/admin/otp/stats"],
    ["GET", "/api/auth/admin/session/stats"],
    ["POST", "/api/auth/admin/otp/cleanup"],
    ["POST", "/api/auth/admin/session/cleanup"],
  ] as const)("rejects unauthenticated %s %s requests", async (method, url) => {
    const app = await buildApp();

    const response = await app.inject({ method, url });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Staff authentication required" });
    await app.close();
  });

  it("rejects a valid but non-privileged staff session", async () => {
    const app = await buildApp();
    (query as jest.Mock).mockResolvedValue({
      rows: [
        {
          id: "staff-user",
          username: "operator",
          role_id: "role-user",
          role_key: "store_manager",
          capabilities: ["dashboard.read"],
          scope_type: "STORE",
          scope_store_ids: [],
          mfa_enabled: false,
          status: "ACTIVE",
        },
      ],
      rowCount: 1,
    });
    const token = app.jwt.sign({ sub: "staff-user", jti: "session-user" });

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/admin/session/stats",
      cookies: { ops_session: token },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().message).toContain("system.manage");
    await app.close();
  });

  it("allows a privileged active staff session", async () => {
    const app = await buildApp();
    (query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: "staff-admin",
            username: "admin",
            role_id: "role-admin",
            role_key: "platform_admin",
            capabilities: ["system.manage"],
            scope_type: "GLOBAL",
            scope_store_ids: [],
            mfa_enabled: false,
            status: "ACTIVE",
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const token = app.jwt.sign({ sub: "staff-admin", jti: "session-admin" });

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/admin/otp/stats",
      cookies: { ops_session: token },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
    await app.close();
  });

  it("rejects a signed token after its backing staff session is revoked", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "staff-admin", jti: "revoked-session" });
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    (query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/auth/admin/session/stats",
        cookies: { ops_session: token },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error).toBe("Session expired or revoked");
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      await app.close();
    }
  });
});
