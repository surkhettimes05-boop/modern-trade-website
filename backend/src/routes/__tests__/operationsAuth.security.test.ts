import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { query } from "../../database/connection.js";
import { operationsAuthRoutes } from "../operationsAuth.js";

jest.mock("../../database/connection.js", () => ({ query: jest.fn() }));

describe("operations MFA security", () => {
  it("counts a missing or invalid MFA code toward the account lock", async () => {
    (query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: "10000000-0000-4000-8000-000000000001",
            username: "admin",
            password_valid: true,
            status: "ACTIVE",
            failed_login_attempts: 0,
            locked_until: null,
            mfa_enabled: true,
            mfa_secret: "unused-with-missing-code",
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const app = Fastify();
    await app.register(jwt, {
      secret: "operations-auth-test-secret-with-sufficient-length",
    });
    await app.register(operationsAuthRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/login",
      payload: { username: "admin", password: "correct-password" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("MFA_REQUIRED");
    expect((query as jest.Mock).mock.calls[1][0]).toContain(
      "failed_login_attempts = failed_login_attempts + 1",
    );
    await app.close();
  });
});
