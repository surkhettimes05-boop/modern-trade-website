import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import { authenticateStaff } from "../../middleware/authentication.js";
import { recordSecurityEvent } from "../../services/securityEventService.js";
import { requirePrivilegedAdministration } from "../privilegedAdministration.js";

jest.mock("../../middleware/authentication.js", () => ({
  authenticateStaff: jest.fn(),
}));
jest.mock("../../services/securityEventService.js", () => ({
  recordSecurityEvent: jest.fn(),
}));

const mockedAuthenticate = authenticateStaff as jest.MockedFunction<
  typeof authenticateStaff
>;
const mockedRecordSecurityEvent = recordSecurityEvent as jest.MockedFunction<
  typeof recordSecurityEvent
>;

async function buildApp() {
  const app = Fastify();
  app.decorateRequest("cookies", null as any);
  app.addHook("onRequest", async (request) => {
    (request as any).cookies = Object.fromEntries(
      String(request.headers.cookie || "")
        .split(";")
        .map((part) => part.trim().split("="))
        .filter(([name, value]) => Boolean(name && value)),
    );
  });
  app.addHook("onRequest", requirePrivilegedAdministration);
  app.get("/sensitive", async () => ({ ok: true }));
  app.post("/sensitive", async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe("privileged administration guard", () => {
  beforeEach(() => {
    mockedAuthenticate.mockReset();
    mockedRecordSecurityEvent.mockReset();
    mockedRecordSecurityEvent.mockResolvedValue(undefined);
  });

  it("rejects an unauthenticated request", async () => {
    mockedAuthenticate.mockImplementation(
      async (_request: FastifyRequest, reply: FastifyReply) => {
        await reply
          .status(401)
          .send({ error: "Staff authentication required" });
      },
    );
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/sensitive" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("rejects authenticated staff without system administration capability", async () => {
    mockedAuthenticate.mockImplementation(async (request) => {
      (request as any).user = {
        roleKey: "store_manager",
        capabilities: ["dashboard.read"],
      };
    });
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/sensitive" });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("ADMIN_CAPABILITY_REQUIRED");
    await app.close();
  });

  it("allows a privileged read but requires CSRF for a mutation", async () => {
    mockedAuthenticate.mockImplementation(async (request) => {
      (request as any).user = {
        roleKey: "platform_admin",
        capabilities: ["system.manage"],
        mfaEnabled: true,
        mfaVerified: true,
      };
    });
    const app = await buildApp();
    expect(
      (await app.inject({ method: "GET", url: "/sensitive" })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: "POST", url: "/sensitive" })).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/sensitive",
          headers: {
            cookie: "csrf_token=known-token",
            "x-csrf-token": "known-token",
          },
        })
      ).statusCode,
    ).toBe(200);
    await app.close();
  });

  it("rejects privileged staff without verified MFA", async () => {
    mockedAuthenticate.mockImplementation(async (request) => {
      (request as any).user = {
        roleKey: "platform_admin",
        capabilities: ["system.manage"],
        mfaEnabled: true,
        mfaVerified: false,
      };
    });
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/sensitive" });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("MFA_REQUIRED");
    await app.close();
  });
});
