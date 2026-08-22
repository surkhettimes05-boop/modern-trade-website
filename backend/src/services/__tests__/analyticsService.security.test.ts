import { query } from "../../database/connection.js";
import { AnalyticsService } from "../analyticsService.js";

jest.mock("../../database/connection.js", () => ({ query: jest.fn() }));

describe("AnalyticsService saved report execution", () => {
  it("ignores persisted SQL and executes only a server-owned report query", async () => {
    const mockedQuery = query as jest.MockedFunction<typeof query>;
    mockedQuery
      .mockResolvedValueOnce({
        rows: [
          {
            report_id: "REPORT-1",
            report_type: "SALES",
            query_config: { query: "DROP TABLE customers" },
          },
        ],
        rowCount: 1,
      } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
      .mockResolvedValueOnce({
        rows: [{ total_orders: 1 }],
        rowCount: 1,
      } as any);

    const result = await new AnalyticsService().executeReport("REPORT-1");

    const executedSql = String(mockedQuery.mock.calls[2][0]);
    expect(executedSql).toContain("FROM web_orders");
    expect(executedSql).not.toContain("DROP TABLE");
    expect(result.data).toEqual([{ total_orders: 1 }]);
  });
});
