import jwt from "@fastify/jwt";
import Fastify, { FastifyInstance } from "fastify";
import { query } from "../../database/connection.js";
import { authenticateStaff } from "../../middleware/authentication.js";
import authorizationPlugin, {
  preHandler,
} from "../../plugins/authorization.js";

const STORE_A = "20000000-0000-4000-8000-000000000001";
const STORE_B = "20000000-0000-4000-8000-000000000002";
const ADMIN_ID = "30000000-0000-4000-8000-000000000001";
const USER_ID = "30000000-0000-4000-8000-000000000002";
const CASHIER_ID = "30000000-0000-4000-8000-000000000003";
const MFA_ID = "30000000-0000-4000-8000-000000000004";

async function buildAuthorizationApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(jwt, {
    secret: "authorization-test-secret-with-sufficient-length",
    cookie: { cookieName: "ops_session", signed: false },
  });
  // @fastify/jwt's cookie verification only requires request.cookies. The
  // production cookie plugin supplies it; this small parser avoids the plugin's
  // Jest/VM dynamic-import incompatibility while preserving the same contract.
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
  await app.register(authorizationPlugin);

  const authenticated = { preHandler: authenticateStaff };
  const protectedBy = (
    ...hooks: Array<(request: any, reply: any) => Promise<void>>
  ) => ({
    preHandler: [authenticateStaff, ...hooks],
  });

  app.get("/api/user", authenticated, async (request) => ({
    id: (request.user as any).id,
  }));
  app.get(
    "/api/admin/dashboard",
    protectedBy(preHandler.requireCapability("dashboard.read")),
    async () => ({ ok: true }),
  );
  app.get(
    "/api/admin/catalog",
    protectedBy(preHandler.requireCapability("catalog.write")),
    async () => ({ ok: true }),
  );
  app.get(
    "/api/any",
    protectedBy(
      preHandler.requireAnyCapability(["catalog.write", "catalog.read"]),
    ),
    async () => ({ ok: true }),
  );
  app.get(
    "/api/all",
    protectedBy(
      preHandler.requireAllCapabilities(["dashboard.read", "catalog.read"]),
    ),
    async () => ({ ok: true }),
  );
  app.get(
    "/api/global",
    protectedBy(preHandler.requireScope("GLOBAL")),
    async () => ({ ok: true }),
  );
  app.get(
    "/api/store/:storeId",
    protectedBy(preHandler.requireCapabilityAndStoreAccess("dashboard.read")),
    async (request) => ({ storeId: (request.params as any).storeId }),
  );
  app.get(
    "/api/mfa",
    protectedBy(preHandler.requireMfa("refunds.approve")),
    async () => ({ ok: true }),
  );
  app.get(
    "/api/step-up",
    protectedBy(preHandler.requireStepUpAuth("refunds.approve")),
    async () => ({ ok: true }),
  );
  return app;
}

