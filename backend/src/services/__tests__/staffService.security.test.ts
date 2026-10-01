import { query } from "../../database/connection.js";
import { StaffService } from "../staffService.js";

jest.mock("../../database/connection.js", () => ({ query: jest.fn() }));

describe("staff credential security", () => {
  it("revokes active sessions in the same statement as a password change", async () => {
    (query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });

    await new StaffService().updatePassword(
      "10000000-0000-4000-8000-000000000001",
      "a-long-private-password",
    );

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, parameters] = (query as jest.Mock).mock.calls[0];
    expect(sql).toContain("WITH changed_staff AS");
    expect(sql).toContain("public.crypt($1, public.gen_salt('bf', 12))");
    expect(sql).toContain("is_revoked = TRUE");
    expect(parameters).toEqual([
      "a-long-private-password",
      "10000000-0000-4000-8000-000000000001",
    ]);
  });
});
