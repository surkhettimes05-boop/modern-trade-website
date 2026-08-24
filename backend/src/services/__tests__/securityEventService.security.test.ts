import { query } from "../../database/connection.js";
import { recordSecurityEvent } from "../securityEventService.js";

jest.mock("../../database/connection.js", () => ({ query: jest.fn() }));

const mockedQuery = query as jest.MockedFunction<typeof query>;

describe("security event recording", () => {
  beforeEach(() => mockedQuery.mockReset());

  it("redacts sensitive details before persistence", async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 1 } as any);
    await recordSecurityEvent(
      {
        id: "request-1",
        ip: "127.0.0.1",
        headers: { "user-agent": "test" },
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          roleKey: "store_manager",
          capabilities: ["staff.read"],
          scopeType: "STORE",
          scopeStoreIds: ["00000000-0000-4000-8000-000000000002"],
        },
      } as any,
      {
        eventType: "PERMISSION_DENIED",
        entityType: "authorization",
        details: { password: "must-not-persist", route: "/staff" },
      },
    );

    const parameters = mockedQuery.mock.calls[0][1] as unknown[];
    expect(parameters[8]).toContain("[REDACTED]");
    expect(parameters[8]).not.toContain("must-not-persist");
  });

  it("does not turn an audit sink outage into an authorization bypass", async () => {
    mockedQuery.mockRejectedValue(new Error("audit sink unavailable"));
    await expect(
      recordSecurityEvent(
        {
          id: "request-2",
          ip: "127.0.0.1",
          headers: {},
        } as any,
        { eventType: "PERMISSION_DENIED", entityType: "authorization" },
      ),
    ).resolves.toBeUndefined();
  });
});