describe("Authorization", () => {
  let app: FastifyInstance;
  let tokens: Record<string, string>;

  beforeAll(async () => {
    await query(
      `INSERT INTO stores (id, name_en, address_en, phone)
       VALUES ($1, 'Authorization Store A', 'A', '9800000011'), ($2, 'Authorization Store B', 'B', '9800000012')
       ON CONFLICT (id) DO NOTHING`,
      [STORE_A, STORE_B],
    );
    await query(
      `INSERT INTO staff
        (id, staff_number, first_name, last_name, store_id, role, status, username, role_id,
         capabilities, scope_type, scope_store_ids, mfa_enabled)
       VALUES
        ($1, 'AUTH-ADMIN', 'Admin', 'User', $4, 'ADMIN', 'ACTIVE', 'auth_admin',
          (SELECT id FROM roles WHERE role_key = 'platform_admin'),
          '["dashboard.read","catalog.read","catalog.write","refunds.approve"]', 'GLOBAL', ARRAY[$4]::uuid[], false),
        ($2, 'AUTH-USER', 'Normal', 'User', $4, 'MANAGER', 'ACTIVE', 'auth_user',
          (SELECT id FROM roles WHERE role_key = 'store_manager'),
          '["dashboard.read","catalog.read"]', 'STORE', ARRAY[$4]::uuid[], false),
        ($3, 'AUTH-CASHIER', 'Cashier', 'User', $4, 'CASHIER', 'ACTIVE', 'auth_cashier',
          (SELECT id FROM roles WHERE role_key = 'cashier'),
          '["pos.execute","dashboard.read"]', 'OWN_REGISTER', ARRAY[$4]::uuid[], false),
        ($5, 'AUTH-MFA', 'Mfa', 'User', $4, 'MANAGER', 'ACTIVE', 'auth_mfa',
          (SELECT id FROM roles WHERE role_key = 'finance_user'),
          '["dashboard.read","refunds.approve"]', 'STORE', ARRAY[$4]::uuid[], true)
       ON CONFLICT (id) DO UPDATE SET
         capabilities = EXCLUDED.capabilities, scope_type = EXCLUDED.scope_type,
         scope_store_ids = EXCLUDED.scope_store_ids, mfa_enabled = EXCLUDED.mfa_enabled,
         status = 'ACTIVE'`,
      [ADMIN_ID, USER_ID, CASHIER_ID, STORE_A, MFA_ID],
    );

    app = await buildAuthorizationApp();
    await app.ready();
    tokens = {
      admin: app.jwt.sign({ sub: ADMIN_ID, role: "ADMIN" }),
      user: app.jwt.sign({ sub: USER_ID, role: "MANAGER" }),
      cashier: app.jwt.sign({ sub: CASHIER_ID, role: "CASHIER" }),
      mfa: app.jwt.sign({ sub: MFA_ID, role: "MANAGER" }),
    };
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const auth = (name: keyof typeof tokens) => ({
    cookie: `ops_session=${tokens[name]}`,
  });

  test("unauthenticated request is rejected", async () => {
    expect(
      (await app.inject({ method: "GET", url: "/api/user" })).statusCode,
    ).toBe(401);
  });

  test("malformed token is rejected", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/user",
          headers: { cookie: "ops_session=not-a-jwt" },
        })
      ).statusCode,
    ).toBe(401);
  });

  test("expired token is rejected", async () => {
    const expired = app.jwt.sign(
      { sub: USER_ID, role: "MANAGER" },
      { expiresIn: "-1s" },
    );
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/user",
          headers: { cookie: `ops_session=${expired}` },
        })
      ).statusCode,
    ).toBe(401);
  });

  test("modified token signature is rejected", async () => {
    const modified = `${tokens.user.slice(0, -1)}${tokens.user.endsWith("a") ? "b" : "a"}`;
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/user",
          headers: { cookie: `ops_session=${modified}` },
        })
      ).statusCode,
    ).toBe(401);
  });

  test("valid normal user is authenticated", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/user",
      headers: auth("user"),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: USER_ID });
  });

  test("user with required capability is allowed", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/dashboard",
      headers: auth("user"),
    });
    expect({ status: response.statusCode, body: response.json() }).toEqual({
      status: 200,
      body: { ok: true },
    });
  });

  test("normal user is denied an admin capability", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/catalog",
      headers: auth("user"),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().message).toContain("catalog.write");
  });

  test("admin is allowed an admin capability", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/admin/catalog",
          headers: auth("admin"),
        })
      ).statusCode,
    ).toBe(200);
  });

  test("any-capability check accepts one matching capability", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/any",
          headers: auth("user"),
        })
      ).statusCode,
    ).toBe(200);
  });

  test("any-capability check denies a user with no match", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/any",
          headers: auth("cashier"),
        })
      ).statusCode,
    ).toBe(403);
  });

  test("all-capabilities check accepts all matches", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/all",
          headers: auth("user"),
        })
      ).statusCode,
    ).toBe(200);
  });

  test("all-capabilities check denies a partial match", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/all",
          headers: auth("mfa"),
        })
      ).statusCode,
    ).toBe(403);
  });

  test("GLOBAL scope satisfies a global route", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/global",
          headers: auth("admin"),
        })
      ).statusCode,
    ).toBe(200);
  });

  test("STORE scope does not satisfy a global route", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/global",
          headers: auth("user"),
        })
      ).statusCode,
    ).toBe(403);
  });

  test("GLOBAL scope can access any store", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/store/${STORE_B}`,
          headers: auth("admin"),
        })
      ).statusCode,
    ).toBe(200);
  });

  test("STORE scope can access an assigned store", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/store/${STORE_A}`,
          headers: auth("user"),
        })
      ).statusCode,
    ).toBe(200);
  });

  test("STORE scope cannot access another store", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/store/${STORE_B}`,
          headers: auth("user"),
        })
      ).statusCode,
    ).toBe(403);
  });

  test("OWN_REGISTER scope can access its current store", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/store/${STORE_A}`,
          headers: auth("cashier"),
        })
      ).statusCode,
    ).toBe(200);
  });

  test("OWN_REGISTER scope cannot access another store", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/store/${STORE_B}`,
          headers: auth("cashier"),
        })
      ).statusCode,
    ).toBe(403);
  });

  test("MFA-enabled user without verification is denied", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/mfa",
          headers: auth("mfa"),
        })
      ).statusCode,
    ).toBe(403);
  });

  test("user without an MFA requirement proceeds", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/mfa",
          headers: auth("admin"),
        })
      ).statusCode,
    ).toBe(200);
  });

  test("step-up route denies a missing authentication timestamp", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/step-up",
          headers: auth("admin"),
        })
      ).statusCode,
    ).toBe(403);
  });

  test("step-up route accepts a recent authentication timestamp", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/step-up",
          headers: { ...auth("admin"), "x-auth-time": String(Date.now()) },
        })
      ).statusCode,
    ).toBe(200);
  });

  test("step-up route rejects a stale authentication timestamp", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/step-up",
          headers: {
            ...auth("admin"),
            "x-auth-time": String(Date.now() - 360_000),
          },
        })
      ).statusCode,
    ).toBe(403);
  });
});
